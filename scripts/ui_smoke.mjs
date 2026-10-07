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

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); };

await send("Runtime.enable");
await send("Page.navigate", { url: `${BASE}/finder.html#target=jezero_crater` });
await sleep(12000);
check("ranked sites listed", (await js(`document.querySelectorAll('.site').length`)) >= 5);
check("status pill shows AUC", /AUC/.test(await js(`document.getElementById('statusPill').textContent`)));
check("legend rendered", !!(await js(`document.querySelector('#legend .ramp')`)));
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
const xy = await js(`(() => { const r = document.querySelector('.info-card .ic-close').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
  await send("Input.dispatchMouseEvent", { type, x: xy[0], y: xy[1], button: "left", clickCount: 1 });
}
await sleep(400);
check("the card's close button closes it", !(await js(`!!document.querySelector('.info-card')`)));
await js(`document.querySelector('.site').click()`);
await sleep(800);
await js(`document.getElementById('tabExplore').click()`);
await sleep(2500);
check("explore scatter drawn", (await js(`document.querySelectorAll('.scatter [data-i]').length`)) > 5);
await js(`document.getElementById('tabValidation').click()`);
await sleep(4000);
check("validation controls table", (await js(`document.querySelectorAll('#validation table.controls tbody tr').length`)) > 5);
const escape = () => send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await js(`document.getElementById('tabResults').click()`);
await js(`document.getElementById('helpButton').click()`);
await sleep(200);
check("Help menu lists its 4 items", (await js(`document.getElementById('helpMenu').hidden ? 0 : document.querySelectorAll('#helpMenu [role=menuitem]').length`)) === 4);
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
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(300);
check("Esc closes the controls guide first", (await js(`document.getElementById('geGuide').hidden`)) && !(await js(`document.getElementById('godseye').hidden`)));
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
for (let i = 0; i < 10 && !(await js(`document.getElementById('godseye').hidden`)); i++) await sleep(300);
check("a second Esc closes God's Eye", await js(`document.getElementById('godseye').hidden`));

// Links between pages and into the Finder.
const page = async (path, wait) => {
  await send("Page.navigate", { url: "about:blank" });
  await sleep(200);
  await send("Page.navigate", { url: `${BASE}/${path}` });
  await sleep(wait);
};
const checked = `document.querySelector('.target-card[aria-checked=true] strong')?.textContent`;
await page("finder.html", 12000);
check("the Finder opens without a target in the link", (await js(`document.querySelectorAll('.site').length`)) >= 5);
await page("finder.html#target=moon", 12000);
check("#target=moon opens the lunar south pole", (await js(checked)) === "Lunar South Pole");
await page("finder.html#target=custom", 12000);
check("#target=custom opens the custom profile", (await js(checked)) === "Your own profile");
await page("index.html", 3000);
check("home links to the targets page", !!(await js(`document.querySelector('a.btn-primary[href="targets.html"]')`)));
await page("targets.html", 3000);
check("target cards are keyboard links", (await js(`document.querySelectorAll('a.dest-card[href^="finder.html#target="]').length`)) >= 6);

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
  if (!c.ok) failed++;
}
for (const e of errors) console.log(`FAIL  JavaScript error: ${e}`);
ws.close();
chrome.kill();
process.exit(failed || errors.length ? 1 : 0);
