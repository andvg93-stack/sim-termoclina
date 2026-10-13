import { drawCompareChart, drawProfileChart, drawTimeSeriesChart } from "./charts.js";
import {
  createSimulationState,
  mutateParameterTree,
  stepSimulation,
  structuralParameter,
  summarizeState,
} from "./model.js";
import { getLegend, drawLakeScene, hitTestLayer, tooltipHtml, sceneReady } from "./renderScene.js";
import { SCENARIOS, buildScenarioParams, getScenarioKeys } from "./scenarios.js";
import { clamp, deepClone } from "./utils.js";

import { t, number as formatNumber, guides } from "./i18n.js";
import { icon } from "./icons.js";

const CONTROL_SECTIONS = [
  {
    id: "climate",
    title: "Climate",
    open: true,
    controls: [
      { section: "climate", key: "solarRadiation", label: "Solar radiation", type: "range", min: 200, max: 1000, step: 10, unit: "W/m²" },
      { section: "climate", key: "airTemp", label: "Air temperature", type: "range", min: 0, max: 36, step: 0.5, unit: "°C" },
      { section: "climate", key: "windSpeed", label: "Wind speed", type: "range", min: 0, max: 14, step: 0.1, unit: "m/s" },
      {
        section: "climate",
        key: "cloudCover",
        label: "Cloud cover",
        type: "range",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        toUI: (value) => value * 100,
        fromUI: (value) => Number(value) / 100,
      },
      { section: "climate", key: "rainInput", label: "Rain input", type: "range", min: 0, max: 25, step: 0.5, unit: "mm/day" },
    ],
  },
  {
    id: "water",
    title: "Water body properties",
    open: true,
    controls: [
      { section: "water", key: "maxDepth", label: "Maximum depth", type: "range", min: 8, max: 60, step: 1, unit: "m" },
      { section: "water", key: "surfaceAreaFactor", label: "Surface area factor", type: "range", min: 0.6, max: 2.5, step: 0.05, unit: "x" },
      { section: "water", key: "transparency", label: "Transparency", type: "range", min: 0.8, max: 12, step: 0.1, unit: "m" },
      {
        section: "water",
        key: "initialStratification",
        label: "Initial stratification strength",
        type: "range",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        toUI: (value) => value * 100,
        fromUI: (value) => Number(value) / 100,
      },
      { section: "water", key: "residenceTime", label: "Water residence time", type: "range", min: 15, max: 365, step: 5, unit: "days" },
    ],
  },
  {
    id: "quality",
    title: "Water quality",
    controls: [
      { section: "quality", key: "initialDO", label: "Initial dissolved oxygen", type: "range", min: 4, max: 12, step: 0.1, unit: "mg/L" },
      { section: "quality", key: "initialNutrientLoad", label: "Initial nutrient load", type: "range", min: 0.1, max: 2.5, step: 0.05, unit: "mg/L" },
      { section: "quality", key: "organicMatterLoad", label: "Organic matter load", type: "range", min: 0.1, max: 2.2, step: 0.05, unit: "rel." },
      { section: "quality", key: "turbidity", label: "Turbidity", type: "range", min: 0.2, max: 18, step: 0.1, unit: "NTU" },
      { section: "quality", key: "conductivityBaseline", label: "Conductivity baseline", type: "range", min: 50, max: 900, step: 5, unit: "µS/cm" },
      { section: "quality", key: "pHBaseline", label: "pH baseline", type: "range", min: 6, max: 9, step: 0.05, unit: "" },
    ],
  },
  {
    id: "time",
    title: "Time and scenario",
    controls: [
      {
        section: "time",
        key: "season",
        label: "Season",
        type: "select",
        options: [
          ["spring", "Spring"],
          ["summer", "Summer"],
          ["autumn", "Autumn"],
          ["winter", "Winter"],
        ],
      },
      { section: "time", key: "duration", label: "Duration", type: "range", min: 30, max: 365, step: 5, unit: "days" },
      {
        section: "time",
        key: "timeStepMode",
        label: "Time step mode",
        type: "select",
        options: [
          ["daily", "Daily"],
          ["weekly", "Weekly"],
        ],
      },
    ],
  },
  {
    id: "display",
    title: "Display options",
    controls: [
      { section: "display", key: "showParticles", label: "Show particles", type: "toggle" },
      { section: "display", key: "showFishAndAlgae", label: "Show fish and algae icons", type: "toggle" },
      { section: "display", key: "showLabels", label: "Show labels", type: "toggle" },
      { section: "display", key: "compareWithBaseline", label: "Compare with baseline", type: "toggle" },
      {
        section: "display",
        key: "colorView",
        label: "Primary color view",
        type: "select",
        options: [
          ["temperature", "Temperature colors"],
          ["oxygen", "Oxygen colors"],
          ["nutrients", "Nutrient colors"],
          ["stability", "Stability colors"],
        ],
        uiOnly: true,
      },
      {
        section: "display",
        key: "exportState",
        label: "Export current state",
        type: "button",
      },
    ],
  },
];

