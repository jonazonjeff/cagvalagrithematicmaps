// ============================================================
// dataLoader.js - Loads GeoJSON + CSV, joins them
// ============================================================

const DataLoader = (() => {
  let municipalGeoJSON = null;
  let barangayGeoJSON = null;
  let districtGeoJSON = null;
  let provinceGeoJSON = null;
  let municipalData = {};
  let barangayFarmData = [];
  let prismData = [];
  let droughtOutlookData = [];
  let plansProjectsData = [];
  let soilFertilityData = [];
  let fmrProjectsData = [];
  let fmrSummaryData = [];
  let f2c2ClustersData = [];
  let f2c2SummaryData = [];
  let rsbaSummaryData = [];
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

    barangayGeoJSON = await loadOptionalGeoJSON(
      dataPath + "barangay_boundaries.geojson",
      dataPath + "barangay_boundaries.geojson",
      "Barangay"
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
      const riceFarms = await fetchCSV(dataPath + "rice_farms.csv");
      const cornFarms = await fetchCSV(dataPath + "corn_farms.csv");
      barangayFarmData = mergeBarangayFarmData(riceFarms, cornFarms);
      mergeBarangayFarmCounts(barangayFarmData);
      console.info(`Loaded barangay farm counts: ${barangayFarmData.length} barangays`);
    } catch (e) {
      console.warn("Barangay rice/corn farm count files not found. Barangay farm overlays will be unavailable.", e);
      barangayFarmData = [];
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
      droughtOutlookData = await fetchCSV(dataPath + "pagasa_drought_outlook_region2.csv");
      mergeDroughtOutlookData(droughtOutlookData);
      console.info(`Loaded pagasa_drought_outlook_region2.csv: ${droughtOutlookData.length} records`);
    } catch (e) {
      console.warn("pagasa_drought_outlook_region2.csv not found. El Nino rice risk overlays will be unavailable.", e);
      droughtOutlookData = [];
    }

    try {
      plansProjectsData = await fetchCSV(dataPath + "plans_projects_2025_2027.csv");
      mergePlansProjectsData(plansProjectsData);
      console.info(`Loaded plans_projects_2025_2027.csv: ${plansProjectsData.length} records`);
    } catch (e) {
      console.warn("plans_projects_2025_2027.csv not found. Plans and projects overlays will be unavailable.", e);
      plansProjectsData = [];
      addPlansProjectDefaults();
    }

    try {
      soilFertilityData = await fetchCSV(dataPath + "soil_fertility_municipal_summary.csv");
      mergeSoilFertilityData(soilFertilityData);
      console.info(`Loaded soil_fertility_municipal_summary.csv: ${soilFertilityData.length} records`);
    } catch (e) {
      console.warn("soil_fertility_municipal_summary.csv not found. Soil fertility decision scenarios will use baseline municipal fields only.", e);
      soilFertilityData = [];
      addSoilFertilityDefaults();
    }

    try {
      fmrSummaryData = await fetchCSV(dataPath + "fmr_municipal_summary.csv");
      mergeFmrSummaryData(fmrSummaryData);
      console.info(`Loaded fmr_municipal_summary.csv: ${fmrSummaryData.length} records`);
    } catch (e) {
      console.warn("fmr_municipal_summary.csv not found. FMR inventory indicators will be unavailable.", e);
      fmrSummaryData = [];
      addFmrDefaults();
    }

    try {
      f2c2SummaryData = await fetchCSV(dataPath + "f2c2_municipal_summary.csv");
      mergeF2c2SummaryData(f2c2SummaryData);
      console.info(`Loaded f2c2_municipal_summary.csv: ${f2c2SummaryData.length} records`);
    } catch (e) {
      console.warn("f2c2_municipal_summary.csv not found. F2C2 cluster indicators will be unavailable.", e);
      f2c2SummaryData = [];
      addF2c2Defaults();
    }

    try {
      rsbaSummaryData = await fetchCSV(dataPath + "rsba_municipal_summary.csv");
      mergeRsbaSummaryData(rsbaSummaryData);
      console.info(`Loaded rsba_municipal_summary.csv: ${rsbaSummaryData.length} records`);
    } catch (e) {
      console.warn("rsba_municipal_summary.csv not found. RSBA registry indicators will be unavailable.", e);
      rsbaSummaryData = [];
      addRsbaDefaults();
    }

    try {
      facilitiesData = await fetchCSV(dataPath + "facilities.csv");
      console.info(`Loaded facilities.csv: ${facilitiesData.length} records`);
    } catch (e) {
      console.warn("facilities.csv not found.", e);
      facilitiesData = [];
    }

    try {
      fmrProjectsData = await fetchCSV(dataPath + "fmr_projects.csv");
      facilitiesData = facilitiesData.concat(toFmrFacilityRows(fmrProjectsData));
      console.info(`Loaded fmr_projects.csv: ${fmrProjectsData.length} records`);
    } catch (e) {
      console.warn("fmr_projects.csv not found. FMR point layer will be unavailable.", e);
      fmrProjectsData = [];
    }

    try {
      f2c2ClustersData = await fetchCSV(dataPath + "f2c2_clusters.csv");
      facilitiesData = facilitiesData.concat(toF2c2FacilityRows(f2c2ClustersData));
      console.info(`Loaded f2c2_clusters.csv: ${f2c2ClustersData.length} records`);
    } catch (e) {
      console.warn("f2c2_clusters.csv not found. F2C2 cluster point layer will be unavailable.", e);
      f2c2ClustersData = [];
    }

    performJoin();
    reportMismatches();

    return {
      municipalGeoJSON,
      barangayGeoJSON,
      districtGeoJSON,
      provinceGeoJSON,
      municipalData,
      barangayFarmData,
      prismData,
      droughtOutlookData,
      plansProjectsData,
      soilFertilityData,
      fmrProjectsData,
      fmrSummaryData,
      f2c2ClustersData,
      f2c2SummaryData,
      rsbaSummaryData,
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

  function mergeBarangayFarmData(riceRows, cornRows) {
    const byCode = {};

    riceRows.forEach(row => {
      const code = String(row.ADM4_PCODE || "").trim();
      if (!code) return;
      byCode[code] = {
        barangay: row.brgy_name || row.ADM4_EN || "",
        municipality: row.mun_name || row.ADM3_EN || "",
        province: row.prov_name || row.ADM2_EN || "",
        ADM4_PCODE: code,
        ADM3_PCODE: row.ADM3_PCODE || "",
        ADM2_PCODE: row.ADM2_PCODE || "",
        rice_farms: row.rice_farmers || ""
      };
    });

    cornRows.forEach(row => {
      const code = String(row.ADM4_PCODE || "").trim();
      if (!code) return;
      if (!byCode[code]) {
        byCode[code] = {
          barangay: row.brgy_name || row.ADM4_EN || "",
          municipality: row.mun_name || row.ADM3_EN || "",
          province: row.prov_name || row.ADM2_EN || "",
          ADM4_PCODE: code,
          ADM3_PCODE: row.ADM3_PCODE || "",
          ADM2_PCODE: row.ADM2_PCODE || "",
          rice_farms: ""
        };
      }
      byCode[code].corn_farms = row.corn_farmers || "";
    });

    const rows = Object.values(byCode);
    joinBarangayFarmCounts(rows);
    return rows;
  }

  function joinBarangayFarmCounts(rows) {
    if (!barangayGeoJSON) return;
    const byCode = {};
    rows.forEach(row => { byCode[row.ADM4_PCODE] = row; });

    let matched = 0;
    barangayGeoJSON.features.forEach(feature => {
      const props = feature.properties;
      const code = String(props.ADM4_PCODE || "").trim();
      const row = byCode[code];
      props.barangay = props.ADM4_EN || props.barangay || props.brgy_name || "";
      props.municipality = props.ADM3_EN || props.municipality || props.mun_name || "";
      props.province = props.ADM2_EN || props.province || props.prov_name || "";
      props._areaKey = code || Utils.buildJoinKey(props.municipality, props.barangay);
      props._areaName = `${props.barangay}, ${props.municipality}`;

      if (row) {
        Object.assign(props, row);
        props.rice_farms = row.rice_farms || "0";
        props.corn_farms = row.corn_farms || "0";
        props.poor_rice_farmers = props.rice_farms;
        props.poor_corn_farmers = props.corn_farms;
        props._joined = true;
        matched++;
      } else {
        props.rice_farms = "0";
        props.corn_farms = "0";
        props.poor_rice_farmers = "0";
        props.poor_corn_farmers = "0";
        props._joined = false;
      }
    });

    console.info(`Barangay farm-count join complete: ${matched} matched features`);
  }

  function mergeBarangayFarmCounts(rows) {
    const totalsByMunicipality = {};
    rows.forEach(row => {
      const key = Utils.buildJoinKey(row.province, row.municipality);
      if (!totalsByMunicipality[key]) {
        totalsByMunicipality[key] = {
          province: row.province,
          municipality: row.municipality,
          rice_farms: 0,
          corn_farms: 0
        };
      }
      totalsByMunicipality[key].rice_farms += Utils.parseNumeric(row.rice_farms) || 0;
      totalsByMunicipality[key].corn_farms += Utils.parseNumeric(row.corn_farms) || 0;
    });

    Object.values(totalsByMunicipality).forEach(total => {
      const row = findMunicipalDataRow(total.province, total.municipality);
      if (!row) return;
      row.rice_farms = total.rice_farms.toFixed(0);
      row.corn_farms = total.corn_farms.toFixed(0);
      row.poor_rice_farmers = row.rice_farms;
      row.poor_corn_farmers = row.corn_farms;
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
    ) || Object.values(municipalData).find(row => {
      const rowProvince = Utils.normalizeName(row.province);
      const rowMunicipality = Utils.normalizeName(row.municipality);
      if (rowProvince !== provinceNorm) return false;
      const rowCompact = rowMunicipality.replace(/\s+/g, "");
      const targetCompact = municipalityNorm.replace(/\s+/g, "");
      const rowExpanded = rowMunicipality.replace(/^sta\s+/, "santa ");
      const targetExpanded = municipalityNorm.replace(/^sta\s+/, "santa ");
      const rowCityVariant = rowMunicipality.replace(/^city of\s+(.+?)(\s+capital)?$/, "$1 city");
      const targetCityVariant = municipalityNorm.replace(/^city of\s+(.+?)(\s+capital)?$/, "$1 city");
      const rowWithoutCapital = rowCityVariant.replace(/\s+capital$/, "");
      const targetWithoutCapital = targetCityVariant.replace(/\s+capital$/, "");
      return rowMunicipality.includes(municipalityNorm) ||
        municipalityNorm.includes(rowMunicipality) ||
        rowCompact === targetCompact ||
        rowExpanded === targetExpanded ||
        rowCityVariant === targetCityVariant ||
        rowWithoutCapital === targetWithoutCapital ||
        levenshteinDistance(rowCompact, targetCompact) <= 1;
    }) || null;
  }

  function levenshteinDistance(a, b) {
    if (!a || !b) return Math.max(String(a || "").length, String(b || "").length);
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[a.length][b.length];
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

  function mergeDroughtOutlookData(rows) {
    const outlookByProvince = {};
    rows.forEach(row => {
      outlookByProvince[Utils.normalizeName(row.province)] = row;
    });

    Object.values(municipalData).forEach(row => {
      const outlook = outlookByProvince[Utils.normalizeName(row.province)];
      if (!outlook) return;
      Object.assign(row, outlook);
      addElNinoRiskDerivedFields(row);
    });
  }

  function mergePlansProjectsData(rows) {
    rows.forEach(planRow => {
      const row = findMunicipalDataRow(planRow.province, planRow.municipality);
      if (!row) {
        joinMismatches.push({
          type: "plans_no_csv",
          name: `${planRow.municipality}, ${planRow.province}`,
          message: "Plans/projects row has no matching municipal_data.csv row"
        });
        return;
      }

      Object.assign(row, planRow);
    });

    addPlansProjectDefaults();
  }

  function mergeSoilFertilityData(rows) {
    rows.forEach(soilRow => {
      const row = findMunicipalDataRow(soilRow.province, soilRow.municipality);
      if (!row) {
        joinMismatches.push({
          type: "soil_fertility_no_csv",
          name: `${soilRow.municipality}, ${soilRow.province}`,
          message: "Soil fertility row has no matching municipal_data.csv row"
        });
        return;
      }

      Object.assign(row, soilRow);
    });

    addSoilFertilityDefaults();
  }

  function mergeFmrSummaryData(rows) {
    rows.forEach(fmrRow => {
      const row = findMunicipalDataRow(fmrRow.province, fmrRow.municipality);
      if (!row) {
        joinMismatches.push({
          type: "fmr_no_csv",
          name: `${fmrRow.municipality}, ${fmrRow.province}`,
          message: "FMR summary row has no matching municipal_data.csv row"
        });
        return;
      }

      Object.assign(row, fmrRow);
    });

    addFmrDefaults();
  }

  function mergeF2c2SummaryData(rows) {
    rows.forEach(f2c2Row => {
      const row = findMunicipalDataRow(f2c2Row.province, f2c2Row.municipality);
      if (!row) {
        joinMismatches.push({
          type: "f2c2_no_csv",
          name: `${f2c2Row.municipality}, ${f2c2Row.province}`,
          message: "F2C2 summary row has no matching municipal_data.csv row"
        });
        return;
      }

      Object.assign(row, f2c2Row);
    });

    addF2c2Defaults();
  }

  function mergeRsbaSummaryData(rows) {
    rows.forEach(rsbaRow => {
      const row = findMunicipalDataRow(rsbaRow.province, rsbaRow.municipality);
      if (!row) {
        joinMismatches.push({
          type: "rsba_no_csv",
          name: `${rsbaRow.municipality}, ${rsbaRow.province}`,
          message: "RSBA summary row has no matching municipal_data.csv row"
        });
        return;
      }

      Object.assign(row, rsbaRow);
    });

    addRsbaDefaults();
  }

  function addPlansProjectDefaults() {
    Object.values(municipalData).forEach(row => addPlansDerivedFields(row));
  }

  function addSoilFertilityDefaults() {
    const numericFields = [
      "soil_lab_area_ha",
      "soil_fertility_stress_score",
      "soil_low_fertility_area_ha",
      "soil_low_fertility_pct",
      "soil_acidic_area_ha",
      "soil_acidic_pct",
      "soil_alkaline_pct",
      "soil_n_low_pct",
      "soil_p_low_pct",
      "soil_k_low_pct",
      "soil_npk_multiple_low_area_ha",
      "soil_npk_multiple_low_pct",
      "soil_zinc_deficient_area_ha",
      "soil_zinc_deficient_pct",
      "soil_acidic_low_fertility_area_ha",
      "soil_low_fertility_zinc_def_area_ha",
      "soil_rice_tested_area_ha",
      "soil_rice_low_fertility_area_ha",
      "soil_rice_low_fertility_pct",
      "soil_rice_acidic_pct",
      "soil_rice_npk_multiple_low_pct",
      "soil_rice_zinc_deficient_pct",
      "soil_corn_tested_area_ha",
      "soil_corn_low_fertility_area_ha",
      "soil_corn_low_fertility_pct",
      "soil_corn_acidic_pct",
      "soil_corn_npk_multiple_low_pct",
      "soil_corn_zinc_deficient_pct"
    ];

    Object.values(municipalData).forEach(row => {
      numericFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === "") row[field] = "0";
      });
    });
  }

  function addFmrDefaults() {
    const numericFields = [
      "fmr_inventory_count",
      "fmr_completed_count",
      "fmr_ongoing_count",
      "fmr_pipeline_count",
      "fmr_inventory_length_km",
      "fmr_avg_length_km",
      "fmr_influence_area_ha",
      "fmr_farmer_beneficiaries",
      "fmr_latest_year"
    ];

    Object.values(municipalData).forEach(row => {
      numericFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === "") row[field] = "0";
      });
    });
  }

  function addF2c2Defaults() {
    const numericFields = [
      "f2c2_cluster_count",
      "f2c2_area_ha",
      "f2c2_farmer_members",
      "f2c2_heads_count",
      "f2c2_cluster_leaders",
      "f2c2_with_eom_count",
      "f2c2_latest_year"
    ];

    Object.values(municipalData).forEach(row => {
      numericFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === "") row[field] = "0";
      });
      ["f2c2_commodities", "f2c2_banner_programs", "f2c2_enterprise_statuses"].forEach(field => {
        if (row[field] === undefined || row[field] === null) row[field] = "";
      });
    });
  }

  function addRsbaDefaults() {
    const numericFields = [
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
      "rsba_fca_gap_pct",
      "rsba_agriyouth_count",
      "rsba_arb_count",
      "rsba_organic_count",
      "rsba_with_imc_count",
      "rsba_imc_pct",
      "rsba_imc_gap_pct",
      "rsba_rice_share_pct",
      "rsba_corn_share_pct"
    ];

    Object.values(municipalData).forEach(row => {
      numericFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === "") row[field] = "0";
      });
      if (row.rsba_top_crop === undefined || row.rsba_top_crop === null) row.rsba_top_crop = "";
    });
  }

  function toFmrFacilityRows(rows) {
    return rows.map((row, index) => ({
      facility_id: `FMR${String(index + 1).padStart(4, "0")}`,
      facility_name: row.project_name || "Farm-to-Market Road",
      facility_type: "FMR",
      province: row.province,
      municipality: row.municipality,
      barangay: row.barangay,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
      capacity: row.length_km ? `${row.length_km} km` : "",
      service_area_ha: row.influence_area_ha || "",
      year_constructed: row.year_funded || "",
      farmer_beneficiaries: row.farmer_beneficiaries || "",
      remarks: row.district ? `District: ${row.district}` : ""
    }));
  }

  function toF2c2FacilityRows(rows) {
    return rows.map((row, index) => ({
      facility_id: `F2C2${String(index + 1).padStart(4, "0")}`,
      facility_name: row.cluster_name || "FCA/F2C2 Cluster",
      facility_type: "F2C2",
      province: row.province,
      municipality: row.municipality,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.enterprise_status || row.registration || "",
      capacity: row.area_ha ? `${row.area_ha} ha` : "",
      farmer_beneficiaries: row.farmer_members || "",
      year_constructed: row.year || "",
      commodity: row.commodity || "",
      banner_program: row.banner_program || "",
      existing_business_enterprise: row.existing_business_enterprise || "",
      proposed_business_enterprise: row.proposed_business_enterprise || "",
      remarks: row.with_eom ? `With EOM: ${row.with_eom}` : ""
    }));
  }

  function addPlansDerivedFields(row) {
    const numericFields = [
      "plans_projects_2025_count",
      "plans_projects_2025_budget",
      "plans_projects_2026_count",
      "plans_projects_2026_budget",
      "plans_projects_2027_count",
      "plans_projects_2027_budget",
      "plans_projects_total_count",
      "plans_projects_total_budget",
      "plans_projects_2027_physical_target",
      "plans_rice_2027_budget",
      "plans_corn_2027_budget",
      "plans_hvc_2027_budget",
      "plans_fmr_2027_count",
      "plans_fmr_2027_budget",
      "plans_fmr_2027_length_km",
      "plans_irrigation_2027_count",
      "plans_irrigation_2027_budget"
    ];

    numericFields.forEach(field => {
      if (row[field] === undefined || row[field] === null || row[field] === "") row[field] = "0";
    });

    const budget2027 = Utils.parseNumeric(row.plans_projects_2027_budget) || 0;
    const smallFarms = (Utils.parseNumeric(row.poor_rice_farmers) || 0) + (Utils.parseNumeric(row.poor_corn_farmers) || 0);
    const poverty = Utils.parseNumeric(row.poverty_2023) || 0;
    const elninoRisk = Utils.parseNumeric(row.elnino_rice_risk_score) || 0;
    const crvaRice = Utils.parseNumeric(row.crva_index_rice) || 0;
    const crvaCorn = Utils.parseNumeric(row.crva_index_corn) || 0;
    const budgetPerSmallFarm = smallFarms > 0 ? budget2027 / smallFarms : 0;

    const needScore =
      Math.min(1, poverty / 45) * 0.35 +
      Math.min(1, smallFarms / 2500) * 0.25 +
      Math.min(1, elninoRisk / 100) * 0.20 +
      Math.min(1, Math.max(crvaRice, crvaCorn)) * 0.20;
    const coverageGap = 1 - Math.min(1, budgetPerSmallFarm / 20);
    const needGapScore = Math.min(100, (needScore * 70) + (coverageGap * 30));

    row.plans_2027_budget_per_small_farm = budgetPerSmallFarm.toFixed(2);
    row.plans_2027_need_gap_score = needGapScore.toFixed(1);
    row.plans_2027_coverage_level = classifyPlanCoverage(budget2027, budgetPerSmallFarm, needGapScore);
  }

  function classifyPlanCoverage(budget, budgetPerSmallFarm, needGapScore) {
    if (budget <= 0) return "No Extracted 2027 Plan";
    if (needGapScore >= 65) return "Under-covered";
    if (budgetPerSmallFarm >= 20) return "Strong Allocation";
    return "Covered";
  }

  function addElNinoRiskDerivedFields(row) {
    const score = Utils.parseNumeric(row.pagasa_drought_score) || 0;
    const standing = Utils.parseNumeric(row.prism_standing_crop_area) || 0;
    const riceArea = Utils.parseNumeric(row.prism_rice_area_2026s1) || Utils.parseNumeric(row.rice_area_2025) || 0;
    const poverty = Utils.parseNumeric(row.poverty_2023) || 0;
    const poorRice = Utils.parseNumeric(row.poor_rice_farmers) || 0;
    const irrigation = Utils.parseNumeric(row.irrigated_area) || 0;
    const irrigationGap = riceArea > 0 ? Math.max(0, 1 - (irrigation / riceArea)) : 0;

    const exposureArea = standing * (score / 3);
    const socialFactor = Math.min(1, (poverty / 50) * 0.55 + (poorRice / 2000) * 0.45);
    const riskScore = Math.min(100, ((score / 3) * 45) + (standing / 5000 * 25) + (irrigationGap * 20) + (socialFactor * 10));

    row.elnino_prism_standing_exposed_area = exposureArea.toFixed(2);
    row.elnino_irrigation_gap_pct = (irrigationGap * 100).toFixed(1);
    row.elnino_rice_risk_score = riskScore.toFixed(1);
    row.elnino_rice_risk_class = classifyElNinoRisk(riskScore);
  }

  function classifyElNinoRisk(score) {
    if (score >= 70) return "Very High";
    if (score >= 50) return "High";
    if (score >= 30) return "Moderate";
    if (score > 0) return "Low";
    return "Not Affected";
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

  function getBarangayRows() {
    if (!barangayGeoJSON) return [];
    return barangayGeoJSON.features.map(f => f.properties);
  }

  function getMismatchReport() {
    return Utils.arrayToCSV(joinMismatches);
  }

  function getGeoJSON(viewType) {
    if (viewType === "barangay" && barangayGeoJSON) return barangayGeoJSON;
    if (viewType === "district" && districtGeoJSON) return districtGeoJSON;
    if (viewType === "province" && provinceGeoJSON) return provinceGeoJSON;
    return municipalGeoJSON;
  }

  return {
    loadAll,
    getMunicipalRows,
    getBarangayRows,
    getMismatchReport,
    getGeoJSON,
    get barangayGeoJSON() { return barangayGeoJSON; },
    get municipalGeoJSON() { return municipalGeoJSON; },
    get barangayFarmData() { return barangayFarmData; },
    get prismData() { return prismData; },
    get droughtOutlookData() { return droughtOutlookData; },
    get plansProjectsData() { return plansProjectsData; },
    get soilFertilityData() { return soilFertilityData; },
    get fmrProjectsData() { return fmrProjectsData; },
    get fmrSummaryData() { return fmrSummaryData; },
    get f2c2ClustersData() { return f2c2ClustersData; },
    get f2c2SummaryData() { return f2c2SummaryData; },
    get rsbaSummaryData() { return rsbaSummaryData; },
    get facilitiesData() { return facilitiesData; }
  };
})();
