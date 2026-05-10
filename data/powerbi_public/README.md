# Power BI Public Extract

Source report:
https://app.powerbi.com/view?r=eyJrIjoiOTJmZGFiNDAtNTc1Ni00N2YyLWI3NTItNTU3NjdhZjA2Y2I1IiwidCI6IjY4OTgwNjFkLTFhNmItNGUzOS1hZGZjLWRjOGFmZTA3MjIwMSIsImMiOjEwfQ%3D%3D

Report title: Soil Fertility Status of Region 02 Public Version

Dataset last refresh reported by Power BI: 2026-04-17T03:21:04.717

Extracted on: 2026-05-10

## Contents

- `modelsAndExploration.json` - public report metadata, visual definitions, and embedded visual queries.
- `conceptualschema.json` - public semantic model schema.
- `visual_inventory.json` - visual IDs, types, and query inventory.
- `query_payloads/` - replayable public querydata payloads for each report visual.
- `query_results_raw/` - raw Power BI querydata responses for each visual.
- `query_results_csv/` - flattened CSV/JSON versions of each raw visual response.
- `cleaned_csv/` - friendly-named CSV exports with simpler column names.
- `query_results_summary.json` - row counts and columns for each extracted visual.
- `../soil_fertility_municipal_summary.csv` - AgriSight-ready municipal indicators derived from the Power BI soil combinations.

## Cleaned CSV Files

- `total_area.csv`
- `soil_fertility_rating_area.csv`
- `ph_level_area.csv`
- `nitrogen_level_area.csv`
- `phosphorus_level_area.csv`
- `potassium_level_area.csv`
- `zinc_level_area.csv`
- `commodity_values.csv`
- `year_values.csv`
- `map_points.csv`
- `province_district_municipality_area.csv`
- `municipal_soil_combinations.csv`

`municipal_soil_combinations.csv` has 3,293 rows with province, municipality, commodity, fertility class, pH class, N/P/K class, zinc class, and area. The app consumes the derived municipal summary file at `data/soil_fertility_municipal_summary.csv`.

The extraction is limited to data exposed by the public report visuals. Hidden schema fields were not intentionally queried.
