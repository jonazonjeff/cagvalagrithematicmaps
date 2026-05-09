// ============================================================
// config.js — Central Configuration for All Indicators,
// Basemaps, Visualization Styles, and Priority Models
// ============================================================

const APP_CONFIG = {
  title: "Cagayan Valley Agriculture, Poverty, Nutrition & Planning Map",
  subtitle: "Interactive spatial decision-support tool for agriculture intervention targeting and investment prioritization",
  defaultView: "municipality",
  defaultIndicator: "population",
  defaultStyle: "choropleth",
  mapCenter: [17.6132, 121.7270],
  mapZoom: 8,
  dataPath: "data/",
  assetVersion: "20260509-public",
};

// ============================================================
// INDICATOR CONFIGURATION
// Add new indicators here — no other code changes needed.
// ============================================================
const INDICATOR_CONFIG = {
  // --- Demographics ---
  population: {
    label: "Population",
    category: "Demographics",
    type: "numeric",
    unit: "persons",
    aggregation: "sum",
    colorScheme: "Blues",
    description: "Total population of the municipality"
  },

  // --- Poverty ---
  poverty_2018: {
    label: "Poverty Incidence 2018",
    category: "Poverty",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "Reds",
    description: "Poverty incidence rate in 2018"
  },
  poverty_2021: {
    label: "Poverty Incidence 2021",
    category: "Poverty",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "Reds",
    description: "Poverty incidence rate in 2021"
  },
  poverty_2023: {
    label: "Poverty Incidence 2023",
    category: "Poverty",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "Reds",
    description: "Poverty incidence rate in 2023"
  },

  // --- Malnutrition ---
  stunting: {
    label: "Stunting Rate",
    category: "Malnutrition",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "Oranges",
    description: "Percentage of children with stunting"
  },
  underweight: {
    label: "Underweight Rate",
    category: "Malnutrition",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "Oranges",
    description: "Percentage of children who are underweight"
  },
  obese: {
    label: "Obesity Rate",
    category: "Malnutrition",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "Purples",
    description: "Percentage of population classified as obese"
  },
  wasting: {
    label: "Wasting Rate",
    category: "Malnutrition",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "population",
    colorScheme: "YlOrRd",
    description: "Percentage of children with wasting"
  },

  // --- Rice ---
  rice_production_2023: {
    label: "Rice Production 2023",
    category: "Rice",
    type: "numeric",
    unit: "MT",
    aggregation: "sum",
    colorScheme: "YlGn",
    description: "Total rice production in metric tons (2023)"
  },
  rice_production_2025: {
    label: "Rice Production 2025",
    category: "Rice",
    type: "numeric",
    unit: "MT",
    aggregation: "sum",
    colorScheme: "YlGn",
    description: "Total rice production in metric tons (2025)"
  },
  rice_area_2023: {
    label: "Rice Area Harvested 2023",
    category: "Rice",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "Greens",
    description: "Rice area harvested in hectares (2023)"
  },
  rice_area_2025: {
    label: "Rice Area Harvested 2025",
    category: "Rice",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "Greens",
    description: "Rice area harvested in hectares (2025)"
  },
  rice_yield_2023: {
    label: "Rice Yield 2023",
    category: "Rice",
    type: "numeric",
    unit: "MT/ha",
    aggregation: "ratio",
    numerator: "rice_production_2023",
    denominator: "rice_area_2023",
    colorScheme: "YlGn",
    description: "Rice yield in MT per hectare (2023)"
  },
  rice_yield_2025: {
    label: "Rice Yield 2025",
    category: "Rice",
    type: "numeric",
    unit: "MT/ha",
    aggregation: "ratio",
    numerator: "rice_production_2025",
    denominator: "rice_area_2025",
    colorScheme: "YlGn",
    description: "Rice yield in MT per hectare (2025)"
  },
  poor_rice_farmers: {
    label: "Poor Rice Farmers",
    category: "Rice",
    type: "numeric",
    unit: "farmers",
    aggregation: "sum",
    colorScheme: "Reds",
    description: "Number of rice farmers classified as poor"
  },
  rice_mechanization_level: {
    label: "Rice Mechanization Level",
    category: "Rice",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "rice_area_2023",
    colorScheme: "Blues",
    description: "Percentage of rice farms with mechanization"
  },

  // --- Corn ---
  corn_production_2023: {
    label: "Corn Production 2023",
    category: "Corn",
    type: "numeric",
    unit: "MT",
    aggregation: "sum",
    colorScheme: "YlOrBr",
    description: "Total corn production in metric tons (2023)"
  },
  corn_production_2025: {
    label: "Corn Production 2025",
    category: "Corn",
    type: "numeric",
    unit: "MT",
    aggregation: "sum",
    colorScheme: "YlOrBr",
    description: "Total corn production in metric tons (2025)"
  },
  corn_area_2023: {
    label: "Corn Area Harvested 2023",
    category: "Corn",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "YlOrBr",
    description: "Corn area harvested in hectares (2023)"
  },
  corn_area_2025: {
    label: "Corn Area Harvested 2025",
    category: "Corn",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "YlOrBr",
    description: "Corn area harvested in hectares (2025)"
  },
  corn_yield_2023: {
    label: "Corn Yield 2023",
    category: "Corn",
    type: "numeric",
    unit: "MT/ha",
    aggregation: "ratio",
    numerator: "corn_production_2023",
    denominator: "corn_area_2023",
    colorScheme: "YlOrBr",
    description: "Corn yield in MT per hectare (2023)"
  },
  corn_yield_2025: {
    label: "Corn Yield 2025",
    category: "Corn",
    type: "numeric",
    unit: "MT/ha",
    aggregation: "ratio",
    numerator: "corn_production_2025",
    denominator: "corn_area_2025",
    colorScheme: "YlOrBr",
    description: "Corn yield in MT per hectare (2025)"
  },
  poor_corn_farmers: {
    label: "Poor Corn Farmers",
    category: "Corn",
    type: "numeric",
    unit: "farmers",
    aggregation: "sum",
    colorScheme: "Reds",
    description: "Number of corn farmers classified as poor"
  },
  corn_mechanization_level: {
    label: "Corn Mechanization Level",
    category: "Corn",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "corn_area_2023",
    colorScheme: "Blues",
    description: "Percentage of corn farms with mechanization"
  },

  // --- Risk & Constraints ---
  pest_disease_occurrence: {
    label: "Pest & Disease Occurrence",
    category: "Pest and Disease",
    type: "categorical",
    unit: "",
    aggregation: "dominant",
    colorScheme: "Reds",
    categories: { "High": 3, "Moderate": 2, "Low": 1, "None": 0 },
    description: "Level of pest and disease occurrence"
  },
  asf_status: {
    label: "ASF Status",
    category: "ASF",
    type: "categorical",
    unit: "",
    aggregation: "dominant",
    colorScheme: "Reds",
    categories: { "Affected": 2, "At-risk": 1, "Clear": 0 },
    description: "African Swine Fever status"
  },
  soil_fertility: {
    label: "Soil Fertility",
    category: "Soil Fertility",
    type: "categorical",
    unit: "",
    aggregation: "dominant",
    colorScheme: "Greens",
    categories: { "High": 3, "Moderate": 2, "Low": 1 },
    description: "Soil fertility classification"
  },
  irrigated_area: {
    label: "Irrigated Area",
    category: "Irrigation",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "Blues",
    description: "Total irrigated area in hectares"
  },

  // --- Infrastructure ---
  rpc_site: {
    label: "RPC Site Present",
    category: "Infrastructure",
    type: "binary",
    unit: "",
    aggregation: "sum",
    colorScheme: "Purples",
    description: "Presence of Rice Processing Complex site"
  },

  // --- PhilRice PRiSM Rice Season Monitoring ---
  prism_rice_area_2026s1: {
    label: "PRiSM Rice Area 2026 S1",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "YlGn",
    description: "PhilRice PRiSM satellite-detected rice area for 2026 Semester 1, planted September 16, 2025 to March 15, 2026."
  },
  prism_standing_crop_area: {
    label: "PRiSM Standing Crop Area",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "YlOrRd",
    description: "PRiSM reproductive plus ripening rice area as of April 28, 2026."
  },
  prism_standing_crop_pct: {
    label: "PRiSM Standing Crop Share",
    category: "PRiSM Rice Monitoring",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "prism_rice_area_2026s1",
    colorScheme: "YlOrRd",
    description: "Share of PRiSM detected rice area that remains in reproductive or ripening stage."
  },
  prism_growth_reproductive_ha: {
    label: "PRiSM Reproductive Stage",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "Oranges",
    description: "Rice area in reproductive stage as of April 28, 2026."
  },
  prism_growth_ripening_ha: {
    label: "PRiSM Ripening Stage",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "YlOrBr",
    description: "Rice area in ripening stage as of April 28, 2026."
  },
  prism_growth_harvested_ha: {
    label: "PRiSM Harvested Area",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "Greens",
    description: "Rice area already harvested as of April 28, 2026."
  },
  prism_harvest_progress_pct: {
    label: "PRiSM Harvest Progress",
    category: "PRiSM Rice Monitoring",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "prism_rice_area_2026s1",
    colorScheme: "Greens",
    description: "Share of PRiSM detected rice area already harvested as of April 28, 2026."
  },
  prism_upcoming_harvest_area: {
    label: "PRiSM May-Jun Harvest Area",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "YlOrBr",
    description: "Estimated rice area scheduled for harvest in May and June 2026."
  },
  prism_area_gap_vs_app_ha: {
    label: "PRiSM Area Gap vs App Rice Area",
    category: "PRiSM Rice Monitoring",
    type: "numeric",
    unit: "ha",
    aggregation: "sum",
    colorScheme: "RdBu_r",
    description: "Difference between PRiSM detected 2026 S1 rice area and the app's current rice area reference."
  },
  prism_area_gap_vs_app_pct: {
    label: "PRiSM Area Gap vs App Rice Area %",
    category: "PRiSM Rice Monitoring",
    type: "percentage",
    unit: "%",
    aggregation: "weighted_average",
    weightField: "rice_area_2025",
    colorScheme: "RdBu_r",
    description: "Percent difference between PRiSM detected 2026 S1 rice area and the app's current rice area reference."
  },

  // ============================================================
  // CLIMATE RISK VULNERABILITY ASSESSMENT (CRVA)
  // Based on DA-CRAO / AMIA CRVA Framework (IPCC AR4)
  // Source: CIAO / CIAT — https://ciatph.github.io
  // ============================================================

  // --- CRVA Composite / Overall ---
  crva_index_rice: {
    label: "CRVA Index — Rice",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Reds",
    higherIsBetter: false,
    description: "Overall climate risk vulnerability index for rice production (0=low, 1=very high). Composite of Sensitivity, Hazard Exposure, and Adaptive Capacity (weights: 15%, 15%, 70%)."
  },
  crva_index_corn: {
    label: "CRVA Index — Corn",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Reds",
    higherIsBetter: false,
    description: "Overall climate risk vulnerability index for corn production."
  },

  // ------------ SENSITIVITY ------------
  // Sensitivity = change in climatic suitability of crops (MaxEnt model, RCP 8.5, year 2050 vs baseline)
  // Index: -1.0 = very high gain in suitability; +1.0 = very high loss (negative impact)
  sensitivity_rice: {
    label: "Sensitivity — Rice",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(−1 to +1)",
    aggregation: "weighted_average",
    colorScheme: "RdBu_r",
    higherIsBetter: false,
    description: "Change in rice climatic suitability by 2050 vs baseline. Positive = loss in suitability (worse). Based on MaxEnt species distribution modelling using 19–20 bioclimatic variables (WorldClim) and RCP 8.5 scenario."
  },
  sensitivity_corn: {
    label: "Sensitivity — Corn",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(−1 to +1)",
    aggregation: "weighted_average",
    colorScheme: "RdBu_r",
    higherIsBetter: false,
    description: "Change in corn climatic suitability by 2050 vs baseline (RCP 8.5)."
  },
  sensitivity_coconut: {
    label: "Sensitivity — Coconut",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(−1 to +1)",
    aggregation: "weighted_average",
    colorScheme: "RdBu_r",
    higherIsBetter: false,
    description: "Change in coconut climatic suitability by 2050 vs baseline (RCP 8.5)."
  },
  sensitivity_banana: {
    label: "Sensitivity — Banana",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(−1 to +1)",
    aggregation: "weighted_average",
    colorScheme: "RdBu_r",
    higherIsBetter: false,
    description: "Change in banana climatic suitability by 2050 vs baseline (RCP 8.5)."
  },
  sensitivity_hvc: {
    label: "Sensitivity — High-Value Crops",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(−1 to +1)",
    aggregation: "weighted_average",
    colorScheme: "RdBu_r",
    higherIsBetter: false,
    description: "Composite sensitivity index for high-value crops (vegetables, fruit trees)."
  },

  // ------------ HAZARD / EXPOSURE ------------
  // 8 climate-related hazards from national agencies (MGB, DOST-PAGASA, NAMRIA, etc.)
  // Index: 0 = no/low hazard, 1 = very high hazard
  hazard_index: {
    label: "Hazard Index (Composite)",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "YlOrRd",
    higherIsBetter: false,
    description: "Composite hazard exposure index across all 8 climate-related hazards. Data sourced from DENR-MGB, DOST-PAGASA, NAMRIA, and other national agencies."
  },
  hazard_typhoon: {
    label: "Hazard — Typhoon",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "YlOrRd",
    higherIsBetter: false,
    description: "Exposure index to typhoon hazard. Based on historical typhoon tracks and wind intensity data."
  },
  hazard_flood: {
    label: "Hazard — Flood",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Blues",
    higherIsBetter: false,
    description: "Exposure index to flooding hazard. Based on DOST-PAGASA and DENR-MGB flood susceptibility maps."
  },
  hazard_drought: {
    label: "Hazard — Drought",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "YlOrBr",
    higherIsBetter: false,
    description: "Exposure index to drought hazard. Based on SPI (Standardized Precipitation Index) and ENSO patterns."
  },
  hazard_soil_erosion: {
    label: "Hazard — Soil Erosion",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "YlOrBr",
    higherIsBetter: false,
    description: "Soil erosion susceptibility index from DENR-BSWM."
  },
  hazard_landslide: {
    label: "Hazard — Landslide",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Oranges",
    higherIsBetter: false,
    description: "Landslide susceptibility index from DENR-MGB."
  },
  hazard_swi: {
    label: "Hazard — Salt Water Intrusion",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Blues",
    higherIsBetter: false,
    description: "Salt water intrusion susceptibility index. Relevant for coastal and river-delta areas."
  },
  hazard_storm_surge: {
    label: "Hazard — Storm Surge",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Blues",
    higherIsBetter: false,
    description: "Storm surge exposure index from NAMRIA and DOST-PAGASA."
  },
  hazard_sea_level_rise: {
    label: "Hazard — Sea Level Rise",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Blues",
    higherIsBetter: false,
    description: "Sea level rise vulnerability index. Relevant for coastal municipalities."
  },

  // ------------ ADAPTIVE CAPACITY (AC) ------------
  // 8 Capitals per DA-AMIA CRVA Framework
  // Index: 0 = very low AC, 1 = very high AC (higher is BETTER — more capacity to adapt)
  ac_index: {
    label: "Adaptive Capacity Index (Composite)",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Composite adaptive capacity index across all 8 capitals. Weight in overall CRVA: 70% (most critical component). 0–0.20 = very low, 0.20–0.40 = low, 0.40–0.60 = moderate, 0.60–0.80 = high, 0.80–1.0 = very high."
  },
  ac_economic: {
    label: "AC — Economic Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Economic capital: access to credit, number of financial institutions, cooperatives, employed population, income sources, poverty incidence."
  },
  ac_natural: {
    label: "AC — Natural Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Natural capital: forest cover, soil quality, water resource availability, protected area coverage."
  },
  ac_human: {
    label: "AC — Human Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Human capital: literacy rate, years of schooling, number of agricultural technicians, farmer education level."
  },
  ac_physical: {
    label: "AC — Physical Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Physical capital: road density, irrigation infrastructure, post-harvest facilities, storage facilities, electricity access."
  },
  ac_social: {
    label: "AC — Social Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Social capital: number of farmer organizations, cooperative membership rate, social cohesion indicators."
  },
  ac_health: {
    label: "AC — Health Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Health capital: doctor-to-population ratio, number of health facilities, life expectancy, malnutrition rates."
  },
  ac_anticipatory: {
    label: "AC — Anticipatory Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Anticipatory capital: DRRM registrations, farmer training count, % farmers with access to mobile phones/TV/radio, weather advisory access, early warning systems."
  },
  ac_institutional: {
    label: "AC — Institutional Capital",
    category: "Climate Risk Vulnerability",
    type: "index",
    unit: "(0–1)",
    aggregation: "weighted_average",
    colorScheme: "Greens",
    higherIsBetter: true,
    description: "Institutional capital: LGU income class, Cities & Municipalities Competitiveness Index (CMCI), presence of DRRM office, agricultural extension services."
  }
};

