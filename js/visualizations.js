// ============================================================
// visualizations.js — All Map Visualization Styles
// ============================================================

const Visualizations = (() => {

  let currentLayer = null;
  let currentMarkers = null;
  let legendControl = null;
  let map = null;

  function init(leafletMap) {
    map = leafletMap;
  }

  function clearLayers() {
    if (currentLayer && map.hasLayer(currentLayer)) map.removeLayer(currentLayer);
    if (currentMarkers && map.hasLayer(currentMarkers)) map.removeLayer(currentMarkers);
    currentLayer = null;
    currentMarkers = null;
    if (legendControl) {
      map.removeControl(legendControl);
      legendControl = null;
    }
  }

  function areaKey(props) {
    return Utils.getAreaKey(props);
  }

  function areaName(props) {
    return Utils.getAreaName(props);
  }

  function bindAreaSelection(layer, feature, props = feature.properties) {
    layer.on("click", () => {
      window.dispatchEvent(new CustomEvent("area:selected", {
        detail: { properties: props, name: areaName(props), centroid: Utils.getCentroid(feature) }
      }));
    });
  }

  // ============================================================
  // CHOROPLETH + GRADIENT MAP
  // ============================================================
  function renderChoropleth(geojson, field, options = {}) {
    clearLayers();
    const cfg = INDICATOR_CONFIG[field];
    const scheme = cfg ? (COLOR_SCHEMES[cfg.colorScheme] || COLOR_SCHEMES.Blues) : COLOR_SCHEMES.Blues;
    const rows = geojson.features.map(f => f.properties);
    const values = Utils.getValues(rows, field);

    if (values.length === 0) {
      Utils.showToast("No numeric data available for this indicator.", "warning");
    }

    const breaks = Utils.quantileBreaks(values, scheme.length);
    const isGradient = options.style === "gradient";

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const val = Utils.parseNumeric(feature.properties[field]);
        let color = "#eeeeee";
        if (val !== null && breaks.length > 1) {
          if (isGradient) {
            const t = Utils.normalize(val, breaks[0], breaks[breaks.length - 1]);
            color = Utils.interpolateColor(scheme[0], scheme[scheme.length - 1], t);
          } else {
            color = Utils.classifyValue(val, breaks, scheme);
          }
        }
        return {
          fillColor: color,
          weight: 1,
          opacity: 0.8,
          color: "#555",
          fillOpacity: feature.properties._joined === false ? 0.2 : 0.75
        };
      },
      onEachFeature: (feature, layer) => {
        attachPopup(feature, layer, field);
        attachHoverTooltip(feature, layer, field);
      }
    }).addTo(map);

    renderChoroplethLegend(field, breaks, scheme, isGradient);
    return currentLayer;
  }

  // ============================================================
  // PROPORTIONAL CIRCLES MAP
  // ============================================================
  function renderProportional(geojson, field) {
    clearLayers();
    const rows = geojson.features.map(f => f.properties);
    const values = Utils.getValues(rows, field);
    if (values.length === 0) return;

    const maxVal = Math.max(...values);
    const maxRadius = 40;

    // Render a light polygon base
    currentLayer = L.geoJSON(geojson, {
      style: () => ({ fillColor: "#e8f4f8", weight: 0.5, color: "#aaa", fillOpacity: 0.4 }),
      onEachFeature: (feature, layer) => attachPopup(feature, layer, field)
    }).addTo(map);

    // Circle markers at centroids
    const circles = [];
    geojson.features.forEach(f => {
      const val = Utils.parseNumeric(f.properties[field]);
      if (val === null || maxVal === 0) return;
      const centroid = Utils.getCentroid(f);
      const radius = Math.sqrt(val / maxVal) * maxRadius;
      const circle = L.circleMarker(centroid, {
        radius: Math.max(4, radius),
        fillColor: "#1a6b3c",
        color: "#fff",
        weight: 1.5,
        fillOpacity: 0.75
      });
      attachPopup(f, circle, field);
      circle.bindTooltip(
        `<strong>${areaName(f.properties)}</strong><br>${INDICATOR_CONFIG[field]?.label || field}: <b>${Utils.formatValue(val, field)}</b>`,
        { sticky: true, className: "hover-tip" }
      );
      circles.push(circle);
    });

    currentMarkers = L.layerGroup(circles).addTo(map);
    renderProportionalLegend(field, maxVal, maxRadius);
    return currentLayer;
  }

  // ============================================================
  // BIVARIATE MAP
  // ============================================================
  function renderBivariate(geojson, fieldA, fieldB) {
    clearLayers();
    const rows = geojson.features.map(f => f.properties);
    const valsA = Utils.getValues(rows, fieldA);
    const valsB = Utils.getValues(rows, fieldB);
    if (valsA.length === 0 || valsB.length === 0) {
      Utils.showToast("Both fields must have data for bivariate map.", "warning");
      return;
    }
    const minA = Math.min(...valsA), maxA = Math.max(...valsA);
    const minB = Math.min(...valsB), maxB = Math.max(...valsB);

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const vA = Utils.parseNumeric(feature.properties[fieldA]);
        const vB = Utils.parseNumeric(feature.properties[fieldB]);
        const tA = vA !== null ? Utils.classifyTercile(vA, minA, maxA) : "N/A";
        const tB = vB !== null ? Utils.classifyTercile(vB, minB, maxB) : "N/A";
        const key = tA + tB;
        const color = COLOR_SCHEMES.Bivariate[key] || "#cccccc";
        return { fillColor: color, weight: 1, color: "#555", fillOpacity: 0.8, opacity: 0.8 };
      },
      onEachFeature: (feature, layer) => {
        const vA = Utils.parseNumeric(feature.properties[fieldA]);
        const vB = Utils.parseNumeric(feature.properties[fieldB]);
        const name = areaName(feature.properties);
        layer.bindPopup(`
          <div class="popup-header">${name}</div>
          <div class="popup-row"><b>${INDICATOR_CONFIG[fieldA]?.label || fieldA}:</b> ${Utils.formatValue(vA, fieldA)}</div>
          <div class="popup-row"><b>${INDICATOR_CONFIG[fieldB]?.label || fieldB}:</b> ${Utils.formatValue(vB, fieldB)}</div>
        `);
        bindAreaSelection(layer, feature);
        layer.on("mouseover", () => layer.setStyle({ fillOpacity: 1.0 }));
        layer.on("mouseout", () => layer.setStyle({ fillOpacity: 0.8 }));
      }
    }).addTo(map);

    renderBivariateLegend(fieldA, fieldB);
    return currentLayer;
  }

  // ============================================================
  // DOMINANT CROP MAP
  // ============================================================
  function renderDominantCrop(geojson) {
    clearLayers();
    const cropColors = {
      "Rice-dominant":     "#4dac26",
      "Corn-dominant":     "#f1a340",
      "Mixed Rice-Corn":   "#7b3294",
      "Low Production":    "#d7d7d7",
      "No Data":           "#eeeeee"
    };

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const cls = classifyCrop(feature.properties);
        return { fillColor: cropColors[cls] || "#eeeeee", weight: 1, color: "#555", fillOpacity: 0.8 };
      },
      onEachFeature: (feature, layer) => {
        const cls = classifyCrop(feature.properties);
        const name = areaName(feature.properties);
        layer.bindPopup(`
          <div class="popup-header">${name}</div>
          <div class="popup-row"><b>Crop Classification:</b> ${cls}</div>
          <div class="popup-row"><b>Rice Area (2023):</b> ${Utils.formatValue(feature.properties.rice_area_2023, "rice_area_2023")}</div>
          <div class="popup-row"><b>Corn Area (2023):</b> ${Utils.formatValue(feature.properties.corn_area_2023, "corn_area_2023")}</div>
        `);
        layer.bindTooltip(`<b>${name}:</b> ${cls}`, { sticky: true, className: "hover-tip" });
        bindAreaSelection(layer, feature);
      }
    }).addTo(map);

    renderCategoricalLegend("Dominant Crop", cropColors);
    return currentLayer;
  }

  function classifyCrop(props) {
    const riceArea = Utils.parseNumeric(props.rice_area_2023) || 0;
    const cornArea = Utils.parseNumeric(props.corn_area_2023) || 0;
    if (riceArea === 0 && cornArea === 0) return "No Data";
    const total = riceArea + cornArea;
    if (total < 100) return "Low Production";
    const riceShare = riceArea / total;
    const cornShare = cornArea / total;
    if (riceShare > 0.6) return "Rice-dominant";
    if (cornShare > 0.6) return "Corn-dominant";
    return "Mixed Rice-Corn";
  }

  // ============================================================
  // PIE CHART SYMBOL MAP
  // ============================================================
  function renderPieSymbols(geojson, fields, labels, colors) {
    clearLayers();

    currentLayer = L.geoJSON(geojson, {
      style: () => ({ fillColor: "#f0f0f0", weight: 0.5, color: "#aaa", fillOpacity: 0.3 })
    }).addTo(map);

    const markers = [];
    geojson.features.forEach(f => {
      const props = f.properties;
      const values = fields.map(fld => Math.max(0, Utils.parseNumeric(props[fld]) || 0));
      const total = values.reduce((s, v) => s + v, 0);
      if (total === 0) return;

      const centroid = Utils.getCentroid(f);
      const maxRadius = 28;
      const allRows = geojson.features.map(ft => ft.properties);
      const allTotals = allRows.map(r => fields.reduce((s, fld) => s + (Utils.parseNumeric(r[fld]) || 0), 0));
      const maxTotal = Math.max(...allTotals);
      const radius = Math.max(8, Math.sqrt(total / maxTotal) * maxRadius);

      const svgIcon = createPieSVG(values, colors, radius);
      const icon = L.divIcon({ html: svgIcon, className: "pie-icon", iconSize: [radius * 2, radius * 2] });
      const marker = L.marker(centroid, { icon });

      const name = areaName(props);
      let tipHtml = `<div class="popup-header">${name}</div>`;
      fields.forEach((fld, i) => {
        const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : 0;
        tipHtml += `<div class="popup-row" style="border-left:4px solid ${colors[i]};padding-left:6px;">
          <b>${labels[i]}:</b> ${Utils.formatNumber(values[i])} (${pct}%)</div>`;
      });
      marker.bindPopup(tipHtml);
      bindAreaSelection(marker, f);
      markers.push(marker);
    });

    currentMarkers = L.layerGroup(markers).addTo(map);
    renderPieLegend(labels, colors);
    return currentLayer;
  }

  function createPieSVG(values, colors, radius) {
    const total = values.reduce((s, v) => s + v, 0);
    if (total === 0) return "";
    const cx = radius, cy = radius;
    let startAngle = -Math.PI / 2;
    let paths = "";

    values.forEach((val, i) => {
      if (val === 0) return;
      const angle = (val / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const largeArc = angle > Math.PI ? 1 : 0;
      paths += `<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z" 
        fill="${colors[i]}" stroke="#fff" stroke-width="1"/>`;
      startAngle = endAngle;
    });

    return `<svg width="${radius * 2}" height="${radius * 2}" style="overflow:visible">
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#fff" stroke="#aaa" stroke-width="0.5"/>
      ${paths}
    </svg>`;
  }

  // ============================================================
  // BAR CHART SYMBOL MAP
  // ============================================================
  function renderBarSymbols(geojson, fields, labels, colors) {
    clearLayers();

    currentLayer = L.geoJSON(geojson, {
      style: () => ({ fillColor: "#f0f0f0", weight: 0.5, color: "#aaa", fillOpacity: 0.3 })
    }).addTo(map);

    const allRows = geojson.features.map(ft => ft.properties);
    const fieldMaxes = fields.map(fld => {
      const vals = Utils.getValues(allRows, fld);
      return vals.length > 0 ? Math.max(...vals) : 1;
    });

    const markers = [];
    geojson.features.forEach(f => {
      const props = f.properties;
      const values = fields.map(fld => Utils.parseNumeric(props[fld]));
      if (values.every(v => v === null)) return;

      const centroid = Utils.getCentroid(f);
      const barW = 6, barMaxH = 30, gap = 2;
      const totalW = fields.length * (barW + gap);
      const svgH = barMaxH + 12;

      let bars = "";
      values.forEach((val, i) => {
        const barH = val !== null ? Math.max(2, (val / fieldMaxes[i]) * barMaxH) : 2;
        const x = i * (barW + gap);
        const y = barMaxH - barH;
        bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${colors[i]}" opacity="0.85"/>`;
      });

      const svgIcon = `<svg width="${totalW}" height="${svgH}" style="overflow:visible">
        ${bars}
        <rect x="0" y="${barMaxH}" width="${totalW}" height="1" fill="#666"/>
      </svg>`;
      const icon = L.divIcon({ html: svgIcon, className: "bar-icon", iconSize: [totalW, svgH] });
      const marker = L.marker(centroid, { icon });

      const name = areaName(props);
      let tipHtml = `<div class="popup-header">${name}</div>`;
      fields.forEach((fld, i) => {
        tipHtml += `<div class="popup-row" style="border-left:4px solid ${colors[i]};padding-left:6px;">
          <b>${labels[i]}:</b> ${Utils.formatValue(values[i], fld)}</div>`;
      });
      marker.bindPopup(tipHtml);
      bindAreaSelection(marker, f);
      markers.push(marker);
    });

    currentMarkers = L.layerGroup(markers).addTo(map);
    renderBarLegend(labels, colors);
    return currentLayer;
  }

  // ============================================================
  // RANKED HIGHLIGHT MAP
  // ============================================================
  function renderRanked(geojson, field, n = 10, direction = "top") {
    clearLayers();
    const rows = geojson.features.map(f => f.properties);
    const ascending = direction === "bottom";
    const ranked = Utils.rankData(rows, field, ascending);
    const topN = new Set(ranked.slice(0, n).map(r => areaKey(r)));

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const key = areaKey(feature.properties);
        const isTop = topN.has(key);
        const rank = ranked.find(r => areaKey(r) === key)?._rank;
        const t = isTop ? 1 - (rank - 1) / n : 0;
        const color = isTop ? Utils.interpolateColor("#ffffcc", "#d73027", t) : "#dddddd";
        return {
          fillColor: color, weight: isTop ? 2 : 0.5, color: isTop ? "#333" : "#bbb",
          fillOpacity: isTop ? 0.85 : 0.25
        };
      },
      onEachFeature: (feature, layer) => {
        const key = areaKey(feature.properties);
        const name = areaName(feature.properties);
        const rank = ranked.find(r => areaKey(r) === key);
        if (rank) {
          layer.bindTooltip(
            `<b>#${rank._rank} ${name}</b><br>${INDICATOR_CONFIG[field]?.label || field}: ${Utils.formatValue(rank._rankVal, field)}`,
            { sticky: true, className: "hover-tip" }
          );
        }
        attachPopup(feature, layer, field);
      }
    }).addTo(map);

    renderRankedLegend(field, direction, n);
    return currentLayer;
  }

  // ============================================================
  // DEVIATION FROM REGIONAL AVERAGE MAP
  // ============================================================
  function renderDeviation(geojson, field) {
    clearLayers();
    const rows = geojson.features.map(f => f.properties);
    const withDev = Aggregation.computeDeviations(rows, field);

    // Build a lookup by municipality
    const devMap = {};
    withDev.forEach(r => {
      devMap[areaKey(r)] = r;
    });

    const devColors = {
      "Far Below": "#2166ac",
      "Below": "#92c5de",
      "Near Average": "#f7f7f7",
      "Above": "#f4a582",
      "Far Above": "#d6604d",
      "N/A": "#cccccc"
    };

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const key = areaKey(feature.properties);
        const dev = devMap[key] || { _devClass: "N/A" };
        return { fillColor: devColors[dev._devClass] || "#cccccc", weight: 1, color: "#555", fillOpacity: 0.8 };
      },
      onEachFeature: (feature, layer) => {
        const name = areaName(feature.properties);
        const dev = devMap[areaKey(feature.properties)] || {};
        const label = INDICATOR_CONFIG[field]?.label || field;
        const val = Utils.parseNumeric(feature.properties[field]);
        layer.bindPopup(`
          <div class="popup-header">${name}</div>
          <div class="popup-row"><b>${label}:</b> ${Utils.formatValue(val, field)}</div>
          <div class="popup-row"><b>Regional Average:</b> ${Utils.formatValue(dev._devAvg, field)}</div>
          <div class="popup-row"><b>Difference:</b> ${dev._deviation !== undefined ? Utils.formatNumber(dev._deviation, 2) : "N/A"}</div>
          <div class="popup-row"><b>% Diff:</b> ${dev._devPct !== undefined ? Utils.formatPct(dev._devPct) : "N/A"}</div>
          <div class="popup-row"><b>Classification:</b> <b>${dev._devClass || "N/A"}</b></div>
        `);
        bindAreaSelection(layer, feature, dev);
        layer.bindTooltip(`<b>${name}:</b> ${dev._devClass || "N/A"}`, { sticky: true, className: "hover-tip" });
      }
    }).addTo(map);

    renderCategoricalLegend("Deviation from Regional Average", devColors);
    return currentLayer;
  }

  // ============================================================
  // RATIO MAP
  // ============================================================
  function renderRatio(geojson, numeratorField, denominatorField) {
    clearLayers();
    const rows = geojson.features.map(f => f.properties);
    const withRatio = Aggregation.computeRatioField(rows, numeratorField, denominatorField);

    const hasInvalid = withRatio.some(r => r._ratioWarning);
    if (hasInvalid) {
      Utils.showToast("Some municipalities have invalid ratio values (division by zero or missing data).", "warning");
    }

    const ratioVals = withRatio.map(r => r._ratio).filter(v => v !== null);
    const breaks = Utils.quantileBreaks(ratioVals, 5);
    const scheme = COLOR_SCHEMES.YlOrRd;

    const ratioMap = {};
    withRatio.forEach(r => {
      ratioMap[areaKey(r)] = r;
    });

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const r = ratioMap[areaKey(feature.properties)] || {};
        const color = r._ratio !== null ? Utils.classifyValue(r._ratio, breaks, scheme) : "#dddddd";
        return { fillColor: color, weight: 1, color: "#555", fillOpacity: 0.8 };
      },
      onEachFeature: (feature, layer) => {
        const name = areaName(feature.properties);
        const r = ratioMap[areaKey(feature.properties)] || {};
        const nLabel = INDICATOR_CONFIG[numeratorField]?.label || numeratorField;
        const dLabel = INDICATOR_CONFIG[denominatorField]?.label || denominatorField;
        layer.bindPopup(`
          <div class="popup-header">${name}</div>
          <div class="popup-row"><b>Ratio: ${nLabel} / ${dLabel}</b></div>
          <div class="popup-row"><b>Value:</b> ${r._ratio !== null ? Utils.formatNumber(r._ratio, 3) : "N/A"}</div>
          ${r._ratioWarning ? `<div class="popup-row popup-warning">⚠️ ${r._ratioWarning}</div>` : ""}
        `);
        bindAreaSelection(layer, feature, r);
      }
    }).addTo(map);

    const rLabel = `${INDICATOR_CONFIG[numeratorField]?.label || numeratorField} ÷ ${INDICATOR_CONFIG[denominatorField]?.label || denominatorField}`;
    renderChoroplethLegend(null, breaks, scheme, false, rLabel);
    return currentLayer;
  }

  // ============================================================
  // PRIORITY MAP
  // ============================================================
  function renderPriority(geojson, modelKey, customWeights = null) {
    clearLayers();
    const rows = geojson.features.map(f => f.properties);
    const scored = PriorityScoring.scoreAll(rows, modelKey, customWeights);

    // Build lookup
    const scoreMap = {};
    scored.forEach(r => {
      scoreMap[areaKey(r)] = r;
    });

    currentLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const r = scoreMap[areaKey(feature.properties)] || {};
        const color = PriorityScoring.getPriorityColor(r._priorityClass) || "#cccccc";
        return { fillColor: color, weight: 1, color: "#444", fillOpacity: 0.85 };
      },
      onEachFeature: (feature, layer) => {
        const name = areaName(feature.properties);
        const r = scoreMap[areaKey(feature.properties)] || {};
        layer.bindPopup(`
          <div class="popup-header">${name}</div>
          <div class="popup-row"><b>Priority Model:</b> ${r._priorityModel || "N/A"}</div>
          <div class="popup-row"><b>Priority Score:</b> ${r._priorityScore ?? "N/A"}/100</div>
          <div class="popup-row"><b>Classification:</b> ${r._priorityClass || "N/A"}</div>
          <hr>
          ${r._priorityBreakdown ? PriorityScoring.formatBreakdown(r, modelKey) : ""}
        `);
        layer.on("click", () => {
          window.dispatchEvent(new CustomEvent("area:selected", {
            detail: { properties: r, name, centroid: Utils.getCentroid(feature) }
          }));
        });
        layer.bindTooltip(`<b>${name}</b><br>${r._priorityClass || "N/A"} (${r._priorityScore ?? "N/A"}/100)`, { sticky: true, className: "hover-tip" });
      }
    }).addTo(map);

    renderPriorityLegend();
    return { layer: currentLayer, scored };
  }

  // ============================================================
  // POPUP HELPER — Full info popup
  // ============================================================
  function attachPopup(feature, layer, highlightField) {
    const p = feature.properties;
    const name = areaName(p);

    let html = `<div class="popup-header">${name}</div>`;
    if (p.province && p.municipality) html += `<div class="popup-subhead">${p.province}</div>`;

    const sections = [
      { label: "Demographics", fields: ["population"] },
      { label: "Poverty", fields: ["poverty_2018", "poverty_2021", "poverty_2023"] },
      { label: "Malnutrition", fields: ["stunting", "underweight", "obese", "wasting"] },
      { label: "Rice", fields: ["rice_production_2023", "rice_area_2023", "rice_yield_2023", "poor_rice_farmers", "rice_mechanization_level"] },
      { label: "PRiSM Rice Monitoring", fields: ["prism_rice_area_2026s1", "prism_standing_crop_area", "prism_harvest_progress_pct", "prism_upcoming_harvest_area", "prism_area_gap_vs_app_ha"] },
      { label: "El Nino Rice Risk", fields: ["pagasa_drought_outlook", "elnino_rice_risk_score", "elnino_prism_standing_exposed_area", "elnino_irrigation_gap_pct"] },
      { label: "Plans & Projects", fields: ["plans_projects_2027_count", "plans_projects_2027_budget", "plans_2027_budget_per_small_farm", "plans_2027_need_gap_score", "plans_fmr_2027_count", "plans_irrigation_2027_count"] },
      { label: "FMR Inventory", fields: ["fmr_inventory_count", "fmr_completed_count", "fmr_ongoing_count", "fmr_inventory_length_km", "fmr_influence_area_ha", "fmr_farmer_beneficiaries", "fmr_latest_year"] },
      { label: "F2C2 Clusters", fields: ["f2c2_cluster_count", "f2c2_area_ha", "f2c2_farmer_members", "f2c2_cluster_leaders", "f2c2_with_eom_count", "f2c2_latest_year", "f2c2_commodities", "f2c2_banner_programs", "f2c2_enterprise_statuses"] },
      { label: "RSBSA Registry", fields: ["rsba_registry_count", "rsba_crop_area_ha", "rsba_rice_count", "rsba_corn_count", "rsba_top_crop", "rsba_farmer_count", "rsba_farmworker_count", "rsba_fisherfolk_count", "rsba_female_pct", "rsba_youth_pct", "rsba_fca_pct", "rsba_imc_gap_pct"] },
      { label: "Corn", fields: ["corn_production_2023", "corn_area_2023", "corn_yield_2023", "poor_corn_farmers", "corn_mechanization_level"] },
      { label: "Risk & Resources", fields: ["pest_disease_occurrence", "asf_status", "soil_fertility", "irrigated_area", "rpc_site"] }
    ];

    sections.forEach(sec => {
      const sFields = sec.fields.filter(f => p[f] !== undefined && p[f] !== null && p[f] !== "");
      if (sFields.length === 0) return;
      html += `<div class="popup-section"><b>${sec.label}</b>`;
      sFields.forEach(f => {
        const cfg = INDICATOR_CONFIG[f];
        const label = cfg ? cfg.label : f;
        const val = Utils.formatValue(p[f], f);
        const highlight = f === highlightField ? " popup-highlight" : "";
        html += `<div class="popup-row${highlight}"><span>${label}:</span><b>${val}</b></div>`;
      });
      html += `</div>`;
    });

    if (p._priorityScore !== undefined) {
      html += `<div class="popup-section"><b>Planning Priority</b>
        <div class="popup-row"><span>Score:</span><b>${p._priorityScore}/100</b></div>
        <div class="popup-row"><span>Class:</span><b>${p._priorityClass}</b></div>
      </div>`;
    }

    layer.bindPopup(html, { maxWidth: 300, className: "main-popup" });

    // On any click: notify ClimatePanel of the location (updates panel if open)
    layer.on("click", () => {
      const centroid = Utils.getCentroid(feature);
      window.dispatchEvent(new CustomEvent("area:selected", {
        detail: { properties: p, name, centroid }
      }));
      if (typeof ClimatePanel !== "undefined") {
        ClimatePanel.notifyMapClick(centroid[0], centroid[1], name);
      }
    });

    // Also add a dedicated button inside the popup that opens the panel
    layer.on("popupopen", () => {
      const centroid = Utils.getCentroid(feature);
      setTimeout(() => {
        const container = layer.getPopup()?.getElement();
        if (!container || container.querySelector(".popup-climate-btn")) return;
        const btn = document.createElement("button");
        btn.className = "popup-climate-btn";
        btn.textContent = "🌦️ Open Climate Info Panel";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof ClimatePanel !== "undefined") {
            ClimatePanel.openForLocation(centroid[0], centroid[1], name);
          }
        });
        container.appendChild(btn);
      }, 50);
    });
  }

  function attachHoverTooltip(feature, layer, field) {
    const name = areaName(feature.properties);
    const val = feature.properties[field];
    const label = INDICATOR_CONFIG[field]?.label || field;
    layer.bindTooltip(
      `<b>${name}</b><br>${label}: <b>${Utils.formatValue(val, field)}</b>`,
      { sticky: true, className: "hover-tip" }
    );
  }

  // ============================================================
  // LEGEND RENDERERS
  // ============================================================
  function renderChoroplethLegend(field, breaks, scheme, isGradient, customTitle = null) {
    if (legendControl) map.removeControl(legendControl);
    const cfg = field ? INDICATOR_CONFIG[field] : null;
    const title = customTitle || cfg?.label || field || "";
    const unit  = cfg?.unit || "";
    const higherIsBetter = cfg?.higherIsBetter;

    // Direction hint for CRVA indicators
    let dirHint = "";
    if (higherIsBetter === true)  dirHint = `<div class="legend-dir legend-dir-good">▲ Higher = better</div>`;
    if (higherIsBetter === false) dirHint = `<div class="legend-dir legend-dir-bad">▲ Higher = more vulnerable</div>`;
    // Special label for sensitivity (diverging)
    let lowHighLabel = "";
    if (cfg?.colorScheme === "RdBu_r") {
      lowHighLabel = `<div class="legend-diverge-hint"><span style="color:#4393c3">■ Gain</span> &nbsp; <span style="color:#d73027">■ Loss</span></div>`;
    }

    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `<div class="legend-title">${title}</div>`;
      if (unit) div.innerHTML += `<div class="legend-unit">${unit}</div>`;
      div.innerHTML += dirHint + lowHighLabel;

      if (isGradient) {
        const gradient = `linear-gradient(to right, ${scheme[0]}, ${scheme[scheme.length - 1]})`;
        div.innerHTML += `
          <div style="background:${gradient};height:12px;width:160px;border-radius:2px;border:1px solid #ccc"></div>
          <div style="display:flex;justify-content:space-between;font-size:10px;width:160px;">
            <span>${Utils.formatValue(breaks[0], field)}</span>
            <span>${Utils.formatValue(breaks[breaks.length - 1], field)}</span>
          </div>`;
      } else {
        for (let i = 0; i < scheme.length && i < breaks.length - 1; i++) {
          div.innerHTML += `<div class="legend-item">
            <span class="legend-swatch" style="background:${scheme[i]}"></span>
            <span>${Utils.formatValue(breaks[i], field)} – ${Utils.formatValue(breaks[i + 1], field)}</span>
          </div>`;
        }
      }
      div.innerHTML += `<div class="legend-item"><span class="legend-swatch" style="background:#eeeeee"></span><span>No Data</span></div>`;
      return div;
    };
    legendControl.addTo(map);
  }

  function renderProportionalLegend(field, maxVal, maxRadius) {
    if (legendControl) map.removeControl(legendControl);
    const cfg = INDICATOR_CONFIG[field];
    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `<div class="legend-title">${cfg?.label || field}</div>
        <div style="font-size:11px;color:#666">Circle size = magnitude</div>
        <div class="legend-item">
          <span class="legend-circle" style="width:${maxRadius}px;height:${maxRadius}px;background:#1a6b3c;opacity:0.7;border-radius:50%;display:inline-block"></span>
          <span>Max: ${Utils.formatValue(maxVal, field)}</span>
        </div>`;
      return div;
    };
    legendControl.addTo(map);
  }

  function renderBivariateLegend(fieldA, fieldB) {
    if (legendControl) map.removeControl(legendControl);
    const lA = INDICATOR_CONFIG[fieldA]?.label || fieldA;
    const lB = INDICATOR_CONFIG[fieldB]?.label || fieldB;
    const bv = COLOR_SCHEMES.Bivariate;

    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend bivariate-legend");
      div.innerHTML = `<div class="legend-title">Bivariate</div>
        <div class="bv-axis-y">${lA} →</div>
        <table class="bv-table">
          ${["H","M","L"].map(a =>
            `<tr>${["L","M","H"].map(b =>
              `<td style="background:${bv[a+b]}"></td>`
            ).join("")}</tr>`
          ).join("")}
        </table>
        <div class="bv-axis-x">${lB} →</div>
        <div class="bv-note">High+High = <span style="color:${bv["HH"]}">■</span> Highest Priority</div>`;
      return div;
    };
    legendControl.addTo(map);
  }

  function renderCategoricalLegend(title, colorMap) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `<div class="legend-title">${title}</div>`;
      Object.entries(colorMap).forEach(([label, color]) => {
        div.innerHTML += `<div class="legend-item">
          <span class="legend-swatch" style="background:${color}"></span>
          <span>${label}</span>
        </div>`;
      });
      return div;
    };
    legendControl.addTo(map);
  }

  function renderPieLegend(labels, colors) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `<div class="legend-title">Composition</div>`;
      labels.forEach((lbl, i) => {
        div.innerHTML += `<div class="legend-item">
          <span class="legend-swatch" style="background:${colors[i]}"></span>
          <span>${lbl}</span>
        </div>`;
      });
      return div;
    };
    legendControl.addTo(map);
  }

  function renderBarLegend(labels, colors) {
    if (legendControl) map.removeControl(legendControl);
    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `<div class="legend-title">Bar Chart Symbols</div>`;
      labels.forEach((lbl, i) => {
        div.innerHTML += `<div class="legend-item">
          <span class="legend-swatch" style="background:${colors[i]}"></span>
          <span>${lbl}</span>
        </div>`;
      });
      return div;
    };
    legendControl.addTo(map);
  }

  function renderRankedLegend(field, direction, n) {
    if (legendControl) map.removeControl(legendControl);
    const label = INDICATOR_CONFIG[field]?.label || field;
    legendControl = L.control({ position: "bottomright" });
    legendControl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      div.innerHTML = `<div class="legend-title">${direction === "top" ? "Top" : "Bottom"} ${n}: ${label}</div>
        <div class="legend-item"><span class="legend-swatch" style="background:#d73027"></span><span>Rank 1 (${direction === "top" ? "Highest" : "Lowest"})</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:#ffffcc"></span><span>Rank ${n}</span></div>
        <div class="legend-item"><span class="legend-swatch" style="background:#dddddd;opacity:0.5"></span><span>Not ranked</span></div>`;
      return div;
    };
    legendControl.addTo(map);
  }

  function renderPriorityLegend() {
    const colors = {
      "Very High Priority": "#d73027",
      "High Priority":      "#f46d43",
      "Moderate Priority":  "#fee090",
      "Low Priority":       "#a6d96a",
      "Data Insufficient":  "#cccccc"
    };
    renderCategoricalLegend("Planning Priority", colors);
  }

  return {
    init,
    clearLayers,
    renderChoropleth,
    renderProportional,
    renderBivariate,
    renderDominantCrop,
    renderPieSymbols,
    renderBarSymbols,
    renderRanked,
    renderDeviation,
    renderRatio,
    renderPriority,
    attachPopup
  };
})();
