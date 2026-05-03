// ============================================================
// aggregation.js — Aggregates Municipal Data to District/Province
// ============================================================

const Aggregation = (() => {

  /**
   * Aggregate an array of row objects by a groupField.
   * Uses rules from INDICATOR_CONFIG for each field.
   * @param {Array} rows - array of data row objects
   * @param {string} groupField - field name to group by (e.g., "district", "province")
   * @returns {Object} - map of groupValue → aggregated row
   */
  function aggregateBy(rows, groupField) {
    if (!rows || rows.length === 0) return {};

    // Group rows
    const groups = {};
    rows.forEach(row => {
      const groupVal = row[groupField] || row[groupField.toLowerCase()] || "Unknown";
      if (!groups[groupVal]) groups[groupVal] = [];
      groups[groupVal].push(row);
    });

    const result = {};

    Object.entries(groups).forEach(([groupVal, groupRows]) => {
      const agg = {
        [groupField]: groupVal,
        _rowCount: groupRows.length
      };

      // Copy non-indicator fields
      if (groupField === "district") {
        agg.province = groupRows[0].province || "";
      }
      if (groupField === "province") {
        agg.province = groupVal;
      }

      // Aggregate each indicator field
      Object.entries(INDICATOR_CONFIG).forEach(([key, cfg]) => {
        agg[key] = aggregateField(groupRows, key, cfg);
      });

      // Compute ratio-type yields at aggregate level
      agg.rice_yield_2023 = computeRatio(agg.rice_production_2023, agg.rice_area_2023);
      agg.rice_yield_2025 = computeRatio(agg.rice_production_2025, agg.rice_area_2025);
      agg.corn_yield_2023 = computeRatio(agg.corn_production_2023, agg.corn_area_2023);
      agg.corn_yield_2025 = computeRatio(agg.corn_production_2025, agg.corn_area_2025);

      result[groupVal] = agg;
    });

    return result;
  }

  /**
   * Aggregate a single field across a group of rows.
   */
  function aggregateField(rows, fieldKey, cfg) {
    if (!cfg) return null;

    const type = cfg.aggregation;
    const values = rows
      .map(r => Utils.parseNumeric(r[fieldKey]))
      .filter(v => v !== null && !isNaN(v));

    if (type === "sum") {
      return values.length > 0 ? values.reduce((s, v) => s + v, 0) : null;
    }

    if (type === "weighted_average") {
      const weightField = cfg.weightField || "population";
      let weightedSum = 0;
      let totalWeight = 0;
      rows.forEach(r => {
        const val = Utils.parseNumeric(r[fieldKey]);
        const wt = Utils.parseNumeric(r[weightField]);
        if (val !== null && wt !== null && wt > 0) {
          weightedSum += val * wt;
          totalWeight += wt;
        }
      });
      return totalWeight > 0 ? weightedSum / totalWeight : (values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null);
    }

    if (type === "ratio") {
      // Handled after all aggregation (rice/corn yield)
      return null;
    }

    if (type === "dominant") {
      // Most common category value
      if (values.length === 0) {
        const strVals = rows.map(r => r[fieldKey]).filter(v => v);
        return strVals.length > 0 ? mostCommon(strVals) : null;
      }
      return mostCommon(rows.map(r => r[fieldKey]).filter(v => v));
    }

    if (type === "mean") {
      return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
    }

    return null;
  }

  function computeRatio(numerator, denominator) {
    const n = Utils.parseNumeric(numerator);
    const d = Utils.parseNumeric(denominator);
    if (n === null || d === null || d === 0) return null;
    return n / d;
  }

  function mostCommon(arr) {
    if (!arr || arr.length === 0) return null;
    const freq = {};
    arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Merge aggregated data back onto district or province GeoJSON
   */
  function joinAggToGeoJSON(geojson, aggData, groupField) {
    if (!geojson) return null;
    geojson.features.forEach(f => {
      const groupVal = f.properties[groupField] ||
        f.properties[groupField.toUpperCase()] ||
        f.properties.NAME || "";
      const match = aggData[groupVal] || Object.values(aggData).find(a =>
        Utils.normalizeName(a[groupField]) === Utils.normalizeName(groupVal)
      );
      if (match) {
        Object.assign(f.properties, match);
        f.properties._joined = true;
      }
    });
    return geojson;
  }

  /**
   * Compute ratio between two fields for all rows.
   * Returns array of { ...row, _ratio: value }
   * Handles division by zero.
   */
  function computeRatioField(rows, numeratorField, denominatorField) {
    return rows.map(row => {
      const n = Utils.parseNumeric(row[numeratorField]);
      const d = Utils.parseNumeric(row[denominatorField]);
      let ratio = null;
      let warning = null;
      if (d === null || d === 0) {
        warning = "Division by zero or missing denominator";
      } else if (n === null) {
        warning = "Missing numerator";
      } else {
        ratio = n / d;
      }
      return { ...row, _ratio: ratio, _ratioWarning: warning };
    });
  }

  /**
   * Compute regional average for all numeric indicators
   */
  function computeRegionalAverages(rows) {
    const averages = {};
    Object.keys(INDICATOR_CONFIG).forEach(key => {
      const vals = Utils.getValues(rows, key);
      if (vals.length > 0) {
        averages[key] = vals.reduce((s, v) => s + v, 0) / vals.length;
      } else {
        averages[key] = null;
      }
    });
    return averages;
  }

  /**
   * Compute deviation from regional average for all rows
   */
  function computeDeviations(rows, field) {
    const vals = Utils.getValues(rows, field);
    if (vals.length === 0) return rows.map(r => ({ ...r, _deviation: null, _devClass: "N/A" }));

    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const stdDev = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / vals.length);

    return rows.map(row => {
      const val = Utils.parseNumeric(row[field]);
      if (val === null) return { ...row, _deviation: null, _devPct: null, _devClass: "N/A", _devAvg: avg };
      const diff = val - avg;
      const pctDiff = avg !== 0 ? (diff / avg) * 100 : 0;
      let devClass;
      if (diff < -1.5 * stdDev) devClass = "Far Below";
      else if (diff < -0.5 * stdDev) devClass = "Below";
      else if (diff <= 0.5 * stdDev) devClass = "Near Average";
      else if (diff <= 1.5 * stdDev) devClass = "Above";
      else devClass = "Far Above";
      return { ...row, _deviation: diff, _devPct: pctDiff, _devClass: devClass, _devAvg: avg };
    });
  }

  return {
    aggregateBy,
    joinAggToGeoJSON,
    computeRatioField,
    computeRegionalAverages,
    computeDeviations
  };
})();
