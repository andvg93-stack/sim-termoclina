import { drawCompareChart, drawProfileChart, drawTimeSeriesChart } from "./charts.js";
import {
  cloneSimulationState,
  createSimulationState,
  mutateParameterTree,
  stepSimulation,
  structuralParameter,
  summarizeState,
} from "./model.js";
import { getLegend, drawLakeScene, hitTestLayer, tooltipHtml } from "./renderScene.js";
import { SCENARIOS, buildScenarioParams, getScenarioKeys } from "./scenarios.js";
import { capitalize, clamp, deepClone, formatNumber } from "./utils.js";

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
    xLabel: "Temperature (°C)",
    lineColor: "#e8834d",
    fillColor: "rgba(232, 131, 77, 0.12)",
    metricLabel: "Surface temperature",
    thermocline: true,
  },
  oxygen: {
    property: "oxygen",
    min: 0,
    max: 12,
    ticks: [0, 3, 6, 9, 12],
    xLabel: "DO (mg/L)",
    lineColor: "#2f8e80",
    fillColor: "rgba(47, 142, 128, 0.12)",
    metricLabel: "Surface oxygen",
    thermocline: true,
  },
  nutrients: {
    property: "nutrients",
    min: 0,
    max: 3.5,
    ticks: [0, 1, 2, 3],
    xLabel: "Nutrients (mg/L)",
    lineColor: "#cf7d3c",
    fillColor: "rgba(207, 125, 60, 0.12)",
    metricLabel: "Surface nutrients",
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
};

const refs = {
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
  refs.controlsRoot.innerHTML = CONTROL_SECTIONS.map((section) => `
    <details ${section.open ? "open" : ""} data-section="${section.id}">
      <summary>${section.title}</summary>
      <div class="accordion-grid">
        <button type="button" class="section-reset" data-reset-section="${section.id}">Reset section</button>
        ${section.controls.map((control) => renderControl(control)).join("")}
      </div>
    </details>
  `).join("");
}

function renderControl(definition) {
  const value = getControlValue(definition);
  const id = controlId(definition);
  if (definition.type === "range") {
    return `
      <div class="control-row" data-control-row="${id}">
        <div>
          <div class="control-meta">
            <label for="${id}">${definition.label}</label>
            <small>${formatControlValue(definition, value)}</small>
          </div>
          <input
            id="${id}"
            type="range"
            min="${definition.min}"
            max="${definition.max}"
            step="${definition.step}"
            value="${value}"
            data-control="${id}"
          >
        </div>
        <input
          type="number"
          min="${definition.min}"
          max="${definition.max}"
          step="${definition.step}"
          value="${value}"
          data-control-number="${id}"
        >
      </div>
    `;
  }

  if (definition.type === "select") {
    return `
      <div class="field">
        <span>${definition.label}</span>
        <select data-control-select="${id}">
          ${definition.options.map(([optionValue, label]) => `
            <option value="${optionValue}" ${String(optionValue) === String(value) ? "selected" : ""}>${label}</option>
          `).join("")}
        </select>
      </div>
    `;
  }

  if (definition.type === "toggle") {
    return `
      <label class="toggle-row">
        <span>${definition.label}</span>
        <input type="checkbox" data-control-toggle="${id}" ${value ? "checked" : ""}>
      </label>
    `;
  }

  return `
    <button type="button" data-control-button="${id}">${definition.label}</button>
  `;
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
  CONTROL_SECTIONS.forEach((section) => {
    section.controls.forEach((definition) => {
      const id = controlId(definition);
      const value = getControlValue(definition);
      const range = refs.controlsRoot.querySelector(`[data-control="${id}"]`);
      const number = refs.controlsRoot.querySelector(`[data-control-number="${id}"]`);
      const select = refs.controlsRoot.querySelector(`[data-control-select="${id}"]`);
      const toggle = refs.controlsRoot.querySelector(`[data-control-toggle="${id}"]`);
      const label = refs.controlsRoot.querySelector(`[data-control-row="${id}"] small`);
      if (range) {
        range.value = value;
      }
      if (number) {
        number.value = value;
      }
      if (select) {
        select.value = value;
      }
      if (toggle) {
        toggle.checked = Boolean(value);
      }
      if (label) {
        label.textContent = formatControlValue(definition, value);
      }
    });
  });
}

function currentScenarioDefaults() {
  return buildScenarioParams(app.scenarioKey);
}

function resetScenario() {
  app.activeState = createSimulationState(app.scenarioKey);
  app.baselineState = createSimulationState(app.scenarioKey);
  app.playing = true;
  refs.playBtn.textContent = "Pause";
  syncControlValues();
  renderAll();
}

