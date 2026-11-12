// One-screen "site dossier" for a ranked site: photo hero, Moon-vs-Earth comparison,
// a one-line verdict, readiness tiles, actions, and the full data folded away.
// Every number comes from the /api/score result row (or /api/explain for a clicked place).

const ICON = {
  precipitation: "cloud-rain", vegetation: "sparkle", annual_temperature_range: "thermometer",
  lst_diurnal_range: "sun", slope: "mountains", roughness: "ruler", elevation: "mountains",
  mean_annual_temperature: "thermometer", basaltic_volcanic: "diamond",
};
const PLAIN = {
  precipitation: "Rain", vegetation: "Plant cover", annual_temperature_range: "Seasonal swing",
  lst_diurnal_range: "Day–night swing", slope: "Slope", roughness: "Roughness", elevation: "Elevation",
  mean_annual_temperature: "Temperature", basaltic_volcanic: "Volcanic rock",
};
const READY = [
  ["ice_drill", "Drill", "download-simple"], ["low_sun_navigation", "Low-sun navigation", "sun"],
  ["eva_suit", "Spacesuit", "path"], ["rover", "Rover", "compass"],
];
const READY_WORD = { ready: ["✓", "Ready"], partial: ["~", "Partial"], not_suited: ["✕", "Not suited"], no_data: ["?", "No data"] };
const closeness = (s) => (s >= 0.9 ? "very close" : s >= 0.75 ? "close" : s >= 0.5 ? "partly alike" : "far apart");
const band = (s) => (s >= 0.9 ? "fp-a" : s >= 0.75 ? "fp-b" : s >= 0.5 ? "fp-c" : "fp-d");

function verdict(rows) {
  if (!rows.length) return "";
  const sorted = [...rows].sort((a, b) => b.sim - a.sim);
  const best = sorted.filter((x) => x.sim >= 0.9).slice(0, 2).map((x) => x.name.toLowerCase());
  const worst = sorted[sorted.length - 1];
  if (worst.sim >= 0.9) return `A close twin on every condition we score.`;
  const lead = best.length ? `Closest on ${best.join(" and ")}` : `A partial match`;
  return `${lead}; the biggest difference is ${worst.name.toLowerCase()} (${Math.round(worst.sim * 100)}% alike).`;
}

