/* Home page: a slowly turning Earth with the Moon and Mars behind it, and three
 * facts read from the API (nothing is hard-coded). */

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { initStarfield } from "./starfield.js";
import { SpaceScenery, atmosphere } from "./space.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
initStarfield("starfield");

/* ------------------------------------------------------------------ globe */

const canvas = document.getElementById("welcomeGlobeCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(-1.2, 0.9, 3.6);

const controls = new OrbitControls(camera, canvas);
// The hint goes once someone has turned the globe themselves.
controls.addEventListener("start", () => document.getElementById("globeHint")?.classList.add("gone"), { once: true });
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.06, enableZoom: false, enablePan: false,
  autoRotate: !REDUCED, autoRotateSpeed: 0.45, rotateSpeed: 0.5,
});

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 96, 48),
  new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, color: 0x1a2230 }),
);
earth.rotation.z = 23.4 * Math.PI / 180;
scene.add(earth);
new THREE.TextureLoader().load("assets/earth.jpg", (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  earth.material.map = tex;
  earth.material.color.set(0xffffff);
  earth.material.needsUpdate = true;
});

scene.add(atmosphere(1.2, 0x7aa8ec));

scene.add(new THREE.AmbientLight(0xffffff, 0.18));
// The Sun sits over the viewer's left shoulder, so the side facing you is in daylight
// with a soft terminator on the right, whichever way the globe has turned.
const sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
scene.add(sun);
const SUN_OFFSET = new THREE.Vector3(-2.2, 1.6, 0.8);

const space = new SpaceScenery(scene, camera, { radius: 1.2, pixelRatio: renderer.getPixelRatio() });

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  if (document.hidden) { last = now; return; }
  controls.update();
  sun.position.copy(camera.position).add(SUN_OFFSET.clone().applyQuaternion(camera.quaternion));
  space.update(Math.min(0.1, (now - last) / 1000));
  last = now;
  renderer.render(scene, camera);
});

/* ------------------------------------------------------------------ facts */

async function facts() {
  try {
    const [health, targets, analogs] = await Promise.all(
      ["/api/health", "/api/targets", "/api/analogs"].map((u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject()))),
    );
    const items = [
      [Number(health.candidate_cells).toLocaleString("en-US"), "land cells scored"],
      [String(targets.targets.length), "Moon and Mars targets"],
      [String(analogs.sites.length), "known analogs checked"],
    ];
    const box = document.getElementById("facts");
    box.innerHTML = items.map(([n, label]) => `<div><dt>${label}</dt><dd>${n}</dd></div>`).join("");
    box.hidden = false;
  } catch {
    /* the page reads fine without them */
  }
}
facts();
