/* EVA traverse (Feature 5): request and rendering only. Every number about the route
 * (distances, elevations, grades, terrain slopes, hazards, walking time) comes from
 * POST /api/traverse (src/compute/traverse.py); this file only formats and draws it. */

import { escapeHtml as esc } from "./format.js";

const NAMES = ["Basecamp", "Science Station", "Drill Site"];
export const MAX_WAYPOINTS = 8;

export function defaultName(i) {
  return NAMES[i] || `Waypoint ${i + 1}`;
}

export async function fetchTraverse(site, waypoints, signal) {
  const res = await fetch("/api/traverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: site.lat, lon: site.lon, waypoints: waypoints.map(({ lat, lon, name }) => ({ lat, lon, name })) }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Route analysis failed (${res.status}).`);
  }
  return res.json();
}

export function fmtKm(km) {
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

export function fmtHours(h) {
  const minutes = Math.round(h * 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function fmtShare(x) {
  return x > 0 && x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`;
}

/* The elevation profile as SVG, with hazard bands and waypoint ticks. `inline` writes the
 * colours as attributes, for the stand-alone dossier file that has no stylesheet. */
export function profileChart(route, { width = 268, height = 112, inline = false, roverDot = false } = {}) {
  const s = route.samples;
  const total = route.total.distance_km || 1;
  const n = s.d_km.length;
  const step = Math.max(1, Math.ceil(n / 600));   // draw at most ~600 points; hazards come from the server
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  let lo = Infinity, hi = -Infinity;
  for (const e of s.elev_m) { lo = Math.min(lo, e); hi = Math.max(hi, e); }
  const pad = 4, top = 16;
  const x = (d) => pad + (d / total) * (width - 2 * pad);
  const y = (e) => height - pad - ((e - lo) / (hi - lo || 1)) * (height - pad - top);
  const line = idx.map((i, k) => `${k ? "L" : "M"}${x(s.d_km[i]).toFixed(1)},${y(s.elev_m[i]).toFixed(1)}`).join("");
  const paint = (cls, attrs) => (inline ? attrs : `class="${cls}"`);
  const bands = route.hazards.map((h) => {
    const x0 = x(h.start_km), w = Math.max(1.5, x(h.end_km) - x0);
    return `<rect ${paint("hz", 'fill="#f21d38" fill-opacity="0.22"')} x="${x0.toFixed(1)}" y="${top - 4}" width="${w.toFixed(1)}" height="${height - top + 4 - pad}"><title>Over ${route.limit_deg}° for ${Math.round(h.length_m)} m (max ${h.max_slope_deg.toFixed(1)}°)</title></rect>`;
  }).join("");
  const ticks = route.waypoints.map((w, i) => {
    const xx = x(w.d_km).toFixed(1);
    return `<line ${paint("wp", 'stroke="#555" stroke-dasharray="2 2" stroke-width="0.8"')} x1="${xx}" x2="${xx}" y1="${top - 2}" y2="${height - pad}"/>
      <text ${paint("wp-label", 'fill="#1f5fbf" font-size="9" font-weight="700"')} x="${xx}" y="9" text-anchor="${i === 0 ? "start" : i === route.waypoints.length - 1 ? "end" : "middle"}">${i + 1}</text>`;
  }).join("");
  const label = `Elevation profile, ${fmtKm(route.total.distance_km)}, from ${Math.round(s.elev_m[0])} to ${Math.round(s.elev_m[n - 1])} metres, ${route.hazards.length} stretch${route.hazards.length === 1 ? "" : "es"} over ${route.limit_deg} degrees`;
  const svg = `<svg viewBox="0 0 ${width} ${height}" class="ge-chart" role="img" aria-label="${esc(label)}" ${inline ? `width="100%" style="max-width:${width * 2.4}px" font-family="sans-serif"` : ""}>
    ${bands}
    <path d="${line}L${x(total)},${height}L${x(0)},${height}Z" ${paint("area", 'fill="#1f5fbf" fill-opacity="0.12"')}/>
    <path d="${line}" ${paint("stroke", 'fill="none" stroke="#1f5fbf" stroke-width="1.6"')}/>
    ${ticks}
    ${roverDot ? `<circle id="geRoverDot" r="3.5" cx="${x(0)}" cy="${y(s.elev_m[0])}" class="dot"/>` : ""}
    <text ${paint("", 'fill="#555" font-size="8"')} x="${width - pad}" y="${top + 6}" text-anchor="end">${Math.round(hi)} m</text>
    <text ${paint("", 'fill="#555" font-size="8"')} x="${width - pad}" y="${height - 6}" text-anchor="end">${Math.round(lo)} m</text>
  </svg>`;
  return { svg, x, y };
}

/* Route totals as label/value pairs. */
export function totalsList(route) {
  const t = route.total;
  return [
    ["Distance", fmtKm(t.distance_km)],
    ["Walking time", fmtHours(t.walk_hours)],
    ["Climb", `${Math.round(t.climb_m).toLocaleString("en-US")} m`],
    ["Descent", `${Math.round(t.descent_m).toLocaleString("en-US")} m`],
    ["Steepest grade", `${t.max_grade_deg.toFixed(1)}°`],
    ["Steepest ground", `${t.max_terrain_slope_deg.toFixed(1)}°`],
    [`Over ${route.limit_deg}° (rover hazard)`, fmtShare(t.share_over_limit)],
    ["Hazard stretches", String(route.hazards.length)],
  ];
}

export function legsTable(route) {
  const rows = route.legs.map((l, i) => {
    const hz = route.hazards.filter((h) => h.leg === i).length;
    return `<tr><th scope="row">${i + 1}. ${esc(l.from)} → ${esc(l.to)}</th>
      <td class="num">${fmtKm(l.distance_km)}</td>
      <td class="num">+${Math.round(l.climb_m)} / −${Math.round(l.descent_m)} m</td>
      <td class="num">${l.max_terrain_slope_deg.toFixed(1)}°</td>
      <td class="num">${fmtShare(l.share_over_limit)}${hz ? ` (${hz})` : ""}</td>
      <td class="num">${fmtHours(l.walk_hours)}</td></tr>`;
  }).join("");
  return `<table class="tr-legs"><thead><tr><th>Leg</th><th>Distance</th><th>Climb / descent</th><th>Steepest ground</th><th>Over ${route.limit_deg}°</th><th>Walk</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* Legs as a compact list, for the narrow God's Eye panel (the dossier uses legsTable). */
export function legsList(route) {
  return `<ol class="tr-legs-list">${route.legs.map((l, i) => {
    const hz = route.hazards.filter((h) => h.leg === i).length;
    return `<li><b>${esc(l.from)} → ${esc(l.to)}</b>
      <span class="num">${fmtKm(l.distance_km)} · +${Math.round(l.climb_m)} / −${Math.round(l.descent_m)} m · ${fmtHours(l.walk_hours)}</span>
      <span class="num">Steepest ground ${l.max_terrain_slope_deg.toFixed(1)}° · over ${route.limit_deg}°: ${fmtShare(l.share_over_limit)}${hz ? `, ${hz} stretch${hz === 1 ? "" : "es"}` : ""}</span></li>`;
  }).join("")}</ol>`;
}

/* The route as GeoJSON: one LineString with the totals, and a Point per waypoint. */
export function routeGeojson(route, meta) {
  const s = route.samples;
  const stride = Math.max(1, Math.ceil(s.d_km.length / 2000));
  const coords = [];
  const w = route.waypoints;
  const at = (i) => [s.lon[i], s.lat[i], Math.round(s.elev_m[i])];
  for (let i = 0; i < s.d_km.length; i += stride) coords.push(at(i));
  const last = s.d_km.length - 1;
  if ((last % stride) !== 0) coords.push(at(last));
  return {
    type: "FeatureCollection",
    properties: meta,
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: coords },
        properties: { kind: "traverse", ...route.total, limit_deg: route.limit_deg, hazards: route.hazards, legs: route.legs,
          elevation_source: route.provenance, walking_model: route.walking_model } },
      ...w.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat, p.elev_m] },
        properties: { kind: "waypoint", index: p.index + 1, name: p.name, along_km: p.d_km, elevation_m: p.elev_m, terrain_slope_deg: p.terrain_slope_deg } })),
    ],
  };
}
