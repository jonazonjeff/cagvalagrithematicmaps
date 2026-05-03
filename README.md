# Cagayan Valley Agriculture, Poverty, Nutrition & Planning Map

Interactive GIS-based decision-support web application for agriculture intervention targeting, poverty reduction, nutrition-sensitive agriculture, and investment prioritization in Cagayan Valley, Philippines.

---

## 🚀 Quick Start (Run Locally)

Because the app loads files from the `data/` folder, you need a local web server — not just double-clicking `index.html`.

### Option A: Python (Recommended — No Install Required)

```bash
# Python 3
cd cagayan-valley-agri-map
python -m http.server 8080
```

Then open: **http://localhost:8080**

### Option B: Node.js

```bash
npx serve .
```

### Option C: VS Code Live Server

Install the **Live Server** extension in VS Code, then click **Go Live** in the bottom bar.

---

## 📁 Folder Structure

```
cagayan-valley-agri-map/
├── index.html              ← Main app page
├── README.md
├── css/
│   └── styles.css          ← All styling
├── js/
│   ├── config.js           ← Indicators, basemaps, priority models
│   ├── utils.js            ← Helper functions
│   ├── dataLoader.js       ← Loads GeoJSON + CSV, joins them
│   ├── aggregation.js      ← Aggregates data to district/province level
│   ├── priorityScoring.js  ← Composite priority score engine
│   ├── visualizations.js   ← All map visualization styles
│   ├── mapLayers.js        ← Basemaps, facilities, view management
│   ├── charts.js           ← Chart.js analytics
│   └── app.js              ← Main application controller
├── data/
│   ├── municipalities.geojson   ← Municipal boundaries (YOU PROVIDE)
│   ├── districts.geojson        ← District boundaries (optional)
│   ├── provinces.geojson        ← Province boundaries (optional)
│   ├── municipal_data.csv       ← Attribute data (sample included)
│   └── facilities.csv           ← Facility locations (sample included)
└── assets/
    └── logo.png                 ← Optional logo
```

---

## 📦 Preparing Your GeoJSON Files

### municipalities.geojson

Download from:
- **GADM**: https://gadm.org → Philippines → Admin Level 3 (municipalities)
- **PAGASA/PhilGIS**: Check for Cagayan Valley-specific files
- **OpenStreetMap**: Overpass API

Each feature's `properties` must include:
- `municipality` — municipality name (must match CSV exactly)
- `province` — province name
- `district` — congressional district (optional but recommended)

**OR** include a `psgc` field (Philippine Standard Geographic Code) for more reliable matching.

### districts.geojson and provinces.geojson

These are optional. If not present, the app will use municipal boundaries and aggregate on-the-fly.

---

## 📊 Preparing Your CSV File

### Required Filename
`data/municipal_data.csv`

### Required Fields (match exactly — lowercase, underscores)

```csv
psgc,province,municipality,district,population,
poverty_2018,poverty_2021,poverty_2023,
stunting,underweight,obese,wasting,
rice_production_2023,rice_production_2025,rice_area_2023,rice_area_2025,
rice_yield_2023,rice_yield_2025,poor_rice_farmers,rice_mechanization_level,
corn_production_2023,corn_production_2025,corn_area_2023,corn_area_2025,
corn_yield_2023,corn_yield_2025,poor_corn_farmers,corn_mechanization_level,
pest_disease_occurrence,asf_status,rpc_site,soil_fertility,irrigated_area
```

### Field Notes

| Field | Type | Notes |
|-------|------|-------|
| `psgc` | text | Best join key — use if available |
| `province` | text | Must match GeoJSON property |
| `municipality` | text | Must match GeoJSON property |
| `poverty_*` | number | Percentage, e.g., `28.5` |
| `stunting`, `underweight`, `obese`, `wasting` | number | Percentage |
| `rice_production_*` | number | Metric tons |
| `rice_area_*` | number | Hectares |
| `rice_yield_*` | number | MT/ha |
| `poor_*_farmers` | integer | Count |
| `*_mechanization_level` | number | Percentage (0-100) |
| `pest_disease_occurrence` | text | `None`, `Low`, `Moderate`, `High` |
| `asf_status` | text | `Clear`, `At-risk`, `Affected` |
| `rpc_site` | number | `1` = present, `0` = absent |
| `soil_fertility` | text | `Low`, `Moderate`, `High` |
| `irrigated_area` | number | Hectares |

---

## 🔗 How Data Joining Works

1. The app loads `municipalities.geojson` and `municipal_data.csv`
2. For each GeoJSON feature, it tries to find a matching CSV row using:
   - **First**: PSGC code (`psgc` field) — most reliable
   - **Fallback**: Normalized province + municipality name match
3. Matched attributes are merged into `feature.properties`
4. Unmatched features show a gray "No data" polygon
5. Mismatches are logged in the browser console and downloadable via **⬇ Mismatch Report**

**Important**: Municipality names must be consistent between GeoJSON and CSV. Common issues:
- "City of Tuguegarao" vs "Tuguegarao City" → The app normalizes "City of" prefixes
- Extra spaces or punctuation → The app strips these
- Missing leading zeros in PSGC → Use PSGC as text (wrap in quotes in CSV)