// ============================================================
// CATEGORIES — determines sidebar grouping and order
// ============================================================
const CATEGORIES = [
  "Demographics",
  "Poverty",
  "Malnutrition",
  "Rice",
  "Corn",
  "Pest and Disease",
  "ASF",
  "Soil Fertility",
  "Irrigation",
  "Infrastructure",
  "PRiSM Rice Monitoring",
  "Climate Risk Vulnerability",
  "Planning Priority"
];

// ============================================================
// COLOR SCHEMES (Brewer-inspired, colorblind-friendly)
// ============================================================
const COLOR_SCHEMES = {
  Blues:    ["#deebf7","#c6dbef","#9ecae1","#6baed6","#4292c6","#2171b5","#084594"],
  Reds:     ["#fee5d9","#fcbba1","#fc9272","#fb6a4a","#ef3b2c","#cb181d","#99000d"],
  Greens:   ["#edf8e9","#c7e9c0","#a1d99b","#74c476","#41ab5d","#238b45","#005a32"],
  Oranges:  ["#feedde","#fdd0a2","#fdae6b","#fd8d3c","#f16913","#d94801","#7f2704"],
  Purples:  ["#f2f0f7","#dadaeb","#bcbddc","#9e9ac8","#807dba","#6a51a3","#4a1486"],
  YlGn:     ["#ffffcc","#d9f0a3","#addd8e","#78c679","#41ab5d","#238443","#005a32"],
  YlOrBr:   ["#ffffe5","#fff7bc","#fee391","#fec44f","#fe9929","#ec7014","#8c2d04"],
  YlOrRd:   ["#ffffb2","#fed976","#feb24c","#fd8d3c","#fc4e2a","#e31a1c","#b10026"],
  // Diverging: blue=gain in suitability (good), red=loss in suitability (bad)
  RdBu_r:   ["#4393c3","#74add1","#abd9e9","#e0f3f8","#fee08b","#fc8d59","#d73027"],
  YlOrRd:   ["#ffffb2","#fed976","#feb24c","#fd8d3c","#fc4e2a","#e31a1c","#b10026"],
  RdYlGn:   ["#d73027","#f46d43","#fdae61","#fee08b","#d9ef8b","#a6d96a","#1a9850"],
  Bivariate: {
    "LL": "#e8e8e8", "LM": "#ace4e4", "LH": "#5ac8c8",
    "ML": "#dfb0d6", "MM": "#a5add3", "MH": "#5698b9",
    "HL": "#be64ac", "HM": "#8c62aa", "HH": "#3b4994"
  }
};

