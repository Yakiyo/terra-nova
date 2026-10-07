/* TerraNova - interface controller.
 * Every number shown comes from the API (src/compute); this file only renders. */

import { Globe, Twin } from "./globe.js";
import { GodsEye, SUN_PRESETS } from "./godseye.js";

import { FlatMap } from "./flatmap.js";
import { LAYER_RAMPS, cssGradient, paint, percentileOf, quantile, rampPosition, sortedFinite } from "./colors.js";
import { initStarfield } from "./starfield.js";
import { closeMenus, icon, menu, toast } from "./ui.js";

const starfield = initStarfield("starfield");

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtPct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const fmtInt = (n) => Number(n).toLocaleString("en-US");

const state = {
  health: null,
  targets: [],
  criteria: [],
  sources: null,
  analogs: null,
  targetId: null,
  weights: {},
  defaults: {},
  data: null,          // last /api/score payload
  field: null,         // Float32Array score field
  sorted: null,        // sorted finite scores
  layer: "score",
  layerField: null,    // {values, sorted, lo, hi, unit, label}
  view: "globe",
  selected: null,      // selected result row
  pick: null,          // clicked location
  card: null,          // result row shown in the small info card on the map
  request: 0,
  topK: 20,
  mode: "target",      // "target" or "custom"
  custom: null,        // {criteria: {key: number|null}, body: "moon"|"mars"|""}
  pins: [],            // up to 3 result rows pinned for comparison
  newOnly: true,       // discovery: hide sites near known analogs
  spreadKm: 800,       // discovery: minimum distance between results
  perCountry: 2,       // discovery: at most N results per country
  tolerance: 0,        // permissible error multiplier (0 = exact targets)
  robust: null,        // /api/robustness payload for the current ranking
  analogValues: null,  // predictor values of the known analog sites (Explore tab)
};
const MAX_PINS = 3;

const CUSTOM_ID = "__custom__";
/* Friendly names in links (finder.html#target=moon). */
const TARGET_ALIASES = { moon: "lunar_south_pole", mars: "jezero_crater" };

/* ----------------------------------------------------------------- helpers */

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch { /* not json */ }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json();
}

