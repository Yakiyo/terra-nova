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
