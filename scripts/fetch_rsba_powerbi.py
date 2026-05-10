import argparse
import csv
import json
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


REPORT_URL = "https://app.powerbi.com/view?r=eyJrIjoiNDZkZmQxYzEtYTZjNC00MWVjLWEwYTgtMTk5MjFjZmUxYTA3IiwidCI6IjY4OTgwNjFkLTFhNmItNGUzOS1hZGZjLWRjOGFmZTA3MjIwMSIsImMiOjEwfQ%3D%3D"
RESOURCE_KEY = "46dfd1c1-a6c4-41ec-a0a8-19921cfe1a07"
TENANT_ID = "6898061d-1a6b-4e39-adfc-dc8afe072201"
FALLBACK_CLUSTER_URI = "https://wabi-south-east-asia-c-primary-redirect.analysis.windows.net/"

QUERY_NAMES = [
    "rsba_municipal_summary_base",
    "rsba_municipality_crop",
    "rsba_municipality_gender",
    "rsba_municipality_generation",
    "rsba_municipality_sector",
    "rsba_municipality_social",
]

SUMMARY_FIELDS = [
    "province",
    "municipality",
    "district",
    "rsba_registry_count",
    "rsba_crop_area_ha",
    "rsba_avg_age",
    "rsba_latitude",
    "rsba_longitude",
    "rsba_rice_count",
    "rsba_rice_area_ha",
    "rsba_corn_count",
    "rsba_corn_area_ha",
    "rsba_hvc_count",
    "rsba_hvc_area_ha",
    "rsba_top_crop",
    "rsba_top_crop_count",
    "rsba_male_count",
    "rsba_female_count",
    "rsba_female_pct",
    "rsba_youth_count",
    "rsba_youth_pct",
    "rsba_millennial_count",
    "rsba_senior_count",
    "rsba_farmer_count",
    "rsba_farmworker_count",
    "rsba_fisherfolk_count",
    "rsba_ip_count",
    "rsba_pwd_count",
    "rsba_4ps_count",
    "rsba_fca_count",
    "rsba_fca_pct",
    "rsba_agriyouth_count",
    "rsba_arb_count",
    "rsba_organic_count",
    "rsba_with_imc_count",
    "rsba_imc_pct",
    "rsba_rice_share_pct",
    "rsba_corn_share_pct",
    "rsba_fca_gap_pct",
    "rsba_imc_gap_pct",
]

CROP_DETAIL_FIELDS = [
    "province",
    "municipality",
    "cropname",
    "rsba_crop_record_count",
    "rsba_crop_area_ha",
]


def clean_text(value):
    text = "" if value is None else str(value)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return "" if text.lower() == "null" else text


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


def as_float(value):
    text = clean_text(value).replace(",", "")
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def as_int(value):
    return int(round(as_float(value)))


def fmt_number(value, digits=2):
    number = as_float(value)
    rounded = round(number, digits)
    if abs(rounded - int(rounded)) < 10 ** -digits:
        return str(int(rounded))
    return f"{rounded:.{digits}f}".rstrip("0").rstrip(".")


def pct(part, whole, digits=1):
    whole = as_float(whole)
    if whole <= 0:
        return "0"
    return fmt_number(as_float(part) * 100 / whole, digits)


def yesish(value):
    text = clean_text(value).upper()
    return text in {"YES", "Y", "TRUE", "1", "1.0"}


