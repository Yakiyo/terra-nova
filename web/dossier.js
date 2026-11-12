/* Mission dossier export (Feature 5): one self-contained HTML file a team can print or
 * share. Formatting only: every number in it comes from an API response already on the
 * page (/api/site3d, /api/traverse, /api/qualification, /api/score or /api/explain,
 * /api/sources). No NASA logos and no implied endorsement. */

import { escapeHtml as esc, formatCoord, topShareText } from "./format.js";
import { readinessHtml } from "./readiness.js";
import { profileChart, totalsList, legsTable, fmtKm } from "./traverse-view.js";

const SENTINEL_LICENCE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/";

export function slug(text) {
  return String(text || "site").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_").slice(0, 48) || "site";
}

const coord = (lat, lon) => formatCoord(lat, lon, 3);

function link(url, text) {
  return url ? `<a href="${esc(url)}">${esc(text || url)}</a>` : esc(text || "");
}

/* Plain text: icons point at icons.svg, which a stand-alone file does not have. */
function noIcons(html) {
  return html.replace(/<svg class="i"[\s\S]*?<\/svg>/g, "");
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f4f6; color: #16161a; font: 14px/1.5 "Segoe UI", Roboto, system-ui, sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 32px 24px 48px; background: #fff; }
  header { border-bottom: 3px solid #d5092b; padding-bottom: 14px; margin-bottom: 20px; }
  .kicker { margin: 0; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #d5092b; font-weight: 700; }
  h1 { margin: 4px 0 4px; font-size: 28px; line-height: 1.15; }
  h2 { margin: 28px 0 10px; font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { margin: 16px 0 6px; font-size: 15px; }
  p { margin: 6px 0; }
  .sub, .meta, figcaption, .note { color: #555; }
  .meta { font-size: 12px; }
  .note { font-size: 12.5px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px 16px; margin: 8px 0; }
  .grid div { border-left: 3px solid #1f5fbf; padding: 2px 0 2px 9px; }
  .grid span { display: block; font-size: 12px; color: #555; }
  .grid b { font-size: 16px; font-variant-numeric: tabular-nums; }
  .figs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  figure { margin: 0; }
  figure img { width: 100%; height: auto; border: 1px solid #ccc; border-radius: 4px; display: block; }
  figcaption { font-size: 12px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12.5px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #e3e3e8; vertical-align: top; }
  thead th { font-size: 11.5px; color: #555; border-bottom: 1.5px solid #bbb; }
  td.num, .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .off td, .off th { color: #888; }
  .hz-list li { margin: 2px 0; }
  .legend { font-size: 12px; color: #555; }
  .legend i { display: inline-block; width: 18px; height: 9px; vertical-align: middle; margin-right: 4px; }
  /* readiness matrix (markup from web/readiness.js) */
  .rd-cat { border: 1px solid #ddd; border-radius: 6px; margin: 8px 0; padding: 0 10px 6px; break-inside: avoid; }
  .rd-cat > summary { list-style: none; padding: 8px 0 4px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
  .rd-cat > summary::-webkit-details-marker { display: none; }
  .rd-name { font-weight: 700; }
  .rd-verdict { font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 10px; border: 1px solid currentColor; }
  .rd-ready .rd-verdict { color: #1d7a55; } .rd-partial .rd-verdict { color: #9a6a00; } .rd-not_suited .rd-verdict { color: #666; }
  .rd-system { width: 100%; font-size: 12px; }
  .rd-pass .rd-status { color: #1d7a55; } .rd-near .rd-status { color: #9a6a00; } .rd-fail .rd-status { color: #b0182c; }
  .hint { color: #555; font-size: 12.5px; }
  ol.cites { padding-left: 20px; font-size: 12.5px; } ol.cites li { margin: 3px 0; word-break: break-word; }
  a { color: #1f5fbf; }
  footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 12px; color: #555; }
  @page { size: A4; margin: 14mm; }
  @media print {
    body { background: #fff; font-size: 11pt; }
    main { max-width: none; padding: 0; }
    h2 { break-after: avoid; }
    figure, tr, .grid, .rd-cat, .figs { break-inside: avoid; }
    h2, h3 { break-after: avoid; }
    a { color: inherit; text-decoration: none; }
    .no-print { display: none; }
  }
  @media (max-width: 640px) { .figs { grid-template-columns: 1fr; } main { padding: 20px 16px; } }
`;

/* The dossier as a complete HTML document. */
export function dossierHtml({ context, terrain, route, readiness, shots, sources, generated, geojson = null }) {
  const site = context?.site || { label: terrain.label?.text || "Selected site", lat: terrain.lat, lon: terrain.lon };
  const target = context?.target || {};
  const body = target.body || "";
  const mission = body === "Moon" ? "Artemis lunar surface" : body === "Mars" ? "Mars surface" : "planetary surface";
  const title = `${target.short_name || "Custom profile"} analog field test: mission dossier`;
  const cell = terrain.stats.cell || terrain.stats.area;
  const cites = new Map();   // url -> text, in order of first use
  const cite = (url, text) => { if (url && !cites.has(url)) cites.set(url, text); };

  // 1. Site summary
  const summary = [
    ["Site", esc(site.label)],
    ["Coordinates", coord(site.lat, site.lon)],
    ...(site.score !== undefined ? [["Match to target", `${Math.round(site.score * 100)}%`]] : []),
    ...(site.percentile !== undefined ? [["Rank among land cells", `${site.rank ? `#${site.rank} of ${site.of} listed, ` : ""}${topShareText(site.percentile)}`]] : []),
    ...(site.novelty ? [["Novelty", site.novelty.status === "new"
      ? `New candidate: nearest catalogued analog ${esc(site.novelty.nearest_known)}, ${Math.round(site.novelty.distance_km).toLocaleString("en-US")} km`
      : `${Math.round(site.novelty.distance_km).toLocaleString("en-US")} km from ${esc(site.novelty.nearest_known)}`]] : []),
    ["Target", `${esc(target.name || "Custom profile")}${body ? ` (${esc(body)})` : ""}`],
  ];
  if (target.source_url) cite(target.source_url, `Target reference: ${target.source_label || target.name}`);

  // 2. Snapshots
  const figs = shots ? `<div class="figs">
      <figure><img src="${shots.oblique}" alt="3D view of the terrain block around ${esc(site.label)}"><figcaption>3D view as shown in God's Eye${shots.exaggeration !== 1 ? `, heights exaggerated ${shots.exaggeration}×` : ", true vertical scale"}. White outline: the scored 0.5° cell.</figcaption></figure>
      <figure><img src="${shots.top}" alt="Top-down map of the block with the planned route"><figcaption>Top-down, north up, ${Math.round(terrain.ground_size_m / 1000)} km across. Route in blue, stretches over ${route?.limit_deg ?? 15}° in red.</figcaption></figure>
    </div>` : "";

  // 3. Traverse
  let traverseSection = `<p class="note">No traverse was planned for this dossier. Use “Plan a traverse” in God's Eye to add one.</p>`;
  if (route) {
    const chart = profileChart(route, { width: 640, height: 170, inline: true }).svg;
    const totals = totalsList(route).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
    const wps = route.waypoints.map((w) => `<tr><th scope="row">${w.index + 1}. ${esc(w.name)}</th><td class="num">${coord(w.lat, w.lon)}</td>
      <td class="num">${Math.round(w.elev_m).toLocaleString("en-US")} m</td><td class="num">${w.terrain_slope_deg.toFixed(1)}°</td><td class="num">${fmtKm(w.d_km)}</td></tr>`).join("");
    const hz = route.hazards.length
      ? `<ul class="hz-list">${route.hazards.map((h) => `<li>Leg ${h.leg + 1}: ${fmtKm(h.start_km)} to ${fmtKm(h.end_km)} along the route (${Math.round(h.length_m)} m), steepest ${h.max_slope_deg.toFixed(1)}° at ${fmtKm(h.at_km)}</li>`).join("")}</ul>`
      : `<p>No stretch of the route is steeper than ${route.limit_deg}°.</p>`;
    cite(route.provenance.source_url, `Elevation: ${route.provenance.credit} (${route.provenance.dataset_id})`);
    cite(route.walking_model.source_url, `Walking time: ${route.walking_model.name}, ${route.walking_model.formula}`);
    traverseSection = `
      <div class="grid">${totals}</div>
      ${chart}
      <p class="legend"><i style="background:#1f5fbf;opacity:.5"></i>elevation along the route · <i style="background:#f21d38;opacity:.3"></i>ground steeper than ${route.limit_deg}° (rover limit) · numbered ticks: waypoints</p>
      <h3>Waypoints</h3>
      <table><thead><tr><th>Waypoint</th><th>Position</th><th>Elevation</th><th>Ground slope</th><th>Along route</th></tr></thead><tbody>${wps}</tbody></table>
      <h3>Legs</h3>
      ${legsTable(route)}
      <h3>Hazards</h3>
      ${hz}
      <p class="note">Sampled every ~${Math.round(route.sample_spacing_m)} m on the full-resolution elevation tiles (computed by the TerraNova server, src/compute/traverse.py).
        Ground slope is the steepest slope at each point, whatever the direction of travel. Walking time: ${esc(route.walking_model.note)}</p>
      ${geojson ? `<p class="note no-print">Route for GIS tools: <a download="${esc(geojson.name)}" href="data:application/geo+json;charset=utf-8,${encodeURIComponent(geojson.text)}">${esc(geojson.name)}</a> (embedded in this file).</p>` : ""}`;
  }

  // 4. Terrain statistics
  const pct = (x) => `${Math.round(x * 100)}%`;
  const terrainRows = [
    ["Elevation in the cell", `${Math.round(cell.elevation_min).toLocaleString("en-US")}–${Math.round(cell.elevation_max).toLocaleString("en-US")} m`],
    ["Relief in the cell", `${Math.round(cell.relief).toLocaleString("en-US")} m`],
    ["Mean slope", `${cell.slope_mean.toFixed(1)}°`],
    ["90% of ground below", `${cell.slope_p90.toFixed(1)}°`],
    [`Ground under ${terrain.stats.trafficable_deg}°`, pct(cell.share_under_15)],
    ["Elevation pixel", `${terrain.stats.slope_baseline_m} m`],
  ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const coverageNote = (terrain.stats.cell_coverage ?? 1) < 0.995
    ? `<p class="note">The terrain block covers ${pct(terrain.stats.cell_coverage)} of the scored cell (map tiles shrink towards the poles); the cell figures use that part.</p>`
    : "";
  cite(terrain.provenance.source_url, `Elevation: ${terrain.credits.elevation} (${terrain.provenance.dataset_id})`);
  if (shots?.imagery) cite(SENTINEL_LICENCE_URL, `Imagery: ${terrain.credits.imagery}. Licence ${terrain.imagery.s2.licence}`);

  // 5. Readiness
  let readinessSection = `<p class="note">The readiness matrix was not available when this dossier was made.</p>`;
  if (readiness?.categories) {
    readinessSection = noIcons(readinessHtml(readiness, { open: true }));
    cite(readiness.trl_source_url, "NASA, Technology Readiness Levels");
    for (const c of readiness.categories) {
      cite(c.system_url, c.system);
      for (const r of c.requirements) cite(r.threshold_source_url, `Readiness threshold: ${r.label}`);
    }
  }

  // 6. Criteria
  let criteriaSection = "";
  if (context?.criteria?.length) {
    const rows = context.criteria.map((c) => {
      cite(c.source_url, `${c.label}: ${c.dataset_id}`);
      return `<tr class="${c.scored ? "" : "off"}"><th scope="row">${esc(c.label)}</th><td class="num">${esc(c.here)}</td>
        <td class="num">${c.scored ? esc(c.target) : "not scored"}</td>
        <td class="num">${c.scored ? `${Math.round(c.similarity * 100)}%` : "–"}</td><td class="num">${c.scored ? c.weight : 0}</td>
        <td>${link(c.source_url, c.dataset_id)}</td></tr>`;
    }).join("");
    criteriaSection = `<table><thead><tr><th>Criterion</th><th>Here</th><th>Target</th><th>Similarity</th><th>Weight</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const label = (key) => context?.criteria?.find((c) => c.key === key)?.label || key;
  const claims = (context?.claims || []).map((c) => {
    cite(c.source_url, `Target value for ${label(c.criterion) || "this criterion"}${c.dataset_id ? ` (${c.dataset_id})` : ""}`);
    return `<li>${esc(c.text)} ${link(c.source_url, "source")}</li>`;
  }).join("");
  const caveats = (context?.caveats || []).map((c) => `<li>${esc(c.text)}</li>`).join("");

  // 7. Remaining datasets behind the score
  for (const p of sources?.predictors || []) cite(p.source_url, `${p.label}: ${p.dataset_id}`);
  for (const d of sources?.datasets || []) cite(d.url, `${d.title} (${d.used_for})`);
  const targetSources = (sources?.targets || []).find((t) => t.id === target.id);
  for (const [key, meta] of Object.entries(targetSources?.criteria || {})) {
    if (meta?.source_url) cite(meta.source_url, `Target value, ${key}: ${meta.dataset_id || ""}`);
  }
  const citeList = [...cites].map(([url, text]) => `<li>${esc(text)}. <a href="${esc(url)}">${esc(url)}</a></li>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: ${esc(site.label)}</title><style>${CSS}</style></head>
<body><main>
<header>
  <p class="kicker">TerraNova · ${esc(mission)} rehearsal on Earth</p>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(site.label)} · ${coord(site.lat, site.lon)}</p>
  <p class="meta">Generated ${esc(generated)} by TerraNova (NASA Space Apps 2026 project). Not a NASA product; no NASA endorsement is implied.</p>
</header>

<section><h2>1. Site summary</h2>
  <table><tbody>${summary.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("")}</tbody></table>
</section>

${figs ? `<section><h2>2. The ground</h2>${figs}</section>` : ""}

<section><h2>${figs ? 3 : 2}. EVA traverse</h2>${traverseSection}</section>

<section><h2>${figs ? 4 : 3}. Terrain statistics (scored cell)</h2><div class="grid">${terrainRows}</div>${coverageNote}</section>

<section><h2>${figs ? 5 : 4}. Hardware test readiness</h2>${readinessSection}</section>

${criteriaSection ? `<section><h2>${figs ? 6 : 5}. Criterion by criterion</h2>${criteriaSection}
  ${claims ? `<h3>Why, in words</h3><ul>${claims}</ul>` : ""}</section>` : ""}

<section><h2>Method and caveats</h2>
  <ul>
    <li>The match score is a weighted geometric mean of per-criterion similarities on a global 0.5° grid; any criterion at zero similarity vetoes the cell. Scores rank Earth places against the target; they are not a probability.</li>
    <li>Terrain and the route come from AWS Terrain Tiles at zoom 10 (about ${Math.round(terrain.stats.slope_baseline_m)} m per pixel here). Slopes measured over shorter distances read steeper, so planetary slope values measured at metre scale are not directly comparable.</li>
    <li>Readiness verdicts are TerraNova screening thresholds, each linked to its source. They are not NASA certification criteria.</li>
    <li>Walking times use Tobler's hiking function for an unencumbered walker on Earth; a suited EVA under lunar or Martian gravity will differ.</li>
    ${caveats}
  </ul>
</section>

<section><h2>Citations</h2><ol class="cites">${citeList}</ol></section>

<footer>TerraNova mission dossier · ${esc(site.label)} · ${esc(generated)}</footer>
</main></body></html>`;
}