const PROFILE_CONFIG = {
  temperature: {
    property: "temperature",
    min: 0,
    max: 32,
    ticks: [0, 8, 16, 24, 32],
    xLabel: "Temperatura (°C)", unit: "°C",
    lineColor: "#e8834d",
    fillColor: "rgba(232, 131, 77, 0.12)",
    metricLabel: "Temperatura",
    thermocline: true,
  },
  oxygen: {
    property: "oxygen",
    min: 0,
    max: 12,
    ticks: [0, 3, 6, 9, 12],
    xLabel: "Oxígeno (mg/L)", unit: "mg/L",
    lineColor: "#087f8c",
    fillColor: "rgba(47, 142, 128, 0.12)",
    metricLabel: "Oxígeno disuelto",
    thermocline: true,
  },
  nutrients: {
    property: "nutrients",
    min: 0,
    max: 3.5,
    ticks: [0, 1, 2, 3.5],
    xLabel: "Nutrientes (mg/L)", unit: "mg/L",
    lineColor: "#7448c4",
    fillColor: "rgba(207, 125, 60, 0.12)",
    metricLabel: "Nutrientes",
    thermocline: false,
  },
};

const app = {
  scenarioKey: "summer_stable",
  mode: "free",
  colorMode: "temperature",
  playing: true,
  speed: 1,
  activeState: createSimulationState("summer_stable"),
  baselineState: createSimulationState("summer_stable"),
  hoveredLayer: null,
  selectedDepth: null,
  view: "profiles",
};

const refs = {
  dayReadout: document.querySelector("#day-readout"),
  timeProgress: document.querySelector("#time-progress"),
  primaryAlert: document.querySelector("#primary-alert"),
  inspector: document.querySelector("#layer-inspector"),
  guideNote: document.querySelector("#guided-note"),
  weatherTemp: document.querySelector("#weather-temp"),
  weatherWind: document.querySelector("#weather-wind"),
  scenarioSelect: document.querySelector("#scenario-select"),
  modeSelect: document.querySelector("#mode-select"),
  playBtn: document.querySelector("#play-btn"),
  resetBtn: document.querySelector("#reset-btn"),
  guideBtn: document.querySelector("#guide-btn"),
  speedSelect: document.querySelector("#speed-select"),
  lakeCanvas: document.querySelector("#lake-canvas"),
  tooltip: document.querySelector("#layer-tooltip"),
  legend: document.querySelector("#legend"),
  statusCards: document.querySelector("#status-cards"),
  controlsRoot: document.querySelector("#controls-root"),
  alertsList: document.querySelector("#alerts-list"),
  comparePanel: document.querySelector("#compare-panel"),
  compareStatus: document.querySelector("#compare-status"),
  explainWhat: document.querySelector("#explain-what"),
  explainWhy: document.querySelector("#explain-why"),
  explainImpact: document.querySelector("#explain-impact"),
  tempChart: document.querySelector("#temp-chart"),
  oxygenChart: document.querySelector("#oxygen-chart"),
  nutrientChart: document.querySelector("#nutrient-chart"),
  timeChart: document.querySelector("#time-chart"),
  compareTempChart: document.querySelector("#compare-temp-chart"),
  compareOxygenChart: document.querySelector("#compare-oxygen-chart"),
  guideModal: document.querySelector("#guide-modal"),
  closeGuideBtn: document.querySelector("#close-guide-btn"),
};

