/* God's Eye: fly down into one site and see its real terrain in 3D.
 *
 * Elevation and local terrain statistics come from /api/site3d (AWS Terrain
 * Tiles, ~150 m). Imagery is Sentinel-2 cloudless (ESA Copernicus data via EOX)
 * through /api/imagery. The sun can be set to any angle, including the Moon's
 * polar sun, which never climbs more than ~1.5 degrees above the horizon. */

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { ClimateSim, thermalGradient } from "./climate.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const SUN_PRESETS = {
  earth: { label: "Earth midday", elevation: 55, azimuth: 160, lunar: false },
  evening: { label: "Low evening sun", elevation: 8, azimuth: 250, lunar: false },
  lunar: { label: "Lunar polar sun", elevation: 1.5, azimuth: 135, lunar: true },
};

function decode(field) {
  const raw = atob(field.data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/* Sequential ramp for slope: light at 0, orange at the 15 degree rover limit, dark red beyond. */
const SLOPE_STOPS = [[0, [243, 231, 211]], [5, [240, 190, 140]], [15, [232, 116, 59]], [30, [122, 31, 10]]];
function slopeColour(deg) {
  for (let i = 1; i < SLOPE_STOPS.length; i++) {
    const [d1, c1] = SLOPE_STOPS[i];
    const [d0, c0] = SLOPE_STOPS[i - 1];
    if (deg <= d1) {
      const t = (deg - d0) / (d1 - d0);
      return c0.map((v, k) => (v + (c1[k] - v) * t) / 255);
    }
  }
  return SLOPE_STOPS[SLOPE_STOPS.length - 1][1].map((v) => v / 255);
}

/* Elevation colours: pale mint (low) to dark phthalo green (high), as on the main map. */
const ELEV_STOPS = [[0, [226, 240, 232]], [0.3, [132, 190, 162]], [0.6, [44, 116, 86]], [1, [18, 53, 36]]];
function elevColour(t) {
  for (let i = 1; i < ELEV_STOPS.length; i++) {
    const [t1, c1] = ELEV_STOPS[i];
    const [t0, c0] = ELEV_STOPS[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return c0.map((v, k) => (v + (c1[k] - v) * f) / 255);
    }
  }
  return ELEV_STOPS[ELEV_STOPS.length - 1][1].map((v) => v / 255);
}

/* The site marker: a red GPS map pin, drawn once on a canvas and shown as a sprite, so it
 * always stands upright, keeps the same size on screen, and its tip touches the site. */
function gpsPin() {
  const w = 128, h = 168;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const cx = w / 2, cy = 58, r = 50, tip = h - 6;
  const pin = new Path2D();
  // Teardrop: a circle whose sides run down in tangents to a point.
  const a = Math.asin(r / (tip - cy));
  pin.moveTo(cx, tip);
  pin.arc(cx, cy, r, Math.PI / 2 + a, Math.PI / 2 - a);
  pin.closePath();
  g.shadowColor = "rgba(0, 0, 0, 0.45)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = "#e03c31";
  g.fill(pin);
  g.shadowColor = "transparent";
  g.lineWidth = 3;
  g.strokeStyle = "#a8261d";
  g.stroke(pin);
  g.beginPath();
  g.arc(cx, cy, 19, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false }));
  sprite.center.set(0.5, 0);   // anchor at the tip
  sprite.scale.set(0.05, 0.05 * (h / w), 1);
  sprite.renderOrder = 30;
  sprite.visible = false;
  return sprite;
}

function exagLabel(x) {
  return x === 1 ? "1× true scale" : `${x.toFixed(1)}× exaggerated`;
}

function niceStep(x) {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= x) || 1000;
}

function niceLength(km) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  return steps.reduce((best, s) => (s <= km ? s : best), steps[0]);
}

