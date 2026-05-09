const PlansDashboard = (() => {
  const VERSION = "20260509-plans";
  const DETAIL_URL = `data/plans_projects_2025_2027_details.csv?v=${VERSION}`;

  const COMMODITIES = [
    { key: "all", label: "All" },
    { key: "rice", label: "Rice", programs: ["Rice Program"] },
    { key: "corn", label: "Corn", programs: ["Corn Program"] },
    { key: "hvc", label: "High Value Crops", programs: ["High Value Crops", "NUPAP"] },
    { key: "fmr", label: "FMR", programs: ["Farm-to-Market Roads", "PRDP"] },
    { key: "4ks", label: "4Ks", programs: ["4Ks"] },
    { key: "saad", label: "SAAD", programs: ["SAAD"] },
    { key: "other", label: "Other", programs: ["OAP", "National Soil Health", "MCRA", "LIVESTOCK", "HALAL", "COLD STORAGE", "2024-2026"] }
  ];

  const YEAR_LABELS = {
    "2025": "2025 accomplishment",
    "2026": "2026 ongoing",
    "2027": "2027 proposal"
  };

  let rows = [];
  let activeYear = "2026";
  let activeCommodity = "all";
  let provinceFilter = "all";
  let districtFilter = "all";
  let municipalityFilter = "all";
  let searchTerm = "";
  let charts = {};

  const currency = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

  function init() {
    bindEvents();
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

  function normalizeRow(row) {
    const displayMunicipality = row.municipality ||
      (row.district ? `${row.province} ${row.district} districtwide` : `${row.province} provincewide`);
    return {
      ...row,
      year: String(row.year || "").trim(),
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
    const districts = [...new Set(rows
      .filter(row => provinceFilter === "all" || row.province === provinceFilter)
      .map(row => row.district)
      .filter(Boolean))]
      .sort(compareDistricts);

    if (districtFilter !== "all" && !districts.includes(districtFilter)) districtFilter = "all";
    select.innerHTML = `<option value="all">All Districts</option>` +
      districts.map(district =>
        `<option value="${escapeHTML(district)}" ${district === districtFilter ? "selected" : ""}>${escapeHTML(formatDistrict(district))}</option>`
      ).join("");
    select.value = districtFilter;
  }

  function updateMunicipalityFilter() {
    const select = document.getElementById("municipality-filter");
    const municipalities = [...new Set(rows
      .filter(row => provinceFilter === "all" || row.province === provinceFilter)
      .filter(row => districtFilter === "all" || row.district === districtFilter)
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
    const av = districtOrder(a);
    const bv = districtOrder(b);
    return av === bv ? a.localeCompare(b) : av - bv;
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
      if (districtFilter !== "all" && row.district !== districtFilter) return false;
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
    const districtText = districtFilter === "all" ? "all districts" : formatDistrict(districtFilter);
    const municipalityText = municipalityFilter === "all" ? "all municipalities" : municipalityFilter;
    document.getElementById("lens-summary").innerHTML = `
      <div><strong>${escapeHTML(commodity)}</strong>${escapeHTML(YEAR_LABELS[activeYear] || activeYear)}</div>
      <div>${formatNumber(data.length)} records across ${escapeHTML(provinceText)}, ${escapeHTML(districtText)}, ${escapeHTML(municipalityText)}</div>
      <div>${formatNumber(budget)} PHP '000 total tagged budget</div>
    `;
  }

  function updateCharts(data) {
    renderBarChart("province-chart", groupBudget(data, "province").slice(0, 8), "Budget", "#1a6b3c", true);
    renderBarChart("municipality-chart", groupBudget(data, "municipality").slice(0, 10), "Budget", "#2e7d9a", true);
    renderYearChart();
  }

  function groupBudget(data, field) {
    const map = new Map();
    data.forEach(row => {
      const key = field === "municipality"
        ? row.displayMunicipality
        : (row[field] || "Unspecified");
      map.set(key, (map.get(key) || 0) + row.budgetValue);
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  function renderBarChart(id, data, label, color, horizontal = false) {
    const ctx = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(item => item.label),
        datasets: [{ label, data: data.map(item => item.value), backgroundColor: color }]
      },
      options: {
        indexAxis: horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: item => `${label}: ${formatNumber(item.raw)} PHP '000` } }
        },
        scales: {
          x: { ticks: { callback: v => horizontal ? formatCompact(v) : this?.getLabelForValue?.(v) } },
          y: { ticks: { autoSkip: false } }
        }
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
    charts[id] = new Chart(ctx, {
      type: "line",
      data: {
        labels: yearData.map(item => item.year),
        datasets: [
          {
            label: "Budget PHP '000",
            data: yearData.map(item => item.budget),
            borderColor: "#1a6b3c",
            backgroundColor: "rgba(26,107,60,0.12)",
            fill: true,
            tension: 0.25,
            yAxisID: "y"
          },
          {
            label: "Items",
            data: yearData.map(item => item.count),
            borderColor: "#b45309",
            backgroundColor: "#b45309",
            tension: 0.25,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: value => formatCompact(value) } },
          y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }
        }
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
    const fields = ["province", "municipality", "year", "program", "activity", "unit", "physical_target", "budget", "length_km", "source_file", "sheet", "allocation_method"];
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
