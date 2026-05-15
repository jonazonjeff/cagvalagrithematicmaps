import csv
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

REGION_2_PROVINCES = {"BATANES", "CAGAYAN", "ISABELA", "NUEVA VIZCAYA", "QUIRINO"}

HEADERS = [
    "prism_psa_region_code",
    "prism_region",
    "prism_psa_province_code",
    "province",
    "prism_psa_municipal_code",
    "municipality",
    "prism_rice_area_2026s1",
    "prism_planted_sep_2025",
    "prism_planted_oct_2025",
    "prism_planted_nov_2025",
    "prism_planted_dec_2025",
    "prism_planted_jan_2026",
    "prism_planted_feb_2026",
    "prism_planted_mar_2026",
    "prism_harvested_dec_2025",
    "prism_harvested_jan_2026",
    "prism_harvested_feb_2026",
    "prism_harvested_mar_2026",
    "prism_harvested_apr_2026",
    "prism_harvested_may_2026",
    "prism_harvested_jun_2026",
    "prism_growth_reproductive_ha",
    "prism_growth_ripening_ha",
    "prism_growth_harvested_ha",
    "prism_standing_crop_area",
    "prism_upcoming_harvest_area",
    "prism_harvest_progress_pct",
    "prism_dominant_growth_phase",
    "prism_yield_area_ha",
    "prism_production_mt",
    "prism_yield_mt_ha",
    "prism_flooded_nonrice_ha",
    "prism_flooded_vegetative_ha",
    "prism_flooded_reproductive_ha",
    "prism_flooded_ripening_ha",
    "prism_flooded_harvested_ha",
    "prism_flooded_standing_crop_ha",
    "prism_flooded_rice_total_ha",
    "prism_flooded_reproductive_ripening_ha",
    "prism_flooded_standing_share_pct",
    "prism_flooded_rice_share_pct",
    "prism_expected_production_at_risk_mt",
    "prism_flood_damage_priority_score",
    "prism_flood_damage_priority_class",
    "prism_damage_event",
    "prism_source_date",
]


def column_index(cell_ref):
    letters = re.match(r"([A-Z]+)", cell_ref or "")
    if not letters:
        return 0
    value = 0
    for char in letters.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def number(value):
    text = str(value or "").replace(",", "").strip()
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def formatted(value):
    return f"{value:.2f}"


def normalize_key(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper().replace("\u00a0", " ")
    text = text.replace("├Æ", "N").replace("├æ", "N").replace("Ñ", "N")
    text = text.replace("CITY OF ILAGAN", "ILAGAN CITY")
    text = text.replace("CITY OF CAUAYAN", "CAUAYAN CITY")
    text = text.replace("CITY OF SANTIAGO", "SANTIAGO CITY")
    text = text.replace("(CAPITAL)", "")
    return re.sub(r"[^A-Z0-9]", "", text)


def title_place(value):
    text = str(value or "").strip()
    text = text.replace("\u00a0", " ").replace("├æ", "Ñ").replace("├Æ", "Ñ")
    replacements = {
        "TUGUEGARAO CITY (Capital)": "Tuguegarao City (Capital)",
        "CITY OF ILAGAN (Capital)": "Ilagan City (Capital)",
        "CITY OF ILAGAN": "Ilagan City",
        "CITY OF CAUAYAN": "Cauayan City",
        "CITY OF SANTIAGO": "Santiago City",
        "BASCO (Capital)": "Basco (Capital)",
        "BAYOMBONG (Capital)": "Bayombong (Capital)",
        "CABARROGUIS (Capital)": "Cabarroguis (Capital)",
        "LAL-LO": "Lal-lo",
        "PEÑABLANCA": "Peñablanca",
        "PE├æABLANCA": "Peñablanca",
    }
    if text.upper() in replacements:
        return replacements[text.upper()]
    return text.replace("-", " ").title().replace("Lal Lo", "Lal-lo")


def read_shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("a:si", NS):
        values.append("".join((text.text or "") for text in item.findall(".//a:t", NS)))
    return values


def read_cell(cell, shared_strings):
    value = cell.find("a:v", NS)
    if value is None:
        return ""
    text = value.text or ""
    if cell.attrib.get("t") == "s" and text:
        return shared_strings[int(text)]
    return text


def workbook_sheets(path):
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rel_root.findall("rel:Relationship", NS)}

        sheets = []
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            name = sheet.attrib["name"]
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = "xl/" + rels[rel_id].lstrip("/")
            root = ET.fromstring(archive.read(target))
            rows = []
            for row in root.findall("a:sheetData/a:row", NS):
                values = []
                for cell in row.findall("a:c", NS):
                    idx = column_index(cell.attrib.get("r", "A1"))
                    if idx >= len(values):
                        values.extend([""] * (idx - len(values) + 1))
                    values[idx] = read_cell(cell, shared_strings)
                rows.append(values)
            sheets.append((name, rows))
        return sheets


