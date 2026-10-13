import { clamp, interpolateColor, lerp, mapRange } from './utils.js';
import { setupCanvas } from './canvas.js';
import { number } from './i18n.js';

const frame = new Image();
frame.src = new URL('../assets/lake-frame.png', import.meta.url).href;
export const sceneReady = frame.decode().catch(() => {});

const RAMPS = {
  temperature: ['#063b63', '#06577b', '#0884a7', '#64b4b1', '#edc855', '#fa8350'],
  oxygen: ['#8d355d', '#d87564', '#ebc378', '#78bba0', '#087f8c'],
  nutrients: ['#e1f4fa', '#b0d9e7', '#9cabde', '#8c72c8', '#633aad'],
  stability: ['#dff1f1', '#9fced6', '#5599ab', '#2d6a7b', '#193f4f'],
};

function geometry(width, height) {
  return { width, height, top: height * .274, bottom: height * .908, left: width * .074, right: width * .926 };
}
function basinPath(ctx, g) {
  ctx.beginPath();
  ctx.moveTo(g.left, g.top);
  ctx.bezierCurveTo(g.width * .09, g.height * .55, g.width * .12, g.height * .8, g.width * .185, g.bottom);
  ctx.lineTo(g.width * .81, g.bottom);
  ctx.bezierCurveTo(g.width * .88, g.height * .8, g.width * .91, g.height * .55, g.right, g.top);
  ctx.closePath();
}
function layerColor(layer, mode, metrics) {
  let t;
  if (mode === 'temperature') t = mapRange(layer.temperature, 4, 32, 0, 1);
  else if (mode === 'oxygen') t = mapRange(layer.oxygen, 0, 11, 0, 1);
  else if (mode === 'nutrients') t = mapRange(layer.nutrients, .05, 3.2, 0, 1);
  else {
    const reference = metrics.thermoclineDepth
      ? Math.abs(layer.depth - metrics.thermoclineDepth) < layer.thickness * 1.3 ? 1 : metrics.stabilityIndex
      : .15;
    t = clamp(reference / 1.1, 0, 1);
  }
  return interpolateColor(RAMPS[mode], t);
}
function drawWater(ctx, g, state, mode) {
  const band = (g.bottom - g.top) / state.layers.length;
  // No lighting tint over the data: the legend and the water use the same ramp.
  state.layers.forEach((layer, index) => {
    ctx.fillStyle = layerColor(layer, mode, state.metrics);
    ctx.fillRect(0, g.top + index * band, g.width, band + 1);
    if (!state.params.display.showParticles) return;
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < Math.min(18, Math.max(2, Math.round(layer.turbidity / 2.8))); i++) {
      const x = g.width * (.18 + ((index * 91 + i * 59) % 640) / 1000);
      const y = g.top + index * band + band * ((i * 13 + index * 17) % 13) / 13;
      ctx.beginPath(); ctx.arc(x + Math.sin(state.time.elapsedDays * .6 + i) * 3, y, .8, 0, Math.PI * 2); ctx.fill();
    }
  });
}
function drawBiota(ctx, g, state) {
  if (!state.params.display.showFishAndAlgae) return;
  ctx.save(); basinPath(ctx, g); ctx.clip();
  const { metrics, layers, params } = state;
  if (metrics.fishRefugeThickness > 0) {
    for (let i = 0; i < 6; i++) {
      const depth = lerp(metrics.fishRefugeTop, metrics.fishRefugeBottom, (i % 3 + .5) / 3);
      const y = mapRange(depth, 0, params.water.maxDepth, g.top, g.bottom);
      const x = g.width * (.43 + i * .066) + Math.sin(state.time.elapsedDays * .8 + i) * 6;
      const size = g.width < 500 ? 3.5 : 5;
      ctx.fillStyle = metrics.habitatCompression ? '#ae524fbb' : '#305d6faa';
      ctx.beginPath(); ctx.ellipse(x, y, size * 1.5, size * .5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x - size * 2.4, y - size * .55); ctx.lineTo(x - size * 2.4, y + size * .55); ctx.closePath(); ctx.fill();
    }
  }
  layers.filter(layer => layer.depth <= params.water.transparency * 1.4).slice(0, 6).forEach((layer, j) => {
    const y = mapRange(layer.depth, 0, params.water.maxDepth, g.top, g.bottom);
    const count = clamp(Math.round(layer.algae * 6 + layer.nutrients * .8), 1, 22);
    ctx.fillStyle = `rgba(82,158,89,${clamp(.18 + layer.algae * .16, .2, .7)})`;
    for (let i = 0; i < count; i++) {
      const x = g.width * (.18 + ((j * 87 + i * 39) % 640) / 1000);
      ctx.beginPath(); ctx.arc(x + Math.sin(state.time.elapsedDays + i) * 3, y + (i * 11 % 13), clamp(1 + layer.algae * .45, 1, 2.6), 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.restore();
}
function drawMixing(ctx, g, state) {
  if (state.params.climate.windSpeed < 2.6) return;
  const bottom = mapRange(state.metrics.mixedDepth, 0, state.params.water.maxDepth, g.top, g.bottom);
  if (bottom < g.top + 14) return;
  ctx.save(); basinPath(ctx, g); ctx.clip(); ctx.strokeStyle = '#ffffffad'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const x = g.width * (.4 + i * .13), y = g.top + 12;
    const end = Math.min(bottom, y + 35);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 15, y + 15, x, end); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, end - 5); ctx.lineTo(x, end); ctx.lineTo(x + 5, end - 3); ctx.stroke();
  }
  ctx.restore();
}
function label(ctx, text, x, y, font = 12, anchor = 'left', fill = '#0d334bd9') {
  ctx.font = `600 ${font}px "Segoe UI",Arial,sans-serif`;
  const width = ctx.measureText(text).width + 16;
  const left = anchor === 'right' ? x - width : x;
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(left, y - font - 7, width, font + 13, 5); ctx.fill();
  ctx.strokeStyle = '#c4e6f066'; ctx.lineWidth = .75; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(text, left + 8, y - 3);
}
function drawAnnotations(ctx, g, state) {
  const { params, metrics } = state;
  const toY = depth => mapRange(depth, 0, params.water.maxDepth, g.top, g.bottom);
  const mobile = g.width < 500;
  const font = mobile ? 11 : 12;
  const rulerX = mobile ? 25 : g.width * .069;
  ctx.save(); ctx.strokeStyle = '#ffffffe8'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(rulerX, g.top); ctx.lineTo(rulerX, g.bottom); ctx.stroke();
  const step = params.water.maxDepth > 40 ? 10 : params.water.maxDepth <= 12 ? 2 : 5;
  const depths = [];
  for (let depth = 0; depth < params.water.maxDepth; depth += step) depths.push(depth);
  depths.push(params.water.maxDepth);
  ctx.font = `${font}px "Segoe UI",Arial,sans-serif`; ctx.textAlign = 'right';
  depths.forEach(depth => {
    const y = toY(depth); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(rulerX - 4, y); ctx.lineTo(rulerX + 4, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#102532'; ctx.shadowBlur = 3; ctx.fillText(String(depth), rulerX - 7, y + 4); ctx.shadowBlur = 0;
  });
  if (!mobile) {
    ctx.save(); ctx.translate(rulerX - 37, (g.top + g.bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('Profundidad (m)', 0, 0); ctx.restore();
  } else { ctx.fillStyle = '#fff'; ctx.fillText('m', rulerX - 7, g.top - 10); }
  if (metrics.thermoclineDepth) {
    const y = toY(metrics.thermoclineDepth);
    ctx.save(); basinPath(ctx, g); ctx.clip(); ctx.setLineDash([6, 5]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(g.width, y); ctx.stroke(); ctx.restore();
    label(ctx, `Termoclina · ${number(metrics.thermoclineDepth)} m`, g.width * .93, y - 9, font, 'right', '#07536ee8');
  }
  if (params.display.showLabels) {
    const x = mobile ? g.width * .19 : g.width * .25;
    if (!metrics.thermoclineDepth) label(ctx, 'Columna mezclada', x, toY(params.water.maxDepth * .5), font);
    else {
      const t = metrics.thermoclineDepth;
      const epi = Math.max(1, t - 2);
      label(ctx, 'Epilimnio', x, toY(epi * .45) + 6, font);
      // On small/deeply compressed layers, move the title to avoid the surface tag.
      label(ctx, 'Metalimnio', x, Math.min(g.bottom - 40, toY(t) + 30), font);
      const hypoY = toY((Math.min(t + 2.5, params.water.maxDepth) + params.water.maxDepth) / 2);
      if (hypoY > toY(t) + 58) label(ctx, 'Hipolimnio', x, hypoY, font);
    }
  }
  ctx.restore();
}
function drawSky(ctx, g, state) {
  const angle = state.time.elapsedDays * .18;
  const day = (Math.sin(angle) + 1) / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, g.width, g.top - 2); ctx.clip();
  if (day < .46) { ctx.fillStyle = `rgba(12,30,60,${mapRange(day, 0, .46, .66, .05)})`; ctx.fillRect(0, 0, g.width, g.top); }
  const moon = Math.sin(angle) < 0;
  const orbit = moon ? angle + Math.PI : angle;
  const x = g.width * (.5 + Math.cos(orbit) * .27);
  const y = g.top - Math.sin(orbit) * g.height * .2;
  if (y < g.top - 8) {
    ctx.globalAlpha = clamp(1 - state.params.climate.cloudCover * .7, .2, 1);
    ctx.fillStyle = moon ? '#e7effc' : '#ffde8a'; ctx.shadowColor = moon ? '#d3e9ff' : '#ffeab5'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, g.width < 500 ? 7 : 11, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  if (state.params.climate.cloudCover > .3) { ctx.fillStyle = `rgba(231,238,245,${state.params.climate.cloudCover * .45})`; ctx.fillRect(0, 0, g.width, g.top); }
  if (state.params.climate.rainInput > 1) {
    ctx.globalAlpha = .5; ctx.strokeStyle = '#ebf7ff'; ctx.lineWidth = 1;
    const count = Math.round(state.params.climate.rainInput * 3);
    for (let i = 0; i < count; i++) {
      const x = (i * 71) % g.width, y = ((i * 37 + state.time.elapsedDays * 90) % g.top);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 7); ctx.stroke();
    }
  }
  ctx.restore();
}
export function getLegend(mode) {
  const definitions = {
    temperature: { title: 'Temperatura', min: 4, max: 32, unit: '°C', ticks: [4, 18, 32] },
    oxygen: { title: 'Oxígeno', min: 0, max: 11, unit: 'mg/L', ticks: [0, 5.5, 11] },
    nutrients: { title: 'Nutrientes', min: .05, max: 3.2, unit: 'mg/L', ticks: [.05, 1.6, 3.2] },
    stability: { title: 'Contraste relativo', min: 0, max: 1.1, unit: '', ticks: [0, .55, 1.1] },
  };
  return { ...definitions[mode], colors: RAMPS[mode] };
}
export function drawLakeScene(canvas, state, colorMode, selectedDepth = null) {
  const { ctx, width, height } = setupCanvas(canvas);
  const g = geometry(width, height);
  ctx.fillStyle = '#95bfd6'; ctx.fillRect(0, 0, width, height);
  drawWater(ctx, g, state, colorMode);
  drawMixing(ctx, g, state);
  drawBiota(ctx, g, state);
  if (frame.complete && frame.naturalWidth) {
    // Crop a little sky to match the approved panoramic composition.
    ctx.drawImage(frame, 0, -height * .12, width, height * 1.125);
  } else {
    ctx.fillStyle = '#65715f'; ctx.fillRect(0, g.bottom, width, height - g.bottom);
  }
  drawSky(ctx, g, state);
  drawAnnotations(ctx, g, state);
  if (selectedDepth !== null) {
    const y = mapRange(selectedDepth, 0, state.params.water.maxDepth, g.top, g.bottom);
    ctx.save(); basinPath(ctx, g); ctx.clip(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); ctx.restore();
  }
}
export function hitTestLayer(canvas, state, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const g = geometry(rect.width, rect.height);
  const x = clientX - rect.left, y = clientY - rect.top;
  if (y < g.top || y > g.bottom) return null;
  const t = (y - g.top) / (g.bottom - g.top);
  const inset = g.width * (.074 + .112 * t * t);
  if (x < inset || x > g.width - inset) return null;
  const depth = t * state.params.water.maxDepth;
  const index = clamp(Math.floor(t * state.layers.length), 0, state.layers.length - 1);
  return { layer: state.layers[index], depth, x, y };
}
export function tooltipHtml(layer) {
  return `<strong>Profundidad ${number(layer.depth)} m</strong><br>Temperatura: ${number(layer.temperature)} °C<br>Oxígeno: ${number(layer.oxygen, 2)} mg/L<br>Nutrientes: ${number(layer.nutrients, 2)} mg/L`;
}
