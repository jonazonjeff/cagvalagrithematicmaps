# Cagayan Valley Agriculture Planning Map

Interactive web map for reviewing agriculture, poverty, nutrition, facilities, climate context, and planning priority indicators across Cagayan Valley, Philippines.

The app is a static site built with Leaflet, Chart.js, PapaParse, and plain JavaScript. It can be published directly with GitHub Pages.

## Live Deployment

Recommended GitHub Pages setup:

1. Publish this folder as a GitHub repository.
2. In GitHub, open **Settings > Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose the `main` branch and `/root`.
5. Open the generated Pages URL.

## Run Locally

Do not open `index.html` directly. The app fetches files from `data/`, so it must be served over HTTP.

```bash
cd cagayan-valley-agri-map
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

## Project Structure

```text
cagayan-valley-agri-map/
  index.html
  README.md
  assets/
    logo.png
  css/
    styles.css
  data/
    municipalities_simplified.geojson
    districts_simplified.geojson
    provinces_simplified.geojson
    municipalities.geojson
    districts.geojson
    provinces.geojson
    municipal_data.csv
    facilities.csv
  js/
    app.js
    config.js
    dataLoader.js
    mapLayers.js
    visualizations.js
    charts.js
    climate.js
    weatherOverlay.js
    priorityScoring.js
    aggregation.js
    utils.js
```

## Data Notes

The app loads simplified GeoJSON files first for faster public web performance:

- `data/municipalities_simplified.geojson`
- `data/districts_simplified.geojson`
- `data/provinces_simplified.geojson`

The full boundary files are kept as fallback/reference files.

Primary attribute data lives in:

- `data/municipal_data.csv`
- `data/facilities.csv`

Municipal CSV rows are joined to GeoJSON features using PSGC codes first, then normalized province and municipality names.

## Updating Data

When replacing data:

1. Keep filenames the same.
2. Preserve PSGC columns where possible, especially `ADM3_PCODE` or `psgc`.
3. Keep CSV headers lowercase with underscores for app indicators.
4. Test locally with `python -m http.server 8000`.
5. Use the sidebar **Mismatch Report** if any rows do not join correctly.

## Important Files

- `js/config.js`: indicator definitions, categories, basemaps, priority models, app version.
- `js/dataLoader.js`: data fetch and GeoJSON/CSV joining.
- `js/visualizations.js`: map rendering styles.
- `js/app.js`: app controller, events, splash message.
- `css/styles.css`: dashboard, map, panel, and splash styling.

## Publishing Checklist

Before publishing publicly:

- Confirm the map loads at `http://127.0.0.1:8000/`.
- Confirm no data-load error appears.
- Confirm municipality polygons render, not block sample shapes.
- Confirm the announcement splash and DA logo appear.
- Confirm browser console has no blocking errors from local app files.
- Commit all files in GitHub Desktop and publish the repository.

## License and Credit

For public planning and government use. Please credit relevant data sources such as DA, PSA, PAGASA, and official boundary providers when publishing outputs derived from this tool.