function decode(field) {
  const raw = atob(field.data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function spec(key) { return state.criteria.find((c) => c.key === key); }
function target() {
  if (state.mode === "custom") return customTarget();
  return state.targets.find((t) => t.id === state.targetId);
}

function customTarget() {
  const body = state.custom?.body || "";
  const criteria = {};
  for (const c of state.criteria) {
    const v = state.custom?.criteria[c.key];
    const eff = state.data?.effective_profile?.[c.key];
    criteria[c.key] = { value: v ?? null, effective_value: v == null ? null : (eff ?? v), dataset_id: "user_entered" };
  }
  return {
    id: CUSTOM_ID, name: "Custom target", short_name: "your custom target",
    body: body ? body.charAt(0).toUpperCase() + body.slice(1) : "Custom",
    summary: "A target profile you entered by hand.", criteria, source_url: "", trek_url: null,
  };
}

/* The request body shared by /api/score and /api/explain. */
function scoreRequest(extra = {}) {
  const base = state.mode === "custom"
    ? { criteria: state.custom.criteria, body: state.custom.body || null }
    : { target_id: state.targetId };
  return {
    ...base,
    weights: state.weights,
    min_separation_cells: 3,
    new_only: state.newOnly,
    min_distance_km: state.spreadKm,
    max_per_country: state.perCountry,
    tolerance: state.tolerance,
    ...extra,
  };
}

function fmtValue(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "no data";
  const abs = Math.abs(value);
  const text = abs >= 100 ? fmtInt(Math.round(value)) : abs >= 10 ? value.toFixed(1) : value.toFixed(2);
  if (unit === "NDVI") return `NDVI ${text}`;
  if (unit === "degrees") return `${text}°`;
  return `${text} ${unit}`;
}

/* "top 3.2%" wording for a percentile; never claims 0% or 100%. */
function topShare(percentile) {
  const top = 100 - percentile;
  if (top < 0.1) return `in the <b>top 0.1%</b>`;
  if (top < 10) return `in the <b class="num">top ${top.toFixed(1)}%</b>`;
  return `in the <b class="num">top ${top.toFixed(0)}%</b>`;
}

function fmtCoord(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

const NOVELTY = {
  new: ["new", "New candidate"],
  near_known: ["near", "Near a known analog"],
  known: ["known", "Known analog"],
};
function noveltyChip(n) {
  const [cls, text] = NOVELTY[n.status] || ["", n.status];
  const title = `Nearest catalogued analog: ${n.nearest_known} (${fmtInt(Math.round(n.distance_km))} km)`;
  return `<span class="novelty ${cls}" title="${esc(title)}">${text}</span>`;
}

/* --------------------------------------------------------------- the views */

const labels = $("labels");
const globe = new Globe($("globe"), { onPick: pickLocation, onHover: hover });
const flat = new FlatMap($("flatmap"), { onPick: pickLocation, onHover: hover });
let twin = null;
try { twin = new Twin($("twinCanvas")); } catch { $("twin").hidden = true; }

function activeView() { return state.view === "globe" ? globe : flat; }

function setView(view) {
  hidePeek();
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  $("globe").hidden = view !== "globe";
  $("flatmap").hidden = view !== "map";
  globe.visible = view === "globe";
  if (view === "map") {
    flat.draw();
    const focus = state.selected || state.pick;
    if (focus) flat.flyTo(focus.lat, focus.lon, 3);
  }
  renderMarkers();
}

/* ------------------------------------------------------------ hover + peek */

const stageEl = $("globe").parentElement;
const thumbCache = new Map();   // cell key -> {src, credit}
let dwell = null;
let peekToken = 0;

function cellOf(lat, lon) {
  const row = Math.min(359, Math.max(0, Math.floor((90 - lat) / 0.5)));
  const col = Math.min(719, Math.max(0, Math.floor((lon + 180) / 0.5)));
  return { row, col, lat: 90 - (row + 0.5) * 0.5, lon: -179.75 + col * 0.5, key: `${row}_${col}` };
}

/* Offline fallback: crop the local Blue Marble texture around the cell. */
function localCrop(lat, lon) {
  const img = flat.base;
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 204;
  const pxDeg = img.naturalWidth / 360;
  const sx = (lon - 1 + 180) * pxDeg;
  const sy = (90 - lat - 1) * pxDeg;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, 2 * pxDeg, 2 * pxDeg, 0, 0, 204, 204);
  return c.toDataURL("image/jpeg", 0.85);
}

async function thumbFor(cell) {
  if (thumbCache.has(cell.key)) return thumbCache.get(cell.key);
  let out;
  try {
    const res = await fetch(`/api/thumb?lat=${cell.lat}&lon=${cell.lon}`);
    if (!res.ok) throw new Error(String(res.status));
    out = { src: URL.createObjectURL(await res.blob()), credit: "NASA Blue Marble NG · GIBS · 2°×2°" };
  } catch {
    const src = localCrop(cell.lat, cell.lon);
    out = src ? { src, credit: "Offline preview · Blue Marble 10 km" } : null;
  }
  if (out) thumbCache.set(cell.key, out);
  return out;
}

function placeTip(tip, x, y) {
  const left = x + 16 + tip.offsetWidth > stageEl.clientWidth - 8 ? x - tip.offsetWidth - 16 : x + 16;
  const top = Math.min(Math.max(8, y - 20), stageEl.clientHeight - tip.offsetHeight - 8);
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${top}px`;
}

/* The preview card: satellite image of the cell plus a few facts. */
async function showPeek(lat, lon, x, y, html) {
  const tip = $("tooltip");
  const token = ++peekToken;
  const cell = cellOf(lat, lon);
  tip.classList.add("peek");
  tip.innerHTML = `<div class="peek-img loading"><i class="cellbox"></i></div>${html}`;
  tip.hidden = false;
  placeTip(tip, x, y);
  const thumb = await thumbFor(cell);
  if (token !== peekToken || tip.hidden) return;
  const box = tip.querySelector(".peek-img");
  box.classList.remove("loading");
  if (thumb) {
    const img = new Image();
    img.alt = `Satellite view around ${fmtCoord(cell.lat, cell.lon)}`;
    img.src = thumb.src;
    box.prepend(img);
    box.insertAdjacentHTML("beforeend", `<span class="src">${esc(thumb.credit)}</span>`);
  }
}

function hidePeek() {
  peekToken++;
  clearTimeout(dwell);
  const tip = $("tooltip");
  tip.hidden = true;
  tip.classList.remove("peek");
}

function cellFacts(lat, lon) {
  const values = state.layer === "score" ? state.field : state.layerField?.values;
  if (!values) return null;
  const cell = cellOf(lat, lon);
  const v = values[cell.row * 720 + cell.col];
  if (!Number.isFinite(v)) return `<div class="t-sub">${fmtCoord(lat, lon)}</div><div class="t-sub">Not scored (ocean, data gap or &lt;50% land)</div>`;
  if (state.layer === "score") {
    const p = percentileOf(state.sorted, v);
    return `<div class="t-sub">${fmtCoord(lat, lon)}</div><div class="t-title">${fmtPct(v)} match</div>
      <div class="t-sub">better than ${p.toFixed(0)}% of land · click for details</div>`;
  }
  const f = state.layerField;
  return `<div class="t-sub">${fmtCoord(lat, lon)}</div><div class="t-title">${esc(fmtValue(v, f.unit))}</div><div class="t-sub">${esc(f.label)}</div>`;
}

function hover(hit, x, y) {
  clearTimeout(dwell);
  const tip = $("tooltip");
  const facts = hit && cellFacts(hit.lat, hit.lon);
  if (!facts) { hidePeek(); return; }
  const cell = cellOf(hit.lat, hit.lon);
  // Already showing this cell: just follow the cursor.
  if (!tip.hidden && tip.dataset.cell === cell.key) { placeTip(tip, x, y); return; }
  peekToken++;
  tip.classList.remove("peek");
  tip.dataset.cell = cell.key;
  tip.innerHTML = facts;
  tip.hidden = false;
  placeTip(tip, x, y);
  // Rest on a scored cell for a moment and the satellite preview appears.
  const values = state.layer === "score" ? state.field : state.layerField?.values;
  if (Number.isFinite(values[cell.row * 720 + cell.col])) {
    dwell = setTimeout(() => showPeek(hit.lat, hit.lon, x, y, facts), 450);
  }
}

function markerPeek(el, lat, lon, html) {
  el.addEventListener("mouseenter", () => {
    const r = el.getBoundingClientRect();
    const s = stageEl.getBoundingClientRect();
    $("tooltip").dataset.cell = "";
    showPeek(lat, lon, r.left + r.width / 2 - s.left, r.top + r.height / 2 - s.top, html);
  });
  el.addEventListener("mouseleave", hidePeek);
  el.addEventListener("focus", () => el.dispatchEvent(new Event("mouseenter")));
  el.addEventListener("blur", hidePeek);
}

function resultPeekHtml(r) {
  return `<div class="t-row"><span class="t-title">#${r.rank} ${esc(r.label.text)}</span></div>
    <div class="t-row"><span class="t-sub">${fmtCoord(r.lat, r.lon)}</span>${noveltyChip(r.novelty)}</div>
    <div class="t-row"><span class="t-title num">${fmtPct(r.score)} match</span><span class="t-sub">click to open</span></div>`;
}

const markerEls = new Map();   // result index -> marker element

let cardCache = null;   // {r, marker}: the open card survives marker rebuilds without replaying its entrance

function renderMarkers() {
  // Markers are rebuilt from state; remember which one had keyboard focus and give it back.
  const focusKey = document.activeElement?.closest?.("#labels [data-key]")?.dataset.key;
  labels.innerHTML = "";
  markerEls.clear();
  const markers = [];
  if ($("showKnown").checked && state.analogs) {
    const body = target()?.body.toLowerCase();
    for (const site of state.analogs.sites) {
      const el = document.createElement("div");
      el.className = "marker known";
      el.dataset.key = `known-${site.name}`;
      el.textContent = "🚀";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", `Known analog: ${site.name}`);
      el.tabIndex = 0;
      // Analogs of the other body are dimmed.
      if (body && !site.bodies.includes(body)) el.classList.add("other");
      markerPeek(el, site.lat, site.lon, `<div class="t-title">${esc(site.name)}</div>
        <div class="t-sub">Known ${esc(site.bodies.join(" & "))} analog · ${esc(site.kind)}</div>
        <div class="t-sub">${esc(site.use)}</div>`);
      labels.appendChild(el);
      markers.push({ lat: site.lat, lon: site.lon, el });
    }
  }
  if (state.data) {
    for (const r of state.data.results) {
      const el = document.createElement("button");
      el.type = "button";
      const active = state.selected && state.selected.index === r.index;
      const pinned = state.pins.some((x) => x.index === r.index);
      el.className = "marker" + (active ? " active" : "") + (r.rank > 10 && !active ? " minor" : "") + (pinned ? " pinned" : "");
      el.textContent = r.rank;
      el.dataset.key = `site-${r.index}`;
      el.setAttribute("aria-label", `#${r.rank} ${r.label.text}, ${fmtPct(r.score)} match`);
      el.addEventListener("click", () => { hidePeek(); selectResult(r); });
      markerPeek(el, r.lat, r.lon, resultPeekHtml(r));
      markerEls.set(r.index, el);
      labels.appendChild(el);
      markers.push({ lat: r.lat, lon: r.lon, el });
    }
  }
  if (state.pick) {
    const el = document.createElement("div");
    el.className = "marker pick";
    el.setAttribute("aria-hidden", "true");
    labels.appendChild(el);
    markers.push({ lat: state.pick.lat, lon: state.pick.lon, el });
  }
  if (state.card) {
    const fresh = cardCache?.r !== state.card;
    if (fresh) cardCache = { r: state.card, marker: infoCard(state.card) };
    labels.appendChild(cardCache.marker.el);
    markers.push(cardCache.marker);
    if (fresh && cardCache.r.index !== cardCache.shown) {
      cardCache.shown = cardCache.r.index;
      requestAnimationFrame(() => cardCache?.marker.el.focus({ preventScroll: true }));
    }
  } else {
    cardCache = null;
  }
  globe.setMarkers(state.view === "globe" ? markers : []);
  flat.setMarkers(state.view === "map" ? markers : []);
  if (focusKey) labels.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

/* A small card pinned to the clicked place: the essentials, and a way into God's Eye. */
function infoCard(r) {
  const el = document.createElement("div");
  el.className = "info-card";
  el.tabIndex = -1;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `${r.label.text}: ${fmtPct(r.score)} match`);
  const t = target();
  const polar = Math.abs(r.lat) > 84;
  el.innerHTML = `
    <button class="icon-button ic-close" type="button" aria-label="Close the card">${icon("x")}</button>
    <div class="ic-img"><i class="cellbox"></i></div>
    <div class="ic-body">
      <div class="ic-title">${r.rank ? `<span class="num">#${r.rank}</span> ` : ""}${esc(r.label.text)}</div>
      <div class="ic-sub num">${fmtCoord(r.lat, r.lon)}</div>
      <div class="ic-score"><b class="num">${(r.score * 100).toFixed(0)}%</b>
        <span>match to ${esc(t?.short_name || "your profile")}, ${topShare(r.percentile)} of land</span></div>
      <div class="ic-chips">${noveltyChip(r.novelty)}</div>
    </div>
    <div class="ic-actions">
      <button class="godseye-button small" type="button" data-act="eye" ${polar ? "disabled title=\"Elevation tiles stop at about 84 degrees latitude\"" : ""}>
        ${icon("cube-focus")}God's Eye 3D</button>
      <button class="ghost small" type="button" data-act="more">Details</button>
    </div>`;
  el.querySelector(".ic-close").addEventListener("click", closeCard);
  el.querySelector("[data-act=eye]").addEventListener("click", () => openGodsEye(r));
  el.querySelector("[data-act=more]").addEventListener("click", () => {
    if (ui.sidebar === false) setUi("sidebar", true);
    selectTab("results");
    $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  for (const type of ["pointerdown", "wheel", "dblclick"]) el.addEventListener(type, (e) => e.stopPropagation());
  thumbFor(cellOf(r.lat, r.lon)).then((thumb) => {
    const box = el.querySelector(".ic-img");
    if (!thumb || !box) return;
    const img = new Image();
    img.alt = `Satellite view around ${fmtCoord(r.lat, r.lon)}`;
    img.src = thumb.src;
    box.prepend(img);
  });
  // Sit above the point, but stay inside the stage.
  const onPlace = (x, y, w, h) => {
    const cw = el.offsetWidth, ch = el.offsetHeight;
    const tx = Math.min(Math.max(-cw / 2, 8 - x), w - 8 - x - cw);
    const above = y - ch - 18 > 8;
    const ty = above ? -ch - 18 : Math.min(18, h - 8 - y - ch);
    el.style.transform = `translate(${tx}px, ${ty}px)`;
    el.classList.toggle("below", !above);
  };
  return { lat: r.lat, lon: r.lon, el, onPlace };
}

let cardReturnFocus = null;

function showCard(r) {
  const fresh = state.card?.index !== r.index;
  if (fresh && !document.activeElement?.closest?.(".info-card")) cardReturnFocus = document.activeElement;
  state.card = r;
  renderMarkers();
}

function closeCard() {
  state.card = null;
  renderMarkers();
  if (cardReturnFocus?.isConnected) cardReturnFocus.focus({ preventScroll: true });
  cardReturnFocus = null;
}

/* ------------------------------------------------------------------ layers */

function paintLayer() {
  let image;
  if (state.layer === "score") {
    if (!state.field) return;
    image = paint(state.field, 720, 360, "score", { sorted: state.sorted, floor: 0.5 });
    const q = (p) => quantile(state.sorted, p);
    // The ramp runs linearly from the 50th to the 100th percentile of land cells,
    // so "top 10%" sits at 80% of its width and "top 1%" at 98%.
    $("legend").innerHTML = `
      ${legendTitle(`Analog score · ${target()?.short_name || "custom profile"}`)}
      <div class="ramp" style="background:${cssGradient("score")}"></div>
      <div class="scale abs num"><span style="left:0">top 50%</span><span style="left:80%">top 10%</span><span style="left:98%">1%</span></div>
      ${histogram()}
      <div class="marks"><span><i class="mk top">3</i>top 10</span><span><i class="mk minor"></i>rank 11 and below</span><span><i class="mk known" aria-hidden="true">🚀</i>known analog</span></div>
      <div class="note">Brighter = closer match; uncoloured land is in the bottom half. Bars: how many land cells
        reach each score (orange = top 10%, at least ${fmtPct(q(0.9))}).</div>
      <div class="credit-line">Earth: <a href="${esc(state.sources.basemaps.earth.url)}" target="_blank" rel="noopener">${esc(state.sources.basemaps.earth.credit)}</a></div>`;
  } else {
    const f = state.layerField;
    if (!f) return;
    const look = LAYER_RAMPS[state.layer] || { ramp: "precipitation" };
    image = paint(f.values, 720, 360, "predictor", { lo: f.lo, hi: f.hi, ramp: look.ramp, center: look.center });
    // With a centred (diverging) ramp, the ends are symmetric about the centre value.
    const half = look.center === undefined ? null : Math.max(Math.abs(f.lo - look.center), Math.abs(f.hi - look.center));
    const lo = half === null ? f.lo : look.center - half;
    const hi = half === null ? f.hi : look.center + half;
    const mid = look.center === undefined ? "" : `<span style="left:${(rampPosition(look.center, lo, hi, look.center) * 100).toFixed(0)}%">${esc(fmtValue(look.center, f.unit))}</span>`;
    $("legend").innerHTML = `
      ${legendTitle(f.label)}
      <div class="ramp" style="background:${cssGradient(look.ramp)}"></div>
      <div class="scale abs num"><span style="left:0">${esc(fmtValue(lo, f.unit))}</span>${mid}<span style="left:100%">${esc(fmtValue(hi, f.unit))}</span></div>
      <div class="note">Raw Earth data behind the score; colours stop at the range covering 99% of land.
        Source:
        <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.dataset)}</a></div>`;
  }
  globe.setOverlay(image);
  flat.setOverlay(image);
  $("legend").classList.toggle("collapsed", ui.legend === false);
  $("legend").querySelector(".box-toggle").addEventListener("click", () => setUi("legend", ui.legend === false));
}

/* ----------------------------------------------------- collapsible chrome */

// Which parts of the interface are open; remembered per browser (best effort).
const ui = (() => { try { return JSON.parse(localStorage.getItem("eaf-ui") || "{}"); } catch { return {}; } })();

function legendTitle(text) {
  const open = ui.legend !== false;
  return `<div class="title legend-head"><span>${esc(text)}</span>
    <button class="box-toggle" type="button" aria-expanded="${open}" aria-label="${open ? "Hide" : "Show"} the legend">${icon("caret-down")}</button></div>`;
}

function setUi(key, value) {
  ui[key] = value;
  try { localStorage.setItem("eaf-ui", JSON.stringify(ui)); } catch { /* storage unavailable */ }
  applyUi();
}

function applyUi() {
  const sidebar = ui.sidebar !== false;
  document.body.classList.toggle("hide-sidebar", !sidebar);
  const ts = $("toggleSidebar");
  if (ts) {
    ts.setAttribute("aria-expanded", String(sidebar));
    ts.setAttribute("aria-label", `${sidebar ? "Hide" : "Show"} the sidebar`);
  }
  const twinOpen = ui.twin !== false;
  $("twin").classList.toggle("collapsed", !twinOpen);
  $("twinToggle").setAttribute("aria-expanded", String(twinOpen));
  $("twinToggle").setAttribute("aria-label", `${twinOpen ? "Hide" : "Show"} the target globe`);
  twin?.setPaused(!twinOpen || eye?.open);
  const legend = $("legend");
  legend.classList.toggle("collapsed", ui.legend === false);
  const lt = legend.querySelector(".box-toggle");
  if (lt) {
    lt.setAttribute("aria-expanded", String(ui.legend !== false));
  }
  document.querySelectorAll("[data-fold]").forEach((b) => {
    const open = ui[`fold_${b.dataset.fold}`] !== false;
    b.setAttribute("aria-expanded", String(open));
    b.closest(".block").classList.toggle("collapsed", !open);
  });
}

function wireUi() {
  const ts = $("toggleSidebar");
  if (ts) ts.addEventListener("click", () => setUi("sidebar", ui.sidebar === false));
  $("twinToggle").addEventListener("click", () => setUi("twin", ui.twin === false));
  document.querySelectorAll("[data-fold]").forEach((b) => b.addEventListener("click", () => {
    const key = `fold_${b.dataset.fold}`;
    setUi(key, ui[key] === false);
  }));
  applyUi();
}

/* Score distribution of land cells, 24 bins; top-10% bins in the accent colour. */
function histogram() {
  const all = state.sorted;
  if (!all?.length) return "";
  // Cells vetoed to 0% by one fully mismatched criterion are counted, not drawn,
  // so they do not flatten every other bar.
  const firstNonZero = all.findIndex((v) => v > 0);
  const s = firstNonZero < 0 ? all : all.subarray(firstNonZero);
  const zero = firstNonZero < 0 ? 0 : firstNonZero;
  const lo = s[0];
  const hi = s[s.length - 1];
  const bins = new Array(24).fill(0);
  for (const v of s) bins[Math.min(23, Math.floor(((v - lo) / (hi - lo || 1)) * 24))]++;
  const top = quantile(s, 0.9);
  const max = Math.max(...bins);
  const bars = bins.map((n, i) => {
    const edge = lo + ((i + 1) / 24) * (hi - lo);
    return `<i class="${edge > top ? "hot" : ""}" style="height:${Math.max(4, (n / max) * 100).toFixed(0)}%"></i>`;
  }).join("");
  return `<div class="hist" role="img" aria-label="Distribution of scores across ${fmtInt(s.length)} land cells, from ${fmtPct(lo)} to ${fmtPct(hi)}">${bars}</div>
    <div class="scale num"><span>${fmtPct(lo)}</span><span>${zero ? `+ ${fmtInt(zero)} cells at 0% (vetoed)` : ""}</span><span>${fmtPct(hi)}</span></div>`;
}

async function setLayer(key) {
  state.layer = key;
  if (key !== "score") {
    const s = spec(key);
    const payload = await api(`/api/predictor?key=${encodeURIComponent(key)}`);
    state.layerField = {
      values: decode(payload), lo: s.earth_min, hi: s.earth_max,
      unit: s.unit, label: s.label, dataset: s.dataset_id, url: s.source_url,
    };
  }
  paintLayer();
}

/* ----------------------------------------------------------------- targets */

function renderTargets() {
  const groups = [];
  for (const t of state.targets) {
    let g = groups.find((x) => x.name === t.group);
    if (!g) groups.push((g = { name: t.group, items: [] }));
    g.items.push(t);
  }
  const card = (t) => `
    <button class="target-card" role="radio" aria-checked="${state.mode === "target" && t.id === state.targetId}" data-id="${esc(t.id)}" type="button">
      <span class="planet" style="background-image:url(assets/${esc(t.body.toLowerCase())}_sm.jpg)"></span>
      <strong>${esc(t.short_name)}</strong>
      <small>${Math.abs(t.latitude).toFixed(1)}°${t.latitude >= 0 ? "N" : "S"} ${Math.abs(t.longitude).toFixed(1)}°${t.longitude >= 0 ? "E" : "W"}</small>
    </button>`;
  const html = groups.map((g) => `
    <p class="group-label">${esc(g.name)}</p>
    <div class="target-grid">${g.items.map(card).join("")}</div>`).join("") + `
    <p class="group-label">Your own</p>
    <div class="target-grid">
      <button class="target-card custom" role="radio" aria-checked="${state.mode === "custom"}" data-id="${CUSTOM_ID}" type="button">
        <span class="planet planet-custom" aria-hidden="true">${icon("sliders-horizontal")}</span>
        <strong>Your own profile</strong><small>type the values</small>
      </button>
    </div>`;
  $("targets").innerHTML = html;
  $("targets").querySelectorAll(".target-card").forEach((b) => b.addEventListener("click", () => chooseTarget(b.dataset.id)));
}

function renderTargetDetail() {
  if (state.mode === "custom") { renderCustomForm(); return; }
  const t = target();
  const rows = state.criteria.map((c) => {
    const m = t.criteria[c.key];
    if (m.value === null || m.value === undefined) {
      return `<tr class="unused"><th scope="row">${esc(c.label)}</th><td><span class="tag" title="${esc(m.definition_note || "")}">not used for this site</span></td></tr>`;
    }
    const off = (state.weights[c.key] ?? 0) === 0;
    let used = fmtValue(m.effective_value, c.unit);
    let note = "";
    if ("earth_percentile" in m) {
      const measured = m.measured_value === null || m.measured_value === undefined
        ? "qualitative" : `measured ${esc(fmtValue(m.measured_value, c.unit))} at ${esc(m.baseline || "a finer scale")}`;
      note = `<span class="note"><span class="tag" title="A judgement-call terrain class, not a measurement at this scale">estimated</span> Earth's ${m.earth_percentile}th percentile (${measured})</span>`;
    } else if (Math.abs(m.effective_value - m.value) > 1e-9) {
      note = `<span class="note">real value ${esc(fmtValue(m.value, c.unit))} lies outside the range of 99% of Earth's land; matched to that range's edge</span>`;
    }
    if (off) { used = `<span class="tag">not scored</span>`; note = ""; }
    return `<tr><th scope="row">${esc(c.label)}</th><td>${used}${note}</td></tr>`;
  }).join("");
  $("targetDetail").innerHTML = `
    <p>${esc(t.summary)}</p>
    <div class="target-links">
      <a href="${esc(t.source_url)}" target="_blank" rel="noopener">Source: ${esc(t.source_label || "reference")}</a>
      ${t.trek_url ? `<a href="${esc(t.trek_url)}" target="_blank" rel="noopener">Open NASA ${esc(t.body)} Trek ${icon("arrow-square-out")}</a>` : ""}
    </div>
    <p class="how">How matching works: every land cell on Earth is compared with <b>this site's
      signature</b>, the numbers below, measured on the ${esc(t.body)} by the cited missions. It is not a
      picture-to-picture comparison. Each criterion is scored 0–100% and combined with your weights.</p>
    ${t.location_note ? `<p class="hint">${esc(t.location_note)}</p>` : ""}
    <table class="profile"><caption>What Earth is matched against</caption>${rows}</table>`;
  const caption = $("twinCaption");
  caption.innerHTML = `<strong>${esc(t.short_name)}</strong>${esc(t.body)} target · ${fmtCoord(t.latitude, t.longitude)}
    <span class="twin-hint">Drag to rotate, double-click to reset</span>`;
  $("twin").hidden = !twin;
  if (twin) twin.show(t.body, t.latitude, t.longitude).catch(() => {});
}