def find_sheet(path, expected_name):
    for name, rows in workbook_sheets(path):
        if name.lower() == expected_name.lower():
            return rows
    raise ValueError(f"Could not find sheet {expected_name} in {path}")


def row_value(row, index):
    return row[index] if index < len(row) else ""


def row_key(province, municipality):
    return normalize_key(province), normalize_key(municipality)


def is_region2(province, region="", code=""):
    region_text = str(region or "").upper()
    return str(code or "").startswith("PH02") or re.search(r"\bREGION\s*(II|2)\b", region_text) or normalize_key(province) in {normalize_key(p) for p in REGION_2_PROVINCES}


def extract_area_rows(path, source_date):
    rows = []
    for raw in find_sheet(path, "TOTAL_MUN")[4:]:
        region_code = row_value(raw, 0)
        region = row_value(raw, 1)
        province_code = row_value(raw, 2)
        province = row_value(raw, 3)
        municipal_code = row_value(raw, 4)
        municipality = row_value(raw, 5)
        if not is_region2(province, region, region_code) or not municipal_code:
            continue

        total = number(row_value(raw, 6))
        reproductive = number(row_value(raw, 21))
        ripening = number(row_value(raw, 22))
        harvested = number(row_value(raw, 23))
        standing = reproductive + ripening
        upcoming = number(row_value(raw, 19)) + number(row_value(raw, 20))
        progress = harvested / total * 100 if total else 0
        phases = {
            "Reproductive": reproductive,
            "Ripening": ripening,
            "Harvested": harvested,
        }

        values = [
            region_code,
            region,
            province_code,
            title_place(province),
            municipal_code,
            title_place(municipality),
        ]
        values += [formatted(number(row_value(raw, index))) for index in range(6, 24)]
        values += [
            formatted(standing),
            formatted(upcoming),
            formatted(progress),
            max(phases, key=phases.get),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "Tropical Cyclones Tino, Uwan, Verbena, Wilma, Ada, Basyang and Southwest Monsoon",
            source_date,
        ]
        rows.append(dict(zip(HEADERS, values)))
    return rows


def extract_yield_rows(path):
    rows = {}
    for raw in find_sheet(path, "Municipal")[2:]:
        region = row_value(raw, 0)
        province_code = row_value(raw, 1)
        province = title_place(row_value(raw, 2))
        municipality = title_place(row_value(raw, 4))
        if not is_region2(province, region, province_code) or not municipality:
            continue
        rows[row_key(province, municipality)] = {
            "prism_yield_area_ha": formatted(number(row_value(raw, 5))),
            "prism_production_mt": formatted(number(row_value(raw, 6))),
            "prism_yield_mt_ha": formatted(number(row_value(raw, 7))),
        }
    return rows


def extract_damage_rows(path):
    rows = {}
    for raw in find_sheet(path, "Table2. Flooded_Rice_Areas_Muni")[4:]:
        region = row_value(raw, 0)
        province = title_place(row_value(raw, 1))
        municipality = title_place(row_value(raw, 2))
        if not is_region2(province, region) or not municipality or normalize_key(municipality) == "TOTAL":
            continue
        vegetative = number(row_value(raw, 4))
        reproductive = number(row_value(raw, 5))
        ripening = number(row_value(raw, 6))
        harvested = number(row_value(raw, 7))
        standing = number(row_value(raw, 8))
        total_rice = vegetative + reproductive + ripening + harvested
        rows[row_key(province, municipality)] = {
            "prism_flooded_nonrice_ha": formatted(number(row_value(raw, 3))),
            "prism_flooded_vegetative_ha": formatted(vegetative),
            "prism_flooded_reproductive_ha": formatted(reproductive),
            "prism_flooded_ripening_ha": formatted(ripening),
            "prism_flooded_harvested_ha": formatted(harvested),
            "prism_flooded_standing_crop_ha": formatted(standing),
            "prism_flooded_rice_total_ha": formatted(total_rice),
        }
    return rows


def merge_optional(rows, optional):
    matched = 0
    for row in rows:
        data = optional.get(row_key(row["province"], row["municipality"]))
        if not data:
            continue
        row.update(data)
        matched += 1
    return matched


