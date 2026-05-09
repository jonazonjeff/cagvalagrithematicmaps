// ============================================================
// priorityScoring.js — Composite Priority Score Engine
// ============================================================

const PriorityScoring = (() => {

  /**
   * Normalize all values of a field to 0-1 across all rows.
   * For categorical fields, map to numeric score first.
   */
  function normalizeField(rows, field) {
    const vals = rows.map(r => {
      const v = Utils.parseNumeric(r[field]);
      if (v !== null) return v;
      // Categorical mappings
      const catMaps = {
        pest_disease_occurrence: { "High": 1.0, "Moderate": 0.66, "Low": 0.33, "None": 0 },
        asf_status: { "Affected": 1.0, "At-risk": 0.5, "Clear": 0 },
        soil_fertility: { "Low": 1.0, "Moderate": 0.5, "High": 0 } // inverted: Low = worse
      };
      if (catMaps[field] && r[field]) return catMaps[field][r[field]] ?? null;
      return null;
    });

    const numericVals = vals.filter(v => v !== null);
    if (numericVals.length === 0) return rows.map(() => 0);

    const min = Math.min(...numericVals);
    const max = Math.max(...numericVals);

    return vals.map(v => v !== null ? Utils.normalize(v, min, max) : 0);
  }

  /**
   * Compute gap-based metrics (for yield gap, mechanization gap, irrigation gap)
   * Gap = max - value (higher gap = worse)
   */
  function computeGap(rows, field) {
    const vals = rows.map(r => Utils.parseNumeric(r[field]));
    const numericVals = vals.filter(v => v !== null);
    if (numericVals.length === 0) return rows.map(() => 0);
    const max = Math.max(...numericVals);
    return vals.map(v => v !== null ? (max - v) / (max || 1) : 0.5);
  }

  function normalizeAbsField(rows, field) {
    const vals = rows.map(r => {
      const v = Utils.parseNumeric(r[field]);
      return v !== null ? Math.abs(v) : null;
    });
    const numericVals = vals.filter(v => v !== null);
    if (numericVals.length === 0) return rows.map(() => 0);

    const min = Math.min(...numericVals);
    const max = Math.max(...numericVals);
    return vals.map(v => v !== null ? Utils.normalize(v, min, max) : 0);
  }

  /**
   * Score all rows using a given priority model.
   * @param {Array} rows - array of data rows
   * @param {string} modelKey - key from PRIORITY_MODELS
   * @param {Object} customWeights - optional override weights
   * @returns {Array} rows with added _priorityScore, _priorityClass, _priorityModel
   */
  function scoreAll(rows, modelKey, customWeights = null) {
    const model = PRIORITY_MODELS[modelKey];
    if (!model) return rows;

    const weights = customWeights || model.weights;
    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

    // Pre-compute normalized values for each component
    const components = {};
    Object.keys(weights).forEach(compKey => {
      // Map component keys to actual field names
      const fieldMap = {
        rice_yield_gap: null,       // computed below
        corn_yield_gap: null,
        rice_mechanization_gap: null,
        corn_mechanization_gap: null,
        irrigation_gap: null,
        pest_disease_score: "pest_disease_occurrence",
        asf_score: "asf_status",
        soil_fertility_gap: "soil_fertility",
        prism_area_gap_abs: "prism_area_gap_vs_app_ha",
      };

      if (compKey === "rice_yield_gap") {
        components[compKey] = computeGap(rows, "rice_yield_2023");
      } else if (compKey === "corn_yield_gap") {
        components[compKey] = computeGap(rows, "corn_yield_2023");
      } else if (compKey === "rice_mechanization_gap") {
        components[compKey] = computeGap(rows, "rice_mechanization_level");
      } else if (compKey === "corn_mechanization_gap") {
        components[compKey] = computeGap(rows, "corn_mechanization_level");
      } else if (compKey === "irrigation_gap") {
        components[compKey] = computeGap(rows, "irrigated_area");
      } else if (compKey === "soil_fertility_gap") {
        // inverted: Low fertility = high gap score
        const base = normalizeField(rows, "soil_fertility");
        components[compKey] = base.map(v => 1 - v);
      } else if (compKey === "prism_area_gap_abs") {
        components[compKey] = normalizeAbsField(rows, "prism_area_gap_vs_app_ha");
      } else {
        const actualField = fieldMap[compKey] || compKey;
        components[compKey] = normalizeField(rows, actualField);
      }
    });

    // Compute weighted score for each row
    return rows.map((row, i) => {
      let score = 0;
      const breakdown = {};

      Object.entries(weights).forEach(([compKey, weight]) => {
        const normalizedVal = components[compKey] ? components[compKey][i] : 0;
        const contribution = normalizedVal * weight;
        score += contribution;
        breakdown[compKey] = {
          weight: weight,
          normalizedValue: +(normalizedVal * 100).toFixed(1),
          contribution: +(contribution * 100).toFixed(1)
        };
      });

      // Normalize to percentage of total possible weight
      const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;

      let priorityClass;
      if (normalizedScore >= 0.75) priorityClass = "Very High Priority";
      else if (normalizedScore >= 0.55) priorityClass = "High Priority";
      else if (normalizedScore >= 0.35) priorityClass = "Moderate Priority";
      else if (normalizedScore >= 0.15) priorityClass = "Low Priority";
      else priorityClass = "Data Insufficient";

      return {
        ...row,
        _priorityScore: +(normalizedScore * 100).toFixed(1),
        _priorityClass: priorityClass,
        _priorityModel: model.label,
        _priorityBreakdown: breakdown
      };
    });
  }

  /**
   * Generate HTML breakdown table for a row's priority score
   */
  function formatBreakdown(row, modelKey) {
    const model = PRIORITY_MODELS[modelKey];
    if (!row._priorityBreakdown || !model) return "";

    const labelMap = {
      poor_rice_farmers: "Rice Farms Below 0.5 ha",
      poor_corn_farmers: "Corn Farms Below 0.5 ha",
      poverty_2023: "Poverty Incidence 2023",
      rice_yield_gap: "Rice Yield Gap",
      corn_yield_gap: "Corn Yield Gap",
      rice_mechanization_gap: "Rice Mechanization Gap",
      corn_mechanization_gap: "Corn Mechanization Gap",
      irrigation_gap: "Irrigation Gap",
      pest_disease_score: "Pest & Disease Risk",
      asf_score: "ASF Risk",
      soil_fertility_gap: "Soil Fertility Constraint",
      prism_standing_crop_area: "Standing Crop Area",
      prism_upcoming_harvest_area: "May-Jun Harvest Area",
      prism_area_gap_abs: "PRiSM Area Gap",
      stunting: "Stunting Rate",
      underweight: "Underweight Rate",
      wasting: "Wasting Rate",
      population: "Population"
    };

    let html = `<table class="breakdown-table">
      <thead><tr><th>Component</th><th>Weight</th><th>Score</th><th>Contribution</th></tr></thead>
      <tbody>`;

    Object.entries(row._priorityBreakdown).forEach(([key, b]) => {
      html += `<tr>
        <td>${labelMap[key] || key}</td>
        <td>${(b.weight * 100).toFixed(0)}%</td>
        <td>${b.normalizedValue}/100</td>
        <td>${b.contribution}/100</td>
      </tr>`;
    });

    html += `</tbody></table>
      <div class="priority-total">
        <strong>Total Priority Score: ${row._priorityScore}/100</strong><br>
        <strong>Classification: <span class="priority-${row._priorityClass.toLowerCase().replace(/\s+/g,'-')}">${row._priorityClass}</span></strong>
      </div>`;

    return html;
  }

  /**
   * Color by priority class
   */
  function getPriorityColor(cls) {
    const colors = {
      "Very High Priority": "#d73027",
      "High Priority":      "#f46d43",
      "Moderate Priority":  "#fee090",
      "Low Priority":       "#a6d96a",
      "Data Insufficient":  "#cccccc"
    };
    return colors[cls] || "#cccccc";
  }

  return { scoreAll, formatBreakdown, getPriorityColor, normalizeField };
})();
