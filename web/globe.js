/* Three.js views: the Earth globe with the score overlay, and the small "twin"
 * globe of the target body. All textures are local files (web/assets). */

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { SpaceScenery } from "./space.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEG = Math.PI / 180;
const SUN_OFFSET = new THREE.Vector3(1.5, 1.2, 0);

/* Detail imagery tiles (src/acquire/tiles.py): size in degrees per level. */
const TILE_SIZE = { 1: 10, 2: 2.5 };
const TILE_LIMIT = { 1: 40, 2: 48 };

/* Equirectangular texture on a three.js SphereGeometry: lon -180 at -x,
 * lon 0 at +x, lon -90 at +z, north at +y. */
export function toVector(lat, lon, r = 1) {
  const a = lat * DEG;
  const b = lon * DEG;
  return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
}

function toLatLon(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(n.y) / DEG, lon: Math.atan2(-n.z, n.x) / DEG };
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, reject);
  });
}

/* Deterministic star field (visual only). */
function stars(count = 1800) {
  let seed = 20260928;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 40 + rand() * 20;
    pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fb2c8, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
}

function graticule(radius) {
  const pts = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 3) pts.push(toVector(lat, lon, radius), toVector(lat, lon + 3, radius));
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -84; lat < 84; lat += 3) pts.push(toVector(lat, lon, radius), toVector(lat + 3, lon, radius));
  }
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 }),
  );
}

/* The Finder's atmosphere: a fresnel glow around the globe. */
function atmosphere(radius, color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { glow: { value: new THREE.Color(color) } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 glow; varying vec3 vN; varying vec3 vV;
        void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
          gl_FragColor = vec4(glow, f * 0.9); }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }),
  );
}