// ============================================================
// BASEMAP CONFIGURATION
// ============================================================
const BASEMAPS = {
  osm: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  cartoLight: {
    label: "CartoDB Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
  },
  cartoDark: {
    label: "CartoDB Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
  },
  esriImagery: {
    label: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
  },
  esriTopo: {
    label: "Esri World Topographic",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles © Esri — Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
  },
  // NOTE: Google Maps tiles require a valid API key and compliance with Google's Terms of Service.
  // Replace "YOUR_GOOGLE_MAPS_API_KEY" below before enabling.
  // googleSatellite: {
  //   label: "Google Satellite",
  //   url: "http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
  //   attribution: 'Map data © Google'
  // },
  // googleTerrain: {
  //   label: "Google Terrain",
  //   url: "http://mt0.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}",
  //   attribution: 'Map data © Google'
  // },
  // googleHybrid: {
  //   label: "Google Hybrid",
  //   url: "http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
  //   attribution: 'Map data © Google'
  // },
  // googleRoadmap: {
  //   label: "Google Roadmap",
  //   url: "http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
  //   attribution: 'Map data © Google'
  // }
};

// ============================================================
// VISUALIZATION STYLES
// ============================================================
const VIZ_STYLES = [
  { id: "choropleth",        label: "Choropleth" },
  { id: "gradient",          label: "Gradient" },
  { id: "proportional",      label: "Proportional Circles" },
  { id: "bivariate",         label: "Bivariate Comparison" },
  { id: "dominant_crop",     label: "Dominant Crop" },
  { id: "pie_symbols",       label: "Pie Chart Symbols" },
  { id: "bar_symbols",       label: "Bar Chart Symbols" },
  { id: "ranked",            label: "Ranked Highlight" },
  { id: "deviation",         label: "Deviation from Regional Avg" },
  { id: "ratio",             label: "Ratio Map" },
  { id: "priority",          label: "Planning Priority" }
];

