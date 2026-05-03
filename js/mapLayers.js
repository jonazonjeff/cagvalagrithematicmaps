// ============================================================
// mapLayers.js — Basemaps, Categorized Facility Layers,
//                Aggregate Label Overlays for District/Province View
// ============================================================

const MapLayers = (() => {
  let map = null;
  let basemapLayers = {};
  let currentBasemap = null;

  // Per-category layer entries  { categoryKey: { clusterGroup, activeLayer } }
  let facilityLayers = {};
  // Per-type visibility state  { "RPC": true, "DD": false, … }
  let typeVisibility = {};
  // All markers stored for type-filtering  [{ marker, typeKey }]
  let allMarkers = [];
  // Aggregate label layer (district / province view)
  let aggregateLabelLayer = null;

  // ============================================================
  // INIT
  // ============================================================
  function init(leafletMap) {
    map = leafletMap;
    initBasemaps();
    // Default all facility types to off
    Object.values(FACILITY_CATEGORIES).forEach(cat => {
      Object.keys(cat.types).forEach(typeKey => {
        typeVisibility[typeKey] = false;
      });
    });
  }

  // ============================================================
  // BASEMAP MANAGEMENT
  // ============================================================
  function initBasemaps() {
    Object.entries(BASEMAPS).forEach(([key, cfg]) => {
      basemapLayers[key] = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: 19,
        subdomains: "abcd"
      });
    });
    const defaultKey = "cartoLight";
    basemapLayers[defaultKey].addTo(map);
    currentBasemap = defaultKey;
  }

  function switchBasemap(key) {
    if (!basemapLayers[key]) return;
    if (currentBasemap && basemapLayers[currentBasemap]) {
      map.removeLayer(basemapLayers[currentBasemap]);
    }
    basemapLayers[key].addTo(map);
    currentBasemap = key;
    document.querySelectorAll(".basemap-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.basemap === key);
    });
  }

  // ============================================================
  // FACILITY HELPERS
  // ============================================================
  function getFacilityTypeCfg(typeKey) {
    for (const cat of Object.values(FACILITY_CATEGORIES)) {
      if (cat.types[typeKey]) return cat.types[typeKey];
    }
    return null;
  }

  function getFacilityCategoryKey(typeKey) {
    for (const [catKey, cat] of Object.entries(FACILITY_CATEGORIES)) {
      if (cat.types[typeKey]) return catKey;
    }
    return null;
  }

  function createClusterIcon(cluster, color) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div class="cluster-icon" style="background:${color};border-color:${color}">${count}</div>`,
      className: "facility-cluster",
      iconSize: [34, 34]
    });
  }

  // ============================================================
  // LOAD FACILITIES — build per-category cluster groups
  // ============================================================
  function loadFacilities(facilities, geojson) {
    clearAllFacilityLayers();
    allMarkers = [];
    if (!facilities || facilities.length === 0) return;

    // Build cluster groups per category
    Object.entries(FACILITY_CATEGORIES).forEach(([catKey, cat]) => {
      facilityLayers[catKey] = {
        clusterGroup: null,
        activeLayer: null,
        markers: []      // { marker, typeKey }
      };
    });

    // Create markers, assign to category
    facilities.forEach(f => {
      const typeCfg = getFacilityTypeCfg(f.facility_type);
      const catKey  = getFacilityCategoryKey(f.facility_type);
      if (!typeCfg || !catKey) return;

      let lat = Utils.parseNumeric(f.latitude);
      let lng = Utils.parseNumeric(f.longitude);
      let isApproximate = false;

      if ((lat === null || lng === null) && geojson) {
        const feat = geojson.features.find(ft => {
          const mun = ft.properties.municipality || ft.properties.NAME || "";
          return Utils.normalizeName(mun) === Utils.normalizeName(f.municipality);
        });
        if (feat) {
          const c = Utils.getCentroid(feat);
          lat = c[0]; lng = c[1];
          isApproximate = true;
        }
      }
      if (lat === null || lng === null) return;

      const iconHtml = `<div class="facility-marker" style="background:${typeCfg.color};border-color:${typeCfg.color}">${typeCfg.icon}</div>`;
      const icon = L.divIcon({ html: iconHtml, className: "facility-icon", iconSize: [28, 28], iconAnchor: [14, 14] });
      const marker = L.marker([lat, lng], { icon });
      marker._facilityType = f.facility_type;

      // Build popup
      const extraFields = [
        f.capacity       ? `<div class="popup-row"><b>Capacity:</b> ${f.capacity}</div>` : "",
        f.service_area_ha? `<div class="popup-row"><b>Service Area:</b> ${f.service_area_ha} ha</div>` : "",
        f.year_constructed?`<div class="popup-row"><b>Year Built:</b> ${f.year_constructed}</div>` : "",
        f.remarks        ? `<div class="popup-row"><b>Notes:</b> ${f.remarks}</div>` : "",
        isApproximate    ? `<div class="popup-warning">📍 Location approximate (municipality centroid)</div>` : ""
      ].join("");

      marker.bindPopup(`
        <div class="popup-header">${f.facility_name || "Facility"}</div>
        <div class="popup-subhead" style="color:${typeCfg.color}">${typeCfg.icon} ${typeCfg.label}</div>
        <div class="popup-row"><b>Municipality:</b> ${f.municipality || "N/A"}, ${f.province || ""}</div>
        <div class="popup-row"><b>Status:</b> ${f.status || "N/A"}</div>
        ${extraFields}
      `, { maxWidth: 280 });

      marker.bindTooltip(
        `<b>${f.facility_name || typeCfg.label}</b><br>${f.municipality || ""}, ${f.province || ""}`,
        { sticky: true, className: "hover-tip" }
      );

      facilityLayers[catKey].markers.push({ marker, typeKey: f.facility_type });
      allMarkers.push({ marker, typeKey: f.facility_type, catKey });
    });

    // Initial render based on current visibility state
    refreshFacilityVisibility();
  }

  // ============================================================
  // TYPE / CATEGORY VISIBILITY
  // ============================================================
  function setTypeVisibility(typeKey, visible) {
    typeVisibility[typeKey] = visible;
    refreshFacilityVisibility();
  }

  function setCategoryVisibility(catKey, visible) {
    const cat = FACILITY_CATEGORIES[catKey];
    if (!cat) return;
    Object.keys(cat.types).forEach(typeKey => {
      typeVisibility[typeKey] = visible;
    });
    // Sync type checkboxes in UI
    Object.keys(cat.types).forEach(typeKey => {
      const cb = document.getElementById(`toggle-type-${typeKey}`);
      if (cb) cb.checked = visible;
    });
    refreshFacilityVisibility();
  }

  function refreshFacilityVisibility() {
    // Remove old active layers
    Object.values(facilityLayers).forEach(entry => {
      if (entry.activeLayer && map.hasLayer(entry.activeLayer)) {
        map.removeLayer(entry.activeLayer);
      }
      entry.activeLayer = null;
    });

    // Rebuild one cluster per category containing only visible-type markers
    Object.entries(facilityLayers).forEach(([catKey, entry]) => {
      const cat = FACILITY_CATEGORIES[catKey];
      const visibleMarkers = entry.markers.filter(m => typeVisibility[m.typeKey]);
      if (visibleMarkers.length === 0) return;

      const cluster = typeof L.markerClusterGroup !== "undefined"
        ? L.markerClusterGroup({
            chunkedLoading: true,
            iconCreateFunction: (c) => createClusterIcon(c, cat.groupColor)
          })
        : L.layerGroup();

      visibleMarkers.forEach(m => cluster.addLayer(m.marker));
      cluster.addTo(map);
      entry.activeLayer = cluster;
    });
  }

  function clearAllFacilityLayers() {
    Object.values(facilityLayers).forEach(entry => {
      if (entry.activeLayer && map.hasLayer(entry.activeLayer)) map.removeLayer(entry.activeLayer);
      if (entry.clusterGroup && map.hasLayer(entry.clusterGroup)) map.removeLayer(entry.clusterGroup);
    });
    facilityLayers = {};
    allMarkers = [];
  }

  // Legacy single-toggle compat
  function renderFacilities(facilities, geojson) { loadFacilities(facilities, geojson); }
  function clearFacilities() { clearAllFacilityLayers(); }

  // ============================================================
  // AGGREGATE LABEL OVERLAY (District / Province view)
  // Renders centroid labels showing area name + indicator value
  // ============================================================
  function renderAggregateLabels(geojson, indicatorKey, viewType) {
    clearAggregateLabels();
    if (!geojson || !geojson.features) return;

    const labels = [];

    geojson.features.forEach(f => {
      const props = f.properties;
      if (props._joined === false) return; // skip unmatched shapes

      const name = props[viewType] || props.province || props.NAME || props.municipality || "";
      const val  = props[indicatorKey];
      const formatted = (val !== undefined && val !== null && val !== "")
        ? Utils.formatValue(val, indicatorKey)
        : "N/A";

      const centroid = Utils.getCentroid(f);

      const marker = L.marker(centroid, {
        icon: L.divIcon({
          html: `<div class="agg-label">
                   <div class="agg-label-name">${name}</div>
                   <div class="agg-label-value">${formatted}</div>
                 </div>`,
          className: "agg-label-wrapper",
          iconSize: null,
          iconAnchor: null
        }),
        interactive: false,
        zIndexOffset: -100
      });

      labels.push(marker);
    });

    if (labels.length > 0) {
      aggregateLabelLayer = L.layerGroup(labels).addTo(map);
    }
  }

  function clearAggregateLabels() {
    if (aggregateLabelLayer && map.hasLayer(aggregateLabelLayer)) {
      map.removeLayer(aggregateLabelLayer);
    }
    aggregateLabelLayer = null;
  }

  // ============================================================
  // BUFFER ZONES (Turf.js optional)
  // ============================================================
  function renderFacilityBuffers(facilities, radiusKm, geojson) {
    if (typeof turf === "undefined") {
      Utils.showToast("Buffer zones require Turf.js library.", "info");
      return;
    }
    if (map._bufferLayer) map.removeLayer(map._bufferLayer);
    const buffs = [];
    facilities.forEach(f => {
      const lat = Utils.parseNumeric(f.latitude);
      const lng = Utils.parseNumeric(f.longitude);
      if (lat === null || lng === null) return;
      buffs.push(turf.buffer(turf.point([lng, lat]), radiusKm, { units: "kilometers" }));
    });
    if (!buffs.length) return;
    map._bufferLayer = L.geoJSON(turf.featureCollection(buffs), {
      style: { fillColor: "#1a6b3c", fillOpacity: 0.1, color: "#1a6b3c", weight: 1.5, dashArray: "4,4" }
    }).addTo(map);
  }

  // ============================================================
  // FIT / ZOOM HELPERS
  // ============================================================
  function fitToGeoJSON(geojson) {
    if (!geojson || !geojson.features || !geojson.features.length) return;
    try {
      const bounds = L.geoJSON(geojson).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch (e) { map.setView(APP_CONFIG.mapCenter, APP_CONFIG.mapZoom); }
  }

  function zoomToFeature(feature) {
    try { map.fitBounds(L.geoJSON(feature).getBounds(), { padding: [40, 40], maxZoom: 12 }); } catch (e) {}
  }

  function zoomToName(name, geojson) {
    if (!geojson) return false;
    const norm = Utils.normalizeName(name);
    const match = geojson.features.find(f => {
      const mun = f.properties.municipality || f.properties.NAME || f.properties.province || "";
      return Utils.normalizeName(mun).includes(norm);
    });
    if (match) { zoomToFeature(match); return match; }
    return false;
  }

  return {
    init,
    switchBasemap,
    loadFacilities,
    renderFacilities,
    clearFacilities,
    clearAllFacilityLayers,
    setTypeVisibility,
    setCategoryVisibility,
    refreshFacilityVisibility,
    getFacilityTypeCfg,
    getFacilityCategoryKey,
    renderAggregateLabels,
    clearAggregateLabels,
    renderFacilityBuffers,
    fitToGeoJSON,
    zoomToFeature,
    zoomToName
  };
})();
