import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


SHEET_PATH = "xl/worksheets/sheet4.xml"
NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

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
    "prism_source_date",
]


def column_index(cell_ref):
    letters = re.match(r"([A-Z]+)", cell_ref).group(1)
    value = 0
    for char in letters:
        value = value * 26 + ord(char) - 64
    return value - 1


def number(value):
    try:
        return float(value or 0)
    except ValueError:
        return 0.0


def formatted(value):
    return f"{value:.2f}"


def title_place(value):
    value = (value or "").strip()
    replacements = {
        "TUGUEGARAO CITY (Capital)": "Tuguegarao City (Capital)",
        "CITY OF ILAGAN (Capital)": "Ilagan City (Capital)",
        "BASCO (Capital)": "Basco (Capital)",
        "BAYOMBONG (Capital)": "Bayombong (Capital)",
        "CABARROGUIS (Capital)": "Cabarroguis (Capital)",
        "LAL-LO": "Lal-lo",
    }
    if value in replacements:
        return replacements[value]
    return value.replace("-", " ").title()


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


def extract_rows(source):
    with zipfile.ZipFile(source) as archive:
        shared_strings = read_shared_strings(archive)
        root = ET.fromstring(archive.read(SHEET_PATH))
        rows = []
        for row in root.findall("a:sheetData/a:row", NS):
            values = [""] * 24
            for cell in row.findall("a:c", NS):
                idx = column_index(cell.attrib["r"])
                if idx >= len(values):
                    values.extend([""] * (idx - len(values) + 1))
                values[idx] = read_cell(cell, shared_strings)
            rows.append(values)
        return rows


def convert(source, output, source_date):
    rows = []
    for raw in extract_rows(source)[4:]:
        if raw[0] != "PH0200000000":
            continue

        total = number(raw[6])
        reproductive = number(raw[21])
        ripening = number(raw[22])
        harvested = number(raw[23])
        standing = reproductive + ripening
        upcoming = number(raw[19]) + number(raw[20])
        progress = harvested / total * 100 if total else 0
        phases = {
            "Reproductive": reproductive,
            "Ripening": ripening,
            "Harvested": harvested,
        }

        values = [raw[0], raw[1], raw[2], title_place(raw[3]), raw[4], title_place(raw[5])]
        values += [formatted(number(value)) for value in raw[6:24]]
        values += [
            formatted(standing),
            formatted(upcoming),
            formatted(progress),
            max(phases, key=phases.get),
            source_date,
        ]
        rows.append(dict(zip(HEADERS, values)))

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main():
    if len(sys.argv) < 2:
      print("Usage: python scripts/convert_prism_xlsx.py <input.xlsx> [output.csv] [source-date]")
      return 2

    source = Path(sys.argv[1])
    output = Path(sys.argv[2]) if len(sys.argv) >= 3 else Path("data/prism_rice_2026s1.csv")
    source_date = sys.argv[3] if len(sys.argv) >= 4 else "2026-04-28"
    count = convert(source, output, source_date)
    print(f"Wrote {count} Region II PRiSM rows to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