// ============================================================
// PRIORITY SCORING MODELS
// ============================================================
const PRIORITY_MODELS = {
  rice: {
    label: "Rice Intervention Priority",
    weights: {
      poor_rice_farmers: 0.25,
      poverty_2023: 0.20,
      rice_yield_gap: 0.20,
      rice_mechanization_gap: 0.15,
      irrigation_gap: 0.10,
      pest_disease_score: 0.10
    }
  },
  corn: {
    label: "Corn Intervention Priority",
    weights: {
      poor_corn_farmers: 0.25,
      poverty_2023: 0.20,
      corn_yield_gap: 0.20,
      corn_mechanization_gap: 0.15,
      irrigation_gap: 0.10,
      pest_disease_score: 0.10
    }
  },
  nutrition: {
    label: "Nutrition-Sensitive Agriculture Priority",
    weights: {
      poverty_2023: 0.20,
      stunting: 0.20,
      underweight: 0.20,
      wasting: 0.15,
      population: 0.10,
      poor_rice_farmers: 0.075,
      poor_corn_farmers: 0.075
    }
  },
  climate: {
    label: "Climate & Biosecurity Priority",
    weights: {
      pest_disease_score: 0.25,
      asf_score: 0.20,
      poverty_2023: 0.15,
      irrigation_gap: 0.15,
      soil_fertility_gap: 0.15,
      poor_rice_farmers: 0.05,
      poor_corn_farmers: 0.05
    }
  },
  prism: {
    label: "PRiSM Rice Season Monitoring",
    weights: {
      prism_standing_crop_area: 0.30,
      prism_upcoming_harvest_area: 0.25,
      prism_area_gap_abs: 0.15,
      poverty_2023: 0.10,
      poor_rice_farmers: 0.10,
      pest_disease_score: 0.10
    }
  }
};

