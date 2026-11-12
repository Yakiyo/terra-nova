/* God's Eye: fly down into one site and see its real terrain in 3D.
 *
 * Elevation and local terrain statistics come from /api/site3d (AWS Terrain
 * Tiles, ~150 m). Imagery is Sentinel-2 cloudless (ESA Copernicus data via EOX)
 * through /api/imagery. The sun can be set to any angle, including the Moon's
 * polar sun, which never climbs more than ~1.5 degrees above the horizon. */

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { ClimateSim, thermalGradient } from "./climate.js";
import { terrainData } from "./terrain-data.js";
import { breadcrumbs } from "./navigation.js";
import { escapeHtml as esc, decodeFloat32 as decode } from './format.js';
import { fetchReadiness, readinessHtml } from "./readiness.js";
import { download, toast } from "./ui.js";
import { MAX_WAYPOINTS, defaultName, fetchTraverse, profileChart, totalsList, legsList, routeGeojson, fmtKm } from "./traverse-view.js";
import { dossierHtml, slug } from "./dossier.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);

export const SUN_PRESETS = {
  earth: { label: "Earth midday", elevation: 55, azimuth: 160, lunar: false },
  evening: { label: "Low evening sun", elevation: 8, azimuth: 250, lunar: false },
  lunar: { label: "Lunar polar sun", elevation: 1.5, azimuth: 135, lunar: true },
};

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

