# Power BI FMR Extract

Source report:
https://app.powerbi.com/view?r=eyJrIjoiNTcxYjAyMGEtNDU0Ny00NjZlLTljMWEtZTgwMjRmMTExYjI2IiwidCI6IjY4OTgwNjFkLTFhNmItNGUzOS1hZGZjLWRjOGFmZTA3MjIwMSIsImMiOjEwfQ%3D%3D

Report title: FMR INVENTORY_2016-PRESENT

Dataset last refresh reported by Power BI: 2026-05-07T16:07:52.707

Extracted on: 2026-05-10

## Contents

- `modelsAndExploration.json` - public report metadata, visual definitions, and embedded visual queries.
- `conceptualschema.json` - public semantic model schema.
- `visual_inventory.json` - visual IDs, types, and query inventory.
- `query_payloads/fmr_project_details.json` - replayable querydata payload for project-level FMR records.
- `query_results_raw/fmr_project_details.json` - raw Power BI querydata response.
- `cleaned_csv/fmr_project_details.csv` - cleaned project-level FMR export.
- `../fmr_projects.csv` - AgriSight-ready FMR point layer source.
- `../fmr_municipal_summary.csv` - AgriSight-ready municipal FMR indicators.

The app uses the project CSV as a toggleable Farm-to-Market Roads map layer and the municipal summary as FMR Inventory indicators.
