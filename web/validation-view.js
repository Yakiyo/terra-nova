// Validation tab as a short scientific paper: protocol strip, ROC curve, separation
// strip plot, leave-one-out matrix and dataset-agreement bars. Pure rendering from the
// /api/score validation block, the robustness report and /api/datachecks.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tip = (t) => `<span class="vv-tip" tabindex="0" role="note" aria-label="${esc(t)}" data-tip="${esc(t)}">i</span>`;

function rocPoints(pos, neg) {
  const all = [...pos.map((s) => [s, 1]), ...neg.map((s) => [s, 0])].sort((a, b) => b[0] - a[0]);
  const pts = [[0, 0]]; let tp = 0, fp = 0;
  for (let i = 0; i < all.length; i++) {
    all[i][1] ? tp++ : fp++;
    if (i === all.length - 1 || all[i + 1][0] !== all[i][0]) pts.push([fp / neg.length, tp / pos.length]);
  }
  return pts;
}

function rocSvg(v) {
  const pos = v.controls.filter((c) => c.role === "positive" && c.score != null).map((c) => c.score);
  const neg = v.controls.filter((c) => c.role === "negative" && c.score != null).map((c) => c.score);
  if (!pos.length || !neg.length) return "";
  const W = 220, P = 26, S = W - P - 8, X = (x) => P + x * S, Y = (y) => 8 + (1 - y) * S;
  const pts = rocPoints(pos, neg);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("");
  const area = `${d}L${X(1)},${Y(0)}L${X(0)},${Y(0)}Z`;
  const grid = [0.25, 0.5, 0.75].map((g) => `<line x1="${X(g)}" y1="${Y(0)}" x2="${X(g)}" y2="${Y(1)}"/><line x1="${X(0)}" y1="${Y(g)}" x2="${X(1)}" y2="${Y(g)}"/>`).join("");
  return `<svg class="vv-roc" viewBox="0 0 ${W} ${W}" role="img" aria-label="ROC curve, AUC ${v.auc.toFixed(2)}">
    <g class="vv-grid">${grid}</g>
    <rect class="vv-frame" x="${X(0)}" y="${Y(1)}" width="${S}" height="${S}"/>
    <line class="vv-chance" x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}"/>
    <path class="vv-area" d="${area}"/><path class="vv-curve" d="${d}"/>
    <text class="vv-ax" x="${X(0.5)}" y="${W - 2}" text-anchor="middle">false alarms →</text>
    <text class="vv-ax" transform="translate(10 ${Y(0.5)}) rotate(-90)" text-anchor="middle">analogs found →</text>
    <text class="vv-auc" x="${X(0.96)}" y="${Y(0.1)}" text-anchor="end">AUC ${v.auc.toFixed(2)}</text>
    <text class="vv-ax" x="${X(0.62)}" y="${Y(0.5) + 4}" transform="rotate(-45 ${X(0.62)} ${Y(0.5) + 4})">chance</text>
  </svg>`;
}

function stripPlot(v) {
  const row = (role, cls, label) => {
    const items = v.controls.filter((c) => c.role === role && c.percentile != null);
    return `<div class="vv-lane ${cls}"><span class="vv-lane-label">${label} <b>${items.length}</b></span><div class="vv-track">
      ${items.map((c) => `<span class="vv-mark" style="left:${c.percentile.toFixed(1)}%" tabindex="0" data-tip="${esc(c.name)} · beats ${c.percentile.toFixed(0)}% of Earth's land"></span>`).join("")}
    </div></div>`;
  };
  return `<div class="vv-strip">
    ${row("positive", "is-pos", "Known analogs")}
    ${row("negative", "is-neg", "Non-analogs")}
    <div class="vv-scale"><span>0%</span><span>50%</span><span>100% of Earth's land scores lower</span></div>
  </div>`;
}

function looMatrix(robust) {
  if (robust?.failed) return `<p class="hint">The leave-one-out check couldn't run. It runs again with the next change.</p>`;
  const rows = robust?.sensitivity;
  if (!rows?.length) return `<p class="hint vv-loading">Running the leave-one-out check…</p>`;
  return `<div class="vv-loo">${rows.map((x) => `<div class="vv-loo-row">
      <span class="vv-loo-name">− ${esc(x.label)}</span>
      <span class="vv-bar"><i style="width:${((x.auc ?? 0) * 100).toFixed(0)}%"></i></span>
      <span class="num">${x.auc == null ? "–" : x.auc.toFixed(2)}</span>
      <span class="vv-loo-top">${x.top_unchanged ? `<em class="ok">✓ same #1</em>` : `<em class="chg" title="${esc(x.top_site || "")}">#1 → ${esc(x.top_site || "–")}</em>`}</span>
    </div>`).join("")}</div>`;
}