/* A numbered waypoint marker in the tool colour, drawn on a canvas, constant size on screen. */
function waypointSprite(n) {
  const s = 96;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
  g.fillStyle = "#7cb7ff";
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = "#050507";
  g.stroke();
  g.fillStyle = "#050507";
  g.font = "700 50px Roboto, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), s / 2, s / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false }));
  sprite.scale.set(0.032, 0.032, 1);
  sprite.renderOrder = 31;
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

/* A small six-wheeled rover in white and grey with a red accent, built from primitives
   (body, rocker arms, wheels, solar deck, camera mast). It faces +Z, wheels resting on y = 0. */
function buildRover() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xeef0f3, roughness: 0.55, metalness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.8, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd5092b, roughness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1d3b6e, roughness: 0.35, metalness: 0.6 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(1.5, 0.45, 2.1, white, 0, 0.95, 0);              // body
  box(1.62, 0.06, 2.3, panel, 0, 1.22, -0.1);          // solar deck
  box(1.52, 0.08, 0.12, red, 0, 0.98, 1.06);           // red stripe at the front
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 18);
  for (const side of [-1, 1]) {
    box(0.08, 0.08, 2.2, grey, side * 0.9, 0.62, 0);   // rocker arm
    for (const z of [-0.85, 0, 0.85]) {
      const w = new THREE.Mesh(wheelGeo, grey);
      w.rotation.z = Math.PI / 2;
      w.position.set(side * 0.98, 0.34, z);
      g.add(w);
    }
  }
  box(0.1, 0.9, 0.1, white, 0.45, 1.65, 0.7);          // mast
  box(0.42, 0.22, 0.22, white, 0.45, 2.15, 0.72);      // camera head
  box(0.28, 0.1, 0.04, grey, 0.45, 2.15, 0.84);        // camera lenses
  g.traverse((o) => { o.castShadow = true; });
  return g;
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
    this.scene.background = new THREE.Color(0x050507);
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
    this.waypoints = [];       // [{u, v, lat, lon, name}] picked on the terrain
    this.route = null;         // the last /api/traverse result for those waypoints
    this.routeMarkers = [];
    this.traverseMode = false;
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
      this.imageryFallback = false;
      this._applyMaterial();
      // Failed tiles may have been prepared since the view first opened.
      // Selecting Satellite must retry them rather than reuse the empty texture.
      if (this.imagery === "s2" && this.imagerySettled && this.imageryIncomplete) {
        $("geStatus").textContent = "Loading satellite imagery…";
        void this._loadImagery(this.data, this.generation, true);
      }
    }));
    $("geCell").addEventListener("change", (e) => { if (this.cellLine) this.cellLine.visible = e.target.checked; });
    $("geContours").addEventListener("change", (e) => { this.contour.uOn.value = e.target.checked ? 1 : 0; });
    $("geTraverseBtn").addEventListener("click", () => this._toggleTraverseMode());
    $("geAddPin").addEventListener("click", () => { const [u, v] = this.data.site; this._addWaypoint(u, v); });
    $("geClearRoute").addEventListener("click", () => this._clearRoute());
    $("geDossier").addEventListener("click", () => this.exportDossier());
    $("geWaypoints").addEventListener("input", (e) => {
      const i = Number(e.target.dataset.wp);
      if (!Number.isInteger(i) || !this.waypoints[i]) return;
      this.waypoints[i].name = e.target.value.slice(0, 40);
      this._renameRoute();
    });
    $("geWaypoints").addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove]");
      if (b) this._removeWaypoint(Number(b.dataset.remove));
    });
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
      if (e.key === "Backspace" && this.traverseMode && this.waypoints.length && !e.target.closest("input, textarea, select")) {
        e.preventDefault();
        this._removeWaypoint(this.waypoints.length - 1);
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...this.root.querySelectorAll("button, input, select, a[href], [tabindex='0']"),
        ...document.querySelectorAll("#tourCaption:not([hidden]) button")]   // the guided tour stays reachable
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
    this._clearRoute();
    this._toggleTraverseMode(false);
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
    clearTimeout(this.closeTimer);
    if (this.closeTransition) this.root.removeEventListener('transitionend', this.closeTransition);
    const generation = this.generation = (this.generation || 0) + 1;
    this.open = true;
    this.root.dataset.status = "loading";
    this.root.querySelector(".ge-panel").inert = true;
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
    this.site = site;
    $("geTitle").textContent = site.label?.text || "Selected site";
    const trail = [...document.querySelectorAll("#finderBreadcrumbs li")].map(item => {
      const link = item.querySelector("a");
      return link ? { label: link.textContent, href: link.getAttribute("href") } : { label: item.textContent, href: location.href, action: "finder" };
    });
    breadcrumbs($("terrainBreadcrumbs"), [...trail, { label: `God’s Eye · ${site.label?.text || "Selected site"}` }]);
    $("terrainBreadcrumbs").querySelector('[data-crumb-action="finder"]')?.addEventListener("click", event => { event.preventDefault(); this.close(); });
    $("geSub").textContent = context.subtitle || "";
    $("geBadges").innerHTML = context.badges || "";
    $("geStats").innerHTML = "";
    $("geGuide").hidden = true;
    $("geStatus").textContent = "Loading terrain…";
    $("geLoading").hidden = false;
    $("geError").hidden = true;
    this._resize();
    try {
      // Let the dialog paint before terrain parsing, geometry and shader work.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const data = await terrainData(site, context.targetId);
      if (!this.open || generation !== this.generation) return;
      const reuse = this.builtData === data;
      this.data = data;
      this.readiness = null;
      this._clearRoute();
      this.probeMarker.visible = false;
      $("geProbe").hidden = true;
      this._toggleTraverseMode(false);
      this._showExaggeration();
      if (!reuse) {
        this.builtData = null;
        this._build(data);
        this.builtData = data;
      }
      if (reuse && this.imagerySettled && !this.imageryAvailable) {
        this.imagery = "relief";
        this._applyMaterial();
      }
      this.climate.setSite(site, context.values);
      this._renderStats(data);
      this._loadReadiness(site, generation);
      this.root.dataset.status = "ready";
      this.root.querySelector(".ge-panel").inert = false;
      $("geCredit").innerHTML = `Terrain: ${esc(data.credits.elevation)} · Imagery: ${esc(data.credits.imagery)} (${esc(data.imagery.s2.licence)})`;
      $("geLoading").hidden = true;
      $("geStatus").textContent = reuse ? (this.imageryMessage || "") : "Terrain ready. Loading satellite imagery…";
      this._introFlight(true);
      this._guide();
      if (!reuse || !this.imagerySettled || this.imageryIncomplete) {
        await this._loadImagery(data, generation, !!this.imageryIncomplete);
      }
    } catch (err) {
      if (!this.open || generation !== this.generation) return;
      $("geLoading").hidden = true;
      $("geStatus").textContent = "";
      this._showError(err.message, () => this.show(site, context));
    }
  }

  /* Hardware test readiness on the site terrain (src/compute/qualification.py). */
  _loadReadiness(site, generation) {
    const box = $("geReadiness");
    box.innerHTML = `<p class="hint">Checking which systems could be tested here…</p>`;
    fetchReadiness(site.lat, site.lon, { terrain: true }).then((q) => {
      if (generation !== this.generation) return;
      this.readiness = q;
      box.innerHTML = readinessHtml(q);
    }).catch(() => {
      if (generation === this.generation) box.innerHTML = `<p class="hint">Readiness is unavailable right now.</p>`;
    });
  }

  /* A visible explanation in the middle of the screen while there is no terrain to show. */
  _showError(message, retry) {
    this.root.dataset.status = "error";
    const box = $("geError");
    box.hidden = false;
    box.innerHTML = `<h3>Terrain unavailable</h3><p>${message.includes("offline mode") ? "This site’s terrain has not been cached for offline use." : "Terrain could not load. Retry or choose another site."}</p>
      <details class="terrain-error-details"><summary>Data preparation details</summary><p>${esc(message)}</p></details>
      <div class="ge-error-actions"><button class="primary" type="button" id="geRetry">Try again</button>
        <button class="ghost" type="button" id="geErrorClose">Back to the map</button></div>`;
    $("geRetry").addEventListener("click", retry);
    $("geErrorClose").addEventListener("click", () => this.close());
    $("geRetry").focus({ preventScroll: true });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this._setSunPlaying(false);
    this.drive = null;
    this.generation = (this.generation || 0) + 1;
    $("geGuide").hidden = true;
    this.climate.setPlaying(false);
    this.flight = null;
    this.root.classList.add("leaving");
    // Hand the screen back only once the fade has finished, so the map does not
    // start drawing again underneath while the 3D view is still fading out.
    let finished = false;
    const generation = this.generation;
    const done = () => {
      if (finished || this.open || generation !== this.generation) return;
      finished = true;
      clearTimeout(this.closeTimer);
      this.root.removeEventListener('transitionend', this.closeTransition);
      this.root.hidden = true;
      this.root.classList.remove("leaving");
      if (this.onClose) this.onClose();
    };
    if (REDUCED) { done(); return; }
    this.closeTransition = event => { if (event.target === this.root) done(); };
    this.root.addEventListener('transitionend', this.closeTransition);
    this.closeTimer = setTimeout(done, 400);   // in case the transition does not fire
  }

  /* Esc: close the topmost thing first (guide, traverse tool), then the view. */
  escape() {
    if (!$("geGuide").hidden) { $("geGuideOk").click(); return; }
    if (this.traverseMode) { this._toggleTraverseMode(false); return; }
    this.close();
  }

  _setSunPlaying(on) {
    this.sunPlaying = on;
    $("geSunPlay").setAttribute("aria-pressed", String(on));
    $("geSunPlay").querySelector("span").textContent = on ? "Stop the sun" : "Turn the sun";
  }

  /* -------------------------------------------------------------- build */

  _build(data) {
    if (this.imageryFallback) this.imagery = "s2";
    this.imageryFallback = false;
    this.imageryIncomplete = false;
    this.imagerySettled = false;
    this.imageryMessage = "";
    this.imageTexture?.dispose();
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
    const colours = new Float32Array(rows * cols * 3);
    this.slopes = decode(data.display_slopes);
    for (let i = 0; i < this.slopes.length; i++) colours.set(slopeColour(this.slopes[i]), i * 3);
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
    $("geSlopeLimit").textContent = `${data.stats.trafficable_deg}° rover limit`;
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
    this._drawRoute3d();
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
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: true }));
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
      ? "Lunar polar lighting: low Sun, black shadows."
      : "";
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

  async _loadImagery(data, generation, retry = false) {
    this.imagerySettled = false;
    const suffix = retry ? `?retry=${Date.now()}` : "";
    const s2 = data.imagery.s2;
    const canvas = this.imageCanvas;
    const texture = this.imageTexture;
    const ctx = canvas.getContext("2d");
    let loaded = 0;
    let failed = 0;
    const jobs = [];
    for (let j = 0; j < s2.tiles; j++) {
      for (let i = 0; i < s2.tiles; i++) {
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          const timeout = setTimeout(() => {
            img.onload = img.onerror = null;
            img.src = "";
            failed++;
            resolve();
          }, 15000);
          img.onload = () => {
            clearTimeout(timeout);
            if (this.data !== data || canvas !== this.imageCanvas) { resolve(); return; }
            ctx.drawImage(img, i * 256, j * 256);
            loaded++;
            texture.needsUpdate = true;
            resolve();
          };
          img.onerror = () => { clearTimeout(timeout); failed++; resolve(); };
          img.src = `/api/imagery/s2/${s2.zoom}/${s2.x0 + i}/${s2.y0 + j}.jpg${suffix}`;
        }));
      }
    }
    await Promise.all(jobs);
    if (this.data !== data) return;
    this.imagerySettled = true;
    this.imageryIncomplete = failed > 0;
    this.imageryAvailable = loaded > 0;
    if (generation !== this.generation || !this.open) return;
    if (!loaded && this.open) {
      if (this.imagery === "s2") {
        this.imagery = "relief";
        this.imageryFallback = true;
        this._applyMaterial();
      }
      this.imageryMessage = this.imageryFallback
        ? "Satellite imagery is unavailable for this site. Showing the measured terrain as shaded relief."
        : "Satellite imagery is unavailable for this site.";
      $("geStatus").textContent = this.imageryMessage;
    } else {
      if (this.imageryFallback && this.imagery === "relief") {
        this.imagery = "s2";
        this.imageryFallback = false;
        this._applyMaterial();
      }
      this.imageryMessage = failed ? `${failed} imagery tiles could not be loaded.` : "";
      $("geStatus").textContent = this.imageryMessage;
    }
  }

  _renderStats(data) {
    const c = data.stats.cell || data.stats.area;
    const pct = (x) => `${Math.round(x * 100)}%`;
    const coverage = data.stats.cell_coverage ?? 1;
    // Near the poles the tile block spans less latitude than the 0.5 degree cell.
    const partial = coverage < 0.995
      ? `<p class="notice ge-coverage">This 3D block covers ${pct(coverage)} of the scored cell (map tiles shrink towards the poles). The cell figures use that part.</p>`
      : "";
    const t = data.target_slope;
    let compare = "";
    if (t && t.measured_value !== null && t.measured_value !== undefined) {
      compare = `<p class="ge-compare">${esc(this.context.targetName)} measured <b>${Number(t.measured_value).toFixed(1)}°</b>
        at ${esc(t.baseline || "a finer scale")}. Slopes measured over shorter distances read steeper, so compare
        with care: this cell is <b>${c.slope_mean.toFixed(1)}°</b> on average at ${data.stats.slope_baseline_m} m.</p>`;
    }
    $("geStats").innerHTML = `${partial}
      <div class="ge-stat"><span>Elevation in the cell</span><b class="num">${Math.round(c.elevation_min).toLocaleString("en-US")}–${Math.round(c.elevation_max).toLocaleString("en-US")} m</b></div>
      <div class="ge-stat"><span>Relief in the cell</span><b class="num">${Math.round(c.relief)} m</b></div>
      <div class="ge-stat"><span>Mean slope</span><b class="num">${c.slope_mean.toFixed(1)}°</b></div>
      <div class="ge-stat"><span>90% of ground below</span><b class="num">${c.slope_p90.toFixed(1)}°</b></div>
      <div class="ge-stat wide"><span>Whole block (${Math.round(data.ground_size_m / 1000)} km across)</span>
        <b class="num">${Math.round(data.stats.area.elevation_min).toLocaleString("en-US")}–${Math.round(data.stats.area.elevation_max).toLocaleString("en-US")} m</b></div>
      <div class="ge-stat wide"><span>Rover-trafficable (under ${data.stats.trafficable_deg}°)</span>
        <b class="num">${pct(c.share_under_15)}</b>
        <div class="bar" role="img" aria-label="${pct(c.share_under_15)} trafficable"><i style="width:${(c.share_under_15 * 100).toFixed(1)}%"></i></div></div>
      <details class="ge-section"><summary>Measurement scale</summary><p class="hint">Measured on ${data.stats.slope_baseline_m} m elevation pixels inside the scored 0.5° cell (white outline).
        The probe and Slope colours use the ${Math.round(data.ground_size_m / 255)} m display grid, so they read a little gentler. Traverse numbers use the full ${data.stats.slope_baseline_m} m pixels.</p>
      ${compare}</details><a class="ge-stats-source" href="${esc(data.provenance.source_url)}" data-dataset-id="${esc(data.provenance.dataset_id)}" target="_blank" rel="noopener">${esc(data.provenance.dataset_id)} · terrain source</a>`;
  }

  /* --------------------------------------------------- probe + traverse */

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
    this._probe(u, v, hit.point);
    if (this.traverseMode) this._addWaypoint(u, v);
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
      <span class="${slope >= this.data.stats.trafficable_deg ? "warn" : "ok"}">${slope >= this.data.stats.trafficable_deg ? "too steep for a rover" : "drivable"}</span><br>
      <small>${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"} ·
      slope over ${Math.round(this.slopeSpacing)} m</small>${tempLine}`;
  }

  _toggleTraverseMode(force) {
    this.traverseMode = force ?? !this.traverseMode;
    $("geTraverseBtn").setAttribute("aria-pressed", String(this.traverseMode));
    this.canvas.classList.toggle("placing", this.traverseMode);
    this._routeHint();
    this._renderWaypointList();
  }

  _routeHint() {
    const n = this.waypoints.length;
    let text = "Click the terrain to probe any point.";
    if (this.traverseMode) {
      text = n >= MAX_WAYPOINTS
        ? `The route has the maximum ${MAX_WAYPOINTS} waypoints. Remove one to add another. Esc to finish.`
        : `Click the terrain to add ${defaultName(n)}. Backspace removes the last point, Esc finishes.`;
    } else if (n >= 2) {
      text = "Route planned. Press Plan a traverse to edit it, or drive it and export the dossier.";
    }
    $("geToolHint").textContent = text;
  }

  _addWaypoint(u, v) {
    if (!this.data || this.waypoints.length >= MAX_WAYPOINTS) { this._routeHint(); return; }
    const cu = Math.min(0.9995, Math.max(0.0005, u)), cv = Math.min(0.9995, Math.max(0.0005, v));
    const { lat, lon } = this._uvToLatLon(cu, cv);
    this.waypoints.push({ u: cu, v: cv, lat, lon, name: defaultName(this.waypoints.length) });
    this._routeChanged();
  }

  _removeWaypoint(i) {
    if (!this.waypoints[i]) return;
    this.waypoints.splice(i, 1);
    this._routeChanged();
  }

  _clearRoute() {
    this.routeAbort?.abort();
    this.waypoints = [];
    this.route = null;
    this.drive = null;
    for (const obj of [this.routeLine, this.rover]) {
      if (!obj) continue;
      this.scene.remove(obj);
      obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.routeLine = this.rover = null;
    this.routePath = null;
    for (const m of this.routeMarkers) { this.scene.remove(m); m.material.map.dispose(); m.material.dispose(); }
    this.routeMarkers = [];
    $("geProfile").hidden = true;
    $("geProfile").innerHTML = "";
    this._renderWaypointList();
    this._routeHint();
  }

  /* Waypoints changed: redraw markers and a provisional line now, then measure on the server. */
  _routeChanged() {
    this.routeAbort?.abort();
    this.route = null;
    this.drive = null;
    this._renderWaypointList();
    this._drawRoute3d();
    this._routeHint();
    const box = $("geProfile");
    if (this.waypoints.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = `<p class="hint">Measuring the route on the elevation tiles…</p>`;
    const controller = this.routeAbort = new AbortController();
    const generation = this.generation;
    fetchTraverse(this.site, this.waypoints, controller.signal).then((route) => {
      if (controller.signal.aborted || generation !== this.generation) return;
      this.route = route;
      this._renameRoute(false);   // keep any renaming typed while the request ran
      this._drawRoute3d();
      this._renderRoute();
    }).catch((err) => {
      if (controller.signal.aborted || generation !== this.generation) return;
      box.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
    });
  }

  _renderWaypointList() {
    const list = $("geWaypoints");
    $("geRoute").hidden = !this.traverseMode && !this.waypoints.length;
    $("geAddPin").disabled = !this.data || this.waypoints.length >= MAX_WAYPOINTS;
    $("geClearRoute").disabled = !this.waypoints.length;
    // Keep focus in a name field that is being edited.
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.wp : undefined;
    list.innerHTML = this.waypoints.map((w, i) => {
      const along = this.route?.waypoints[i] ? fmtKm(this.route.waypoints[i].d_km) : "";
      return `<li><span class="wp-num" aria-hidden="true">${i + 1}</span>
        <input type="text" value="${esc(w.name)}" maxlength="40" data-wp="${i}" aria-label="Name of waypoint ${i + 1}">
        <span class="num wp-along">${along}</span>
        <button class="icon-button small" type="button" data-remove="${i}" aria-label="Remove waypoint ${i + 1}, ${esc(w.name)}"><svg class="i" aria-hidden="true"><use href="icons.svg#i-x"></use></svg></button></li>`;
    }).join("");
    if (focused !== undefined) {
      const input = list.querySelector(`[data-wp="${focused}"]`);
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }

  /* Names are labels only: update the measured route in place, without measuring again. */
  _renameRoute(render = true) {
    if (!this.route) return;
    this.route.waypoints.forEach((w, i) => { if (this.waypoints[i]) w.name = this.waypoints[i].name.trim() || defaultName(i); });
    this.route.legs.forEach((l, i) => { l.from = this.route.waypoints[i].name; l.to = this.route.waypoints[i + 1].name; });
    if (render) this._renderRoute(false);
  }

  /* Markers, and the route line coloured by the server's terrain slope (blue, red over the limit). */
  _drawRoute3d() {
    if (!this.mesh) return;
    for (const m of this.routeMarkers) { this.scene.remove(m); m.material.map.dispose(); m.material.dispose(); }
    const lift = 0.05 * this.exaggeration + 0.03;
    this.routeMarkers = this.waypoints.map((w, i) => {
      const m = waypointSprite(i + 1);
      m.position.copy(this._toWorld(w.u, w.v, lift));
      this.scene.add(m);
      return m;
    });
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine.geometry.dispose(); this.routeLine.material.dispose(); this.routeLine = null; }
    this.routePath = null;
    if (this.waypoints.length < 2) return;
    const pts = [], colours = [];
    const blue = new THREE.Color(0x7cb7ff), red = new THREE.Color(0xf21d38);
    if (this.route) {
      const s = this.route.samples;
      const step = Math.max(1, Math.ceil(s.u.length / 3000));
      const idx = [];
      for (let i = 0; i < s.u.length; i += step) idx.push(i);
      if (idx[idx.length - 1] !== s.u.length - 1) idx.push(s.u.length - 1);
      for (const i of idx) {
        pts.push(this._toWorld(s.u[i], s.v[i], lift));
        const c = s.terrain_slope_deg[i] >= this.route.limit_deg ? red : blue;
        colours.push(c.r, c.g, c.b);
      }
      this.routePath = pts;
    } else {
      // Provisional straight legs, drawn faintly until the measured route arrives.
      for (let k = 0; k < this.waypoints.length - 1; k++) {
        const a = this.waypoints[k], b = this.waypoints[k + 1];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          pts.push(this._toWorld(a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t, lift));
          colours.push(blue.r, blue.g, blue.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    this.routeLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: !this.route, opacity: this.route ? 1 : 0.55 }));
    this.routeLine.renderOrder = 5;
    this.scene.add(this.routeLine);
  }

  _renderRoute(refreshList = true) {
    const route = this.route;
    const box = $("geProfile");
    if (!route) return;
    const legsOpen = box.querySelector(".ge-legs")?.open;
    this.chart = profileChart(route, { roverDot: true });
    const stats = totalsList(route).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join("");
    const hazards = route.hazards.length
      ? `<ul class="ge-hazards">${route.hazards.map((h) => `<li>Leg ${h.leg + 1}: ${fmtKm(h.start_km)} to ${fmtKm(h.end_km)}, steepest <b class="num">${h.max_slope_deg.toFixed(1)}°</b></li>`).join("")}</ul>`
      : `<p class="hint">No stretch is steeper than ${route.limit_deg}°.</p>`;
    box.hidden = false;
    box.innerHTML = `
      <div class="ge-profile-head"><b>Traverse profile</b><span class="num">${fmtKm(route.total.distance_km)}</span></div>
      ${this.chart.svg}
      <p class="ge-route-legend"><span><i class="lg-route"></i>Elevation</span><span><i class="lg-hz"></i>Over ${route.limit_deg}°, rover hazard</span><span><i class="lg-wp"></i>Waypoint</span></p>
      <dl class="ge-route-stats">${stats}</dl>
      <details class="ge-legs" ${legsOpen ? "open" : ""}><summary>Legs and hazards</summary>${legsList(route)}${hazards}</details>
      <div class="ge-tools">
        <button class="primary small" type="button" id="geDrive"><svg class="i" aria-hidden="true"><use href="icons.svg#i-play"></use></svg>Drive it</button>
        <button class="ghost small" type="button" id="geRouteGeojson"><svg class="i" aria-hidden="true"><use href="icons.svg#i-download-simple"></use></svg>Route GeoJSON</button>
      </div>
      <small class="hint">Measured on the server every ~${Math.round(route.sample_spacing_m)} m (${esc(route.provenance.dataset_id)}).
        Walking time: <a href="${esc(route.walking_model.source_url)}" target="_blank" rel="noopener">${esc(route.walking_model.name)}</a>, an Earth estimate on foot.</small>`;
    $("geDrive").addEventListener("click", () => this._startDrive());
    $("geRouteGeojson").addEventListener("click", () => this.exportRoute());
    if (refreshList) this._renderWaypointList();
  }

  _startDrive() {
    if (!this.routePath || this.routePath.length < 2) return;
    if (!this.rover) {
      this.rover = buildRover();
      this.scene.add(this.rover);
    }
    // Shown far larger than life (a real rover is ~3 m on a ~128 km block) so it reads on screen.
    this.rover.scale.setScalar(this.sizeKm * 0.0045);
    this.drive = { t0: performance.now(), dur: REDUCED ? 1 : Math.min(16000, 6000 + 1500 * (this.route.legs.length - 1)) };
  }

  _driveStep() {
    const path = this.routePath;
    if (!path || !this.rover || !this.route) { this.drive = null; return; }
    const t = Math.min(1, (performance.now() - this.drive.t0) / this.drive.dur);
    const f = t * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    const p = path[i].clone().lerp(path[i + 1], f - i);
    this.rover.position.copy(p);
    // Face the direction of travel and pitch with the ground.
    const ahead = path[Math.min(path.length - 1, i + 2)], dir = ahead.clone().sub(path[Math.max(0, i - 1)]);
    if (dir.lengthSq() > 1e-12) {
      const flat = Math.hypot(dir.x, dir.z) || 1e-9;
      this.rover.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      this.rover.rotateX(-Math.atan2(dir.y, flat));
    }
    // A gentle bob, as if the suspension were working.
    this.rover.position.y += Math.sin(performance.now() / 90) * this.sizeKm * 0.00012;
    const s = this.route.samples;
    const k = Math.min(s.d_km.length - 1, Math.round(t * (s.d_km.length - 1)));
    const dot = $("geRoverDot");
    if (dot && this.chart) { dot.setAttribute("cx", this.chart.x(s.d_km[k])); dot.setAttribute("cy", this.chart.y(s.elev_m[k])); }
    if (t >= 1) this.drive = null;
  }

  /* The frame just rendered, with the route and waypoints drawn over it at print weight
   * (WebGL lines are one pixel wide). `crop`: the block's square, for the top-down view. */
  _frame(cam, crop = false) {
    const src = this.canvas;
    const toScreen = (p) => { const v = p.clone().project(cam); return [(v.x + 1) / 2 * src.width, (1 - v.y) / 2 * src.height]; };
    let sx = 0, sy = 0, sw = src.width, sh = src.height;
    if (crop) {
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => toScreen(this._toWorld(u, v)));
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
      sx = Math.max(0, Math.floor(Math.min(...xs))); sy = Math.max(0, Math.floor(Math.min(...ys)));
      sw = Math.min(src.width, Math.ceil(Math.max(...xs))) - sx; sh = Math.min(src.height, Math.ceil(Math.max(...ys))) - sy;
    }
    const out = document.createElement("canvas");
    out.width = sw; out.height = sh;
    const g = out.getContext("2d");
    g.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    const px = Math.max(2, Math.round(Math.min(sw, sh) / 260));
    if (this.routePath && this.route) {
      const s = this.route.samples;
      const step = Math.max(1, Math.ceil(s.u.length / 3000));
      const pts = this.routePath.map((p) => toScreen(p).map((c, k) => c - (k ? sy : sx)));
      g.lineCap = g.lineJoin = "round";
      g.lineWidth = px * 2.2;
      g.strokeStyle = "rgba(5, 5, 7, 0.75)";
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.lineWidth = px * 1.2;
      for (let i = 1; i < pts.length; i++) {
        const hazard = s.terrain_slope_deg[Math.min(s.u.length - 1, i * step)] >= this.route.limit_deg;
        g.strokeStyle = hazard ? "#f21d38" : "#7cb7ff";
        g.beginPath(); g.moveTo(...pts[i - 1]); g.lineTo(...pts[i]); g.stroke();
      }
    }
    this.waypoints.forEach((w, i) => {
      const [x, y] = toScreen(this._toWorld(w.u, w.v, 0.05 * this.exaggeration + 0.03));
      const r = px * 4.5;
      g.beginPath(); g.arc(x - sx, y - sy, r, 0, Math.PI * 2);
      g.fillStyle = "#7cb7ff"; g.fill();
      g.lineWidth = px; g.strokeStyle = "#050507"; g.stroke();
      g.fillStyle = "#050507"; g.font = `700 ${Math.round(r * 1.2)}px Roboto, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(i + 1), x - sx, y - sy + 1);
    });
    return out.toDataURL("image/jpeg", 0.88);
  }

  /* Two pictures for the dossier: the view as it is now, and straight down with north up. */
  _snapshots() {
    const cam = this.camera;
    const pos = cam.position.clone(), target = this.controls.target.clone();
    this.flight = null;
    const markers = this.routeMarkers.map((m) => m.visible);
    this.routeMarkers.forEach((m) => { m.visible = false; });   // drawn by _frame at print size
    this.renderer.render(this.scene, cam);
    const oblique = this._frame(cam);
    const fog = this.scene.fog;
    this.scene.fog = null;
    cam.position.set(0, this.sizeKm * 1.35 + ((this.top - this.base) / 1000) * this.exaggeration, 0.001);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    this.renderer.render(this.scene, cam);
    const top = this._frame(cam, true);
    this.routeMarkers.forEach((m, i) => { m.visible = markers[i]; });
    this.scene.fog = fog;
    cam.position.copy(pos);
    this.controls.target.copy(target);
    cam.lookAt(target);
    this.controls.update();
    return { oblique, top, exaggeration: this.exaggeration, imagery: this.imagery === "s2" && this.imageryAvailable !== false };
  }

  _fileName() {
    return slug(this.context?.dossier?.site?.label || this.data.label?.text);
  }

  _routeDocument(generated) {
    const ctx = this.context?.dossier || null;
    const meta = { site: ctx?.site?.label || this.data.label?.text, target: ctx?.target?.name || null, generated, source: "TerraNova POST /api/traverse" };
    return JSON.stringify(routeGeojson(this.route, meta), null, 1);
  }

  /* The planned route as GeoJSON (a LineString with its statistics, and the waypoints). */
  exportRoute() {
    if (!this.route) return;
    const generated = `${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
    download(`TerraNova_route_${this._fileName()}.geojson`, this._routeDocument(generated), "application/geo+json");
  }

  /* Save the mission dossier: one self-contained HTML file, with the route GeoJSON inside it. */
  async exportDossier() {
    if (!this.data) return;
    if (this.waypoints.length >= 2 && !this.route) {
      toast("The route is still being measured. Try again in a moment.", "info");
      return;
    }
    const button = $("geDossier");
    button.disabled = true;
    try {
      const sources = await fetch("/api/sources").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const shots = this._snapshots();
      const generated = `${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`;
      const name = this._fileName();
      const geojson = this.route ? { name: `TerraNova_route_${name}.geojson`, text: this._routeDocument(generated) } : null;
      const html = dossierHtml({ context: this.context?.dossier || null, terrain: this.data, route: this.route, readiness: this.readiness, shots, sources, generated, geojson });
      download(`TerraNova_dossier_${name}.html`, html, "text/html");
      toast("Mission dossier saved to your downloads. Open it in a browser to read or print it.", "success");
    } catch (err) {
      toast(`The dossier could not be made: ${err.message}`, "error");
    } finally {
      button.disabled = false;
    }
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