function rebuildActiveState() {
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
  app.scenarioKey = scenarioKey;
  app.activeState = createSimulationState(scenarioKey);
  app.baselineState = createSimulationState(scenarioKey);
  refs.scenarioSelect.value = scenarioKey;
  syncControlValues();
  renderAll();
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
  const defaults = currentScenarioDefaults()[sectionId];
  app.activeState.params[sectionId] = deepClone(defaults);
  if (sectionId === "display") {
    app.colorMode = "temperature";
  }
  rebuildActiveState();
  syncControlValues();
}

function handleControlEvent(event) {
  const target = event.target;
  const datasetId = target.dataset.control || target.dataset.controlNumber || target.dataset.controlSelect || target.dataset.controlToggle;
  if (!datasetId) {
    return;
  }
  const [sectionId, key] = datasetId.split(".");
  const section = CONTROL_SECTIONS.find((item) => item.id === sectionId);
  const definition = section?.controls.find((control) => control.key === key);
  if (!definition) {
    return;
  }
  const raw = target.type === "checkbox" ? target.checked : target.value;
  const parsed = parseControlValue(definition, raw);
  const pairedRange = refs.controlsRoot.querySelector(`[data-control="${datasetId}"]`);
  const pairedNumber = refs.controlsRoot.querySelector(`[data-control-number="${datasetId}"]`);
  if (pairedRange && target !== pairedRange) {
    pairedRange.value = definition.toUI ? definition.toUI(parsed) : parsed;
  }
  if (pairedNumber && target !== pairedNumber) {
    pairedNumber.value = definition.toUI ? definition.toUI(parsed) : parsed;
  }
  applyControlChange(definition, parsed);
  syncControlValues();
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
}

function renderLegend() {
  refs.legend.innerHTML = getLegend(app.colorMode).map((entry) => `
    <div class="legend-chip">
      <span class="legend-swatch" style="background:${entry.color}"></span>
      <span>${entry.label}</span>
    </div>
  `).join("");
}

function renderStatusCards() {
  const metrics = app.activeState.metrics;
  const cards = [
    { title: "Stratification", value: metrics.stratificationState, note: metrics.stabilityIndex > 0.75 ? "Stable density barrier" : "Vertical exchange more likely" },
    { title: "Thermocline", value: metrics.thermoclineDepth ? `${formatNumber(metrics.thermoclineDepth)} m` : "Not distinct", note: "Strongest temperature gradient" },
    { title: "Surface temp", value: `${formatNumber(metrics.surfaceTemp)} °C`, note: "Controls density and metabolism" },
    { title: "Bottom oxygen", value: `${formatNumber(metrics.bottomOxygen, 2)} mg/L`, note: metrics.bottomOxygen < 2 ? "Critical for benthic fauna" : "Deep-water respiration balance" },
    { title: "Bloom risk", value: metrics.bloomRisk > 0.72 ? "High" : metrics.bloomRisk > 0.42 ? "Moderate" : "Low", note: "Depends on nutrients, warmth, stability" },
    { title: "Ecosystem", value: metrics.ecosystemStatus, note: metrics.habitatCompression ? "Fish refuge is compressed" : "Habitat remains broader" },
  ];
  refs.statusCards.innerHTML = cards.map((card) => `
    <div class="kpi-card">
      <h3>${card.title}</h3>
      <div class="kpi-value">${card.value}</div>
      <div class="kpi-note">${card.note}</div>
    </div>
  `).join("");
}

function renderAlerts() {
  refs.alertsList.innerHTML = app.activeState.alerts.map((alert) => `
    <article class="alert-card alert-${alert.level}">
      <strong>${alert.title}</strong>
      <p>${alert.detail}</p>
    </article>
  `).join("");
}

function renderExplanation() {
  refs.explainWhat.textContent = app.activeState.explanation.what;
  refs.explainWhy.textContent = app.activeState.explanation.why;
  refs.explainImpact.textContent = app.activeState.explanation.impact;
}

function renderCompare() {
  const showCompare = app.mode === "compare";
  refs.comparePanel.hidden = !showCompare;
  if (!showCompare) {
    return;
  }
  drawCompareChart(refs.compareTempChart, app.activeState, app.baselineState, "temperature", PROFILE_CONFIG.temperature);
  drawCompareChart(refs.compareOxygenChart, app.activeState, app.baselineState, "oxygen", PROFILE_CONFIG.oxygen);
  refs.compareStatus.innerHTML = `
    <div class="compare-pill"><strong>Baseline:</strong> ${SCENARIOS[app.scenarioKey].label} remains at default forcing.</div>
    <div class="compare-pill"><strong>Modified:</strong> ${app.activeState.metrics.stratificationState}, bottom O2 ${formatNumber(app.activeState.metrics.bottomOxygen, 2)} mg/L.</div>
    <div class="compare-pill"><strong>Difference:</strong> Temperature gradient ${formatNumber(app.activeState.metrics.surfaceTemp - app.baselineState.metrics.surfaceTemp, 1)} C at the surface and ${formatNumber(app.activeState.metrics.bottomOxygen - app.baselineState.metrics.bottomOxygen, 2)} mg/L at the bottom.</div>
  `;
}

