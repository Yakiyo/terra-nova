// Target picker: the planetary body drawn as a small globe with every target pinned
// where it really is, so a newcomer sees *where* each site is before reading anything.
// Pure 2D canvas (orthographic projection of the equirectangular texture), no WebGL,
// so it never competes with the main globe for a graphics context.

const TEXTURES = { Moon: "assets/moon_sm.jpg", Mars: "assets/mars_sm.jpg" };
const BLURB = {
  Moon: "Airless, with 300 °C day–night swings and polar ice in permanent shadow.",
  Mars: "Cold, hyper-arid desert with a thin atmosphere and buried ice.",
};
const texCache = new Map();
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const view = { body: null, lat: 0, lon: 0, anim: 0, drawn: false };

function loadTexture(body) {
  if (!texCache.has(body)) {
    texCache.set(body, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        resolve(g.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = reject;
      img.src = TEXTURES[body];
    }));
  }
  return texCache.get(body);
}

const rad = Math.PI / 180;

// Screen position (-1..1, y up) of lat/lon seen from (lat0, lon0); null when on the far side.
function project(lat, lon, lat0, lon0) {
  const p = lat * rad, l = (lon - lon0) * rad, p0 = lat0 * rad;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  if (cosc < 0.02) return null;
  return {
    x: Math.cos(p) * Math.sin(l),
    y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l),
  };
}

function draw(canvas, tex, lat0, lon0) {
  const n = canvas.width, g = canvas.getContext("2d");
  const out = g.createImageData(n, n), d = out.data, src = tex.data;
  const tw = tex.width, th = tex.height, r = n / 2;
  const sp0 = Math.sin(lat0 * rad), cp0 = Math.cos(lat0 * rad);
  for (let j = 0; j < n; j++) {
    const y = (r - j - 0.5) / r;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 - r) / r, rho2 = x * x + y * y;
      if (rho2 > 1) continue;
      const z = Math.sqrt(1 - rho2);
      // rotate view vector back to body coordinates
      const by = y * cp0 + z * sp0, bz = z * cp0 - y * sp0;
      const lat = Math.asin(by) / rad;
      let lon = lon0 + Math.atan2(x, bz) / rad;
      lon = ((lon + 540) % 360) - 180;
      const u = Math.min(tw - 1, ((lon + 180) / 360 * tw) | 0);
      const v = Math.min(th - 1, ((90 - lat) / 180 * th) | 0);
      const s = (v * tw + u) * 4, k = (j * n + i) * 4;
      const shade = 0.28 + 0.72 * Math.pow(z, 0.6);          // limb darkening
      d[k] = src[s] * shade; d[k + 1] = src[s + 1] * shade; d[k + 2] = src[s + 2] * shade;
      d[k + 3] = rho2 > 0.985 ? 255 * (1 - rho2) / 0.015 : 255;   // soft edge
    }
  }
  g.putImageData(out, 0, 0);
}

function placePins(box, sites, lat0, lon0, selectedId) {
  for (const pin of box.querySelectorAll(".tp-pin")) {
    const t = sites.find((s) => s.id === pin.dataset.id);
    const p = t && project(t.latitude, t.longitude, lat0, lon0);
    pin.hidden = !p;
    if (p) {
      pin.style.left = `${50 + p.x * 50}%`;
      pin.style.top = `${50 - p.y * 50}%`;
      pin.classList.toggle("is-left", p.x > 0.35);
    }
    pin.classList.toggle("is-on", pin.dataset.id === selectedId);
  }
}

function centreFor(sites, selected) {
  if (selected) return { lat: selected.latitude, lon: selected.longitude };
  const lat = sites.reduce((a, s) => a + s.latitude, 0) / sites.length;
  const lon = sites.reduce((a, s) => a + s.longitude, 0) / sites.length;
  return { lat: Math.max(-70, Math.min(70, lat)), lon };
}

function animateTo(box, canvas, tex, sites, target, selectedId) {
  cancelAnimationFrame(view.anim);
  const from = { lat: view.lat, lon: view.lon };
  let dLon = ((target.lon - from.lon + 540) % 360) - 180;
  const start = performance.now(), ms = reduced.matches || !view.drawn ? 0 : 700;
  view.drawn = true;
  const step = (now) => {
    const t = ms ? Math.min(1, (now - start) / ms) : 1, e = 1 - Math.pow(1 - t, 3);
    view.lat = from.lat + (target.lat - from.lat) * e;
    view.lon = from.lon + dLon * e;
    draw(canvas, tex, view.lat, view.lon);
    placePins(box, sites, view.lat, view.lon, selectedId);
    if (t < 1) view.anim = requestAnimationFrame(step);
  };
  view.anim = requestAnimationFrame(step);
}

