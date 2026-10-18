// Reproducible desktop/mobile evidence for the static frontend. No npm dependencies.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const base = process.argv[2] || "http://127.0.0.1:8000";
const out = resolve("artifacts/frontend");
mkdirSync(out, { recursive: true });
const chrome = spawn(process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--remote-debugging-port=9449", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "tn-design-"))}`, "about:blank",
], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  let pages;
  for (let i = 0; i < 60; i++) {
    try { pages = await (await fetch("http://127.0.0.1:9449/json")).json(); break; } catch { await sleep(250); }
  }
  if (!pages) throw new Error("Chrome did not start");
  ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map(), errors = [], report = [];
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Fetch.requestPaused") send("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "Failed" }).catch(() => {});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, 45000);
    pending.set(key, message => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const js = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const ready = async expression => {
    for (let i = 0; i < 100; i++) { if (await js(expression)) return; await sleep(300); }
    throw new Error(`Page did not become ready: ${expression}`);
  };
  const screenshot = async name => writeFileSync(join(out, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  const measure = async name => {
    const result = await js(`({width:innerWidth, scrollWidth:document.documentElement.scrollWidth, heading:document.querySelector('h1,h2')?.textContent, brokenImages:[...document.images].filter(i=>i.getClientRects().length&&i.complete&&!i.naturalWidth).map(i=>i.src)})`);
    report.push({ name, ...result });
    if (result.scrollWidth > result.width || result.brokenImages.length) throw new Error(`Layout failed: ${name}: ${JSON.stringify(result)}`);
  };
  await send("Runtime.enable");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  for (const [device, width, height] of [["desktop", 1440, 960], ["mobile", 390, 844]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: device === "mobile" });
    for (const [name, path, condition] of [
      ["home", "index.html", "document.querySelector('#facts dd')"],
      ["targets", "targets.html", "document.querySelectorAll('a.dest-card').length >= 6"],
      ["finder", "finder.html#target=jezero_crater", "document.querySelectorAll('.site').length >= 5"],
    ]) {
      if (process.argv[3] && process.argv[3] !== name) continue;
      // Force a fresh document even when consecutive device runs use the same hash URL.
      await send("Page.navigate", { url: "about:blank" });
      await ready("location.href === 'about:blank'");
      await send("Page.navigate", { url: `${base}/${path}` });
      await ready(condition);
      await js("document.fonts.ready");
      await sleep(1000);
      await measure(`${device}-${name}`);
      if (name === "finder") {
        await ready("document.getElementById('godseye').hidden && document.getElementById('loading').classList.contains('done')");
        await sleep(450);
      }
      if (name === "finder") {
        const clear = await js("document.querySelector('.tool-group:has(#layer)').getBoundingClientRect().right < document.querySelector('.zoom-controls').getBoundingClientRect().left");
        report.push({ name: `${device}-map-controls`, zoomClearOfToolbar: clear });
        if (!clear) throw new Error("Map toolbar overlaps zoom controls");
      }
      const navigation = await js(`(() => {
        const link = document.querySelector('.main-nav a:not([aria-current])');
        link.focus();
        const followsFocus = link.hasAttribute('data-indicator');
        link.blur();
        return { followsFocus, restored: document.querySelector('.main-nav [aria-current]').hasAttribute('data-indicator'), slider: !!document.querySelector('.nav-slider'), documentFocus: document.hasFocus(), transition: CSS.supports('selector(:active-view-transition)') && document.documentElement.matches(':active-view-transition') };
      })()`);
      if (!navigation.followsFocus || !navigation.restored) throw new Error(`Navigation slider focus failed: ${JSON.stringify(navigation)}`);
      await sleep(350);
      await screenshot(`${device}-${name}`);
      if (name === "finder") {
        for (const [trigger, panel, label] of [["statusPill", "statusPanel", "status"], ["helpButton", "helpMenu", "help"]]) {
          await js(`document.getElementById('${trigger}').click()`);
          await ready(`!document.getElementById('${panel}').hidden`);
          await sleep(300);
          const inside = await js(`(() => {const r=document.getElementById('${panel}').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight})()`);
          if (!inside) throw new Error(`${device} ${label} disclosure escapes viewport`);
          await screenshot(`${device}-${label}-disclosure`);
          await js(`document.querySelector('#${panel} .disclosure-close').click()`);
        }
        await js("document.querySelector('#layer + .wm-select summary').click()");
        await ready("document.querySelector('#layer + .wm-select .disclosure-options').matches(':popover-open')");
        await sleep(300);
        await screenshot(`${device}-layer-disclosure`);
        await js("document.querySelector('#layer + .wm-select .disclosure-close').click()");
        await js("document.getElementById('knownToggle').click()");
        await ready("document.getElementById('knownToggle').getAnimations().length === 0");
        await screenshot(`${device}-save-toggle`);
        await js("document.getElementById('knownToggle').click()");
        await ready("document.getElementById('knownToggle').getAnimations().length === 0");
      }
      if (name === "home") {
        await js("document.getElementById('facts').scrollIntoView({behavior:'instant',block:'center'})");
        await ready("document.getElementById('facts').dataset.revealed === 'true'");
        await sleep(1400);
        await screenshot(`${device}-mission`);
        await js("document.getElementById('missionEvidence').scrollIntoView({behavior:'instant',block:'center'})");
        await ready("document.querySelector('.evidence-row')");
        await sleep(1700);
        await screenshot(`${device}-evidence`);
        await js("scrollTo(0,0)");
      }
      if (name === "finder") {
        await js("document.querySelector('.site').click()");
        await ready("document.querySelector('#detail h3')");
        await sleep(1200);
        await screenshot(`${device}-detail`);
        await js("localStorage.setItem('tn-ge-guide','1'); document.querySelector('.info-card [data-act=eye]').click()");
        await ready("document.getElementById('geLoading').hidden");
        await sleep(1200);
        await screenshot(`${device}-terrain`);
        report.push({ name: `${device}-terrain`, error: await js("document.getElementById('geError').hidden ? null : document.getElementById('geError').textContent") });
        await js("document.getElementById('geClose').click()");
        await ready("document.getElementById('godseye').hidden");
        const requestsBefore = await js("performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/site3d?')).length");
        const openedAt = performance.now();
        await js("document.querySelector('.info-card [data-act=eye]').click()");
        await ready("['ready','error'].includes(document.getElementById('godseye').dataset.status)");
        const requestsAfter = await js("performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/site3d?')).length");
        report.push({ name: `${device}-terrain-reopen`, readyWithinMs: Math.round(performance.now() - openedAt), terrainRequestsBefore: requestsBefore, terrainRequestsAfter: requestsAfter });
        if (await js("document.getElementById('godseye').dataset.status === 'ready'") && requestsAfter !== requestsBefore) throw new Error("Reopening fetched terrain again");
      }
    }
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: `${base}/index.html` });
  await ready("document.querySelector('#facts dd')");
  report.push({ name: "reduced-motion", smoothScrollDisabled: await js("!document.documentElement.classList.contains('lenis')") });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/health", requestStage: "Request" }] });
  await send("Page.navigate", { url: `${base}/index.html` });
  await ready("document.getElementById('factsRetry')");
  await js("document.getElementById('facts').scrollIntoView({behavior:'instant',block:'center'})");
  await screenshot("mobile-facts-error");
  await send("Fetch.disable");
  await js("document.getElementById('factsRetry').click()");
  await ready("document.querySelector('#facts dd') && !document.getElementById('factsRetry')");
  report.push({ name: "facts-fetch-failure", unavailableAndRetryVerified: true });
  writeFileSync(join(out, process.argv[3] ? `report-${process.argv[3]}.json` : "report.json"), JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors, screenshots: out }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { ws?.close(); chrome.kill(); }