export function dossierHtml(r, ctx) {
  const { esc, icon, fmtValue, fmtPct, fmtInt, target, data, criteria, bodyImage, coord, topShare, cells, pinned } = ctx;
  const t = target, eff = data.effective_profile, real = data.profile || {};
  const rows = criteria.map((c) => {
    const sim = r.similarities?.[c.key];
    if (sim === null || sim === undefined || (data.weights?.[c.key] ?? 0) === 0) return null;
    const moon = real[c.key] ?? eff[c.key];
    return { key: c.key, name: PLAIN[c.key] || c.label, label: c.label, unit: c.unit, sim, here: r.values[c.key], moon, eff: eff[c.key] };
  }).filter(Boolean);
  const nov = r.novelty;
  const novLine = nov?.status === "new"
    ? `<span class="sd-new">New discovery</span> ${fmtInt(Math.round(nov.distance_km))} km from the nearest known test site (${esc(nov.nearest_known)})`
    : nov ? `<span class="sd-known">${icon("rocket")} Known test area</span> ${fmtInt(Math.round(nov.distance_km))} km from ${esc(nov.nearest_known)}` : "";
  const stab = ctx.stability;
  const name = r.label.text.replace(/^near /, "");
  const where = [r.label.region, r.label.country].filter(Boolean).filter((x) => x !== name).join(", ");

  const twin = rows.map((x) => `
    <li class="sd-row" title="${esc(`${x.label}: ${fmtValue(x.moon, x.unit)} on ${t.body}${x.moon !== x.eff ? ` (Earth's closest possible: ${fmtValue(x.eff, x.unit)})` : ""} vs ${fmtValue(x.here, x.unit)} here`)}">
      <span class="sd-v sd-moon num">${esc(fmtValue(x.moon, x.unit))}</span>
      <span class="sd-mid"><span class="sd-name">${icon(ICON[x.key] || "info")}${esc(x.name)}</span>
        <span class="sd-link ${band(x.sim)}"><i style="--s:${(x.sim * 100).toFixed(0)}%"></i></span>
        <small>${Math.round(x.sim * 100)}% · ${closeness(x.sim)}</small></span>
      <span class="sd-v sd-earth num">${esc(fmtValue(x.here, x.unit))}</span>
    </li>`).join("");

  const tiles = READY.map(([k, label, ic]) => {
    const st = r.readiness?.[k];
    if (!st) return "";
    const [mark, word] = READY_WORD[st] || READY_WORD.no_data;
    return `<li class="sd-tile sd-st-${esc(st)}" title="${esc(`${label}: ${word}`)}">${icon(ic)}<b>${esc(label)}</b><span>${mark} ${word}</span></li>`;
  }).join("");

  return `
    <button class="ghost small back" type="button">${icon("arrow-left")}All ranked sites</button>
    <section class="sd-hero" style="background-image:url('${esc(ctx.heroUrl)}'), url('${esc(ctx.fallbackUrl)}')">
      <div class="sd-shade"></div>
      <div class="sd-hero-top">${r.rank ? `<span class="sd-rank num">#${r.rank}</span>` : ""}
        <span class="sd-ring" style="--v:${r.score}"><b class="num">${Math.round(r.score * 100)}</b><small>% match</small></span></div>
      <div class="sd-hero-bottom">
        <h3>${esc(name)}</h3>
        <p>${where ? `${esc(where)} · ` : ""}<span class="num">${coord(r.lat, r.lon)}</span></p>
      </div>
    </section>
    <p class="sd-nov">${novLine}</p>
    <p class="sd-rank-line">${topShare} of ${fmtInt(cells)} land cells${stab !== null ? ` · <span class="${stab >= 0.999 ? "sd-ok" : "sd-warn"}">stable in ${fmtPct(stab)} of robustness tests</span>` : ""}</p>

    <section class="sd-twin" aria-label="${esc(t.body)} versus this place">
      <div class="sd-twin-head">
        <span class="sd-side"><i class="sd-body" style="background-image:url('${esc(bodyImage)}')"></i><b>${esc(t.short_name)}</b><small>${esc(t.body)}</small></span>
        <span class="sd-vs">vs</span>
        <span class="sd-side sd-right"><i class="sd-body sd-earthball" style="background-image:url('${esc(ctx.fallbackUrl)}')"></i><b>${esc(name)}</b><small>Earth</small></span>
      </div>
      <ul class="sd-rows">${twin}</ul>
      <p class="sd-verdict">${esc(verdict(rows))}</p>
    </section>

    ${tiles ? `<section class="sd-ready"><h4>What could be tested here?</h4><ul class="sd-tiles">${tiles}</ul>
      <details class="drawer sd-why"><summary>Why these ratings</summary><div class="readiness" id="readiness" data-key="${r.lat},${r.lon}" aria-live="polite"><p class="hint">Loading…</p></div></details></section>`
      : `<div class="readiness" id="readiness" data-key="${r.lat},${r.lon}" hidden></div>`}

    <div class="sd-actions">
      <button class="godseye-button" type="button" id="openEye" ${Math.abs(r.lat) > 84 ? "disabled title=\"Elevation tiles stop at about 84 degrees latitude\"" : ""}>${icon("cube-focus")}Explore in 3D</button>
      <button class="ghost small" type="button" id="pinSite">${icon("push-pin")}${pinned ? "Unpin" : "Compare"}</button>
      <button class="ghost small" type="button" data-copy="${r.lat.toFixed(3)}, ${r.lon.toFixed(3)}">${icon("copy")}Copy location</button>
    </div>
    <div class="sd-verify">
      <span>Check it yourself:</span>
      <a href="${esc(ctx.worldview)}" target="_blank" rel="noopener">NASA Worldview ${icon("arrow-square-out")}</a>
      <a href="${esc(ctx.gmaps)}" target="_blank" rel="noopener">Satellite map ${icon("arrow-square-out")}</a>
      ${t.trek_url ? `<a href="${esc(t.trek_url)}" target="_blank" rel="noopener">NASA ${esc(t.body)} Trek ${icon("arrow-square-out")}</a>` : ""}
    </div>
    <details class="drawer sd-data"><summary>Data, sources and caveats</summary><div>${ctx.moreHtml}</div></details>`;
}