function getControlValue(definition) {
  if (definition.uiOnly && definition.key === "colorView") {
    return app.colorMode;
  }
  const current = app.activeState.params[definition.section][definition.key];
  return definition.toUI ? definition.toUI(current) : current;
}

function controlId(definition) {
  return `${definition.section}.${definition.key}`;
}

function renderControls() {
  const sectionIcons = { climate: 'cloud', water: 'lake', quality: 'quality', time: 'time', display: 'settings' };
  const advanced = new Set(['surfaceAreaFactor', 'initialStratification', 'residenceTime']);
  refs.controlsRoot.innerHTML = CONTROL_SECTIONS.map(section => {
    const basic = section.controls.filter(c => !advanced.has(c.key));
    const extra = section.controls.filter(c => advanced.has(c.key));
    return `<details ${section.open ? 'open' : ''} data-section="${section.id}">
      <summary>${icon(sectionIcons[section.id])}${t(section.title)}${icon('chevron')}</summary>
      <div class="accordion-grid">${basic.map(renderControl).join('')}
        ${extra.length ? `<details class="advanced-controls"><summary>Más opciones ${icon('chevron')}</summary><div class="accordion-grid">${extra.map(renderControl).join('')}</div></details>` : ''}
        <button type="button" class="section-reset" data-reset-section="${section.id}">${icon('reset')}Restablecer ${section.id === 'climate' ? 'clima' : section.id === 'water' ? 'lago' : 'sección'}</button>
      </div></details>`;
  }).join('');
}

function renderControl(definition) {
  const value = getControlValue(definition), id = controlId(definition);
  const names = { solarRadiation:'sun', airTemp:'temperature', windSpeed:'wind', cloudCover:'cloud', rainInput:'rain', maxDepth:'lake', transparency:'waves' };
  const unit = { days:'días', 'mm/day':'mm/d' }[definition.unit] || definition.unit || '';
  if (definition.type === 'range') return `<div class="control-row" data-control-row="${id}">
    ${icon(names[definition.key] || (definition.section === 'quality' ? 'quality' : definition.section === 'time' ? 'time' : 'settings'))}
    <label for="${id}">${t(definition.label)}</label>
    <input id="${id}" type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${value}" data-control="${id}" aria-valuetext="${formatControlValue(definition, value)}">
    <input type="number" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${value}" data-control-number="${id}" aria-label="${t(definition.label)} (${unit || 'valor'})" inputmode="decimal">
    <span class="control-unit">${unit}</span></div>`;
  if (definition.type === 'select') return `<label class="field"><span>${t(definition.label)}</span><select data-control-select="${id}">${definition.options.map(([v,label])=>`<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${t(label)}</option>`).join('')}</select></label>`;
  if (definition.type === 'toggle') return `<label class="toggle-row"><span>${t(definition.label)}</span><input type="checkbox" data-control-toggle="${id}" ${value ? 'checked' : ''}></label>`;
  return `<button type="button" data-control-button="${id}">${icon('export')}${t(definition.label)}</button>`;
}

function formatControlValue(definition, value) {
  if (definition.unit === "%") {
    return `${Math.round(value)}%`;
  }
  if (!definition.unit) {
    return formatNumber(value, definition.step >= 1 ? 0 : 2);
  }
  return `${formatNumber(value, definition.step >= 1 ? 0 : definition.step >= 0.1 ? 1 : 2)} ${definition.unit}`;
}

function syncControlValues() {
  CONTROL_SECTIONS.forEach(section => section.controls.forEach(definition => {
    const id = controlId(definition), value = getControlValue(definition);
    const range = refs.controlsRoot.querySelector(`[data-control="${id}"]`);
    const numeric = refs.controlsRoot.querySelector(`[data-control-number="${id}"]`);
    const select = refs.controlsRoot.querySelector(`[data-control-select="${id}"]`);
    const toggle = refs.controlsRoot.querySelector(`[data-control-toggle="${id}"]`);
    if (range) {
      range.value = value;
      range.style.setProperty('--fill', `${(value - definition.min) / (definition.max - definition.min) * 100}%`);
      range.setAttribute('aria-valuetext', formatControlValue(definition, value));
    }
    if (numeric && document.activeElement !== numeric) numeric.value = value;
    if (select) select.value = value;
    if (toggle) toggle.checked = Boolean(value);
  }));
  document.querySelectorAll('input[name="color-mode"]').forEach(input => { input.checked = input.value === app.colorMode; });
}

