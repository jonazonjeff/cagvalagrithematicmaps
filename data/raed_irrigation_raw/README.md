# RAED Irrigation Raw Source Folder

Place exported or downloaded RAED irrigation source files here before running:

```powershell
python scripts\convert_raed_irrigation.py
```

Supported raw formats:

- ESRI shapefile sets (`.shp`, `.shx`, `.dbf`, `.prj`, optional `.cpg`)
- GeoJSON files (`.geojson`, `.json`)
- CSV files that already contain irrigation rows
- Excel workbooks (`.xlsx`) with repeated `Project Title`, `Project Location`, `Geo Location`, and `TOTAL` project blocks

The converter writes:

- `data/irrigation_facilities.csv`

Recognized facility types are `DD`, `SWIP`, `SPIS`, and `PISOS`.

Keep year-specific Drive downloads under a year folder such as `2025/Project_Name` or `2026/Project_Name`; the converter writes that folder year to `source_year`. Consolidated workbooks from `MAPPING GEOPACKAGES` should stay in `MAPPING_GEOPACKAGES` unless the source Drive folder itself is year-specific.

The converter spatially joins point coordinates to the app's municipality boundaries to fill province, district, and municipality. Public project metadata such as service area, MOA number, supplier, engine, source year, amount, and status is retained when present in the source. Individual recipient names are not written to the output CSV.
