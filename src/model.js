import { BASE_PARAMS, SCENARIOS, buildScenarioParams } from "./scenarios.js";
import { average, clamp, deepClone, formatNumber, lerp, mapRange, weightedAverage } from "./utils.js";

export const LAYER_COUNT = 24;

const SEASONAL_RADIATION_FACTOR = {
  spring: 0.88,
  summer: 1,
  autumn: 0.66,
  winter: 0.42,
};

const SEASONAL_TEMP_OFFSET = {
  spring: 1,
  summer: 4,
  autumn: -2,
  winter: -7,
};

function saturationOxygen(tempCelsius) {
  return clamp(14.6 - 0.39 * tempCelsius + 0.006 * tempCelsius * tempCelsius, 5.4, 14.6);
}

function densityFromTemperature(tempCelsius) {
  // Educational simplification: colder water is denser, which makes turnover easier to interpret.
  return 1.002 - tempCelsius * 0.00034;
}

function logistic(depth, midpoint, sharpness) {
  return 1 / (1 + Math.exp((depth - midpoint) / sharpness));
}

function scenarioTuning(key) {
  return SCENARIOS[key]?.tuning ?? {
    deepCooling: 1,
    oxygenDeficit: 1,
    nutrientBias: 1,
    algaeBias: 1,
  };
}

function buildInitialLayers(params, scenarioKey) {
  const maxDepth = params.water.maxDepth;
  const thickness = maxDepth / LAYER_COUNT;
  const stratification = params.water.initialStratification;
  const tuning = scenarioTuning(scenarioKey);
  const seasonOffset = SEASONAL_TEMP_OFFSET[params.time.season];
  const surfaceTemp = clamp(
    10
      + params.climate.airTemp * 0.38
      + (params.climate.solarRadiation - 500) * 0.006
      + seasonOffset,
    8,
    30
  );
  const bottomTemp = clamp(
    surfaceTemp - (6.5 + 10.5 * stratification * tuning.deepCooling),
    4,
    24
  );
  const thermoclineDepth = clamp(
    maxDepth * (0.2 + 0.22 * (1 - stratification) + 0.04 * params.water.surfaceAreaFactor),
    4,
    maxDepth * 0.7
  );
  const width = 1.4 + (1 - stratification) * 4.4;
  const layers = [];

  for (let index = 0; index < LAYER_COUNT; index += 1) {
    const depth = (index + 0.5) * thickness;
    const thermalShape = logistic(depth, thermoclineDepth, width);
    const temperature = lerp(bottomTemp, surfaceTemp, thermalShape);
    const oxygenSurface = params.quality.initialDO;
    const deepOxygenPenalty = (1.4 + 2.3 * stratification + 1.15 * params.quality.organicMatterLoad) * tuning.oxygenDeficit;
    const oxygen = clamp(
      oxygenSurface - deepOxygenPenalty * (1 - logistic(depth, thermoclineDepth + width * 0.8, width * 1.2)),
      1.8,
      11
    );
    const nutrientSurface = params.quality.initialNutrientLoad * (0.35 + 0.15 * params.quality.turbidity / 8);
    const nutrientBottom = params.quality.initialNutrientLoad * (1.1 + 1.5 * stratification) * tuning.nutrientBias;
    const nutrients = clamp(
      lerp(nutrientSurface, nutrientBottom, 1 - thermalShape),
      0.05,
      4
    );
    const light = Math.exp(-depth / Math.max(0.8, params.water.transparency * 1.45));
    const algae = clamp(
      (0.22 + 0.9 * params.quality.initialNutrientLoad * light * tuning.algaeBias) * (0.85 + thermalShape * 0.6),
      0.05,
      3.6
    );
    const organicMatter = clamp(
      params.quality.organicMatterLoad * (0.75 + 0.65 * (1 - thermalShape)),
      0.08,
      3.2
    );
    const turbidity = clamp(
      params.quality.turbidity * (0.8 + (1 - light) * 0.18 + params.climate.rainInput * 0.012),
      0.1,
      20
    );
    const conductivity = clamp(
      params.quality.conductivityBaseline + depth * 1.9 + nutrients * 26 + turbidity * 2.2,
      40,
      1200
    );
    const pH = clamp(
      params.quality.pHBaseline + light * 0.28 - (1 - light) * 0.18 + algae * 0.03 - nutrients * 0.04,
      6,
      9.1
    );

    layers.push({
      depth,
      thickness,
      temperature,
      density: densityFromTemperature(temperature),
      oxygen,
      pH,
      conductivity,
      turbidity,
      nutrients,
      algae,
      organicMatter,
      light,
    });
  }

  return layers;
}

