import csv
import json
import re
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape


DETAIL_CSV = Path("data/plans_projects_2025_2027_details.csv")
METADATA_JSON = Path("data/plans_projects_metadata.json")
DEFAULT_OUTPUT = Path("exports/AgriPlan_District_Banner_Program_Summary.xlsx")

YEARS = (2025, 2026, 2027)

EXCLUDED_PROGRAMS = {
    "",
    "GRAND TOTAL",
    "2024-2026",
    "2025-2027",
}

PROGRAM_LABELS = {
    "4KS": "4Ks",
    "COLD STORAGE": "Cold Storage",
    "CORN PROGRAM": "Corn Program",
    "FARM-TO-MARKET ROADS": "Farm-to-Market Roads",
    "HALAL": "HALAL",
    "HIGH VALUE CROPS": "High Value Crops",
    "LIVESTOCK": "Livestock",
    "MCRA": "MCRA (Mainstreaming Climate Resilient Agriculture)",
    "NATIONAL SOIL HEALTH": "NSHP (National Soil Health Program)",
    "NUPAP": "NUPAP",
    "OAP": "OAP",
    "PRDP": "PRDP (Philippine Rural Development Project)",
    "RICE PROGRAM": "Rice Program",
    "SAAD": "SAAD",
}

ROMAN_TO_INT = {
    "I": "1",
    "II": "2",
    "III": "3",
    "IV": "4",
    "V": "5",
    "VI": "6",
}


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


def parse_number(value):
    text = clean_text(value).replace(",", "")
    text = re.sub(r"[^\d.\-]", "", text)
    if text in {"", "-", "."}:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def parse_year(value):
    try:
        year = int(float(clean_text(value)))
    except ValueError:
        return None
    return year if year in YEARS else None


def display_program(value):
    key = clean_text(value).upper()
    if key in EXCLUDED_PROGRAMS:
        return ""
    return PROGRAM_LABELS.get(key, clean_text(value) or "Other Program")


def normalize_district(province, district):
    province = clean_text(province) or "Unspecified Province"
    raw = clean_text(district)
    district_text = raw.upper().replace(".", " ")
    district_text = re.sub(r"\b(CONGRESSIONAL|LEGISLATIVE)\b", " ", district_text)
    district_text = re.sub(r"\bDISTRICT\b", " ", district_text)
    district_text = re.sub(r"\s+", " ", district_text).strip()

    if not district_text:
        code = "UNSPECIFIED"
        label = "Unspecified District"
    elif "LONE" in district_text:
        code = "LONE"
        label = "Lone District"
    else:
        token = re.search(r"\b([0-9]+|I{1,3}|IV|V|VI)\b", district_text)
        code = ROMAN_TO_INT.get(token.group(1), token.group(1)) if token else district_text.title()
        label = f"District {code}" if str(code).isdigit() else str(code).title()

    return f"{province}|{code}", f"{province} - {label}"