/* ------------------------------------------------------------ custom target */

function startCustom() {
  // Start from whatever target was showing, so the numbers are sensible.
  const base = state.targets.find((t) => t.id === state.targetId) || state.targets[0];
  const criteria = {};
  for (const c of state.criteria) {
    const m = base.criteria[c.key];
    criteria[c.key] = m.value === null || m.value === undefined ? null : Number(m.effective_value);
  }
  state.custom = { criteria, body: base.body.toLowerCase() };
}

function renderCustomForm() {
  const rows = state.criteria.map((c) => {
    const v = state.custom.criteria[c.key];
    const on = v !== null && v !== undefined;
    return `<div class="manual-row">
      <label class="manual-use"><input type="checkbox" data-use="${esc(c.key)}" ${on ? "checked" : ""}>
        <span>${esc(c.label)}</span></label>
      <span class="manual-input"><input type="number" step="any" inputmode="decimal" data-val="${esc(c.key)}"
        value="${on ? v : ""}" ${on ? "" : "disabled"} aria-label="${esc(c.label)} target value">
        <span class="unit">${esc(c.unit === "1" ? "" : c.unit)}</span></span>
      <span class="range-hint">Earth: ${esc(fmtValue(c.earth_min, c.unit))} to ${esc(fmtValue(c.earth_max, c.unit))}</span>
    </div>`;
  }).join("");
  const body = state.custom.body;
  $("targetDetail").innerHTML = `
    <p>Type the conditions you want to find on Earth. Untick a criterion to leave it out.
      Values outside Earth's range are matched to Earth's nearest extreme, like the real targets.</p>
    <form class="manual" id="manualForm">
      ${rows}
      <label class="manual-body">Validate against known analogs for
        <select id="manualBody">
          <option value="moon" ${body === "moon" ? "selected" : ""}>Moon</option>
          <option value="mars" ${body === "mars" ? "selected" : ""}>Mars</option>
          <option value="" ${!body ? "selected" : ""}>no validation</option>
        </select></label>
      <div class="manual-actions">
        <button class="primary" type="submit">Score my target</button>
        <button class="ghost small" type="button" id="manualReset">Copy from a real target</button>
      </div>
      <p class="hint" id="manualError" role="alert"></p>
    </form>`;
  $("twin").hidden = true;
  const form = $("manualForm");
  form.querySelectorAll("[data-use]").forEach((box) => box.addEventListener("change", () => {
    const input = form.querySelector(`[data-val="${box.dataset.use}"]`);
    input.disabled = !box.checked;
    if (box.checked && input.value === "") input.focus();
  }));
  $("manualReset").addEventListener("click", () => { startCustom(); renderCustomForm(); });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const criteria = {};
    for (const c of state.criteria) {
      const on = form.querySelector(`[data-use="${c.key}"]`).checked;
      const raw = form.querySelector(`[data-val="${c.key}"]`).value.trim();
      if (!on) { criteria[c.key] = null; continue; }
      const v = Number(raw);
      if (raw === "" || !Number.isFinite(v)) {
        $("manualError").textContent = `Enter a number for ${c.label}, or untick it.`;
        return;
      }
      criteria[c.key] = v;
    }
    if (Object.values(criteria).every((v) => v === null)) {
      $("manualError").textContent = "Tick at least one criterion.";
      return;
    }
    $("manualError").textContent = "";
    state.custom = { criteria, body: $("manualBody").value };
    for (const c of state.criteria) {
      if (criteria[c.key] !== null && state.weights[c.key] === 0 && c.key !== "elevation") state.weights[c.key] = 1;
    }
    renderWeights();
    showList();
    runScore().then(() => {
      const top = state.data?.results[0];
      if (top && state.view === "globe") globe.flyTo(top.lat, top.lon);
    });
  });
}

function chooseTarget(id) {
  if (id === CUSTOM_ID) {
    if (state.mode === "custom") return;
    state.mode = "custom";
    startCustom();
    state.selected = null;
    state.pick = null;
    renderTargets();
    renderTargetDetail();
    renderWeights();
    return;   // scored when the form is submitted
  }
  if (id === state.targetId && state.mode === "target") return;
  if (state.pins.length) { state.pins = []; renderCompare(); }
  state.mode = "target";
  state.targetId = id;
  state.selected = null;
  state.pick = null;
  state.weights = { ...target().default_weights };
  renderTargets();
  renderTargetDetail();
  renderWeights();
  showList();
  runScore().then(() => {
    const top = state.data?.results[0];
    if (top && state.view === "globe") globe.flyTo(top.lat, top.lon);
  });
}

/* ----------------------------------------------------------------- weights */

