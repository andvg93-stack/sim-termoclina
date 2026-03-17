import { clamp, formatNumber, mapRange } from "./utils.js";

function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawAxes(ctx, width, height, xLabel, yLabel, yMax, xTicks) {
  const pad = { top: 18, right: 20, bottom: 30, left: 56 };
  ctx.strokeStyle = "rgba(21, 48, 71, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = "rgba(21, 48, 71, 0.72)";
  ctx.font = "600 12px Manrope";
  ctx.fillText(yLabel, 8, 16);
  ctx.fillText(xLabel, width - 92, height - 6);

  ctx.font = "500 11px Manrope";
  for (let depth = 0; depth <= yMax; depth += 5) {
    const y = mapRange(depth, 0, yMax, pad.top, height - pad.bottom);
    ctx.fillStyle = "rgba(21, 48, 71, 0.52)";
    ctx.fillText(`${depth}`, 18, y + 4);
    ctx.strokeStyle = "rgba(21, 48, 71, 0.08)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  xTicks.forEach((tick) => {
    const x = mapRange(tick.value, xTicks[0].value, xTicks[xTicks.length - 1].value, pad.left, width - pad.right);
    ctx.fillStyle = "rgba(21, 48, 71, 0.52)";
    ctx.fillText(tick.label, x - 8, height - 10);
  });

  return pad;
}

function drawLinePath(ctx, points, strokeStyle, fillStyle = null) {
  if (!points.length) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  if (fillStyle) {
    const last = points[points.length - 1];
    const first = points[0];
    ctx.lineTo(first.x, last.y);
    ctx.lineTo(first.x, first.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function drawProfileChart(canvas, state, property, options) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  const xTicks = options.ticks.map((value) => ({ value, label: String(value) }));
  const pad = drawAxes(ctx, width, height, options.xLabel, "Depth (m)", state.params.water.maxDepth, xTicks);
  const points = state.layers.map((layer) => ({
    x: mapRange(layer[property], options.min, options.max, pad.left, width - pad.right),
    y: mapRange(layer.depth, 0, state.params.water.maxDepth, pad.top, height - pad.bottom),
  }));

  if (options.thermocline && state.metrics.thermoclineDepth) {
    const y = mapRange(state.metrics.thermoclineDepth, 0, state.params.water.maxDepth, pad.top, height - pad.bottom);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(21, 48, 71, 0.35)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLinePath(ctx, points, options.lineColor, options.fillColor);

  ctx.fillStyle = "rgba(21, 48, 71, 0.8)";
  ctx.font = "600 12px Manrope";
  ctx.fillText(`${options.metricLabel}: ${formatNumber(state.layers[0][property], property === "pH" ? 2 : 1)}`, pad.left + 6, 16);
}

export function drawTimeSeriesChart(canvas, state) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  const pad = { top: 20, right: 20, bottom: 28, left: 44 };
  const history = state.history;
  const duration = Math.max(1, state.params.time.duration);

  ctx.strokeStyle = "rgba(21, 48, 71, 0.18)";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = "rgba(21, 48, 71, 0.72)";
  ctx.font = "600 12px Manrope";
  ctx.fillText("Simulation history", 10, 14);

  const tickStep = Math.max(10, Math.round(duration / 6 / 5) * 5 || 10);
  for (let d = 0; d <= duration; d += tickStep) {
    const x = mapRange(d, 0, duration, pad.left, width - pad.right);
    ctx.fillStyle = "rgba(21, 48, 71, 0.45)";
    ctx.font = "500 11px Manrope";
    ctx.fillText(`${Math.round(d)}`, x - 8, height - 8);
  }

  const oxygenPoints = history.map((entry) => ({
    x: mapRange(entry.day, 0, duration, pad.left, width - pad.right),
    y: mapRange(entry.bottomOxygen, 0, 12, height - pad.bottom, pad.top),
  }));
  const bloomPoints = history.map((entry) => ({
    x: mapRange(entry.day, 0, duration, pad.left, width - pad.right),
    y: mapRange(entry.bloomRisk, 0, 1.2, height - pad.bottom, pad.top),
  }));
  const thermoPoints = history.map((entry) => ({
    x: mapRange(entry.day, 0, duration, pad.left, width - pad.right),
    y: mapRange(entry.thermoclineDepth, 0, state.params.water.maxDepth, pad.top, height - pad.bottom),
  }));

  drawLinePath(ctx, bloomPoints, "rgba(221, 145, 82, 0.95)");
  drawLinePath(ctx, oxygenPoints, "rgba(47, 142, 128, 0.95)");
  ctx.setLineDash([5, 4]);
  drawLinePath(ctx, thermoPoints, "rgba(59, 95, 126, 0.8)");
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(21, 48, 71, 0.7)";
  ctx.font = "500 11px Manrope";
  ctx.fillText("Bottom O2", width - 170, 20);
  ctx.fillText("Bloom risk", width - 170, 36);
  ctx.fillText("Thermocline depth", width - 170, 52);
  ctx.fillStyle = "rgba(47, 142, 128, 0.95)";
  ctx.fillRect(width - 188, 14, 10, 4);
  ctx.fillStyle = "rgba(221, 145, 82, 0.95)";
  ctx.fillRect(width - 188, 30, 10, 4);
  ctx.fillStyle = "rgba(59, 95, 126, 0.95)";
  ctx.fillRect(width - 188, 46, 10, 4);
}

export function drawCompareChart(canvas, activeState, baselineState, property, options) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  const xTicks = options.ticks.map((value) => ({ value, label: String(value) }));
  const maxDepth = Math.max(activeState.params.water.maxDepth, baselineState.params.water.maxDepth);
  const pad = drawAxes(ctx, width, height, options.xLabel, "Depth (m)", maxDepth, xTicks);

  const toPoints = (state) => state.layers.map((layer) => ({
    x: mapRange(layer[property], options.min, options.max, pad.left, width - pad.right),
    y: mapRange(layer.depth, 0, maxDepth, pad.top, height - pad.bottom),
  }));

  const baselinePoints = toPoints(baselineState);
  const activePoints = toPoints(activeState);
  ctx.setLineDash([7, 4]);
  drawLinePath(ctx, baselinePoints, "rgba(21, 48, 71, 0.55)");
  ctx.setLineDash([]);
  drawLinePath(ctx, activePoints, options.lineColor);

  ctx.fillStyle = "rgba(21, 48, 71, 0.72)";
  ctx.font = "500 11px Manrope";
  ctx.fillText("Baseline", width - 112, 18);
  ctx.fillText("Modified", width - 112, 34);
  ctx.fillStyle = "rgba(21, 48, 71, 0.55)";
  ctx.fillRect(width - 132, 13, 12, 3);
  ctx.fillStyle = options.lineColor;
  ctx.fillRect(width - 132, 29, 12, 3);
}