def load_metadata(path):
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_detail_rows(path):
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def aggregate(rows):
    district_program_year = defaultdict(lambda: {
        "record_count": 0,
        "budget": 0.0,
        "length_km": 0.0,
        "physical_target": 0.0,
        "municipalities": set(),
        "source_files": set(),
    })

    program_year = defaultdict(lambda: {
        "record_count": 0,
        "budget": 0.0,
        "length_km": 0.0,
        "physical_target": 0.0,
        "districts": set(),
        "municipalities": set(),
    })

    detail_rows = []
    for row in rows:
        year = parse_year(row.get("year"))
        program = display_program(row.get("program"))
        province = clean_text(row.get("province"))
        if not year or not program or not province:
            continue

        district_key, district_label = normalize_district(province, row.get("district"))
        municipality = clean_text(row.get("municipality"))
        budget = parse_number(row.get("budget"))
        length = parse_number(row.get("length_km"))
        target = parse_number(row.get("physical_target"))
        source_file = clean_text(row.get("source_file"))

        key = (province, district_key, district_label, program, year)
        bucket = district_program_year[key]
        bucket["record_count"] += 1
        bucket["budget"] += budget
        bucket["length_km"] += length
        bucket["physical_target"] += target
        if municipality:
            bucket["municipalities"].add(municipality)
        if source_file:
            bucket["source_files"].add(source_file)

        pkey = (program, year)
        pbucket = program_year[pkey]
        pbucket["record_count"] += 1
        pbucket["budget"] += budget
        pbucket["length_km"] += length
        pbucket["physical_target"] += target
        pbucket["districts"].add(district_label)
        if municipality:
            pbucket["municipalities"].add(municipality)

        detail_rows.append({
            "Province": province,
            "District": district_label,
            "Municipality": municipality,
            "Year": year,
            "Banner Program": program,
            "Activity": clean_text(row.get("activity")),
            "Unit": clean_text(row.get("unit")),
            "Physical Target": target,
            "Budget PHP 000": budget,
            "Length KM": length,
            "Allocation Method": clean_text(row.get("allocation_method")),
            "Source File": source_file,
        })

    summary_by_district = {}
    for (province, district_key, district_label, program, year), values in district_program_year.items():
        base_key = (province, district_key, district_label, program)
        row = summary_by_district.setdefault(base_key, {
            "Province": province,
            "District": district_label,
            "Banner Program": program,
            "Municipalities Covered": set(),
            "Source Workbooks": set(),
            "Total Records": 0,
            "Total Budget PHP 000": 0.0,
            "Total Length KM": 0.0,
            "Total Physical Target": 0.0,
        })
        row[f"{year} Records"] = values["record_count"]
        row[f"{year} Budget PHP 000"] = values["budget"]
        row[f"{year} Length KM"] = values["length_km"]
        row[f"{year} Physical Target"] = values["physical_target"]
        row["Municipalities Covered"].update(values["municipalities"])
        row["Source Workbooks"].update(values["source_files"])
        row["Total Records"] += values["record_count"]
        row["Total Budget PHP 000"] += values["budget"]
        row["Total Length KM"] += values["length_km"]
        row["Total Physical Target"] += values["physical_target"]

    district_summary_rows = []
    for row in summary_by_district.values():
        for year in YEARS:
            row.setdefault(f"{year} Records", 0)
            row.setdefault(f"{year} Budget PHP 000", 0.0)
            row.setdefault(f"{year} Length KM", 0.0)
            row.setdefault(f"{year} Physical Target", 0.0)
        row["Municipality Count"] = len(row["Municipalities Covered"])
        row["Municipalities Covered"] = ", ".join(sorted(row["Municipalities Covered"]))
        row["Source Workbooks"] = ", ".join(sorted(row["Source Workbooks"]))
        district_summary_rows.append(row)

    yearly_rows = []
    for (province, district_key, district_label, program, year), values in district_program_year.items():
        yearly_rows.append({
            "Year": year,
            "Province": province,
            "District": district_label,
            "Banner Program": program,
            "Records": values["record_count"],
            "Budget PHP 000": values["budget"],
            "Length KM": values["length_km"],
            "Physical Target": values["physical_target"],
            "Municipality Count": len(values["municipalities"]),
            "Municipalities Covered": ", ".join(sorted(values["municipalities"])),
            "Source Workbooks": ", ".join(sorted(values["source_files"])),
        })

    program_total_rows = []
    for (program, year), values in program_year.items():
        program_total_rows.append({
            "Banner Program": program,
            "Year": year,
            "Records": values["record_count"],
            "Budget PHP 000": values["budget"],
            "Length KM": values["length_km"],
            "Physical Target": values["physical_target"],
            "District Count": len(values["districts"]),
            "Municipality Count": len(values["municipalities"]),
        })

    district_summary_rows.sort(key=lambda item: (item["Province"], item["District"], item["Banner Program"]))
    yearly_rows.sort(key=lambda item: (item["Year"], item["Province"], item["District"], item["Banner Program"]))
    program_total_rows.sort(key=lambda item: (item["Banner Program"], item["Year"]))
    detail_rows.sort(key=lambda item: (item["Year"], item["Province"], item["District"], item["Banner Program"], item["Municipality"], item["Activity"]))

    return district_summary_rows, yearly_rows, program_total_rows, detail_rows


