import csv
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime
from pathlib import Path


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

SUMMARY_FIELDS = [
    "province",
    "municipality",
    "plans_projects_2025_count",
    "plans_projects_2025_budget",
    "plans_projects_2026_count",
    "plans_projects_2026_budget",
    "plans_projects_2027_count",
    "plans_projects_2027_budget",
    "plans_projects_total_count",
    "plans_projects_total_budget",
    "plans_projects_2027_physical_target",
    "plans_rice_2027_budget",
    "plans_corn_2027_budget",
    "plans_hvc_2027_budget",
    "plans_fmr_2027_count",
    "plans_fmr_2027_budget",
    "plans_fmr_2027_length_km",
    "plans_irrigation_2027_count",
    "plans_irrigation_2027_budget",
    "plans_2027_programs",
    "plans_source_files",
]

DETAIL_FIELDS = [
    "source_file",
    "sheet",
    "province",
    "district",
    "municipality",
    "year",
    "program",
    "activity",
    "unit",
    "physical_target",
    "budget",
    "length_km",
    "allocation_method",
    "source_note",
]


def column_index(cell_ref):
    letters = re.match(r"([A-Z]+)", cell_ref or "")
    if not letters:
        return 0
    value = 0
    for char in letters.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


def to_number(value):
    text = clean_text(value)
    if not text or text in {"-", "#REF!", "#DIV/0!"}:
        return 0.0
    text = text.replace(",", "")
    text = re.sub(r"[^\d.\-]", "", text)
    if text in {"", "-", "."}:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def format_number(value):
    return f"{value:.2f}"


