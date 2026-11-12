/* Hardware test readiness matrix (Feature 3). Rendering only: every value, threshold and
 * verdict comes from GET /api/qualification (src/compute/qualification.py). */

import { icon } from "./ui.js";
import { escapeHtml as esc } from "./format.js";

const STATUS = {
  pass: ["check-circle", "Pass"],
  near: ["warning", "Near"],
  fail: ["x", "Fail"],
  no_data: ["minus", "No data"],
};
const VERDICT_ICON = { ready: "check-circle", partial: "warning", not_suited: "x" };

/* One request per place: a rescore re-renders the site card, but readiness depends only
 * on the place, so the answer is reused. Failures are not kept. */
const cache = new Map();

export function fetchReadiness(lat, lon, { terrain = false } = {}) {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (terrain) qs.set("terrain", "1");
  const key = qs.toString();
  if (!cache.has(key)) {
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    const job = fetch(`/api/qualification?${qs}`).then((res) => {
      if (!res.ok) throw new Error(`readiness unavailable (${res.status})`);
      return res.json();
    });
    job.catch(() => cache.delete(key));
    cache.set(key, job);
  }
  return cache.get(key);
}

/* A value with its unit, as the API returns it. */
export function readinessValue(value, unit) {
  if (value === null || value === undefined) return "no data";
  if (unit === "share") return `${Math.round(value * 100)}%`;
  if (unit === "fraction") return value >= 1 ? "basaltic" : value >= 0.5 ? "intermediate volcanic" : "not volcanic";
  if (unit === "NDVI") return `NDVI ${value.toFixed(2)}`;
  if (unit === "degrees" || unit === "°") return `${value.toFixed(unit === "°" ? 1 : 2)}°`;
  const abs = Math.abs(value);
  const text = abs >= 100 ? Math.round(value).toLocaleString("en-US") : abs >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${text} ${unit}`;
}

function thresholdText(row) {
  const op = row.comparison === "<=" ? "≤" : "≥";
  const basis = row.threshold_basis === "fixed" ? "" : ` (${row.threshold_basis})`;
  return `${op} ${readinessValue(row.threshold, row.unit)}${basis}`;
}

/* The matrix as HTML: one collapsible block per test category, requirements as a table. */
export function readinessHtml(data, { open = false } = {}) {
  if (!data?.categories) return `<p class="hint">Readiness unavailable for this place.</p>`;
  const cats = data.categories.map((c) => {
    const rows = c.requirements.map((r) => {
      const [mark, word] = STATUS[r.status] || STATUS.no_data;
      return `<tr class="rd-${esc(r.status)}">
        <th scope="row" title="${esc(r.why)}">${esc(r.label)}</th>
        <td class="num">${esc(readinessValue(r.value, r.unit))}</td>
        <td class="num"><a href="${esc(r.threshold_source_url)}" target="_blank" rel="noopener" title="${esc(r.why)}">${esc(thresholdText(r))}</a></td>
        <td class="rd-status">${icon(mark)}${word}</td>
      </tr>`;
    }).join("");
    return `<details class="rd-cat rd-${esc(c.verdict)}" ${open ? "open" : ""}>
      <summary><span class="rd-name">${esc(c.name)}</span>
        <span class="rd-verdict">${icon(VERDICT_ICON[c.verdict] || "info")}${esc(c.verdict_label)}</span>
        <small class="rd-system"><a href="${esc(c.system_url)}" target="_blank" rel="noopener">${esc(c.system)}</a></small></summary>
      <table class="rd-reqs"><thead><tr><th>Requirement</th><th>Site</th><th>Threshold</th><th>Result</th></tr></thead>
        <tbody>${rows}</tbody></table>
    </details>`;
  }).join("");
  return `${cats}
    <p class="hint rd-note">Rover terrain: ${esc(data.terrain_basis)}. TerraNova screening thresholds, each linked to its
      source; not NASA certification. TRL 5-6 means testing in a relevant environment
      (<a href="${esc(data.trl_source_url)}" target="_blank" rel="noopener">NASA TRL</a>).</p>`;
}
