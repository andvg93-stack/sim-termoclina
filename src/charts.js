import { clamp, mapRange } from './utils.js';
import { setupCanvas } from './canvas.js';
import { number } from './i18n.js';

const font = '"Segoe UI",Arial,sans-serif';
function path(ctx, points, color, dash = []) {
  if (!points.length) return;
  ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.restore();
}
function tag(ctx, text, x, y, color, bounds) {
  ctx.font = `600 10px ${font}`;
  const w = ctx.measureText(text).width + 10;
  const left = clamp(x + 8, bounds.left + 4, bounds.right - w);
  const top = clamp(y - 9, bounds.top + 3, bounds.bottom - 19);
  ctx.fillStyle = '#f5fbff'; ctx.strokeStyle = color + '80'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.roundRect(left, top, w, 18, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, left + 5, top + 12);
}
function axes(ctx, width, height, maxDepth, options) {
  const p = { left: width < 250 ? 35 : 44, top: 31, right: width - 12, bottom: height - 17 };
  const x = value => mapRange(value, options.min, options.max, p.left, p.right);
  const y = depth => mapRange(depth, 0, maxDepth, p.top, p.bottom);
  ctx.font = `11px ${font}`; ctx.fillStyle = '#476480'; ctx.textAlign = 'center';
  options.ticks.forEach(value => {
    const px = x(value); ctx.strokeStyle = '#dce8ef'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(px, p.top); ctx.lineTo(px, p.bottom); ctx.stroke();
    ctx.fillStyle = '#476480'; ctx.fillText(number(value, Number.isInteger(value) ? 0 : 1), px, p.top - 11);
  });
  const step = maxDepth > 40 ? 10 : maxDepth <= 12 ? 2 : 5;
  const depths = [];
  for (let d = 0; d < maxDepth; d += step) depths.push(d);
  depths.push(maxDepth);
  depths.forEach(d => {
    const py = y(d); ctx.strokeStyle = '#dce8ef'; ctx.beginPath(); ctx.moveTo(p.left, py); ctx.lineTo(p.right, py); ctx.stroke();
    ctx.fillStyle = '#476480'; ctx.textAlign = 'right'; ctx.fillText(String(d), p.left - 9, py + 4);
  });
  ctx.strokeStyle = '#98b0c5'; ctx.beginPath(); ctx.moveTo(p.left, p.top); ctx.lineTo(p.left, p.bottom); ctx.stroke();
  if (width > 250) {
    ctx.save(); ctx.translate(11, (p.top + p.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = '#476480'; ctx.fillText('Profundidad (m)', 0, 0); ctx.restore();
  } else { ctx.textAlign = 'left'; ctx.fillText('m', 4, p.top - 11); }
  return { ...p, x, y };
}
function profileOptions(state, property, options, baseline) {
  // Expand, rather than clip, the domain if a scenario exceeds its default range.
  const values = [...state.layers, ...(baseline?.layers || [])].map(l => l[property]);
  const min = Math.min(options.min, ...values);
  const max = Math.max(options.max, ...values);
  if (min === options.min && max === options.max) return options;
  const low = Math.floor(min), high = Math.ceil(max);
  return { ...options, min: low, max: high, ticks: Array.from({ length: 5 }, (_, i) => low + (high - low) * i / 4) };
}
export function drawProfileChart(canvas, state, property, config, selectedDepth = null) {
  const { ctx, width, height } = setupCanvas(canvas);
  const options = profileOptions(state, property, config);
  const p = axes(ctx, width, height, state.params.water.maxDepth, options);
  const points = state.layers.map(l => ({ x: p.x(l[property]), y: p.y(l.depth) }));
  if (state.metrics.thermoclineDepth !== null && options.thermocline) {
    const y = p.y(state.metrics.thermoclineDepth);
    path(ctx, [{ x: p.left, y }, { x: p.right, y }], '#537996', [5, 4]);
    if (width > 270) tag(ctx, `${number(state.metrics.thermoclineDepth)} m`, p.right, y, '#42637b', p);
  }
  path(ctx, points, options.lineColor);
  for (const index of [0, points.length - 1]) {
    const point = points[index], layer = state.layers[index];
    ctx.fillStyle = options.lineColor; ctx.beginPath(); ctx.arc(point.x, point.y, 3.3, 0, Math.PI * 2); ctx.fill();
    if (width > 250) tag(ctx, `${number(layer[property], 1)} ${options.unit}`, point.x, point.y, options.lineColor, p);
  }
  if (selectedDepth !== null) {
    const y = p.y(selectedDepth); path(ctx, [{ x: p.left, y }, { x: p.right, y }], '#123650', [2, 3]);
  }
  const top = state.layers[0][property], bottom = state.layers.at(-1)[property];
  canvas.setAttribute('aria-label', `${options.metricLabel}: superficie ${number(top)} ${options.unit}; fondo ${number(bottom)} ${options.unit}. Profundidad máxima ${state.params.water.maxDepth} m.`);
}
export function drawCompareChart(canvas, active, baseline, property, config) {
  const { ctx, width, height } = setupCanvas(canvas);
  const options = profileOptions(active, property, config, baseline);
  const p = axes(ctx, width, height, Math.max(active.params.water.maxDepth, baseline.params.water.maxDepth), options);
  const points = s => s.layers.map(l => ({ x: p.x(l[property]), y: p.y(l.depth) }));
  path(ctx, points(baseline), '#61758a', [5, 4]); path(ctx, points(active), options.lineColor);
}
export function drawTimeSeriesChart(canvas, state) {
  const { ctx, width, height } = setupCanvas(canvas);
  const groups = [
    { key: 'bottomOxygen', name: 'Oxígeno profundo', unit: 'mg/L', max: Math.max(12, ...state.history.map(h => h.bottomOxygen)), color: '#087f8c' },
    { key: 'bloomRisk', name: 'Riesgo de floración', unit: '%', max: 100, color: '#d68d30', scale: 100 },
    { key: 'thermoclineDepth', name: 'Termoclina', unit: 'm', max: state.params.water.maxDepth, color: '#537996', invert: true },
  ];
  const duration = state.params.time.duration;
  groups.forEach((group, i) => {
    const rowTop = i * height / 3;
    const p = { left: width < 500 ? 40 : 50, right: width - 18, top: rowTop + 27, bottom: rowTop + height / 3 - 25 };
    ctx.font = `600 11px ${font}`; ctx.fillStyle = group.color; ctx.textAlign = 'left'; ctx.fillText(`${group.name} · ${group.unit}`, p.left, rowTop + 15);
    const x = day => mapRange(day, 0, duration, p.left, p.right);
    const y = value => mapRange(value, 0, group.max, group.invert ? p.top : p.bottom, group.invert ? p.bottom : p.top);
    ctx.font = `10px ${font}`;
    [0, group.max / 2, group.max].forEach(value => {
      const py = y(value); ctx.strokeStyle = '#dce8ef'; ctx.beginPath(); ctx.moveTo(p.left, py); ctx.lineTo(p.right, py); ctx.stroke();
      ctx.fillStyle = '#476480'; ctx.textAlign = 'right'; ctx.fillText(number(value, Number.isInteger(value) ? 0 : 1), p.left - 8, py + 3);
    });
    for (let n = 0; n <= 4; n++) {
      const day = duration * n / 4; ctx.textAlign = 'center'; ctx.fillStyle = '#476480'; ctx.fillText(number(day, 0), x(day), p.bottom + 15);
    }
    ctx.textAlign = 'right'; ctx.fillText('días', p.right, rowTop + 15);
    const entries = state.history;
    const points = entries.map(entry => ({ x: x(entry.day), y: y(entry[group.key] * (group.scale || 1)) }));
    if (group.key === 'thermoclineDepth') {
      // Null thermoclines are stored as zero by the original model. Show gaps,
      // not a misleading thermocline at the surface of a fully mixed column.
      let segment = [];
      entries.forEach((entry, index) => {
        if (entry.thermoclineDepth > 0) segment.push(points[index]);
        else { path(ctx, segment, group.color); segment = []; }
      });
      path(ctx, segment, group.color);
    } else path(ctx, points, group.color);
    if (points.length && (group.key !== 'thermoclineDepth' || entries.at(-1).thermoclineDepth > 0)) {
      const last = points.at(-1); ctx.fillStyle = group.color; ctx.beginPath(); ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  });
}
