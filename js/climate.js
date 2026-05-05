// ============================================================
// climate.js — Climate Information System Panel
// Sources:
//   1. Open-Meteo Forecast API  — free, no key, CORS-safe
//   2. Open-Meteo Climate API   — CMIP6 monthly normals 1950-2050
//   3. PAGASA TenDay API        — requires user API token
//   4. PAGASA / PANaHON links
// ============================================================

const ClimatePanel = (() => {

  // ── API endpoints ───────────────────────────────────────────
  const OM_FORECAST = "https://api.open-meteo.com/v1/forecast";
  const OM_CLIMATE  = "https://climate-api.open-meteo.com/v1/climate";
  // NEW — calls your Worker, no token visible, no CORS error
	const WORKER_URL = "https://cagvalagrithematicmaps.darfo2.workers.dev";

	const response = await fetch(`${WORKER_URL}/?region=2`);
	const data = await response.json();

  // ── PAGASA public page links ────────────────────────────────
  const LINKS = {
    tenday:     "https://bagong.pagasa.dost.gov.ph/climate/climate-prediction/10-day-climate-forecast",
    seasonal:   "https://bagong.pagasa.dost.gov.ph/climate/climate-prediction/seasonal-forecast",
    agriweather:"https://bagong.pagasa.dost.gov.ph/climate/agri-weather/farm-weather-forecast",
    climap:     "https://bagong.pagasa.dost.gov.ph/climate/climate-change/dynamic-downscaling/climap",
    panahon:    "https://www.panahon.gov.ph/",
    crva:       "https://amia.da.gov.ph/crva/"
  };

  // ── WMO weather code descriptions ──────────────────────────
  const WMO = {
    0:{"l":"Clear sky","i":"☀️"},1:{"l":"Mainly clear","i":"🌤️"},
    2:{"l":"Partly cloudy","i":"⛅"},3:{"l":"Overcast","i":"☁️"},
    45:{"l":"Fog","i":"🌫️"},48:{"l":"Icy fog","i":"🌫️"},
    51:{"l":"Light drizzle","i":"🌦️"},53:{"l":"Moderate drizzle","i":"🌦️"},
    55:{"l":"Dense drizzle","i":"🌧️"},61:{"l":"Slight rain","i":"🌧️"},
    63:{"l":"Moderate rain","i":"🌧️"},65:{"l":"Heavy rain","i":"🌧️"},
    80:{"l":"Rain showers","i":"🌦️"},81:{"l":"Heavy showers","i":"🌧️"},
    82:{"l":"Violent showers","i":"⛈️"},95:{"l":"Thunderstorm","i":"⛈️"},
    96:{"l":"Thunderstorm+hail","i":"⛈️"},99:{"l":"Thunderstorm+hail","i":"⛈️"}
  };
  const wmo = code => WMO[code] || { l:"Unknown", i:"🌡️" };
  const windDir = d => ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round((d||0)/22.5)%16];

  // ── Module state ────────────────────────────────────────────
  let lat = null, lng = null, locName = "";
  let pagasaToken = "";
  let fChart = null, cChart = null;
  let built = false;
  let panelOpen = false;

  // ── Safe localStorage wrapper ───────────────────────────────
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch(e) { return null; } },
    set: (k,v) => { try { localStorage.setItem(k,v); } catch(e) {} }
  };

  // ── DOM helpers ─────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function setText(id, val) { const el = $(id); if(el) el.textContent = val; }
  function show(id)  { const el = $(id); if(el) el.style.display = "block"; }
  function hide(id)  { const el = $(id); if(el) el.style.display = "none"; }
  function showFlex(id) { const el = $(id); if(el) el.style.display = "flex"; }

  // ── Build panel HTML (once) ─────────────────────────────────
  function buildPanel() {
    if (built && $("climate-panel")) return;

    const panel = document.createElement("div");
    panel.id = "climate-panel";
    panel.className = "climate-panel";
    panel.innerHTML = buildHTML();

    // position:fixed means it sits above everything regardless of DOM parent
    document.body.appendChild(panel);
    built = true;

    wireEvents();
    restoreToken();
  }

  function buildHTML() {
    return `
    <div class="cp-header">
      <span class="cp-title">🌦️ Climate Information</span>
      <button class="cp-close-btn" id="cp-close">✕</button>
    </div>

    <div class="cp-location-bar">
      <span id="cp-loc-name">← Click a municipality on the map</span>
      <a class="cp-loc-link" href="${LINKS.panahon}" target="_blank" title="PANaHON live weather stations">🛰️ Live Stations</a>
    </div>

    <div class="cp-tab-bar">
      <button class="cp-tab active" data-tab="now">☀️ Now</button>
      <button class="cp-tab" data-tab="forecast">📅 7-Day</button>
      <button class="cp-tab" data-tab="normals">📊 Normals</button>
      <button class="cp-tab" data-tab="pagasa">🇵🇭 PAGASA</button>
    </div>

    <!-- TAB: Now ──────────────────────────────── -->
    <div class="cp-tab-pane active" id="cp-pane-now">
      <div class="cp-state" id="cp-now-idle">
        <div class="cp-idle-msg">👆 Click any municipality on the map to load live weather</div>
      </div>
      <div class="cp-state" id="cp-now-loading" style="display:none">
        <div class="cp-spinner">⏳ Fetching weather…</div>
      </div>
      <div class="cp-state" id="cp-now-error" style="display:none"></div>
      <div id="cp-now-data" style="display:none">
        <div class="cp-hero">
          <div id="cp-now-icon" class="cp-hero-icon">—</div>
          <div>
            <div id="cp-now-temp" class="cp-hero-temp">—</div>
            <div id="cp-now-cond" class="cp-hero-cond">—</div>
          </div>
        </div>
        <div class="cp-grid-2">
          <div class="cp-kv"><span>Humidity</span><b id="cp-now-hum">—</b></div>
          <div class="cp-kv"><span>Precip.</span><b id="cp-now-prec">—</b></div>
          <div class="cp-kv"><span>Wind</span><b id="cp-now-wind">—</b></div>
          <div class="cp-kv"><span>Direction</span><b id="cp-now-wdir">—</b></div>
          <div class="cp-kv"><span>Cloud Cover</span><b id="cp-now-cloud">—</b></div>
          <div class="cp-kv"><span>Soil Temp</span><b id="cp-now-soil">—</b></div>
        </div>
        <div id="cp-agri-tips" class="cp-agri-box"></div>
        <div class="cp-credit">Source: <a href="https://open-meteo.com" target="_blank">Open-Meteo</a> (CC BY 4.0)</div>
      </div>
    </div>

    <!-- TAB: 7-Day ────────────────────────────── -->
    <div class="cp-tab-pane" id="cp-pane-forecast">
      <div class="cp-state" id="cp-fc-idle">
        <div class="cp-idle-msg">👆 Click a municipality to load the 7-day forecast</div>
      </div>
      <div class="cp-state" id="cp-fc-loading" style="display:none">
        <div class="cp-spinner">⏳ Fetching forecast…</div>
      </div>
      <div class="cp-state" id="cp-fc-error" style="display:none"></div>
      <div id="cp-fc-data" style="display:none">
        <div id="cp-day-cards" class="cp-day-strip"></div>
        <div class="cp-chart-wrap" style="height:130px;margin-top:6px">
          <canvas id="cp-fc-chart"></canvas>
        </div>
        <div class="cp-credit">Source: <a href="https://open-meteo.com" target="_blank">Open-Meteo</a> (CC BY 4.0)</div>
      </div>
    </div>

    <!-- TAB: Climate Normals ──────────────────── -->
    <div class="cp-tab-pane" id="cp-pane-normals">
      <div class="cp-norm-controls">
        <div class="cp-field">
          <label class="cp-lbl">Variable</label>
          <select id="cp-norm-var">
            <option value="precipitation_sum" selected>Monthly Rainfall (mm)</option>
            <option value="temperature_2m_max">Max Temperature (°C)</option>
            <option value="temperature_2m_min">Min Temperature (°C)</option>
            <option value="wind_speed_10m_max">Max Wind Speed (km/h)</option>
          </select>
        </div>
        <div class="cp-field">
          <label class="cp-lbl">CMIP6 Model</label>
          <select id="cp-norm-model">
            <option value="EC_Earth3P_HR">EC-Earth3-P (High Res)</option>
            <option value="MPI_ESM1_2_XR">MPI-ESM1.2 (Extra High Res)</option>
            <option value="CMCC_CM2_VHR4">CMCC-CM2 (Very High Res)</option>
          </select>
        </div>
        <button class="cp-primary-btn" id="cp-norm-fetch">📊 Load Climate Normals</button>
      </div>
      <div class="cp-state" id="cp-norm-idle">
        <div class="cp-idle-msg">Select a location and click Load</div>
      </div>
      <div class="cp-state" id="cp-norm-loading" style="display:none">
        <div class="cp-spinner">⏳ Loading CMIP6 30-year normals…</div>
      </div>
      <div class="cp-state" id="cp-norm-error" style="display:none"></div>
      <div id="cp-norm-data" style="display:none">
        <div class="cp-chart-wrap" style="height:150px">
          <canvas id="cp-norm-chart"></canvas>
        </div>
        <div id="cp-norm-stats" class="cp-stats-grid"></div>
        <div class="cp-credit">
          Source: <a href="https://open-meteo.com/en/docs/climate-api" target="_blank">Open-Meteo Climate API</a>
          — CMIP6 / 2000-2029 30-yr normal (CC BY 4.0)
        </div>
      </div>
    </div>

    <!-- TAB: PAGASA Links ─────────────────────── -->
    <div class="cp-tab-pane" id="cp-pane-pagasa">
      <div class="cp-section-head">🔐 PAGASA TenDay API (optional)</div>
      <p class="cp-small-text">
        The <a href="https://tenday.pagasa.dost.gov.ph" target="_blank">PAGASA TenDay API</a> 
        requires a personal token. Request access from PAGASA, then paste it below.
      </p>
      <div class="cp-token-row">
        <input type="password" id="cp-api-token" placeholder="Paste PAGASA API token…" />
        <button class="cp-primary-btn" id="cp-token-save">Save</button>
      </div>
      <div id="cp-token-msg" class="cp-token-msg"></div>
      <div id="cp-pagasa-result" style="display:none"></div>

      <div class="cp-section-head" style="margin-top:12px">📡 Official PAGASA & DA Resources</div>
      <div class="cp-links-list">
        <a class="cp-link-card" href="${LINKS.tenday}" target="_blank">
          <span>📅</span><div><b>10-Day Climate Forecast</b><br>Per municipality, updated Mon & Thu</div>
        </a>
        <a class="cp-link-card" href="${LINKS.seasonal}" target="_blank">
          <span>📆</span><div><b>Seasonal Forecast</b><br>6-month rainfall & temperature outlook</div>
        </a>
        <a class="cp-link-card" href="${LINKS.agriweather}" target="_blank">
          <span>🌾</span><div><b>Agri-Weather Forecast</b><br>Farm weather & crop advisories</div>
        </a>
        <a class="cp-link-card" href="${LINKS.climap}" target="_blank">
          <span>🗺️</span><div><b>CliMap — Climate Projections</b><br>Provincial seasonal & extremes maps</div>
        </a>
        <a class="cp-link-card" href="${LINKS.panahon}" target="_blank">
          <span>🛰️</span><div><b>PANaHON Live Stations</b><br>Near real-time rainfall, temp & wind</div>
        </a>
        <a class="cp-link-card" href="${LINKS.crva}" target="_blank">
          <span>🌡️</span><div><b>DA-AMIA CRVA Maps</b><br>Climate risk vulnerability assessment</div>
        </a>
      </div>
    </div>`;
  }

  // ── Wire all panel events ───────────────────────────────────
  function wireEvents() {
    // Close button
    $("cp-close")?.addEventListener("click", close);

    // Tab switching — scoped inside climate-panel only
    const panel = $("climate-panel");
    if (!panel) return;

    panel.querySelectorAll(".cp-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        // Deactivate all tabs and panes within THIS panel only
        panel.querySelectorAll(".cp-tab").forEach(t => t.classList.remove("active"));
        panel.querySelectorAll(".cp-tab-pane").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        const pane = $(`cp-pane-${tab.dataset.tab}`);
        if (pane) pane.classList.add("active");

        // Lazy-load on tab open
        if (tab.dataset.tab === "forecast" && lat !== null) loadForecast();
      });
    });

    // Climate normals fetch button
    $("cp-norm-fetch")?.addEventListener("click", () => {
      if (lat === null) {
        Utils.showToast("Click a municipality on the map first.", "info");
        return;
      }
      loadNormals();
    });

    // PAGASA token save
    $("cp-token-save")?.addEventListener("click", () => {
      const val = ($("cp-api-token")?.value || "").trim();
      const msg = $("cp-token-msg");
      if (!val) { if(msg) msg.textContent = "⚠️ No token entered."; return; }
      pagasaToken = val;
      ls.set("pagasa_token", val);
      if(msg) { msg.className = "cp-token-msg ok"; msg.textContent = "✅ Token saved."; }
      if (lat !== null) loadPagasaForecast();
    });
  }

  function restoreToken() {
    const saved = ls.get("pagasa_token");
    if (!saved) return;
    pagasaToken = saved;
    const inp = $("cp-api-token");
    if (inp) inp.value = saved;
    const msg = $("cp-token-msg");
    if (msg) { msg.className = "cp-token-msg ok"; msg.textContent = "✅ Token loaded from previous session."; }
  }

  // ── Show / hide states ──────────────────────────────────────
  function setNowState(state) {  // idle | loading | error | data
    ["idle","loading","error"].forEach(s => {
      const el = $(`cp-now-${s}`);
      if (el) el.style.display = (s === state) ? "block" : "none";
    });
    $("cp-now-data") && ($("cp-now-data").style.display = state === "data" ? "block" : "none");
  }

  function setFcState(state) {
    ["idle","loading","error"].forEach(s => {
      const el = $(`cp-fc-${s}`);
      if (el) el.style.display = (s === state) ? "block" : "none";
    });
    $("cp-fc-data") && ($("cp-fc-data").style.display = state === "data" ? "block" : "none");
  }

  function setNormState(state) {
    ["idle","loading","error"].forEach(s => {
      const el = $(`cp-norm-${s}`);
      if (el) el.style.display = (s === state) ? "block" : "none";
    });
    $("cp-norm-data") && ($("cp-norm-data").style.display = state === "data" ? "block" : "none");
  }

  function setError(prefix, msg) {
    const el = $(`cp-${prefix}-error`);
    if (el) { el.innerHTML = `<div class="cp-err-msg">${msg}</div>`; el.style.display = "block"; }
  }

  // ── Reset to idle when new location selected ────────────────
  function resetToIdle() {
    setNowState("idle");
    setFcState("idle");
    setNormState("idle");
    // Reset to "Now" tab
    const panel = $("climate-panel");
    if (!panel) return;
    panel.querySelectorAll(".cp-tab").forEach(t => t.classList.remove("active"));
    panel.querySelectorAll(".cp-tab-pane").forEach(p => p.classList.remove("active"));
    const firstTab = panel.querySelector(".cp-tab[data-tab='now']");
    if (firstTab) firstTab.classList.add("active");
    const firstPane = $("cp-pane-now");
    if (firstPane) firstPane.classList.add("active");
  }

  // ── Open panel for a location (main entry point) ────────────
  function openForLocation(newLat, newLng, name) {
    lat = newLat;
    lng = newLng;
    locName = name || `${newLat.toFixed(4)}°N, ${newLng.toFixed(4)}°E`;

    buildPanel(); // no-op if already built

    const panel = $("climate-panel");
    if (panel) panel.classList.add("open");
    panelOpen = true;

    // Update location label
    setText("cp-loc-name", `📍 ${locName}`);

    // Reset states and auto-load "Now" tab
    resetToIdle();
    loadNow();
  }

  // ── Toggle from header button ───────────────────────────────
  function togglePanel() {
    buildPanel();
    if (panelOpen) {
      close();
    } else {
      const panel = $("climate-panel");
      if (panel) panel.classList.add("open");
      panelOpen = true;
      if (lat === null) {
        // Auto-load Tuguegarao (Region 2 capital) as default
        openForLocation(17.6132, 121.7270, "Tuguegarao City, Cagayan");
      }
    }
  }

  function close() {
    const panel = $("climate-panel");
    if (panel) panel.classList.remove("open");
    panelOpen = false;
  }

  // ── Load: Current Conditions ────────────────────────────────
  async function loadNow() {
    setNowState("loading");
    try {
      const url = `${OM_FORECAST}?latitude=${lat}&longitude=${lng}`
        + `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code`
        + `,wind_speed_10m,wind_direction_10m,cloud_cover,soil_temperature_0cm`
        + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration`
        + `&timezone=Asia%2FManila&forecast_days=1`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const c = d.current;
      const day = d.daily;
      const w = wmo(c.weather_code);

      setText("cp-now-icon",  w.i);
      setText("cp-now-temp",  `${c.temperature_2m?.toFixed(1)}°C`);
      setText("cp-now-cond",  w.l);
      setText("cp-now-hum",   `${c.relative_humidity_2m ?? "—"}%`);
      setText("cp-now-prec",  `${c.precipitation ?? "—"} mm`);
      setText("cp-now-wind",  `${c.wind_speed_10m ?? "—"} km/h`);
      setText("cp-now-wdir",  windDir(c.wind_direction_10m));
      setText("cp-now-cloud", `${c.cloud_cover ?? "—"}%`);
      setText("cp-now-soil",  c.soil_temperature_0cm != null ? `${c.soil_temperature_0cm.toFixed(1)}°C` : "N/A");

      // Agri tips
      const tips = buildAgriTips(c, day?.temperature_2m_max?.[0], day?.temperature_2m_min?.[0],
                                     day?.precipitation_sum?.[0], day?.et0_fao_evapotranspiration?.[0]);
      const tipsEl = $("cp-agri-tips");
      if (tipsEl) tipsEl.innerHTML = tips;

      setNowState("data");
    } catch (e) {
      setNowState("error");
      setError("now", `⚠️ Could not load weather: ${e.message}<br>Check your internet connection.`);
    }
  }

  function buildAgriTips(c, tmax, tmin, psum, et0) {
    const tips = [];
    if (tmax > 35)  tips.push(["warn", "🌡️", `Heat stress alert (max ${tmax?.toFixed(1)}°C). Schedule irrigation in early morning. Monitor transplanted rice for wilting.`]);
    if (tmin < 18)  tips.push(["info", "❄️", `Cool night temperatures (min ${tmin?.toFixed(1)}°C). Watch cold-sensitive seedlings and early-stage rice.`]);
    if (psum > 30)  tips.push(["warn", "🌧️", `Heavy rainfall expected (${psum?.toFixed(0)} mm). Monitor low-lying fields for flooding and check drainage.`]);
    if (psum !== undefined && psum < 1) tips.push(["info", "☀️", `Dry conditions. Check soil moisture for rainfed crops and consider supplemental irrigation.`]);
    if (c.wind_speed_10m > 40) tips.push(["warn", "💨", `Strong winds (${c.wind_speed_10m} km/h). Delay pesticide application; secure farm structures.`]);
    if (et0 != null) tips.push(["info", "💧", `Reference ET₀: <b>${et0.toFixed(1)} mm/day</b> — use for irrigation scheduling and water balance.`]);
    if (tips.length === 0) tips.push(["ok", "✅", "No major weather concerns today. Good conditions for field operations."]);
    return `<div class="cp-agri-title">🌾 Agri-Weather Advisory</div>`
      + tips.map(([cls,icon,txt]) => `<div class="cp-tip cp-tip-${cls}">${icon} ${txt}</div>`).join("");
  }

  // ── Load: 7-Day Forecast ────────────────────────────────────
  async function loadForecast() {
    setFcState("loading");
    try {
      const url = `${OM_FORECAST}?latitude=${lat}&longitude=${lng}`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
        + `,precipitation_sum,precipitation_probability_max,wind_speed_10m_max`
        + `,et0_fao_evapotranspiration`
        + `&timezone=Asia%2FManila&forecast_days=7`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()).daily;

      // Day cards
      const strip = $("cp-day-cards");
      if (strip) {
        strip.innerHTML = d.time.map((date, i) => {
          const w   = wmo(d.weather_code[i]);
          const day = new Date(date + "T12:00:00").toLocaleDateString("en-PH", { weekday:"short", month:"short", day:"numeric" });
          return `<div class="cp-day">
            <div class="cp-day-label">${day}</div>
            <div class="cp-day-icon">${w.i}</div>
            <div class="cp-day-cond">${w.l}</div>
            <div class="cp-day-temps">
              <span class="hot">${d.temperature_2m_max[i]?.toFixed(1)}°</span>
              <span class="cool">${d.temperature_2m_min[i]?.toFixed(1)}°</span>
            </div>
            <div class="cp-day-rain">🌧 ${d.precipitation_sum[i]?.toFixed(1)}mm</div>
            <div class="cp-day-prob">${d.precipitation_probability_max[i] ?? "—"}%</div>
          </div>`;
        }).join("");
      }

      // Dual-axis chart
      const ctx = $("cp-fc-chart");
      if (ctx) {
        if (fChart) { fChart.destroy(); fChart = null; }
        fChart = new Chart(ctx, {
          data: {
            labels: d.time.map(t => new Date(t + "T12:00:00").toLocaleDateString("en-PH",{weekday:"short"})),
            datasets: [
              { type:"bar",  label:"Rainfall (mm)",  data:d.precipitation_sum,     backgroundColor:"#3b82f688", borderColor:"#2563eb", borderWidth:1, borderRadius:3, yAxisID:"yR" },
              { type:"line", label:"Max Temp (°C)",  data:d.temperature_2m_max,    borderColor:"#ef4444", backgroundColor:"transparent", tension:0.4, pointRadius:3, borderWidth:2, yAxisID:"yT" },
              { type:"line", label:"Min Temp (°C)",  data:d.temperature_2m_min,    borderColor:"#f97316", backgroundColor:"transparent", tension:0.4, pointRadius:3, borderWidth:1.5, borderDash:[4,2], yAxisID:"yT" }
            ]
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ labels:{ font:{size:9}, boxWidth:10, padding:6 } } },
            scales:{
              yR:{ type:"linear", position:"left",  title:{display:true,text:"Rain (mm)",font:{size:9}}, grid:{color:"#e5e7eb"} },
              yT:{ type:"linear", position:"right", title:{display:true,text:"Temp (°C)",font:{size:9}}, grid:{drawOnChartArea:false} }
            }
          }
        });
      }

      setFcState("data");
    } catch (e) {
      setFcState("error");
      setError("fc", `⚠️ Forecast unavailable: ${e.message}`);
    }
  }

  // ── Load: CMIP6 Climate Normals ─────────────────────────────
  async function loadNormals() {
    const varKey   = $("cp-norm-var")?.value   || "precipitation_sum";
    const model    = $("cp-norm-model")?.value || "EC_Earth3P_HR";
    const varLabel = $("cp-norm-var")?.selectedOptions[0]?.text || varKey;
    const isRain   = varKey.includes("precipitation");

    setNormState("loading");
    try {
      const url = `${OM_CLIMATE}?latitude=${lat}&longitude=${lng}`
        + `&start_date=2000-01-01&end_date=2029-12-31`
        + `&models=${model}&daily=${varKey}&timezone=Asia%2FManila`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw   = json.daily?.[varKey] || [];
      const dates = json.daily?.time   || [];

      // Aggregate to monthly
      const buckets = Array.from({length:12}, () => []);
      dates.forEach((dt,i) => {
        const m = new Date(dt).getMonth();
        if (raw[i] != null && !isNaN(raw[i])) buckets[m].push(raw[i]);
      });
      const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const vals = buckets.map(b => {
        if (!b.length) return null;
        const avg = b.reduce((s,v) => s+v, 0) / b.length;
        return isRain ? +(avg * 30.44).toFixed(1) : +avg.toFixed(2);
      });

      const valid = vals.filter(v => v != null);
      const iMax  = vals.indexOf(Math.max(...valid));
      const iMin  = vals.indexOf(Math.min(...valid));
      const total = isRain ? valid.reduce((s,v) => s+v, 0).toFixed(0) : null;
      const unit  = isRain ? "mm/mo" : "°C";

      // Chart
      const ctx = $("cp-norm-chart");
      if (ctx) {
        if (cChart) { cChart.destroy(); cChart = null; }
        cChart = new Chart(ctx, {
          type: isRain ? "bar" : "line",
          data: {
            labels: MON,
            datasets: [{
              label: `${varLabel} (${unit})`,
              data: vals,
              backgroundColor: isRain ? "#3b82f688" : "transparent",
              borderColor: isRain ? "#1d4ed8" : "#ef4444",
              borderWidth: 2,
              fill: !isRain,
              tension: 0.4,
              pointRadius: 4
            }]
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ labels:{ font:{size:9}, boxWidth:10 } } },
            scales:{ y:{ title:{display:true,text:unit,font:{size:9}}, grid:{color:"#e5e7eb"} } }
          }
        });
      }

      // Stats
      const statsEl = $("cp-norm-stats");
      if (statsEl) {
        statsEl.innerHTML = [
          ["Peak month",    `${MON[iMax]} — ${vals[iMax]} ${unit}`],
          ["Lowest month",  `${MON[iMin]} — ${vals[iMin]} ${unit}`],
          ...(total ? [["Annual total", `${total} mm/yr`]] : []),
          ["Period",        "2000–2029 (30-yr normal)"],
          ["CMIP6 model",   model.replace(/_/g, " ")]
        ].map(([k,v]) => `<div class="cp-stat-row"><span>${k}</span><b>${v}</b></div>`).join("");
      }

      setNormState("data");
    } catch (e) {
      setNormState("error");
      setError("norm", `⚠️ CMIP6 data unavailable: ${e.message}<br>
        <a href="${LINKS.climap}" target="_blank">View PAGASA CliMap projections →</a>`);
    }
  }

  // ── Load: PAGASA TenDay API ─────────────────────────────────
  async function loadPagasaForecast() {
    if (!pagasaToken) return;
    const result = $("cp-pagasa-result");
    if (!result) return;
    result.style.display = "block";
    result.innerHTML = `<div class="cp-spinner">⏳ Fetching PAGASA data…</div>`;

    try {
      const url = `${PAGASA_BASE}/tenday/current?region=2&token=${encodeURIComponent(pagasaToken)}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} — check token`);
      const data = await res.json();

      // Try to match municipality
      const items  = Array.isArray(data?.data) ? data.data : (data?.data?.data || []);
      const target = locName.split(",")[0].toLowerCase();
      const match  = items.find(r => (r.municipality || r.name || "").toLowerCase().includes(target)) || items[0];

      if (!match) {
        result.innerHTML = `<div class="cp-small-text">No match for "${locName}".
          <a href="${LINKS.tenday}" target="_blank">View full 10-day forecast →</a></div>`;
        return;
      }

      result.innerHTML = `<div class="cp-small-text"><b>${match.municipality || match.name}</b> — PAGASA 10-Day</div>
        <pre class="cp-pagasa-pre">${JSON.stringify(match, null, 2)}</pre>`;
    } catch(e) {
      result.innerHTML = `<div class="cp-err-msg">⚠️ PAGASA API: ${e.message}<br>
        <a href="${LINKS.tenday}" target="_blank">View forecast page →</a></div>`;
    }
  }

  // ── Called by visualizations.js on every polygon click ──────
  function notifyMapClick(newLat, newLng, name) {
    // Update location silently if panel is already open
    if (panelOpen) {
      openForLocation(newLat, newLng, name);
    }
    // Always store last clicked location so header button can use it
    lat = newLat;
    lng = newLng;
    locName = name || `${newLat.toFixed(4)}°N, ${newLng.toFixed(4)}°E`;
  }

  // ── Public API ───────────────────────────────────────────────
  return {
    buildPanel,
    openForLocation,
    notifyMapClick,
    togglePanel,
    close,
    isOpen: () => panelOpen
  };

})();
