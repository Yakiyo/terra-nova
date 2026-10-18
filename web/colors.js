/* Colour ramps for the data overlays.
 *
 * Each ramp is a list of stops: [t, r, g, b, alpha], t in 0..1.
 *   score        single-hue red, coloured by rank percentile of land cells;
 *                low scores fade to transparent so the NASA imagery shows through
 *   precipitation  teal, dry (dark) to wet (light)
 *   vegetation   bare tan to deep green: brown and green are the familiar
 *                "bare ground vs plants" pair
 *   orangeWhite  single-hue: white (small) to deep orange (large), for the two
 *                temperature *swing* layers. A swing is a size, not a temperature,
 *                so it must not look hot or cold.
 *   blueRed      diverging blue (cold) - neutral grey - red (hot), used only for
 *                mean temperature, centred on 0 C
 *   phthalo      terrain (slope, roughness, elevation): pale mint to dark
 *                phthalo green (#123524), so rugged, high ground reads dark
 */

export const RAMPS = {
  score: [
    [0.0, 65, 5, 17, 0.0],
    [0.25, 125, 9, 33, 0.38],
    [0.5, 190, 16, 44, 0.58],
    [0.75, 242, 29, 56, 0.78],
    [0.92, 255, 106, 126, 0.9],
    [1.0, 255, 220, 225, 0.96],
  ],
  precipitation: [
    [0.0, 8, 44, 48, 0.55],
    [0.35, 18, 104, 98, 0.72],
    [0.7, 38, 176, 150, 0.84],
    [1.0, 206, 246, 228, 0.92],
  ],
  vegetation: [
    [0.0, 201, 168, 107, 0.82],
    [0.25, 190, 186, 104, 0.84],
    [0.5, 128, 170, 72, 0.88],
    [0.75, 54, 132, 48, 0.9],
    [1.0, 12, 84, 28, 0.94],
  ],
  orangeWhite: [
    [0.0, 250, 247, 242, 0.62],
    [0.3, 250, 214, 170, 0.76],
    [0.6, 242, 150, 72, 0.86],
    [1.0, 176, 70, 8, 0.94],
  ],
  blueRed: [
    [0.0, 33, 84, 170, 0.88],
    [0.25, 104, 154, 214, 0.84],
    [0.5, 214, 211, 204, 0.72],
    [0.75, 226, 118, 92, 0.86],
    [1.0, 170, 26, 32, 0.92],
  ],
  phthalo: [
    [0.0, 226, 240, 232, 0.55],
    [0.3, 132, 190, 162, 0.72],
    [0.6, 44, 116, 86, 0.86],
    [1.0, 18, 53, 36, 0.95],
  ],
};

/* Which ramp each layer uses, and whether it is centred on a value (diverging). */
export const LAYER_RAMPS = {
  precipitation: { ramp: "precipitation" },
  vegetation: { ramp: "vegetation" },
  annual_temperature_range: { ramp: "orangeWhite" },
  lst_diurnal_range: { ramp: "orangeWhite" },
  mean_annual_temperature: { ramp: "blueRed", center: 0 },
  slope: { ramp: "phthalo" },
  roughness: { ramp: "phthalo" },
  elevation: { ramp: "phthalo" },
};

function sample(stops, t) {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (x - a[0]) / (b[0] - a[0] || 1);
      return [0, 1, 2, 3].map((k) => a[k + 1] + (b[k + 1] - a[k + 1]) * f);
    }
  }
  return stops[stops.length - 1].slice(1);
}

export function cssGradient(name) {
  const stops = RAMPS[name] || RAMPS.precipitation;
  const parts = stops.map(([t, r, g, b, a]) => `rgba(${r},${g},${b},${Math.max(a, 0.15)}) ${t * 100}%`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/* Percentile thresholds of the finite values, for rank colouring and legends. */
export function sortedFinite(values) {
  const out = [];
  for (const v of values) if (Number.isFinite(v)) out.push(v);
  return Float64Array.from(out).sort();
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

function rankOf(sorted, v) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

/* Position (0..1) of a value on a layer's ramp. With a centre, the ramp is
 * symmetric about it, so the neutral midpoint means "the centre value". */
export function rampPosition(v, lo, hi, center) {
  if (center === undefined || center === null) return (v - lo) / (hi - lo || 1);
  const half = Math.max(Math.abs(lo - center), Math.abs(hi - center)) || 1;
  return 0.5 + (v - center) / (2 * half);
}

/* Paint a 720x360 grid into RGBA pixels.
 * mode "score": only the top (1 - floor) of land cells are coloured, by rank.
 * mode "predictor": opts.ramp, linear between lo and hi (or centred on opts.center). */
export function paint(values, width, height, mode, opts = {}) {
  const image = new ImageData(width, height);
  const px = image.data;
  if (mode === "score") {
    const sorted = opts.sorted || sortedFinite(values);
    const floor = opts.floor ?? 0.5;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      const p = rankOf(sorted, v);
      if (p < floor) continue;
      const [r, g, b, a] = sample(RAMPS.score, (p - floor) / (1 - floor));
      const o = i * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(a * 255);
    }
  } else {
    const { lo, hi, center } = opts;
    const stops = RAMPS[opts.ramp] || RAMPS.precipitation;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      const [r, g, b, a] = sample(stops, rampPosition(v, lo, hi, center));
      const o = i * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(a * 255);
    }
  }
  return image;
}

export function percentileOf(sorted, v) {
  return Number.isFinite(v) ? rankOf(sorted, v) * 100 : NaN;
}