def make_request(url, method="GET", body=None, resource_key=RESOURCE_KEY, timeout=90):
    headers = {
        "Accept": "application/json",
        "ActivityId": str(uuid.uuid4()),
        "RequestId": str(uuid.uuid4()),
        "X-PowerBI-ResourceKey": resource_key,
        "User-Agent": "Mozilla/5.0 AgriSight-RSBSA-Fetcher/1.0",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8-sig")
        return json.loads(raw)


def fetch_text(url, timeout=90):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 AgriSight-RSBSA-Fetcher/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def cluster_to_api_uri(cluster_uri):
    match = re.match(r"^(https?://)([^/]+)", cluster_uri)
    if not match:
        raise ValueError(f"Invalid Power BI cluster URI: {cluster_uri}")
    protocol, hostname = match.groups()
    parts = hostname.split(".")
    parts[0] = parts[0].replace("-redirect", "").replace("global-", "") + "-api"
    return protocol + ".".join(parts)


def discover_cluster_uri():
    try:
        html = fetch_text(REPORT_URL)
        match = re.search(r"var\s+resolvedClusterUri\s*=\s*'([^']+)'", html)
        if match:
            return match.group(1)
        match = re.search(r'"FixedClusterUri"\s*:\s*"([^"]+)"', html)
        if match:
            return match.group(1)
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"Warning: could not fetch report shell for cluster discovery: {exc}", file=sys.stderr)
    return FALLBACK_CLUSTER_URI


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def read_json(path):
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def payload_select_names(payload):
    command = payload["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]
    return [item.get("NativeReferenceName") or item.get("Name") for item in command["Query"]["Select"]]


def find_data_member(node):
    if isinstance(node, list):
        if node and isinstance(node[0], dict) and "S" in node[0]:
            return node
        for item in node:
            found = find_data_member(item)
            if found is not None:
                return found
    elif isinstance(node, dict):
        for value in node.values():
            found = find_data_member(value)
            if found is not None:
                return found
    return None


def find_value_dicts(node):
    if isinstance(node, dict):
        if "ValueDicts" in node:
            return node["ValueDicts"]
        for value in node.values():
            found = find_value_dicts(value)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = find_value_dicts(item)
            if found is not None:
                return found
    return None


def decode_powerbi_result(result, column_names):
    data = result["results"][0]["result"]["data"]
    rows = find_data_member(data["dsr"])
    value_dicts = find_value_dicts(data["dsr"]) or {}
    if not rows:
        return []

    schema = rows[0]["S"]
    previous = [None] * len(schema)
    decoded = []

    for raw_row in rows:
        values = raw_row.get("C", [])
        value_index = 0
        repeat_mask = int(raw_row.get("R", 0) or 0)
        null_mask = int(raw_row.get("\u00d8", raw_row.get("Ø", 0)) or 0)
        current = []

        for index, spec in enumerate(schema):
            if repeat_mask & (1 << index):
                value = previous[index]
            elif null_mask & (1 << index):
                value = None
            else:
                value = values[value_index] if value_index < len(values) else None
                value_index += 1

            dict_name = spec.get("DN")
            if dict_name and value is not None:
                dictionary = value_dicts.get(dict_name, [])
                try:
                    value = dictionary[int(value)]
                except (ValueError, TypeError, IndexError):
                    pass

            current.append(value)

        previous = current
        decoded.append(
            {
                (column_names[i] if i < len(column_names) else schema[i].get("N", f"col_{i}")): clean_text(value)
                for i, value in enumerate(current)
            }
        )

    return decoded


def municipality_key(row):
    return (normalize_key(row.get("province")), normalize_key(row.get("municipality")))


def valid_location(row):
    return bool(normalize_key(row.get("province")) and normalize_key(row.get("municipality")))


def load_decoded_query(root, name):
    payload = read_json(root / "query_payloads" / f"{name}.json")
    result = read_json(root / "query_results_raw" / f"{name}.json")
    return decode_powerbi_result(result, payload_select_names(payload))


def fetch_live_outputs(root, api_uri, sleep_seconds=0.25):
    raw_dir = root / "query_results_raw"
    for name in QUERY_NAMES:
        payload_path = root / "query_payloads" / f"{name}.json"
        payload = read_json(payload_path)
        url = f"{api_uri}/public/reports/querydata?synchronous=true"
        print(f"Fetching {name} ...")
        result = make_request(url, method="POST", body=payload)
        write_json(raw_dir / f"{name}.json", result)
        if sleep_seconds:
            time.sleep(sleep_seconds)


def fetch_metadata(root, api_uri):
    try:
        models = make_request(f"{api_uri}/public/reports/{RESOURCE_KEY}/modelsAndExploration?preferReadOnlySession=true")
        write_json(root / "modelsAndExploration.json", models)
    except Exception as exc:
        print(f"Warning: modelsAndExploration refresh failed: {exc}", file=sys.stderr)

    try:
        schema = make_request(f"{api_uri}/public/reports/{RESOURCE_KEY}/conceptualschema")
        write_json(root / "conceptualschema.json", schema)
    except Exception as exc:
        print(f"Warning: conceptualschema refresh failed: {exc}", file=sys.stderr)


def build_outputs(root):
    base_rows = [row for row in load_decoded_query(root, "rsba_municipal_summary_base") if valid_location(row)]
    crop_rows = [row for row in load_decoded_query(root, "rsba_municipality_crop") if valid_location(row)]
    gender_rows = [row for row in load_decoded_query(root, "rsba_municipality_gender") if valid_location(row)]
    generation_rows = [row for row in load_decoded_query(root, "rsba_municipality_generation") if valid_location(row)]
    sector_rows = [row for row in load_decoded_query(root, "rsba_municipality_sector") if valid_location(row)]
    social_rows = [row for row in load_decoded_query(root, "rsba_municipality_social") if valid_location(row)]

    summary = {}
    display_order = []

    for row in base_rows:
        key = municipality_key(row)
        display_order.append(key)
        summary[key] = defaultdict(float)
        summary[key].update(
            {
                "province": clean_text(row.get("province")),
                "municipality": clean_text(row.get("municipality")),
                "district": clean_text(row.get("district")),
                "rsba_registry_count": as_int(row.get("rsba_record_count")),
                "rsba_crop_area_ha": as_float(row.get("rsba_crop_area_ha")),
                "rsba_avg_age": as_float(row.get("rsba_avg_age")),
                "rsba_latitude": clean_text(row.get("latitude")),
                "rsba_longitude": clean_text(row.get("longitude")),
            }
        )

    crop_detail = []
    top_crop = {}
    for row in crop_rows:
        key = municipality_key(row)
        crop = clean_text(row.get("cropname"))
        count = as_int(row.get("rsba_crop_record_count"))
        area = as_float(row.get("rsba_crop_area_ha"))
        if key not in summary or not crop:
            continue

        crop_detail.append(
            {
                "province": summary[key]["province"],
                "municipality": summary[key]["municipality"],
                "cropname": crop,
                "rsba_crop_record_count": str(count),
                "rsba_crop_area_ha": fmt_number(area),
            }
        )

        crop_lower = crop.lower()
        if crop_lower == "rice/palay":
            summary[key]["rsba_rice_count"] += count
            summary[key]["rsba_rice_area_ha"] += area
        elif crop_lower == "corn":
            summary[key]["rsba_corn_count"] += count
            summary[key]["rsba_corn_area_ha"] += area
        else:
            summary[key]["rsba_hvc_count"] += count
            summary[key]["rsba_hvc_area_ha"] += area

        if count > top_crop.get(key, ("", -1))[1]:
            top_crop[key] = (crop, count)

    for row in gender_rows:
        key = municipality_key(row)
        if key not in summary:
            continue
        gender = clean_text(row.get("gender")).upper()
        count = as_int(row.get("rsba_gender_record_count"))
        if gender == "MALE":
            summary[key]["rsba_male_count"] += count
        elif gender == "FEMALE":
            summary[key]["rsba_female_count"] += count

    for row in generation_rows:
        key = municipality_key(row)
        if key not in summary:
            continue
        generation = clean_text(row.get("generation")).upper()
        count = as_int(row.get("rsba_generation_record_count"))
        if generation in {"GENERATION Z", "GENERATION ALPHA"}:
            summary[key]["rsba_youth_count"] += count
        elif generation == "MILLENIALS":
            summary[key]["rsba_millennial_count"] += count
        elif generation in {"BABY BOOMERS", "THE SILENT GENERATION"}:
            summary[key]["rsba_senior_count"] += count

    for row in sector_rows:
        key = municipality_key(row)
        if key not in summary:
            continue
        count = as_int(row.get("rsba_sector_record_count"))
        if yesish(row.get("farmer")):
            summary[key]["rsba_farmer_count"] += count
        if yesish(row.get("farmworker")):
            summary[key]["rsba_farmworker_count"] += count
        if yesish(row.get("fisherfolk")):
            summary[key]["rsba_fisherfolk_count"] += count

    social_map = {
        "ip": "rsba_ip_count",
        "pwd": "rsba_pwd_count",
        "four_ps": "rsba_4ps_count",
        "fca": "rsba_fca_count",
        "agriyouth": "rsba_agriyouth_count",
        "arb": "rsba_arb_count",
        "organic": "rsba_organic_count",
        "with_imc": "rsba_with_imc_count",
    }
    for row in social_rows:
        key = municipality_key(row)
        if key not in summary:
            continue
        count = as_int(row.get("rsba_social_record_count"))
        for source, target in social_map.items():
            if yesish(row.get(source)):
                summary[key][target] += count

    output_rows = []
    for key in display_order:
        row = summary[key]
        total = row["rsba_registry_count"]
        rice = row["rsba_rice_count"]
        corn = row["rsba_corn_count"]
        fca = row["rsba_fca_count"]
        with_imc = row["rsba_with_imc_count"]
        crop_name, crop_count = top_crop.get(key, ("", 0))

        final = {field: "" for field in SUMMARY_FIELDS}
        final.update(
            {
                "province": row["province"],
                "municipality": row["municipality"],
                "district": row["district"],
                "rsba_registry_count": str(as_int(total)),
                "rsba_crop_area_ha": fmt_number(row["rsba_crop_area_ha"]),
                "rsba_avg_age": fmt_number(row["rsba_avg_age"], 1),
                "rsba_latitude": row["rsba_latitude"],
                "rsba_longitude": row["rsba_longitude"],
                "rsba_rice_count": str(as_int(rice)),
                "rsba_rice_area_ha": fmt_number(row["rsba_rice_area_ha"]),
                "rsba_corn_count": str(as_int(corn)),
                "rsba_corn_area_ha": fmt_number(row["rsba_corn_area_ha"]),
                "rsba_hvc_count": str(as_int(row["rsba_hvc_count"])),
                "rsba_hvc_area_ha": fmt_number(row["rsba_hvc_area_ha"]),
                "rsba_top_crop": crop_name,
                "rsba_top_crop_count": str(as_int(crop_count)),
                "rsba_male_count": str(as_int(row["rsba_male_count"])),
                "rsba_female_count": str(as_int(row["rsba_female_count"])),
                "rsba_female_pct": pct(row["rsba_female_count"], total),
                "rsba_youth_count": str(as_int(row["rsba_youth_count"])),
                "rsba_youth_pct": pct(row["rsba_youth_count"], total),
                "rsba_millennial_count": str(as_int(row["rsba_millennial_count"])),
                "rsba_senior_count": str(as_int(row["rsba_senior_count"])),
                "rsba_farmer_count": str(as_int(row["rsba_farmer_count"])),
                "rsba_farmworker_count": str(as_int(row["rsba_farmworker_count"])),
                "rsba_fisherfolk_count": str(as_int(row["rsba_fisherfolk_count"])),
                "rsba_ip_count": str(as_int(row["rsba_ip_count"])),
                "rsba_pwd_count": str(as_int(row["rsba_pwd_count"])),
                "rsba_4ps_count": str(as_int(row["rsba_4ps_count"])),
                "rsba_fca_count": str(as_int(fca)),
                "rsba_fca_pct": pct(fca, total),
                "rsba_agriyouth_count": str(as_int(row["rsba_agriyouth_count"])),
                "rsba_arb_count": str(as_int(row["rsba_arb_count"])),
                "rsba_organic_count": str(as_int(row["rsba_organic_count"])),
                "rsba_with_imc_count": str(as_int(with_imc)),
                "rsba_imc_pct": pct(with_imc, total),
                "rsba_rice_share_pct": pct(rice, total),
                "rsba_corn_share_pct": pct(corn, total),
                "rsba_fca_gap_pct": pct(total - fca, total),
                "rsba_imc_gap_pct": pct(total - with_imc, total),
            }
        )
        output_rows.append(final)

    return output_rows, crop_detail


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def backup_file(path):
    if not path.exists():
        return
    backup_dir = path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    shutil.copy2(path, backup_dir / f"{path.stem}.{stamp}{path.suffix}")


def write_readme(root, summary_count, crop_count, models_path):
    last_refresh = ""
    if models_path.exists():
        try:
            models = read_json(models_path)
            last_refresh = models.get("models", [{}])[0].get("LastRefreshTime", "")
        except Exception:
            last_refresh = ""

    lines = [
        "# Power BI RSBSA Extraction",
        "",
        f"Source resource key: {RESOURCE_KEY}",
        "Report/model: RSBSA Cagayan Valley",
        f"LastRefreshTime: {last_refresh or 'unavailable'}",
        f"FetchedAtUtc: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        "",
        "Stored aggregate-only outputs. No person-level registry rows were written.",
        "",
        f"Extracted {summary_count} municipal summaries and {crop_count} municipality-crop rows.",
        "Excluded blank-location aggregates from app-ready outputs.",
        "",
        "Refresh command:",
        "",
        "```powershell",
        "python scripts\\fetch_rsba_powerbi.py",
        "```",
    ]
    (root / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_metadata(repo, summary_count, crop_count, models_path):
    last_refresh = ""
    next_refresh = ""
    model_name = "RSBSA Cagayan Valley"
    if models_path.exists():
        try:
            model = read_json(models_path).get("models", [{}])[0]
            last_refresh = model.get("LastRefreshTime", "")
            next_refresh = model.get("NextRefreshTime", "")
            model_name = model.get("displayName", model_name)
        except Exception:
            pass

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Power BI public report",
        "resource_key": RESOURCE_KEY,
        "tenant_id": TENANT_ID,
        "model_name": model_name,
        "source_last_refresh_time": last_refresh,
        "source_next_refresh_time": next_refresh,
        "municipal_summary_rows": summary_count,
        "municipality_crop_rows": crop_count,
        "outputs": [
            "data/rsba_municipal_summary.csv",
            "data/rsba_crop_municipal_detail.csv",
        ],
        "privacy_note": "Aggregate-only outputs; no person-level registry rows written.",
    }
    write_json(repo / "data" / "rsba_refresh_metadata.json", metadata)


def main():
    parser = argparse.ArgumentParser(description="Refresh aggregate RSBSA CSVs from the public Power BI report.")
    parser.add_argument("--skip-fetch", action="store_true", help="Rebuild CSVs from existing raw query JSON only.")
    parser.add_argument("--no-backup", action="store_true", help="Do not copy current app CSVs to data/backups before overwrite.")
    parser.add_argument("--root", default=".", help="Repository root. Defaults to current directory.")
    args = parser.parse_args()

    repo = Path(args.root).resolve()
    powerbi_root = repo / "data" / "powerbi_rsba"
    if not powerbi_root.exists():
        raise SystemExit(f"Missing {powerbi_root}")

    if not args.skip_fetch:
        cluster_uri = discover_cluster_uri()
        api_uri = cluster_to_api_uri(cluster_uri)
        print(f"Using Power BI API cluster: {api_uri}")
        fetch_metadata(powerbi_root, api_uri)
        fetch_live_outputs(powerbi_root, api_uri)

    summary_rows, crop_rows = build_outputs(powerbi_root)
    if not args.no_backup:
        backup_file(repo / "data" / "rsba_municipal_summary.csv")
        backup_file(repo / "data" / "rsba_crop_municipal_detail.csv")

    write_csv(powerbi_root / "cleaned_csv" / "rsba_municipal_summary.csv", summary_rows, SUMMARY_FIELDS)
    write_csv(powerbi_root / "cleaned_csv" / "rsba_crop_municipal_detail.csv", crop_rows, CROP_DETAIL_FIELDS)
    write_csv(repo / "data" / "rsba_municipal_summary.csv", summary_rows, SUMMARY_FIELDS)
    write_csv(repo / "data" / "rsba_crop_municipal_detail.csv", crop_rows, CROP_DETAIL_FIELDS)
    write_readme(powerbi_root, len(summary_rows), len(crop_rows), powerbi_root / "modelsAndExploration.json")
    write_metadata(repo, len(summary_rows), len(crop_rows), powerbi_root / "modelsAndExploration.json")

    print(f"Wrote {len(summary_rows)} municipal summaries.")
    print(f"Wrote {len(crop_rows)} municipality-crop rows.")
    print("App outputs updated:")
    print(f"  {repo / 'data' / 'rsba_municipal_summary.csv'}")
    print(f"  {repo / 'data' / 'rsba_crop_municipal_detail.csv'}")


if __name__ == "__main__":
    main()