function currentScenarioDefaults() {
  return buildScenarioParams(app.scenarioKey);
}

function resetScenario() {
  hideTooltip(); app.hoveredLayer = null;
  app.activeState = createSimulationState(app.scenarioKey);
  app.baselineState = createSimulationState(app.scenarioKey);
  app.activeState.params.display.compareWithBaseline = app.mode === 'compare';
  app.selectedDepth = null;
  app.playing = true;
  syncControlValues(); renderAll();
}

function rebuildActiveState() {
  hideTooltip(); app.hoveredLayer = null;
  const params = deepClone(app.activeState.params);
  app.activeState = createSimulationState(app.scenarioKey, params);
  if (app.mode === "compare") {
    syncBaselineState(app.activeState.time.elapsedDays);
  }
}

function syncBaselineState(targetDays = app.activeState.time.elapsedDays) {
  app.baselineState = createSimulationState(app.scenarioKey);
  while (app.baselineState.time.elapsedDays < targetDays) {
    const remaining = targetDays - app.baselineState.time.elapsedDays;
    stepSimulation(app.baselineState, Math.min(remaining, 1), "compare");
  }
}

function applyScenarioSelection(scenarioKey) {
  hideTooltip(); app.hoveredLayer = null;
  app.scenarioKey = scenarioKey;
  app.activeState = createSimulationState(scenarioKey);
  app.baselineState = createSimulationState(scenarioKey);
  app.activeState.params.display.compareWithBaseline = app.mode === 'compare';
  app.selectedDepth = null;
  refs.scenarioSelect.value = scenarioKey;
  syncControlValues(); renderAll();
}

function parseControlValue(definition, rawValue) {
  if (definition.type === "toggle") {
    return Boolean(rawValue);
  }
  if (definition.fromUI) {
    return definition.fromUI(rawValue);
  }
  if (definition.type === "select") {
    return rawValue;
  }
  return Number(rawValue);
}

function applyControlChange(definition, nextValue) {
  if (definition.uiOnly && definition.key === "colorView") {
    app.colorMode = nextValue;
    document.querySelectorAll('input[name="color-mode"]').forEach((input) => {
      input.checked = input.value === nextValue;
    });
    renderAll();
    return;
  }

  if (definition.section === "display" && definition.key === "compareWithBaseline") {
    app.activeState.params.display.compareWithBaseline = nextValue;
    app.mode = nextValue ? "compare" : app.mode === "compare" ? "free" : app.mode;
    if (nextValue) app.view = 'compare';
    else if (app.view === 'compare') app.view = 'profiles';
    refs.modeSelect.value = app.mode;
    if (app.mode === "compare") {
      syncBaselineState();
    }
    syncControlValues();
    renderAll();
    return;
  }

  mutateParameterTree(app.activeState.params, definition.section, definition.key, nextValue);
  if (structuralParameter(definition.section, definition.key)) {
    rebuildActiveState();
  } else {
    renderAll();
  }
}

function resetSection(sectionId) {
  app.activeState.params[sectionId] = deepClone(currentScenarioDefaults()[sectionId]);
  if (sectionId === 'display') {
    app.colorMode = 'temperature';
    if (app.mode === 'compare') { app.mode = 'free'; refs.modeSelect.value = 'free'; app.view = 'profiles'; }
  }
  rebuildActiveState(); syncControlValues(); renderAll();
}

function handleControlEvent(event) {
  const target = event.target;
  const id = target.dataset.control || target.dataset.controlNumber || target.dataset.controlSelect || target.dataset.controlToggle;
  if (!id || (target.type === 'number' && event.type === 'input')) return;
  const [sectionId, key] = id.split('.');
  const definition = CONTROL_SECTIONS.find(s => s.id === sectionId)?.controls.find(c => c.key === key);
  if (!definition) return;
  let raw = target.type === 'checkbox' ? target.checked : target.value;
  if (definition.type === 'range') {
    if (raw === '' || !Number.isFinite(Number(raw))) { target.value = getControlValue(definition); return; }
    raw = clamp(Number(raw), definition.min, definition.max);
    raw = Number((Math.round((raw - definition.min) / definition.step) * definition.step + definition.min).toFixed(6));
    raw = clamp(raw, definition.min, definition.max);
    target.value = raw;
  }
  const parsed = parseControlValue(definition, raw);
  if (parsed === parseControlValue(definition, getControlValue(definition))) { syncControlValues(); return; }
  applyControlChange(definition, parsed);
  if (app.mode === 'compare' && definition.key === 'compareWithBaseline') app.view = 'compare';
  syncControlValues(); renderAll();
}