function computeGradients(layers) {
  const gradients = [];
  for (let i = 0; i < layers.length - 1; i += 1) {
    const layer = layers[i];
    const next = layers[i + 1];
    const tempGradient = Math.abs(next.temperature - layer.temperature) / layer.thickness;
    const densityGradient = Math.abs(next.density - layer.density) / layer.thickness;
    gradients.push({
      depth: layer.depth + layer.thickness * 0.5,
      tempGradient,
      densityGradient,
    });
  }
  return gradients;
}

function computeMetrics(layers, params) {
  layers.forEach((layer) => {
    layer.density = densityFromTemperature(layer.temperature);
  });

  const gradients = computeGradients(layers);
  const strongestGradient = gradients.reduce(
    (best, candidate) => (candidate.tempGradient > best.tempGradient ? candidate : best),
    { depth: null, tempGradient: 0, densityGradient: 0 }
  );
  const thermoclineDepth = strongestGradient.tempGradient > 0.45 ? strongestGradient.depth : null;
  const surfaceTemp = layers[0].temperature;
  const bottomTemp = layers[layers.length - 1].temperature;
  const surfaceOxygen = layers[0].oxygen;
  const bottomOxygen = layers[layers.length - 1].oxygen;
  const densitySpread = Math.abs(layers[0].density - layers[layers.length - 1].density);
  const stabilityIndex = clamp(
    ((surfaceTemp - bottomTemp) / 13) * 0.6 + average(gradients.map((gradient) => gradient.densityGradient)) * 18 + densitySpread * 22,
    0,
    1.4
  );
  const mixedDepth = layers.reduce((depth, layer) => {
    if (Math.abs(layer.temperature - surfaceTemp) <= 0.7 && Math.abs(layer.oxygen - surfaceOxygen) <= 1.2) {
      return layer.depth;
    }
    return depth;
  }, layers[0].depth);
  const upperZone = layers.filter((layer) => layer.depth <= params.water.transparency * 1.8);
  const lowerZone = layers.filter((layer) => layer.depth >= params.water.maxDepth * 0.75);
  const surfaceNutrientMean = average(upperZone.map((layer) => layer.nutrients));
  const bottomNutrients = average(lowerZone.map((layer) => layer.nutrients));
  const meanSurfaceAlgae = average(upperZone.map((layer) => layer.algae));
  const nutrientScore = clamp((surfaceNutrientMean - 0.55) / 1.1, 0, 1);
  const algaeScore = clamp((meanSurfaceAlgae - 0.45) / 1.6, 0, 1);
  const stabilityScore = clamp((stabilityIndex - 0.25) / 0.85, 0, 1);
  const warmthScore = clamp((surfaceTemp - 16) / 12, 0, 1);
  const retentionFactor = thermoclineDepth
    ? clamp(0.75 + stabilityScore * 0.35, 0.75, 1.1)
    : 0.55;
  const bloomRisk = clamp(
    (
      nutrientScore * 0.34
      + algaeScore * 0.28
      + stabilityScore * 0.22
      + warmthScore * 0.16
    ) * retentionFactor,
    0,
    1.2
  );

  let stratificationState = "Mixed";
  if (thermoclineDepth && stabilityIndex > 0.75) {
    stratificationState = "Strongly stratified";
  } else if (thermoclineDepth && stabilityIndex > 0.38) {
    stratificationState = "Weakly stratified";
  }

  const habitatSegments = [];
  let segmentStart = null;
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const habitable = layer.oxygen > 5 && layer.temperature >= 6 && layer.temperature <= 28;
    if (habitable && segmentStart === null) {
      segmentStart = index;
    } else if (!habitable && segmentStart !== null) {
      habitatSegments.push([segmentStart, index - 1]);
      segmentStart = null;
    }
  }
  if (segmentStart !== null) {
    habitatSegments.push([segmentStart, layers.length - 1]);
  }

  const bestHabitatSegment = habitatSegments.reduce((best, segment) => {
    const span = segment[1] - segment[0] + 1;
    if (!best || span > best[1] - best[0] + 1) {
      return segment;
    }
    return best;
  }, null);
  const fishRefugeThickness = bestHabitatSegment
    ? (bestHabitatSegment[1] - bestHabitatSegment[0] + 1) * layers[0].thickness
    : 0;
  const fishRefugeTop = bestHabitatSegment
    ? Math.max(0, layers[bestHabitatSegment[0]].depth - layers[0].thickness * 0.5)
    : null;
  const fishRefugeBottom = bestHabitatSegment
    ? Math.min(params.water.maxDepth, layers[bestHabitatSegment[1]].depth + layers[0].thickness * 0.5)
    : null;
  const habitatCompression = fishRefugeThickness > 0
    && fishRefugeThickness < Math.max(4, params.water.maxDepth * 0.28);
  const internalRelease = bottomOxygen < 2.2 && bottomNutrients > surfaceNutrientMean * 1.45;
  const ecosystemStatus = bottomOxygen < 0.6
    ? "Critical"
    : bottomOxygen < 2
      ? "Hypoxic"
      : bloomRisk > 0.72
        ? "Bloom risk"
        : stratificationState === "Mixed"
          ? "Recovered"
          : "Stable";

  return {
    thermoclineDepth,
    strongestGradient: strongestGradient.tempGradient,
    stabilityIndex,
    mixedDepth,
    surfaceTemp,
    bottomTemp,
    surfaceOxygen,
    bottomOxygen,
    surfaceNutrients: surfaceNutrientMean,
    bottomNutrients,
    surfaceAlgae: meanSurfaceAlgae,
    bloomRisk,
    stratificationState,
    fishRefugeTop,
    fishRefugeBottom,
    fishRefugeThickness,
    habitatCompression,
    internalRelease,
    ecosystemStatus,
  };
}