def column_letter(index):
    index += 1
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def cell_xml(row_index, col_index, value, style=None):
    ref = f"{column_letter(col_index)}{row_index}"
    style_attr = f' s="{style}"' if style is not None else ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if float(value).is_integer():
            text = str(int(value))
        else:
            text = f"{value:.4f}".rstrip("0").rstrip(".")
        return f'<c r="{ref}"{style_attr}><v>{text}</v></c>'
    text = escape(clean_text(value), {'"': "&quot;"})
    return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t>{text}</t></is></c>'


def sheet_xml(name, headers, rows):
    max_col = len(headers) - 1
    max_row = len(rows) + 1
    dimension = f"A1:{column_letter(max_col)}{max_row}"
    xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        f'<dimension ref="{dimension}"/>',
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
        '<sheetFormatPr defaultRowHeight="15"/>',
        '<cols>',
    ]
    for index, header in enumerate(headers):
        width = min(max(len(header) + 4, 12), 48)
        if header in {"Activity", "Municipalities Covered", "Source Workbooks", "Source Value"}:
            width = 42
        xml.append(f'<col min="{index + 1}" max="{index + 1}" width="{width}" customWidth="1"/>')
    xml.extend(['</cols>', '<sheetData>'])
    xml.append(f'<row r="1">{"".join(cell_xml(1, index, header, 1) for index, header in enumerate(headers))}</row>')
    for row_index, row in enumerate(rows, start=2):
        cells = []
        for col_index, header in enumerate(headers):
            value = row.get(header, "")
            style = None
            if isinstance(value, int):
                style = 2
            elif isinstance(value, float):
                style = 3
            cells.append(cell_xml(row_index, col_index, value, style))
        xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    xml.append('</sheetData>')
    xml.append(f'<autoFilter ref="{dimension}"/>')
    xml.append('</worksheet>')
    return "\n".join(xml)


def styles_xml():
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0B5D32"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""


