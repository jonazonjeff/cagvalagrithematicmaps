// ============================================================
// dataLoader.js — Loads GeoJSON + CSV, Joins Them
// ============================================================

const DataLoader = (() => {
  let municipalGeoJSON = null;
  let districtGeoJSON = null;
  let provinceGeoJSON = null;
  let municipalData = {};       // key: joinKey → attribute row
  let facilitiesData = [];      // array of facility records
  let joinMismatches = [];      // records with no match

  // ---- Fetch helpers ----
  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  async function fetchCSV(path) {
    return new Promise((resolve, reject) => {
      Papa.parse(path, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: (err) => reject(err)
      });
    });
  }

  // ---- Main load function ----
  async function loadAll() {
    const dataPath = APP_CONFIG.dataPath;
    const errors = [];

    // Load GeoJSONs (gracefully handle missing files)
    try {
      municipalGeoJSON = await fetchJSON(dataPath + "municipalities.geojson");
      console.log(`✅ Loaded municipalities.geojson: ${municipalGeoJSON.features.length} features`);
    } catch (e) {
      console.warn("⚠️ municipalities.geojson not found. Using sample data.");
      municipalGeoJSON = generateSampleGeoJSON();
      errors.push("municipalities.geojson not found — using sample boundaries.");
    }

    try {
      districtGeoJSON = await fetchJSON(dataPath + "districts.geojson");
      console.log(`✅ Loaded districts.geojson`);
    } catch (e) {
      console.warn("⚠️ districts.geojson not found.");
      districtGeoJSON = null;
    }

    try {
      provinceGeoJSON = await fetchJSON(dataPath + "provinces.geojson");
      console.log(`✅ Loaded provinces.geojson`);
    } catch (e) {
      console.warn("⚠️ provinces.geojson not found.");
      provinceGeoJSON = null;
    }

    // Load municipal CSV data
    try {
      const csvRows = await fetchCSV(dataPath + "municipal_data.csv");
      buildMunicipalDataIndex(csvRows);
      console.log(`✅ Loaded municipal_data.csv: ${csvRows.length} rows`);
    } catch (e) {
      console.warn("⚠️ municipal_data.csv not found. Injecting sample data.");
      errors.push("municipal_data.csv not found — using sample attribute data.");
      injectSampleData();
    }

    // Load facilities CSV
    try {
      facilitiesData = await fetchCSV(dataPath + "facilities.csv");
      console.log(`✅ Loaded facilities.csv: ${facilitiesData.length} records`);
    } catch (e) {
      console.warn("⚠️ facilities.csv not found.");
      facilitiesData = [];
    }

    // Join CSV to GeoJSON and find mismatches
    performJoin();
    reportMismatches();

    if (errors.length > 0) {
      showDataNotice(errors);
    }

    return {
      municipalGeoJSON,
      districtGeoJSON,
      provinceGeoJSON,
      municipalData,
      facilitiesData,
      joinMismatches
    };
  }

  // ---- Build index of CSV data keyed by normalized province+municipality ----
  function buildMunicipalDataIndex(rows) {
    municipalData = {};
    rows.forEach(row => {
      const key = row.psgc
        ? String(row.psgc).trim()
        : Utils.buildJoinKey(row.province, row.municipality);
      if (municipalData[key]) {
        console.warn(`Duplicate key in CSV: ${key}`);
      }
      municipalData[key] = row;
    });
  }

  // ---- Join CSV attributes to GeoJSON features ----
  function performJoin() {
    if (!municipalGeoJSON) return;
    let matched = 0, unmatched = 0;

    municipalGeoJSON.features.forEach(f => {
      const props = f.properties;
      // Try PSGC first, then province+municipality
      const psgc = props.psgc || props.PSGC || props.ADM4_PCODE || null;
      let key = null;
      let row = null;

      if (psgc && municipalData[String(psgc).trim()]) {
        key = String(psgc).trim();
        row = municipalData[key];
      } else {
        // Try various property name conventions
        const prov = props.province || props.Province || props.ADM2_EN || props.PROVINCE || "";
        const mun = props.municipality || props.Municipality || props.ADM3_EN || props.NAME_3 || props.NAME || "";
        key = Utils.buildJoinKey(prov, mun);
        row = municipalData[key];

        // Fuzzy fallback: search all keys
        if (!row) {
          const munNorm = Utils.normalizeName(mun);
          row = Object.values(municipalData).find(r =>
            Utils.normalizeName(r.municipality) === munNorm
          ) || null;
        }
      }

      if (row) {
        Object.assign(f.properties, row);
        f.properties._joined = true;
        matched++;
      } else {
        f.properties._joined = false;
        unmatched++;
        joinMismatches.push({
          type: "geojson_no_csv",
          name: props.NAME || props.municipality || "Unknown",
          message: "GeoJSON feature has no matching CSV row"
        });
      }
    });

    // Check CSV rows with no GeoJSON match
    const geojsonNames = new Set(
      municipalGeoJSON.features.map(f => {
        const prov = f.properties.province || f.properties.Province || "";
        const mun = f.properties.municipality || f.properties.Municipality || f.properties.NAME || "";
        return Utils.buildJoinKey(prov, mun);
      })
    );
    Object.entries(municipalData).forEach(([key, row]) => {
      const joinKey = Utils.buildJoinKey(row.province, row.municipality);
      if (!geojsonNames.has(joinKey)) {
        joinMismatches.push({
          type: "csv_no_geojson",
          name: `${row.municipality}, ${row.province}`,
          message: "CSV row has no matching GeoJSON boundary"
        });
      }
    });

    console.log(`✅ Join complete: ${matched} matched, ${unmatched} unmatched features`);
  }

  // ---- Console and UI mismatch report ----
  function reportMismatches() {
    if (joinMismatches.length === 0) return;
    console.group(`⚠️ Data Join Mismatches (${joinMismatches.length})`);
    joinMismatches.forEach(m => console.warn(`[${m.type}] ${m.name}: ${m.message}`));
    console.groupEnd();
  }

  // ---- Show on-screen data quality notice ----
  function showDataNotice(messages) {
    const notice = document.getElementById("data-notice");
    if (!notice) return;
    notice.innerHTML = `<strong>⚠️ Sample Data Mode:</strong> ${messages.join(" | ")} 
      Replace files in the <code>data/</code> folder with real data.`;
    notice.style.display = "block";
  }

  // ---- Get all features with joined data as array ----
  function getMunicipalRows() {
    if (!municipalGeoJSON) return [];
    return municipalGeoJSON.features.map(f => f.properties);
  }

  // ---- Get mismatches as CSV string ----
  function getMismatchReport() {
    return Utils.arrayToCSV(joinMismatches);
  }

  // ---- Get current GeoJSON by view type ----
  function getGeoJSON(viewType) {
    if (viewType === "district" && districtGeoJSON) return districtGeoJSON;
    if (viewType === "province" && provinceGeoJSON) return provinceGeoJSON;
    return municipalGeoJSON;
  }

  // ===========================================================
  // SAMPLE DATA GENERATION (used when real files are absent)
  // Clearly labeled as SAMPLE DATA
  // ===========================================================
  function generateSampleGeoJSON() {
    const provinces = ["Cagayan", "Isabela", "Quirino", "Nueva Vizcaya", "Batanes"];
    const municipalities = [
      ["Tuguegarao City", "Cagayan"], ["Aparri", "Cagayan"], ["Gattaran", "Cagayan"],
      ["Camalaniugan", "Cagayan"], ["Lallo", "Cagayan"], ["Pamplona", "Cagayan"],
      ["Ilagan City", "Isabela"], ["Santiago City", "Isabela"], ["Cauayan City", "Isabela"],
      ["Cabagan", "Isabela"], ["Tumauini", "Isabela"], ["Roxas", "Isabela"],
      ["Diffun", "Quirino"], ["Maddela", "Quirino"], ["Cabarroguis", "Quirino"],
      ["Bayombong", "Nueva Vizcaya"], ["Solano", "Nueva Vizcaya"], ["Bambang", "Nueva Vizcaya"],
      ["Basco", "Batanes"], ["Itbayat", "Batanes"]
    ];

    // Generate rough bounding boxes per province for visualization
    const provBounds = {
      "Cagayan":       { lat: 18.2, lng: 121.7, dlat: 0.15, dlng: 0.2 },
      "Isabela":       { lat: 17.2, lng: 121.8, dlat: 0.15, dlng: 0.2 },
      "Quirino":       { lat: 16.5, lng: 121.5, dlat: 0.15, dlng: 0.2 },
      "Nueva Vizcaya": { lat: 16.4, lng: 121.1, dlat: 0.15, dlng: 0.2 },
      "Batanes":       { lat: 20.4, lng: 121.9, dlat: 0.10, dlng: 0.15 }
    };

    let provCounts = {};

    const features = municipalities.map(([mun, prov], i) => {
      if (!provCounts[prov]) provCounts[prov] = 0;
      const count = provCounts[prov]++;
      const b = provBounds[prov];
      const row = Math.floor(count / 3);
      const col = count % 3;
      const lat0 = b.lat + row * b.dlat;
      const lng0 = b.lng + col * b.dlng;
      const lat1 = lat0 + b.dlat * 0.9;
      const lng1 = lng0 + b.dlng * 0.9;

      return {
        type: "Feature",
        properties: {
          municipality: mun,
          province: prov,
          district: `${prov} ${count < 3 ? "1st" : "2nd"} District`,
          _sample: true
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [lng0, lat0], [lng1, lat0], [lng1, lat1], [lng0, lat1], [lng0, lat0]
          ]]
        }
      };
    });

    return { type: "FeatureCollection", features };
  }

  function injectSampleData() {
    if (!municipalGeoJSON) return;
    municipalData = {};

    municipalGeoJSON.features.forEach((f, i) => {
      const mun = f.properties.municipality || `Municipality ${i + 1}`;
      const prov = f.properties.province || "Unknown";
      const key = Utils.buildJoinKey(prov, mun);
      const pop = 15000 + Math.round(Math.random() * 80000);

      const row = {
        psgc: String(170000000 + i * 1000),
        province: prov,
        municipality: mun,
        district: f.properties.district || "",
        population: pop,
        poverty_2018: (20 + Math.random() * 35).toFixed(1),
        poverty_2021: (18 + Math.random() * 33).toFixed(1),
        poverty_2023: (15 + Math.random() * 30).toFixed(1),
        stunting: (15 + Math.random() * 25).toFixed(1),
        underweight: (10 + Math.random() * 20).toFixed(1),
        obese: (5 + Math.random() * 15).toFixed(1),
        wasting: (3 + Math.random() * 12).toFixed(1),
        rice_production_2023: Math.round(1000 + Math.random() * 15000),
        rice_production_2025: Math.round(1100 + Math.random() * 16000),
        rice_area_2023: Math.round(300 + Math.random() * 4000),
        rice_area_2025: Math.round(320 + Math.random() * 4200),
        rice_yield_2023: (2.5 + Math.random() * 2.0).toFixed(2),
        rice_yield_2025: (2.7 + Math.random() * 2.2).toFixed(2),
        poor_rice_farmers: Math.round(50 + Math.random() * 1500),
        rice_mechanization_level: Math.round(10 + Math.random() * 70),
        corn_production_2023: Math.round(500 + Math.random() * 8000),
        corn_production_2025: Math.round(550 + Math.random() * 8500),
        corn_area_2023: Math.round(200 + Math.random() * 2500),
        corn_area_2025: Math.round(220 + Math.random() * 2600),
        corn_yield_2023: (2.0 + Math.random() * 1.5).toFixed(2),
        corn_yield_2025: (2.1 + Math.random() * 1.6).toFixed(2),
        poor_corn_farmers: Math.round(30 + Math.random() * 800),
        corn_mechanization_level: Math.round(5 + Math.random() * 55),
        pest_disease_occurrence: ["None", "Low", "Moderate", "High"][Math.floor(Math.random() * 4)],
        asf_status: ["Clear", "At-risk", "Affected"][Math.floor(Math.random() * 3)],
        rpc_site: Math.random() > 0.7 ? 1 : 0,
        soil_fertility: ["Low", "Moderate", "High"][Math.floor(Math.random() * 3)],
        irrigated_area: Math.round(50 + Math.random() * 1500),
        _sample: "true"
      };
      municipalData[key] = row;
    });

    // Also inject sample facilities
    facilitiesData = municipalGeoJSON.features.slice(0, 5).map((f, i) => ({
      facility_id: `FAC${i + 1}`,
      facility_name: `RPC Site ${i + 1}`,
      facility_type: "RPC",
      province: f.properties.province || "",
      municipality: f.properties.municipality || "",
      latitude: null,
      longitude: null,
      status: "Operational",
      capacity: Math.round(100 + Math.random() * 900),
      remarks: "SAMPLE DATA"
    }));

    console.log("✅ Sample data injected for all municipalities.");
  }

  return {
    loadAll,
    getMunicipalRows,
    getMismatchReport,
    getGeoJSON,
    get municipalGeoJSON() { return municipalGeoJSON; },
    get facilitiesData() { return facilitiesData; }
  };
})();