def normalize_key(value):
    text = unicodedata.normalize("NFKD", clean_text(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    text = text.replace("CITY OF ILAGAN", "ILAGAN CITY")
    text = text.replace("CITY OF CAUAYAN", "CAUAYAN CITY")
    text = text.replace("CITY OF SANTIAGO", "SANTIAGO CITY")
    text = text.replace("STA.", "SANTA")
    text = text.replace("STA ", "SANTA ")
    text = text.replace("(CAPITAL)", "")
    return re.sub(r"[^A-Z0-9]", "", text)


def read_shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("a:si", NS):
        values.append("".join((text.text or "") for text in item.findall(".//a:t", NS)))
    return values


def read_cell(cell, shared_strings):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join((text.text or "") for text in cell.findall(".//a:t", NS))

    value = cell.find("a:v", NS)
    if value is None:
        return ""

    text = value.text or ""
    if cell_type == "s" and text:
        return shared_strings[int(text)]
    return text


def sheet_paths(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("rel:Relationship", NS)
    }

    sheets = []
    for sheet in workbook.findall("a:sheets/a:sheet", NS):
        name = sheet.attrib.get("name", "")
        rel_id = sheet.attrib.get(f"{{{NS['r']}}}id")
        target = rel_targets.get(rel_id, "")
        if target and not target.startswith("xl/"):
            target = "xl/" + target.lstrip("/")
        sheets.append((name, target))
    return sheets


def read_workbook(path):
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        sheets = []
        for name, sheet_path in sheet_paths(archive):
            if sheet_path not in archive.namelist():
                continue
            root = ET.fromstring(archive.read(sheet_path))
            rows = []
            for row in root.findall("a:sheetData/a:row", NS):
                values = []
                for cell in row.findall("a:c", NS):
                    idx = column_index(cell.attrib.get("r", "A1"))
                    if idx >= len(values):
                        values.extend([""] * (idx - len(values) + 1))
                    values[idx] = clean_text(read_cell(cell, shared_strings))
                rows.append(values)
            sheets.append((name, rows))
        return sheets


def load_municipalities(path):
    municipalities = {}
    by_province = defaultdict(dict)
    with Path(path).open(newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            province = clean_text(row.get("province"))
            municipality = clean_text(row.get("municipality"))
            if not province or not municipality:
                continue
            key = normalize_key(municipality)
            municipalities[key] = {"province": province, "municipality": municipality}
            by_province[normalize_key(province)][key] = municipality

    aliases = {
        "STAANA": "SANTAANA",
        "STAANACAGAYAN": "SANTAANA",
        "STA.TERESITA": "SANTATERESITA",
        "STATERESITA": "SANTATERESITA",
        "LALLO": "LALLO",
        "ILAGAN": "ILAGANCITY",
        "CITYOFILAGAN": "ILAGANCITY",
        "TUGUEGARAO": "TUGUEGARAOCITY",
        "CITYOFTUGUEGARAO": "TUGUEGARAOCITY",
        "CAUAYAN": "CAUAYANCITY",
        "CITYOFCAUAYAN": "CAUAYANCITY",
        "SANTIAGO": "SANTIAGOCITY",
        "CITYOFSANTIAGO": "SANTIAGOCITY",
    }
    return municipalities, by_province, aliases


def match_direct_municipality(value, province_key, by_province, aliases):
    key = normalize_key(value)
    key = aliases.get(key, key)
    if key in by_province.get(province_key, {}):
        return key
    return None


def find_municipalities(text, province_key, by_province, aliases):
    normalized = normalize_key(text)
    if not normalized:
        return []

    found = []
    province_muns = by_province.get(province_key, {})
    for key in province_muns:
        if key and key in normalized:
            found.append(key)

    for alias, canonical in aliases.items():
        if alias in normalized and canonical in province_muns:
            found.append(canonical)

    return sorted(set(found), key=lambda key: len(key), reverse=True)


def workbook_province(filename, rows):
    text = filename.upper()
    if "BATANES" in text:
        return "Batanes"
    if "CAGAYAN" in text:
        return "Cagayan"
    if "ISABELA" in text:
        return "Isabela"
    if "NUEVA" in text:
        return "Nueva Vizcaya"
    if "QUIRINO" in text:
        return "Quirino"
    for row in rows[:12]:
        joined = " ".join(row).upper()
        match = re.search(r"PROVINCE:\s*([A-Z ]+)", joined)
        if match:
            return clean_text(match.group(1)).title()
    return ""


def workbook_district(rows):
    for row in rows[:12]:
        joined = " ".join(row)
        match = re.search(r"DISTRICT:\s*([A-Za-z0-9IVX ]+)", joined, flags=re.I)
        if match:
            return clean_text(match.group(1))
    return ""


def classify_program(sheet_name, rows):
    haystack = " ".join([sheet_name] + [" ".join(row[:4]) for row in rows[:6]]).upper()
    if "RICE" in haystack:
        return "Rice Program"
    if "CORN" in haystack:
        return "Corn Program"
    if "HIGH VALUE" in haystack or "HVCD" in haystack:
        return "High Value Crops"
    if "FARM-TO-MARKET" in haystack or re.search(r"\bFMR\b", haystack):
        return "Farm-to-Market Roads"
    if "PRDP" in haystack or "PHILIPPINE RURAL" in haystack:
        return "PRDP"
    if "4K" in haystack or "KABUHAYAN" in haystack:
        return "4Ks"
    if "SOIL HEALTH" in haystack or "NSHP" in haystack:
        return "National Soil Health"
    if "MCRA" in haystack:
        return "MCRA"
    return clean_text(sheet_name) or "Other Program"


def is_infra_program(program, activity):
    text = f"{program} {activity}".upper()
    return any(term in text for term in ["FMR", "FARM-TO-MARKET", "ROAD", "PRDP"])


def is_irrigation_program(activity):
    text = activity.upper()
    return any(term in text for term in ["IRRIGATION", "PUMP", "SOLAR-POWERED", "CANAL", "DIVERSION DAM"])


def summarize_rows(files, municipal_csv):
    _, by_province, aliases = load_municipalities(municipal_csv)
    details = []
    unmatched = []

    for path in files:
        sheets = read_workbook(path)
        province = ""
        province_key = ""
        for sheet_name, rows in sheets:
            if not province:
                province = workbook_province(path.name, rows)
                province_key = normalize_key(province)
            district = workbook_district(rows)
            program = classify_program(sheet_name, rows)
            current_year = None
            sheet_start = len(details)

            for row in rows:
                cells = row + [""] * (24 - len(row))
                joined = " ".join(cells).upper()
                if "FY 2025" in joined or "CY 2025" in joined:
                    current_year = 2025
                if "FY 2026" in joined:
                    current_year = 2026
                if "FY 2027" in joined:
                    current_year = 2027

                direct_key = match_direct_municipality(cells[0], province_key, by_province, aliases)
                if direct_key and not any(term in joined for term in ["TOTAL", "SUBTOTAL", "GRAND TOTAL"]):
                    municipality = by_province[province_key][direct_key]
                    amount = to_number(cells[4]) or to_number(cells[5]) or max(to_number(cell) for cell in cells[1:8])
                    length = to_number(cells[3])
                    details.append({
                        "source_file": path.name,
                        "sheet": sheet_name,
                        "province": province,
                        "district": district,
                        "municipality": municipality,
                        "year": current_year or 2027,
                        "program": program,
                        "activity": cells[2] or cells[0],
                        "unit": cells[1],
                        "physical_target": "",
                        "budget": format_number(amount),
                        "length_km": format_number(length) if length else "",
                        "allocation_method": "direct municipality row",
                        "source_note": cells[2] or cells[1],
                    })
                    continue

                if len(cells) < 12 or not cells[0] or any(term in joined for term in ["GRAND TOTAL", "PREPARED BY", "CONCURRED BY"]):
                    continue

                remarks = " ".join(cells[12:])
                targets = find_municipalities(remarks, province_key, by_province, aliases)
                if not targets:
                    continue

                activity = cells[0]
                if activity.upper().startswith(("I.", "II.", "III.", "A.", "B.")):
                    continue

                physical_2027 = to_number(cells[10]) or to_number(cells[6]) + to_number(cells[8])
                budget_2027 = to_number(cells[11]) or to_number(cells[7]) + to_number(cells[9])
                if not physical_2027 and not budget_2027:
                    physical_2027 = to_number(cells[6]) or to_number(cells[8])
                    budget_2027 = to_number(cells[7]) or to_number(cells[9])

                divisor = len(targets) or 1
                for key in targets:
                    details.append({
                        "source_file": path.name,
                        "sheet": sheet_name,
                        "province": province,
                        "district": district,
                        "municipality": by_province[province_key][key],
                        "year": 2027,
                        "program": program,
                        "activity": activity,
                        "unit": cells[1],
                        "physical_target": format_number(physical_2027 / divisor) if physical_2027 else "",
                        "budget": format_number(budget_2027 / divisor) if budget_2027 else "0.00",
                        "length_km": "",
                        "allocation_method": "remarks municipality split",
                        "source_note": remarks,
                    })

                for token in re.split(r"[,;\n]| and ", remarks, flags=re.I):
                    token = clean_text(token)
                    if token and not find_municipalities(token, province_key, by_province, aliases):
                        if re.search(r"[A-Za-z]{4,}", token):
                            unmatched.append({
                                "source_file": path.name,
                                "sheet": sheet_name,
                                "province": province,
                                "text": token,
                            })

            append_sheet_total_rows(path.name, sheet_name, rows, province, district, program, details, sheet_start)

    return details, unmatched


def append_sheet_total_rows(source_file, sheet_name, rows, province, district, program, details, sheet_start):
    if program in {"Farm-to-Market Roads", "PRDP"}:
        return

    total_row = None
    for row in rows:
        first = normalize_key(row[0] if row else "")
        if first in {"GRANDTOTAL", "TOTAL"}:
            total_row = row + [""] * (24 - len(row))

    if not total_row:
        return

    existing_years = {
        int(row["year"])
        for row in details[sheet_start:]
        if row.get("source_file") == source_file and row.get("sheet") == sheet_name and row.get("year")
    }
    year_budget_cols = {
        2025: 3,
        2026: 5,
        2027: 11,
    }

    for year, budget_col in year_budget_cols.items():
        if year in existing_years:
            continue
        budget = to_number(total_row[budget_col]) if budget_col < len(total_row) else 0
        if year == 2027 and not budget:
            budget = to_number(total_row[7]) + to_number(total_row[9])
        if not budget:
            continue

        details.append({
            "source_file": source_file,
            "sheet": sheet_name,
            "province": province,
            "district": district,
            "municipality": "",
            "year": year,
            "program": program,
            "activity": f"{program} district/province total",
            "unit": "",
            "physical_target": "",
            "budget": format_number(budget),
            "length_km": "",
            "allocation_method": "district/province sheet total",
            "source_note": "No municipal breakdown extracted for this year; retained as district/province commodity total.",
        })


def aggregate(details):
    summary = defaultdict(lambda: {
        "plans_projects_2025_count": 0,
        "plans_projects_2025_budget": 0.0,
        "plans_projects_2026_count": 0,
        "plans_projects_2026_budget": 0.0,
        "plans_projects_2027_count": 0,
        "plans_projects_2027_budget": 0.0,
        "plans_projects_2027_physical_target": 0.0,
        "plans_rice_2027_budget": 0.0,
        "plans_corn_2027_budget": 0.0,
        "plans_hvc_2027_budget": 0.0,
        "plans_fmr_2027_count": 0,
        "plans_fmr_2027_budget": 0.0,
        "plans_fmr_2027_length_km": 0.0,
        "plans_irrigation_2027_count": 0,
        "plans_irrigation_2027_budget": 0.0,
        "programs": set(),
        "sources": set(),
    })

    for row in details:
        if not row["municipality"]:
            continue
        key = (row["province"], row["municipality"])
        bucket = summary[key]
        year = int(row["year"] or 0)
        budget = to_number(row["budget"])
        physical = to_number(row["physical_target"])
        length = to_number(row["length_km"])
        program = row["program"]
        activity = row["activity"]

        if year in {2025, 2026, 2027}:
            bucket[f"plans_projects_{year}_count"] += 1
            bucket[f"plans_projects_{year}_budget"] += budget
        if year == 2027:
            bucket["plans_projects_2027_physical_target"] += physical
            bucket["programs"].add(program)
            if program == "Rice Program":
                bucket["plans_rice_2027_budget"] += budget
            if program == "Corn Program":
                bucket["plans_corn_2027_budget"] += budget
            if program == "High Value Crops":
                bucket["plans_hvc_2027_budget"] += budget
            if is_infra_program(program, activity):
                bucket["plans_fmr_2027_count"] += 1
                bucket["plans_fmr_2027_budget"] += budget
                bucket["plans_fmr_2027_length_km"] += length
            if is_irrigation_program(activity):
                bucket["plans_irrigation_2027_count"] += 1
                bucket["plans_irrigation_2027_budget"] += budget
        bucket["sources"].add(row["source_file"])

    rows = []
    for (province, municipality), data in sorted(summary.items()):
        total_count = data["plans_projects_2025_count"] + data["plans_projects_2026_count"] + data["plans_projects_2027_count"]
        total_budget = data["plans_projects_2025_budget"] + data["plans_projects_2026_budget"] + data["plans_projects_2027_budget"]
        output = {
            "province": province,
            "municipality": municipality,
            "plans_projects_total_count": total_count,
            "plans_projects_total_budget": format_number(total_budget),
            "plans_2027_programs": " | ".join(sorted(data["programs"])),
            "plans_source_files": " | ".join(sorted(data["sources"])),
        }
        for field in SUMMARY_FIELDS:
            if field in {"province", "municipality", "plans_projects_total_count", "plans_projects_total_budget", "plans_2027_programs", "plans_source_files"}:
                continue
            value = data.get(field, 0)
            output[field] = str(value) if "count" in field else format_number(value)
        rows.append(output)
    return rows


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_metadata(path, source_dir, source_files, summary_count, detail_count):
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    files = []
    latest_mtime = None
    for source in source_files:
        stat = source.stat()
        modified = datetime.fromtimestamp(stat.st_mtime).astimezone()
        latest_mtime = max(latest_mtime, modified) if latest_mtime else modified
        files.append({
            "name": source.name,
            "size_bytes": stat.st_size,
            "local_modified_at": modified.isoformat(timespec="seconds"),
        })

    metadata = {
        "dataset_name": "DA Region 02 Plans and Projects 2025-2027",
        "source": "Google Drive planning workbooks",
        "source_folder_url": "https://drive.google.com/drive/folders/1mOY40xTSz2KGzj4mLOAkhIEptkKnlVr9?usp=sharing",
        "generated_at": generated_at,
        "latest_source_file_modified_at": latest_mtime.isoformat(timespec="seconds") if latest_mtime else generated_at,
        "source_file_count": len(source_files),
        "summary_rows": summary_count,
        "detail_rows": detail_count,
        "source_directory": str(source_dir),
        "source_files": files,
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main():
    source_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/plans_raw")
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/plans_projects_2025_2027.csv")
    detail_output = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("data/plans_projects_2025_2027_details.csv")
    municipal_csv = Path(sys.argv[4]) if len(sys.argv) > 4 else Path("data/municipal_data.csv")
    metadata_output = Path("data/plans_projects_metadata.json")

    files = sorted(source_dir.glob("*.xlsx"))
    if not files:
        print(f"No .xlsx files found in {source_dir}")
        return 1

    details, unmatched = summarize_rows(files, municipal_csv)
    summary = aggregate(details)
    write_csv(output, summary, SUMMARY_FIELDS)
    write_csv(detail_output, details, DETAIL_FIELDS)
    write_metadata(metadata_output, source_dir, files, len(summary), len(details))
    if unmatched:
        write_csv(Path("data/plans_projects_unmatched_terms.csv"), unmatched, ["source_file", "sheet", "province", "text"])

    print(f"Wrote {len(summary)} municipal planning rows to {output}")
    print(f"Wrote {len(details)} extracted planning detail rows to {detail_output}")
    print(f"Wrote planning metadata to {metadata_output}")
    if unmatched:
        print(f"Wrote {len(unmatched)} unmatched terms to data/plans_projects_unmatched_terms.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