function renderWeights() {
  const t = target();
  $("weights").innerHTML = state.criteria.map((c) => {
    const unused = t && (t.criteria[c.key]?.value === null || t.criteria[c.key]?.value === undefined);
    const w = unused ? 0 : state.weights[c.key];
    let sub = "";
    if (unused) sub = `<div class="sub">Not used for ${esc(t.short_name)}.</div>`;
    else if (c.key === "elevation") sub = `<div class="sub">Off by default: Moon and Mars heights use their own datums.</div>`;
    else if (c.key === "mean_annual_temperature" && w === 0) sub = `<div class="sub">Used by cold-trap targets.</div>`;
    return `<div class="weight ${w === 0 ? "off" : ""}" data-key="${esc(c.key)}">
      <label for="w_${esc(c.key)}" title="${esc(c.description)}"><span>${esc(c.label)}</span>
        <span class="val num" id="wv_${esc(c.key)}">${unused ? "n/a" : w === 0 ? "off" : `${w.toFixed(1)}×`}</span></label>
      <input type="range" id="w_${esc(c.key)}" min="0" max="3" step="0.1" value="${w}" ${unused ? "disabled" : ""}
        aria-describedby="wv_${esc(c.key)}">${sub}</div>`;
  }).join("");
  $("weights").querySelectorAll("input[type=range]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.id.slice(2);
      const w = parseFloat(input.value);
      state.weights[key] = w;
      $(`wv_${key}`).textContent = w === 0 ? "off" : `${w.toFixed(1)}×`;
      input.closest(".weight").classList.toggle("off", w === 0);
      if (Object.values(state.weights).every((v) => v === 0)) return;
      scoreSoon();
    });
  });
}

/* ----------------------------------------------------------------- scoring */

async function runScore() {
  const ticket = ++state.request;
  $("resultsSummary").textContent = "Scoring…";
  $("progress").classList.add("on");
  try {
    const data = await api("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scoreRequest({ top_k: state.topK, include_field: true })),
    });
    if (ticket !== state.request) return;
    state.data = data;
    state.field = decode(data.field);
    state.sorted = sortedFinite(state.field);
    // Keep the info card on the same place with its new score, or drop it if that site left the list.
    if (state.card && !state.pick) state.card = data.results.find((r) => r.index === state.card.index) || null;
    if (state.layer === "score") paintLayer();
    renderResults(true);
    renderValidation();
    renderMarkers();
    if (state.selected) {
      const again = data.results.find((r) => r.index === state.selected.index);
      if (again) renderDetail(again); else showList();
    }
    if (state.pick) refreshPick();
    refreshPins();
    robustSoon(ticket);
    if (!$("explore").hidden) renderExplore();
  } catch (err) {
    if (ticket === state.request) toast(`Scoring failed: ${err.message}`);
  } finally {
    if (ticket === state.request) $("progress").classList.remove("on");
  }
}
const scoreSoon = debounce(runScore, 220);

/* Uncertainty + sensitivity for the current ranking (slow-ish, so debounced and cached server-side). */
const robustSoon = debounce(async (ticket) => {
  try {
    const r = await api("/api/robustness", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scoreRequest({ top_k: state.topK })),
    });
    if (ticket !== state.request) return;
    state.robust = r;
    renderResults();
    if (state.selected) renderDetail(state.data.results.find((x) => x.index === state.selected.index) || state.selected);
    renderValidation();
  } catch {
    // Optional, but say so rather than leaving "loading" on screen.
    if (ticket === state.request) { state.robust = { failed: true }; renderValidation(); }
  }
}, 500);

function stabilityOf(r) {
  const v = state.robust?.stability?.[String(r.index)];
  return v === undefined ? null : v;
}
const topKSoon = debounce(() => { if (!state.selected) showList(); runScore(); }, 250);

/* fresh: a new ranking (stagger the rows in); otherwise an in-place refresh. */
function renderResults(fresh = false) {
  const d = state.data;
  const bits = [];
  if (d.filters?.new_only) bits.push("new sites only");
  if (d.filters?.min_distance_km) bits.push(`at least ${fmtInt(d.filters.min_distance_km)} km apart`);
  if (d.filters?.max_per_country) bits.push(`up to ${d.filters.max_per_country} per country`);
  if (d.filters?.tolerance) bits.push(`error band ×${d.filters.tolerance}`);
  $("resultsSummary").innerHTML = `Top ${d.results.length} of ${fmtInt(state.sorted.length)} land cells${bits.length ? ` · ${bits.join(" · ")}` : ""}.`
    + (d.shortfall ? `<br><span class="shortfall">${esc(d.shortfall)} Loosen a filter to see more.</span>` : "");
  $("siteList").classList.toggle("fresh", fresh);
  $("siteList").innerHTML = d.results.map((r, n) => `
    <li style="--n: ${n}"><button class="site ${state.selected?.index === r.index ? "active" : ""}" data-index="${r.index}" type="button">
      <span class="rank num">${r.rank}</span>
      <span class="name">${esc(r.label.text)}</span>
      <span class="score"><b>${fmtPct(r.score)}</b><small>match</small></span>
      <span class="meta"><span class="num">${fmtCoord(r.lat, r.lon)}</span>${noveltyChip(r.novelty)}${state.pins.some((x) => x.index === r.index) ? `<span class="pin-star" title="Pinned">pinned</span>` : ""}${stabilityOf(r) !== null ? `<span class="stable" title="Stays in the top 1% of land in ${fmtPct(stabilityOf(r))} of ${state.robust.runs} simulated runs">stable ${fmtPct(stabilityOf(r))}</span>` : ""}</span>
      <span class="bar" aria-hidden="true"><i style="width:${(r.score * 100).toFixed(1)}%"></i></span>
    </button></li>`).join("");
  $("siteList").querySelectorAll(".site").forEach((b) => {
    const r = d.results.find((x) => String(x.index) === b.dataset.index);
    b.addEventListener("click", () => { hidePeek(); selectResult(r); });
    b.addEventListener("mouseenter", () => {
      const m = markerEls.get(r.index);
      if (m && m.style.display !== "none") m.dispatchEvent(new Event("mouseenter"));
      m?.classList.add("active");
    });
    b.addEventListener("mouseleave", () => {
      hidePeek();
      if (state.selected?.index !== r.index) markerEls.get(r.index)?.classList.remove("active");
    });
  });
}

function selectResult(r) {
  state.selected = r;
  state.pick = null;
  state.card = r;
  selectTab("results");
  renderDetail(r);
  renderMarkers();
  if (state.view === "globe") globe.flyTo(r.lat, r.lon, (globe.fitDistance || 3.6) * 0.78);
  else flat.flyTo(r.lat, r.lon, 3);
}

async function pickLocation(lat, lon) {
  state.pick = { lat, lon };
  state.selected = null;
  state.card = null;
  renderMarkers();
  selectTab("results");
  await refreshPick(true);
}

/* fresh: a new click (open the info card); otherwise a rescore of the same place. */
async function refreshPick(fresh = false) {
  const { lat, lon } = state.pick;
  try {
    const r = await api(`/api/explain?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scoreRequest()),
    });
    if (!r.scored) {
      $("siteList").hidden = true;
      const det = $("detail");
      det.hidden = false;
      det.innerHTML = `<button class="ghost small back" type="button">${icon("arrow-left")}All ranked sites</button>
        <h3>${esc(r.label.text)}</h3>
        <div class="coords num">${fmtCoord(r.lat, r.lon)}</div>
        <p class="notice">${esc(r.reason)}</p>`;
      det.querySelector(".back").addEventListener("click", showList);
      return;
    }
    renderDetail(r);
    if (fresh || state.card) showCard(r);
  } catch (err) {
    toast(`Could not inspect that location: ${err.message}`);
  }
}

function showList() {
  state.selected = null;
  state.pick = null;
  state.card = null;
  $("detail").hidden = true;
  $("siteList").hidden = false;
  $("siteList").querySelectorAll(".site").forEach((b) => b.classList.remove("active"));
  renderMarkers();
}

function renderDetail(r) {
  const t = target();
  const d = state.data;
  const eff = d.effective_profile;
  const crits = state.criteria.map((c) => {
    const w = d.weights[c.key];
    const sim = r.similarities[c.key];
    const val = r.values[c.key];
    if (w === 0 || sim === null) {
      return `<div class="crit off"><div class="row"><span>${esc(c.label)}</span><span class="tag">not scored</span></div>
        <div class="vs">Here: ${esc(fmtValue(val, c.unit))}</div></div>`;
    }
    return `<div class="crit"><div class="row"><span>${esc(c.label)}</span><span class="pct">${fmtPct(sim)}</span></div>
      <div class="vs">Here ${esc(fmtValue(val, c.unit))} · target ${esc(fmtValue(eff[c.key], c.unit))}</div>
      <div class="bar" role="img" aria-label="${esc(c.label)} similarity ${fmtPct(sim)}"><i style="width:${(sim * 100).toFixed(1)}%"></i></div></div>`;
  }).join("");

  const nov = r.novelty;
  const novText = nov.status === "new"
    ? `No catalogued analog within 500 km (nearest: ${esc(nov.nearest_known)}, ${fmtInt(Math.round(nov.distance_km))} km).`
    : `${fmtInt(Math.round(nov.distance_km))} km from <a href="${esc(nov.source_url)}" target="_blank" rel="noopener">${esc(nov.nearest_known)}</a>.`;
  const lstNote = r.lst_source === "NASA POWER TS_RANGE fit"
    ? `<p class="notice">No MODIS surface-temperature data here: the day-night swing is estimated from NASA POWER skin temperature (see How it works).</p>` : "";
  const claims = r.rationale.claims.map((c) => `<li>${esc(c.text)} <a href="${esc(c.source_url)}" target="_blank" rel="noopener">source</a></li>`).join("");
  const caveats = r.rationale.caveats.map((c) => `<li>${esc(c.text)}</li>`).join("");
  const worldview = `https://worldview.earthdata.nasa.gov/?v=${(r.lon - 4).toFixed(2)},${(r.lat - 3).toFixed(2)},${(r.lon + 4).toFixed(2)},${(r.lat + 3).toFixed(2)}&l=MODIS_Terra_CorrectedReflectance_TrueColor`;
  const gmaps = `https://www.google.com/maps/@${r.lat.toFixed(4)},${r.lon.toFixed(4)},9z/data=!3m1!1e3`;
  const title = r.rank ? `#${r.rank} · ${esc(r.label.text)}` : esc(r.label.text);

  $("siteList").hidden = true;
  const det = $("detail");
  det.hidden = false;
  det.innerHTML = `
    <button class="ghost small back" type="button">${icon("arrow-left")}All ranked sites</button>
    <h3>${title}</h3>
    <div class="coords"><span class="num">${fmtCoord(r.lat, r.lon)}</span>${noveltyChip(nov)}
      <button class="link-button" type="button" data-copy="${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}">Copy coordinates</button></div>
    <div class="hero">
      <div class="big num">${(r.score * 100).toFixed(0)}<small>%</small></div>
      <div class="what">match to <b>${esc(t.short_name)}</b><br>
        ${topShare(r.percentile)} of ${fmtInt(state.sorted.length)} land cells</div>
    </div>
    <div class="detail-actions">
      <button class="godseye-button" type="button" id="openEye" ${Math.abs(r.lat) > 84 ? "disabled title=\"Elevation tiles stop at about 84 degrees latitude\"" : ""}>
        ${icon("cube-focus")}Open in God's Eye 3D</button>
      <button class="ghost small" type="button" id="pinSite">${state.pins.some((x) => x.index === r.index) ? "Unpin" : "Pin to compare"}</button>
    </div>
    <p class="notice">${novText}</p>
    ${robustLine(r)}
    ${lstNote}
    <h4 class="section-title">See the place</h4>
    ${viewsStrip(r)}
    <h4 class="section-title">Criterion by criterion</h4>
    ${crits}
    <h4 class="section-title">Verify it yourself</h4>
    <div class="verify">
      <a href="${esc(worldview)}" target="_blank" rel="noopener">NASA Worldview ${icon("arrow-square-out")}<small>MODIS true colour here</small></a>
      <a href="${esc(gmaps)}" target="_blank" rel="noopener">Satellite view ${icon("arrow-square-out")}<small>Google Maps imagery</small></a>
      ${t.trek_url ? `<a href="${esc(t.trek_url)}" target="_blank" rel="noopener">NASA ${esc(t.body)} Trek ${icon("arrow-square-out")}<small>the target site</small></a>` : ""}
      ${t.source_url ? `<a href="${esc(t.source_url)}" target="_blank" rel="noopener">Target reference ${icon("arrow-square-out")}<small>${esc(t.source_label || "")}</small></a>` : ""}
    </div>
    <details class="drawer"><summary>Why, in words (with sources)</summary><div><ul>${claims}</ul></div></details>
    <details class="drawer"><summary>Caveats</summary><div><ul>${caveats}</ul></div></details>
    <details class="drawer"><summary>Raw data behind these numbers</summary><div>
      <pre class="json">${esc(JSON.stringify({ lat: r.lat, lon: r.lon, score: r.score, percentile: r.percentile, values: r.values, similarities: r.similarities, weights: d.weights, target: d.profile, effective_target: eff, lst_source: r.lst_source, novelty: nov }, null, 2))}</pre></div></details>`;
  det.querySelector(".back").addEventListener("click", showList);
  det.querySelector("#openEye").addEventListener("click", () => openGodsEye(r));
  det.querySelector("#pinSite").addEventListener("click", () => togglePin(r));
  det.querySelector("[data-copy]").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(e.target.dataset.copy); e.target.textContent = "Copied"; } catch { e.target.textContent = e.target.dataset.copy; }
  });
  det.closest(".panel").scrollTop = 0;
  if (window.innerWidth <= 1020) det.scrollIntoView({ behavior: "smooth", block: "start" });
  // Count the big score up when a new site opens (not on every refresh of the same one).
  if (lastCounted !== `${r.lat},${r.lon}`) {
    lastCounted = `${r.lat},${r.lon}`;
    countUp(det.querySelector(".hero .big"), Math.round(r.score * 100));
  }
}