def add_damage_shares(rows):
    for row in rows:
        standing = number(row.get("prism_standing_crop_area"))
        total_area = number(row.get("prism_rice_area_2026s1"))
        yield_mt_ha = number(row.get("prism_yield_mt_ha"))
        flooded_reproductive = number(row.get("prism_flooded_reproductive_ha"))
        flooded_ripening = number(row.get("prism_flooded_ripening_ha"))
        flooded_standing = number(row.get("prism_flooded_standing_crop_ha"))
        flooded_total = number(row.get("prism_flooded_rice_total_ha"))
        flooded_repro_ripening = flooded_reproductive + flooded_ripening
        standing_share = flooded_standing / standing * 100 if standing else 0
        rice_share = flooded_total / total_area * 100 if total_area else 0
        production_at_risk = flooded_total * yield_mt_ha
        priority_score = min(
            100,
            min(1, flooded_standing / 300) * 40 +
            min(1, flooded_total / 600) * 30 +
            min(1, standing_share / 10) * 20 +
            min(1, production_at_risk / 2500) * 10,
        )
        row["prism_flooded_reproductive_ripening_ha"] = formatted(flooded_repro_ripening)
        row["prism_flooded_standing_share_pct"] = formatted(standing_share) if standing else ""
        row["prism_flooded_rice_share_pct"] = formatted(rice_share) if total_area else ""
        row["prism_expected_production_at_risk_mt"] = formatted(production_at_risk)
        row["prism_flood_damage_priority_score"] = formatted(priority_score)
        row["prism_flood_damage_priority_class"] = classify_damage(priority_score, flooded_total)


def classify_damage(score, flooded_total):
    if flooded_total <= 0:
        return "No Flooded Rice Detected"
    if score >= 70:
        return "Very High"
    if score >= 50:
        return "High"
    if score >= 30:
        return "Moderate"
    return "Low"


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)


def write_metadata(path, source_folder_url, source_files, area_count, yield_matches, damage_matches):
    metadata = {
        "dataset_name": "PhilRice PRiSM 2026 Semester 1 End Season",
        "source": "PhilRice PRiSM workbooks from Google Drive",
        "source_folder_url": source_folder_url,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_date": "2026-05-12",
        "area_rows": area_count,
        "yield_rows_matched": yield_matches,
        "damage_rows_matched": damage_matches,
        "source_files": [],
        "analysis_added": [
            "Municipal PRiSM rice yield and production",
            "Municipal flooded rice area by growth phase",
            "Flooded standing crop share of current PRiSM standing crop",
            "Flooded rice share of PRiSM detected rice area",
        ],
    }
    latest = None
    for source in source_files:
        stat = source.stat()
        modified = datetime.fromtimestamp(stat.st_mtime).astimezone()
        latest = max(latest, modified) if latest else modified
        metadata["source_files"].append({
            "name": source.name,
            "size_bytes": stat.st_size,
            "local_modified_at": modified.isoformat(timespec="seconds"),
        })
    if latest:
        metadata["latest_source_file_modified_at"] = latest.isoformat(timespec="seconds")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def convert(area_path, output, source_date, yield_path=None, damage_path=None, metadata_path=None, source_folder_url=""):
    rows = extract_area_rows(area_path, source_date)
    yield_matches = merge_optional(rows, extract_yield_rows(yield_path)) if yield_path else 0
    damage_matches = merge_optional(rows, extract_damage_rows(damage_path)) if damage_path else 0
    add_damage_shares(rows)
    write_csv(output, rows)
    if metadata_path:
        source_files = [path for path in [area_path, yield_path, damage_path] if path]
        write_metadata(metadata_path, source_folder_url, source_files, len(rows), yield_matches, damage_matches)
    return len(rows), yield_matches, damage_matches


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/convert_prism_xlsx.py <area.xlsx> [output.csv] [source-date] [yield.xlsx] [damage.xlsx] [metadata.json] [source-folder-url]")
        return 2

    area_path = Path(sys.argv[1])
    output = Path(sys.argv[2]) if len(sys.argv) >= 3 else Path("data/prism_rice_2026s1.csv")
    source_date = sys.argv[3] if len(sys.argv) >= 4 else "2026-05-12"
    yield_path = Path(sys.argv[4]) if len(sys.argv) >= 5 and sys.argv[4] else None
    damage_path = Path(sys.argv[5]) if len(sys.argv) >= 6 and sys.argv[5] else None
    metadata_path = Path(sys.argv[6]) if len(sys.argv) >= 7 and sys.argv[6] else Path("data/prism_metadata.json")
    source_folder_url = sys.argv[7] if len(sys.argv) >= 8 else ""
    count, yield_matches, damage_matches = convert(area_path, output, source_date, yield_path, damage_path, metadata_path, source_folder_url)
    print(f"Wrote {count} Region II PRiSM rows to {output}")
    if yield_path:
        print(f"Merged yield/production data for {yield_matches} rows")
    if damage_path:
        print(f"Merged flood damage data for {damage_matches} rows")
    if metadata_path:
        print(f"Wrote PRiSM metadata to {metadata_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