function handleControlButton(event) {
  const target = event.target.closest("[data-control-button], [data-reset-section]");
  if (!target) {
    return;
  }
  if (target.dataset.resetSection) {
    event.preventDefault();
    resetSection(target.dataset.resetSection);
    return;
  }
  if (target.dataset.controlButton === "display.exportState") {
    exportState();
  }
}

function renderLegend() {
  const legend = getLegend(app.colorMode);
  refs.legend.innerHTML = `<span class="legend-label">${legend.title}</span><div class="legend-ramp" style="background:linear-gradient(to right,${legend.colors.join(',')})"></div><div class="legend-ticks">${legend.ticks.map((v,i)=>`<span style="left:${(v-legend.min)/(legend.max-legend.min)*100}%">${i === 0 ? '≤ ' : i === legend.ticks.length-1 ? '≥ ' : ''}${formatNumber(v, Number.isInteger(v) ? 0 : String(v).split('.')[1].length)} ${legend.unit}</span>`).join('')}</div>`;
}

function renderStatusCards() {
  const m = app.activeState.metrics;
  const cards = [
    {icon:'temperature', title:'Superficie', value:`${formatNumber(m.surfaceTemp)} °C`, note:'Temperatura del agua'},
    {icon:'waves', title:'Termoclina', value:m.thermoclineDepth ? `${formatNumber(m.thermoclineDepth)} m` : 'Sin definir', note:'Profundidad de la termoclina'},
    {icon:'oxygen', title:'Oxígeno profundo', value:`${formatNumber(m.bottomOxygen,2)} mg/L`, note:`A ${app.activeState.params.water.maxDepth} m de profundidad`},
    {icon:'waves', title:'Estratificación', value:t(m.stratificationState), note:m.stabilityIndex > .75 ? 'Alta estabilidad de la columna' : 'Mayor intercambio vertical'},
  ];
  refs.statusCards.innerHTML = cards.map(c=>`<div class="kpi-card">${icon(c.icon)}<div><h3>${c.title}</h3><div class="kpi-value">${c.value}</div></div><div class="kpi-note">${c.note}</div></div>`).join('');
  const { time, params } = app.activeState;
  refs.dayReadout.textContent = `Día ${Math.floor(time.elapsedDays)} / ${params.time.duration}`;
  refs.timeProgress.style.width = `${clamp(time.elapsedDays / params.time.duration * 100, 0, 100)}%`;
  refs.weatherTemp.textContent = `${formatNumber(params.climate.airTemp,1)} °C`;
  refs.weatherWind.textContent = `${formatNumber(params.climate.windSpeed)} m/s`;
  refs.playBtn.innerHTML = `${icon(app.playing ? 'pause' : 'play')}${app.playing ? 'Pausar' : 'Continuar'}`;
  refs.playBtn.setAttribute('aria-pressed', String(app.playing));
}

function renderAlerts() {
  const priorities = { info:0, warning:1, danger:2 };
  const alerts = [...app.activeState.alerts].sort((a,b)=>priorities[b.level]-priorities[a.level]);
  refs.alertsList.innerHTML = alerts.map(a=>`<article class="alert-card alert-${a.level}"><strong>${t(a.title)}</strong><p>${t(a.detail)}</p></article>`).join('') + `<article class="alert-card"><strong>Estado ecológico: ${t(app.activeState.metrics.ecosystemStatus)}</strong><p>Riesgo de floración: ${formatNumber(app.activeState.metrics.bloomRisk * 100,0)} %. Refugio de peces: ${formatNumber(app.activeState.metrics.fishRefugeThickness)} m.</p></article>`;
  const first = alerts[0];
  refs.primaryAlert.dataset.level = first?.level || 'info';
  refs.primaryAlert.innerHTML = first ? `${icon('info')}<strong>${t(first.title)}</strong><p>${t(first.detail)}</p>` : '';
}

