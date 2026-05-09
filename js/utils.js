// ============================================================
// utils.js — Utility Functions
// ============================================================

const Utils = (() => {

  // Normalize a place name for matching (lowercase, trim, remove punctuation)
  function normalizeName(name) {
    if (!name) return "";
    return name
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s*\(capital\)\s*/g, " ")
      .replace(/-/g, " ")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^city of\s+/i, "")
      .replace(/^municipality of\s+/i, "")
      .replace(/\s+city$/i, "")
      .replace(/\s+municipality$/i, "");
  }

  // Build a composite join key from province + municipality
  function buildJoinKey(province, municipality) {
    return normalizeName(province) + "||" + normalizeName(municipality);
  }

  function getAreaKey(props) {
    if (!props) return "";
    return props._areaKey ||
      props.municipality ||
      props.district ||
      props.province ||
      props.ADM2_EN ||
      props.NAME ||
      "";
  }

  function getAreaName(props) {
    if (!props) return "Area";
    return props._areaName ||
      props.municipality ||
      props.district_label ||
      props.district ||
      props.province ||
      props.ADM2_EN ||
      props.NAME ||
      "Area";
  }

  // Format a number with commas and optional decimals
  function formatNumber(val, decimals = 0) {
    if (val === null || val === undefined || val === "" || isNaN(val)) return "N/A";
    return parseFloat(val).toLocaleString("en-PH", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // Format a percentage value
  function formatPct(val, decimals = 1) {
    if (val === null || val === undefined || val === "" || isNaN(val)) return "N/A";
    return parseFloat(val).toFixed(decimals) + "%";
  }

  // Format a value with its unit based on indicator config
  function formatValue(val, indicatorKey) {
    const cfg = INDICATOR_CONFIG[indicatorKey];
    if (!cfg) return formatNumber(val);
    if (val === null || val === undefined || val === "" || isNaN(val)) return "N/A";
    if (cfg.type === "percentage") return formatPct(val);
    if (cfg.type === "categorical" || cfg.type === "binary") return val;
    const formatted = formatNumber(val, cfg.unit === "MT/ha" ? 2 : 0);
    return cfg.unit ? `${formatted} ${cfg.unit}` : formatted;
  }

  // Parse a numeric value from CSV (handle blank, N/A, etc.)
  function parseNumeric(val) {
    if (val === null || val === undefined || val === "" || val === "N/A" || val === "n/a") return null;
    const n = parseFloat(String(val).replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }

  // Get all numeric values of an indicator across all features
  function getValues(data, key) {
    return data
      .map(d => parseNumeric(d[key]))
      .filter(v => v !== null && !isNaN(v));
  }

  // Compute quantile breaks for classification
  function quantileBreaks(values, n = 5) {
    if (!values || values.length === 0) return [];
    const sorted = [...values].sort((a, b) => a - b);
    const breaks = [];
    for (let i = 0; i <= n; i++) {
      const idx = Math.floor((i / n) * (sorted.length - 1));
      breaks.push(sorted[idx]);
    }
    return [...new Set(breaks)];
  }

  // Natural breaks (Jenks simplified)
  function naturalBreaks(values, n = 5) {
    if (!values || values.length < n) return quantileBreaks(values, n);
    const sorted = [...values].sort((a, b) => a - b);
    // Simplified: use quantile as fallback (full Jenks is expensive client-side)
    return quantileBreaks(sorted, n);
  }

  // Equal interval breaks
  function equalIntervalBreaks(values, n = 5) {
    if (!values || values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / n;
    const breaks = [];
    for (let i = 0; i <= n; i++) breaks.push(min + i * step);
    return breaks;
  }

  // Classify a value into a color bin
  function classifyValue(val, breaks, colors) {
    if (val === null || val === undefined || isNaN(val)) return "#cccccc";
    for (let i = 0; i < breaks.length - 1; i++) {
      if (val <= breaks[i + 1]) return colors[i] || colors[colors.length - 1];
    }
    return colors[colors.length - 1];
  }

  // Normalize a value to 0-1 range
  function normalize(val, min, max) {
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
  }

  // Interpolate between two hex colors
  function interpolateColor(color1, color2, t) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  }

  // Compute polygon centroid from GeoJSON feature
  function getCentroid(feature) {
    try {
      const coords = feature.geometry.coordinates;
      const type = feature.geometry.type;

      let allCoords = [];
      if (type === "Polygon") {
        allCoords = coords[0];
      } else if (type === "MultiPolygon") {
        coords.forEach(poly => poly[0].forEach(c => allCoords.push(c)));
      }

      const lng = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
      const lat = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
      return [lat, lng];
    } catch (e) {
      return [17.6, 121.7];
    }
  }

  // Debounce function for search input
  function debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  // Deep clone an object
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Compute stats for an array of values
  function computeStats(values) {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    const mean = sum / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    const variance = sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sorted.length;
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: mean,
      median: median,
      sum: sum,
      stdDev: Math.sqrt(variance),
      count: sorted.length
    };
  }

  // Show a notification/toast message
  function showToast(message, type = "info", duration = 3500) {
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toast-container";
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  // Convert data array to CSV string for export
  function arrayToCSV(data) {
    if (!data || data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h] !== null && row[h] !== undefined ? row[h] : "";
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  // Trigger CSV download
  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Trigger map PNG export (uses html2canvas if available)
  function downloadMapPNG() {
    const mapEl = document.getElementById("map");
    if (typeof html2canvas !== "undefined" && mapEl) {
      html2canvas(mapEl).then(canvas => {
        const a = document.createElement("a");
        a.download = "cagayan-valley-map.png";
        a.href = canvas.toDataURL("image/png");
        a.click();
      });
    } else {
      showToast("PNG export requires html2canvas library. CSV export is available.", "warning");
    }
  }

  // Rank data by a field, return array of { rank, ...data }
  function rankData(data, field, ascending = true) {
    const withValues = data
      .map(d => ({ ...d, _rankVal: parseNumeric(d[field]) }))
      .filter(d => d._rankVal !== null);
    withValues.sort((a, b) => ascending ? a._rankVal - b._rankVal : b._rankVal - a._rankVal);
    return withValues.map((d, i) => ({ ...d, _rank: i + 1 }));
  }

  // Classify into Low/Medium/High terciles
  function classifyTercile(val, min, max) {
    if (val === null || isNaN(val)) return "N/A";
    const range = max - min;
    if (range === 0) return "L";
    const t = (val - min) / range;
    if (t < 0.333) return "L";
    if (t < 0.667) return "M";
    return "H";
  }

  return {
    normalizeName,
    buildJoinKey,
    getAreaKey,
    getAreaName,
    formatNumber,
    formatPct,
    formatValue,
    parseNumeric,
    getValues,
    quantileBreaks,
    naturalBreaks,
    equalIntervalBreaks,
    classifyValue,
    normalize,
    interpolateColor,
    getCentroid,
    debounce,
    deepClone,
    computeStats,
    showToast,
    arrayToCSV,
    downloadCSV,
    downloadMapPNG,
    rankData,
    classifyTercile
  };
})();
