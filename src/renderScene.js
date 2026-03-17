import { clamp, formatNumber, interpolateColor, lerp, mapRange } from "./utils.js";

const COLOR_RAMPS = {
  temperature: ["#154b7d", "#3a95b5", "#9bd7d8", "#f5c867", "#e8834d"],
  oxygen: ["#862a45", "#c85a4f", "#f1b96b", "#9cd1af", "#2f8e80"],
  nutrients: ["#dff5fb", "#9dd8ea", "#84c096", "#d2bf5a", "#cf7d3c"],
  stability: ["#dff1f1", "#9fced6", "#5599ab", "#2d6a7b", "#193f4f"],
};

function lakeGeometry(canvas) {
  return {
    skyTop: 0,
    skyBottom: canvas.height * 0.26,
    waterTop: canvas.height * 0.24,
    waterBottom: canvas.height * 0.9,
    left: canvas.width * 0.08,
    right: canvas.width * 0.93,
    bottomLeft: canvas.width * 0.14,
    bottomRight: canvas.width * 0.88,
  };
}

function lakePath(ctx, canvas) {
  const g = lakeGeometry(canvas);
  ctx.beginPath();
  ctx.moveTo(g.left, g.waterTop);
  ctx.quadraticCurveTo(canvas.width * 0.05, g.waterTop - 8, g.bottomLeft, g.waterBottom + 10);
  ctx.quadraticCurveTo(canvas.width * 0.45, g.waterBottom + 16, canvas.width * 0.54, g.waterBottom);
  ctx.quadraticCurveTo(canvas.width * 0.68, g.waterBottom + 60, g.bottomRight, g.waterBottom + 10);
  ctx.quadraticCurveTo(canvas.width * 0.95, g.waterTop + 18, g.right, g.waterTop);
  ctx.closePath();
}

