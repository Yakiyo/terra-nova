// Browser smoke test for the web interface.
//
//   1. start the app:   OFFLINE=1 .venv/Scripts/uvicorn src.api.main:app --port 8000
//   2. run:             node scripts/ui_smoke.mjs [http://127.0.0.1:8000]
//
// Drives a headless Chrome over the DevTools protocol (Node 22+ has WebSocket
// built in; no npm install). Fails with exit code 1 on any JavaScript error or
// missing piece of the interface. Set CHROME to the browser path if needed.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] || "http://127.0.0.1:8000").replace(/\/$/, "");
const CHROME = process.env.CHROME || (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : "google-chrome");
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--window-size=1600,900", `--user-data-dir=${mkdtempSync(join(tmpdir(), "eaf-smoke-"))}`, "about:blank",
], { stdio: "ignore" });
process.on("exit", () => chrome.kill());

let targets = [];
for (let i = 0; i < 60 && !targets.length; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(250); }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const ready = async (expression) => {
  for (let i = 0; i < 150; i++) {
    if (await js(expression)) return;
    await sleep(300);
  }
  throw new Error(`Interface did not become ready: ${expression}; ${JSON.stringify(await js("({url:location.href,y:scrollY,title:document.getElementById('missionTitle')?.dataset,facts:document.getElementById('facts')?.dataset,titleRect:document.getElementById('missionTitle')?.getBoundingClientRect().toJSON()})"))}`);
};

const page = async (path, wait) => {
  await send("Page.navigate", { url: "about:blank" });
  await sleep(200);
  await send("Page.navigate", { url: `${BASE}/${path}` });
  await sleep(wait);
};

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); };