export class GodsEye {
  constructor(root) {
    this.root = root;
    this.canvas = $("geCanvas");
    this.open = false;
    this.exaggeration = 1;   // true vertical scale unless the user asks for more
    this.sun = { ...SUN_PRESETS.earth };
    this.imagery = "s2";

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 84 * DEG, screenSpacePanning: false });
    this.controls.addEventListener("start", () => { this.flight = null; });

    this.hemi = new THREE.HemisphereLight(0xbcd3f0, 0x3b3128, 0.55);
    this.light = new THREE.DirectionalLight(0xffffff, 2.6);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.light, this.light.target);

    this.stars = this._stars();
    this.scene.add(this.stars);

    // Contour lines drawn in the terrain shader from each fragment's elevation.
    this.contour = { uOn: { value: 0 }, uInterval: { value: 100 }, uBase: { value: 0 }, uExag: { value: 2 },
      uInk: { value: new THREE.Color(1.0, 0.93, 0.8) } };
    this.raycaster = new THREE.Raycaster();
    this.probeMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7cb7ff }));
    this.probeMarker.visible = false;
    this.scene.add(this.probeMarker);
    this.pin = gpsPin();
    this.scene.add(this.pin);
    this.profilePoints = [];
    this.profileMode = false;
    this.sunPlaying = false;

    new ResizeObserver(() => this._resize()).observe(root);
    this._bindUi();
    this.climate = new ClimateSim(this);
    $("geThermalRamp").style.background = thermalGradient();
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _stars() {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pos = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const u = rand() * 0.9 + 0.1;
      const t = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([900 * s * Math.cos(t), 900 * u, 900 * s * Math.sin(t)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8f5, size: 1.6, sizeAttenuation: false }));
  }

  _bindUi() {
    $("geClose").addEventListener("click", () => this.close());
    $("geExag").addEventListener("input", (e) => {
      this.exaggeration = Number(e.target.value);
      this._showExaggeration();
      this._applyHeights();
    });
    $("geSunElev").addEventListener("input", (e) => { this.climate.manualSun(); this.sun.elevation = Number(e.target.value); this._applySun(true); });
    $("geSunAz").addEventListener("input", (e) => { this.climate.manualSun(); this.sun.azimuth = Number(e.target.value); this._applySun(true); });
    this.root.querySelectorAll("[data-sun]").forEach((b) => b.addEventListener("click", () => {
      this.climate.manualSun();
      this.sun = { ...SUN_PRESETS[b.dataset.sun] };
      this._applySun(false);
    }));
    this.root.querySelectorAll("[data-imagery]").forEach((b) => b.addEventListener("click", () => {
      this.imagery = b.dataset.imagery;
      this._applyMaterial();
    }));
    $("geCell").addEventListener("change", (e) => { if (this.cellLine) this.cellLine.visible = e.target.checked; });
    $("geContours").addEventListener("change", (e) => { this.contour.uOn.value = e.target.checked ? 1 : 0; });
    $("geProfileBtn").addEventListener("click", () => this._toggleProfileMode());
    $("geSunPlay").addEventListener("click", () => {
      this.climate.manualSun();
      this._setSunPlaying(!this.sunPlaying);
    });
    let hoverFrame = 0;
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.buttons || hoverFrame) { if (e.buttons) $("geHover").hidden = true; return; }
      hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; this._hover(e); });
    });
    this.canvas.addEventListener("pointerleave", () => { $("geHover").hidden = true; });
    let down = null;
    this.canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      this._click(e);
    });
    $("geReset").addEventListener("click", () => this.resetAll());
    $("geHelp").addEventListener("click", () => this._guide(true));
    $("geGuideOk").addEventListener("click", () => {
      $("geGuide").hidden = true;
      try { localStorage.setItem("tn-ge-guide", "1"); } catch { /* private mode: show again next time */ }
      this.root.focus({ preventScroll: true });
    });
    // A modal view: Tab cycles through its own controls only.
    this.root.tabIndex = -1;
    this.root.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const items = [...this.root.querySelectorAll("button, input, select, a[href], [tabindex='0']")]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === this.root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* The mouse and touch guide: shown on the first visit, and from the ? button. */
  _guide(force = false) {
    let seen = false;
    try { seen = localStorage.getItem("tn-ge-guide") === "1"; } catch { /* storage blocked */ }
    if (force || !seen) {
      $("geGuide").hidden = false;
      $("geGuideOk").focus({ preventScroll: true });
    }
  }

  _showExaggeration() {
    $("geExagValue").textContent = exagLabel(this.exaggeration);
    const badge = $("geVScale");
    badge.textContent = this.exaggeration === 1 ? "Vertical: true scale" : `Heights ×${this.exaggeration.toFixed(1)} (exaggerated)`;
    badge.classList.toggle("warn", this.exaggeration !== 1);
  }

  /* Live elevation under the cursor (true metres, whatever the exaggeration). */
  _hover(e) {
    const box = $("geHover");
    if (!this.mesh) { box.hidden = true; return; }
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit) { box.hidden = true; return; }
    const u = hit.point.x / this.sizeKm + 0.5;
    const v = hit.point.z / this.sizeKm + 0.5;
    const { lat, lon } = this._uvToLatLon(u, v);
    box.innerHTML = `<b class="num">${Math.round(this._elevationAt(u, v)).toLocaleString("en-US")} m</b>
      <span>${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}</span>`;
    box.hidden = false;
    box.style.left = `${Math.min(rect.width - 170, e.clientX - rect.left + 14)}px`;
    box.style.top = `${Math.max(8, e.clientY - rect.top - 34)}px`;
  }

  /* Back to how the view opened: camera, sun, surface, height, overlays and tools. */
  resetAll() {
    if (!this.mesh) return;
    this._setSunPlaying(false);
    $("geError").hidden = true;
    this.drive = null;
    this.profilePoints = [];
    this._clearProfile();
    this._toggleProfileMode(false);
    this.probeMarker.visible = false;
    $("geProbe").hidden = true;
    $("geToolHint").textContent = "Click the terrain to probe any point.";
    this.climate.reset();

    this.exaggeration = 1;
    $("geExag").value = 1;
    this._showExaggeration();
    $("geContours").checked = false;
    this.contour.uOn.value = 0;
    $("geCell").checked = true;
    this._applyHeights();   // also rebuilds the cell outline, pin and walls
    if (this.cellLine) this.cellLine.visible = true;

    // Satellite imagery if any was loaded for this site, else shaded relief.
    this.imagery = this.imageryAvailable === false ? "relief" : "s2";
    this._applyMaterial();
    this.sun = { ...SUN_PRESETS.earth };
    this._applySun(false);
    this._introFlight(false);
  }

  /* --------------------------------------------------------------- open */

  async show(site, context) {
    this.open = true;
    const wasOpen = !this.root.hidden && !this.root.classList.contains("leaving");
    this.root.classList.remove("leaving");
    this.root.hidden = false;
    if (!wasOpen) {
      this.root.classList.add("entering");
      void this.root.offsetWidth;   // commit the start state so the transition runs
      requestAnimationFrame(() => this.root.classList.remove("entering"));
      this.root.focus({ preventScroll: true });
    }
    this.context = context;
    $("geTitle").textContent = site.label?.text || "Selected site";
    $("geSub").textContent = context.subtitle || "";
    $("geBadges").innerHTML = context.badges || "";
    $("geStats").innerHTML = "";
    $("geStatus").textContent = "Loading terrain…";
    $("geLoading").hidden = false;
    $("geError").hidden = true;
    this._resize();
    try {
      const qs = new URLSearchParams({ lat: site.lat, lon: site.lon });
      if (context.targetId) qs.set("target_id", context.targetId);
      // Never wait forever: a stalled download ends in a clear message and a Retry button.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 120000);
      let res;
      try {
        res = await fetch(`/api/site3d?${qs}`, { signal: abort.signal });
      } catch (err) {
        throw new Error(err.name === "AbortError"
          ? "The terrain did not arrive within 2 minutes. The network may be slow or blocking the tile servers."
          : err.message);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch { /* not json */ }
        throw new Error(detail);
      }
      const data = await res.json();
      if (!this.open) return;
      this.data = data;
      this.profilePoints = [];
      this._clearProfile();
      this.probeMarker.visible = false;
      $("geProbe").hidden = true;
      this._toggleProfileMode(false);
      this._showExaggeration();
      this._build(data);
      this.climate.setSite(site, context.values);
      this._renderStats(data);
      $("geCredit").innerHTML = `Terrain: ${esc(data.credits.elevation)} · Imagery: ${esc(data.credits.imagery)} (${esc(data.imagery.s2.licence)})`;
      $("geLoading").hidden = true;
      $("geStatus").textContent = "Loading satellite imagery…";
      this._introFlight(true);
      this._guide();
      await this._loadImagery(data);
    } catch (err) {
      $("geLoading").hidden = true;
      $("geStatus").textContent = "";
      this._showError(err.message, () => this.show(site, context));
    }
  }

  /* A visible explanation in the middle of the screen while there is no terrain to show. */
  _showError(message, retry) {
    const box = $("geError");
    box.hidden = false;
    box.innerHTML = `<h3>Terrain unavailable</h3><p>${esc(message)}</p>
      <p class="hint">Fastest fix: copy the <code>cache/sitetiles</code> folder from a laptop where this site
        already opened, or run <code>python -m src.acquire.sitetiles --top 5</code> on a good connection.</p>
      <div class="ge-error-actions"><button class="primary" type="button" id="geRetry">Try again</button>
        <button class="ghost" type="button" id="geErrorClose">Back to the map</button></div>`;
    $("geRetry").addEventListener("click", retry);
    $("geErrorClose").addEventListener("click", () => this.close());
    $("geRetry").focus({ preventScroll: true });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    $("geGuide").hidden = true;
    this.climate.setPlaying(false);
    this.flight = null;
    this.root.classList.add("leaving");
    // Hand the screen back only once the fade has finished, so the map does not
    // start drawing again underneath while the 3D view is still fading out.
    let finished = false;
    const done = () => {
      if (finished || this.open) return;
      finished = true;
      this.root.hidden = true;
      this.root.classList.remove("leaving");
      if (this.onClose) this.onClose();
    };
    if (REDUCED) { done(); return; }
    this.root.addEventListener("transitionend", (e) => { if (e.target === this.root) done(); }, { once: true });
    setTimeout(done, 400);   // in case the transition does not fire
  }

  /* Esc: close the topmost thing first (guide, profile tool), then the view. */
  escape() {
    if (!$("geGuide").hidden) { $("geGuideOk").click(); return; }
    if (this.profileMode) { this._toggleProfileMode(false); return; }
    this.close();
  }

  _setSunPlaying(on) {
    this.sunPlaying = on;
    $("geSunPlay").setAttribute("aria-pressed", String(on));
    $("geSunPlay").querySelector("span").textContent = on ? "Stop the sun" : "Turn the sun";
  }

  /* -------------------------------------------------------------- build */

  _build(data) {
    for (const obj of [this.mesh, this.cellLine]) {
      if (!obj) continue;
      this.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.map?.dispose();
      obj.material.dispose();
    }
    const [rows, cols] = data.heightmap.shape;
    this.heights = decode(data.heightmap);
    this.rows = rows;
    this.cols = cols;
    this.sizeKm = data.ground_size_m / 1000;
    let lo = Infinity;
    for (const h of this.heights) lo = Math.min(lo, h);
    this.base = lo;

    const geo = new THREE.PlaneGeometry(this.sizeKm, this.sizeKm, cols - 1, rows - 1);
    // True slope at the display grid spacing (not exaggerated), for Slope mode and probes.
    const spacing = (this.sizeKm * 1000) / (cols - 1);
    this.slopes = new Float32Array(rows * cols);
    const colours = new Float32Array(rows * cols * 3);
    const H = (r, c) => this.heights[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gx = (H(r, c + 1) - H(r, c - 1)) / (2 * spacing);
        const gy = (H(r + 1, c) - H(r - 1, c)) / (2 * spacing);
        const deg = Math.atan(Math.hypot(gx, gy)) / DEG;
        this.slopes[r * cols + c] = deg;
        colours.set(slopeColour(deg), (r * cols + c) * 3);
      }
    }
    this.slopeColours = colours;
    let hi = -Infinity;
    for (const h of this.heights) hi = Math.max(hi, h);
    this.top = hi;
    // Colour and label elevation with the full-resolution range of the block (the same
    // numbers as the stats panel), not the smoothed display grid.
    const eLo = data.stats.area.elevation_min;
    const eHi = data.stats.area.elevation_max;
    this.elevColours = new Float32Array(rows * cols * 3);
    for (let i = 0; i < rows * cols; i++) {
      const t = eHi > eLo ? (this.heights[i] - eLo) / (eHi - eLo) : 0;
      this.elevColours.set(elevColour(Math.min(1, Math.max(0, t))), i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colours.slice(), 3));
    this.slopeSpacing = spacing;
    $("geElevLo").textContent = `${Math.round(eLo).toLocaleString("en-US")} m`;
    $("geElevHi").textContent = `${Math.round(eHi).toLocaleString("en-US")} m`;
    const step = niceStep((hi - lo) / 14);
    this.contour.uInterval.value = step;
    this.contour.uBase.value = lo;
    $("geContourStep").textContent = `every ${step} m`;
    const material = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.contour);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vH;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvH = position.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vH;\nuniform float uOn, uInterval, uBase, uExag;\nuniform vec3 uInk;")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          if (uOn > 0.5) {
            float c = (vH / uExag * 1000.0) / uInterval;
            float w = fwidth(c);
            float line = 1.0 - smoothstep(0.0, w * 1.3, abs(fract(c - 0.5) - 0.5));
            float major = step(0.5, 1.0 - step(0.5, abs(mod(floor(c + 0.5), 5.0))));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, uInk, line * (0.55 + 0.4 * major));
          }`);
    };
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this.imageCanvas = document.createElement("canvas");
    this.imageCanvas.width = this.imageCanvas.height = data.imagery.s2.tiles * 256;
    const ctx = this.imageCanvas.getContext("2d");
    ctx.fillStyle = "#8d8577";
    ctx.fillRect(0, 0, this.imageCanvas.width, this.imageCanvas.height);
    this.imageTexture = new THREE.CanvasTexture(this.imageCanvas);
    this.imageTexture.colorSpace = THREE.SRGBColorSpace;
    this.imageTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this._applyHeights();
    this._applyMaterial();
    this._applySun(false);
  }

  /* Height (km, exaggerated) at fractional mosaic position (u east, v south). */
  _heightAt(u, v) {
    const x = Math.min(this.cols - 1, Math.max(0, u * (this.cols - 1)));
    const y = Math.min(this.rows - 1, Math.max(0, v * (this.rows - 1)));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(this.cols - 1, x0 + 1), y1 = Math.min(this.rows - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const h = (r, c) => this.heights[r * this.cols + c];
    const top = h(y0, x0) * (1 - fx) + h(y0, x1) * fx;
    const bot = h(y1, x0) * (1 - fx) + h(y1, x1) * fx;
    return ((top * (1 - fy) + bot * fy) - this.base) / 1000 * this.exaggeration;
  }

  _toWorld(u, v, lift = 0) {
    return new THREE.Vector3((u - 0.5) * this.sizeKm, this._heightAt(u, v) + lift, (v - 0.5) * this.sizeKm);
  }

  _applyHeights() {
    if (!this.mesh) return;
    this.contour.uExag.value = this.exaggeration;
    const pos = this.mesh.geometry.attributes.position;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        // PlaneGeometry lies in XY with row 0 at +Y (north); map to X east, Y up, Z south.
        pos.setXYZ(i, (c / (this.cols - 1) - 0.5) * this.sizeKm,
          (this.heights[i] - this.base) / 1000 * this.exaggeration,
          (r / (this.rows - 1) - 0.5) * this.sizeKm);
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
    this._buildOverlays();
    this.climate?.rebuild();
  }

  /* Dark side walls from the terrain edge down to a common floor, so the block reads as solid. */
  _buildSkirt() {
    if (this.skirt) {
      this.scene.remove(this.skirt);
      this.skirt.geometry.dispose();
      this.skirt.material.dispose();
    }
    const floor = -Math.max(0.6, this.sizeKm * 0.012) * this.exaggeration;
    const pos = [];
    const wall = (points) => {
      for (let i = 0; i < points.length - 1; i++) {
        const [a, b] = [points[i], points[i + 1]];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, floor, b.z);
        pos.push(a.x, a.y, a.z, b.x, floor, b.z, a.x, floor, a.z);
      }
    };
    const n = 64;
    const line = (f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
    wall(line((t) => this._toWorld(t, 0)));
    wall(line((t) => this._toWorld(1, t)));
    wall(line((t) => this._toWorld(1 - t, 1)));
    wall(line((t) => this._toWorld(0, 1 - t)));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    this.skirt = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 1, side: THREE.DoubleSide }));
    this.scene.add(this.skirt);
  }

  _buildOverlays() {
    this._buildSkirt();
    if (this.profilePoints.length === 2) this._drawProfile();
    if (this.cellLine) {
      this.scene.remove(this.cellLine);
      this.cellLine.geometry.dispose();
      this.cellLine.material.dispose();
    }
    const { nw, se } = this.data.cell;
    const pts = [];
    const edge = (u0, v0, u1, v1) => {
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        pts.push(this._toWorld(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, 0.03 * this.exaggeration + 0.02));
      }
    };
    edge(nw[0], nw[1], se[0], nw[1]);
    edge(se[0], nw[1], se[0], se[1]);
    edge(se[0], se[1], nw[0], se[1]);
    edge(nw[0], se[1], nw[0], nw[1]);
    this.cellLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xe03c31, transparent: true, opacity: 0.95, depthTest: true }));
    this.cellLine.visible = $("geCell").checked;
    this.scene.add(this.cellLine);

    const [su, sv] = this.data.site;
    this.pin.position.copy(this._toWorld(su, sv));
    this.pin.visible = true;
  }

  _applyMaterial() {
    if (!this.mesh) return;
    this.root.querySelectorAll("[data-imagery]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.imagery === this.imagery)));
    const mat = this.mesh.material;
    const coloured = this.imagery === "slope" || this.imagery === "elevation" || this.imagery === "thermal";
    mat.vertexColors = coloured;
    if (coloured) {
      const attr = this.mesh.geometry.attributes.color;
      const colours = { slope: this.slopeColours, elevation: this.elevColours };
      attr.array.set(colours[this.imagery] || this.climate.thermalColours());
      attr.needsUpdate = true;
    }
    if (this.imagery === "s2") {
      mat.map = this.imageTexture;
      mat.color.set(0xffffff);
    } else if (coloured) {
      mat.map = null;
      mat.color.set(0xffffff);
    } else {
      mat.map = null;
      mat.color.set(0xb9b3a8);
    }
    $("geSlopeLegend").hidden = this.imagery !== "slope";
    $("geElevLegend").hidden = this.imagery !== "elevation";
    $("geThermalLegend").hidden = this.imagery !== "thermal";
    // Thermal keeps its colours readable at night (see ClimateSim.afterSun).
    this._applySun(true);
    // Light contour ink over imagery, dark ink over the pale relief and slope surfaces.
    if (this.imagery === "s2") this.contour.uInk.value.setRGB(1.0, 0.93, 0.8);
    else this.contour.uInk.value.setRGB(0.28, 0.13, 0.05);
    mat.needsUpdate = true;
  }

  _applySun(fromSlider) {
    const { elevation, azimuth } = this.sun;
    if (!fromSlider) {
      $("geSunElev").value = elevation;
      $("geSunAz").value = azimuth;
    }
    $("geSunElevValue").textContent = `${Number(elevation).toFixed(1)}°`;
    $("geSunAzValue").textContent = `${Math.round(azimuth)}°`;
    this.root.querySelectorAll("[data-sun]").forEach((b) => {
      const p = SUN_PRESETS[b.dataset.sun];
      b.setAttribute("aria-pressed", String(p.elevation === Number(elevation) && p.azimuth === Number(azimuth)));
    });
    const lunar = !!this.sun.lunar && Number(elevation) === SUN_PRESETS.lunar.elevation;
    this.root.classList.toggle("lunar-sky", lunar);
    $("geSunNote").textContent = lunar
      ? "Lunar polar sun: the Moon's spin axis is tilted only ~1.5° to the ecliptic, so at the poles the Sun circles within about 1.5° of the horizon. No air scatters the light, so shadows are black."
      : "Drag the sliders to move the Sun. Long, low shadows show relief that a rover or lander would face.";
    const d = (this.sizeKm || 100) * 1.2;
    const el = Math.max(0.3, Number(elevation)) * DEG;
    const az = Number(azimuth) * DEG;   // clockwise from north; north is -Z
    this.light.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
    this.light.target.position.set(0, 0, 0);
    const half = (this.sizeKm || 100) * 0.75;
    Object.assign(this.light.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.1, far: d * 3 });
    this.light.shadow.camera.updateProjectionMatrix();
    // Moon: no atmosphere, so no sky light and a black sky.
    this.hemi.intensity = lunar ? 0.02 : 0.55;
    this.light.intensity = lunar ? 3.4 : 2.6;
    this.light.color.set(lunar ? 0xffffff : Number(elevation) < 12 ? 0xffd2a6 : 0xfff6ea);
    this.scene.background = new THREE.Color(lunar ? 0x010204 : 0x0a111c);
    this.scene.fog = lunar ? null : new THREE.Fog(0x0a111c, (this.sizeKm || 100) * 1.4, (this.sizeKm || 100) * 4);
    this.stars.visible = lunar || Number(elevation) < 3;
    this.climate?.afterSun();
  }

  async _loadImagery(data) {
    const s2 = data.imagery.s2;
    const ctx = this.imageCanvas.getContext("2d");
    let loaded = 0;
    let failed = 0;
    const jobs = [];
    for (let j = 0; j < s2.tiles; j++) {
      for (let i = 0; i < s2.tiles; i++) {
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, i * 256, j * 256);
            loaded++;
            this.imageTexture.needsUpdate = true;
            resolve();
          };
          img.onerror = () => { failed++; resolve(); };
          img.src = `/api/imagery/s2/${s2.zoom}/${s2.x0 + i}/${s2.y0 + j}.jpg`;
        }));
      }
    }
    await Promise.all(jobs);
    this.imageryAvailable = loaded > 0;
    if (!loaded && this.open) {
      this.imagery = "relief";
      this._applyMaterial();
      $("geStatus").textContent = "Satellite imagery is not cached for this site (offline), so the terrain is shown as shaded relief.";
    } else {
      $("geStatus").textContent = failed ? `${failed} imagery tiles missing (offline cache).` : "";
    }
  }

  _renderStats(data) {
    const c = data.stats.cell || data.stats.area;
    const pct = (x) => `${Math.round(x * 100)}%`;
    const t = data.target_slope;
    let compare = "";
    if (t && t.measured_value !== null && t.measured_value !== undefined) {
      compare = `<p class="ge-compare">${esc(this.context.targetName)} measured <b>${Number(t.measured_value).toFixed(1)}°</b>
        at ${esc(t.baseline || "a finer scale")}. Slopes measured over shorter distances read steeper, so compare
        with care: this cell is <b>${c.slope_mean.toFixed(1)}°</b> on average at ${data.stats.slope_baseline_m} m.</p>`;
    }
    $("geStats").innerHTML = `
      <div class="ge-stat"><span>Elevation in the cell</span><b class="num">${Math.round(c.elevation_min).toLocaleString("en-US")}–${Math.round(c.elevation_max).toLocaleString("en-US")} m</b></div>
      <div class="ge-stat"><span>Relief in the cell</span><b class="num">${Math.round(c.relief)} m</b></div>
      <div class="ge-stat"><span>Mean slope</span><b class="num">${c.slope_mean.toFixed(1)}°</b></div>
      <div class="ge-stat"><span>90% of ground below</span><b class="num">${c.slope_p90.toFixed(1)}°</b></div>
      <div class="ge-stat wide"><span>Whole block (${Math.round(data.ground_size_m / 1000)} km across)</span>
        <b class="num">${Math.round(data.stats.area.elevation_min).toLocaleString("en-US")}–${Math.round(data.stats.area.elevation_max).toLocaleString("en-US")} m</b></div>
      <div class="ge-stat wide"><span>Rover-trafficable (under ${data.stats.trafficable_deg}°)</span>
        <b class="num">${pct(c.share_under_15)}</b>
        <div class="bar" role="img" aria-label="${pct(c.share_under_15)} trafficable"><i style="width:${(c.share_under_15 * 100).toFixed(1)}%"></i></div></div>
      <p class="hint">Measured on ${data.stats.slope_baseline_m} m elevation pixels inside the scored 0.5° cell (red outline).
        The probe, profile and Slope colours use the ${Math.round(data.ground_size_m / 255)} m display grid, so they read a little gentler.</p>
      ${compare}`;
  }

  /* --------------------------------------------------- probe + profile */

  _uvToLatLon(u, v) {
    const b = this.data.bounds;
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
    const y = merc(b.north) + (merc(b.south) - merc(b.north)) * v;
    const lon = b.west + (b.east - b.west) * u;
    // Mosaics next to the dateline can run past +/-180; wrap back for display.
    return { lat: (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG, lon: ((lon + 540) % 360) - 180 };
  }

  _elevationAt(u, v) {
    return this._heightAt(u, v) / this.exaggeration * 1000 + this.base;
  }

  _slopeAt(u, v) {
    const c = Math.round(Math.min(1, Math.max(0, u)) * (this.cols - 1));
    const r = Math.round(Math.min(1, Math.max(0, v)) * (this.rows - 1));
    return this.slopes[r * this.cols + c];
  }

  _click(e) {
    if (!this.mesh) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (!hit) return;
    const u = hit.point.x / this.sizeKm + 0.5;
    const v = hit.point.z / this.sizeKm + 0.5;
    if (this.profileMode) {
      this.profilePoints.push([u, v]);
      if (this.profilePoints.length === 1) $("geToolHint").textContent = "Now click the end point.";
      if (this.profilePoints.length === 2) {
        this._drawProfile();
        this._toggleProfileMode(false);
      }
      this._probe(u, v, hit.point);
      return;
    }
    this._probe(u, v, hit.point);
  }

  _probe(u, v, point) {
    const { lat, lon } = this._uvToLatLon(u, v);
    const slope = this._slopeAt(u, v);
    this.probeMarker.position.copy(point);
    this.probeMarker.scale.setScalar(this.sizeKm * 0.004);
    this.probeMarker.visible = true;
    const box = $("geProbe");
    box.hidden = false;
    const temp = this.climate.tempAt(u, v);
    const tempLine = temp === null ? "" : `<br><b>${Math.round(temp) || 0} °C</b> ground now <small>(simulated, see Climate)</small>`;
    box.innerHTML = `<b>${Math.round(this._elevationAt(u, v))} m</b> elevation · <b>${slope.toFixed(1)}°</b> slope
      <span class="${slope >= 15 ? "warn" : "ok"}">${slope >= 15 ? "too steep for a rover" : "drivable"}</span><br>
      <small>${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"} ·
      slope over ${Math.round(this.slopeSpacing)} m</small>${tempLine}`;
  }

  _toggleProfileMode(force) {
    this.profileMode = force ?? !this.profileMode;
    $("geProfileBtn").setAttribute("aria-pressed", String(this.profileMode));
    if (this.profileMode) {
      this.profilePoints = [];
      this._clearProfile();
      $("geToolHint").textContent = "Click the start point on the terrain.";
    } else if (this.profilePoints.length < 2) {
      $("geToolHint").textContent = "Click the terrain to probe any point.";
    } else {
      $("geToolHint").textContent = "Profile drawn. Measure again, or drive it.";
    }
  }

  _clearProfile() {
    for (const obj of [this.profileLine, this.rover]) {
      if (!obj) continue;
      this.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }
    this.profileLine = this.rover = null;
    this.drive = null;
    $("geProfile").hidden = true;
  }

  _drawProfile() {
    const [[u0, v0], [u1, v1]] = this.profilePoints;
    const n = 200;
    const pts = [];
    const samples = [];
    const groundKm = Math.hypot(u1 - u0, v1 - v0) * this.sizeKm;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = u0 + (u1 - u0) * t;
      const v = v0 + (v1 - v0) * t;
      pts.push(this._toWorld(u, v, 0.05 * this.exaggeration + 0.03));
      samples.push({ d: groundKm * t, e: this._elevationAt(u, v), u, v });
    }
    for (const obj of [this.profileLine]) if (obj) { this.scene.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
    this.profileLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x7cb7ff }));
    this.scene.add(this.profileLine);
    this.profilePath = pts;
    this.profileSamples = samples;

    let maxGrade = 0, steep = 0, climb = 0, descent = 0;
    for (let i = 1; i < samples.length; i++) {
      const dz = samples[i].e - samples[i - 1].e;
      const dx = (samples[i].d - samples[i - 1].d) * 1000;
      const grade = Math.atan2(Math.abs(dz), dx) / DEG;
      maxGrade = Math.max(maxGrade, grade);
      if (grade >= 15) steep += dx;
      if (dz > 0) climb += dz; else descent -= dz;
    }
    const es = samples.map((p) => p.e);
    const lo = Math.min(...es), hi = Math.max(...es);
    const W = 268, Hh = 96, pad = 4;
    const x = (d) => pad + (d / (groundKm || 1)) * (W - 2 * pad);
    const y = (e) => Hh - pad - ((e - lo) / (hi - lo || 1)) * (Hh - 2 * pad - 10);
    const line = samples.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`).join("");
    const box = $("geProfile");
    box.hidden = false;
    box.innerHTML = `
      <div class="ge-profile-head"><b>Elevation profile</b><span class="num">${groundKm.toFixed(1)} km</span></div>
      <svg viewBox="0 0 ${W} ${Hh}" class="ge-chart" role="img" aria-label="Elevation profile from ${Math.round(es[0])} to ${Math.round(es[es.length - 1])} metres">
        <path d="${line}L${x(groundKm)},${Hh}L${x(0)},${Hh}Z" class="area"/><path d="${line}" class="stroke"/>
        <circle id="geRoverDot" r="3.5" cx="${x(0)}" cy="${y(es[0])}" class="dot"/>
        <text x="${pad}" y="10">${Math.round(hi)} m</text><text x="${pad}" y="${Hh - 6}">${Math.round(lo)} m</text>
      </svg>
      <div class="ge-profile-stats">
        <span>Climb <b class="num">${Math.round(climb)} m</b></span><span>Descent <b class="num">${Math.round(descent)} m</b></span>
        <span>Steepest <b class="num">${maxGrade.toFixed(1)}°</b></span>
        <span>Over 15° <b class="num">${groundKm ? Math.round((steep / 1000 / groundKm) * 100) : 0}%</b></span>
      </div>
      <button class="primary small" type="button" id="geDrive"><svg class="i" aria-hidden="true"><use href="icons.svg#i-play"></use></svg>Drive it</button>
      <small class="hint">Sampled from the ~${Math.round(this.slopeSpacing)} m display grid.</small>`;
    this.chart = { x, y };
    $("geDrive").addEventListener("click", () => this._startDrive());
  }

  _startDrive() {
    if (!this.profilePath) return;
    if (!this.rover) {
      this.rover = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xeef0f3 }));
      this.scene.add(this.rover);
    }
    this.rover.scale.setScalar(this.sizeKm * 0.006);
    this.drive = { t0: performance.now(), dur: REDUCED ? 1 : 7000 };
  }

  _driveStep() {
    const t = Math.min(1, (performance.now() - this.drive.t0) / this.drive.dur);
    const f = t * (this.profilePath.length - 1);
    const i = Math.min(this.profilePath.length - 2, Math.floor(f));
    const p = this.profilePath[i].clone().lerp(this.profilePath[i + 1], f - i);
    this.rover.position.copy(p).add(new THREE.Vector3(0, this.sizeKm * 0.006, 0));
    const s = this.profileSamples[Math.round(f)];
    const dot = $("geRoverDot");
    if (dot && s) { dot.setAttribute("cx", this.chart.x(s.d)); dot.setAttribute("cy", this.chart.y(s.e)); }
    if (t >= 1) this.drive = null;
  }

  /* ------------------------------------------------------------ camera */

  _introFlight(fromAbove) {
    const s = this.sizeKm;
    const [su, sv] = this.data.site;
    const focus = this._toWorld(su, sv);
    this.controls.target.copy(focus);
    this.controls.minDistance = s * 0.04;
    this.controls.maxDistance = s * 2.2;
    const end = new THREE.Vector3(s * 0.55, s * 0.62, s * 0.85);   // whole block in view
    if (REDUCED || !fromAbove) {
      this.camera.position.copy(end);
      this.flight = null;
      return;
    }
    const start = focus.clone().add(new THREE.Vector3(0.01, s * 2.0, 0.01));
    this.camera.position.copy(start);
    this.flight = { start, end, t0: performance.now(), dur: 2200 };
  }

  _resize() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _tick() {
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!this.open) return;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (performance.now() - f.t0) / f.dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(f.start, f.end, e);
      if (t >= 1) this.flight = null;
    }
    if (this.sunPlaying) {
      this.sun.azimuth = (Number(this.sun.azimuth) + 0.35) % 360;
      $("geSunAz").value = this.sun.azimuth;
      this._applySun(true);
    }
    if (this.drive) this._driveStep();
    if (this.mesh) this.climate.tick(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._hud();
  }

  _hud() {
    if (!this.mesh) return;
    // Compass: north is -Z in world space.
    const dir = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    const heading = Math.atan2(dir.x, -dir.z) / DEG;
    $("geNorth").style.transform = `rotate(${-heading}deg)`;
    // Scale bar at the focus point.
    const p0 = this.controls.target.clone();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const p1 = p0.clone().add(right);   // 1 km across the screen at the focus
    const a = p0.clone().project(this.camera);
    const b = p1.clone().project(this.camera);
    const w = this.root.clientWidth;
    const pxPerKm = Math.hypot((b.x - a.x) * w / 2, (b.y - a.y) * this.root.clientHeight / 2);
    if (!Number.isFinite(pxPerKm) || pxPerKm <= 0) return;
    const km = niceLength(140 / pxPerKm);
    $("geScaleBar").style.width = `${Math.round(km * pxPerKm)}px`;
    $("geScaleLabel").textContent = km < 1 ? `${km * 1000} m` : `${km} km`;
  }
}