def write_xlsx(output_path, sheets, metadata):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet_names = list(sheets.keys())

    workbook_sheets = "\n".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, start=1)
    )
    workbook_rels = "\n".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, len(sheet_names) + 1)
    )
    workbook_rels += f'\n<Relationship Id="rId{len(sheet_names) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'

    content_overrides = "\n".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, len(sheet_names) + 1)
    )

    created = metadata.get("generated_at") or datetime.now(timezone.utc).isoformat(timespec="seconds")
    core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>AgriPlan District Banner Program Summary</dc:title>
  <dc:creator>Codex export script</dc:creator>
  <cp:lastModifiedBy>Codex export script</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{escape(created)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{escape(datetime.now(timezone.utc).isoformat(timespec="seconds"))}</dcterms:modified>
</cp:coreProperties>"""

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  {content_overrides}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>""")
        archive.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>""")
        archive.writestr("xl/workbook.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>{workbook_sheets}</sheets>
</workbook>""")
        archive.writestr("xl/_rels/workbook.xml.rels", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {workbook_rels}
</Relationships>""")
        archive.writestr("xl/styles.xml", styles_xml())
        archive.writestr("docProps/core.xml", core_xml)
        archive.writestr("docProps/app.xml", f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>{len(sheet_names)}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="{len(sheet_names)}" baseType="lpstr">{''.join(f'<vt:lpstr>{escape(name)}</vt:lpstr>' for name in sheet_names)}</vt:vector></TitlesOfParts>
</Properties>""")
        for index, (name, (headers, rows)) in enumerate(sheets.items(), start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", sheet_xml(name, headers, rows))


def metadata_rows(metadata, detail_count, district_summary_count):
    generated = datetime.now().astimezone().isoformat(timespec="seconds")
    rows = [
        {"Source Field": "Export generated at", "Source Value": generated},
        {"Source Field": "Dataset name", "Source Value": metadata.get("dataset_name", "")},
        {"Source Field": "Source", "Source Value": metadata.get("source", "")},
        {"Source Field": "Source folder URL", "Source Value": metadata.get("source_folder_url", "")},
        {"Source Field": "Fetched data generated at", "Source Value": metadata.get("generated_at", "")},
        {"Source Field": "Latest source file modified at", "Source Value": metadata.get("latest_source_file_modified_at", "")},
        {"Source Field": "Source workbook count", "Source Value": metadata.get("source_file_count", "")},
        {"Source Field": "Detail rows used", "Source Value": detail_count},
        {"Source Field": "District summary rows", "Source Value": district_summary_count},
    ]
    for source in metadata.get("source_files", []):
        rows.append({
            "Source Field": f"Workbook: {source.get('name', '')}",
            "Source Value": f"{source.get('size_bytes', '')} bytes; modified {source.get('local_modified_at', '')}",
        })
    return rows


def build_workbook(detail_csv=DETAIL_CSV, metadata_json=METADATA_JSON, output=DEFAULT_OUTPUT):
    metadata = load_metadata(metadata_json)
    rows = load_detail_rows(detail_csv)
    district_summary, yearly, program_totals, detail_rows = aggregate(rows)

    district_headers = [
        "Province",
        "District",
        "Banner Program",
        "Municipality Count",
        "Municipalities Covered",
        "2025 Records",
        "2025 Budget PHP 000",
        "2025 Length KM",
        "2025 Physical Target",
        "2026 Records",
        "2026 Budget PHP 000",
        "2026 Length KM",
        "2026 Physical Target",
        "2027 Records",
        "2027 Budget PHP 000",
        "2027 Length KM",
        "2027 Physical Target",
        "Total Records",
        "Total Budget PHP 000",
        "Total Length KM",
        "Total Physical Target",
        "Source Workbooks",
    ]
    yearly_headers = [
        "Year",
        "Province",
        "District",
        "Banner Program",
        "Records",
        "Budget PHP 000",
        "Length KM",
        "Physical Target",
        "Municipality Count",
        "Municipalities Covered",
        "Source Workbooks",
    ]
    program_headers = [
        "Banner Program",
        "Year",
        "Records",
        "Budget PHP 000",
        "Length KM",
        "Physical Target",
        "District Count",
        "Municipality Count",
    ]
    detail_headers = [
        "Province",
        "District",
        "Municipality",
        "Year",
        "Banner Program",
        "Activity",
        "Unit",
        "Physical Target",
        "Budget PHP 000",
        "Length KM",
        "Allocation Method",
        "Source File",
    ]
    meta_headers = ["Source Field", "Source Value"]

    sheets = {
        "District Summary": (district_headers, district_summary),
        "2025 by District": (yearly_headers, [row for row in yearly if row["Year"] == 2025]),
        "2026 by District": (yearly_headers, [row for row in yearly if row["Year"] == 2026]),
        "2027 by District": (yearly_headers, [row for row in yearly if row["Year"] == 2027]),
        "Program Totals": (program_headers, program_totals),
        "Activity Records": (detail_headers, detail_rows),
        "Source Metadata": (meta_headers, metadata_rows(metadata, len(detail_rows), len(district_summary))),
    }
    write_xlsx(output, sheets, metadata)
    return output, len(district_summary), len(detail_rows)


def main():
    detail_csv = Path(sys.argv[1]) if len(sys.argv) > 1 else DETAIL_CSV
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT
    metadata_json = Path(sys.argv[3]) if len(sys.argv) > 3 else METADATA_JSON
    output, summary_count, detail_count = build_workbook(detail_csv, metadata_json, output)
    print(f"Wrote {output}")
    print(f"District summary rows: {summary_count}")
    print(f"Activity detail rows: {detail_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