function renderExplanation() {
  const m = app.activeState.metrics;
  const mixed = m.stratificationState === 'Mixed';
  refs.explainWhat.textContent = mixed ? 'El lago se aproxima a un perfil isotérmico y sus capas se mezclan.' : `La columna presenta un epilimnio cálido, una zona de transición cerca de ${formatNumber(m.thermoclineDepth ?? 0)} m y un hipolimnio más frío.`;
  refs.explainWhy.textContent = mixed ? 'El enfriamiento y el viento reducen las diferencias de densidad, permitiendo el intercambio entre la superficie y el fondo.' : 'La radiación solar calienta la superficie. La diferencia de densidad resiste la mezcla por viento y limita el transporte de oxígeno y nutrientes a través de la termoclina.';
  const priority = [...app.activeState.alerts].sort((a,b)=>({danger:2,warning:1,info:0}[b.level])-({danger:2,warning:1,info:0}[a.level]))[0];
  refs.explainImpact.textContent = t(priority?.detail || 'Conditions remain within a moderate range');
  refs.guideNote.hidden = app.mode !== 'guided';
  refs.guideNote.textContent = guides[app.scenarioKey];
}

function renderCompare() {
  if (app.view !== 'compare') return;
  drawCompareChart(refs.compareTempChart, app.activeState, app.baselineState, 'temperature', PROFILE_CONFIG.temperature);
  drawCompareChart(refs.compareOxygenChart, app.activeState, app.baselineState, 'oxygen', PROFILE_CONFIG.oxygen);
  const m = app.activeState.metrics, b = app.baselineState.metrics;
  refs.compareStatus.innerHTML = `<div class="compare-pill"><strong>Base:</strong> ${t(SCENARIOS[app.scenarioKey].label)} conserva sus condiciones originales.</div><div class="compare-pill"><strong>Tus ajustes:</strong> estratificación ${t(m.stratificationState).toLowerCase()}, oxígeno profundo ${formatNumber(m.bottomOxygen,2)} mg/L.</div><div class="compare-pill"><strong>Diferencia:</strong> ${formatNumber(m.surfaceTemp-b.surfaceTemp)} °C en superficie y ${formatNumber(m.bottomOxygen-b.bottomOxygen,2)} mg/L de oxígeno en el fondo.</div>`;
}

function renderCharts() {
  if (app.view === 'profiles') {
    drawProfileChart(refs.tempChart, app.activeState, 'temperature', PROFILE_CONFIG.temperature, app.selectedDepth);
    drawProfileChart(refs.oxygenChart, app.activeState, 'oxygen', PROFILE_CONFIG.oxygen, app.selectedDepth);
    drawProfileChart(refs.nutrientChart, app.activeState, 'nutrients', PROFILE_CONFIG.nutrients, app.selectedDepth);
  }
  if (app.view === 'evolution') drawTimeSeriesChart(refs.timeChart, app.activeState);
}

function renderAll() {
  syncView();
  drawLakeScene(refs.lakeCanvas, app.activeState, app.colorMode, app.selectedDepth);
  renderLegend(); renderStatusCards(); renderAlerts(); renderExplanation(); renderCharts(); renderCompare(); renderInspector();
  if (app.hoveredLayer && !refs.tooltip.hidden) refs.tooltip.innerHTML = tooltipHtml(app.hoveredLayer);
}

function daysPerSecondFor(state) {
  return state.params.time.timeStepMode === "weekly" ? 9 : 3.2;
}

function stepByRealSeconds(realSeconds) {
  const effective = realSeconds * app.speed;
  const activeDt = effective * daysPerSecondFor(app.activeState);
  stepSimulation(app.activeState, activeDt, app.mode);
  if (app.mode === "compare") {
    const baselineDt = effective * daysPerSecondFor(app.baselineState);
    stepSimulation(app.baselineState, baselineDt, app.mode);
  }
  if (app.activeState.time.elapsedDays >= app.activeState.params.time.duration) {
    app.playing = false;

  }
}

function showTooltip(payload, event) {
  refs.tooltip.hidden = false;
  refs.tooltip.innerHTML = tooltipHtml(payload.layer);
  const rect = refs.lakeCanvas.parentElement.getBoundingClientRect();
  const tip = refs.tooltip.getBoundingClientRect();
  refs.tooltip.style.left = `${clamp(event.clientX-rect.left+12, 4, rect.width-tip.width-4)}px`;
  refs.tooltip.style.top = `${clamp(event.clientY-rect.top+12, 4, rect.height-tip.height-4)}px`;
}

