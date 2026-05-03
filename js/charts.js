// ============================================================
// charts.js — Chart.js Analytics Panel
// ============================================================

const Charts = (() => {
  let barChart = null;
  let lineChart = null;       // poverty trend panel (chart-line)
  let productionChart = null; // production comparison panel (chart-line2)
  let scatterChart = null;
  let pieChart = null;

  function destroyAll() {
    [barChart, lineChart, productionChart, scatterChart, pieChart].forEach(c => {
      if (c) { c.destroy(); }
    });
    barChart = lineChart = productionChart = scatterChart = pieChart = null;
  }

  // Shared chart options
  const baseFont = { family: "'Barlow', 'Segoe UI', sans-serif", size: 11 };
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: baseFont } },
      tooltip: { bodyFont: baseFont, titleFont: { ...baseFont, weight: "bold" } }
    }
  };

  // ============================================================
  // BAR CHART: Top municipalities by indicator
  // ============================================================
  function renderTopBar(rows, field, n = 10, direction = "top") {
    const ctx = document.getElementById("chart-bar");
    if (!ctx) return;
    if (barChart) barChart.destroy();

    const cfg = INDICATOR_CONFIG[field];
    const label = cfg?.label || field;
    const ascending = direction === "bottom";
    const ranked = Utils.rankData(rows, field, ascending);
    const top = ranked.slice(0, n);

    barChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: top.map(r => r.municipality || r.NAME || r.province || "?"),
        datasets: [{
          label: label,
          data: top.map(r => r._rankVal),
          backgroundColor: top.map((_, i) => `hsla(${140 - i * 10}, 60%, 40%, 0.8)`),
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        plugins: {
          ...baseOptions.plugins,
          title: { display: true, text: `${direction === "top" ? "Top" : "Bottom"} ${n}: ${label}`, font: { ...baseFont, size: 13 } }
        },
        scales: {
          x: { ticks: { font: baseFont }, title: { display: true, text: cfg?.unit || "", font: baseFont } },
          y: { ticks: { font: baseFont } }
        }
      }
    });
  }

  // ============================================================
  // LINE/GROUPED BAR CHART: Poverty over years
  // ============================================================
  function renderPovertyTrend(rows, topN = 10) {
    const ctx = document.getElementById("chart-line");
    if (!ctx) return;
    if (lineChart) lineChart.destroy();

    // Pick top N by poverty_2023
    const sorted = rows
      .filter(r => Utils.parseNumeric(r.poverty_2023) !== null)
      .sort((a, b) => Utils.parseNumeric(b.poverty_2023) - Utils.parseNumeric(a.poverty_2023))
      .slice(0, topN);

    const labels = sorted.map(r => r.municipality || r.NAME || "?");
    const years = ["2018", "2021", "2023"];
    const fields = ["poverty_2018", "poverty_2021", "poverty_2023"];
    const colors = ["#4472C4", "#ED7D31", "#A9D18E"];

    lineChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: years.map((yr, i) => ({
          label: `Poverty ${yr}`,
          data: sorted.map(r => Utils.parseNumeric(r[fields[i]])),
          backgroundColor: colors[i] + "bb",
          borderColor: colors[i],
          borderWidth: 1,
          borderRadius: 2
        }))
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          title: { display: true, text: `Poverty Incidence Trend (Top ${topN})`, font: { ...baseFont, size: 13 } }
        },
        scales: {
          x: { ticks: { font: baseFont, maxRotation: 45 } },
          y: { ticks: { font: baseFont }, title: { display: true, text: "%", font: baseFont } }
        }
      }
    });
  }

  // ============================================================
  // GROUPED BAR: Production comparison 2023 vs 2025
  // ============================================================
  function renderProductionComparison(rows, crop = "rice", topN = 10) {
    // Uses the "production" panel canvas (chart-line2)
    const ctx = document.getElementById("chart-line2");
    if (!ctx) return;
    if (productionChart) productionChart.destroy();

    const f2023 = `${crop}_production_2023`;
    const f2025 = `${crop}_production_2025`;
    const sorted = rows
      .filter(r => Utils.parseNumeric(r[f2023]) !== null)
      .sort((a, b) => Utils.parseNumeric(b[f2023]) - Utils.parseNumeric(a[f2023]))
      .slice(0, topN);

    const labels = sorted.map(r => r.municipality || r.NAME || "?");
    const color2023 = crop === "rice" ? "#4CAF50" : "#FF9800";
    const color2025 = crop === "rice" ? "#1B5E20" : "#E65100";

    productionChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: `${crop.charAt(0).toUpperCase()+crop.slice(1)} Production 2023`, data: sorted.map(r => Utils.parseNumeric(r[f2023])), backgroundColor: color2023 + "99", borderColor: color2023, borderWidth: 1, borderRadius: 2 },
          { label: `${crop.charAt(0).toUpperCase()+crop.slice(1)} Production 2025`, data: sorted.map(r => Utils.parseNumeric(r[f2025])), backgroundColor: color2025 + "99", borderColor: color2025, borderWidth: 1, borderRadius: 2 }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          title: { display: true, text: `${crop.charAt(0).toUpperCase()+crop.slice(1)} Production: 2023 vs 2025`, font: { ...baseFont, size: 13 } }
        },
        scales: {
          x: { ticks: { font: baseFont, maxRotation: 45 } },
          y: { title: { display: true, text: "MT", font: baseFont }, ticks: { font: baseFont } }
        }
      }
    });
  }

  // ============================================================
  // SCATTER PLOT: Two indicators
  // ============================================================
  function renderScatter(rows, xField, yField) {
    const ctx = document.getElementById("chart-scatter");
    if (!ctx) return;
    if (scatterChart) scatterChart.destroy();

    const xLabel = INDICATOR_CONFIG[xField]?.label || xField;
    const yLabel = INDICATOR_CONFIG[yField]?.label || yField;

    const points = rows
      .filter(r => Utils.parseNumeric(r[xField]) !== null && Utils.parseNumeric(r[yField]) !== null)
      .map(r => ({
        x: Utils.parseNumeric(r[xField]),
        y: Utils.parseNumeric(r[yField]),
        label: r.municipality || r.NAME || ""
      }));

    scatterChart = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [{
          label: `${xLabel} vs ${yLabel}`,
          data: points,
          backgroundColor: "rgba(26, 107, 60, 0.55)",
          borderColor: "#1a6b3c",
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          title: { display: true, text: `${xLabel} vs ${yLabel}`, font: { ...baseFont, size: 13 } },
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label: (ctx) => `${ctx.raw.label}: (${ctx.raw.x.toFixed(1)}, ${ctx.raw.y.toFixed(1)})`
            }
          }
        },
        scales: {
          x: { title: { display: true, text: xLabel + (INDICATOR_CONFIG[xField]?.unit ? ` (${INDICATOR_CONFIG[xField].unit})` : ""), font: baseFont }, ticks: { font: baseFont } },
          y: { title: { display: true, text: yLabel + (INDICATOR_CONFIG[yField]?.unit ? ` (${INDICATOR_CONFIG[yField].unit})` : ""), font: baseFont }, ticks: { font: baseFont } }
        }
      }
    });
  }

  // ============================================================
  // PIE CHART: Regional crop composition
  // ============================================================
  function renderRegionalPie(rows) {
    const ctx = document.getElementById("chart-pie");
    if (!ctx) return;
    if (pieChart) pieChart.destroy();

    const riceProd = rows.reduce((s, r) => s + (Utils.parseNumeric(r.rice_production_2023) || 0), 0);
    const cornProd = rows.reduce((s, r) => s + (Utils.parseNumeric(r.corn_production_2023) || 0), 0);

    pieChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Rice Production", "Corn Production"],
        datasets: [{
          data: [riceProd, cornProd],
          backgroundColor: ["#4CAF50", "#FF9800"],
          borderColor: "#fff",
          borderWidth: 2
        }]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          title: { display: true, text: "Regional Crop Production Share (2023)", font: { ...baseFont, size: 13 } },
          legend: { position: "bottom", labels: { font: baseFont } }
        }
      }
    });
  }

  // ============================================================
  // RANKING TABLE
  // ============================================================
  function renderRankingTable(rows, field, n = 15, direction = "top") {
    const container = document.getElementById("ranking-table");
    if (!container) return;
    const cfg = INDICATOR_CONFIG[field];
    const label = cfg?.label || field;
    const ascending = direction === "bottom";
    const ranked = Utils.rankData(rows, field, ascending);
    const top = ranked.slice(0, n);

    if (top.length === 0) {
      container.innerHTML = `<p class="no-data">No data available.</p>`;
      return;
    }

    let html = `<table class="rank-table">
      <thead><tr>
        <th>Rank</th>
        <th>Municipality</th>
        <th>Province</th>
        <th>${label}</th>
      </tr></thead>
      <tbody>`;

    top.forEach(r => {
      html += `<tr class="rank-row rank-${r._rank <= 3 ? "top3" : ""}">
        <td><span class="rank-badge">${r._rank}</span></td>
        <td>${r.municipality || r.NAME || "?"}</td>
        <td>${r.province || ""}</td>
        <td>${Utils.formatValue(r._rankVal, field)}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // ============================================================
  // UPDATE ALL CHARTS based on current state
  // ============================================================
  function updateAll(rows, field, options = {}) {
    if (!rows || rows.length === 0) return;
    const n = options.n || 10;
    const direction = options.direction || "top";
    const scatterX = options.scatterX || "poverty_2023";
    const scatterY = options.scatterY || field;

    renderTopBar(rows, field, n, direction);
    renderRegionalPie(rows);
    renderRankingTable(rows, field, 15, direction);

    // Scatter only if different fields
    if (scatterX !== field) {
      renderScatter(rows, scatterX, scatterY);
    } else {
      renderScatter(rows, "poverty_2023", field);
    }
  }

  return {
    renderTopBar,
    renderPovertyTrend,
    renderProductionComparison,
    renderScatter,
    renderRegionalPie,
    renderRankingTable,
    updateAll,
    destroyAll
  };
})();