// ============================================================
// PLANNING INSIGHT RULES
// Auto-generates text interpretation for selected municipality
// ============================================================
const PLANNING_INSIGHTS = [
  {
    condition: (d) => parseFloat(d.poverty_2023) > 30 && parseInt(d.poor_rice_farmers) > 500,
    insight: "This municipality may be prioritized for poverty-sensitive rice agriculture support.",
    icon: "⚠️", level: "high"
  },
  {
    condition: (d) => parseFloat(d.poverty_2023) > 30 && parseInt(d.poor_corn_farmers) > 500,
    insight: "This municipality may be prioritized for poverty-sensitive corn agriculture support.",
    icon: "⚠️", level: "high"
  },
  {
    condition: (d) => parseFloat(d.rice_yield_2023) < 3.0 && parseInt(d.rice_area_2023) > 1000,
    insight: "This area may require productivity-enhancing interventions for rice.",
    icon: "🌾", level: "moderate"
  },
  {
    condition: (d) => parseFloat(d.corn_yield_2023) < 2.5 && parseInt(d.corn_area_2023) > 500,
    insight: "This area may require productivity-enhancing interventions for corn.",
    icon: "🌽", level: "moderate"
  },
  {
    condition: (d) => parseFloat(d.rice_mechanization_level) < 30 && parseInt(d.rice_area_2023) > 1000,
    insight: "This area may be suitable for mechanization support in rice.",
    icon: "🚜", level: "moderate"
  },
  {
    condition: (d) => parseFloat(d.corn_mechanization_level) < 30 && parseInt(d.corn_area_2023) > 500,
    insight: "This area may be suitable for mechanization support in corn.",
    icon: "🚜", level: "moderate"
  },
  {
    condition: (d) => parseInt(d.irrigated_area) < 500 && parseInt(d.rice_area_2023) > 1000,
    insight: "This area may require irrigation or drought mitigation support.",
    icon: "💧", level: "moderate"
  },
  {
    condition: (d) => d.pest_disease_occurrence === "High",
    insight: "This area may require intensified pest surveillance and crop protection support.",
    icon: "🦠", level: "high"
  },
  {
    condition: (d) => d.asf_status === "Affected",
    insight: "This area may require livestock biosecurity coordination due to ASF.",
    icon: "🐖", level: "high"
  },
  {
    condition: (d) => parseFloat(d.stunting) > 30 || parseFloat(d.underweight) > 20,
    insight: "This area shows elevated malnutrition indicators. Nutrition-sensitive agriculture programs are recommended.",
    icon: "🥗", level: "high"
  },
  // CRVA-based insights
  {
    condition: (d) => parseFloat(d.crva_index_rice) > 0.65,
    insight: "Very high climate risk vulnerability for rice production. Priority area for DA-AMIA climate-resilient agriculture (CRA) interventions and CRVA-based targeting.",
    icon: "🌡️", level: "high"
  },
  {
    condition: (d) => parseFloat(d.crva_index_rice) > 0.45 && parseFloat(d.crva_index_rice) <= 0.65,
    insight: "High climate risk vulnerability for rice. Consider climate-smart variety adoption, crop calendar adjustment, and insurance programs.",
    icon: "🌾", level: "moderate"
  },
  {
    condition: (d) => parseFloat(d.ac_index) < 0.25,
    insight: "Very low Adaptive Capacity — this municipality has limited ability to cope with climate shocks. Multi-capital capacity building (economic, physical, anticipatory) is urgently needed.",
    icon: "⚠️", level: "high"
  },
  {
    condition: (d) => parseFloat(d.hazard_flood) > 0.70 && parseFloat(d.hazard_typhoon) > 0.70,
    insight: "High combined exposure to both typhoon and flood hazards. Flood-resilient crop varieties and disaster preparedness programs should be prioritized.",
    icon: "🌊", level: "high"
  },
  {
    condition: (d) => parseFloat(d.hazard_landslide) > 0.65 || parseFloat(d.hazard_soil_erosion) > 0.65,
    insight: "High landslide or soil erosion susceptibility. Reforestation, slope stabilization, and contour farming practices are recommended for upland agriculture areas.",
    icon: "⛰️", level: "high"
  },
  {
    condition: (d) => parseFloat(d.sensitivity_rice) > 0.40,
    insight: "Rice climatic suitability is projected to decrease significantly by 2050 (RCP 8.5). Crop diversification and heat-tolerant variety deployment are recommended.",
    icon: "🔥", level: "moderate"
  },
  {
    condition: (d) => parseFloat(d.ac_anticipatory) < 0.20,
    insight: "Very low anticipatory capital. Farmer early warning system access, DRRM training, and mobile-based advisory services should be strengthened.",
    icon: "📡", level: "moderate"
  }
  ,
  {
    condition: (d) => parseFloat(d.prism_standing_crop_area) > 1500,
    insight: "Large PRiSM standing rice area remains in the field. Prioritize field monitoring, irrigation checks, and weather advisory coordination.",
    icon: "PRiSM", level: "high"
  },
  {
    condition: (d) => parseFloat(d.prism_upcoming_harvest_area) > 1500,
    insight: "High May-June harvest area is expected. Review dryer, warehouse, hauling, and buying station readiness.",
    icon: "PRiSM", level: "moderate"
  },
  {
    condition: (d) => Math.abs(parseFloat(d.prism_area_gap_vs_app_pct)) > 20,
    insight: "PRiSM detected rice area differs substantially from the app reference area. Validate municipal rice area records before final targeting.",
    icon: "PRiSM", level: "moderate"
  }
];