function hideTooltip() {
  refs.tooltip.hidden = true;
}

function handleModeChange(value) {
  app.mode = value; refs.modeSelect.value = value;
  app.activeState.params.display.compareWithBaseline = value === 'compare';
  if (value === 'compare') { syncBaselineState(); app.view = 'compare'; }
  else if (app.view === 'compare') app.view = 'profiles';
  syncControlValues(); renderAll();
}

function populateScenarioOptions() {
  refs.scenarioSelect.innerHTML = getScenarioKeys().map((key) => `
    <option value="${key}">${t(SCENARIOS[key].label)}</option>
  `).join("");
  refs.scenarioSelect.value = app.scenarioKey;
}

function attachEvents() {
  refs.scenarioSelect.addEventListener('change', e => applyScenarioSelection(e.target.value));
  refs.modeSelect.addEventListener('change', e => handleModeChange(e.target.value));
  refs.speedSelect.addEventListener('change', e => { app.speed = Number(e.target.value); });
  refs.playBtn.addEventListener('click', () => {
    if (!app.playing && app.activeState.time.elapsedDays >= app.activeState.params.time.duration) {
      resetScenario(); return;
    }
    app.playing = !app.playing; renderAll();
  });
  refs.resetBtn.addEventListener('click', resetScenario);
  refs.guideBtn.addEventListener('click', () => refs.guideModal.showModal());
  refs.closeGuideBtn.addEventListener('click', () => refs.guideModal.close());
  refs.guideModal.addEventListener('click', e => { if (e.target === refs.guideModal) refs.guideModal.close(); });
  refs.controlsRoot.addEventListener('input', handleControlEvent);
  refs.controlsRoot.addEventListener('change', handleControlEvent);
  refs.controlsRoot.addEventListener('click', handleControlButton);
  document.querySelector('#export-btn').addEventListener('click', () => exportState());
  document.querySelector('#fullscreen-btn').addEventListener('click', toggleFullscreen);
  document.querySelector('#parameters-btn').addEventListener('click', e => {
    const panel = document.querySelector('.controls-panel');
    panel.classList.toggle('mobile-collapsed');
    e.currentTarget.setAttribute('aria-expanded', String(!panel.classList.contains('mobile-collapsed')));
  });
  document.querySelector('#alerts-btn').addEventListener('click', e => {
    refs.alertsList.hidden = !refs.alertsList.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!refs.alertsList.hidden));
    e.currentTarget.textContent = refs.alertsList.hidden ? 'Ver alertas' : 'Ocultar alertas';
    if (!refs.alertsList.hidden && innerWidth <= 820) refs.alertsList.scrollIntoView({ block: 'center' });
  });
  document.querySelectorAll('input[name="color-mode"]').forEach(input => input.addEventListener('change', e => {
    app.colorMode = e.target.value; syncControlValues(); renderAll();
  }));
  refs.lakeCanvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const hit = hitTestLayer(refs.lakeCanvas, app.activeState, e.clientX, e.clientY);
    app.hoveredLayer = hit?.layer ?? null;
    if (hit) showTooltip(hit,e); else hideTooltip();
  });
  refs.lakeCanvas.addEventListener('pointerleave', () => { app.hoveredLayer = null; hideTooltip(); });
  refs.lakeCanvas.addEventListener('click', e => {
    const hit = hitTestLayer(refs.lakeCanvas,app.activeState,e.clientX,e.clientY);
    if (hit) { app.selectedDepth = hit.layer.depth; hideTooltip(); renderAll(); }
  });
  refs.inspector.addEventListener('click', e => { if (e.target.closest('button')) { app.selectedDepth = null; renderAll(); refs.lakeCanvas.focus(); } });
  refs.lakeCanvas.addEventListener('keydown', e => {
    if (!['ArrowUp','ArrowDown','Home','End','Escape'].includes(e.key)) return;
    e.preventDefault();
    const layers = app.activeState.layers;
    let index = app.selectedDepth === null ? 0 : layers.reduce((best,l,i)=>Math.abs(l.depth-app.selectedDepth)<Math.abs(layers[best].depth-app.selectedDepth)?i:best,0);
    if (e.key === 'Escape') app.selectedDepth = null;
    else {
      index = e.key === 'Home' ? 0 : e.key === 'End' ? layers.length-1 : clamp(index + (e.key === 'ArrowUp' ? -1 : 1),0,layers.length-1);
      app.selectedDepth = layers[index].depth;
    }
    renderAll();
  });
  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => selectView(tab.dataset.view));
    tab.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : (index + (e.key === 'ArrowRight' ? 1 : -1)+tabs.length)%tabs.length;
      tabs[next].focus(); selectView(tabs[next].dataset.view);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'f' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target.closest('input,select,textarea,[contenteditable]') && !refs.guideModal.open) toggleFullscreen();
  });
  let resizeFrame;
  const resize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderAll); };
  new ResizeObserver(resize).observe(refs.lakeCanvas.parentElement);
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
}

