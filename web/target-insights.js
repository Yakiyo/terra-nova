// Interactive layer of the Target tab:
//  1. click a condition -> the globe repaints that condition across Earth
//  2. each Earth-range bar also marks the #1 Earth match and a familiar place
// All numbers come from the API (/api/cell); nothing is computed here.

const PLACES = [
  { id: "dhaka", name: "Dhaka", lat: 23.81, lon: 90.41 },
  { id: "london", name: "London", lat: 51.51, lon: -0.13 },
  { id: "newyork", name: "New York", lat: 40.71, lon: -74.0 },
  { id: "sahara", name: "Sahara (Tamanrasset)", lat: 22.79, lon: 5.53 },
  { id: "atacama", name: "Atacama Desert", lat: -23.86, lon: -69.13 },
  { id: "iceland", name: "Iceland highlands", lat: 64.8, lon: -17.5 },
];
let deps = null;
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

/* ------------------------------------------------ wiring */

export function enhanceTargetDetail(d) {
  deps = d;
  const root = document.getElementById("targetDetail");
  if (!root || !root.querySelector(".tp-chips")) return;

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

}
