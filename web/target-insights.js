// Interactive layer of the Target tab:
//  1. click a condition -> the globe repaints that condition across Earth
//  2. each Earth-range bar also marks the #1 Earth match and a familiar place
//  3. the elimination funnel: watch Earth narrow down, one condition at a time
// All numbers come from the API (/api/cell, /api/funnel); nothing is computed here.

const PLACES = [
  { id: "dhaka", name: "Dhaka", lat: 23.81, lon: 90.41 },
  { id: "london", name: "London", lat: 51.51, lon: -0.13 },
  { id: "newyork", name: "New York", lat: 40.71, lon: -74.0 },
  { id: "sahara", name: "Sahara (Tamanrasset)", lat: 22.79, lon: 5.53 },
  { id: "atacama", name: "Atacama Desert", lat: -23.86, lon: -69.13 },
  { id: "iceland", name: "Iceland highlands", lat: 64.8, lon: -17.5 },
];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let deps = null;
let funnelRun = 0;
let pinOn = false;            // the "place you know" pin is shown after the first pick
let placeCache = null;        // { id, values }

function pinFor(place, values) {
  const key = deps.currentLayer();
  const c = key !== "score" ? deps.criterion(key) : null;
  const v = c ? values?.[key] : null;
  return { lat: place.lat, lon: place.lon, name: place.name, value: v != null ? deps.fmtValue(v, c.unit) : "" };
}

function savedPlace() {
  try { return localStorage.getItem("tn-place") || "dhaka"; } catch { return "dhaka"; }
}
function savePlace(id) { try { localStorage.setItem("tn-place", id); } catch { /* private mode */ } }

/* ------------------------------------------------ 1. condition -> globe */

export function syncActiveLayer(layerKey) {
  const root = document.getElementById("targetDetail");
  if (!root) return;
  root.querySelectorAll("[data-layer]").forEach((el) => el.classList.toggle("is-active", el.dataset.layer === layerKey));
  const back = root.querySelector(".ti-back");
  if (back) back.hidden = layerKey === "score";
  if (pinOn && deps && placeCache) {
    const place = PLACES.find((p) => p.id === placeCache.id);
    if (place) deps.setPlacePin(pinFor(place, placeCache.values), false);
  }
}

/* ------------------------------------------------ 2. comparison markers */

async function cellValues(lat, lon) {
  try { return (await deps.api(`/api/cell?lat=${lat}&lon=${lon}`)).values; } catch { return null; }
}

function mark(bar, cls, value, lo, hi, title) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
  const pos = hi > lo ? Math.max(0, Math.min(1, (value - lo) / (hi - lo))) : 0.5;
  const el = document.createElement("i");
  el.className = cls;
  el.style.left = `${(pos * 100).toFixed(1)}%`;
  el.title = title;
  bar.appendChild(el);
}

export async function refreshComparison() {
  const root = document.getElementById("targetDetail");
  if (!deps || !root || !root.querySelector(".pf-list")) return;
  const top = deps.topResult();
  const place = PLACES.find((p) => p.id === savedPlace()) || PLACES[0];
  const [matchVals, placeVals] = await Promise.all([
    top ? cellValues(top.lat, top.lon) : null,
    cellValues(place.lat, place.lon),
  ]);
  placeCache = { id: place.id, values: placeVals };
  if (pinOn) deps.setPlacePin(pinFor(place, placeVals), false);
  if (!root.isConnected) return;
  root.querySelectorAll(".pf-row[data-key]").forEach((row) => {
    const bar = row.querySelector(".pf-bar"), key = row.dataset.key;
    if (!bar) return;
    bar.querySelectorAll(".ti-match, .ti-place").forEach((n) => n.remove());
    const c = deps.criterion(key), lo = Number(c.earth_min), hi = Number(c.earth_max);
    const mv = matchVals?.[key], pv = placeVals?.[key];
    mark(bar, "ti-match", mv, lo, hi, top ? `${top.label.text}: ${deps.fmtValue(mv, c.unit)}` : "");
    mark(bar, "ti-place", pv, lo, hi, `${place.name}: ${deps.fmtValue(pv, c.unit)}`);
    const read = row.querySelector(".ti-readout");
    if (read) {
      read.innerHTML = [
        top && mv != null ? `<span><i class="k-match"></i>${deps.esc(top.label.text)} <b>${deps.esc(deps.fmtValue(mv, c.unit))}</b></span>` : "",
        pv != null ? `<span><i class="k-place"></i>${deps.esc(place.name)} <b>${deps.esc(deps.fmtValue(pv, c.unit))}</b></span>` : "",
      ].join("");
    }
  });
  const key = root.querySelector(".ti-key-match");
  if (key) key.textContent = top ? `#1 match: ${top.label.text}` : "#1 match";
}

/* ------------------------------------------------ 3. elimination funnel */

