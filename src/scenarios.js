import { deepClone } from "./utils.js";

export const BASE_PARAMS = {
  climate: {
    solarRadiation: 780,
    airTemp: 29,
    windSpeed: 2.4,
    cloudCover: 0.18,
    rainInput: 0,
  },
  water: {
    maxDepth: 28,
    surfaceAreaFactor: 1,
    transparency: 4.8,
    initialStratification: 0.76,
    residenceTime: 140,
  },
  quality: {
    initialDO: 8.6,
    initialNutrientLoad: 0.62,
    organicMatterLoad: 0.64,
    turbidity: 2.4,
    conductivityBaseline: 210,
    pHBaseline: 7.5,
  },
  time: {
    season: "summer",
    duration: 180,
    timeStepMode: "daily",
  },
  display: {
    showParticles: true,
    showFishAndAlgae: true,
    showLabels: true,
    compareWithBaseline: false,
  },
  meta: {
    description: "",
    guide: "",
  },
};

export const SCENARIOS = {
  summer_stable: {
    label: "Summer stable stratification",
    description: "Warm calm conditions create a strong epilimnion, a clear thermocline, and declining oxygen at depth.",
    guide: "Watch how surface heating and weak wind keep the epilimnion isolated while decomposition gradually consumes deep oxygen.",
    params: {
      climate: { solarRadiation: 820, airTemp: 30, windSpeed: 2.1, cloudCover: 0.12, rainInput: 0 },
      water: { maxDepth: 30, transparency: 4.7, initialStratification: 0.82 },
      quality: { initialDO: 8.8, initialNutrientLoad: 0.7, organicMatterLoad: 0.7, turbidity: 2.2 },
      time: { season: "summer", duration: 160, timeStepMode: "daily" },
      meta: {
        description: "Classic warm-season stratification in a temperate lake or reservoir.",
        guide: "A strong density difference forms between warm surface water and the cool hypolimnion.",
      },
    },
    tuning: {
      deepCooling: 1.1,
      oxygenDeficit: 1.05,
      nutrientBias: 1,
      algaeBias: 1,
    },
  },
  wind_mixing: {
    label: "Wind mixing event",
    description: "A storm-like wind pulse deepens the mixed layer and partially erodes the thermocline.",
    guide: "Increase wind and observe mixing arrows push deeper, temporarily improving bottom oxygen while cooling the surface.",
    params: {
      climate: { solarRadiation: 620, airTemp: 24, windSpeed: 8.5, cloudCover: 0.48, rainInput: 6 },
      water: { maxDepth: 26, transparency: 3.8, initialStratification: 0.58 },
      quality: { initialDO: 8.1, initialNutrientLoad: 0.8, organicMatterLoad: 0.7, turbidity: 3.2 },
      time: { season: "summer", duration: 90, timeStepMode: "daily" },
    },
    tuning: {
      deepCooling: 0.9,
      oxygenDeficit: 0.8,
      nutrientBias: 1,
      algaeBias: 0.85,
    },
  },
  eutrophic_reservoir: {
    label: "Eutrophic reservoir",
    description: "High nutrients and organic matter increase bloom risk and accelerate oxygen depletion in deep water.",
    guide: "Compare rapid surface algae growth with the delayed ecological cost of decomposition and internal nutrient release.",
    params: {
      climate: { solarRadiation: 760, airTemp: 28, windSpeed: 1.8, cloudCover: 0.2, rainInput: 2 },
      water: { maxDepth: 24, transparency: 2.2, initialStratification: 0.74, residenceTime: 220 },
      quality: { initialDO: 7.9, initialNutrientLoad: 1.55, organicMatterLoad: 1.4, turbidity: 5.6, conductivityBaseline: 320, pHBaseline: 7.7 },
      time: { season: "summer", duration: 180, timeStepMode: "daily" },
    },
    tuning: {
      deepCooling: 0.95,
      oxygenDeficit: 1.28,
      nutrientBias: 1.45,
      algaeBias: 1.35,
    },
  },
  oligotrophic_lake: {
    label: "Clear oligotrophic lake",
    description: "Clear water allows deeper light penetration, but low nutrients keep algae and oxygen demand modest.",
    guide: "Notice the sharp thermal structure and relatively healthy deep oxygen maintained by low organic loading.",
    params: {
      climate: { solarRadiation: 740, airTemp: 24, windSpeed: 2.7, cloudCover: 0.12, rainInput: 0 },
      water: { maxDepth: 38, transparency: 9.5, initialStratification: 0.68, residenceTime: 300 },
      quality: { initialDO: 9.4, initialNutrientLoad: 0.22, organicMatterLoad: 0.28, turbidity: 0.8, conductivityBaseline: 120, pHBaseline: 7.3 },
      time: { season: "summer", duration: 180, timeStepMode: "daily" },
    },
    tuning: {
      deepCooling: 1.2,
      oxygenDeficit: 0.62,
      nutrientBias: 0.55,
      algaeBias: 0.55,
    },
  },
  rainfall_pulse: {
    label: "Rainfall and turbidity pulse",
    description: "Rain adds surface cooling, suspended particles, and external loading that temporarily modifies the upper water column.",
    guide: "Track how the surface plume reduces light penetration, weakens heating, and carries nutrients into the upper layers.",
    params: {
      climate: { solarRadiation: 520, airTemp: 22, windSpeed: 4.4, cloudCover: 0.62, rainInput: 18 },
      water: { maxDepth: 22, transparency: 2.6, initialStratification: 0.44, residenceTime: 90 },
      quality: { initialDO: 8.2, initialNutrientLoad: 0.95, organicMatterLoad: 0.82, turbidity: 8.4, conductivityBaseline: 250, pHBaseline: 7.2 },
      time: { season: "spring", duration: 70, timeStepMode: "daily" },
    },
    tuning: {
      deepCooling: 0.82,
      oxygenDeficit: 0.92,
      nutrientBias: 1.1,
      algaeBias: 0.95,
    },
  },
  autumn_turnover: {
    label: "Autumn turnover",
    description: "Cooling and stronger winds break down stratification, redistributing heat, oxygen, and nutrients through the full water column.",
    guide: "Observe how surface cooling and wind reduce density contrasts until the lake approaches full mixing.",
    params: {
      climate: { solarRadiation: 360, airTemp: 9, windSpeed: 8.2, cloudCover: 0.45, rainInput: 4 },
      water: { maxDepth: 26, transparency: 4.2, initialStratification: 0.18 },
      quality: { initialDO: 8.4, initialNutrientLoad: 0.86, organicMatterLoad: 0.72, turbidity: 2.8 },
      time: { season: "autumn", duration: 90, timeStepMode: "weekly" },
    },
    tuning: {
      deepCooling: 0.65,
      oxygenDeficit: 0.82,
      nutrientBias: 1,
      algaeBias: 0.72,
    },
  },
};

export function getScenarioKeys() {
  return Object.keys(SCENARIOS);
}

export function buildScenarioParams(key) {
  const scenario = SCENARIOS[key] ?? SCENARIOS.summer_stable;
  const merged = deepClone(BASE_PARAMS);
  for (const section of Object.keys(scenario.params)) {
    merged[section] = { ...merged[section], ...scenario.params[section] };
  }
  merged.meta = {
    description: scenario.description,
    guide: scenario.guide,
  };
  return merged;
}