function buildAlerts(state) {
  const alerts = [];
  const { metrics } = state;

  if (metrics.stratificationState === "Strongly stratified") {
    alerts.push({
      level: "info",
      title: "A stable thermocline has formed",
      detail: "Warm surface water is now separated from colder deep water, limiting vertical exchange.",
    });
  }

  if (metrics.stratificationState === "Mixed") {
    alerts.push({
      level: "info",
      title: "The water column is close to full mixing",
      detail: "Temperature differences are weak, so oxygen and nutrients can redistribute more easily.",
    });
  }

  if (metrics.bottomOxygen < 3 && metrics.bottomOxygen >= 0.6) {
    alerts.push({
      level: "warning",
      title: "Deep water oxygen is decreasing",
      detail: "Respiration and decomposition exceed oxygen supply in the poorly mixed hypolimnion.",
    });
  }

  if (metrics.bottomOxygen < 2) {
    alerts.push({
      level: "danger",
      title: "Bottom layers have entered hypoxia",
      detail: "Fish and aerobic benthic organisms lose viable habitat as deep oxygen falls below ecological thresholds.",
    });
  }

  if (metrics.bottomOxygen < 0.6) {
    alerts.push({
      level: "danger",
      title: "Anoxia is developing near the sediments",
      detail: "Oxygen is nearly absent, increasing stress and favoring strongly reducing sediment conditions.",
    });
  }

  if (metrics.internalRelease) {
    alerts.push({
      level: "warning",
      title: "Internal nutrient release is likely increasing",
      detail: "Low oxygen at the sediment-water interface can mobilize phosphorus-like nutrients back into the water column.",
    });
  }

  if (metrics.bloomRisk > 0.72) {
    alerts.push({
      level: "warning",
      title: "Algal bloom risk is high",
      detail: "Warm illuminated surface layers plus available nutrients favor rapid algal growth and later oxygen demand.",
    });
  }

  if (metrics.habitatCompression) {
    alerts.push({
      level: "warning",
      title: "Fish habitat is compressed",
      detail: "Suitable temperature and oxygen overlap in a thinner vertical band, forcing organisms into a narrow refuge.",
    });
  }

  if (!alerts.length) {
    alerts.push({
      level: "info",
      title: "Conditions remain within a moderate range",
      detail: "Profiles show no acute oxygen stress or bloom warning at the moment.",
    });
  }

  return alerts;
}