function agreeBars(checks, failed) {
  if (failed) return `<p class="hint">The dataset agreement checks couldn't be loaded.</p>`;
  if (!checks) return `<p class="hint vv-loading">Loading dataset checks…</p>`;
  return `<div class="vv-agree">${checks.map((c) => `<div class="vv-agree-row" title="${esc(c.why)}">
      <span class="vv-agree-name">${esc(c.title)}</span>
      <span class="vv-bar"><i style="width:${(Math.abs(c.rho ?? 0) * 100).toFixed(0)}%"></i></span>
      <span class="num">ρ ${c.rho == null ? "–" : c.rho.toFixed(2)}</span>
      <span>${c.passed ? `<em class="ok">✓ agrees</em>` : `<em class="chg">check</em>`}</span>
    </div>`).join("")}</div>`;
}

export function validationHtml(v, robust, checks, checksFailed) {
  const pos = v.controls.filter((c) => c.role === "positive" && c.percentile != null);
  const neg = v.controls.filter((c) => c.role === "negative" && c.percentile != null);
  const minPos = pos.length ? Math.min(...pos.map((c) => c.percentile)) : null;
  const maxNeg = neg.length ? Math.max(...neg.map((c) => c.percentile)) : null;
  const sameTop = robust?.sensitivity?.filter((x) => x.top_unchanged).length;
  const verdict = v.auc >= 0.95 ? "Strong separation" : v.auc >= 0.8 ? "Good separation" : "Weak separation";
  const steps = ["Pick controls", "Score them blind", "ROC curve", "Stress tests", "Verdict"];
  return `<div class="vv">
    <ol class="vv-protocol">${steps.map((s, i) => `<li><b>${i + 1}</b>${s}</li>`).join("")}</ol>

    <section class="vv-card vv-hero">
      ${rocSvg(v)}
      <div class="vv-hero-text">
        <span class="vv-kicker">Can the model tell analogs apart? ${tip("ROC-AUC: the chance that a random known analog scores higher than a random non-analog. 0.5 is a coin flip; 1.00 is perfect.")}</span>
        <div class="vv-big num">${v.auc.toFixed(2)}</div>
        <p class="vv-verdict">${verdict}</p>
        <p class="hint">${v.auc >= 0.999 ? "Every known analog scores above every non-analog." : `Known analogs usually outrank non-analogs.`} Tested on ${v.positives} known analog sites and ${v.negatives} non-analogs (rainforest, farmland, cities).</p>
      </div>
    </section>

    <section class="vv-card">
      <h4 class="vv-h">Two groups, no overlap ${tip("Each mark is one control site, placed by the share of Earth's land it outscores. Hover a mark for its name.")}</h4>
      ${stripPlot(v)}
      ${minPos != null && maxNeg != null ? `<p class="vv-read">${minPos > maxNeg ? `The lowest known analog still beats <b>${minPos.toFixed(0)}%</b> of land; the best non-analog only <b>${maxNeg.toFixed(0)}%</b>.` : `Some overlap: the lowest known analog beats ${minPos.toFixed(0)}% of land, the best non-analog ${maxNeg.toFixed(0)}%.`}</p>` : ""}
    </section>

    <section class="vv-card">
      <h4 class="vv-h">Remove one dataset at a time ${tip("Each row drops one condition and re-scores the whole Earth. If the AUC stays high, no single dataset decides the result.")}</h4>
      ${looMatrix(robust)}
      ${sameTop != null ? `<p class="vv-read">No single dataset decides the result: the #1 site stays the same in <b>${sameTop} of ${robust.sensitivity.length}</b> tests.</p>` : ""}
    </section>

    <section class="vv-card">
      <h4 class="vv-h">Do independent datasets agree? ${tip("Spearman rank correlation over land cells between datasets that physics says must agree.")}</h4>
      ${agreeBars(checks, checksFailed)}
    </section>

    <details class="vv-method"><summary>Method and limits</summary><div>
      <p class="hint">${esc(v.method)}</p>
      <p class="hint">A high AUC shows the score separates known analogs from clearly non-analog places. It does not prove that every ranked site is an analog. Geology-only sites are excluded from the score.</p>
    </div></details>
  </div>`;
}
