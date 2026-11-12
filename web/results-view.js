// Results tab, built to be read at a glance:
//  - a headline card (best match, how many are new, countries, stability)
//  - sites grouped by world region (matching the amber zones on the map)
//  - a "match fingerprint" per site: one segment per condition, coloured by closeness
// Every number shown comes from the /api/score payload (and /api/robustness).

const REGIONS = [
  ["Antarctica", (la) => la < -60],
  ["The Americas", (la, lo) => lo < -30],
  ["Australia & Oceania", (la, lo) => lo >= 110 && la < 0],
  ["Middle East & Central Asia", (la, lo) => lo >= 35 && lo < 95 && la >= 25 && la < 56],
  ["East Asia", (la, lo) => lo >= 95 && la >= 0 && la < 56],
  ["Northern Asia & Arctic", (la, lo) => lo >= 35 && la >= 56],
  ["Europe", (la, lo) => lo >= -30 && lo < 35 && la >= 37],
  ["Africa & Arabia", (la, lo) => lo >= -30 && lo < 65 && la < 37],
  ["South & Southeast Asia", () => true],
];
// Rank changes between two rankings of the same target, so a weight change is visible.
let lastRanking = null;   // { key, ranks: Map(index -> rank) }
let lastDiff = null;      // { key, moves: Map(index -> delta | "new"), added, moved }
function diffRanking(d, key) {
  // Same place = same name: with new weights the best 0.5° cell inside a region can shift.
  const id = (r) => r.label?.text || String(r.index);
  const ranks = new Map(d.results.map((r) => [id(r), r.rank]));
  if (lastRanking && lastRanking.key === key && lastRanking.sig !== d.results.map(id).join()) {
    const moves = new Map();
    let added = 0, moved = 0;
    for (const r of d.results) {
      const old = lastRanking.ranks.get(id(r));
      if (old === undefined) { moves.set(id(r), "new"); added++; }
      else if (old !== r.rank) { moves.set(id(r), old - r.rank); moved++; }
    }
    lastDiff = { key, moves, added, moved };
  } else if (!lastRanking || lastRanking.key !== key) {
    lastDiff = null;
  }
  lastRanking = { key, ranks, sig: d.results.map(id).join() };
}

export const regionOf = (lat, lon) => REGIONS.find(([, f]) => f(lat, lon))[0];

const band = (s) => (s >= 0.9 ? "fp-a" : s >= 0.75 ? "fp-b" : s >= 0.5 ? "fp-c" : "fp-d");
const word = (s) => (s >= 0.9 ? "very close" : s >= 0.75 ? "close" : s >= 0.5 ? "partly" : "far off");

function fingerprint(r, d, deps) {
  const keys = deps.criteria.map((c) => c.key).filter((k) => r.similarities?.[k] !== null && r.similarities?.[k] !== undefined);
  return `<span class="fp" role="img" aria-label="${keys.map((k) => `${deps.label(k)} ${word(r.similarities[k])}`).join(", ")}">${keys.map((k) => {
    const c = deps.criteria.find((x) => x.key === k), s = r.similarities[k];
    const tip = `${c.label}: ${deps.fmtValue(r.values[k], c.unit)} here, target ${deps.fmtValue(d.effective_profile?.[k], c.unit)} · ${Math.round(s * 100)}% close`;
    return `<i class="${band(s)}" title="${deps.esc(tip)}"><b>${deps.esc(deps.short(c))}</b></i>`;
  }).join("")}</span>`;
}

function novelty(r, deps) {
  const n = r.novelty;
  if (!n) return "";
  if (n.status === "new") {
    return `<span class="rv-new" title="${deps.esc(`${Math.round(n.distance_km).toLocaleString()} km from the nearest catalogued analog (${n.nearest_known})`)}">New</span>`;
  }
  return `<span class="rv-known" title="${deps.esc(`${Math.round(n.distance_km).toLocaleString()} km from ${n.nearest_known}`)}">${deps.icon("rocket")} ${deps.esc(n.status === "known" ? "Known analog" : "Near")} ${deps.esc(n.nearest_known)}</span>`;
}