function buildExplanations(state, mode) {
  const { metrics, params, alerts } = state;
  const guide = mode === "guided" ? params.meta.guide : null;
  const what = guide
    ? `${guide} Current state: ${metrics.stratificationState.toLowerCase()} with a surface temperature near ${formatNumber(metrics.surfaceTemp)} C.`
    : metrics.stratificationState === "Mixed"
      ? "The lake is close to an isothermal profile, so the major layers are blending together."
      : `The water column is split into a warm epilimnion, a transition zone near ${formatNumber(metrics.thermoclineDepth ?? 0)} m, and a cooler hypolimnion.`;
  const why = metrics.stratificationState === "Mixed"
    ? "Cooling and wind reduce density differences, allowing surface water to exchange with deeper layers."
    : `Solar heating warms the surface, while density differences resist wind mixing. That keeps oxygen and nutrients from moving freely across the thermocline.`;
  const impact = alerts[0]?.detail ?? "Ecological effects are limited right now.";

  return { what, why, impact };
}

function buildHistoryEntry(state) {
  return {
    day: state.time.elapsedDays,
    bottomOxygen: state.metrics.bottomOxygen,
    thermoclineDepth: state.metrics.thermoclineDepth ?? 0,
    bloomRisk: state.metrics.bloomRisk,
    stabilityIndex: state.metrics.stabilityIndex,
  };
}

function historySampleInterval(state) {
  return state.params.time.timeStepMode === "weekly" ? 2 : 0.5;
}

function pushHistory(state) {
  const entry = buildHistoryEntry(state);
  const lastEntry = state.history[state.history.length - 1];
  const sampleInterval = historySampleInterval(state);
  const currentBucket = Math.floor(entry.day / sampleInterval);
  const lastBucket = lastEntry ? Math.floor(lastEntry.day / sampleInterval) : -1;

  if (!lastEntry) {
    state.history.push(entry);
    return;
  }

  if (currentBucket === lastBucket) {
    state.history[state.history.length - 1] = entry;
    return;
  }

  state.history.push(entry);

  const maxEntries = Math.ceil(state.params.time.duration / sampleInterval) + 4;
  if (state.history.length > maxEntries) {
    state.history.shift();
  }
}

function mixLayerRange(layers, limitDepth, strength) {
  const mixable = layers.filter((layer) => layer.depth <= limitDepth);
  if (mixable.length < 2) {
    return;
  }

  const properties = [
    "temperature",
    "oxygen",
    "nutrients",
    "algae",
    "pH",
    "conductivity",
    "turbidity",
    "organicMatter",
  ];

  properties.forEach((key) => {
    const mean = weightedAverage(mixable, (layer) => layer[key]);
    mixable.forEach((layer) => {
      layer[key] = lerp(layer[key], mean, strength);
    });
  });
}

function diffuseNeighbors(layers, property, coefficient) {
  const deltas = new Array(layers.length).fill(0);
  for (let i = 0; i < layers.length - 1; i += 1) {
    const flux = (layers[i][property] - layers[i + 1][property]) * coefficient;
    deltas[i] -= flux;
    deltas[i + 1] += flux;
  }
  layers.forEach((layer, index) => {
    layer[property] += deltas[index];
  });
}