function funnelImage(level, k) {
  const img = new ImageData(720, 360), px = img.data;
  for (let i = 0; i < level.length; i++) {
    const v = level[i];
    if (!Number.isFinite(v)) continue;
    const o = i * 4;
    if (v >= k) { px[o] = 255; px[o + 1] = 60; px[o + 2] = 82; px[o + 3] = 235; }
    else { px[o] = 8; px[o + 1] = 8; px[o + 2] = 12; px[o + 3] = 150; }
  }
  return img;
}

async function playFunnel(box) {
  const run = ++funnelRun;
  const btn = box.querySelector(".ti-play"), list = box.querySelector(".ti-steps"), cap = box.querySelector(".ti-caption");
  btn.disabled = true; btn.textContent = "Loading…";
  let data;
  try { data = await deps.api(`/api/funnel?${deps.funnelQuery()}`); }
  catch (err) { btn.disabled = false; btn.textContent = "Try again"; cap.textContent = `Could not load: ${err.message}`; return; }
  if (run !== funnelRun) return;
  const level = deps.decode(data.level);
  const steps = [{ label: "All land on Earth", remaining: data.total }, ...data.steps.map((s) => ({ ...s, label: deps.criterion(s.key).label }))];
  list.innerHTML = steps.map((s, i) => `
    <li class="ti-step" data-i="${i}" hidden>
      <span class="ti-bar" style="--w:${Math.max(1.5, (s.remaining / data.total) * 100).toFixed(1)}%"></span>
      <span class="ti-step-label">${i ? `+ ${deps.esc(s.label)}` : deps.esc(s.label)}</span>
      <b class="num">${s.remaining.toLocaleString()}</b>
    </li>`).join("");
  box.classList.add("is-playing");
  deps.setLegend(`<div class="legend-title"><b>How Earth gets narrowed down</b></div>
    <div class="marks"><span><i class="mk minor"></i>still a candidate</span><span><i class="mk ti-out"></i>ruled out</span></div>
    <div class="note">A place stays in while it is close to the target (within a fifth of Earth's full range) on every condition switched on so far. Heaviest-weighted conditions go first.</div>`);
  btn.textContent = "Playing…";
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced.matches ? 0 : ms));
  for (let i = 0; i < steps.length; i++) {
    if (run !== funnelRun) return;
    deps.setOverlay(funnelImage(level, i));
    list.querySelector(`[data-i="${i}"]`).hidden = false;
    cap.innerHTML = i === 0
      ? `Every coloured cell is land we could score: <b>${data.total.toLocaleString()}</b> places, each about 55 km across.`
      : `Keep only places close to the target on <b>${deps.esc(steps[i].label.toLowerCase())}</b>: <b>${steps[i].remaining.toLocaleString()}</b> left.`;
    await wait(i === 0 ? 1600 : 1900);
  }
  if (run !== funnelRun) return;
  const last = steps[steps.length - 1].remaining;
  cap.innerHTML = last > 0
    ? `<b>${last.toLocaleString()}</b> places pass every condition. The ranking then orders all of Earth by the full weighted score, so the best of these lead the list.`
    : `No place on Earth passes every condition: this site is more extreme than anything here. The ranking still orders Earth by overall closeness, so the nearest places lead the list.`;
  btn.disabled = false; btn.textContent = "Play again";
  box.querySelector(".ti-restore").hidden = false;
}

/* ------------------------------------------------ wiring */

export function enhanceTargetDetail(d) {
  deps = d;
  const root = document.getElementById("targetDetail");
  if (!root || !root.querySelector(".tp-chips")) return;
  funnelRun++;   // stop any funnel still playing for a previous target

  root.querySelectorAll("[data-layer]").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("a, select, .ti-readout")) return;
    deps.showLayer(el.dataset.layer);
  }));
  root.querySelector(".ti-back")?.addEventListener("click", () => deps.showLayer("score"));
  syncActiveLayer(deps.currentLayer());

  const sel = root.querySelector(".ti-place-select");
  if (sel) {
    sel.innerHTML = PLACES.map((p) => `<option value="${p.id}">${deps.esc(p.name)}</option>`).join("");
    sel.value = savedPlace();
    const show = async () => {
      savePlace(sel.value);
      await refreshComparison();
      const place = PLACES.find((p) => p.id === sel.value);
      pinOn = true;
      deps.setPlacePin(pinFor(place, placeCache?.values), true);
    };
    sel.addEventListener("change", show);
    root.querySelector(".ti-show-place")?.addEventListener("click", show);
  }
  refreshComparison();

  const box = root.querySelector(".ti-funnel");
  if (box) {
    box.querySelector(".ti-play").addEventListener("click", () => playFunnel(box));
    box.querySelector(".ti-restore").addEventListener("click", () => {
      funnelRun++;
      box.classList.remove("is-playing");
      box.querySelector(".ti-steps").innerHTML = "";
      box.querySelector(".ti-caption").textContent = "";
      box.querySelector(".ti-restore").hidden = true;
      box.querySelector(".ti-play").textContent = "Watch it again";
      deps.restoreOverlay();
    });
  }
}
