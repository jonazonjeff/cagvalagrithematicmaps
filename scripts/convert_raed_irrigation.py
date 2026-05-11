#!/usr/bin/env python
"""Convert RAED irrigation GIS exports into app-ready CSV files.

The app consumes two files:
  - data/irrigation_facilities.csv for point markers / layer toggles

This script recursively scans data/raed_irrigation_raw for shapefiles,
GeoJSON files, KML files, and CSV exports. It infers irrigation type from source
attributes or folder/file names and projects coordinates to WGS84 when a
.prj file is available.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from pathlib import Path
from xml.etree import ElementTree as ET

import shapefile  # pyshp
from pyproj import CRS, Geod, Transformer


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW_DIR = ROOT / "data" / "raed_irrigation_raw"
DEFAULT_FACILITIES = ROOT / "data" / "irrigation_facilities.csv"

FACILITY_HEADERS = [
    "facility_id",
    "facility_name",
    "facility_type",
    "province",
    "district",
    "municipality",
    "barangay",
    "latitude",
    "longitude",
    "status",
    "capacity",
    "service_area_ha",
    "project_amount",
    "year_granted",
    "year_finished",
    "year_constructed",
    "source_layer",
    "source_folder",
    "remarks",
]

TYPE_PATTERNS = [
    ("PISOS", re.compile(r"\bPISOS\b|pump irrigation|pump and engine", re.I)),
    ("SPIS", re.compile(r"\bSPIS\b|SPISSPFS|solar powered irrigation|solar", re.I)),
    ("SWIP", re.compile(r"\bSWIP\b|small water impounding", re.I)),
    ("DD", re.compile(r"\bDD\b|diversion dam", re.I)),
]

PROVINCES = ["Batanes", "Cagayan", "Isabela", "Nueva Vizcaya", "Quirino"]

NAME_FIELDS = [
    "facility_name",
    "project_name",
    "name",
    "proj_name",
    "project",
    "system",
    "title",
]
PROVINCE_FIELDS = ["province", "prov_name", "prov", "adm2_en"]
MUNICIPALITY_FIELDS = ["municipality", "mun_name", "city_mun", "mun", "adm3_en", "lgu"]
BARANGAY_FIELDS = ["barangay", "brgy_name", "brgy", "adm4_en"]
STATUS_FIELDS = ["status", "stat", "condition"]
YEAR_FIELDS = ["year_constructed", "year", "yr", "fund_year", "year_funded"]
YEAR_GRANTED_FIELDS = ["year_granted", "grant_year", "year_funded", "fund_year"]
YEAR_FINISHED_FIELDS = ["year_finished", "completion_year", "year_completed", "finish_year"]
AMOUNT_FIELDS = ["project_amount", "amount", "cost", "project_cost", "abc", "allocation"]
SERVICE_AREA_FIELDS = [
    "service_area_ha",
    "area_ha",
    "sa_ha",
    "servicearea",
    "serv_area",
    "influence_area_ha",
    "ia_ha",
    "area",
]
LAT_FIELDS = ["latitude", "lat", "y"]
LON_FIELDS = ["longitude", "long", "lon", "lng", "x"]

GEOD = Geod(ellps="WGS84")
MUNICIPAL_CONTEXT = None


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"none", "null", "nan"}:
        return ""
    return text


def compact_text(value, limit=280) -> str:
    text = re.sub(r"\s+", " ", clean(value)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def normalized_attrs(attrs: dict) -> dict:
    return {clean(k).lower(): clean(v) for k, v in attrs.items()}


def first_attr(attrs: dict, names: list[str]) -> str:
    for name in names:
        if clean(attrs.get(name)):
            return clean(attrs.get(name))
    return ""


def numeric(value):
    text = clean(value)
    if not text:
        return None
    text = text.replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def infer_type(*pieces: str) -> str:
    haystack = " ".join(clean(p) for p in pieces if clean(p))
    for type_key, pattern in TYPE_PATTERNS:
        if pattern.search(haystack):
            return type_key
    return ""


def infer_province(path: Path, attrs: dict) -> str:
    province = first_attr(attrs, PROVINCE_FIELDS)
    if province:
        return title_province(province)
    path_text = " ".join(path.parts)
    for province_name in PROVINCES:
        if re.search(re.escape(province_name), path_text, re.I):
            return province_name
    return ""


def title_province(value: str) -> str:
    norm = clean(value).lower().replace("_", " ")
    for province in PROVINCES:
        if norm == province.lower():
            return province
    if norm in {"nueva vizcaya", "nv"}:
        return "Nueva Vizcaya"
    return clean(value).title()


def title_place(value: str) -> str:
    text = clean(value)
    if not text:
        return ""
    return " ".join(part.capitalize() if not part.isupper() else part for part in text.lower().split())


def infer_project_name(path: Path, attrs: dict, type_key: str) -> str:
    name = first_attr(attrs, NAME_FIELDS)
    if name:
        return name
    parent = path.parent.name
    if parent and parent.lower() not in {"raed_irrigation_raw", "data"}:
        return parent
    return f"{type_key or 'Irrigation'} Facility"


def infer_transformer(shp_path: Path):
    prj_path = shp_path.with_suffix(".prj")
    if not prj_path.exists():
        return None
    try:
        source = CRS.from_wkt(prj_path.read_text(encoding="utf-8", errors="ignore"))
        target = CRS.from_epsg(4326)
        if source == target:
            return None
        return Transformer.from_crs(source, target, always_xy=True)
    except Exception:
        return None


def to_wgs84_point(x: float, y: float, transformer=None):
    if transformer:
        x, y = transformer.transform(x, y)
    return x, y


def centroid_from_points(points, transformer=None):
    if not points:
        return "", ""
    lon_sum = 0.0
    lat_sum = 0.0
    count = 0
    for x, y in points:
        lon, lat = to_wgs84_point(x, y, transformer)
        if math.isfinite(lon) and math.isfinite(lat):
            lon_sum += lon
            lat_sum += lat
            count += 1
    if not count:
        return "", ""
    return f"{lat_sum / count:.7f}", f"{lon_sum / count:.7f}"


def area_ha_from_points(points, transformer=None):
    if len(points) < 4:
        return None
    lonlats = [to_wgs84_point(x, y, transformer) for x, y in points]
    if lonlats[0] != lonlats[-1]:
        lonlats.append(lonlats[0])
    lons = [p[0] for p in lonlats]
    lats = [p[1] for p in lonlats]
    try:
        area_m2, _ = GEOD.polygon_area_perimeter(lons, lats)
    except Exception:
        return None
    return abs(area_m2) / 10000


def read_shapefile(shp_path: Path):
    rows = []
    transformer = infer_transformer(shp_path)
    reader = shapefile.Reader(str(shp_path))
    fields = [field[0] for field in reader.fields[1:]]
    source_layer = shp_path.stem

    for shape_rec in reader.iterShapeRecords():
        attrs = normalized_attrs(dict(zip(fields, shape_rec.record)))
        type_key = infer_type(attrs.get("facility_type"), attrs.get("type"), source_layer, str(shp_path))
        if not type_key:
            continue

        lat = first_attr(attrs, LAT_FIELDS)
        lon = first_attr(attrs, LON_FIELDS)
        if not lat or not lon:
            lat, lon = centroid_from_points(shape_rec.shape.points, transformer)

        service_area = first_attr(attrs, SERVICE_AREA_FIELDS)
        if not service_area and shape_rec.shape.shapeType in {
            shapefile.POLYGON,
            shapefile.POLYGONZ,
            shapefile.POLYGONM,
        }:
            area_ha = area_ha_from_points(shape_rec.shape.points, transformer)
            if area_ha:
                service_area = f"{area_ha:.4f}"

        rows.append(build_facility_row(shp_path, attrs, type_key, lat, lon, source_layer, service_area))
    return rows


def read_geojson(path: Path):
    rows = []
    data = json.loads(path.read_text(encoding="utf-8"))
    for index, feature in enumerate(data.get("features", []), start=1):
        attrs = normalized_attrs(feature.get("properties") or {})
        type_key = infer_type(attrs.get("facility_type"), attrs.get("type"), path.stem, str(path))
        if not type_key:
            continue
        lat = first_attr(attrs, LAT_FIELDS)
        lon = first_attr(attrs, LON_FIELDS)
        if not lat or not lon:
            lat, lon = centroid_from_geojson(feature.get("geometry"))
        row = build_facility_row(path, attrs, type_key, lat, lon, path.stem, first_attr(attrs, SERVICE_AREA_FIELDS))
        if not row["facility_id"]:
            row["facility_id"] = f"IRR-GJ-{index:04d}"
        rows.append(row)
    return rows


def centroid_from_geojson(geometry):
    if not geometry:
        return "", ""
    coords = []

    def collect(value):
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(n, (int, float)) for n in value[:2]):
            coords.append((float(value[0]), float(value[1])))
        elif isinstance(value, list):
            for item in value:
                collect(item)

    collect(geometry.get("coordinates"))
    if not coords:
        return "", ""
    lon = sum(p[0] for p in coords) / len(coords)
    lat = sum(p[1] for p in coords) / len(coords)
    return f"{lat:.7f}", f"{lon:.7f}"


def read_csv_export(path: Path):
    rows = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for index, record in enumerate(reader, start=1):
            attrs = normalized_attrs(record)
            type_key = infer_type(attrs.get("facility_type"), attrs.get("type"), path.stem, str(path))
            if not type_key:
                continue
            row = build_facility_row(
                path,
                attrs,
                type_key,
                first_attr(attrs, LAT_FIELDS),
                first_attr(attrs, LON_FIELDS),
                path.stem,
                first_attr(attrs, SERVICE_AREA_FIELDS),
            )
            if not row["facility_id"]:
                row["facility_id"] = f"IRR-CSV-{index:04d}"
            rows.append(row)
    return rows


def read_kml(path: Path):
    rows = []
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return rows

    namespace = ""
    if root.tag.startswith("{"):
        namespace = root.tag.split("}", 1)[0].strip("{")
    ns = {"kml": namespace} if namespace else {}
    placemark_query = ".//kml:Placemark" if namespace else ".//Placemark"
    name_query = "kml:name" if namespace else "name"
    desc_query = "kml:description" if namespace else "description"
    coords_query = ".//kml:coordinates" if namespace else ".//coordinates"

    type_key = infer_type(path.stem)
    if not type_key:
        return rows

    for index, placemark in enumerate(root.findall(placemark_query, ns), start=1):
        name = clean(placemark.findtext(name_query, default="", namespaces=ns))
        description = clean(placemark.findtext(desc_query, default="", namespaces=ns))
        coord_text = clean(placemark.findtext(coords_query, default="", namespaces=ns))
        lon, lat = first_kml_coordinate(coord_text)
        if not lat or not lon:
            continue
        parsed = parse_kml_description(description)
        attrs = normalized_attrs({
            "facility_id": f"IRR-KML-{index:04d}",
            "name": name,
            "province": parsed.get("province", ""),
            "municipality": parsed.get("municipality", ""),
            "barangay": parsed.get("barangay", ""),
            "status": parsed.get("status", ""),
            "project_amount": parsed.get("project_amount", ""),
            "year_granted": parsed.get("year_granted", ""),
            "year_finished": parsed.get("year_finished", ""),
            "remarks": public_remarks(parsed),
        })
        rows.append(build_facility_row(path, attrs, type_key, lat, lon, path.stem, parsed.get("service_area_ha", "")))
    return rows


def first_kml_coordinate(coord_text: str):
    for piece in coord_text.replace("\n", " ").split():
        parts = piece.split(",")
        if len(parts) < 2:
            continue
        lon = numeric(parts[0])
        lat = numeric(parts[1])
        if lon is not None and lat is not None:
            return f"{lon:.7f}", f"{lat:.7f}"
    return "", ""


def parse_kml_description(description: str):
    parsed = {}
    text = compact_text(description, 2000)
    location_match = re.search(r"LOCATION:\s*([^:]+?)(?:\s+SERVICE AREA|\s+ENGINE BRAND|\s+SUPPLIER|\s+MOA NO\.|$)", text, re.I)
    if location_match:
        parts = [p.strip() for p in location_match.group(1).split(",") if p.strip()]
        if len(parts) >= 3:
            parsed["barangay"] = title_place(parts[-3])
            parsed["municipality"] = title_place(parts[-2])
            parsed["province"] = title_province(parts[-1])
        elif len(parts) == 2:
            parsed["municipality"] = title_place(parts[0])
            parsed["province"] = title_province(parts[1])
        elif len(parts) == 1:
            parsed["barangay"] = title_place(parts[0])

    service_area_match = re.search(r"SERVICE AREA\s*\(HA\.\):\s*([0-9,.]+)", text, re.I)
    if service_area_match:
        parsed["service_area_ha"] = service_area_match.group(1).replace(",", "")

    amount_match = re.search(r"(?:PROJECT\s+COST|AMOUNT|COST|ALLOCATION)\s*(?:PHP|P|₱)?\s*:?\s*([0-9,]+(?:\.\d+)?)", text, re.I)
    if amount_match:
        parsed["project_amount"] = amount_match.group(1).replace(",", "")

    moa_match = re.search(r"MOA\s+NO\.?:\s*([A-Za-z0-9\-./]+)", text, re.I)
    if moa_match:
        moa_no = moa_match.group(1).strip()
        parsed["moa_no"] = moa_no
        year_match = re.match(r"(\d{2})[-/]", moa_no)
        if year_match:
            parsed["year_granted"] = str(2000 + int(year_match.group(1)))

    year_granted_match = re.search(r"(?:YEAR\s+GRANTED|YEAR\s+FUNDED|YEAR\s+APPROVED)\s*:?\s*(\d{4})", text, re.I)
    if year_granted_match:
        parsed["year_granted"] = year_granted_match.group(1)

    year_finished_match = re.search(r"(?:YEAR\s+FINISHED|YEAR\s+COMPLETED|COMPLETION\s+YEAR|COMPLETED)\s*:?\s*(\d{4})", text, re.I)
    if year_finished_match:
        parsed["year_finished"] = year_finished_match.group(1)

    status_match = re.search(r"(OPERATIONAL|NON[-\s]?OPERATIONAL|NOT\s+OPERATIONAL|UNDER\s+CONSTRUCTION|ONGOING|COMPLETED)", text, re.I)
    if status_match:
        parsed["status"] = normalize_status(status_match.group(1))

    engine_match = re.search(r"ENGINE BRAND AND MODEL:\s*([^:]+?)(?:\s+SUPPLIER|\s+MOA NO\.|$)", text, re.I)
    if engine_match:
        parsed["engine"] = compact_text(engine_match.group(1), 90)

    supplier_match = re.search(r"SUPPLIER:\s*([^:]+?)(?:\s+MOA NO\.|$)", text, re.I)
    if supplier_match:
        parsed["supplier"] = compact_text(supplier_match.group(1), 90)

    return parsed


def normalize_status(value: str) -> str:
    text = clean(value).lower().replace("-", " ")
    if "non" in text or "not" in text:
        return "Not Operational"
    if "under construction" in text or "ongoing" in text:
        return "Ongoing"
    if "completed" in text:
        return "Completed"
    if "operational" in text:
        return "Operational"
    return clean(value)


def public_remarks(parsed: dict) -> str:
    pieces = []
    if parsed.get("moa_no"):
        pieces.append(f"MOA No.: {parsed['moa_no']}")
    if parsed.get("engine"):
        pieces.append(f"Engine: {parsed['engine']}")
    if parsed.get("supplier"):
        pieces.append(f"Supplier: {parsed['supplier']}")
    return "; ".join(pieces)


def build_facility_row(path: Path, attrs: dict, type_key: str, lat: str, lon: str, source_layer: str, service_area: str):
    return {
        "facility_id": first_attr(attrs, ["facility_id", "id", "fid"]),
        "facility_name": infer_project_name(path, attrs, type_key),
        "facility_type": type_key,
        "province": infer_province(path, attrs),
        "district": first_attr(attrs, ["district", "dist"]),
        "municipality": first_attr(attrs, MUNICIPALITY_FIELDS),
        "barangay": first_attr(attrs, BARANGAY_FIELDS),
        "latitude": clean(lat),
        "longitude": clean(lon),
        "status": first_attr(attrs, STATUS_FIELDS),
        "capacity": first_attr(attrs, ["capacity", "cap"]),
        "service_area_ha": clean(service_area),
        "project_amount": first_attr(attrs, AMOUNT_FIELDS),
        "year_granted": first_attr(attrs, YEAR_GRANTED_FIELDS),
        "year_finished": first_attr(attrs, YEAR_FINISHED_FIELDS),
        "year_constructed": first_attr(attrs, YEAR_FIELDS),
        "source_layer": clean(source_layer),
        "source_folder": path.parent.name,
        "remarks": first_attr(attrs, ["remarks", "notes", "description"]),
    }


def assign_ids(rows):
    seen = set()
    for index, row in enumerate(rows, start=1):
        if not row.get("facility_id"):
            row["facility_id"] = f"IRR{index:05d}"
        base_id = row["facility_id"]
        suffix = 2
        while row["facility_id"] in seen:
            row["facility_id"] = f"{base_id}-{suffix}"
            suffix += 1
        seen.add(row["facility_id"])


def enrich_with_municipal_context(rows):
    context = load_municipal_context()
    if not context:
        return rows

    for row in rows:
        lat = numeric(row.get("latitude"))
        lon = numeric(row.get("longitude"))
        if lat is None or lon is None:
            continue
        match = find_municipality_for_point(lon, lat, context)
        if not match:
            continue
        row["province"] = match.get("province") or row.get("province", "")
        row["district"] = match.get("district") or row.get("district", "")
        row["municipality"] = match.get("municipality") or row.get("municipality", "")
    for row in rows:
        if not clean(row.get("status")):
            row["status"] = "Not specified in source"
    return rows


def load_municipal_context():
    global MUNICIPAL_CONTEXT
    if MUNICIPAL_CONTEXT is not None:
        return MUNICIPAL_CONTEXT

    geojson_path = ROOT / "data" / "municipalities_simplified.geojson"
    if not geojson_path.exists():
        geojson_path = ROOT / "data" / "municipalities.geojson"
    if not geojson_path.exists():
        MUNICIPAL_CONTEXT = []
        return MUNICIPAL_CONTEXT

    district_lookup = load_district_lookup()
    geojson = json.loads(geojson_path.read_text(encoding="utf-8"))
    context = []
    for feature in geojson.get("features", []):
        props = feature.get("properties") or {}
        province = clean(props.get("province") or props.get("ADM2_EN") or props.get("Province"))
        municipality = clean(props.get("municipality") or props.get("ADM3_EN") or props.get("Municipality") or props.get("NAME"))
        district = district_lookup.get(join_key(province, municipality), clean(props.get("district")))
        rings = polygon_rings(feature.get("geometry") or {})
        if not rings:
            continue
        bbox = rings_bbox(rings)
        context.append({
            "province": title_province(province),
            "district": district,
            "municipality": municipality,
            "rings": rings,
            "bbox": bbox,
        })
    MUNICIPAL_CONTEXT = context
    return context


def load_district_lookup():
    path = ROOT / "data" / "municipal_data.csv"
    lookup = {}
    if not path.exists():
        return lookup
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            province = clean(row.get("province"))
            municipality = clean(row.get("municipality"))
            district = clean(row.get("district"))
            if province and municipality and district:
                lookup[join_key(province, municipality)] = district
    return lookup


def join_key(province: str, municipality: str) -> str:
    return f"{normalize_join(province)}::{normalize_join(municipality)}"


def normalize_join(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean(value).lower())


def polygon_rings(geometry: dict):
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if geom_type == "Polygon":
        return coords
    if geom_type == "MultiPolygon":
        return [ring for polygon in coords for ring in polygon]
    return []


def rings_bbox(rings):
    xs = [pt[0] for ring in rings for pt in ring if len(pt) >= 2]
    ys = [pt[1] for ring in rings for pt in ring if len(pt) >= 2]
    return (min(xs), min(ys), max(xs), max(ys)) if xs and ys else None


def find_municipality_for_point(lon, lat, context):
    for item in context:
        bbox = item["bbox"]
        if bbox and not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]):
            continue
        if any(point_in_ring(lon, lat, ring) for ring in item["rings"]):
            return item
    return None


def point_in_ring(lon, lat, ring):
    inside = False
    if not ring:
        return False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi)
        if intersects:
            inside = not inside
        j = i
    return inside


def write_csv(path: Path, headers: list[str], rows: list[dict]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def collect_rows(raw_dir: Path):
    rows = []
    for shp_path in sorted(raw_dir.rglob("*.shp")):
        rows.extend(read_shapefile(shp_path))
    for geojson_path in sorted(list(raw_dir.rglob("*.geojson")) + list(raw_dir.rglob("*.json"))):
        rows.extend(read_geojson(geojson_path))
    for kml_path in sorted(raw_dir.rglob("*.kml")):
        rows.extend(read_kml(kml_path))
    for csv_path in sorted(raw_dir.rglob("*.csv")):
        rows.extend(read_csv_export(csv_path))
    enrich_with_municipal_context(rows)
    assign_ids(rows)
    return rows


def main():
    parser = argparse.ArgumentParser(description="Convert RAED irrigation GIS exports into app CSVs.")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--facilities", type=Path, default=DEFAULT_FACILITIES)
    args = parser.parse_args()

    if not args.raw_dir.exists():
        raise SystemExit(f"Raw folder does not exist: {args.raw_dir}")

    rows = collect_rows(args.raw_dir)
    write_csv(args.facilities, FACILITY_HEADERS, rows)

    print(f"Wrote {len(rows)} irrigation facility rows to {args.facilities}")


if __name__ == "__main__":
    main()
