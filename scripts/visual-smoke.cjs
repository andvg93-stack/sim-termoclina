const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./serve.cjs');
const out = path.resolve(process.env.ARTIFACT_DIR || 'output/visual-review');
fs.mkdirSync(out,{recursive:true});
const checks = [], errors = [];
let browser, server;
async function main() {
  server = createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:1512,height:1040},acceptDownloads:true});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  const state = () => page.evaluate(()=>JSON.parse(window.render_game_to_text()));
  const click = id => page.locator(id).click();
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await click('#play-btn'); assert.equal((await state()).ui.playing,false);
  const frame = await page.evaluate(async()=>{const i=new Image();i.src='assets/lake-frame.png';await i.decode();return i.naturalWidth});
  assert.ok(frame>1000); checks.push('Scenic asset loads; simulation starts and pauses');
  for (const width of [1512,1280,1024,768,390,320]) {
    await page.setViewportSize({width,height:width<500?844:1040});
    await page.waitForTimeout(80);
    const layout = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,lake:document.querySelector('#lake-canvas').getBoundingClientRect().toJSON(),names:[...document.querySelectorAll('input[type=number]')].every(e=>!!e.getAttribute('aria-label')),kpis:[...document.querySelectorAll('.kpi-card')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth}))}));
    assert.ok(layout.scroll<=width,`Overflow at ${width}`); assert.ok(layout.names); assert.ok(layout.kpis.every(k=>k.scroll<=k.width),`KPI overflow at ${width}`);
    if(width<500) assert.ok(layout.lake.y<600,'Lake visible in the first mobile viewport');
    await page.screenshot({path:path.join(out,`implementacion-${width}.png`),fullPage:true});
    if(width===390)await page.screenshot({path:path.join(out,'movil.png')});
    checks.push(`Responsive ${width}px: no overflow, accessible fields`);
  }
  await page.setViewportSize({width:1512,height:1040});
  const first = (await state()).active.elapsedDays;
  await page.waitForTimeout(150); assert.equal((await state()).active.elapsedDays,first);
  await page.evaluate(()=>window.advanceTime(1000)); assert.ok((await state()).active.elapsedDays>first); checks.push('Pause freezes time; deterministic advance updates live state');
  for (const mode of ['oxygen','nutrients','stability','temperature']) {
    await page.locator(`input[name=color-mode][value=${mode}]`).check();
    assert.equal((await state()).ui.colorMode,mode);
    assert.ok((await page.locator('#legend').innerText()).length>10);
  }
  checks.push('Four live color modes and quantitative legends');
  await page.locator('details[data-section=display]>summary').click();
  await page.locator('[data-control-toggle="display.showLabels"]').uncheck();
  await page.locator('[data-control-select="display.colorView"]').selectOption('oxygen');
  assert.equal((await state()).ui.colorMode,'oxygen');
  await page.locator('[data-reset-section=display]').click();
  assert.equal((await state()).ui.colorMode,'temperature');
  await page.locator('details[data-section=display]>summary').click();
  checks.push('Display toggles, color selector and reset stay synchronized');
  const air=page.locator('[data-control-number="climate.airTemp"]');
  await air.fill('21.5'); await air.press('Tab'); assert.equal(await page.locator('[data-control="climate.airTemp"]').inputValue(),'21.5');
  await air.fill('100'); await air.press('Tab'); assert.equal(await air.inputValue(),'36');
  await page.locator('[data-reset-section=climate]').click(); assert.equal(await air.inputValue(),'30');
  checks.push('Numeric controls apply, clamp and reset correctly');
  await click('#tab-compare'); assert.equal((await state()).ui.mode,'compare'); assert.ok((await state()).compare);
  await air.fill('15'); await air.press('Tab'); await page.evaluate(()=>window.advanceTime(4000));
  const compared = await state(); assert.notEqual(compared.active.surfaceTemp,compared.compare.surfaceTemp);
  await page.screenshot({path:path.join(out,'comparacion.png'),fullPage:true}); checks.push('Comparison evolves baseline independently from modified forcing');
  await page.locator('#mode-select').selectOption('guided'); assert.equal(await page.locator('#guided-note').isVisible(),true);
  await click('#tab-education'); assert.equal(await page.locator('#education-panel').isVisible(),true);
  await page.screenshot({path:path.join(out,'explicacion.png'),fullPage:true});
  await click('#tab-evolution'); await page.screenshot({path:path.join(out,'evolucion.png'),fullPage:true});
  await page.locator('#tab-evolution').press('ArrowLeft'); assert.equal(await page.locator('#tab-profiles').getAttribute('aria-selected'),'true');
  checks.push('Guided explanation, history and keyboard tab navigation');
  await page.locator('#mode-select').selectOption('free');
  for (const scenario of ['summer_stable','wind_mixing','eutrophic_reservoir','oligotrophic_lake','rainfall_pulse','autumn_turnover']) {
    await page.locator('#scenario-select').selectOption(scenario);
    await page.evaluate(()=>window.advanceTime(1000));
    const s=await state(); assert.equal(s.active.scenario,scenario); assert.ok(Number.isFinite(s.active.surfaceTemp));
    if(scenario==='autumn_turnover') { await page.evaluate(()=>window.advanceTime(12000)); assert.equal((await state()).active.stratificationState,'Mixed'); }
    checks.push(`Scenario ${scenario} loads and advances`);
  }
  await click('#tab-profiles'); await page.locator('#lake-canvas').focus(); await page.locator('#lake-canvas').press('ArrowDown');
  assert.equal(await page.locator('#layer-inspector').isVisible(),true);
  await page.locator('#lake-canvas').press('End'); assert.ok((await page.locator('#layer-inspector').innerText()).includes('mg/L'));
  await page.locator('#lake-canvas').press('Escape'); assert.equal(await page.locator('#layer-inspector').isVisible(),false);
  const box=await page.locator('#lake-canvas').boundingBox();await page.mouse.click(box.x+box.width*.6,box.y+box.height*.6);assert.equal(await page.locator('#layer-inspector').isVisible(),true);
  await click('#layer-inspector button');
  await page.mouse.move(box.x+box.width*.87,box.y+box.height*.7);
  if(await page.locator('#layer-tooltip').isVisible()) { const tip=await page.locator('#layer-tooltip').boundingBox();assert.ok(tip.x+tip.width<=box.x+box.width+1); }
  checks.push('Depth inspection by mouse and keyboard; bounded tooltip');
  await click('#fullscreen-btn');assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);await page.keyboard.press('Escape');
  if(await page.evaluate(()=>!!document.fullscreenElement))await page.evaluate(()=>document.exitFullscreen());
  checks.push('Fullscreen enters and exits');
  await click('#guide-btn');assert.equal(await page.locator('#guide-modal').evaluate(e=>e.open),true);await click('#close-guide-btn');
  await click('#alerts-btn');assert.equal(await page.locator('#alerts-list').isVisible(),true);await click('#alerts-btn');
  const downloaded=page.waitForEvent('download');await click('#export-btn');const download=await downloaded;await download.saveAs(path.join(out,'estado-exportado.json'));
  const exported=JSON.parse(fs.readFileSync(path.join(out,'estado-exportado.json'),'utf8'));assert.ok(exported.active);checks.push('Guide, ecological alerts and valid JSON export');
  await page.locator('#scenario-select').selectOption('summer_stable');await page.evaluate(()=>window.advanceTime(20000));await page.evaluate(()=>window.advanceTime(20000));await page.evaluate(()=>window.advanceTime(20000));
  assert.equal((await state()).ui.playing,false);await click('#play-btn');assert.equal((await state()).ui.playing,true);await click('#play-btn');checks.push('Simulation completion can restart');
  // Touch uses the same click path; ensure it works with an actual touch context.
  const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  touch.on('pageerror',e=>errors.push(String(e)));await touch.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await touch.locator('#play-btn').tap();
  const touchBox=await touch.locator('#lake-canvas').boundingBox();await touch.touchscreen.tap(touchBox.x+touchBox.width*.6,touchBox.y+touchBox.height*.6);assert.equal(await touch.locator('#layer-inspector').isVisible(),true);
  await touch.screenshot({path:path.join(out,'tacto-retina.png')});checks.push('Touch depth inspection and HiDPI mobile rendering');
  await touch.locator('#layer-inspector button').tap();await touch.locator('#parameters-btn').tap();assert.equal(await touch.locator('#controls-root').isVisible(),true);
  await touch.locator('#parameters-btn').tap();assert.equal(await touch.locator('#controls-root').isVisible(),false);await touch.locator('#tab-evolution').tap();assert.equal(await touch.locator('#evolution-panel').isVisible(),true);
  checks.push('Mobile parameter disclosure and fixed analysis tabs');
  assert.deepEqual(errors,[],'Runtime or network errors');checks.push('No JavaScript or failed resource errors');
}
(async()=>{
  let failure;
  try {await main();}catch(e){failure=String(e);console.error(e);process.exitCode=1;}
  finally {
    fs.writeFileSync(path.join(out,'resumen-pruebas.json'),JSON.stringify({passed:!failure,checks,errors,...(failure?{failure}:{})},null,2));
    console.log(JSON.stringify({passed:!failure,checks:checks.length,errors,artifactDirectory:out,...(failure?{failure}:{})}));
    if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));
  }
})();