await send("Runtime.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
if (!process.argv.includes("--motion-only")) {
await send("Page.navigate", { url: `${BASE}/finder.html#target=jezero_crater` });
await ready(`document.querySelectorAll('.site').length >= 5 && /AUC/.test(document.getElementById('statusPill').textContent) && document.querySelector('#legend .ramp')`);
check("ranked sites listed", (await js(`document.querySelectorAll('.site').length`)) >= 5);
check("status pill shows AUC", /AUC/.test(await js(`document.getElementById('statusPill').textContent`)));
check("AUC label and value have distinct type roles", await js(`!!document.querySelector('#statusAuc .auc-label') && !!document.querySelector('#statusAuc .auc-value') && getComputedStyle(document.querySelector('.auc-value')).fontFamily.includes('Roboto')`));
check("Watermelon-inspired map controls are accessible", await js(`[...document.querySelectorAll('.wm-map-controls button')].length === 3 && [...document.querySelectorAll('.wm-map-controls button')].every(button=>button.getAttribute('aria-label') && button.getBoundingClientRect().width >= 44 && button.getBoundingClientRect().height >= 44)`));
await js(`document.getElementById('zoomIn').click(); document.getElementById('zoomOut').click(); document.getElementById('zoomHome').click()`);
check("legend rendered", !!(await js(`document.querySelector('#legend .ramp')`)));
await ready(`document.querySelector('#layer + .wm-select')`);
await js(`document.querySelector('#layer + .wm-select summary').click()`);
await ready(`document.querySelector('#layer + .wm-select .disclosure-options').matches(':popover-open')`);
check("layer dropdown uses Watermelon disclosure", await js(`document.querySelector('#layer + .wm-select summary').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('#layer + .wm-select [role=menuitemradio]').length > 1`));
await js(`document.querySelector('#layer + .wm-select [data-value=vegetation]').click()`);
await ready(`document.getElementById('layer').value === 'vegetation' && document.querySelector('#layer + .wm-select summary').getAttribute('aria-expanded') === 'false'`);
check("disclosure selection updates native application state", await js(`document.querySelector('#layer + .wm-select [data-value=vegetation]').getAttribute('aria-checked') === 'true'`));
await js(`document.querySelector('#layer + .wm-select summary').focus()`);
await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
await ready(`document.querySelector('#layer + .wm-select .disclosure-options').contains(document.activeElement)`);
await send("Input.dispatchKeyEvent", {type:"keyDown",key:"m",code:"KeyM",text:"m",windowsVirtualKeyCode:77});
check("dropdown typeahead does not trigger map shortcuts", await js(`document.getElementById('flatmap').hidden && document.activeElement.textContent.toLowerCase().startsWith('m')`));
await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
check("disclosure Escape closes and restores focus", await js(`!document.querySelector('#layer + .wm-select').open && document.activeElement === document.querySelector('#layer + .wm-select summary')`));
await js(`document.getElementById('knownToggle').click()`);
check("Save Toggle hides known markers", await js(`document.getElementById('knownToggle').getAttribute('aria-pressed') === 'false' && !document.getElementById('showKnown').checked && !document.querySelector('.marker.known')`));
await js(`document.getElementById('knownToggle').click()`);
check("Save Toggle restores known markers", await js(`document.getElementById('showKnown').checked && document.getElementById('knownToggle').getAttribute('aria-pressed') === 'true'`));
await js(`document.getElementById('overlayOpacity').focus()`);
await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowLeft",code:"ArrowLeft",windowsVirtualKeyCode:37});
check("adaptive overlay supports keyboard and value display", await js(`document.getElementById('overlayOpacity').value === '95' && document.querySelector('.adaptive-value').value === '95%' && document.querySelector('.adaptive-overlay').style.getPropertyValue('--overlay-position') === '95%'`));
await js(`document.getElementById('overlayOpacity').value = '100'; document.getElementById('overlayOpacity').dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('overlayOpacity').blur()`);
await js(`document.querySelector('[data-view=map]').click()`);
check("Globe/Map uses a sliding selection", await js(`document.querySelector('[data-view=map]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.segmented[aria-label=View] .segment-slider') && !document.getElementById('flatmap').hidden`));
await js(`document.querySelector('[data-view=globe]').click()`);
check("scores have API-linked graphical gauges", await js(`[...document.querySelectorAll('.site .score-meter')].length > 0 && [...document.querySelectorAll('.site .score-meter')].every(m=>m.dataset.sourceUrl && m.dataset.datasetId && m.getAttribute('aria-label').includes('match'))`));
check("planet preview caption uses Lenis-reference Anton", await js(`getComputedStyle(document.getElementById('twinCaption')).fontFamily.includes('Anton') && getComputedStyle(document.querySelector('.twin-hint')).fontFamily.includes('Anton')`));
check("results summary and shared hints use Lenis-reference Anton", await js(`[...document.querySelectorAll('.hint')].every(el=>getComputedStyle(el).fontFamily.includes('Anton')) && parseFloat(getComputedStyle(document.getElementById('resultsSummary')).fontSize) >= 14`));
for (const [trigger, panel] of [['statusPill','statusPanel'],['helpButton','helpMenu']]) {
  await js(`document.getElementById('${trigger}').click()`);
  await ready(`!document.getElementById('${panel}').hidden`);
  check(`${trigger} uses Dropdown Disclosure shell`, await js(`document.getElementById('${trigger}').classList.contains('wm-disclosure-trigger') && !!document.querySelector('#${trigger} .disclosure-leading') && !!document.querySelector('#${panel} .disclosure-panel-head .disclosure-close')`));
  await js(`document.querySelector('#${panel} .disclosure-close').click()`);
  check(`${trigger} disclosure close restores focus`, await js(`document.getElementById('${panel}').hidden && document.activeElement === document.getElementById('${trigger}')`));
}
check("layer disclosure has a close header and circular option icons", await js(`!!document.querySelector('#layer + .wm-select .disclosure-panel-head .disclosure-close') && !!document.querySelector('#layer + .wm-select .disclosure-option-icon')`));
if (process.argv.includes("--controls-only")) finish();
for (const layer of ["vegetation", "annual_temperature_range", "mean_annual_temperature", "slope"]) {
  await js(`(() => { const s = document.getElementById('layer'); s.value = '${layer}'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(700);
  check(`layer ${layer} legend`, (await js(`document.querySelector('#legend .title')?.textContent || ''`)).length > 0);
}
await js(`document.querySelector('.site').click()`);
await sleep(1200);
check("site card opens", !!(await js(`document.querySelector('#detail h3')`)));
check("a click shows the small info card", !!(await js(`document.querySelector('.info-card')`)));
check("a click does not open God's Eye", await js(`document.getElementById('godseye').hidden`));
check("rank 11+ markers look different from known analogs", await js(`(() => {
  const a = document.querySelector('.marker.minor'), b = document.querySelector('.marker.known');
  return !!a && !!b && getComputedStyle(a).backgroundColor !== getComputedStyle(b).backgroundColor; })()`));
// A real mouse click on the card's close button, so anything painted over it is caught.
const xy = await js(`(async () => {
  let previous, stable = 0;
  for (let i = 0; i < 50; i++) {
    const r = document.querySelector('.info-card .ic-close').getBoundingClientRect();
    const next = [r.left + r.width / 2, r.top + r.height / 2];
    stable = previous && Math.abs(previous[0]-next[0]) < 0.5 && Math.abs(previous[1]-next[1]) < 0.5 ? stable + 1 : 0;
    if (stable >= 3) return next;
    previous = next;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return previous;
})()`);
for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: xy[0], y: xy[1], button: "left", clickCount: 1 });
}
await sleep(400);
check("the card's close button closes it", !(await js(`!!document.querySelector('.info-card')`)));
// Force the exact stacking collision: preview close over the floating toolbar.
await js(`(() => {const style=document.createElement('style');style.id='preview-collision-test';style.textContent='.info-card {left:12px!important;top:12px!important;transform:none!important}';document.head.append(style)})()`);
for (const [width, height] of [[1046, 700], [390, 844]]) {
  await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor:1, mobile:width < 720});
  for (const view of ['globe', 'map']) {
    await js(`document.querySelector('[data-view=${view}]').click(); document.querySelector('.site').click()`);
    await ready(`!!document.querySelector('.info-card')`);
    await js(`document.querySelector('.stage').scrollIntoView({behavior:'instant',block:'start'})`);
    await ready(`document.querySelector('.info-card').getBoundingClientRect().width > 0`);
    const point = await js(`(() => {
      const card=document.querySelector('.info-card');
      const button=card.querySelector('.ic-close'), rect=button.getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      return {x,y,reachable:button.contains(document.elementFromPoint(x,y))};
    })()`);
    check(`${view} preview close stays above toolbar at ${width}px`, point.reachable);
    for (const type of ['mouseMoved','mousePressed','mouseReleased']) {
      await send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1});
    }
    await sleep(150);
    check(`${view} overlapping preview closes at ${width}px`, await js(`!document.querySelector('.info-card')`));
  }
}
await js(`document.getElementById('preview-collision-test').remove()`);
await send("Emulation.clearDeviceMetricsOverride");
await js(`document.querySelector('[data-view=globe]').click()`);
if (process.argv.includes("--interaction-only")) finish();
await js(`document.querySelector('.site').click()`);
await sleep(800);
await js(`document.getElementById('tabExplore').click()`);
await ready(`document.querySelectorAll('.scatter [data-i]').length > 5`);
check("explore scatter drawn", (await js(`document.querySelectorAll('.scatter [data-i]').length`)) > 5);
await ready(`document.querySelector('#exX + .wm-select') && document.querySelector('#exY + .wm-select')`);
check("dynamic Explore selectors use disclosures", await js(`document.getElementById('exX').hidden && document.getElementById('exY').hidden`));
check("sidebar tabs use a sliding selection", await js(`!!document.querySelector('.tabs.wm-segment .segment-slider') && document.getElementById('tabExplore').getAttribute('aria-selected') === 'true'`));
await js(`document.getElementById('tabValidation').click()`);
await ready(`document.querySelectorAll('#validation table.controls tbody tr').length > 5`);
check("validation controls table", (await js(`document.querySelectorAll('#validation table.controls tbody tr').length`)) > 5);
const escape = () => send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await js(`document.getElementById('tabResults').click()`);
await js(`document.getElementById('helpButton').click()`);
await sleep(200);
check("Help menu lists its 4 items", (await js(`document.getElementById('helpMenu').hidden ? 0 : document.querySelectorAll('#helpMenu > [role=menuitem]').length`)) === 4);
await escape();
await sleep(200);
check("Esc closes the Help menu", await js(`document.getElementById('helpMenu').hidden`));
await js(`document.getElementById('statusPill').click()`);
await sleep(200);
check("status panel shows the AUC", /AUC/.test(await js(`document.getElementById('statusVal').textContent`)));
await js(`document.getElementById('statusOpenVal').click()`);
await sleep(300);
check("status panel opens the Validation tab", (await js(`document.getElementById('tabValidation').getAttribute('aria-selected')`)) === "true"
  && (await js(`document.getElementById('statusPanel').hidden`)));
await js(`document.getElementById('toggleSidebar').click()`);
await sleep(600);
check("globe keeps its width with the sidebar hidden", (await js(`document.querySelector('.stage').getBoundingClientRect().width`)) > 600);
await js(`document.getElementById('toggleSidebar').click()`);
check("markers and the card are not hidden from screen readers", !(await js(`!!document.querySelector('.info-card')?.closest('[aria-hidden=true]')`)));

// God's Eye behaves as a modal: focus moves in, Esc closes the guide before the view.
await js(`localStorage.removeItem('tn-ge-guide')`);
await js(`document.querySelector('.info-card [data-act=eye]').click()`);
for (let i = 0; i < 60 && !(await js(`document.getElementById('geLoading').hidden`)); i++) await sleep(500);
await sleep(800);
check("God's Eye takes focus", await js(`document.getElementById('godseye').contains(document.activeElement)`));
check("God's Eye includes its Finder return breadcrumb", await js(`!!document.querySelector('#terrainBreadcrumbs [data-crumb-action=finder]')`));
const terrainUnavailable = await js(`document.getElementById('godseye').dataset.status === 'error'`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(600);
check(terrainUnavailable ? "Esc closes unavailable terrain" : "Esc closes the controls guide first", terrainUnavailable ? await js(`document.getElementById('godseye').hidden`) : (await js(`document.getElementById('geGuide').hidden`)) && !(await js(`document.getElementById('godseye').hidden`)));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
for (let i = 0; i < 10 && !(await js(`document.getElementById('godseye').hidden`)); i++) await sleep(300);
check("a second Esc closes God's Eye", await js(`document.getElementById('godseye').hidden`));

// Links between pages and into the Finder.

const checked = `document.querySelector('.target-card[aria-checked=true] strong')?.textContent`;
await page("finder.html", 12000);
await ready(`document.querySelectorAll('.site').length >= 5`);
check("the Finder opens without a target in the link", (await js(`document.querySelectorAll('.site').length`)) >= 5);
await page("finder.html#target=moon", 12000);
await ready(`(${checked}) === "Lunar South Pole"`);
check("#target=moon opens the lunar south pole", (await js(checked)) === "Lunar South Pole");
await page("finder.html#target=custom", 12000);
await ready(`(${checked}) === "Your own profile"`);
check("#target=custom opens the custom profile", (await js(checked)) === "Your own profile");
await ready(`document.querySelector('#manualBody + .wm-select')`);
check("custom profile selector uses disclosure", await js(`document.getElementById('manualBody').hidden`));
await page("index.html", 3000);
check("home links to the targets page", !!(await js(`document.querySelector('a.btn-primary[href="targets.html"]')`)));
await page("targets.html", 3000);
check("target cards are keyboard links", (await js(`document.querySelectorAll('a.dest-card[href^="finder.html#target="]').length`)) >= 6);

for (const [path, body] of [["targets.html?body=moon", "Moon"], ["targets.html?body=mars", "Mars"], ["targets.html#Moon", "Moon"], ["targets.html#Mars", "Mars"]]) {
  await page(path, 700);
  await ready(`document.querySelector('#${body} .dest-card')`);
  check(`${path} shows only its planet`, await js(`document.querySelectorAll('.planet-group').length === 1 && !!document.getElementById('${body}') && !document.getElementById('g-custom')`));
  check(`${path} heading and breadcrumb`, await js(`document.title.includes('${body}') && document.querySelector('h1').textContent.includes('${body}') && document.querySelector('#targetBreadcrumbs [aria-current]').textContent === '${body}'`));
}
await page("targets.html?body=unknown", 700);
await ready(`document.getElementById('g-custom')`);
check("invalid body keeps full index", await js(`document.querySelectorAll('.planet-group').length === 2`));
await js(`document.querySelector('.body-switch [data-body=moon]').click()`);
await ready(`document.querySelectorAll('.planet-group').length === 1 && document.getElementById('Moon')`);
await send("Page.reload");
await ready(`document.querySelectorAll('.planet-group').length === 1 && document.getElementById('Moon')`);
check("planet filter survives refresh", await js(`location.search === '?body=moon'`));
await js(`document.querySelector('.body-switch [data-body=mars]').click()`);
await ready(`!!document.getElementById('Mars') && !document.getElementById('Moon')`);
await js(`history.back()`);
await ready(`!!document.getElementById('Moon') && !document.getElementById('Mars')`);
check("planet filter follows browser history", await js(`document.querySelector('.body-switch [aria-current]').textContent === 'Moon'`));
await js(`history.forward()`);
await ready(`!!document.getElementById('Mars') && !document.getElementById('Moon')`);
const destination = await js(`document.querySelector('#Mars .dest-card').getAttribute('href')`);
await page(destination, 2000);
await ready(`document.querySelector('#finderBreadcrumbs [aria-current]') && document.querySelectorAll('.site').length`);
check("target-specific Finder breadcrumb", await js(`document.querySelector('#finderBreadcrumbs a[href="targets.html?body=mars"]') && document.querySelector('#finderBreadcrumbs [aria-current]').textContent.includes(document.querySelector('.target-card[aria-checked=true] strong').textContent)`));

}
await page("index.html", 1000);
await ready(`document.querySelector('#facts dd')`);
check("home planetary links are filtered", await js(`document.querySelector('.mission-world.moon').getAttribute('href') === 'targets.html?body=moon' && document.querySelector('.mission-world.mars').getAttribute('href') === 'targets.html?body=mars'`));
check("counter values and provenance match API", await js(`(async () => {
  const [health, targets, analogs] = await Promise.all(['/api/health','/api/targets','/api/analogs'].map(url=>fetch(url).then(r=>r.json())));
  const expected = [Number(health.candidate_cells).toLocaleString('en-US'), String(targets.targets.length), String(analogs.sites.length)];
  return [...document.querySelectorAll('#facts dd')].every((dd,i)=>dd.querySelector('.visually-hidden').textContent === expected[i] && dd.querySelector('.counter-visual').textContent === expected[i] && dd.parentElement.dataset.sourceUrl && dd.parentElement.dataset.datasetId);
})()`));
await js(`document.getElementById('facts').scrollIntoView({behavior:'instant',block:'center'})`);
await ready(`document.getElementById('facts').dataset.revealed === 'true'`);
await sleep(1400);
await ready(`document.querySelector('#facts').getAnimations({subtree:true}).length === 0`);
check("counter reveals finish", await js(`document.querySelector('#facts').getAnimations({subtree:true}).length === 0`));
await js(`document.getElementById('missionEvidence').scrollIntoView({behavior:'instant',block:'center'})`);
await ready(`document.querySelector('.evidence-row') && document.getElementById('missionEvidence').dataset.revealed === 'true'`);
await sleep(1700);
await ready(`document.querySelector('#missionEvidence').getAnimations({subtree:true}).length === 0`);
check("evidence reveals finish with readable sources", await js(`document.querySelector('#missionEvidence').getAnimations({subtree:true}).length === 0 && [...document.querySelectorAll('.evidence-row a')].every(a=>parseFloat(getComputedStyle(a).fontSize)>=14 && a.dataset.datasetId && a.getAttribute('href'))`));
const counterRuns = await js(`Number(document.getElementById('facts').dataset.revealRuns)`);
await js(`scrollTo({top:0,behavior:'instant'})`);
await js(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
await ready(`document.getElementById('facts').dataset.inView === 'false'`);
await js(`document.getElementById('facts').scrollIntoView({behavior:'instant',block:'center'})`);
await ready(`Number(document.getElementById('facts').dataset.revealRuns) > ${counterRuns}`);
check("counters replay after leaving and re-entering", await js(`Number(document.getElementById('facts').dataset.revealRuns) > ${counterRuns}`));
check("reveals use slower timing", await js(`document.querySelector('#facts .counter-digit').getAnimations().some(a=>a.effect.getTiming().duration === 1000)`));
await js(`scrollTo({top:0,behavior:'instant'})`);
await js(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
await ready(`document.getElementById('missionTitle').dataset.inView === 'false'`);
await js(`document.getElementById('missionTitle').scrollIntoView({behavior:'instant',block:'center'})`);
await ready(`Number(document.getElementById('missionTitle').dataset.revealRuns) >= 1`);
check("narrative text reveals on scroll", await js(`Number(document.getElementById('missionTitle').dataset.revealRuns) >= 1`));
const textRuns = await js(`Number(document.getElementById('missionTitle').dataset.revealRuns)`);
await js(`scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`);
await ready(`document.getElementById('missionTitle').dataset.inView === 'false'`);
await js(`document.getElementById('missionTitle').scrollIntoView({behavior:'instant',block:'center'})`);
await ready(`document.getElementById('missionTitle').dataset.inView === 'true'`);
check("upward scrolling does not replay text", await js(`Number(document.getElementById('missionTitle').dataset.revealRuns) === ${textRuns} && document.getElementById('missionTitle').getAnimations().length === 0`));
check("supporting text uses Lenis-reference Panchang", await js(`getComputedStyle(document.querySelector('.mission-intro p')).fontFamily.includes('Panchang')`));
check("primary buttons have orb details", await js(`!!document.querySelector('.btn-primary > .button-orb[aria-hidden=true]')`));
check("main navigation has sliding selection", await js(`!!document.querySelector('.main-nav .nav-slider') && !!document.querySelector('.main-nav [data-indicator][aria-current=page]')`));
check("evidence bars use clear red", await js(`getComputedStyle(document.querySelector('.evidence-row .bar i')).backgroundColor === 'rgb(242, 29, 56)'`));
check("Home evidence bars are rounded and source labels use Anton", await js(`getComputedStyle(document.querySelector('.evidence-row .bar')).borderRadius !== '0px' && getComputedStyle(document.querySelector('.evidence-row a')).fontFamily.includes('Anton')`));
await js(`document.fonts.ready`);
check("local display and body fonts loaded", await js(`document.fonts.check('400 48px Anton') && document.fonts.check('400 16px Roboto') && document.fonts.check('600 32px Panchang')`));
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await page("index.html", 700);
await ready(`document.querySelector('#facts dd')`);
await js(`document.getElementById('missionEvidence').scrollIntoView({behavior:'instant',block:'center'})`);
await ready(`document.querySelector('.evidence-row')`);
check("reduced motion uses final static values", await js(`!document.documentElement.classList.contains('lenis') && document.getElementById('facts').dataset.revealed === 'true' && document.getElementById('missionEvidence').dataset.revealed === 'true' && !document.getAnimations().some(a=>a.effect?.target?.closest('#facts,#missionEvidence'))`));

function finish() {
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
  if (!c.ok) failed++;
}
for (const e of errors) console.log(`FAIL  JavaScript error: ${e}`);
ws.close();
chrome.kill();
process.exit(failed || errors.length ? 1 : 0);
}
finish();
