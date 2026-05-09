const PlansDashboard = (() => {
  const VERSION = "20260509-darkdefault";
  const DETAIL_URL = `data/plans_projects_2025_2027_details.csv?v=${VERSION}`;
  const METADATA_URL = `data/plans_projects_metadata.json?v=${VERSION}`;

  const COMMODITIES = [
    { key: "all", label: "All" },
    { key: "rice", label: "Rice", programs: ["Rice Program"] },
    { key: "corn", label: "Corn", programs: ["Corn Program"] },
    { key: "hvc", label: "High Value Crops", programs: ["High Value Crops"] },
    { key: "nupap", label: "NUPAP", programs: ["NUPAP"] },
    { key: "livestock", label: "Livestock", programs: ["LIVESTOCK"] },
    { key: "fmr", label: "FMR", programs: ["Farm-to-Market Roads"] },
    { key: "prdp", label: "PRDP", programs: ["PRDP"] },
    { key: "4ks", label: "4Ks", programs: ["4Ks"] },
    { key: "saad", label: "SAAD", programs: ["SAAD"] },
    { key: "mcra", label: "MCRA", programs: ["MCRA"] },
    { key: "nshp", label: "NSHP", programs: ["National Soil Health"] },
    { key: "halal", label: "HALAL", programs: ["HALAL"] },
    { key: "other", label: "Other", programs: ["OAP", "COLD STORAGE", "2024-2026"] }
  ];

  const YEAR_LABELS = {
    "2025": "2025 accomplishment",
    "2026": "2026 ongoing",
    "2027": "2027 proposal"
  };

  let rows = [];
  let activeYear = "2027";
  let activeCommodity = "all";
  let provinceFilter = "all";
  let districtFilter = "all";
  let municipalityFilter = "all";
  let chartType = "horizontal-bar";
  let themeMode = "dark";
  let searchTerm = "";
  let metadata = null;
  let charts = {};

  const currency = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

  function init() {
    document.body.dataset.theme = themeMode;
    bindEvents();
    loadMetadata();
    Papa.parse(DETAIL_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: result => {
        rows = result.data.map(normalizeRow);
        buildProvinceFilter();
        updateGeographyFilters();
        buildCommodityTabs();
        update();
      },
      error: err => {
        document.getElementById("planning-notes").innerHTML =
          `<div class="note danger">Planning data could not be loaded: ${escapeHTML(err.message || err)}</div>`;
      }
    });
  }

  async function loadMetadata() {
    try {
      const res = await fetch(METADATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      metadata = await res.json();
      renderMetadata();
    } catch (err) {
      document.getElementById("source-summary").innerHTML =
        `<div class="source-line source-warn">Source metadata unavailable.</div>`;
    }
  }

  function renderMetadata() {
    if (!metadata) return;
    const generated = formatTimestamp(metadata.generated_at);
    const latest = formatTimestamp(metadata.latest_source_file_modified_at);
    const link = metadata.source_folder_url
      ? `<a href="${escapeHTML(metadata.source_folder_url)}" target="_blank" rel="noopener">Google Drive folder</a>`
      : "Google Drive folder";

    document.getElementById("source-summary").innerHTML = `
      <div class="source-line"><strong>${escapeHTML(metadata.source || "Planning workbooks")}</strong></div>
      <div class="source-line">Dashboard data refreshed: ${escapeHTML(generated)}</div>
      <div class="source-line">Latest downloaded workbook timestamp: ${escapeHTML(latest)}</div>
      <div class="source-line">${formatNumber(metadata.source_file_count || 0)} workbooks, ${formatNumber(metadata.detail_rows || 0)} records</div>
      <div class="source-line">${link}</div>
    `;
  }

  function normalizeRow(row) {
    const districtInfo = normalizeDistrict(row.province, row.district);
    const displayMunicipality = row.municipality ||
      (districtInfo.key ? `${districtInfo.label} districtwide` : `${row.province} provincewide`);
    return {
      ...row,
      year: String(row.year || "").trim(),
      districtKey: districtInfo.key,
      displayDistrict: districtInfo.label,
      displayMunicipality,
      budgetValue: parseNumber(row.budget),
      lengthValue: parseNumber(row.length_km),
      physicalValue: parseNumber(row.physical_target),
      searchText: [
        row.province, row.municipality, row.program, row.activity,
        row.district, row.unit, row.source_note, row.source_file, row.sheet
      ].join(" ").toLowerCase()
    };
  }

  function parseNumber(value) {
    const n = parseFloat(String(value || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function bindEvents() {
    document.getElementById("year-tabs").addEventListener("click", event => {
      const btn = event.target.closest("button[data-year]");
      if (!btn) return;
      activeYear = btn.dataset.year;
      setActiveButton("#year-tabs button", btn);
      update();
    });

    document.getElementById("province-filter").addEventListener("change", event => {
      provinceFilter = event.target.value;
      districtFilter = "all";
      municipalityFilter = "all";
      updateGeographyFilters();
      update();
    });

    document.getElementById("district-filter").addEventListener("change", event => {
      districtFilter = event.target.value;
      municipalityFilter = "all";
      updateMunicipalityFilter();
      update();
    });

    document.getElementById("municipality-filter").addEventListener("change", event => {
      municipalityFilter = event.target.value;
      update();
    });

    document.getElementById("search-filter").addEventListener("input", event => {
      searchTerm = event.target.value.trim().toLowerCase();
      update();
    });

    document.getElementById("chart-type").addEventListener("change", event => {
      chartType = event.target.value;
      update();
    });

    document.querySelectorAll("[data-theme-mode]").forEach(button => {
      button.addEventListener("click", event => {
        themeMode = event.currentTarget.dataset.themeMode || "dark";
        document.querySelectorAll("[data-theme-mode]").forEach(btn => {
          btn.classList.toggle("active", btn === event.currentTarget);
        });
        document.body.dataset.theme = themeMode;
        update();
      });
    });

    const activeThemeButton = document.querySelector(`[data-theme-mode="${themeMode}"]`);
    if (activeThemeButton) {
      document.querySelectorAll("[data-theme-mode]").forEach(btn => {
        btn.classList.toggle("active", btn === activeThemeButton);
      });
      document.body.dataset.theme = themeMode;
    }

    document.getElementById("export-plans").addEventListener("click", () => {
      const csv = toCSV(filteredRows());
      downloadCSV(csv, `agriplan_${activeCommodity}_${activeYear}.csv`);
    });
  }

  function buildProvinceFilter() {
    const select = document.getElementById("province-filter");
    const provinces = [...new Set(rows.map(row => row.province).filter(Boolean))].sort();
    select.innerHTML = `<option value="all">All Provinces</option>` +
      provinces.map(province => `<option value="${escapeHTML(province)}">${escapeHTML(province)}</option>`).join("");
  }

  function updateGeographyFilters() {
    updateDistrictFilter();
    updateMunicipalityFilter();
  }

  function updateDistrictFilter() {
    const select = document.getElementById("district-filter");
    const districtMap = new Map();
    rows
      .filter(row => provinceFilter === "all" || row.province === provinceFilter)
      .forEach(row => {
        if (!row.districtKey) return;
        districtMap.set(row.districtKey, row.displayDistrict);
      });
    const districts = [...districtMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => compareDistricts(a.key, b.key));

    if (districtFilter !== "all" && !districtMap.has(districtFilter)) districtFilter = "all";
    select.innerHTML = `<option value="all">All Districts</option>` +
      districts.map(district =>
        `<option value="${escapeHTML(district.key)}" ${district.key === districtFilter ? "selected" : ""}>${escapeHTML(district.label)}</option>`
      ).join("");
    select.value = districtFilter;
  }

  function updateMunicipalityFilter() {
    const select = document.getElementById("municipality-filter");
    const municipalities = [...new Set(rows
      .filter(row => provinceFilter === "all" || row.province === provinceFilter)
      .filter(row => districtFilter === "all" || row.districtKey === districtFilter)
      .filter(row => row.municipality)
      .map(row => row.municipality))]
      .sort((a, b) => a.localeCompare(b));

    if (municipalityFilter !== "all" && !municipalities.includes(municipalityFilter)) municipalityFilter = "all";
    select.innerHTML = `<option value="all">All Municipalities</option>` +
      municipalities.map(municipality =>
        `<option value="${escapeHTML(municipality)}" ${municipality === municipalityFilter ? "selected" : ""}>${escapeHTML(municipality)}</option>`
      ).join("");
    select.value = municipalityFilter;
  }

  function compareDistricts(a, b) {
    const av = districtOrder(a.split("|").pop());
    const bv = districtOrder(b.split("|").pop());
    return av === bv ? a.localeCompare(b) : av - bv;
  }

  function normalizeDistrict(province, district) {
    const raw = String(district || "").trim();
    if (!raw) return { key: "", label: "" };

    const normalizedRaw = raw.toUpperCase().replace(/DISTRICT/g, "").trim();
    let code = "";
    if (normalizedRaw.includes("LONE")) {
      code = "LONE";
    } else {
      const roman = normalizedRaw.match(/\b(I|II|III|IV|V|VI)\b/);
      const number = normalizedRaw.match(/\d+/);
      if (number) code = number[0];
      if (roman) code = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6" }[roman[1]];
    }
    if (!code) code = normalizedRaw.replace(/\s+/g, "");

    const provinceName = province || "Unspecified";
    const key = `${provinceName}|${code}`;
    const label = code === "LONE" ? `${provinceName} - Lone District` : `${provinceName} - District ${code}`;
    return { key, label };
  }

  function districtOrder(value) {
    const text = String(value || "").toUpperCase();
    if (text.includes("LONE")) return 0;
    const roman = text.match(/\b(I|II|III|IV|V|VI)\b/);
    if (roman) return { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }[roman[1]];
    const number = text.match(/\d+/);
    return number ? Number(number[0]) : 99;
  }

  function formatDistrict(value) {
    const text = String(value || "").trim();
    if (!text) return "Unspecified";
    if (/^lone$/i.test(text) || /^lone district$/i.test(text)) return "Lone District";
    if (/district/i.test(text)) return text;
    return `District ${text}`;
  }

  function districtLabel(row) {
    return row.displayDistrict || `${row.province || "Unspecified"} - Unspecified District`;
  }

  function buildCommodityTabs() {
    const tabs = document.getElementById("commodity-tabs");
    tabs.innerHTML = COMMODITIES.map(item =>
      `<button data-commodity="${item.key}" class="${item.key === activeCommodity ? "active" : ""}">${item.label}</button>`
    ).join("");

    tabs.addEventListener("click", event => {
      const btn = event.target.closest("button[data-commodity]");
      if (!btn) return;
      activeCommodity = btn.dataset.commodity;
      setActiveButton("#commodity-tabs button", btn);
      update();
    });
  }

  function setActiveButton(selector, activeButton) {
    document.querySelectorAll(selector).forEach(btn => btn.classList.toggle("active", btn === activeButton));
  }

  function filteredRows(options = {}) {
    const year = options.year || activeYear;
    const commodity = options.commodity || activeCommodity;
    const commodityDef = COMMODITIES.find(item => item.key === commodity);
    const programs = commodityDef?.programs || null;

    return rows.filter(row => {
      if (year !== "all" && row.year !== year) return false;
      if (provinceFilter !== "all" && row.province !== provinceFilter) return false;
      if (districtFilter !== "all" && row.districtKey !== districtFilter) return false;
      if (municipalityFilter !== "all" && row.municipality !== municipalityFilter) return false;
      if (programs && !programs.includes(row.program)) return false;
      if (searchTerm && !row.searchText.includes(searchTerm)) return false;
      return true;
    });
  }

  function update() {
    const data = filteredRows();
    updateKpis(data);
    updateLens(data);
    updateCharts(data);
    updateNotes(data);
    updateTable(data);
  }

  function updateKpis(data) {
    const municipalities = new Set(data.filter(row => row.municipality).map(row => `${row.province}|${row.municipality}`));
    setText("kpi-items", formatNumber(data.length));
    setText("kpi-budget", formatNumber(sum(data, "budgetValue")));
    setText("kpi-municipalities", formatNumber(municipalities.size));
    setText("kpi-length", formatDecimal(sum(data, "lengthValue")));
  }

  function updateLens(data) {
    const commodity = COMMODITIES.find(item => item.key === activeCommodity)?.label || "All";
    const budget = sum(data, "budgetValue");
    const provinceText = provinceFilter === "all" ? "all provinces" : provinceFilter;
    const districtText = districtFilter === "all" ? "all districts" : (rows.find(row => row.districtKey === districtFilter)?.displayDistrict || districtFilter);
    const municipalityText = municipalityFilter === "all" ? "all municipalities" : municipalityFilter;
    document.getElementById("lens-summary").innerHTML = `
      <div><strong>${escapeHTML(commodity)}</strong>${escapeHTML(YEAR_LABELS[activeYear] || activeYear)}</div>
      <div>${formatNumber(data.length)} records across ${escapeHTML(provinceText)}, ${escapeHTML(districtText)}, ${escapeHTML(municipalityText)}</div>
      <div>${formatNumber(budget)} PHP '000 total tagged budget</div>
    `;
  }

  function updateCharts(data) {
    renderCategoryChart("province-chart", groupBudget(data, "province").slice(0, 8), "Budget", "#1a6b3c");
    renderCategoryChart("district-chart", groupBudget(data, "district").slice(0, 12), "Budget", "#b45309");
    renderCategoryChart("municipality-chart", groupBudget(data, "municipality").slice(0, 10), "Budget", "#2e7d9a");
    renderYearChart();
  }

  function groupBudget(data, field) {
    const map = new Map();
    data.forEach(row => {
      const key = field === "municipality"
        ? row.displayMunicipality
        : field === "district"
          ? districtLabel(row)
          : (row[field] || "Unspecified");
      map.set(key, (map.get(key) || 0) + row.budgetValue);
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  function renderCategoryChart(id, data, label, color) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    const theme = chartTheme();
    const isDoughnut = chartType === "doughnut";
    const isLine = chartType === "line";
    const horizontal = chartType === "horizontal-bar";
    const chartColors = data.map((_, index) => palette(index, color));

    charts[id] = new Chart(ctx, {
      type: isDoughnut ? "doughnut" : isLine ? "line" : "bar",
      data: {
        labels: data.map(item => item.label),
        datasets: [{
          label,
          data: data.map(item => item.value),
          backgroundColor: isDoughnut ? chartColors : color,
          borderColor: isDoughnut ? theme.surface : color,
          fill: isLine,
          tension: 0.25
        }]
      },
      options: {
        indexAxis: !isDoughnut && !isLine && horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: isDoughnut, labels: { color: theme.text } },
          tooltip: { callbacks: { label: item => `${label}: ${formatNumber(item.raw)} PHP '000` } }
        },
        scales: isDoughnut ? {} : categoryScales(horizontal, theme)
      }
    });
  }

  function renderYearChart() {
    const commodity = activeCommodity;
    const yearData = ["2025", "2026", "2027"].map(year => {
      const data = filteredRows({ year, commodity });
      return {
        year,
        count: data.length,
        budget: sum(data, "budgetValue")
      };
    });

    const id = "year-chart";
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    const theme = chartTheme();

    charts[id] = new Chart(ctx, {
      type: "line",
      data: {
        labels: yearData.map(item => item.year),
        datasets: [
          {
            label: "Budget PHP '000",
            data: yearData.map(item => item.budget),
            borderColor: "#4ade80",
            backgroundColor: "rgba(74,222,128,0.12)",
            fill: true,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            label: "Items",
            data: yearData.map(item => item.count),
            borderColor: "#fbbf24",
            backgroundColor: "#fbbf24",
            tension: 0.25,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { color: theme.text } } },
        scales: timelineScales(theme)
      }
    });
  }

  function updateNotes(data) {
    const budget = sum(data, "budgetValue");
    const municipalities = new Set(data.filter(row => row.municipality).map(row => `${row.province}|${row.municipality}`));
    const topProgram = groupBudget(data, "program")[0];
    const zeroBudget = data.filter(row => row.budgetValue <= 0).length;
    const notes = [];

    if (!data.length) {
      notes.push(["danger", "No records match the current commodity, year, province, and search filters."]);
    } else {
      notes.push(["", `${formatNumber(data.length)} records are tagged to ${municipalities.size} municipality/province combinations for this lens.`]);
      if (topProgram) notes.push(["", `${topProgram.label} carries the largest tagged budget at ${formatNumber(topProgram.value)} PHP '000.`]);
      const topDistrict = groupBudget(data, "district")[0];
      if (topDistrict) notes.push(["", `${topDistrict.label} is the top district grouping for this lens at ${formatNumber(topDistrict.value)} PHP '000.`]);
      if (activeYear === "2027") notes.push(["warn", "Use this view to compare proposed allocations with the need-gap layer in the decision map before realignment."]);
      if (zeroBudget > 0) notes.push(["warn", `${zeroBudget} records have no extracted budget value; verify the source workbook before treating them as unfunded.`]);
      if (budget <= 0) notes.push(["danger", "The current filter has no extracted budget. This may be a real gap or a workbook encoding issue."]);
    }

    document.getElementById("planning-notes").innerHTML = notes
      .map(([level, text]) => `<div class="note ${level}">${escapeHTML(text)}</div>`)
      .join("");
  }

  function updateTable(data) {
    const tbody = document.getElementById("plans-table");
    const sorted = [...data].sort((a, b) => b.budgetValue - a.budgetValue || a.province.localeCompare(b.province));
    document.getElementById("table-count").textContent = `${formatNumber(sorted.length)} records`;

    tbody.innerHTML = sorted.slice(0, 500).map(row => `
      <tr>
        <td>${escapeHTML(row.province)}</td>
        <td>${escapeHTML(row.displayDistrict || formatDistrict(row.district))}</td>
        <td>${escapeHTML(row.displayMunicipality)}</td>
        <td>${escapeHTML(row.year)}</td>
        <td>${escapeHTML(row.program)}</td>
        <td class="activity-cell">${escapeHTML(row.activity || row.source_note || "")}<div class="muted">${escapeHTML(row.unit || "")}</div></td>
        <td>${formatNumber(row.budgetValue)}</td>
        <td>${row.lengthValue ? formatDecimal(row.lengthValue) + " km" : ""}</td>
        <td>${escapeHTML(row.source_file)}</td>
      </tr>
    `).join("");
  }

  function sum(data, field) {
    return data.reduce((total, row) => total + (row[field] || 0), 0);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatNumber(value) {
    return currency.format(value || 0);
  }

  function formatDecimal(value) {
    return decimal.format(value || 0);
  }

  function formatCompact(value) {
    return Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
  }

  function chartTheme() {
    return themeMode === "dark"
      ? { text: "#d8e4dc", grid: "rgba(216,228,220,0.14)", surface: "#18251d" }
      : { text: "#1e2a1f", grid: "rgba(30,42,31,0.12)", surface: "#ffffff" };
  }

  function categoryScales(horizontal, theme) {
    if (horizontal) {
      return {
        x: {
          beginAtZero: true,
          grid: { color: theme.grid },
          ticks: { color: theme.text, callback: value => formatCompact(value) }
        },
        y: {
          grid: { color: "transparent" },
          ticks: { color: theme.text, autoSkip: false }
        }
      };
    }
    return {
      x: {
        grid: { color: "transparent" },
        ticks: { color: theme.text }
      },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid },
        ticks: { color: theme.text, callback: value => formatCompact(value) }
      }
    };
  }

  function timelineScales(theme) {
    return {
      x: { grid: { color: theme.grid }, ticks: { color: theme.text } },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid },
        ticks: { color: theme.text, callback: value => formatCompact(value) }
      },
      y1: {
        beginAtZero: true,
        position: "right",
        grid: { drawOnChartArea: false },
        ticks: { color: theme.text }
      }
    };
  }

  function palette(index, fallback) {
    const colors = ["#1a6b3c", "#2e7d9a", "#b45309", "#7c3aed", "#b91c1c", "#047857", "#2563eb", "#9333ea", "#c2410c", "#0f766e"];
    return colors[index % colors.length] || fallback;
  }

  function formatTimestamp(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[ch]));
  }

  function toCSV(data) {
    if (!data.length) return "";
    const fields = ["province", "district", "municipality", "year", "program", "activity", "unit", "physical_target", "budget", "length_km", "source_file", "sheet", "allocation_method"];
    const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return [fields.join(",")]
      .concat(data.map(row => fields.map(field => quote(row[field])).join(",")))
      .join("\n");
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", PlansDashboard.init);