// ============================================================
// FACILITY CATEGORIES & TYPES
// Add new facility types here — the sidebar and map update automatically.
// Each category has a group key, label, color, and list of types.
// Each type has: key (matches facility_type in CSV), label, icon, color.
// ============================================================
const FACILITY_CATEGORIES = {
  rpc: {
    label: "Post-Production Centers",
    groupColor: "#1a6b3c",
    types: {
      RPC: { label: "Rice Processing Complex (RPC)", icon: "🏭", color: "#1a6b3c" }
    }
  },
  irrigation: {
    label: "Irrigation Facilities",
    groupColor: "#2e7d9a",
    types: {
      DD:   { label: "Diversion Dam (DD)",                   icon: "🌊", color: "#0369a1" },
      SWIP: { label: "Small Water Impounding Project (SWIP)", icon: "💧", color: "#0284c7" },
      SPIS: { label: "Solar Powered Irrigation System (SPIS)",icon: "☀️", color: "#0ea5e9" },
      STW:  { label: "Shallow Tubewell (STW)",               icon: "⛏️", color: "#38bdf8" }
    }
  },
  postharvest: {
    label: "Postharvest Facilities",
    groupColor: "#c0550e",
    types: {
      Warehouse:  { label: "Warehouse",            icon: "🏗️", color: "#92400e" },
      Ricemill:   { label: "Ricemill",             icon: "⚙️", color: "#b45309" },
      Cornmill:   { label: "Corn Mill",            icon: "🌽", color: "#d97706" },
      Dryer:      { label: "Drying Facility",      icon: "🔆", color: "#f59e0b" },
      Processing: { label: "Processing Facility",  icon: "🏪", color: "#f97316" }
    }
  }
  // Add more categories here freely, e.g.:
  // veterinary: { label: "Veterinary Stations", groupColor: "#7c3aed", types: { ... } }
};
