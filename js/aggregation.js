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
      const groupVal = getGroupValue(row, groupField);
      if (!groups[groupVal]) groups[groupVal] = [];
      groups[groupVal].push(row);
    });

    const result = {};

    Object.entries(groups).forEach(([groupVal, groupRows]) => {
      const agg = {
        [groupField]: groupVal,
        _areaKey: groupVal,
        _rowCount: groupRows.length
      };

      // Copy non-indicator fields
      if (groupField === "district") {
        agg.province = groupRows[0].province || "";
        agg.district_label = formatDistrictLabel(groupRows[0].province, groupRows[0].district);
        agg._areaName = agg.district_label;
      }
      if (groupField === "province") {
        agg.province = groupVal;
        agg._areaName = groupVal;
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
      agg.plans_2027_budget_per_small_farm = computeRatio(
        agg.plans_projects_2027_budget,
        (Utils.parseNumeric(agg.poor_rice_farmers) || 0) + (Utils.parseNumeric(agg.poor_corn_farmers) || 0)
      );

      result[groupVal] = agg;
    });

    return result;
  }

  function getGroupValue(row, groupField) {
    if (groupField === "district") {
      return buildDistrictKey(row.province, row.district);
    }
    if (groupField === "province") {
      return row.province || row.ADM2_EN || "Unknown";
    }
    return row[groupField] || row[groupField.toLowerCase()] || "Unknown";
  }

  function buildDistrictKey(province, district) {
    const provinceName = province || "Unknown";
    const districtName = district || "";
    const provinceKey = String(provinceName).replace(/\s+/g, "");
    const match = String(districtName).match(/(\d+)(?:st|nd|rd|th)?(?:\s+District)?$/i);
    if (match) return `${provinceKey}${match[1]}`;
    if (/^lone(?:\s+district)?$/i.test(String(districtName).trim()) ||
        Utils.normalizeName(districtName) === Utils.normalizeName(provinceName)) {
      return `${provinceKey}LoneDistrict`;
    }
    return districtName ? `${provinceKey}${String(districtName).replace(/\s+/g, "")}` : "Unknown";
  }

  function formatDistrictLabel(province, district) {
    if (!district) return province || "Unknown District";
    if (Utils.normalizeName(district) === Utils.normalizeName(province)) return `${province} Lone District`;
    return `${province} ${district}`;
  }

  function aggregateGeoJSONBy(municipalGeoJSON, groupField) {
    if (!municipalGeoJSON || !municipalGeoJSON.features) return null;

    const municipalRows = municipalGeoJSON.features.map(f => f.properties).filter(p => p._joined !== false);
    const aggData = aggregateBy(municipalRows, groupField);
    const featuresByKey = {};

    municipalGeoJSON.features.forEach(feature => {
      if (feature.properties._joined === false) return;
      const key = getGroupValue(feature.properties, groupField);
      if (!featuresByKey[key]) featuresByKey[key] = [];
      const clone = Utils.deepClone(feature);
      clone.properties = { _aggKey: key };
      featuresByKey[key].push(clone);
    });

    const features = Object.entries(featuresByKey).map(([key, features]) => {
      const geometry = dissolveGeometries(features, key);
      return {
        type: "Feature",
        properties: { ...(aggData[key] || {}), _joined: !!aggData[key] },
        geometry
      };
    });

    return {
      type: "FeatureCollection",
      features
    };
  }

  function dissolveGeometries(features, key) {
    if (typeof turf !== "undefined" && turf.dissolve && features.length > 0) {
      try {
        const dissolved = turf.dissolve({
          type: "FeatureCollection",
          features
        }, { propertyName: "_aggKey" });
        if (dissolved?.type === "Feature" && dissolved.geometry) return dissolved.geometry;
        const match = dissolved?.features?.find(f => f.properties?._aggKey === key) || dissolved?.features?.[0];
        if (match?.geometry) return match.geometry;
      } catch (e) {
        console.warn(`Could not dissolve ${key}; using grouped multipolygon fallback.`, e);
      }
    }

    const polygons = [];
    features.forEach(feature => {
      const geom = feature.geometry;
      if (!geom) return;
      if (geom.type === "Polygon") polygons.push(geom.coordinates);
      if (geom.type === "MultiPolygon") polygons.push(...geom.coordinates);
    });
    return { type: "MultiPolygon", coordinates: polygons };
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
      return cfg.numerator && cfg.denominator
        ? computeRatio(
            rows.reduce((s, r) => s + (Utils.parseNumeric(r[cfg.numerator]) || 0), 0),
            rows.reduce((s, r) => s + (Utils.parseNumeric(r[cfg.denominator]) || 0), 0)
          )
        : null;
    }

    if (type === "max") {
      return values.length > 0 ? Math.max(...values) : null;
    }

    if (type === "min") {
      return values.length > 0 ? Math.min(...values) : null;
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
    const normalizedAgg = {};
    Object.entries(aggData || {}).forEach(([key, value]) => {
      normalizedAgg[Utils.normalizeName(key)] = value;
      if (value?.[groupField]) normalizedAgg[Utils.normalizeName(value[groupField])] = value;
    });
    geojson.features.forEach(f => {
      const groupVal = getBoundaryGroupValue(f.properties, groupField);
      const match = aggData[groupVal] || normalizedAgg[Utils.normalizeName(groupVal)];
      if (match) {
        Object.assign(f.properties, match);
        f.properties._joined = true;
      } else {
        f.properties._joined = false;
      }
    });
    return geojson;
  }

  function getBoundaryGroupValue(props, groupField) {
    if (groupField === "province") {
      return props.province || props.ADM2_EN || props.PROVINCE || props.NAME || "";
    }
    if (groupField === "district") {
      return props.district || buildDistrictKey(props.ADM2_EN || props.province || "", props.layer || "");
    }
    return props[groupField] || props[groupField.toUpperCase()] || props.NAME || "";
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
    aggregateGeoJSONBy,
    joinAggToGeoJSON,
    computeRatioField,
    computeRegionalAverages,
    computeDeviations
  };
})();
