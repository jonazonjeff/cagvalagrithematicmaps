// ============================================================
// dataLoader.js - Loads GeoJSON + CSV, joins them
// ============================================================

const DataLoader = (() => {
  let municipalGeoJSON = null;
  let districtGeoJSON = null;
  let provinceGeoJSON = null;
  let municipalData = {};
  let prismData = [];
  let facilitiesData = [];
  let joinMismatches = [];

  function dataURL(path) {
    const version = APP_CONFIG.assetVersion || "dev";
    return `${path}${path.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
  }

  async function fetchJSON(path, retries = 2) {
    let lastError = null;
    const url = dataURL(path);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
        return res.json();
      } catch (e) {
        lastError = e;
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }

    throw lastError;
  }

  async function fetchCSV(path) {
    return new Promise((resolve, reject) => {
      Papa.parse(dataURL(path), {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: (err) => reject(err)
      });
    });
  }

  async function loadOptionalGeoJSON(primaryPath, fallbackPath, label) {
    try {
      const geojson = await fetchJSON(primaryPath);
      console.info(`Loaded ${primaryPath}: ${geojson.features?.length || 0} features`);
      return geojson;
    } catch (primaryError) {
      console.warn(`${primaryPath} not found. Trying ${fallbackPath}.`, primaryError);
      try {
        const geojson = await fetchJSON(fallbackPath);
        console.info(`Loaded ${fallbackPath}: ${geojson.features?.length || 0} features`);
        return geojson;
      } catch (fallbackError) {
        console.warn(`${label} boundaries could not be loaded.`, fallbackError);
        return null;
      }
    }
  }

  async function loadRequiredGeoJSON(primaryPath, fallbackPath, label) {
    const geojson = await loadOptionalGeoJSON(primaryPath, fallbackPath, label);
    if (!geojson) {
      throw new Error(`${label} boundaries could not be loaded. The real boundary overlay is required.`);
    }
    return geojson;
  }

  async function loadAll() {
    const dataPath = APP_CONFIG.dataPath;
    joinMismatches = [];

    municipalGeoJSON = await loadRequiredGeoJSON(
      dataPath + "municipalities_simplified.geojson",
      dataPath + "municipalities.geojson",
      "Municipality"
    );

    districtGeoJSON = await loadOptionalGeoJSON(
      dataPath + "districts_simplified.geojson",
      dataPath + "districts.geojson",
      "District"
    );

    provinceGeoJSON = await loadOptionalGeoJSON(
      dataPath + "provinces_simplified.geojson",
      dataPath + "provinces.geojson",
      "Province"
    );

    try {
      const csvRows = await fetchCSV(dataPath + "municipal_data.csv");
      buildMunicipalDataIndex(csvRows);
      console.info(`Loaded municipal_data.csv: ${csvRows.length} rows`);
    } catch (e) {
      console.error("municipal_data.csv could not be loaded.", e);
      throw new Error("municipal_data.csv could not be loaded. The real municipal attribute data is required.");
    }

    try {
      prismData = await fetchCSV(dataPath + "prism_rice_2026s1.csv");
      mergePrismData(prismData);
      console.info(`Loaded prism_rice_2026s1.csv: ${prismData.length} records`);
    } catch (e) {
      console.warn("prism_rice_2026s1.csv not found. PRiSM overlays will be unavailable.", e);
      prismData = [];
    }

    try {
      facilitiesData = await fetchCSV(dataPath + "facilities.csv");
      console.info(`Loaded facilities.csv: ${facilitiesData.length} records`);
    } catch (e) {
      console.warn("facilities.csv not found.", e);
      facilitiesData = [];
    }

    performJoin();
    reportMismatches();

    return {
      municipalGeoJSON,
      districtGeoJSON,
      provinceGeoJSON,
      municipalData,
      prismData,
      facilitiesData,
      joinMismatches
    };
  }

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

  function mergePrismData(rows) {
    rows.forEach(prismRow => {
      const row = findMunicipalDataRow(prismRow.province, prismRow.municipality);
      if (!row) {
        joinMismatches.push({
          type: "prism_no_csv",
          name: `${prismRow.municipality}, ${prismRow.province}`,
          message: "PRiSM row has no matching municipal_data.csv row"
        });
        return;
      }

      Object.assign(row, prismRow);
      addPrismDerivedFields(row);
    });
  }

  function findMunicipalDataRow(province, municipality) {
    const key = Utils.buildJoinKey(province, municipality);
    if (municipalData[key]) return municipalData[key];

    const provinceNorm = Utils.normalizeName(province);
    const municipalityNorm = Utils.normalizeName(municipality);
    return Object.values(municipalData).find(row =>
      Utils.normalizeName(row.province) === provinceNorm &&
      Utils.normalizeName(row.municipality) === municipalityNorm
    ) || null;
  }

  function addPrismDerivedFields(row) {
    const prismArea = Utils.parseNumeric(row.prism_rice_area_2026s1);
    const appArea = Utils.parseNumeric(row.rice_area_2025) || Utils.parseNumeric(row.rice_area_2023);
    const standing = Utils.parseNumeric(row.prism_standing_crop_area);

    if (prismArea !== null && appArea !== null) {
      const gap = prismArea - appArea;
      row.prism_area_gap_vs_app_ha = gap.toFixed(2);
      row.prism_area_gap_vs_app_pct = appArea > 0 ? ((gap / appArea) * 100).toFixed(1) : "";
    }

    row.prism_standing_crop_pct = prismArea > 0 && standing !== null
      ? ((standing / prismArea) * 100).toFixed(1)
      : "";
  }

  function performJoin() {
    if (!municipalGeoJSON) return;

    let matched = 0;
    let unmatched = 0;

    municipalGeoJSON.features.forEach(f => {
      const props = f.properties;
      const psgc = props.psgc || props.PSGC || props.ADM3_PCODE || props.ADM4_PCODE || null;
      let row = null;

      if (psgc && municipalData[String(psgc).trim()]) {
        row = municipalData[String(psgc).trim()];
      } else {
        const prov = props.province || props.Province || props.ADM2_EN || props.PROVINCE || "";
        const mun = props.municipality || props.Municipality || props.ADM3_EN || props.NAME_3 || props.NAME || "";
        row = municipalData[Utils.buildJoinKey(prov, mun)];

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

    const geojsonNames = new Set(
      municipalGeoJSON.features.map(f => {
        const prov = f.properties.province || f.properties.Province || "";
        const mun = f.properties.municipality || f.properties.Municipality || f.properties.NAME || "";
        return Utils.buildJoinKey(prov, mun);
      })
    );

    Object.values(municipalData).forEach(row => {
      const joinKey = Utils.buildJoinKey(row.province, row.municipality);
      if (!geojsonNames.has(joinKey)) {
        joinMismatches.push({
          type: "csv_no_geojson",
          name: `${row.municipality}, ${row.province}`,
          message: "CSV row has no matching GeoJSON boundary"
        });
      }
    });

    console.info(`Join complete: ${matched} matched, ${unmatched} unmatched features`);
  }

  function reportMismatches() {
    if (joinMismatches.length === 0) return;

    console.group(`Data Join Mismatches (${joinMismatches.length})`);
    joinMismatches.forEach(m => console.warn(`[${m.type}] ${m.name}: ${m.message}`));
    console.groupEnd();
  }

  function getMunicipalRows() {
    if (!municipalGeoJSON) return [];
    return municipalGeoJSON.features.map(f => f.properties);
  }

  function getMismatchReport() {
    return Utils.arrayToCSV(joinMismatches);
  }

  function getGeoJSON(viewType) {
    if (viewType === "district" && districtGeoJSON) return districtGeoJSON;
    if (viewType === "province" && provinceGeoJSON) return provinceGeoJSON;
    return municipalGeoJSON;
  }

  return {
    loadAll,
    getMunicipalRows,
    getMismatchReport,
    getGeoJSON,
    get municipalGeoJSON() { return municipalGeoJSON; },
    get prismData() { return prismData; },
    get facilitiesData() { return facilitiesData; }
  };
})();