---

## 🗺 Map Visualization Styles

| Style | Best For |
|-------|----------|
| Choropleth | Most indicators — colored by value class |
| Gradient | Continuous scale — poverty, yield |
| Proportional Circles | Volume data — production, farmers |
| Bivariate | Comparing two indicators at once |
| Dominant Crop | Rice vs corn areas |
| Pie Chart Symbols | Composition at each municipality |
| Bar Chart Symbols | Multi-year comparisons |
| Ranked Highlight | Top/bottom N municipalities |
| Deviation | How each area compares to regional average |
| Ratio Map | Computed ratios (yield, coverage rates) |
| Planning Priority | Composite scoring for interventions |

---

## ➕ Adding New Indicators

Open `js/config.js` and add an entry to `INDICATOR_CONFIG`:

```javascript
my_new_field: {
  label: "My New Indicator Label",
  category: "Rice",           // Must match an entry in CATEGORIES
  type: "numeric",            // numeric | percentage | categorical | binary
  unit: "MT",
  aggregation: "sum",         // sum | weighted_average | ratio | dominant | mean
  colorScheme: "YlGn",        // Must match a key in COLOR_SCHEMES
  description: "Description for users"
}
```

Then add the corresponding column to your CSV. No other code changes needed.

### Available Categories
`Demographics`, `Poverty`, `Malnutrition`, `Rice`, `Corn`, `Pest and Disease`, `ASF`, `Soil Fertility`, `Irrigation`, `Infrastructure`, `Planning Priority`

To add a new category, append it to the `CATEGORIES` array in `config.js`.

---

## 🏭 Adding New Facilities

Add rows to `data/facilities.csv`:

```csv
facility_id,facility_name,facility_type,province,municipality,latitude,longitude,status,capacity,remarks
FAC999,My New Facility,Warehouse,Isabela,Cabagan,17.1234,121.5678,Operational,800,New warehouse
```

If `latitude`/`longitude` are blank, the marker will appear at the municipality centroid and be labeled as approximate.

To add new facility types with custom icons, edit the `icons` object in `mapLayers.js`.

---

## 🌐 Deployment

### GitHub Pages

1. Push the project to a GitHub repository
2. Go to **Settings → Pages**
3. Set source to **main branch / root**
4. Access at: `https://yourusername.github.io/cagayan-valley-agri-map/`

### Netlify

1. Drag the project folder to https://app.netlify.com/drop
2. Or connect your GitHub repo for automatic deploys
3. No configuration needed — it's a static site

### Vercel

```bash
npm install -g vercel
vercel --prod
```

---

## 🗺 Modifying Basemaps

Edit the `BASEMAPS` object in `js/config.js`.

**Google Maps Note**: Google tile URLs (`mt0.google.com`) may work without an API key for personal use, but may be restricted by Google's Terms of Service. If needed, uncomment the Google basemap entries in `config.js` and monitor for access issues. Fall back to Esri satellite imagery as a reliable alternative.

---

## ⚖️ Editing Priority Scoring Weights

In `js/config.js`, find `PRIORITY_MODELS` and adjust the weights:

```javascript
rice: {
  label: "Rice Intervention Priority",
  weights: {
    poor_rice_farmers: 0.25,     // ← change these
    poverty_2023: 0.20,
    rice_yield_gap: 0.20,
    // ...
  }
}
```

Weights do not need to sum to 1.0 — the scoring engine normalizes automatically. The breakdown table in each popup shows which components drove the score.

---

## 🐛 Troubleshooting

### Map shows gray polygons (no data)
- Check that `municipal_data.csv` is in the `data/` folder
- Open browser console (F12) and look for join mismatch warnings
- Download the mismatch report from the sidebar

### CSV won't load
- Check for UTF-8 encoding issues (especially with Filipino special characters)
- Ensure the file is saved as CSV, not XLSX
- Check that column names match exactly (lowercase, underscores, no spaces)

### GeoJSON won't load
- Validate your GeoJSON at https://geojsonlint.com
- Check for coordinate order (must be [longitude, latitude])
- Ensure the file is valid JSON (no trailing commas)

### Charts don't appear
- Open browser console — may be a Chart.js version issue
- Ensure all `<canvas>` IDs in `index.html` match IDs referenced in `charts.js`

### Priority scores all showing "Data Insufficient"
- Check that the relevant fields have data in the CSV
- "Data Insufficient" appears when normalized score < 0.15

### All data shows as "SAMPLE DATA"
- Replace `data/municipalities.geojson` and `data/municipal_data.csv` with your real files
- The GeoJSON features must have `province` and `municipality` properties matching your CSV

---

## 📋 Data Field Reference

See `data/municipal_data.csv` for an example of the expected CSV structure with 32 real municipalities.

---

## 📜 License

Free for government and public planning use. Please credit the data sources (PSA, DA, PAGASA) when publishing maps.

---

*Built for DA-Cagayan Valley Regional Field Office. For support, check browser console logs and the mismatch report.*