function installTestingHooks() {
  window.render_game_to_text = () => JSON.stringify({
    ui: {
      mode: app.mode,
      colorMode: app.colorMode,
      playing: app.playing,
      speed: app.speed,
    },
    active: summarizeState(app.activeState),
    compare: app.mode === "compare" ? summarizeState(app.baselineState) : null,
  });

  window.advanceTime = (ms) => {
    const realSeconds = clamp(ms / 1000, 0, 20);
    const chunkSeconds = 0.1;
    let remaining = realSeconds;
    while (remaining > 0) {
      const dt = Math.min(chunkSeconds, remaining);
      stepByRealSeconds(dt);
      remaining -= dt;
    }
    renderAll();
  };
}


function syncView() {
  document.querySelectorAll('[data-view]').forEach(tab => {
    const selected = tab.dataset.view === app.view;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  });
}
function selectView(view) {
  if (view === 'compare' && app.mode !== 'compare') { handleModeChange('compare'); return; }
  app.view = view; renderAll();
}
function renderInspector() {
  refs.inspector.hidden = app.selectedDepth === null;
  if (app.selectedDepth === null) return;
  app.selectedDepth = clamp(app.selectedDepth,0,app.activeState.params.water.maxDepth);
  const layer = app.activeState.layers.reduce((best,l)=>Math.abs(l.depth-app.selectedDepth)<Math.abs(best.depth-app.selectedDepth)?l:best);
  const html = `<strong>${formatNumber(layer.depth)} m</strong><span>${formatNumber(layer.temperature)} °C</span><span>O₂ ${formatNumber(layer.oxygen,2)} mg/L</span><span>Nutrientes ${formatNumber(layer.nutrients,2)} mg/L</span><span>pH ${formatNumber(layer.pH,2)}</span><span>${formatNumber(layer.conductivity,0)} µS/cm</span><span>${formatNumber(layer.turbidity)} NTU</span><button type="button" aria-label="Cerrar lectura de profundidad">Cerrar</button>`;
  // Preserve keyboard focus on the close button while the simulation advances.
  if (refs.inspector.innerHTML !== html && document.activeElement !== refs.inspector.querySelector('button')) refs.inspector.innerHTML = html;
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await refs.lakeCanvas.parentElement.requestFullscreen?.();
  } catch { /* A browser may disable fullscreen; the scene remains usable. */ }
}

function exportState() {
    const payload = JSON.stringify(
      {
        ui: {
          scenarioKey: app.scenarioKey,
          mode: app.mode,
          colorMode: app.colorMode,
        },
        active: summarizeState(app.activeState),
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stratification-state-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function bootstrap() {
  populateScenarioOptions();
  renderControls();
  syncControlValues();
  attachEvents();
  installTestingHooks();
  renderAll();

  sceneReady.then(renderAll);
  let lastRender = 0;
  let lastFrame = performance.now();
  const frame = (timestamp) => {
    const deltaSeconds = clamp((timestamp - lastFrame) / 1000, 0, 0.15);
    lastFrame = timestamp;
    if (app.playing) {
      stepByRealSeconds(deltaSeconds);
      if (timestamp - lastRender >= 100) { renderAll(); lastRender = timestamp; }
      else drawLakeScene(refs.lakeCanvas, app.activeState, app.colorMode, app.selectedDepth);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

bootstrap();
