// Analog zones: glowing outlines around the regions of Earth whose analog score is in
// the top share of land. Pure drawing over the score field the API already returned;
// the threshold is a percentile of that field, like the legend's "top 10%" mark.

export const ZONE_SHARE = 0.02;          // outline the best 2% of scorable land
const cache = { field: null, share: 0, cells: null, segs: null, n: 0 };

// Marching squares on cell centres -> line segments in grid units (x: 0..720, y: 0..360).
// Corner order tl, tr, br, bl; each case lists edges joined: T, R, B, L (square midpoints).
const CASES = {
  1: [["L", "B"]], 2: [["B", "R"]], 3: [["L", "R"]], 4: [["T", "R"]], 5: [["T", "L"], ["B", "R"]],
  6: [["T", "B"]], 7: [["T", "L"]], 8: [["T", "L"]], 9: [["T", "B"]], 10: [["T", "R"], ["L", "B"]],
  11: [["T", "R"]], 12: [["L", "R"]], 13: [["B", "R"]], 14: [["L", "B"]],
};

function build(field, threshold) {
  const W = 720, H = 360;
  const on = (r, c) => r >= 0 && r < H && c >= 0 && c < W && field[r * W + c] >= threshold ? 1 : 0;
  const cells = [], segs = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (on(r, c)) cells.push(r * W + c);
  for (let r = -1; r < H; r++) {
    for (let c = -1; c < W; c++) {
      const k = on(r, c) * 8 + on(r, c + 1) * 4 + on(r + 1, c + 1) * 2 + on(r + 1, c);
      const pairs = CASES[k];
      if (!pairs) continue;
      const x0 = c + 0.5, y0 = r + 0.5;
      const P = { T: [x0 + 0.5, y0], R: [x0 + 1, y0 + 0.5], B: [x0 + 0.5, y0 + 1], L: [x0, y0 + 0.5] };
      for (const [a, b] of pairs) segs.push(P[a][0], P[a][1], P[b][0], P[b][1]);
    }
  }
  return { cells, segs };
}

/** Returns a decorate(ctx, scale) function for Globe/FlatMap.setOverlay, or null. */
export function zoneDecorator(field, sorted, share = ZONE_SHARE) {
  if (!field || !sorted?.length) return null;
  if (cache.field !== field || cache.share !== share) {
    const threshold = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - share)))];
    Object.assign(cache, { field, share, ...build(field, threshold) });
    cache.n = cache.cells.length;
  }
  const { cells, segs } = cache;
  return (ctx, s) => {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(segs[i] * s, segs[i + 1] * s);
      ctx.lineTo(segs[i + 2] * s, segs[i + 3] * s);
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // dark under-stroke so the line reads on the pale "best match" colours, then a glowing amber line
    ctx.strokeStyle = "rgba(10, 6, 0, 0.75)"; ctx.lineWidth = 2.6 * s; ctx.stroke();
    ctx.shadowColor = "rgba(255, 170, 40, 1)"; ctx.shadowBlur = 4 * s;
    ctx.strokeStyle = "rgb(255, 205, 96)"; ctx.lineWidth = 1.3 * s;
    ctx.stroke();
    ctx.restore();
  };
}

export const zoneCellCount = () => cache.n;

/* Keep the named top-3 tags on the map readable: a tag that overlaps a better-ranked
   tag first flips to the marker's left side, and hides (until hover) if it still overlaps. */
let declutterTimer = 0;
export function startTagDeclutter(container) {
  clearInterval(declutterTimer);
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  declutterTimer = setInterval(() => {
    const placed = [];
    const markers = [...container.querySelectorAll(".marker.named")]
      .sort((a, b) => Number(a.firstChild.textContent) - Number(b.firstChild.textContent));
    for (const m of markers) {
      const tag = m.querySelector(".mk-tag");
      if (!tag) continue;
      m.classList.remove("tag-flip", "tag-hide");
      let r = tag.getBoundingClientRect();
      const clash = () => placed.some((p) => overlaps(r, p)) || [...markers].some((o) => o !== m && overlaps(r, o.getBoundingClientRect()));
      if (clash()) { m.classList.add("tag-flip"); r = tag.getBoundingClientRect(); }
      if (clash()) { m.classList.add("tag-hide"); continue; }
      placed.push(r);
    }
  }, 300);
}