function renderCharts() {
  drawProfileChart(refs.tempChart, app.activeState, "temperature", PROFILE_CONFIG.temperature);
  drawProfileChart(refs.oxygenChart, app.activeState, "oxygen", PROFILE_CONFIG.oxygen);
  drawProfileChart(refs.nutrientChart, app.activeState, "nutrients", PROFILE_CONFIG.nutrients);
  drawTimeSeriesChart(refs.timeChart, app.activeState);
}

function renderAll() {
  drawLakeScene(refs.lakeCanvas, app.activeState, app.colorMode);
  renderLegend();
  renderStatusCards();
  renderAlerts();
  renderExplanation();
  renderCharts();
  renderCompare();
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
    refs.playBtn.textContent = "Play";
  }
}

function showTooltip(payload, event) {
  refs.tooltip.hidden = false;
  refs.tooltip.innerHTML = tooltipHtml(payload.layer);
  const wrapRect = refs.lakeCanvas.parentElement.getBoundingClientRect();
  refs.tooltip.style.left = `${event.clientX - wrapRect.left + 16}px`;
  refs.tooltip.style.top = `${event.clientY - wrapRect.top + 16}px`;
}

function hideTooltip() {
  refs.tooltip.hidden = true;
}

function handleModeChange(value) {
  app.mode = value;
  app.activeState.params.display.compareWithBaseline = value === "compare";
  if (value === "compare") {
    syncBaselineState();
  }
  syncControlValues();
  renderAll();
}

function populateScenarioOptions() {
  refs.scenarioSelect.innerHTML = getScenarioKeys().map((key) => `
    <option value="${key}">${SCENARIOS[key].label}</option>
  `).join("");
  refs.scenarioSelect.value = app.scenarioKey;
}

function attachEvents() {
  refs.scenarioSelect.addEventListener("change", (event) => {
    applyScenarioSelection(event.target.value);
  });

  refs.modeSelect.addEventListener("change", (event) => {
    handleModeChange(event.target.value);
  });

  refs.speedSelect.addEventListener("change", (event) => {
    app.speed = Number(event.target.value);
  });

  refs.playBtn.addEventListener("click", () => {
    app.playing = !app.playing;
    refs.playBtn.textContent = app.playing ? "Pause" : "Play";
  });

  refs.resetBtn.addEventListener("click", () => {
    resetScenario();
  });

  refs.guideBtn.addEventListener("click", () => refs.guideModal.showModal());
  refs.closeGuideBtn.addEventListener("click", () => refs.guideModal.close());
  refs.guideModal.addEventListener("click", (event) => {
    if (event.target === refs.guideModal) {
      refs.guideModal.close();
    }
  });

  refs.controlsRoot.addEventListener("input", handleControlEvent);
  refs.controlsRoot.addEventListener("change", handleControlEvent);
  refs.controlsRoot.addEventListener("click", handleControlButton);

  document.querySelectorAll('input[name="color-mode"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      app.colorMode = event.target.value;
      syncControlValues();
      renderAll();
    });
  });

  refs.lakeCanvas.addEventListener("mousemove", (event) => {
    const hit = hitTestLayer(refs.lakeCanvas, app.activeState, event.clientX, event.clientY);
    app.hoveredLayer = hit?.layer ?? null;
    if (hit) {
      showTooltip(hit, event);
    } else {
      hideTooltip();
    }
  });
  refs.lakeCanvas.addEventListener("mouseleave", hideTooltip);

  document.addEventListener("keydown", async (event) => {
    if (event.key.toLowerCase() === "f") {
      if (!document.fullscreenElement) {
        await refs.lakeCanvas.parentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    }
  });
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

function bootstrap() {
  populateScenarioOptions();
  renderControls();
  syncControlValues();
  attachEvents();
  installTestingHooks();
  renderAll();

  let lastFrame = performance.now();
  const frame = (timestamp) => {
    const deltaSeconds = clamp((timestamp - lastFrame) / 1000, 0, 0.15);
    lastFrame = timestamp;
    if (app.playing) {
      stepByRealSeconds(deltaSeconds);
      renderAll();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

bootstrap();
