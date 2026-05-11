# RAED Irrigation Raw Source Folder

Place exported or downloaded RAED irrigation source files here before running:

```powershell
python scripts\convert_raed_irrigation.py
```

Supported raw formats:

- ESRI shapefile sets (`.shp`, `.shx`, `.dbf`, `.prj`, optional `.cpg`)
- GeoJSON files (`.geojson`, `.json`)
- CSV files that already contain irrigation rows

The converter writes:

- `data/irrigation_facilities.csv`

Recognized facility types are `DD`, `SWIP`, `SPIS`, and `PISOS`.

The converter spatially joins point coordinates to the app's municipality boundaries to fill province, district, and municipality. Public project metadata such as service area, MOA number, supplier, engine, year, amount, and status is retained when present in the source. Individual recipient names are not written to the output CSV.
