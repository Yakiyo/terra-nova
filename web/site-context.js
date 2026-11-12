// "What happens here": unscored Earth processes (dust, ice, aridity, basalt, swings),
// nearest analog caves, and what the model does not cover. Data: /api/context.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = { wind: "🌪", snow: "❄", drop: "☀", volcano: "🌋", thermo: "🌡" };
const cache = new Map();

export async function fillProcesses(box) {
  if (!box) return;
  const key = `${box.dataset.lat},${box.dataset.lon}`;
  let d = cache.get(key);
  if (!d) {
    try {
      const r = await fetch(`/api/context?lat=${box.dataset.lat}&lon=${box.dataset.lon}`);
      if (!r.ok) throw new Error(r.status);
      d = await r.json(); cache.set(key, d);
    } catch { box.querySelector(".hint").textContent = "Couldn't load the process details."; return; }
  }
  if (!box.isConnected) return;
  const procs = d.processes.length ? d.processes.map((p) => `<li><span class="sd-proc-i" aria-hidden="true">${ICON[p.icon] || "•"}</span>
      <div><b>${esc(p.title)}</b><p>${esc(p.text)}</p></div></li>`).join("")
    : `<li><div><p>No strong process signal here beyond the scored conditions.</p></div></li>`;
  const meters = d.available ? `<div class="sd-proc-m">
      <span><small>Dust (NASA MERRA-2)</small><b class="num">${d.dust_ugm3 ?? "–"}</b> µg/m³${d.dust_percentile != null ? ` · dustier than ${d.dust_percentile.toFixed(0)}% of land` : ""}</span>
      <span><small>Snow / ice (NASA MODIS)</small><b class="num">${d.snow_months ?? 0}</b> of 12 months</span></div>`
    : `<p class="hint">Dust and snow layers not built yet.</p>`;
  const cave = d.nearest_caves?.[0]?.km <= 2000 ? d.nearest_caves[0] : null;
  box.innerHTML = `<h4>What happens here <small>Earth processes · not scored</small></h4>
    ${meters}<ul class="sd-proc-list">${procs}</ul>
    ${cave ? `<p class="sd-proc-cave">🕳 Nearest analog cave: <a href="${esc(cave.url)}" target="_blank" rel="noopener">${esc(cave.name)}</a>, ${esc(cave.country)} · ${cave.km.toLocaleString()} km away <small>(${esc(cave.note)})</small></p>` : ""}
    <details class="sd-proc-gap"><summary>What this model doesn't cover</summary><ul>${d.not_covered.map((t) => `<li>${esc(t)}</li>`).join("")}
      <li>Earth can't reproduce low gravity, vacuum, the thin Martian air or space radiation.</li></ul>
      <p class="hint">${d.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(" · ")}</p></details>`;
}

// Drag-to-compare: the target's surface (NASA Image Library) wiped against this place.
const TWIN_Q = { gale_crater: "Curiosity Mount Sharp landscape", jezero_crater: "Jezero Crater Perseverance", utopia_permafrost: "Utopia Planitia Mars surface",
  lunar_south_pole: "lunar south pole", malapert_massif: "lunar south pole mountains", haworth_psr: "lunar south pole crater shadow", lunar_lava_tube: "lunar pit Marius Hills" };
const twinCache = new Map();
export async function fillTwin(det, target) {
  const head = det?.querySelector(".sd-twin-head"), hero = det?.querySelector(".sd-hero");
  if (!head || !hero || !target) return;
  const box = document.createElement("div");
  box.className = "sd-wipe"; box.setAttribute("aria-label", `Drag to compare ${target.short_name} with this place`);
  box.innerHTML = `<div class="sd-wipe-earth"></div><div class="sd-wipe-alien"></div><i class="sd-wipe-bar"></i>
    <span class="sd-wipe-l">${esc(target.short_name)}</span><span class="sd-wipe-r">Earth</span>
    <input type="range" min="0" max="100" value="50" aria-label="Compare slider"><small class="sd-wipe-hint">◀ drag to compare ▶</small>`;
  head.after(box);
  const earth = box.querySelector(".sd-wipe-earth"), alien = box.querySelector(".sd-wipe-alien"), bar = box.querySelector(".sd-wipe-bar");
  const syncEarth = () => { earth.style.backgroundImage = hero.style.backgroundImage; };
  syncEarth(); new MutationObserver(syncEarth).observe(hero, { attributes: true, attributeFilter: ["style"] });
  const set = (v) => { alien.style.clipPath = `inset(0 ${100 - v}% 0 0)`; bar.style.left = `${v}%`; };
  box.querySelector("input").addEventListener("input", (e) => { set(+e.target.value); box.classList.add("is-used"); });
  set(50);
  const q = TWIN_Q[target.id] || `${target.short_name} ${target.body}`;
  let url = twinCache.get(q);
  if (!url) {
    try {
      const r = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`);
      url = (await r.json()).collection.items.find((x) => x.links?.[0]?.href)?.links[0].href;
      if (url) twinCache.set(q, url);
    } catch { /* fall back to the planet texture */ }
  }
  alien.style.backgroundImage = `url('${url || `assets/${target.body.toLowerCase()}.jpg`}')`;
}