const coord = (t) => `${Math.abs(t.latitude).toFixed(1)}°${t.latitude >= 0 ? "N" : "S"} ${Math.abs(t.longitude).toFixed(1)}°${t.longitude >= 0 ? "E" : "W"}`;

/**
 * Render the picker into `root`.
 * opts: { targets, selectedId, custom, onChoose(id), customId, esc, icon }
 */
export function renderTargetPicker(root, { targets, selectedId, custom, onChoose, customId, esc, icon }) {
  const bodies = [...new Set(targets.map((t) => t.body))];
  const selected = custom ? null : targets.find((t) => t.id === selectedId);
  if (!view.body || (selected && selected.body !== view.body && !root.dataset.manualBody)) view.body = selected?.body || bodies[0];
  delete root.dataset.manualBody;
  const body = view.body;
  const sites = targets.filter((t) => t.body === body);

  root.innerHTML = `
    <div class="tp-bodies" role="group" aria-label="Planetary body">
      ${bodies.map((b) => `<button type="button" class="tp-body" data-body="${esc(b)}" aria-pressed="${b === body}">${esc(b)}</button>`).join("")}
    </div>
    <div class="tp-stage">
      <div class="tp-globe${sites.some((t) => !custom && t.id === selectedId) ? "" : " tp-all-labels"}">
        <canvas width="440" height="440" aria-hidden="true"></canvas>
        ${sites.map((t) => `<button type="button" class="tp-pin" data-id="${esc(t.id)}" tabindex="-1" aria-hidden="true"><i></i><span>${esc(t.short_name)}</span></button>`).join("")}
      </div>
      <p class="tp-blurb">${esc(BLURB[body] || "")}</p>
      <a class="tp-learn" href="learn.html?world=${body === "Mars" ? "mars" : "moon"}"><span class="tp-learn-ball" style="background-image:url('assets/${body === "Mars" ? "mars" : "moon"}_sm.jpg')"></span><span><b>New to ${body === "Moon" ? "the Moon" : "Mars"}?</b><small>Interactive 2-minute intro: feel a day there, see what was tested on Earth</small></span><em aria-hidden="true">→</em></a>
      <button type="button" class="tp-tour" onclick="document.getElementById('startTour')?.click()">▶ Take the 60-second guided tour</button>
    </div>
    <ol class="tp-list" role="radiogroup" aria-label="${esc(body)} sites">
      ${sites.map((t) => `
        <li><button type="button" class="tp-site" role="radio" data-id="${esc(t.id)}" aria-checked="${!custom && t.id === selectedId}">
          <span class="tp-dot" aria-hidden="true"></span>
          <span class="tp-name">${esc(t.short_name)}<small>${esc(t.group)}</small></span>
          <span class="tp-coord">${coord(t)}</span>
        </button></li>`).join("")}
    </ol>
    <button type="button" class="tp-custom" role="radio" data-id="${esc(customId)}" aria-checked="${!!custom}">
      ${icon("sliders-horizontal")}<span>Or describe your own place<small>type the conditions yourself</small></span>
    </button>`;

  const canvas = root.querySelector("canvas"), globe = root.querySelector(".tp-globe");
  root.querySelectorAll(".tp-site, .tp-pin, .tp-custom").forEach((b) => b.addEventListener("click", () => onChoose(b.dataset.id)));
  root.querySelectorAll(".tp-body").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.body === view.body) return;
    view.body = b.dataset.body; view.lat = 0; view.lon = 0;
    root.dataset.manualBody = "1";
    renderTargetPicker(root, { targets, selectedId, custom, onChoose, customId, esc, icon });
  }));

  const centre = centreFor(sites, selected && selected.body === body ? selected : null);
  loadTexture(body).then((tex) => {
    if (!root.contains(canvas)) return;
    animateTo(globe, canvas, tex, sites, centre, custom ? null : selectedId);
  }).catch(() => globe.classList.add("tp-no-texture"));
}

/* Numbered "what this tab shows" lines for the tabs whose content app.js rebuilds.
   An observer re-adds the line whenever the panel is re-rendered. */
const INTROS = {
  explore: [3, "Compare any two conditions", "Plot the ranked sites and known analogs against two criteria of your choice."],
  validation: [4, "Why you can trust the ranking", "We check the scores against real analog sites and test how stable they are."],
};
export function installTabIntros(esc) {
  for (const [id, [n, title, sub]] of Object.entries(INTROS)) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    const add = () => {
      if (panel.firstElementChild?.classList.contains("tab-intro")) return;
      const p = document.createElement("p");
      p.className = "tab-intro";
      p.innerHTML = `<b>${n}</b><span>${esc(title)}<small>${esc(sub)}</small></span>`;
      panel.prepend(p);
    };
    add();
    new MutationObserver(add).observe(panel, { childList: true });
  }
}
