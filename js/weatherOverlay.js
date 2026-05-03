// ============================================================
// weatherOverlay.js — Live Weather Overlays on Main Map
// Leaflet custom control at topleft, dark professional theme.
// ============================================================

const WeatherOverlay = (() => {

  const API_URL = "https://api.rainviewer.com/public/weather-maps.json";
  const ANIM_MS = 600;

  let map         = null;
  let apiData     = null;
  let apiHost     = "";
  let radarFrames = [];
  let satFrames   = [];
  let layerCache  = {};
  let currentIdx  = 0;
  let animTimer   = null;
  let isPlaying   = false;
  let activeType  = "none";
  let opacity     = 0.7;
  let cd          = null;   // controlDiv shorthand

  // ── Layer definitions — mirrors the reference screenshot style ──
  const LAYERS = [
    { id: "radar",     icon: "&#x1F4E1;", label: "Doppler Radar",    sub: "Animated rainfall radar" },
    { id: "satellite", icon: "&#x1F6F0;", label: "Satellite Imagery", sub: "Infrared cloud tops" },
    { id: "observed",  icon: "&#x1F4C8;", label: "Observed Weather",  sub: "PAGASA synoptic stations", link: "https://bagong.pagasa.dost.gov.ph/climate/agri-weather/farm-weather-forecast" },
    { id: "rainfall",  icon: "&#x1F327;", label: "Rainfall (3hr mm)", sub: "Near real-time accumulation", link: "https://www.panahon.gov.ph/" },
    { id: "tenday",    icon: "&#x1F4C5;", label: "10-Day Forecast",   sub: "PAGASA climate prediction", link: "https://bagong.pagasa.dost.gov.ph/climate/climate-prediction/10-day-climate-forecast" }
  ];

  // Which IDs are live RainViewer overlays (vs external links)
  const LIVE = { radar: true, satellite: true };

  // ── Init ──────────────────────────────────────────────────────
  function init(leafletMap) {
    map = leafletMap;

    const WOControl = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        cd = L.DomUtil.create("div", "wop");
        cd.innerHTML = buildHTML();
        L.DomEvent.disableClickPropagation(cd);
        L.DomEvent.disableScrollPropagation(cd);
        return cd;
      }
    });

    new WOControl().addTo(map);
    setTimeout(wireEvents, 0);
  }

  // ── HTML ──────────────────────────────────────────────────────
  function buildHTML() {
    var rows = LAYERS.map(function(layer) {
      return '<div class="wop-row" data-id="' + layer.id + '">'
        + '<div class="wop-row-icon">' + layer.icon + '</div>'
        + '<div class="wop-row-text">'
        +   '<div class="wop-row-label">' + layer.label + '</div>'
        + '</div>'
        + '<div class="wop-row-chevron">&#x276F;</div>'
        + '</div>'
        + '<div class="wop-panel" id="wop-panel-' + layer.id + '">'
        +   '<div class="wop-panel-sub">' + layer.sub + '</div>'
        +   buildPanelContent(layer)
        + '</div>';
    }).join('');

    return '<div class="wop-header">'
      + '<span class="wop-title">Weather Layers</span>'
      + '<button class="wop-tog" id="wop-main-tog">&#x2715;</button>'
      + '</div>'
      + '<div class="wop-list" id="wop-list">' + rows + '</div>';
  }

  function buildPanelContent(layer) {
    if (!LIVE[layer.id]) {
      if (layer.link) {
        return '<a class="wop-ext-link" href="' + layer.link + '" target="_blank">'
          + '&#x1F517; Open in PAGASA / DA Portal</a>';
      }
      return '';
    }
    // Live overlay panel
    return '<div class="wop-live">'
      + '<div class="wop-player" id="wop-player-' + layer.id + '" style="display:none">'
      +   '<div class="wop-timebar">'
      +     '<button class="wop-ctrl-btn" id="wop-prev-' + layer.id + '">&#x23EE;</button>'
      +     '<span class="wop-ts" id="wop-ts-' + layer.id + '">&#x2014;</span>'
      +     '<button class="wop-ctrl-btn" id="wop-next-' + layer.id + '">&#x23ED;</button>'
      +     '<button class="wop-ctrl-btn wop-play-btn" id="wop-play-' + layer.id + '">&#x25B6;</button>'
      +   '</div>'
      +   '<div class="wop-progress" id="wop-prog-' + layer.id + '"></div>'
      +   '<div class="wop-orow">'
      +     '<span class="wop-olab">Opacity</span>'
      +     '<input type="range" class="wop-slider" id="wop-op-' + layer.id + '" min="10" max="100" value="70">'
      +     '<span class="wop-opct" id="wop-opct-' + layer.id + '">70%</span>'
      +   '</div>'
      + '</div>'
      + '<div class="wop-load-msg" id="wop-msg-' + layer.id + '">'
      +   '<button class="wop-load-btn" id="wop-load-' + layer.id + '">&#x25B6; Load ' + (layer.id === 'radar' ? 'Radar' : 'Satellite') + '</button>'
      + '</div>'
      + '<div class="wop-credit">Source: <a href="https://rainviewer.com" target="_blank">RainViewer</a> (incl. PAGASA feeds)</div>'
      + '</div>';
  }

  // ── Events ────────────────────────────────────────────────────
  function wireEvents() {
    if (!cd) return;

    // Main collapse/expand toggle
    cd.querySelector("#wop-main-tog").addEventListener("click", function() {
      var list = cd.querySelector("#wop-list");
      var tog  = cd.querySelector("#wop-main-tog");
      var hidden = list.style.display === "none";
      list.style.display = hidden ? "block" : "none";
      tog.innerHTML = hidden ? "&#x2715;" : "&#x2630;";
    });

    // Row accordion toggles
    cd.querySelectorAll(".wop-row").forEach(function(row) {
      row.addEventListener("click", function() {
        var id    = row.dataset.id;
        var panel = cd.querySelector("#wop-panel-" + id);
        var chev  = row.querySelector(".wop-row-chevron");
        var isOpen = row.classList.contains("wop-row-open");

        // Close all
        cd.querySelectorAll(".wop-row").forEach(function(r) { r.classList.remove("wop-row-open"); });
        cd.querySelectorAll(".wop-panel").forEach(function(p) { p.style.display = "none"; });
        cd.querySelectorAll(".wop-row-chevron").forEach(function(c) { c.style.transform = ""; });

        if (!isOpen) {
          row.classList.add("wop-row-open");
          panel.style.display = "block";
          chev.style.transform = "rotate(90deg)";
        }
      });
    });

    // Load buttons for live layers
    ["radar", "satellite"].forEach(function(id) {
      var btn = cd.querySelector("#wop-load-" + id);
      if (btn) btn.addEventListener("click", function() { activateLive(id); });
      var prev = cd.querySelector("#wop-prev-" + id);
      if (prev) prev.addEventListener("click", function() { step(-1, id); });
      var next = cd.querySelector("#wop-next-" + id);
      if (next) next.addEventListener("click", function() { step(1, id); });
      var play = cd.querySelector("#wop-play-" + id);
      if (play) play.addEventListener("click", function() { togglePlay(id); });
      var slider = cd.querySelector("#wop-op-" + id);
      if (slider) slider.addEventListener("input", function(e) {
        opacity = parseInt(e.target.value) / 100;
        var pct = cd.querySelector("#wop-opct-" + id);
        if (pct) pct.textContent = e.target.value + "%";
        applyOpacity(id);
      });
    });
  }

  // ── Activate a live RainViewer layer ─────────────────────────
  function activateLive(id) {
    // Stop other live layer if running
    if (activeType !== "none" && activeType !== id) {
      stopPlay(activeType);
      clearLayers();
    }
    activeType = id;

    var msgEl    = cd.querySelector("#wop-msg-" + id);
    var playerEl = cd.querySelector("#wop-player-" + id);
    if (msgEl) msgEl.innerHTML = '<span class="wop-spinning">&#x29D7;</span> Loading&hellip;';

    loadApi()
      .then(function() {
        var frames = id === "radar" ? radarFrames : satFrames;
        if (!frames.length) {
          if (msgEl) msgEl.textContent = "No data available";
          return;
        }
        frames.forEach(function(f) { makeLayer(f, id); });
        currentIdx = frames.length - 1;
        showFrame(currentIdx, id);
        if (msgEl)    msgEl.style.display = "none";
        if (playerEl) playerEl.style.display = "block";
        buildProgress(frames.length, id);
        startPlay(id);
      })
      .catch(function(err) {
        if (msgEl) msgEl.textContent = "Error: " + err.message;
      });
  }

  // ── API ───────────────────────────────────────────────────────
  function loadApi() {
    if (apiData && Date.now() - apiData._t < 300000) return Promise.resolve();
    return fetch(API_URL)
      .then(function(r) { if (!r.ok) throw new Error("RainViewer unreachable"); return r.json(); })
      .then(function(d) {
        apiData = d; apiData._t = Date.now(); apiHost = d.host;
        radarFrames = (d.radar ? (d.radar.past||[]).concat(d.radar.nowcast||[]) : []);
        satFrames   = (d.satellite ? d.satellite.infrared||[] : []);
      });
  }

  // ── Tile layers ───────────────────────────────────────────────
  function makeLayer(frame, type) {
    if (layerCache[frame.path]) return layerCache[frame.path];
    var url = type === "satellite"
      ? apiHost + frame.path + "/256/{z}/{x}/{y}/0/0_0.png"
      : apiHost + frame.path + "/256/{z}/{x}/{y}/2/1_1.png";
    var layer = L.tileLayer(url, {
      opacity: 0, tileSize: 256, zIndex: 500,
      attribution: 'Radar: <a href="https://rainviewer.com" target="_blank">RainViewer</a>'
    });
    layerCache[frame.path] = layer;
    return layer;
  }

  function showFrame(idx, id) {
    var frames = id === "radar" ? radarFrames : satFrames;
    if (!frames.length) return;
    idx = ((idx % frames.length) + frames.length) % frames.length;
    currentIdx = idx;

    Object.values(layerCache).forEach(function(l) { if (map.hasLayer(l)) l.setOpacity(0); });
    var layer = layerCache[frames[idx].path];
    if (layer) { if (!map.hasLayer(layer)) layer.addTo(map); layer.setOpacity(opacity); }

    var ts    = new Date(frames[idx].time * 1000);
    var time  = ts.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", hour12:true });
    var date  = ts.toLocaleDateString("en-PH", { month:"short", day:"numeric" });
    var nc    = apiData && apiData.radar && apiData.radar.nowcast ? apiData.radar.nowcast.length : 0;
    var fcst  = id === "radar" && idx >= radarFrames.length - nc;
    var tsEl  = cd.querySelector("#wop-ts-" + id);
    if (tsEl) tsEl.textContent = date + " " + time + (fcst ? " \u25B6FCST" : "");
    updateProgress(idx, frames.length, id);
  }

  function applyOpacity(id) {
    var frames = id === "radar" ? radarFrames : satFrames;
    var l = frames[currentIdx] ? layerCache[frames[currentIdx].path] : null;
    if (l && map.hasLayer(l)) l.setOpacity(opacity);
  }

  function clearLayers() {
    Object.values(layerCache).forEach(function(l) { if (map.hasLayer(l)) map.removeLayer(l); });
    layerCache = {}; radarFrames = []; satFrames = []; apiData = null;
  }

  // ── Animation ─────────────────────────────────────────────────
  function startPlay(id) {
    stopPlay(id); isPlaying = true;
    var btn = cd.querySelector("#wop-play-" + id);
    if (btn) btn.innerHTML = "&#x23F8;";
    animTimer = setInterval(function() { step(1, id); }, ANIM_MS);
  }

  function stopPlay(id) {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
    isPlaying = false;
    var sel = id ? "#wop-play-" + id : ".wop-play-btn";
    var btn = cd ? cd.querySelector(sel) : null;
    if (btn) btn.innerHTML = "&#x25B6;";
  }

  function togglePlay(id) { if (isPlaying) stopPlay(id); else startPlay(id); }

  function step(d, id) {
    var frames = id === "radar" ? radarFrames : satFrames;
    if (frames.length) showFrame(currentIdx + d, id);
  }

  // ── Progress bar ──────────────────────────────────────────────
  function buildProgress(count, id) {
    var el = cd.querySelector("#wop-prog-" + id);
    if (!el) return;
    var h = "";
    for (var i = 0; i < count; i++) h += '<span class="wop-tick" data-i="' + i + '"></span>';
    el.innerHTML = h;
    el.querySelectorAll(".wop-tick").forEach(function(t) {
      t.addEventListener("click", function() { stopPlay(id); showFrame(parseInt(t.dataset.i), id); });
    });
  }

  function updateProgress(active, total, id) {
    if (!cd) return;
    var prog = cd.querySelector("#wop-prog-" + id);
    if (!prog) return;
    prog.querySelectorAll(".wop-tick").forEach(function(t, i) {
      t.classList.toggle("wop-tick-on", i === active);
      t.classList.toggle("wop-tick-fcst", i >= total - (apiData && apiData.radar && apiData.radar.nowcast ? apiData.radar.nowcast.length : 0));
    });
  }

  return { init: init, selectType: function(id) { activateLive(id); } };
})();