let lastCounted = null;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function countUp(el, to) {
  if (!el || REDUCED_MOTION) return;
  const node = el.firstChild;   // the number; the "%" sits in a <small> after it
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 600);
    node.nodeValue = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* -------------------------------------------------------------- validation */

function renderValidation() {
  const v = state.data.validation;
  const hasAuc = !!v && v.auc !== null;
  $("statusAuc").hidden = !hasAuc;
  $("statusValRow").hidden = !hasAuc;
  $("statusOpenVal").hidden = !hasAuc;
  if (!hasAuc) { $("validation").innerHTML = `<p class="hint">No validation for a custom profile.</p>`; return; }
  $("statusAuc").textContent = `AUC ${v.auc.toFixed(2)}`;
  $("statusVal").innerHTML = `<span class="num">AUC ${v.auc.toFixed(2)}</span> on ${v.positives} known sites`;
  const body = v.tag === "cold_polar" ? "cold polar-desert" : v.body.charAt(0).toUpperCase() + v.body.slice(1);
  const share = v.auc >= 0.999 ? "every" : `${fmtPct(v.auc)} of`;
  const rows = v.controls.map((c) => `
    <tr><td><span class="role ${c.role}">${{ positive: "known analog", negative: "non-analog", geology: "geology only" }[c.role]}</span></td>
      <td>${c.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name)}</td>
      <td class="n">${c.score === null ? "–" : fmtPct(c.score)}</td>
      <td class="pbar">${c.percentile === null ? "" : `<div class="bar" role="img" aria-label="percentile ${c.percentile}"><i style="width:${c.percentile}%"></i></div>`}</td>
      <td class="n">${c.percentile === null ? "–" : `p${c.percentile.toFixed(0)}`}</td></tr>`).join("");
  $("validation").innerHTML = `
    <div class="auc-hero"><div class="big num">${v.auc.toFixed(2)}</div>
      <p><b>ROC-AUC.</b> In ${share} pairing, a known ${esc(body)} analog site outscores a vegetated or humid
      reference point (${v.positives} analogs × ${v.negatives} references = ${v.positives * v.negatives} pairs). 1.00 is perfect
      separation; 0.50 is chance. A small, easy test: it shows the score separates analog-like land from green land,
      not that every top site is a proven analog.</p></div>
    <h4 class="section-title">Control sites under the current weights</h4>
    <table class="controls"><thead><tr><th>Role</th><th>Site</th><th class="n">Score</th><th colspan="2">Percentile of land</th></tr></thead>
      <tbody>${rows}</tbody></table>
    ${sensitivityTable()}
    ${dataChecksTable()}
    <p class="hint">${esc(v.method)} "Geology only" sites were chosen for rocks this
      model does not measure and are not counted. Known analogs span very different environments, so no single
      target should rank all of them at the top.</p>`;
}

let dataChecks = null;
function dataChecksTable() {
  if (!dataChecks) {
    api("/api/datachecks").then((r) => { dataChecks = r.checks; renderValidation(); }).catch(() => {});
    return "";
  }
  return `<h4 class="section-title">Do the datasets agree?</h4>
    <p class="hint">Independent datasets must agree where physics says they should. Spearman rank correlation over land cells:</p>
    <table class="controls"><thead><tr><th>Check</th><th class="n">ρ</th><th></th></tr></thead><tbody>
    ${dataChecks.map((c) => `<tr><td title="${esc(c.why)}">${esc(c.title)}<br><small class="hint">${fmtInt(c.cells)} cells</small></td>
      <td class="n">${c.rho.toFixed(2)}</td><td>${c.passed ? '<span class="role positive">agrees</span>' : '<span class="role negative">check</span>'}</td></tr>`).join("")}
    </tbody></table>`;
}

function sensitivityTable() {
  const rows = state.robust?.sensitivity;
  if (state.robust?.failed) return `<p class="hint">Couldn't run the leave-one-out check. It runs again with the next change of weights or target.</p>`;
  if (!rows?.length) return `<p class="hint">Running the leave-one-out check…</p>`;
  return `<h4 class="section-title">Leave one criterion out</h4>
    <p class="hint">Does the result hinge on a single dataset? Each row drops one criterion and re-scores the whole Earth.</p>
    <table class="controls"><thead><tr><th>Without</th><th class="n">AUC</th><th>New #1 site</th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td>${esc(x.label)}</td><td class="n">${x.auc === null ? "–" : x.auc.toFixed(2)}</td>
      <td>${esc(x.top_site || "–")}${x.top_unchanged ? ` <span class="tag">same</span>` : ""}</td></tr>`).join("")}
    </tbody></table>`;
}

/* ------------------------------------------------------------------ export */

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportGeojson() {
  const d = state.data;
  if (!d) return;
  const features = d.results.map((r) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [r.lon, r.lat] },
    properties: { rank: r.rank, name: r.label.text, score: r.score, percentile: r.percentile, novelty: r.novelty.status, nearest_known: r.novelty.nearest_known, ...Object.fromEntries(Object.entries(r.values).map(([k, v]) => [`value_${k}`, v])), ...Object.fromEntries(Object.entries(r.similarities).map(([k, v]) => [`similarity_${k}`, v])) },
  }));
  const doc = { type: "FeatureCollection", properties: { target: d.target_id, weights: d.weights, generated_by: "TerraNova", cell_size_degrees: 0.5 }, features };
  download(`analogs_${d.target_id}.geojson`, JSON.stringify(doc, null, 2), "application/geo+json");
}

function exportCsv() {
  const d = state.data;
  if (!d) return;
  const keys = state.criteria.map((c) => c.key);
  const head = ["rank", "name", "lat", "lon", "score", "percentile", "novelty", "nearest_known", ...keys.map((k) => `value_${k}`), ...keys.map((k) => `similarity_${k}`)];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = d.results.map((r) => [r.rank, q(r.label.text), r.lat, r.lon, r.score, r.percentile, r.novelty.status, q(r.novelty.nearest_known), ...keys.map((k) => r.values[k] ?? ""), ...keys.map((k) => r.similarities[k])].join(","));
  download(`analogs_${d.target_id}.csv`, [head.join(","), ...lines].join("\n"), "text/csv");
}

function robustLine(r) {
  const v = stabilityOf(r);
  if (v === null) return "";
  return `<div class="robust"><div class="row"><span>Robustness</span><b class="num">${fmtPct(v)}</b></div>
    <div class="bar" role="img" aria-label="stable in ${fmtPct(v)} of runs"><i style="width:${(v * 100).toFixed(0)}%"></i></div>
    <small>Stays in the top 1% of land in ${fmtPct(v)} of ${state.robust.runs} runs where the target values are
    randomly perturbed within their stated confidence.</small></div>`;
}

/* NASA's newest daily image of the place (NOAA-20 VIIRS via GIBS) and the relief preview. */
function viewsStrip(r) {
  const day = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  const s = r.lat - 1, n = r.lat + 1, w = r.lon - 1, e = r.lon + 1;
  const latest = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_NOAA20_CorrectedReflectance_TrueColor&STYLES=&CRS=EPSG:4326&BBOX=${s},${w},${n},${e}&WIDTH=320&HEIGHT=320&FORMAT=image/jpeg&TIME=${day}`;
  const relief = `/api/peek.jpg?lat=${r.lat}&lon=${r.lon}`;
  return `<div class="views">
    <figure><img src="${esc(latest)}" alt="NASA VIIRS image from ${day}" loading="lazy"
      onerror="this.closest('figure').classList.add('missing')">
      <figcaption>Latest NASA view · VIIRS NOAA-20 · ${day}<br><small>daily, 250 m, may show clouds · needs internet</small></figcaption></figure>
    <figure><img src="${esc(relief)}" alt="Relief-shaded Sentinel-2 image" loading="lazy"
      onerror="this.closest('figure').classList.add('missing')">
      <figcaption>Terrain relief · Sentinel-2 2020<br><small>3D terrain available in God's Eye</small></figcaption></figure>
  </div>`;
}

/* ----------------------------------------------------------------- Explore */

async function loadAnalogValues() {
  if (state.analogValues) return state.analogValues;
  state.analogValues = await Promise.all(state.analogs.sites.map(async (site) => {
    try { return { site, cell: await api(`/api/cell?lat=${site.lat}&lon=${site.lon}`) }; } catch { return { site, cell: null }; }
  }));
  return state.analogValues;
}

