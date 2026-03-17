export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) {
    return outMin;
  }
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, t);
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

export function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (component) => component.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function interpolateColor(stops, t) {
  const clampedT = clamp(t, 0, 1);
  const scaled = clampedT * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - index;
  const a = hexToRgb(stops[index]);
  const b = hexToRgb(stops[index + 1]);
  return rgbToHex({
    r: Math.round(lerp(a.r, b.r, localT)),
    g: Math.round(lerp(a.g, b.g, localT)),
    b: Math.round(lerp(a.b, b.b, localT)),
  });
}

export function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function weightedAverage(items, accessor, weights) {
  let numerator = 0;
  let denominator = 0;
  items.forEach((item, index) => {
    const weight = weights ? weights[index] : 1;
    numerator += accessor(item) * weight;
    denominator += weight;
  });
  return denominator ? numerator / denominator : 0;
}