export class Globe {
  constructor(container, { onPick, onHover } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.onHover = onHover;
    this.markers = [];
    this.visible = true;
    this.flight = null;
    this.overlayOpacity = 1;
    this.tiles = new Map();        // "z/row/col" -> { mesh, state }
    this.tileCheck = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.camera.position.copy(toVector(20, 10, 3.6));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, enablePan: false,
      minDistance: 1.12, maxDistance: 7, rotateSpeed: 0.45, zoomSpeed: 0.8,
      autoRotate: false,
    });
    this.controls.addEventListener("start", () => { this.controls.autoRotate = false; this.flight = null; });

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.9));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.3);
    this.scene.add(this.sun);
    this.scene.add(stars());

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 80), new THREE.MeshLambertMaterial({ color: 0x222831 }));
    this.scene.add(this.earth);

    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.width = 720;
    this.overlayCanvas.height = 360;
    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas);
    this.overlayTexture.colorSpace = THREE.SRGBColorSpace;
    this.overlayTexture.minFilter = THREE.LinearFilter;
    this.overlay = new THREE.Mesh(
      new THREE.SphereGeometry(1.003, 160, 80),
      new THREE.MeshBasicMaterial({ map: this.overlayTexture, transparent: true, depthWrite: false }),
    );
    this.scene.add(this.overlay);
    this.scene.add(graticule(1.004));
    this.scene.add(atmosphere(1.12, 0x4f9dff));
    this.space = new SpaceScenery(this.scene, this.camera, { pixelRatio: this.renderer.getPixelRatio(), settle: true });
    this.lastFrame = performance.now();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._bindPointer();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* Use the 8K texture when the GPU allows it, else the 4K one. */
  async setEarth(hdUrl, sdUrl) {
    const hd = this.renderer.capabilities.maxTextureSize >= 8192;
    let tex;
    try {
      tex = await loadTexture(hd ? hdUrl : sdUrl);
    } catch {
      tex = await loadTexture(sdUrl);
    }
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.earth.material.dispose();
    this.earth.material = new THREE.MeshLambertMaterial({ map: tex });
    this.hd = hd;
  }

  setOverlayOpacity(value) {
    this.overlayOpacity = value;
  }

  /* ------------------------------------------------------ detail tiles */

  /* Level 1 is always drawn under level 2, so a missing sharp tile falls back to a softer one. */
  _tileLevels() {
    const altitude = this.camera.position.length() - 1;
    if (altitude < 0.22) return [1, 2];
    if (altitude < 0.9) return [1];
    return [];
  }

  _wantedTiles(z) {
    const cam = this.camera.position;
    const len = cam.length();
    const n = cam.clone().normalize();
    const clat = Math.asin(n.y) / DEG;
    const clon = Math.atan2(-n.z, n.x) / DEG;
    // Ground radius in view: the horizon, or less when the field of view is narrower.
    const horizon = Math.acos(1 / len) / DEG;
    const vfov = this.camera.fov * DEG;
    const wide = Math.max(vfov, 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect));
    const radius = Math.min(horizon, ((len - 1) * Math.tan(wide / 2) * 1.4) / DEG);
    const size = TILE_SIZE[z];
    const rows = Math.round(180 / size);
    const cols = Math.round(360 / size);
    const lat0 = Math.max(-90, clat - radius);
    const lat1 = Math.min(90, clat + radius);
    const lonHalf = Math.min(180, radius / Math.max(0.05, Math.cos(Math.min(89, Math.abs(clat) + radius) * DEG)));
    const out = [];
    const r0 = Math.max(0, Math.floor((90 - lat1) / size));
    const r1 = Math.min(rows - 1, Math.floor((90 - lat0) / size));
    const c0 = Math.floor((clon - lonHalf + 180) / size);
    const c1 = Math.floor((clon + lonHalf + 180) / size);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= Math.min(c1, c0 + cols - 1); c++) {
        const col = ((c % cols) + cols) % cols;
        const tlat = 90 - (r + 0.5) * size;
        const tlon = -180 + (col + 0.5) * size;
        const d = Math.hypot(tlat - clat, (((tlon - clon + 540) % 360) - 180) * Math.cos(clat * DEG));
        out.push({ key: `${z}/${r}/${col}`, z, r, c: col, d });
      }
    }
    return out.sort((a, b) => a.d - b.d).slice(0, TILE_LIMIT[z]);
  }

  _updateTiles() {
    const wanted = this._tileLevels().flatMap((z) => this._wantedTiles(z));
    const keep = new Set(wanted.map((t) => t.key));
    for (const [key, t] of this.tiles) {
      if (!keep.has(key)) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.map?.dispose();
        t.mesh.material.dispose();
        this.tiles.delete(key);
      }
    }
    for (const t of wanted) {
      if (this.tiles.has(t.key)) continue;
      const size = TILE_SIZE[t.z];
      const north = 90 - t.r * size;
      const west = -180 + t.c * size;
      const geo = new THREE.SphereGeometry(1 + 0.0004 * t.z, 12, 12,
        (west + 180) * DEG, size * DEG, (90 - north) * DEG, size * DEG);
      const mat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 0;
      const entry = { mesh, state: "loading" };
      this.tiles.set(t.key, entry);
      loadTexture(`/api/tile/${t.key}.jpg`).then((tex) => {
        if (!this.tiles.has(t.key)) { tex.dispose(); return; }
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        mat.map = tex;
        mat.needsUpdate = true;
        entry.state = "ready";
        entry.born = performance.now();
        this.scene.add(mesh);
      }).catch(() => { entry.state = "missing"; });
    }
  }

  setOverlay(imageData) {
    const ctx = this.overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, 720, 360);
    ctx.putImageData(imageData, 0, 0);
    this.overlayTexture.needsUpdate = true;
  }

  /* markers: [{lat, lon, el}] where el is an absolutely positioned HTML element. */
  setMarkers(markers) {
    this.markers = markers;
  }

  /* distance: absolute camera distance, or null to keep the current zoom (capped). */
  flyTo(lat, lon, distance = null) {
    this.controls.autoRotate = false;
    const from = this.camera.position.clone();
    const to = toVector(lat, lon, distance ?? Math.min(from.length(), this.fitDistance || 3.6));
    if (REDUCED) {
      this.camera.position.copy(to);
      return;
    }
    this.flight = { from, to, start: performance.now(), duration: 1100 };
  }

  /* Zoom by a factor (< 1 zooms in), keeping the current view direction. */
  zoomBy(factor) {
    this.controls.autoRotate = false;
    const from = this.camera.position.clone();
    const length = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, from.length() * factor));
    const to = from.clone().setLength(length);
    if (REDUCED) this.camera.position.copy(to);
    else this.flight = { from, to, start: performance.now(), duration: 350 };
  }

  /* Back to the whole globe, facing the same way. */
  home() {
    this.zoomBy((this.fitDistance || 3.6) / this.camera.position.length());
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Keep the whole globe (plus its glow) in view: fit to the narrower field of view.
    const vfov = this.camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    this.fitDistance = 1.22 / Math.sin(Math.min(vfov, hfov) / 2);
    this.controls.maxDistance = this.fitDistance * 1.6;
    if (!this.fitted) {
      this.fitted = true;
      this.camera.position.setLength(this.fitDistance);
    }
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    let hoverFrame = 0;
    el.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const hit = this._hit(e);
      if (hit && this.onPick) this.onPick(hit.lat, hit.lon);
    });
    el.addEventListener("pointermove", (e) => {
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!this.onHover) return;
        const hit = this._hit(e);
        const rect = el.getBoundingClientRect();
        this.onHover(hit, e.clientX - rect.left, e.clientY - rect.top);
      });
    });
    el.addEventListener("pointerleave", () => this.onHover && this.onHover(null));
  }

  _hit(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    return hit ? toLatLon(hit.point) : null;
  }

  tick() {
    const frame = performance.now();
    const dt = Math.min(0.1, (frame - this.lastFrame) / 1000);
    this.lastFrame = frame;
    if (!this.visible || document.hidden) return;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const dir = f.from.clone().normalize().lerp(f.to.clone().normalize(), e).normalize();
      const dist = f.from.length() + (f.to.length() - f.from.length()) * e;
      this.camera.position.copy(dir.multiplyScalar(dist));
      if (t >= 1) this.flight = null;
    }
    // Rotate slower when zoomed in, so a drag moves the ground under the cursor.
    const altitude = this.camera.position.length() - 1;
    const full = (this.fitDistance || 3.6) - 1;
    this.controls.rotateSpeed = Math.min(0.5, Math.max(0.04, 0.5 * altitude / full));
    this.controls.update();
    // Light from over the viewer's shoulder, fixed relative to the view, so the backdrop Moon and Mars keep the same phase.
    this.sun.position.copy(this.camera.position).add(SUN_OFFSET.clone().applyQuaternion(this.camera.quaternion));
    // Detail tiles follow the view; they fade in once loaded.
    const now = performance.now();
    if (now - this.tileCheck > 300) {
      this.tileCheck = now;
      this._updateTiles();
    }
    for (const t of this.tiles.values()) {
      if (t.state === "ready" && t.mesh.material.opacity < 1) {
        t.mesh.material.opacity = Math.min(1, (now - t.born) / 400);
        if (t.mesh.material.opacity >= 1) t.mesh.material.transparent = false;
      }
    }
    // The data overlay fades as you zoom in, so the imagery underneath stays visible.
    const fade = Math.min(1, Math.max(0.45, altitude / 0.9));
    this.overlay.material.opacity = this.overlayOpacity * fade;
    this.space.update(dt);
    this.renderer.render(this.scene, this.camera);
    this._placeMarkers();
  }

  _placeMarkers() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const cam = this.camera.position;
    const camLength = cam.length();
    for (const m of this.markers) {
      const p = toVector(m.lat, m.lon, 1.006);
      // A point on the unit sphere is in front of the horizon when p . cam > 1.
      const margin = (p.dot(cam) - 1) / (camLength - 1);
      if (margin < 0.02) {
        m.el.style.display = "none";
        continue;
      }
      const s = p.project(this.camera);
      const x = ((s.x + 1) / 2) * w;
      const y = ((1 - s.y) / 2) * h;
      m.el.style.display = "";
      m.el.style.left = `${x}px`;
      m.el.style.top = `${y}px`;
      m.el.style.opacity = String(Math.min(1, (margin - 0.02) * 8));
      m.onPlace?.(x, y, w, h);
    }
  }
}