export function headlineHtml(d, deps) {
  diffRanking(d, deps.rankingKey);
  const rows = d.results;
  if (!rows.length) return "";
  const best = rows[0];
  const countries = new Set(rows.map((r) => r.label.country).filter(Boolean)).size;
  const fresh = rows.filter((r) => r.novelty?.status === "new").length;
  const stab = rows.map((r) => deps.stabilityOf(r)).filter((v) => v !== null);
  const steady = stab.length === rows.length ? stab.filter((v) => v >= 0.999).length : null;
  return `<div class="rv-head">
    <small>Best match on Earth</small>
    <div class="rv-best"><b>${deps.esc(best.label.text.replace(/^near /, ""))}</b><span class="num">${deps.fmtPct(best.score)}</span></div>
    <ul class="rv-facts">
      <li><b class="num">${rows.length}</b> sites in <b class="num">${countries}</b> ${countries === 1 ? "country" : "countries"}</li>
      <li><b class="num">${fresh}</b> are <b class="rv-tag-new">new</b>: not in NASA's analog catalog</li>
      ${steady !== null ? `<li><b class="num">${steady}</b> of ${rows.length} hold their place in every robustness test</li>` : ""}
    </ul>
    ${lastDiff && (lastDiff.added || lastDiff.moved) ? `<p class="rv-change">Re-ranked after your change: ${[lastDiff.added ? `<b>${lastDiff.added}</b> new ${lastDiff.added === 1 ? "site" : "sites"}` : "", lastDiff.moved ? `<b>${lastDiff.moved}</b> moved` : ""].filter(Boolean).join(", ")}. Look for ▲ ▼ NEW in the list.</p>` : ""}
    ${d.filters?.new_only ? `<button type="button" class="link-button rv-known-toggle">Include known analog sites, to check the model finds NASA's test sites</button>` : ""}
  </div>`;
}

export function listHtml(d, deps) {
  const groups = [];
  for (const r of d.results) {
    const name = regionOf(r.lat, r.lon);
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [] }));
    g.rows.push(r);
  }
  const legend = `<li class="rv-legend" aria-hidden="true">Each strip shows how close a site is on every condition:
    <span><i class="fp-a"></i>very close</span><span><i class="fp-b"></i>close</span><span><i class="fp-c"></i>partly</span><span><i class="fp-d"></i>far off</span></li>`;
  return legend + groups.map((g, gi) => `
    <li class="rv-group"><details ${gi < 3 ? "open" : ""}>
      <summary><span>${deps.esc(g.name)}</span><small>${g.rows.length} ${g.rows.length === 1 ? "site" : "sites"} · best ${deps.fmtPct(g.rows[0].score)}</small></summary>
      <ol>${g.rows.map((r) => {
        const st = deps.stabilityOf(r);
        return `<li><button class="site rv-site ${deps.selected === r.index ? "active" : ""}" data-index="${r.index}" type="button"
            title="${deps.esc(`${r.label.text} · ${deps.coord(r.lat, r.lon)}`)}">
          <span class="rank num">${r.rank}</span>
          <span class="rv-main"><span class="name">${deps.esc(r.label.text.replace(/^near /, ""))}</span>
            <span class="rv-sub">${novelty(r, deps)}${st !== null && st < 0.999 ? `<span class="rv-unstable" title="Stays in the top 1% of land in ${deps.fmtPct(st)} of the robustness runs">${deps.fmtPct(st)} stable</span>` : ""}${deps.pinned(r) ? `<span class="pin-star">pinned</span>` : ""}</span>
            ${fingerprint(r, d, deps)}</span>
          <span class="rv-score num">${deps.fmtPct(r.score)}${(() => {
            const m = lastDiff?.moves.get(r.label?.text || String(r.index));
            if (m === undefined) return "";
            if (m === "new") return `<small class="rv-move rv-up">NEW</small>`;
            return `<small class="rv-move ${m > 0 ? "rv-up" : "rv-down"}">${m > 0 ? "▲" : "▼"}${Math.abs(m)}</small>`;
          })()}</span>
        </button></li>`;
      }).join("")}</ol>
    </details></li>`).join("");
}
