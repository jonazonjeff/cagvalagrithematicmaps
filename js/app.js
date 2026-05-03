// ============================================================
// app.js — Main Application Controller
// ============================================================

const App = (() => {
  let map = null;
  let appData = null;
  let currentView = "municipality"; // municipality | district | province
  let currentIndicator = "population";
  let currentVizStyle = "choropleth";
  let currentGeoJSON = null;
  let currentRows = [];
  let currentCategory = "Demographics";
  let sidebarCollapsed = false;

  // Compare/bivariate state
  let compareFieldA = "poverty_2023";
  let compareFieldB = "poor_rice_farmers";

  // Ranked/priority state
  let rankedN = 10;
  let rankedDir = "top";
  let priorityModel = "rice";
  let facilitiesLoaded = false;

  // ============================================================
  // INIT
  // ============================================================
  async function init() {
    buildUI();
    initMap();

    showLoadingOverlay(true);
    try {
      appData = await DataLoader.loadAll();
    } catch (e) {
      console.error("Data load failed:", e);
      Utils.showToast("Failed to load some data files. Using sample data.", "warning");
    }
    showLoadingOverlay(false);

    setView("municipality");
    renderCurrentView();
    bindEvents();

    // Show sample notice if needed
    if (appData?.municipalGeoJSON?.features?.some(f => f.properties._sample)) {
      document.getElementById("sample-notice")?.classList.remove("hidden");
    }
  }

  // ============================================================
  // MAP INITIALIZATION
  // ============================================================
  function initMap() {
    map = L.map("map", {
      center: APP_CONFIG.mapCenter,
      zoom: APP_CONFIG.mapZoom,
      zoomControl: true
    });

    MapLayers.init(map);
    Visualizations.init(map);
    if (typeof WeatherOverlay !== "undefined") WeatherOverlay.init(map);

    // Scale control
    L.control.scale({ imperial: false }).addTo(map);
  }

  // ============================================================
  // RENDER CURRENT VIEW
  // ============================================================
  function renderCurrentView() {
    if (!appData) return;

    // Clear aggregate labels before re-render
    MapLayers.clearAggregateLabels();

    // Get correct GeoJSON + rows
    if (currentView === "municipality") {
      currentGeoJSON = appData.municipalGeoJSON;
      currentRows = DataLoader.getMunicipalRows();
    } else if (currentView === "district" && appData.districtGeoJSON) {
      const agg = Aggregation.aggregateBy(DataLoader.getMunicipalRows(), "district");
      currentGeoJSON = Aggregation.joinAggToGeoJSON(appData.districtGeoJSON, agg, "district");
      currentRows = Object.values(agg);
    } else if (currentView === "province" && appData.provinceGeoJSON) {
      const agg = Aggregation.aggregateBy(DataLoader.getMunicipalRows(), "province");
      currentGeoJSON = Aggregation.joinAggToGeoJSON(appData.provinceGeoJSON, agg, "province");
      currentRows = Object.values(agg);
    } else if (currentView === "district" || currentView === "province") {
      // Fallback: no separate GeoJSON file — aggregate municipal polygons visually
      const groupField = currentView === "district" ? "district" : "province";
      const agg = Aggregation.aggregateBy(DataLoader.getMunicipalRows(), groupField);
      currentGeoJSON = appData.municipalGeoJSON;
      currentRows = Object.values(agg);
      Utils.showToast(`No ${groupField} boundary file found. Showing municipal shapes with ${groupField} aggregates.`, "info");
    } else {
      currentGeoJSON = appData.municipalGeoJSON;
      currentRows = DataLoader.getMunicipalRows();
    }

    applyVizStyle();
    updateDashboard();
    Charts.updateAll(currentRows, currentIndicator, { n: rankedN, direction: rankedDir });
    updatePlanningInsights();

    // Aggregate labels for district / province views
    if (currentView !== "municipality") {
      MapLayers.renderAggregateLabels(currentGeoJSON, currentIndicator, currentView);
    }

    // Load facility point data once on first render
    if (!facilitiesLoaded && appData.facilitiesData) {
      MapLayers.loadFacilities(appData.facilitiesData, appData.municipalGeoJSON);
      facilitiesLoaded = true;
    }
  }

  // ============================================================
  // APPLY VISUALIZATION STYLE
  // ============================================================
  function applyVizStyle() {
    if (!currentGeoJSON) return;

    switch (currentVizStyle) {
      case "choropleth":
        Visualizations.renderChoropleth(currentGeoJSON, currentIndicator, { style: "choropleth" });
        break;

      case "gradient":
        Visualizations.renderChoropleth(currentGeoJSON, currentIndicator, { style: "gradient" });
        break;

      case "proportional":
        Visualizations.renderProportional(currentGeoJSON, currentIndicator);
        break;

      case "bivariate":
        Visualizations.renderBivariate(currentGeoJSON, compareFieldA, compareFieldB);
        updateBivariateControls(true);
        break;

      case "dominant_crop":
        Visualizations.renderDominantCrop(currentGeoJSON);
        break;

      case "pie_symbols": {
        const isRiceCorn = ["Rice", "Corn"].includes(currentCategory);
        if (isRiceCorn) {
          Visualizations.renderPieSymbols(
            currentGeoJSON,
            ["rice_production_2023", "corn_production_2023"],
            ["Rice Production", "Corn Production"],
            ["#4CAF50", "#FF9800"]
          );
        } else if (currentCategory === "Malnutrition") {
          Visualizations.renderPieSymbols(
            currentGeoJSON,
            ["stunting", "underweight", "wasting", "obese"],
            ["Stunting", "Underweight", "Wasting", "Obese"],
            ["#e74c3c", "#e67e22", "#f39c12", "#9b59b6"]
          );
        } else {
          Visualizations.renderPieSymbols(
            currentGeoJSON,
            ["poor_rice_farmers", "poor_corn_farmers"],
            ["Poor Rice Farmers", "Poor Corn Farmers"],
            ["#4CAF50", "#FF9800"]
          );
        }
        break;
      }

      case "bar_symbols": {
        const povertyFields = ["poverty_2018", "poverty_2021", "poverty_2023"];
        Visualizations.renderBarSymbols(
          currentGeoJSON,
          povertyFields,
          ["Poverty 2018", "Poverty 2021", "Poverty 2023"],
          ["#4472C4", "#ED7D31", "#A9D18E"]
        );
        break;
      }

      case "ranked":
        Visualizations.renderRanked(currentGeoJSON, currentIndicator, rankedN, rankedDir);
        updateRankedControls(true);
        break;

      case "deviation":
        Visualizations.renderDeviation(currentGeoJSON, currentIndicator);
        break;

      case "ratio":
        Visualizations.renderRatio(currentGeoJSON, compareFieldA, compareFieldB);
        updateBivariateControls(true);
        break;

      case "priority":
        const result = Visualizations.renderPriority(currentGeoJSON, priorityModel);
        if (result?.scored) {
          currentRows = result.scored;
          updateDashboard();
        }
        updatePriorityControls(true);
        break;

      default:
        Visualizations.renderChoropleth(currentGeoJSON, currentIndicator);
    }
  }

  // ============================================================
  // DASHBOARD SUMMARY CARDS
  // ============================================================
  function updateDashboard() {
    const rows = currentRows.filter(r => r._joined !== false);
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const totalPop = rows.reduce((s, r) => s + (Utils.parseNumeric(r.population) || 0), 0);
    const avgPoverty = weightedAvg(rows, "poverty_2023", "population");
    const totalPoorRice = rows.reduce((s, r) => s + (Utils.parseNumeric(r.poor_rice_farmers) || 0), 0);
    const totalPoorCorn = rows.reduce((s, r) => s + (Utils.parseNumeric(r.poor_corn_farmers) || 0), 0);
    const totalRiceProd = rows.reduce((s, r) => s + (Utils.parseNumeric(r.rice_production_2023) || 0), 0);
    const totalCornProd = rows.reduce((s, r) => s + (Utils.parseNumeric(r.corn_production_2023) || 0), 0);
    const totalRiceArea = rows.reduce((s, r) => s + (Utils.parseNumeric(r.rice_area_2023) || 0), 0);
    const totalCornArea = rows.reduce((s, r) => s + (Utils.parseNumeric(r.corn_area_2023) || 0), 0);
    const riceYield = totalRiceArea > 0 ? totalRiceProd / totalRiceArea : null;
    const cornYield = totalCornArea > 0 ? totalCornProd / totalCornArea : null;
    const totalIrr = rows.reduce((s, r) => s + (Utils.parseNumeric(r.irrigated_area) || 0), 0);
    const pestCount = rows.filter(r => r.pest_disease_occurrence === "High" || r.pest_disease_occurrence === "Moderate").length;
    const asfCount = rows.filter(r => r.asf_status === "Affected" || r.asf_status === "At-risk").length;
    const rpcCount = rows.reduce((s, r) => s + (Utils.parseNumeric(r.rpc_site) || 0), 0);

    set("stat-pop", Utils.formatNumber(totalPop));
    set("stat-poverty", avgPoverty !== null ? Utils.formatPct(avgPoverty) : "N/A");
    set("stat-poor-rice", Utils.formatNumber(totalPoorRice));
    set("stat-poor-corn", Utils.formatNumber(totalPoorCorn));
    set("stat-rice-prod", Utils.formatNumber(totalRiceProd) + " MT");
    set("stat-corn-prod", Utils.formatNumber(totalCornProd) + " MT");
    set("stat-rice-area", Utils.formatNumber(totalRiceArea) + " ha");
    set("stat-corn-area", Utils.formatNumber(totalCornArea) + " ha");
    set("stat-rice-yield", riceYield !== null ? Utils.formatNumber(riceYield, 2) + " MT/ha" : "N/A");
    set("stat-corn-yield", cornYield !== null ? Utils.formatNumber(cornYield, 2) + " MT/ha" : "N/A");
    set("stat-irrigated", Utils.formatNumber(totalIrr) + " ha");
    set("stat-pest", pestCount);
    set("stat-asf", asfCount);
    set("stat-rpc", rpcCount);
    set("stat-mun-count", rows.length);
  }

  function weightedAvg(rows, field, weightField) {
    let weightedSum = 0, totalWeight = 0;
    rows.forEach(r => {
      const val = Utils.parseNumeric(r[field]);
      const wt = Utils.parseNumeric(r[weightField]);
      if (val !== null && wt !== null && wt > 0) {
        weightedSum += val * wt;
        totalWeight += wt;
      }
    });
    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  // ============================================================
  // PLANNING INSIGHTS PANEL
  // ============================================================
  function updatePlanningInsights() {
    const panel = document.getElementById("insights-panel");
    if (!panel) return;

    const highPriority = currentRows.filter(r => {
      return PLANNING_INSIGHTS.some(rule => {
        try { return rule.condition(r); } catch(e) { return false; }
      });
    });

    if (highPriority.length === 0) {
      panel.innerHTML = `<p class="no-data">Select a municipality on the map for planning insights.</p>`;
      return;
    }

    let html = "";
    highPriority.slice(0, 5).forEach(r => {
      const name = r.municipality || r.NAME || r.province || "Area";
      const triggered = PLANNING_INSIGHTS.filter(rule => {
        try { return rule.condition(r); } catch(e) { return false; }
      });

      html += `<div class="insight-card insight-${triggered[0]?.level || 'info'}">
        <div class="insight-area">${name}</div>
        ${triggered.map(t => `<div class="insight-item">${t.icon} ${t.insight}</div>`).join("")}
      </div>`;
    });

    panel.innerHTML = html;
  }

  // ============================================================
  // UI BUILDING
  // ============================================================
  function buildUI() {
    buildCategorySelector();
    buildIndicatorSelector();
    buildVizStyleSelector();
    buildBasemapSelector();
    buildBivariateControls();
    buildRankedControls();
    buildPriorityControls();
    buildLayerPanel();
  }

  function buildCategorySelector() {
    const sel = document.getElementById("category-select");
    if (!sel) return;
    sel.innerHTML = CATEGORIES.filter(c => c !== "Planning Priority")
      .map(c => `<option value="${c}" ${c === currentCategory ? "selected" : ""}>${c}</option>`)
      .join("");
  }

  function buildIndicatorSelector() {
    const sel = document.getElementById("indicator-select");
    if (!sel) return;
    const filtered = Object.entries(INDICATOR_CONFIG).filter(([, cfg]) => cfg.category === currentCategory);
    sel.innerHTML = filtered.map(([key, cfg]) =>
      `<option value="${key}" ${key === currentIndicator ? "selected" : ""}>${cfg.label}</option>`
    ).join("");
    if (filtered.length > 0 && !filtered.find(([k]) => k === currentIndicator)) {
      currentIndicator = filtered[0][0];
    }
  }

  function buildVizStyleSelector() {
    const sel = document.getElementById("viz-select");
    if (!sel) return;
    sel.innerHTML = VIZ_STYLES.map(s =>
      `<option value="${s.id}" ${s.id === currentVizStyle ? "selected" : ""}>${s.label}</option>`
    ).join("");
  }

  function buildBasemapSelector() {
    const container = document.getElementById("basemap-selector");
    if (!container) return;
    container.innerHTML = Object.entries(BASEMAPS).map(([key, cfg]) =>
      `<button class="basemap-btn ${key === "cartoLight" ? "active" : ""}" data-basemap="${key}">${cfg.label}</button>`
    ).join("");
  }

  function buildBivariateControls() {
    const container = document.getElementById("bivariate-controls");
    if (!container) return;
    const opts = Object.entries(INDICATOR_CONFIG)
      .filter(([, c]) => c.type === "numeric" || c.type === "percentage")
      .map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("");
    container.innerHTML = `
      <label>Indicator A</label>
      <select id="compare-a">${opts}</select>
      <label>Indicator B</label>
      <select id="compare-b">${opts}</select>`;
    const selA = document.getElementById("compare-a");
    const selB = document.getElementById("compare-b");
    if (selA) selA.value = compareFieldA;
    if (selB) selB.value = compareFieldB;
  }

  function buildRankedControls() {
    const container = document.getElementById("ranked-controls");
    if (!container) return;
    container.innerHTML = `
      <label>Show</label>
      <select id="ranked-dir">
        <option value="top">Top</option>
        <option value="bottom">Bottom</option>
      </select>
      <select id="ranked-n">
        <option value="5">5</option>
        <option value="10" selected>10</option>
        <option value="20">20</option>
      </select>
      <label>municipalities</label>`;
  }

  function buildPriorityControls() {
    const container = document.getElementById("priority-controls");
    if (!container) return;
    container.innerHTML = `
      <label>Priority Model</label>
      <select id="priority-model">
        ${Object.entries(PRIORITY_MODELS).map(([k, m]) =>
          `<option value="${k}" ${k === priorityModel ? "selected" : ""}>${m.label}</option>`
        ).join("")}
      </select>`;
  }

  // ============================================================
  // FACILITY LAYER PANEL — builds categorized toggles from config
  // ============================================================
  function buildLayerPanel() {
    const container = document.getElementById("facility-layer-panel");
    if (!container) return;

    let html = "";
    Object.entries(FACILITY_CATEGORIES).forEach(([catKey, cat]) => {
      const typeCount = Object.keys(cat.types).length;
      html += `
        <div class="layer-category">
          <div class="layer-cat-header">
            <input type="checkbox" id="toggle-cat-${catKey}" class="cat-toggle" data-cat="${catKey}" />
            <label for="toggle-cat-${catKey}" class="layer-cat-label" style="--cat-color:${cat.groupColor}">
              ${cat.label}
              <span class="layer-cat-count">${typeCount}</span>
            </label>
          </div>
          <div class="layer-types" id="layer-types-${catKey}">
            ${Object.entries(cat.types).map(([typeKey, typeCfg]) => `
              <div class="layer-type-row">
                <input type="checkbox" id="toggle-type-${typeKey}" class="type-toggle"
                  data-type="${typeKey}" data-cat="${catKey}" />
                <label for="toggle-type-${typeKey}" class="layer-type-label">
                  <span class="type-icon" style="background:${typeCfg.color}">${typeCfg.icon}</span>
                  ${typeCfg.label}
                </label>
              </div>`).join("")}
          </div>
        </div>`;
    });

    container.innerHTML = html;
  }

  function updateBivariateControls(show) {
    const el = document.getElementById("bivariate-controls");
    if (el) el.style.display = show ? "block" : "none";
  }

  function updateRankedControls(show) {
    const el = document.getElementById("ranked-controls");
    if (el) el.style.display = show ? "block" : "none";
  }

  function updatePriorityControls(show) {
    const el = document.getElementById("priority-controls");
    if (el) el.style.display = show ? "block" : "none";
  }

  // ============================================================
  // VIEW SWITCHING
  // ============================================================
  function setView(viewType) {
    currentView = viewType;
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.view === viewType);
    });
  }

  // ============================================================
  // EVENT BINDING
  // ============================================================
  function bindEvents() {
    // View buttons
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        setView(btn.dataset.view);
        renderCurrentView();
      });
    });

    // Category select
    const catSel = document.getElementById("category-select");
    if (catSel) catSel.addEventListener("change", () => {
      currentCategory = catSel.value;
      buildIndicatorSelector();
      const indSel = document.getElementById("indicator-select");
      if (indSel) currentIndicator = indSel.value;
      renderCurrentView();
    });

    // Indicator select
    const indSel = document.getElementById("indicator-select");
    if (indSel) indSel.addEventListener("change", () => {
      currentIndicator = indSel.value;
      renderCurrentView();
      // Refresh aggregate labels when indicator changes
      if (currentView !== "municipality") {
        MapLayers.renderAggregateLabels(currentGeoJSON, currentIndicator, currentView);
      }
    });

    // Viz style select
    const vizSel = document.getElementById("viz-select");
    if (vizSel) vizSel.addEventListener("change", () => {
      currentVizStyle = vizSel.value;
      updateBivariateControls(["bivariate", "ratio"].includes(currentVizStyle));
      updateRankedControls(currentVizStyle === "ranked");
      updatePriorityControls(currentVizStyle === "priority");
      renderCurrentView();
    });

    // Basemap buttons
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("basemap-btn")) {
        MapLayers.switchBasemap(e.target.dataset.basemap);
      }
    });

    // Compare A/B
    document.addEventListener("change", (e) => {
      if (e.target.id === "compare-a") { compareFieldA = e.target.value; renderCurrentView(); }
      if (e.target.id === "compare-b") { compareFieldB = e.target.value; renderCurrentView(); }
      if (e.target.id === "ranked-n") { rankedN = parseInt(e.target.value); renderCurrentView(); }
      if (e.target.id === "ranked-dir") { rankedDir = e.target.value; renderCurrentView(); }
      if (e.target.id === "priority-model") { priorityModel = e.target.value; renderCurrentView(); }
    });

    // Search
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", Utils.debounce((e) => {
        const query = e.target.value.trim();
        if (query.length < 2) return;
        const result = MapLayers.zoomToName(query, currentGeoJSON);
        if (!result) Utils.showToast(`"${query}" not found`, "info");
      }, 400));
    }

    // Reset
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      map.setView(APP_CONFIG.mapCenter, APP_CONFIG.mapZoom);
      renderCurrentView();
    });

    // Fit to region
    const fitBtn = document.getElementById("fit-btn");
    if (fitBtn) fitBtn.addEventListener("click", () => {
      MapLayers.fitToGeoJSON(currentGeoJSON);
    });

    // Export CSV (header button)
    const exportCsvBtn = document.getElementById("export-csv");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", () => {
      const csv = Utils.arrayToCSV(currentRows);
      Utils.downloadCSV(csv, `cagayan_valley_${currentView}_${currentIndicator}.csv`);
      Utils.showToast("CSV exported successfully.", "success");
    });

    // Export CSV (sidebar button)
    const exportCsvSidebar = document.getElementById("export-csv-sidebar");
    if (exportCsvSidebar) exportCsvSidebar.addEventListener("click", () => {
      const csv = Utils.arrayToCSV(currentRows);
      Utils.downloadCSV(csv, `cagayan_valley_${currentView}_${currentIndicator}.csv`);
      Utils.showToast("CSV exported successfully.", "success");
    });

    // Export PNG
    const exportPngBtn = document.getElementById("export-png");
    if (exportPngBtn) exportPngBtn.addEventListener("click", Utils.downloadMapPNG);

    // Mismatch report
    const mismatchBtn = document.getElementById("download-mismatch");
    if (mismatchBtn) mismatchBtn.addEventListener("click", () => {
      const csv = DataLoader.getMismatchReport();
      if (!csv) { Utils.showToast("No mismatches found!", "success"); return; }
      Utils.downloadCSV(csv, "join_mismatch_report.csv");
    });

    // ---- Facility Layer Panel — category & type toggles ----
    document.addEventListener("change", (e) => {
      // Category-level toggle
      if (e.target.classList.contains("cat-toggle")) {
        const catKey = e.target.dataset.cat;
        MapLayers.setCategoryVisibility(catKey, e.target.checked);
      }
      // Type-level toggle
      if (e.target.classList.contains("type-toggle")) {
        const typeKey = e.target.dataset.type;
        const catKey  = e.target.dataset.cat;
        MapLayers.setTypeVisibility(typeKey, e.target.checked);
        // Update parent category checkbox state (indeterminate if mixed)
        syncCategoryCheckbox(catKey);
      }
    });

    // Chart tabs
    document.querySelectorAll(".chart-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".chart-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".chart-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.chart;
        document.getElementById(`panel-${target}`)?.classList.add("active");

        // Re-render selected chart
        if (target === "poverty") Charts.renderPovertyTrend(currentRows);
        if (target === "production") Charts.renderProductionComparison(currentRows, "rice");
        if (target === "scatter") Charts.renderScatter(currentRows, "poverty_2023", currentIndicator);
      });
    });

    // Climate Info Panel toggle
    const climateBtn = document.getElementById("btn-climate-panel");
    if (climateBtn) climateBtn.addEventListener("click", () => {
      if (typeof ClimatePanel !== "undefined") {
        ClimatePanel.togglePanel();
      }
    });

    // Sidebar toggle
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle) sidebarToggle.addEventListener("click", () => {
      const sidebar = document.getElementById("sidebar");
      sidebarCollapsed = !sidebarCollapsed;
      sidebar?.classList.toggle("collapsed", sidebarCollapsed);
      sidebarToggle.textContent = sidebarCollapsed ? "▶" : "◀";
    });
  }

  // Sync category checkbox to reflect mixed/all/none state of its type children
  function syncCategoryCheckbox(catKey) {
    const cat = FACILITY_CATEGORIES[catKey];
    if (!cat) return;
    const typeKeys = Object.keys(cat.types);
    const checkedCount = typeKeys.filter(t => {
      const cb = document.getElementById(`toggle-type-${t}`);
      return cb && cb.checked;
    }).length;
    const catCb = document.getElementById(`toggle-cat-${catKey}`);
    if (!catCb) return;
    catCb.indeterminate = checkedCount > 0 && checkedCount < typeKeys.length;
    catCb.checked = checkedCount === typeKeys.length;
  }

  // ============================================================
  // LOADING OVERLAY
  // ============================================================
  function showLoadingOverlay(show) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = show ? "flex" : "none";
  }

  return { init };
})();

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", App.init);