/* A small globe of the target body, turned to face the target site.
 * Drag to rotate, scroll to zoom, double-click to return to the site. */
export class Twin {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth || 164, canvas.clientHeight || 164, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.body = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.MeshLambertMaterial({ color: 0x444444 }));
    this.scene.add(this.body);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.light = new THREE.DirectionalLight(0xffffff, 2.2);
    this.scene.add(this.light);
    this.pin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0xe03c31 }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 32), new THREE.MeshBasicMaterial({ color: 0xe03c31, transparent: true, side: THREE.DoubleSide }));
    this.scene.add(this.pin, this.ring);
    this.textures = {};
    this.home = new THREE.Vector3(0, 0, 4.2);
    this.flight = null;

    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, enablePan: false,
      minDistance: 1.6, maxDistance: 7, rotateSpeed: 0.7, zoomSpeed: 0.8,
    });
    // Moves only when the user drags it: no automatic spin.
    this.controls.autoRotate = false;
    this.controls.addEventListener("start", () => { this.flight = null; });
    canvas.addEventListener("dblclick", () => this.reset());
    canvas.addEventListener("keydown", (e) => {
      const step = 0.25;
      const rotate = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (rotate) {
        e.preventDefault();
        const s = new THREE.Spherical().setFromVector3(this.camera.position);
        s.theta += rotate[0];
        s.phi = Math.min(Math.PI - 0.05, Math.max(0.05, s.phi - rotate[1]));
        this.camera.position.setFromSpherical(s);
      } else if (e.key === "Home" || e.key === "0") {
        e.preventDefault();
        this.reset();
      }
    });
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  /* Stop drawing while hidden (collapsed, or under the full-screen 3D view). */
  setPaused(paused) {
    this.paused = paused;
  }

  /* Fly back to the view of the target site. */
  reset() {
    const from = this.camera.position.clone();
    if (REDUCED) { this.camera.position.copy(this.home); return; }
    this.flight = { from, start: performance.now(), duration: 700 };
  }

  async show(body, lat, lon) {
    const key = body.toLowerCase();
    if (!this.textures[key]) this.textures[key] = await loadTexture(`assets/${key}.jpg`);
    this.body.material.dispose();
    this.body.material = new THREE.MeshLambertMaterial({ map: this.textures[key] });
    const site = toVector(lat, lon, 1.0);
    // View from above the site, tilted slightly toward the equator so the limb shows.
    const view = toVector(lat * 0.72, lon, 1).normalize();
    this.home = view.multiplyScalar(4.2);
    this.camera.up.set(0, 1, 0);   // orbit around the body's spin axis
    this.camera.position.copy(this.home);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.pin.position.copy(site.clone().multiplyScalar(1.01));
    this.ring.position.copy(site.clone().multiplyScalar(1.012));
    this.ring.lookAt(site.clone().multiplyScalar(2));
  }

  tick(t) {
    if (this.paused || document.hidden) return;
    if (this.flight) {
      const f = this.flight;
      const k = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = 1 - Math.pow(1 - k, 3);
      const dir = f.from.clone().normalize().lerp(this.home.clone().normalize(), e).normalize();
      this.camera.position.copy(dir.multiplyScalar(f.from.length() + (this.home.length() - f.from.length()) * e));
      if (k >= 1) this.flight = null;
    }
    this.controls.update();
    // Light from over the viewer's shoulder, so the side you are looking at is lit.
    this.light.position.copy(this.camera.position).add(new THREE.Vector3(2, 1.5, 1));
    const pulse = REDUCED ? 1 : 1 + 0.35 * Math.sin((t || 0) / 380);
    this.ring.scale.setScalar(pulse);
    this.ring.material.opacity = REDUCED ? 0.9 : 0.55 + 0.35 * Math.cos((t || 0) / 380);
    this.renderer.render(this.scene, this.camera);
  }
}