function adjustDensityInstability(layers) {
  const properties = [
    "temperature",
    "oxygen",
    "nutrients",
    "algae",
    "pH",
    "conductivity",
    "turbidity",
    "organicMatter",
  ];

  for (let pass = 0; pass < layers.length * 2; pass += 1) {
    let changed = false;
    layers.forEach((layer) => {
      layer.density = densityFromTemperature(layer.temperature);
    });

    for (let i = 0; i < layers.length - 1; i += 1) {
      const upper = layers[i];
      const lower = layers[i + 1];

      // If the upper layer becomes denser than the one below, the profile is unstable and overturns.
      if (upper.density > lower.density + 0.00002) {
        properties.forEach((property) => {
          const mean = (upper[property] + lower[property]) / 2;
          upper[property] = mean;
          lower[property] = mean;
        });
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }
}

function enforceBounds(layers) {
  layers.forEach((layer) => {
    layer.temperature = clamp(layer.temperature, 1.5, 33);
    layer.oxygen = clamp(layer.oxygen, 0, 14.5);
    layer.nutrients = clamp(layer.nutrients, 0.03, 5);
    layer.algae = clamp(layer.algae, 0.02, 4.5);
    layer.organicMatter = clamp(layer.organicMatter, 0.04, 5);
    layer.pH = clamp(layer.pH, 5.8, 9.2);
    layer.conductivity = clamp(layer.conductivity, 20, 1600);
    layer.turbidity = clamp(layer.turbidity, 0.05, 30);
  });
}

export function createSimulationState(scenarioKey = "summer_stable", paramsOverride = null) {
  const params = paramsOverride ? deepClone(paramsOverride) : buildScenarioParams(scenarioKey);
  const layers = buildInitialLayers(params, scenarioKey);
  adjustDensityInstability(layers);
  const state = {
    scenarioKey,
    params,
    layers,
    time: {
      elapsedDays: 0,
      running: true,
    },
    history: [],
    metrics: computeMetrics(layers, params),
    alerts: [],
    explanation: { what: "", why: "", impact: "" },
  };
  state.alerts = buildAlerts(state);
  state.explanation = buildExplanations(state, "free");
  pushHistory(state);
  return state;
}

export function cloneSimulationState(state) {
  return createSimulationState(state.scenarioKey, deepClone(state.params));
}

export function updateDisplayOption(state, key, value) {
  state.params.display[key] = value;
}

export function applyScenario(state, scenarioKey) {
  const nextState = createSimulationState(scenarioKey);
  Object.assign(state, nextState);
}

export function stepSimulation(state, dtDays, mode = "free") {
  const { layers, params } = state;
  const tuning = scenarioTuning(state.scenarioKey);
  const seasonalFactor = SEASONAL_RADIATION_FACTOR[params.time.season];
  const dayPhase = state.time.elapsedDays % 1;
  const diurnal = 0.56 + 0.44 * Math.sin(dayPhase * Math.PI * 2 - Math.PI / 2);
  const effectiveSolar = params.climate.solarRadiation * seasonalFactor * (1 - params.climate.cloudCover * 0.78) * clamp(diurnal + 0.18, 0.14, 1.12);
  const lightScale = Math.max(0.9, params.water.transparency * 1.55);
  const previousMetrics = computeMetrics(layers, params);
  const mixingResistance = clamp(previousMetrics.stabilityIndex * 0.85, 0, 1.1);
  const oxygenDemandFactor = clamp(0.75 + (tuning.oxygenDeficit - 1) * 0.7, 0.45, 1.45);
  const nutrientRegenerationFactor = clamp(0.7 + (tuning.nutrientBias - 1) * 0.8, 0.35, 1.6);
  const exchangeDepth = clamp(
    Math.max(2.4, previousMetrics.mixedDepth + params.climate.windSpeed * 0.55),
    2.4,
    params.water.maxDepth * 0.45
  );

  layers.forEach((layer, index) => {
    layer.light = Math.exp(-layer.depth / lightScale) * clamp(1 - layer.turbidity * 0.026, 0.08, 1);
    const surfaceExposure = Math.exp(-layer.depth / 2.7);
    const decompositionFactor = clamp(0.42 + (layer.temperature - 4) * 0.03, 0.38, 1.18);
    const rainCooling = params.climate.rainInput * 0.0038 * surfaceExposure * dtDays;
    const heatGain = 0.00092 * effectiveSolar * layer.light * dtDays / (1 + layer.depth * 0.16);
    const airExchange = (params.climate.airTemp - layer.temperature) * 0.041 * surfaceExposure * dtDays;
    const nightCooling = (1 - diurnal) * 0.082 * surfaceExposure * dtDays;
    layer.temperature += heatGain + airExchange - rainCooling - nightCooling;

    const nutrientLim = layer.nutrients / (0.35 + layer.nutrients);
    const tempLim = clamp((layer.temperature - 4) / 18, 0, 1.25);
    const lightLim = clamp(layer.light, 0, 1);
    const photosynthesis = 0.17 * layer.algae * lightLim * nutrientLim * tempLim * tuning.algaeBias * dtDays;
    const respiration = (
      0.038 * layer.algae
      + 0.062 * layer.organicMatter
      + 0.0022 * index
    ) * oxygenDemandFactor * decompositionFactor * dtDays;
    const sedimentDemand = layer.depth > params.water.maxDepth * 0.82
      ? (0.018 + 0.05 * layer.organicMatter) * oxygenDemandFactor * decompositionFactor * dtDays
      : 0;
    const exchangeExposure = clamp(1 - layer.depth / exchangeDepth, 0, 1);
    const reaerationRate = (0.2 + params.climate.windSpeed * 0.03 + exchangeExposure * 0.22) * exchangeExposure;
    const atmosphere = reaerationRate * (saturationOxygen(layer.temperature) - layer.oxygen) * dtDays;
    layer.oxygen += atmosphere + photosynthesis - respiration - sedimentDemand;

    const mineralization = (
      0.007
      + 0.014 * layer.organicMatter
      + (1 - layer.light) * 0.004
    ) * nutrientRegenerationFactor * decompositionFactor * dtDays;
    const uptake = photosynthesis * 0.24;
    const internalRelease = layer.depth > params.water.maxDepth * 0.8 && layer.oxygen < 2
      ? (2 - layer.oxygen) * (0.016 + layer.organicMatter * 0.012) * nutrientRegenerationFactor * dtDays
      : 0;
    // Represent nutrient burial / retention so clear, low-load systems do not unrealistically enrich over time.
    const nutrientExportFactor = clamp(1.08 - (tuning.nutrientBias - 1) * 0.55, 0.65, 1.35);
    const burialLoss = layer.nutrients * (
      0.0025
      + clamp((1 - params.quality.turbidity / 10), 0, 1) * 0.003
      + clamp(1 - nutrientRegenerationFactor, 0, 0.5) * 0.003
    ) * nutrientExportFactor * dtDays;
    layer.nutrients += mineralization + internalRelease - uptake - burialLoss;

    const stratificationBonus = clamp(previousMetrics.stabilityIndex * 0.7 + 0.45, 0.35, 1.3);
    const algaeGrowth = 0.15 * layer.algae * lightLim * nutrientLim * tempLim * stratificationBonus * tuning.algaeBias * dtDays;
    const algaeLossModifier = clamp(1.08 - (tuning.algaeBias - 1) * 0.38, 0.82, 1.18);
    const algaeLoss = (0.062 + layer.turbidity * 0.0024 + Math.max(0, layer.temperature - 29) * 0.008) * algaeLossModifier * layer.algae * dtDays;
    layer.algae += algaeGrowth - algaeLoss;

    const settling = clamp(layer.algae * 0.055 * dtDays, 0, layer.algae * 0.3);
    layer.algae -= settling * 0.42;
    layer.organicMatter += settling + algaeLoss * 0.3 - layer.organicMatter * 0.02 * dtDays;

    if (index < 3) {
      layer.turbidity += params.climate.rainInput * 0.022 * surfaceExposure * dtDays;
    } else {
      layer.turbidity -= 0.018 * dtDays;
    }

    layer.conductivity += (params.quality.conductivityBaseline + layer.nutrients * 36 + layer.depth * 0.8 - layer.conductivity) * 0.08 * dtDays;
    layer.pH += (params.quality.pHBaseline + photosynthesis * 0.22 - respiration * 0.08 - layer.nutrients * 0.018 - layer.pH) * 0.18 * dtDays;
  });

  const mixedDepth = clamp(
    1.8
      + params.climate.windSpeed * 1.15
      + params.climate.rainInput * 0.08
      + Math.max(0, layers[0].temperature - params.climate.airTemp) * 0.2
      - mixingResistance * 6.4,
    1.5,
    params.water.maxDepth * 0.88
  );
  const mixingStrength = clamp((params.climate.windSpeed * 0.05 + params.climate.rainInput * 0.003) * Math.sqrt(dtDays), 0.03, 0.48);
  mixLayerRange(layers, mixedDepth, mixingStrength);

  const surfaceCoolingDrive = clamp(
    Math.max(0, layers[0].temperature - params.climate.airTemp) * 0.05
      + params.climate.cloudCover * 0.8
      + clamp((550 - params.climate.solarRadiation) / 550, 0, 1) * 0.65,
    0,
    3
  );
  const turnoverPotential = Math.max(
    0,
    surfaceCoolingDrive + params.climate.windSpeed * 0.12 - previousMetrics.stabilityIndex * 0.55
  );
  if (turnoverPotential > 0.04) {
    const convectiveDepth = clamp(
      mixedDepth + turnoverPotential * 9.5,
      2,
      params.water.maxDepth
    );
    const convectiveStrength = clamp(
      0.08 + turnoverPotential * 0.24 * Math.sqrt(dtDays),
      0.08,
      0.82
    );
    mixLayerRange(layers, convectiveDepth, convectiveStrength);
  }

  const nearFullTurnover = surfaceCoolingDrive > 1.05
    && (
      (previousMetrics.mixedDepth > params.water.maxDepth * 0.55 && previousMetrics.stabilityIndex < 0.72)
      || (previousMetrics.stabilityIndex < 0.42 && previousMetrics.strongestGradient < 0.36)
    );
  if (nearFullTurnover) {
    const turnoverStrength = clamp(
      0.24 + surfaceCoolingDrive * 0.16 * Math.sqrt(dtDays),
      0.28,
      0.78
    );
    mixLayerRange(layers, params.water.maxDepth, turnoverStrength);
  }

  ["temperature", "oxygen", "nutrients", "algae", "organicMatter", "turbidity"].forEach((property) => {
    const base = property === "temperature" ? 0.012 : 0.008;
    diffuseNeighbors(layers, property, base * (1 + params.climate.windSpeed * 0.02) * Math.sqrt(dtDays));
  });

  for (let i = 0; i < layers.length - 1; i += 1) {
    const settlingFlux = clamp(layers[i].organicMatter * 0.015 * dtDays, 0, 0.08);
    layers[i].organicMatter -= settlingFlux;
    layers[i + 1].organicMatter += settlingFlux;
  }

  enforceBounds(layers);
  adjustDensityInstability(layers);
  state.metrics = computeMetrics(layers, params);
  state.alerts = buildAlerts(state);
  state.explanation = buildExplanations(state, mode);
  state.time.elapsedDays += dtDays;
  pushHistory(state);
}

export function summarizeState(state) {
  const densityInversions = computeGradients(state.layers).filter((gradient, index) => {
    const upper = state.layers[index];
    const lower = state.layers[index + 1];
    return upper.density > lower.density + 0.00002;
  }).length;
  const middleLayer = state.layers[Math.floor(state.layers.length / 2)];
  return {
    scenario: state.scenarioKey,
    elapsedDays: Number(formatNumber(state.time.elapsedDays, 1)),
    stratificationState: state.metrics.stratificationState,
    thermoclineDepth: Number(formatNumber(state.metrics.thermoclineDepth ?? 0, 1)),
    mixedDepth: Number(formatNumber(state.metrics.mixedDepth ?? 0, 1)),
    surfaceTemp: Number(formatNumber(state.metrics.surfaceTemp, 1)),
    middleTemp: Number(formatNumber(middleLayer.temperature, 1)),
    bottomTemp: Number(formatNumber(state.metrics.bottomTemp, 1)),
    bottomOxygen: Number(formatNumber(state.metrics.bottomOxygen, 2)),
    surfaceNutrients: Number(formatNumber(state.metrics.surfaceNutrients, 2)),
    surfaceAlgae: Number(formatNumber(state.metrics.surfaceAlgae, 2)),
    bloomRisk: Number(formatNumber(state.metrics.bloomRisk, 2)),
    fishRefugeThickness: Number(formatNumber(state.metrics.fishRefugeThickness ?? 0, 1)),
    habitatCompression: state.metrics.habitatCompression,
    densityInversions,
    alerts: state.alerts.map((alert) => alert.title),
    layerSample: state.layers.slice(0, 4).map((layer) => ({
      depth: Number(formatNumber(layer.depth, 1)),
      temperature: Number(formatNumber(layer.temperature, 1)),
      oxygen: Number(formatNumber(layer.oxygen, 1)),
      nutrients: Number(formatNumber(layer.nutrients, 2)),
    })),
    coordinateSystem: "Lake scene canvas origin at top-left; depth increases downward.",
  };
}

export function mutateParameterTree(params, section, key, value) {
  if (section in params) {
    params[section][key] = value;
  }
}

export function structuralParameter(section, key) {
  const structuralKeys = new Set([
    "maxDepth",
    "initialStratification",
    "initialDO",
    "initialNutrientLoad",
    "organicMatterLoad",
    "turbidity",
    "conductivityBaseline",
    "pHBaseline",
    "season",
  ]);
  return structuralKeys.has(key) || section === "time";
}

export function getBaseParams() {
  return deepClone(BASE_PARAMS);
}