async function renderExplore() {
  const box = $("explore");
  const d = state.data;
  if (!d) return;
  const active = state.criteria.filter((c) => (d.weights[c.key] ?? 0) > 0);
  const xKey = box.dataset.x && state.criteria.some((c) => c.key === box.dataset.x) ? box.dataset.x : (active.find((c) => c.key === "lst_diurnal_range") || active[0]).key;
  const yKey = box.dataset.y && state.criteria.some((c) => c.key === box.dataset.y) ? box.dataset.y : (active.find((c) => c.key === "precipitation" && c.key !== xKey) || active.find((c) => c.key !== xKey) || active[0]).key;
  if (!state.analogValues) {
    box.innerHTML = `<p class="hint">Reading the known analog sites…</p>${'<div class="skeleton skel-row"></div>'.repeat(6)}`;
  }
  const analogs = await loadAnalogValues();
  const opts = (sel) => state.criteria.map((c) => `<option value="${c.key}" ${c.key === sel ? "selected" : ""}>${esc(c.label)}</option>`).join("");
  const X = spec(xKey), Y = spec(yKey);
  const pts = [
    ...d.results.map((r) => ({ kind: "site", r, x: r.values[xKey], y: r.values[yKey] })),
    ...analogs.filter((a) => a.cell?.candidate).map((a) => ({ kind: "analog", a, x: a.cell.values[xKey], y: a.cell.values[yKey] })),
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const tx = d.effective_profile[xKey], ty = d.effective_profile[yKey];
  const xs = pts.map((p) => p.x).concat(Number.isFinite(tx) ? [tx] : []);
  const ys = pts.map((p) => p.y).concat(Number.isFinite(ty) ? [ty] : []);
  // Pad the domain, but never below zero for quantities that cannot be negative.
  const pad = (lo, hi) => { const m = (hi - lo || 1) * 0.08; return [lo >= 0 ? Math.max(0, lo - m) : lo - m, hi + m]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const W = 360, H = 290, L = 40, R = 12, T = 22, B = 38;
  const sx = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = (lo, hi) => [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const fmtT = (v) => {
    const a = Math.abs(v);
    if (a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
    if (a >= 100) return String(Math.round(v));
    if (a >= 10) return v.toFixed(0);
    return v.toFixed(a >= 1 ? 1 : 2);
  };
  const unitOf = (c) => (c.unit === "1" || c.unit === "NDVI" ? "" : ` (${c.unit})`);
  const grid = ticks(x0, x1).map((v) => `<line x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}" class="g"/><text x="${sx(v)}" y="${H - B + 14}" text-anchor="middle">${fmtT(v)}</text>`).join("")
    + ticks(y0, y1).map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" class="g"/><text x="${L - 5}" y="${sy(v) + 3}" text-anchor="end">${fmtT(v)}</text>`).join("");
  const target = Number.isFinite(tx) && Number.isFinite(ty)
    ? `<line x1="${sx(tx)}" x2="${sx(tx)}" y1="${T}" y2="${H - B}" class="t"/><line x1="${L}" x2="${W - R}" y1="${sy(ty)}" y2="${sy(ty)}" class="t"/>
       <circle cx="${sx(tx)}" cy="${sy(ty)}" r="8" class="target"/><text x="${sx(tx) + 11}" y="${sy(ty) - 8}" class="tl">target</text>` : "";
  const marks = pts.map((p, i) => p.kind === "site"
    ? `<circle data-i="${i}" cx="${sx(p.x)}" cy="${sy(p.y)}" r="${p.r.rank <= 10 ? 6 : 4.5}" class="site"/>`
    : `<text data-i="${i}" x="${sx(p.x)}" y="${sy(p.y)}" class="analog-rocket" text-anchor="middle" dominant-baseline="central">🚀</text>`).join("");
  box.innerHTML = `
    <p class="hint">Where do the top sites sit on two criteria at once? Each dot is a ranked site, each diamond a
      known analog (rocket); the crosshair is the target. Hover for details, click to open.</p>
    <div class="axes">
      <label>X <select id="exX">${opts(xKey)}</select></label>
      <label>Y <select id="exY">${opts(yKey)}</select></label>
    </div>
    <div class="scatter-wrap">
      <svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of ${esc(X.label)} against ${esc(Y.label)} for ranked sites and known analogs">
        ${grid}${target}${marks}
        <text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="axis">${esc(X.label + unitOf(X))}</text>
        <text x="${L}" y="${T - 8}" class="axis">${esc(Y.label + unitOf(Y))}</text>
      </svg>
      <div class="scatter-tip" id="exTip" hidden></div>
    </div>
    <div class="scatter-legend">
      <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" class="site"/></svg> ranked site</span>
      <span><span aria-hidden="true">🚀</span> known analog</span>
      <span><svg width="14" height="14"><circle cx="7" cy="7" r="5.5" class="target"/></svg> target</span>
    </div>
    <p class="hint">${pts.filter((p) => p.kind === "site").length} ranked sites · ${pts.filter((p) => p.kind === "analog").length} known analogs with data.
      Distance from the crosshair on these two axes is part of each site's score.</p>`;
  const svg = box.querySelector("svg");
  const tip = $("exTip");
  svg.querySelectorAll("[data-i]").forEach((el) => {
    const p = pts[Number(el.dataset.i)];
    el.addEventListener("mouseenter", () => {
      const title = p.kind === "site" ? `#${p.r.rank} ${p.r.label.text} · ${fmtPct(p.r.score)}` : `${p.a.site.name} (known analog)`;
      tip.innerHTML = `<b>${esc(title)}</b><br>${esc(X.label)}: ${esc(fmtValue(p.x, X.unit))}<br>${esc(Y.label)}: ${esc(fmtValue(p.y, Y.unit))}`;
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const k = rect.width / W;
      tip.style.left = `${Math.min(rect.width - 170, Number(el.getAttribute("cx") || el.getAttribute("x")) * k + 10)}px`;
      tip.style.top = `${Number(el.getAttribute("cy") || el.getAttribute("y")) * k - 10}px`;
    });
    el.addEventListener("mouseleave", () => { tip.hidden = true; });
    el.addEventListener("click", () => {
      if (p.kind === "site") selectResult(p.r);
      else flyToPlace(p.a.site.lat, p.a.site.lon);
    });
  });
  $("exX").addEventListener("change", (e) => { box.dataset.x = e.target.value; renderExplore(); });
  $("exY").addEventListener("change", (e) => { box.dataset.y = e.target.value; renderExplore(); });
}

/* --------------------------------------------------------------- God's Eye */

const eye = new GodsEye($("godseye"));
let eyeReturnFocus = null;
eye.onClose = () => {
  globe.visible = state.view === "globe";
  twin?.setPaused(ui.twin === false);
  starfield.resume();
  eyeReturnFocus?.focus?.();
};

function openGodsEye(r, preset = null) {
  if (!r || Math.abs(r.lat) > 84) { toast("The 3D view needs elevation tiles, which stop at about 84 degrees latitude.", "info"); return Promise.resolve(); }
  hidePeek();
  eyeReturnFocus = document.activeElement;
  const t = target();
  const context = {
    targetId: state.mode === "target" ? state.targetId : null,
    targetName: t.short_name,
    subtitle: `${fmtCoord(r.lat, r.lon)} · ${fmtPct(r.score)} match to ${t.short_name}`,
    badges: `${r.rank ? `<span class="chip">#${r.rank} of ${state.data.results.length}</span>` : ""}${noveltyChip(r.novelty)}`,
    values: r.values,   // the cell's climate, for the climate simulation
  };
  if (preset) eye.sun = { ...SUN_PRESETS[preset] };
  // The full-screen 3D view covers everything: stop drawing what is underneath.
  globe.visible = false;
  twin?.setPaused(true);
  starfield.pause();
  state.eyeSite = r;
  return eye.show(r, context);
}

/* ---------------------------------------------------------- pin + compare */

function togglePin(r) {
  const i = state.pins.findIndex((x) => x.index === r.index);
  if (i >= 0) state.pins.splice(i, 1);
  else {
    if (state.pins.length >= MAX_PINS) { toast(`You can compare up to ${MAX_PINS} sites. Unpin one first.`, "info"); return; }
    state.pins.push(r);
  }
  renderCompare();
  renderMarkers();
  if (state.data) renderResults();
  if (state.selected?.index === r.index || state.pick) {
    const btn = $("pinSite");
    if (btn) btn.textContent = i >= 0 ? "Pin to compare" : "Unpin";
  }
}

async function refreshPins() {
  if (!state.pins.length) return;
  state.pins = await Promise.all(state.pins.map(async (r) => {
    try {
      const fresh = await api(`/api/explain?lat=${r.lat}&lon=${r.lon}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scoreRequest()),
      });
      const ranked = state.data.results.find((x) => x.index === fresh.index);
      return fresh.scored ? { ...fresh, rank: ranked?.rank ?? null } : r;
    } catch { return r; }
  }));
  renderCompare();
}

function renderCompare() {
  const box = $("compare");
  if (!state.pins.length) { box.hidden = true; box.innerHTML = ""; return; }
  const pins = state.pins;
  const active = state.criteria.filter((c) => (state.data?.weights[c.key] ?? 0) > 0);
  const row = (label, values, fmt) => {
    const best = Math.max(...values.map((v) => (v === null || v === undefined ? -Infinity : v)));
    return `<tr><td>${esc(label)}</td>${values.map((v) => `<td class="${v === best && pins.length > 1 ? "best" : ""}">${v === null || v === undefined ? "–" : fmt(v)}</td>`).join("")}</tr>`;
  };
  box.hidden = false;
  box.innerHTML = `
    <div class="compare-head"><h4>Compare pinned sites</h4><button class="link-button" type="button" id="clearPins">Clear</button></div>
    <table>
      <thead><tr><th></th>${pins.map((r) => `<th title="${esc(r.label.text)}">${r.rank ? `#${r.rank} ` : ""}${esc(r.label.text)}
        <button class="unpin" type="button" data-unpin="${r.index}" aria-label="Unpin ${esc(r.label.text)}">${icon("x")}</button></th>`).join("")}</tr></thead>
      <tbody>
        ${row("Match score", pins.map((r) => r.score), (v) => fmtPct(v))}
        ${active.map((c) => row(c.label, pins.map((r) => r.similarities[c.key]), (v) => fmtPct(v))).join("")}
        <tr><td>Novelty</td>${pins.map((r) => `<td>${esc(NOVELTY[r.novelty.status]?.[1] || r.novelty.status)}</td>`).join("")}</tr>
      </tbody>
    </table>`;
  $("clearPins").addEventListener("click", () => { state.pins = []; renderCompare(); renderMarkers(); renderResults(); });
  box.querySelectorAll("[data-unpin]").forEach((b) => b.addEventListener("click", () => {
    togglePin(state.pins.find((x) => String(x.index) === b.dataset.unpin));
  }));
}

/* ------------------------------------------------------------------ search */

let searchItems = [];
let searchActive = -1;

function flyToPlace(lat, lon) {
  if (state.view === "globe") globe.flyTo(lat, lon, (globe.fitDistance || 3.6) * 0.7);
  else flat.flyTo(lat, lon, 4);
  pickLocation(lat, lon);
}

function renderSearch() {
  const list = $("searchResults");
  const input = $("search");
  if (!searchItems.length) {
    list.innerHTML = `<li class="s-empty" role="option" aria-disabled="true">No match. Try a town, desert, analog site or "lat, lon".</li>`;
  } else {
    list.innerHTML = searchItems.map((it, i) => `<li role="option" id="sr${i}" aria-selected="${i === searchActive}" data-i="${i}">
      <span class="s-name">${esc(it.name)}</span><span class="s-meta">${esc(it.kind)} · ${esc(it.detail || "")} · ${fmtCoord(it.lat, it.lon)}</span></li>`).join("");
  }
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-activedescendant", searchActive >= 0 ? `sr${searchActive}` : "");
  list.querySelectorAll("[data-i]").forEach((li) => li.addEventListener("mousedown", (e) => {
    e.preventDefault();
    chooseSearch(Number(li.dataset.i));
  }));
}

function closeSearch() {
  $("searchResults").hidden = true;
  $("search").setAttribute("aria-expanded", "false");
  searchActive = -1;
}

function chooseSearch(i) {
  const it = searchItems[i];
  if (!it) return;
  $("search").value = it.name;
  closeSearch();
  $("search").blur();   // give the keyboard back to the shortcuts
  flyToPlace(it.lat, it.lon);
}

const runSearch = debounce(async (q) => {
  if (!q.trim()) { closeSearch(); return; }
  try {
    searchItems = (await api(`/api/search?q=${encodeURIComponent(q)}`)).results;
    searchActive = searchItems.length ? 0 : -1;
    renderSearch();
  } catch { closeSearch(); }
}, 160);

function wireSearch() {
  const input = $("search");
  input.addEventListener("input", () => runSearch(input.value));
  input.addEventListener("blur", () => setTimeout(closeSearch, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!searchItems.length) return;
      e.preventDefault();
      searchActive = (searchActive + (e.key === "ArrowDown" ? 1 : -1) + searchItems.length) % searchItems.length;
      renderSearch();
    } else if (e.key === "Enter") {
      e.preventDefault();
      chooseSearch(Math.max(0, searchActive));
    } else if (e.key === "Escape") {
      closeSearch();
      input.blur();
    }
  });
}

/* -------------------------------------------------------------- surprise */

/* A random cell from the top 2% of land that is not already in the ranked list. */
function surprise() {
  if (!state.field || !state.sorted) return;
  const cut = quantile(state.sorted, 0.98);
  const listed = new Set(state.data.results.map((r) => r.index));
  const pool = [];
  for (let i = 0; i < state.field.length; i++) {
    if (state.field[i] >= cut && !listed.has(i)) pool.push(i);
  }
  if (!pool.length) return;
  const i = pool[Math.floor(Math.random() * pool.length)];
  const row = Math.floor(i / 720);
  const col = i % 720;
  flyToPlace(90 - (row + 0.5) * 0.5, -179.75 + col * 0.5);
}

/* -------------------------------------------------------------------- tour */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tourIndex = -1;

const TOUR = [
  {
    title: "Welcome",
    text: "TerraNova compares every land cell on Earth with a Moon or Mars base site, using NASA data, and ranks the closest matches.",
    run: async () => { if (eye.open) eye.close(); chooseTargetById("lunar_south_pole"); showList(); await sleep(300); globe.home(); },
  },
  {
    title: "The target",
    text: "Target: the lunar south pole, where Artemis crews will land. Its signature, in the Target tab, comes from NASA missions: no rain, no plants, huge temperature swings, rugged ground.",
    run: async () => { selectTab("target"); $("sidebar").scrollTo({ top: 0, behavior: "smooth" }); },
  },
  {
    title: "Where Earth matches",
    text: "The globe lights up where Earth behaves most like the target. Brighter means a closer match. Here is the top-ranked site.",
    run: async () => { await waitForData(); selectResult(state.data.results[0]); },
  },
  {
    title: "Why it matches",
    text: "Every score is explained criterion by criterion, with the dataset behind each number. Rest the pointer on a numbered site to preview it from orbit.",
    run: async () => { if (!state.selected) selectResult(state.data.results[0]); },
  },
  {
    title: "God's Eye",
    text: "Descend into the site's real terrain in 3D, lit the way the Sun lights the lunar pole: never more than about 1.5° above the horizon, with black shadows.",
    run: async () => { await openGodsEye(state.selected || state.data.results[0], "lunar"); },
  },
  {
    title: "Mars",
    text: "Switch to Mars: Jezero Crater, where Perseverance landed. The ranking changes completely: now hot, flat, bare deserts win.",
    run: async () => { if (eye.open) eye.close(); chooseTargetById("jezero_crater"); await sleep(1600); },
  },
  {
    title: "Is it right?",
    text: () => `We test it. Known analog sites such as Haughton Crater and the Atacama must outscore rainforest and farmland. ROC-AUC = ${state.data?.validation?.auc?.toFixed(2) ?? "…"} (1.00 is perfect).`,
    run: async () => { await waitForData(); selectTab("validation"); renderValidation(); },
  },
  {
    title: "Your turn",
    text: "Change the weights, search any place, pin sites to compare, or type your own target. Press ? for keyboard shortcuts.",
    run: async () => { selectTab("results"); },
  },
];

async function waitForData() {
  for (let i = 0; i < 50 && !state.data; i++) await sleep(100);
}

function chooseTargetById(id) {
  const card = document.querySelector(`.target-card[data-id="${id}"]`);
  if (card && card.getAttribute("aria-checked") !== "true") card.click();
}

async function tourGo(i) {
  tourIndex = Math.max(0, Math.min(TOUR.length - 1, i));
  const step = TOUR[tourIndex];
  document.body.classList.add("touring");
  $("tourCaption").hidden = false;
  $("tourStep").textContent = `${tourIndex + 1} of ${TOUR.length} · ${step.title}`;
  $("tourText").textContent = typeof step.text === "function" ? step.text() : step.text;
  $("tourBar").style.transform = `scaleX(${(tourIndex + 1) / TOUR.length})`;
  $("tourPrev").disabled = tourIndex === 0;
  $("tourNext").textContent = tourIndex === TOUR.length - 1 ? "Finish" : "Next";
  try { await step.run(); } catch (err) { toast(err.message); }
  if (typeof step.text === "function") $("tourText").textContent = step.text();
}

function tourStop() {
  tourIndex = -1;
  $("tourCaption").hidden = true;
  document.body.classList.remove("touring");
}

function wireTour() {
  $("startTour").addEventListener("click", () => tourGo(0));
  $("tourNext").addEventListener("click", () => (tourIndex >= TOUR.length - 1 ? tourStop() : tourGo(tourIndex + 1)));
  $("tourPrev").addEventListener("click", () => tourGo(tourIndex - 1));
  $("tourStop").addEventListener("click", tourStop);
}

/* ---------------------------------------------------------------- keyboard */

function stepSite(delta) {
  const list = state.data?.results;
  if (!list?.length) return;
  const i = state.selected ? list.findIndex((r) => r.index === state.selected.index) : -1;
  selectResult(list[(i + delta + list.length) % list.length]);
}

function wireKeys() {
  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest("input, select, textarea, [contenteditable]");
    const dialogOpen = document.querySelector("dialog[open]");
    if (e.key === "Escape") {
      if (closeMenus()) { e.preventDefault(); return; }
      if (eye.open) { eye.escape(); e.preventDefault(); return; }
      if (tourIndex >= 0) { tourStop(); return; }
      if (!dialogOpen && state.card) { closeCard(); return; }
      if (!dialogOpen && !typing && !$("detail").hidden) { showList(); return; }
      return;
    }
    if (typing || dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (eye.open) return;
    const k = e.key;
    const act = {
      "/": () => $("search").focus(),
      j: () => stepSite(1),
      k: () => stepSite(-1),
      e: () => openGodsEye(state.card || state.selected || state.data?.results[0]),
      p: () => { const r = state.card || state.selected; if (r?.index !== undefined) togglePin(r); },
      g: () => setView("globe"),
      m: () => setView("map"),
      "+": () => $("zoomIn").click(),
      "=": () => $("zoomIn").click(),
      "-": () => $("zoomOut").click(),
      0: () => $("zoomHome").click(),
      v: () => selectTab("validation"),
      t: () => tourGo(0),
      r: () => surprise(),
      "?": () => $("keysDialog").showModal(),
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act) { e.preventDefault(); act(); }
  });
}

/* ------------------------------------------------------------ tabs, dialogs */

const TABS = [["tabTarget", "target"], ["tabResults", "results"], ["tabExplore", "explore"], ["tabValidation", "validation"]];

function moveTabInk() {
  const on = TABS.find(([tab]) => $(tab).getAttribute("aria-selected") === "true");
  const btn = on && $(on[0]);
  if (!btn || !btn.offsetWidth) return;
  const ink = $("tabInk");
  ink.style.transform = `translateX(${btn.offsetLeft}px) scaleX(${btn.offsetWidth / 100})`;
}

function selectTab(name) {
  for (const [tab, panel] of TABS) {
    const on = panel === name;
    const was = $(tab).getAttribute("aria-selected") === "true";
    $(tab).setAttribute("aria-selected", String(on));
    $(tab).tabIndex = on ? 0 : -1;
    $(panel).hidden = !on;
    if (on && !was) {
      $(panel).classList.remove("panel-enter");
      void $(panel).offsetWidth;   // restart the entrance animation
      $(panel).classList.add("panel-enter");
    }
  }
  moveTabInk();
  if (name === "explore") renderExplore();
}

function renderMethod() {
  const rows = state.criteria.map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.description)}</td>
    <td><a href="${esc(c.source_url)}" target="_blank" rel="noopener"><code>${esc(c.dataset_id)}</code></a></td></tr>`).join("");
  const fit = state.sources?.lst_fit;
  $("methodContent").innerHTML = `
    <p>We describe each Moon or Mars base site with a handful of measurable conditions, measure the same
      conditions for every half-degree cell of Earth's land (${fmtInt(state.health.candidate_cells)} cells) from NASA and
      partner data, and rank the cells by how closely they match. There is no AI in the scoring: it is plain,
      tested arithmetic, and every number links to its source.</p>
    <h3>Target signature</h3>
    <p>Each target criterion comes from a published measurement (LRO Diviner, LOLA, Chang'E-2, HiRISE, Mars 2020 MEDA),
      cited on the target card. Two adjustments keep the comparison honest:</p>
    <ul><li><b>Beyond Earth:</b> the Moon's 120 K day-night swing exists nowhere on Earth, so it is matched against Earth's
      most extreme value (99.5th percentile) instead of penalising every cell equally.</li>
      <li><b>Different scale:</b> slopes measured over 20–50 m cannot be compared with 55 km Earth cells, so terrain targets
      are expressed as Earth terrain classes (for example "rugged" = Earth's 85th percentile), with the original measurement shown.</li></ul>
    <h3>Score</h3>
    <div class="formula">similarity<sub>k</sub> = clip(1 − |earth<sub>k</sub> − target<sub>k</sub>| / range<sub>k</sub>, 0, 1)<br>
      score = ∏<sub>k</sub> similarity<sub>k</sub><sup>w<sub>k</sub> / Σw</sup> &nbsp;&nbsp;(weighted geometric mean)</div>
    <p>A geometric mean lets one completely mismatched criterion veto a site: a rainforest cannot become a lunar analog by having the right slope.</p>
    <p>Some criteria are left out for some targets ("not used"), and a target can set its own default weights: the Haworth
      cold trap switches on <b>mean temperature</b>, because "cold" is what defines a cold trap.</p>
    <h3>Validate</h3>
    <p>Known analog sites (Haughton Crater, McMurdo Dry Valleys, Atacama, Apollo training sites and others, each cited) should
      outscore densely vegetated reference points. The Validation tab reports ROC-AUC for the current target and weights.</p>
    <h3>Look closer in God's Eye</h3>
    <p>Open any site in 3D. Its terrain comes from AWS Terrain Tiles at about 150 m, draped with Sentinel-2 cloud-free
      imagery (ESA Copernicus data processed by EOX). The panel measures relief and slope inside the scored cell at that
      finer scale, including the share of ground a rover could drive (slopes under 15°). You can light it with a lunar polar sun.</p>
    <h3>Criteria and data</h3>
    <table class="src-table"><thead><tr><th>Criterion</th><th>What it measures</th><th>Dataset</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Known limitations</h3>
    <ul>
      <li>Cells are 0.5° (~55 km). A small feature (a summit, a crater floor) is averaged with its surroundings; Mauna Kea's cell includes its forested slopes.</li>
      <li>Where MODIS has no land-surface-temperature data (mainly Antarctica) the day-night swing is predicted from NASA POWER skin temperature${fit ? ` (linear fit, r = ${fit.r})` : ""}.</li>
      <li>NASA POWER precipitation is a reanalysis (MERRA-2) and can overestimate polar deserts.</li>
      <li>The elevation tiles stop near ±85° latitude, so the far polar interiors are not scored, and God's Eye opens sites up to 84°.</li>
      <li>This is a screening tool for choosing where to look, not a site survey.</li>
    </ul>`;
}

function renderSources() {
  const s = state.sources;
  const datasets = (s.datasets || []).map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.used_for || "")}</td>
    <td><a href="${esc(d.url)}" target="_blank" rel="noopener"><code>${esc(d.dataset_id)}</code></a></td></tr>`).join("");
  const targets = s.targets.map((t) => {
    const items = Object.entries(t.criteria).map(([k, c]) => `<li>${esc(spec(k)?.label || k)}: <a href="${esc(c.source_url)}" target="_blank" rel="noopener"><code>${esc(c.dataset_id)}</code></a> (${esc(c.confidence)} confidence)</li>`).join("");
    return `<h3>${esc(state.targets.find((x) => x.id === t.id)?.name || t.id)}</h3><ul>${items}</ul>`;
  }).join("");
  const maps = Object.entries(s.basemaps).map(([k, b]) => `<li>${esc(k)}: <a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.credit)}</a></li>`).join("");
  $("sourcesContent").innerHTML = `
    <h3>Earth data (scored)</h3>
    <table class="src-table"><thead><tr><th>Dataset</th><th>Used for</th><th>ID</th></tr></thead><tbody>${datasets}</tbody></table>
    ${targets}
    <h3>Known analog catalog</h3><p>${esc(s.analogs.provenance)} ${s.analogs.sites} sites.</p>
    <h3>Imagery</h3><ul>${maps}
      <li>God's Eye terrain: AWS Terrain Tiles (Terrarium): SRTM, GMTED, ETOPO1 and others</li>
      <li>God's Eye imagery: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020), CC BY-NC-SA 4.0</li>
      <li>Detail tiles and hover previews: NASA Blue Marble via NASA GIBS</li></ul>
    <h3>Software</h3><p>three.js (MIT), FastAPI, NumPy, SciPy, rasterio, zarr. Place names: Natural Earth (public domain).</p>`;
}

function wireDialogs() {
  const open = (id, render) => () => { render(); $(id).showModal(); };
  $("openMethod").addEventListener("click", open("methodDialog", renderMethod));
  $("openSources").addEventListener("click", open("sourcesDialog", renderSources));
  $("openKeys").addEventListener("click", () => $("keysDialog").showModal());
  document.querySelectorAll("dialog").forEach((d) => {
    const btn = d.querySelector("[data-close]");
    if (btn) btn.addEventListener("click", () => d.close());
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  });
}

/* ------------------------------------------------------- shareable links */

function readHash() {
  const out = {};
  for (const part of location.hash.replace(/^#/, "").split("&")) {
    const [k, v] = part.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return out;
}

function writeHash() {
  const parts = [state.mode === "custom" ? "target=custom" : `target=${state.targetId}`];
  if (state.topK !== 20) parts.push(`top=${state.topK}`);
  if (!state.newOnly) parts.push("new=0");
  if (state.spreadKm !== 800) parts.push(`spread=${state.spreadKm}`);
  if (state.perCountry !== 2) parts.push(`per=${state.perCountry}`);
  if (state.tolerance) parts.push(`tol=${state.tolerance}`);
  if (state.view !== "globe") parts.push(`view=${state.view}`);
  if (state.layer !== "score") parts.push(`layer=${state.layer}`);
  if ((state.eyeSite && eye.open ? state.eyeSite : state.selected)?.rank) parts.push(`site=${(state.eyeSite && eye.open ? state.eyeSite : state.selected).rank}`);
  if ($("tabValidation").getAttribute("aria-selected") === "true") parts.push("tab=validation");
  if (eye.open && state.eyeSite?.rank) {
    parts.push("eye=1");
    const preset = Object.entries(SUN_PRESETS).find(([, p]) => p.elevation === Number(eye.sun.elevation) && p.azimuth === Number(eye.sun.azimuth));
    if (preset) parts.push(`sun=${preset[0]}`);
  }
  history.replaceState(null, "", `#${parts.join("&")}`);
}

/* -------------------------------------------------------------------- boot */

async function init() {
  wireDialogs();
  wireSearch();
  wireUi();
  $("surprise").addEventListener("click", surprise);
  wireTour();
  wireKeys();
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("tabTarget").addEventListener("click", () => selectTab("target"));
  $("tabResults").addEventListener("click", () => selectTab("results"));
  $("tabValidation").addEventListener("click", () => selectTab("validation"));
  $("tabExplore").addEventListener("click", () => selectTab("explore"));
  $("newOnly").addEventListener("change", (e) => { state.newOnly = e.target.checked; showList(); scoreSoon(); });
  $("spreadKm").addEventListener("input", (e) => {
    state.spreadKm = Number(e.target.value);
    $("spreadValue").textContent = state.spreadKm ? `${fmtInt(state.spreadKm)} km` : "no minimum";
    scoreSoon();
  });
  $("perCountry").addEventListener("change", (e) => { state.perCountry = Number(e.target.value); scoreSoon(); });
  $("tolerance").addEventListener("input", (e) => {
    state.tolerance = Number(e.target.value);
    $("toleranceValue").textContent = state.tolerance ? `×${state.tolerance.toFixed(2)}` : "exact";
    scoreSoon();
  });
  menu($("statusPill"), $("statusPanel"));
  menu($("helpButton"), $("helpMenu"));
  $("statusOpenVal").addEventListener("click", () => {
    if (ui.sidebar === false) setUi("sidebar", true);
    selectTab("validation");
  });
  $("showKnown").addEventListener("change", renderMarkers);
  $("exportGeojson").addEventListener("click", exportGeojson);
  $("exportCsv").addEventListener("click", exportCsv);
  globe.controls.addEventListener("start", hidePeek);
  $("zoomIn").addEventListener("click", () => (state.view === "globe" ? globe.zoomBy(0.7) : flat.zoomBy(1.6)));
  $("zoomOut").addEventListener("click", () => (state.view === "globe" ? globe.zoomBy(1 / 0.7) : flat.zoomBy(1 / 1.6)));
  $("zoomHome").addEventListener("click", () => (state.view === "globe" ? globe.home() : flat.home()));
  $("resetWeights").addEventListener("click", () => {
    state.weights = state.mode === "custom" ? { ...state.defaults } : { ...target().default_weights };
    renderWeights();
    runScore();
  });
  $("topK").addEventListener("input", (e) => {
    state.topK = Number(e.target.value);
    $("topKValue").textContent = state.topK;
    topKSoon();
  });
  $("overlayOpacity").addEventListener("input", (e) => {
    const v = Number(e.target.value) / 100;
    globe.setOverlayOpacity(v);
    flat.setOverlayOpacity(v);
  });
  $("layer").addEventListener("change", (e) => setLayer(e.target.value).catch((err) => toast(err.message)));

  loadingStep(1, "Connecting to the TerraNova server…");
  try {
    const [health, targets, criteria, sources, analogs] = await Promise.all([
      api("/api/health"), api("/api/targets"), api("/api/criteria"), api("/api/sources"), api("/api/analogs"),
    ]);
    if (!health.ok) throw new Error(health.detail || "backend not ready");
    Object.assign(state, { health, targets: targets.targets, criteria: criteria.criteria, sources, analogs });
    for (const w of criteria.weights) state.defaults[w.key] = w.weight;
    const hash = readHash();
    const wanted = TARGET_ALIASES[hash.target] || hash.target;
    state.targetId = state.targets.some((t) => t.id === wanted) ? wanted : state.targets[0].id;
    state.weights = { ...target().default_weights };
    if (hash.top && Number(hash.top) >= 5) state.topK = Math.min(100, Number(hash.top));
    if (hash.new === "0") state.newOnly = false;
    if (hash.spread !== undefined && Number.isFinite(Number(hash.spread))) state.spreadKm = Math.min(2000, Math.max(0, Number(hash.spread)));
    if (hash.per !== undefined && Number.isFinite(Number(hash.per))) state.perCountry = Math.min(5, Math.max(0, Number(hash.per)));
    if (hash.tol !== undefined && Number.isFinite(Number(hash.tol))) state.tolerance = Math.min(3, Math.max(0, Number(hash.tol)));
    $("newOnly").checked = state.newOnly;
    $("spreadKm").value = state.spreadKm;
    $("spreadValue").textContent = state.spreadKm ? `${fmtInt(state.spreadKm)} km` : "no minimum";
    $("perCountry").value = String(state.perCountry);
    $("tolerance").value = state.tolerance;
    $("toleranceValue").textContent = state.tolerance ? `×${state.tolerance.toFixed(2)}` : "exact";
    $("topK").value = state.topK;
    $("topKValue").textContent = state.topK;

    $("statusDot").className = "dot on";
    $("statusMode").textContent = health.offline ? "Offline" : "Online";
    $("statusData").textContent = health.offline ? "Offline, local data" : "Online, NASA services";
    $("statusCells").textContent = fmtInt(health.candidate_cells);
    const layer = $("layer");
    layer.appendChild(new Option("Analog score", "score"));
    for (const c of state.criteria) layer.appendChild(new Option(c.label, c.key));

    renderTargets();
    renderTargetDetail();
    renderWeights();

    loadingStep(2, "Loading the NASA Blue Marble Earth…");
    // One after the other: the flat map then reuses the globe's download from the browser cache.
    await globe.setEarth("assets/earth_hd.jpg", "assets/earth.jpg");
    await flat.setBase("assets/earth_hd.jpg");

    if (hash.target === "custom") chooseTarget(CUSTOM_ID);
    loadingStep(3, `Scoring ${fmtInt(health.candidate_cells)} land cells…`);
    await runScore();
    if (hash.view === "map") setView("map");
    if (hash.layer && state.criteria.some((c) => c.key === hash.layer)) {
      layer.value = hash.layer;
      await setLayer(hash.layer);
    }
    const site = state.data?.results.find((r) => String(r.rank) === hash.site);
    if (site) selectResult(site);
    if (site && hash.eye === "1") openGodsEye(site, hash.sun in SUN_PRESETS ? hash.sun : null);
    else if (state.data?.results.length) globe.flyTo(state.data.results[0].lat, state.data.results[0].lon);
    if (hash.tab === "validation") selectTab("validation");
    if (hash.dialog === "method") $("openMethod").click();
    if (hash.dialog === "sources") $("openSources").click();
    $("loading").classList.add("done");
    ["click", "change"].forEach((ev) => document.addEventListener(ev, () => setTimeout(writeHash, 0)));
    selectTab(hash.target === "custom" ? "target" : "results");
  } catch (err) {
    $("loading").classList.add("failed");
    $("loadingText").textContent = `Could not start: ${err.message}. Check that the TerraNova server is running.`;
    $("loadingRetry").hidden = false;
    $("statusDot").className = "dot off";
    $("statusMode").textContent = "Server not reachable";
    $("statusData").textContent = "Server not reachable";
    toast(`Could not start: ${err.message}`);
  }
}

$("loadingRetry").addEventListener("click", () => location.reload());

/* The start-up screen names what it is doing: three real steps, not a spinner. */
function loadingStep(n, text) {
  $("loadingText").textContent = text;
  $("loadingStep").textContent = `Step ${n} of 3`;
  $("loadBar").style.transform = `scaleX(${n / 3})`;
}
// A link to another target (typed, pasted, or Back) only changes the hash: start over for it.
window.addEventListener("hashchange", () => {
  const wanted = readHash().target;
  const now = state.mode === "custom" ? "custom" : state.targetId;
  if (wanted && (TARGET_ALIASES[wanted] || wanted) !== now) location.reload();
});
window.addEventListener("resize", debounce(moveTabInk, 100));

init();