function drawAstro(ctx, x, y, radius, palette, rayRotation = 0) {
  ctx.save();
  ctx.globalAlpha = palette.alpha;
  ctx.fillStyle = palette.core;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  if (palette.glow) {
    ctx.fillStyle = palette.glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.32, 0, Math.PI * 2);
    ctx.fill();
  }

  if (palette.rays) {
    ctx.strokeStyle = palette.rays;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const angle = rayRotation + (Math.PI * 2 * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (radius + 4), y + Math.sin(angle) * (radius + 4));
      ctx.lineTo(x + Math.cos(angle) * (radius + 24), y + Math.sin(angle) * (radius + 24));
      ctx.stroke();
    }
  }

  if (palette.craters) {
    ctx.fillStyle = palette.craters;
    [
      [-radius * 0.28, -radius * 0.14, radius * 0.18],
      [radius * 0.12, radius * 0.08, radius * 0.14],
      [radius * 0.3, -radius * 0.22, radius * 0.1],
    ].forEach(([dx, dy, craterRadius]) => {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, craterRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function drawTerrainCut(ctx, canvas) {
  const g = lakeGeometry(canvas);
  const soilGradient = ctx.createLinearGradient(0, g.waterTop, 0, canvas.height);
  soilGradient.addColorStop(0, "#b99673");
  soilGradient.addColorStop(0.48, "#937255");
  soilGradient.addColorStop(1, "#69513d");

  ctx.save();
  ctx.fillStyle = soilGradient;

  ctx.beginPath();
  ctx.moveTo(0, g.waterTop);
  ctx.lineTo(g.left - 18, g.waterTop);
  ctx.quadraticCurveTo(g.left + 300, g.waterTop + 42, g.bottomLeft - 0, g.waterBottom - 20);
  ctx.lineTo(g.bottomLeft - 42, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(canvas.width, g.waterTop);
  ctx.lineTo(g.right + 18, g.waterTop);
  ctx.quadraticCurveTo(g.right - 300, g.waterTop + 54, g.bottomRight + 0, g.waterBottom - 22);
  ctx.lineTo(g.bottomRight + 42, canvas.height);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(82, 56, 39, 0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(g.left - 18, g.waterTop + 2);
  ctx.quadraticCurveTo(g.left - 20, g.waterTop + 42, g.bottomLeft - 34, g.waterBottom - 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(g.right + 18, g.waterTop + 2);
  ctx.quadraticCurveTo(g.right + 20, g.waterTop + 54, g.bottomRight + 30, g.waterBottom - 22);
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx, canvas, metrics, params, elapsedDays) {
  const g = lakeGeometry(canvas);
  const { skyBottom, waterTop } = g;
  const gradient = ctx.createLinearGradient(0, 0, 0, skyBottom);
  gradient.addColorStop(0, "#f9fbfc");
  gradient.addColorStop(0.55, "#dff2f6");
  gradient.addColorStop(1, "#c8e7ef");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const orbitCenterX = canvas.width * 0.51;
  const orbitCenterY = waterTop + 8;
  const orbitRadiusX = canvas.width * 0.32;
  const orbitRadiusY = canvas.height * 0.27;
  const orbitAngle = elapsedDays * 0.18;
  const dayBlend = (Math.sin(orbitAngle) + 1) / 2;

  if (dayBlend < 0.46) {
    ctx.fillStyle = `rgba(30, 52, 78, ${mapRange(dayBlend, 0, 0.46, 0.2, 0.02)})`;
    ctx.fillRect(0, 0, canvas.width, skyBottom + 12);
  }

  const sunX = orbitCenterX + Math.cos(orbitAngle) * orbitRadiusX;
  const sunY = orbitCenterY - Math.sin(orbitAngle) * orbitRadiusY;
  const moonAngle = orbitAngle + Math.PI;
  const moonX = orbitCenterX + Math.cos(moonAngle) * orbitRadiusX;
  const moonY = orbitCenterY - Math.sin(moonAngle) * orbitRadiusY;
  const atmosphereAlpha = clamp(1 - params.climate.cloudCover * 0.55, 0.4, 1);

  if (sunY <= waterTop - 6) {
    drawAstro(ctx, sunX, sunY, 28, {
      alpha: atmosphereAlpha,
      core: "#ffd17b",
      glow: "rgba(255, 209, 123, 0.16)",
      rays: "rgba(255, 209, 123, 0.34)",
    }, orbitAngle * 0.35);
  }

  if (moonY <= waterTop - 6) {
    drawAstro(ctx, moonX, moonY, 20, {
      alpha: clamp(0.76 - params.climate.cloudCover * 0.24, 0.42, 0.82),
      core: "#f1f6fb",
      glow: "rgba(197, 221, 243, 0.12)",
      craters: "rgba(175, 193, 210, 0.42)",
    });
  }

  drawTerrainCut(ctx, canvas);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const cloudCount = Math.round(2 + params.climate.cloudCover * 6);
  for (let i = 0; i < cloudCount; i += 1) {
    const x = 130 + i * 120 + Math.sin(elapsedDays * 0.04 + i) * 16;
    const y = 58 + (i % 2) * 24;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 22, y - 8, 24, 0, Math.PI * 2);
    ctx.arc(x + 46, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  if (params.climate.windSpeed > 2) {
    ctx.strokeStyle = "rgba(21, 48, 71, 0.38)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const y = 94 + i * 12;
      const x = canvas.width - 318 + i * 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 28, y - 8, x + 62, y + 8, x + 94, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 84, y - 5);
      ctx.lineTo(x + 94, y);
      ctx.lineTo(x + 82, y + 6);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "rgba(21, 48, 71, 0.68)";
  ctx.font = "600 14px Manrope";
  const weatherX = canvas.width - 178;
  ctx.fillText(`Air ${formatNumber(params.climate.airTemp)} C`, weatherX, 34);
  ctx.fillText(`Wind ${formatNumber(params.climate.windSpeed)} m/s`, weatherX, 56);
  ctx.fillText(`Cloud ${formatNumber(params.climate.cloudCover * 100, 0)}%`, weatherX, 78);
}

function clipLake(ctx, canvas) {
  lakePath(ctx, canvas);
  ctx.clip();
}

function colorForLayer(layer, mode, metrics) {
  let t = 0.5;
  if (mode === "temperature") {
    t = mapRange(layer.temperature, 4, 32, 0, 1);
  } else if (mode === "oxygen") {
    t = mapRange(layer.oxygen, 0, 11, 0, 1);
  } else if (mode === "nutrients") {
    t = mapRange(layer.nutrients, 0.05, 3.2, 0, 1);
  } else {
    const reference = metrics.thermoclineDepth
      ? Math.abs(layer.depth - metrics.thermoclineDepth) < layer.thickness * 1.3
        ? 1
        : metrics.stabilityIndex
      : 0.15;
    t = clamp(reference / 1.1, 0, 1);
  }
  return interpolateColor(COLOR_RAMPS[mode], t);
}

function drawWaterColumn(ctx, canvas, state, colorMode) {
  const g = lakeGeometry(canvas);
  const { layers, metrics, params } = state;
  const waterHeight = g.waterBottom - g.waterTop;
  const layerHeight = waterHeight / layers.length;

  ctx.save();
  ctx.fillStyle = "rgba(118, 145, 162, 0.1)";
  lakePath(ctx, canvas);
  ctx.fill();
  ctx.restore();

  ctx.save();
  clipLake(ctx, canvas);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, g.waterTop, canvas.width, waterHeight);

  layers.forEach((layer, index) => {
    const y = g.waterTop + index * layerHeight;
    const fill = colorForLayer(layer, colorMode, metrics);
    ctx.fillStyle = fill;
    ctx.fillRect(g.left, y, g.right - g.left, layerHeight + 1);

    if (params.display.showParticles) {
      ctx.fillStyle = colorMode === "nutrients" ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.18)";
      const particleCount = Math.max(2, Math.round(layer.turbidity / 2.8));
      for (let i = 0; i < particleCount; i += 1) {
        const px = g.left + ((index * 91 + i * 59) % Math.round(g.right - g.left));
        const drift = Math.sin(state.time.elapsedDays * 0.6 + index * 0.3 + i) * 8;
        const py = y + ((i * 13 + index * 17) % Math.max(10, Math.round(layerHeight - 4)));
        ctx.beginPath();
        ctx.arc(px + drift, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  const lightGradient = ctx.createLinearGradient(0, g.waterTop, 0, g.waterBottom);
  lightGradient.addColorStop(0, `rgba(255, 243, 204, ${clamp(0.28 - params.climate.cloudCover * 0.08, 0.1, 0.3)})`);
  lightGradient.addColorStop(clamp(params.water.transparency / params.water.maxDepth, 0.14, 0.42), "rgba(255, 247, 221, 0.08)");
  lightGradient.addColorStop(1, "rgba(17, 37, 53, 0.24)");
  ctx.fillStyle = lightGradient;
  ctx.fillRect(g.left, g.waterTop, g.right - g.left, waterHeight);

  if (metrics.bottomOxygen < 2.5) {
    const oxygenShade = ctx.createLinearGradient(0, g.waterBottom - waterHeight * 0.35, 0, g.waterBottom);
    oxygenShade.addColorStop(0, "rgba(177, 53, 53, 0)");
    oxygenShade.addColorStop(1, "rgba(133, 36, 46, 0.28)");
    ctx.fillStyle = oxygenShade;
    ctx.fillRect(g.left, g.waterBottom - waterHeight * 0.35, g.right - g.left, waterHeight * 0.35);
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(g.left - 2, g.waterTop);
  ctx.lineTo(g.right + 2, g.waterTop);
  ctx.stroke();

  const sedimentGradient = ctx.createLinearGradient(0, g.waterBottom - 10, 0, canvas.height);
  sedimentGradient.addColorStop(0, "#8e7356");
  sedimentGradient.addColorStop(1, "#66513f");
  ctx.fillStyle = sedimentGradient;
  ctx.beginPath();
  ctx.moveTo(g.bottomLeft - 16, g.waterBottom - 10);
  ctx.quadraticCurveTo(canvas.width * 0.45, g.waterBottom + 30, g.bottomRight + 20, g.waterBottom - 16);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();
}

function drawThermocline(ctx, canvas, state) {
  const { thermoclineDepth } = state.metrics;
  if (!thermoclineDepth) {
    return;
  }
  const g = lakeGeometry(canvas);
  const y = mapRange(thermoclineDepth, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom);
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(g.left + 24, y);
  ctx.lineTo(g.right - 18, y);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(17, 49, 66, 0.78)";
  ctx.font = "700 13px Manrope";
  ctx.fillText(`Thermocline ~ ${formatNumber(thermoclineDepth)} m`, g.right - 186, y - 10);
}

function drawLayerLabels(ctx, canvas, state) {
  if (!state.params.display.showLabels) {
    return;
  }
  const g = lakeGeometry(canvas);
  const thermoDepth = state.metrics.thermoclineDepth ?? state.metrics.mixedDepth + 1.5;
  const epiBottom = clamp(thermoDepth - 2, 2, state.params.water.maxDepth * 0.55);
  const metaBottom = clamp(thermoDepth + 2.5, epiBottom + 1, state.params.water.maxDepth * 0.82);
  const labelStyle = (y, title, subtitle) => {
    ctx.fillStyle = "rgba(15, 40, 58, 0.82)";
    ctx.font = "700 16px Manrope";
    ctx.fillText(title, g.left + 26, y);
    ctx.fillStyle = "rgba(15, 40, 58, 0.6)";
    ctx.font = "500 12px Manrope";
    ctx.fillText(subtitle, g.left + 26, y + 16);
  };

  labelStyle(mapRange(epiBottom * 0.35, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom), "Epilimnion", "Warm, mixed, illuminated");
  if (state.metrics.thermoclineDepth) {
    labelStyle(mapRange(thermoDepth, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom), "Metalimnion / Thermocline", "Strongest temperature gradient");
  }
  labelStyle(mapRange((metaBottom + state.params.water.maxDepth) * 0.5, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom), "Hypolimnion", "Cool, isolated deep water");
}

function drawBiota(ctx, canvas, state) {
  if (!state.params.display.showFishAndAlgae) {
    return;
  }
  const g = lakeGeometry(canvas);
  const { layers, metrics } = state;

  const refugeTop = metrics.fishRefugeTop ?? layers[1].depth;
  const refugeBottom = metrics.fishRefugeBottom ?? layers[Math.min(3, layers.length - 1)].depth;
  const fishTopY = mapRange(refugeTop, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom);
  const fishBottomY = mapRange(refugeBottom, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom);
  const compressed = metrics.habitatCompression || metrics.fishRefugeThickness === 0;

  if (metrics.fishRefugeThickness > 0) {
    ctx.save();
    ctx.fillStyle = compressed ? "rgba(198, 91, 91, 0.08)" : "rgba(67, 105, 135, 0.08)";
    ctx.fillRect(g.left + 12, fishTopY, g.right - g.left - 24, Math.max(14, fishBottomY - fishTopY));
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(49, 76, 95, 0.86)";
  ctx.fillStyle = compressed ? "rgba(198, 91, 91, 0.88)" : "rgba(67, 105, 135, 0.88)";
  for (let i = 0; i < 4; i += 1) {
    const x = canvas.width * 0.52 + i * 48 + Math.sin(state.time.elapsedDays * 0.8 + i) * 10;
    const bandT = compressed
      ? 0.45 + (i % 2) * 0.08
      : i / 3;
    const y = lerp(fishTopY, fishBottomY, bandT);
    ctx.beginPath();
    ctx.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x - 24, y - 7);
    ctx.lineTo(x - 24, y + 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const photicLayers = layers.filter((layer) => layer.depth <= state.params.water.transparency * 1.4);
  if (state.metrics.surfaceAlgae > 0.9) {
    const bloomBottom = mapRange(
      Math.min(state.params.water.maxDepth, state.params.water.transparency * 1.3),
      0,
      state.params.water.maxDepth,
      g.waterTop,
      g.waterBottom
    );
    ctx.fillStyle = `rgba(91, 173, 92, ${clamp(0.08 + state.metrics.surfaceAlgae * 0.08, 0.1, 0.24)})`;
    ctx.fillRect(g.left, g.waterTop, g.right - g.left, bloomBottom - g.waterTop);
  }

  photicLayers.slice(0, 6).forEach((layer, index) => {
    const y = mapRange(layer.depth, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom);
    const count = clamp(Math.round(layer.algae * 6 + layer.nutrients * 0.8), 1, 18);
    const radius = clamp(1.4 + layer.algae * 0.95, 1.4, 4.4);
    const alpha = clamp(0.18 + layer.algae * 0.16, 0.2, 0.72);
    ctx.fillStyle = `rgba(76, 157, 99, ${alpha})`;
    for (let i = 0; i < count; i += 1) {
      const x = g.left + 120 + ((index * 87 + i * 39) % 500);
      const wobble = Math.sin(state.time.elapsedDays * 0.9 + i + index) * 8;
      ctx.beginPath();
      ctx.arc(x + wobble, y + ((i * 11) % 24), radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawMixingArrows(ctx, canvas, state) {
  if (state.params.climate.windSpeed < 2.6) {
    return;
  }
  const g = lakeGeometry(canvas);
  const maxY = mapRange(state.metrics.mixedDepth, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const x = g.left + 110 + i * 150;
    const y = g.waterTop + 32 + (i % 2) * 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 16, y + 40, x, Math.min(maxY, y + 74));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 7, Math.min(maxY, y + 66));
    ctx.lineTo(x, Math.min(maxY, y + 74));
    ctx.lineTo(x + 7, Math.min(maxY, y + 66));
    ctx.stroke();
  }
  ctx.restore();
}

export function getLegend(mode) {
  if (mode === "temperature") {
    return [
      { label: "Cold", color: "#1a4f84" },
      { label: "Intermediate", color: "#9bd7d8" },
      { label: "Warm", color: "#ea8a4a" },
    ];
  }
  if (mode === "oxygen") {
    return [
      { label: "Low O2", color: "#862a45" },
      { label: "Moderate", color: "#f1b96b" },
      { label: "Well oxygenated", color: "#2f8e80" },
    ];
  }
  if (mode === "nutrients") {
    return [
      { label: "Low nutrients", color: "#dff5fb" },
      { label: "Accumulating", color: "#84c096" },
      { label: "High nutrients", color: "#cf7d3c" },
    ];
  }
  return [
    { label: "Weak density contrast", color: "#dff1f1" },
    { label: "Stratified zone", color: "#5599ab" },
    { label: "Strong barrier", color: "#193f4f" },
  ];
}

export function drawLakeScene(canvas, state, colorMode) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(ctx, canvas, state.metrics, state.params, state.time.elapsedDays);
  drawWaterColumn(ctx, canvas, state, colorMode);
  drawMixingArrows(ctx, canvas, state);
  drawThermocline(ctx, canvas, state);
  drawBiota(ctx, canvas, state);
  drawLayerLabels(ctx, canvas, state);

  const g = lakeGeometry(canvas);
  ctx.fillStyle = "rgba(15, 40, 58, 0.72)";
  ctx.font = "600 13px Manrope";
  for (let depth = 0; depth <= state.params.water.maxDepth; depth += 5) {
    const y = mapRange(depth, 0, state.params.water.maxDepth, g.waterTop, g.waterBottom);
    ctx.fillText(`${depth} m`, 16, y + 4);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(g.left, y);
    ctx.lineTo(g.right, y);
    ctx.stroke();
  }
}

export function hitTestLayer(canvas, state, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  const g = lakeGeometry(canvas);
  if (x < g.left || x > g.right || y < g.waterTop || y > g.waterBottom) {
    return null;
  }
  const relativeDepth = mapRange(y, g.waterTop, g.waterBottom, 0, state.params.water.maxDepth);
  const index = clamp(Math.floor((relativeDepth / state.params.water.maxDepth) * state.layers.length), 0, state.layers.length - 1);
  return {
    layer: state.layers[index],
    x,
    y,
  };
}

export function tooltipHtml(layer) {
  return [
    `<strong>Depth ${formatNumber(layer.depth)} m</strong>`,
    `Temperature: ${formatNumber(layer.temperature)} C`,
    `Dissolved oxygen: ${formatNumber(layer.oxygen)} mg/L`,
    `pH: ${formatNumber(layer.pH, 2)}`,
    `Conductivity: ${formatNumber(layer.conductivity, 0)} uS/cm`,
    `Nutrients: ${formatNumber(layer.nutrients, 2)} mg/L`,
    `Turbidity: ${formatNumber(layer.turbidity, 1)} NTU`,
  ].join("<br>");
}
