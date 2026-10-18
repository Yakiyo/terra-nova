/* Home page: a slowly turning Earth with the Moon and Mars behind it, and three
 * facts read from the API (nothing is hard-coded). */

import * as THREE from "three";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { initStarfield } from "./starfield.js";
import { SpaceScenery, atmosphere } from "./space.js";
import { counterMarkup, revealOnce, revealOnEntry } from "./reveal.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
initStarfield("starfield");

/* ------------------------------------------------------------------ globe */

function initScene() {
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
  if (document.hidden || canvas.getBoundingClientRect().bottom < 0) { last = now; return; }
  controls.update();
  sun.position.copy(camera.position).add(SUN_OFFSET.clone().applyQuaternion(camera.quaternion));
  space.update(Math.min(0.1, (now - last) / 1000));
  last = now;
  renderer.render(scene, camera);
});
}
try { initScene(); } catch {
  document.querySelector(".home-globe").classList.add("globe-fallback");
  document.getElementById("globeHint").textContent = "Earth · NASA Blue Marble";
}

/* ------------------------------------------------------------------ facts */

async function facts() {
  try {
    const [health, targets, analogs] = await Promise.all(
      ["/api/health", "/api/targets", "/api/analogs"].map((u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject()))),
    );
    const items = [
      [Number(health.candidate_cells).toLocaleString("en-US"), "land cells scored", "/api/health", "terra_nova_predictor_stack"],
      [String(targets.targets.length), "Moon and Mars targets", "/api/targets", "terra_nova_target_catalog"],
      [String(analogs.sites.length), "known analogs checked", "/api/analogs", "terra_nova_known_analogs"],
    ];
    const box = document.getElementById("facts");
    box.innerHTML = items.map(([n, label, url, dataset]) => `<div data-source-url="${url}" data-dataset-id="${dataset}"><dt><a href="${url}">${label}</a></dt><dd>${counterMarkup(n)}</dd></div>`).join("");
    box.hidden = false;
    revealOnEntry(box);
  } catch {
    const box = document.getElementById("facts");
    box.innerHTML = '<div class="facts-error"><dt>Mission data unavailable. Check the local server and try again.</dt><dd><button type="button" class="btn btn-ghost" id="factsRetry">Retry mission data</button></dd></div>';
    box.hidden = false;
    document.getElementById("factsRetry").addEventListener("click", facts, { once: true });
  }
}
facts();

/* Render only API-supplied similarities. No statistics are calculated here. */
async function evidence() {
  const box = document.getElementById("missionEvidence");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  try {
    const [result, criteria] = await Promise.all([
      fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_id: "jezero_crater", top_k: 5 }) }),
      fetch("/api/criteria"),
    ]);
    if (!result.ok || !criteria.ok) throw new Error("Local data unavailable");
    const data = await result.json();
    const specs = (await criteria.json()).criteria;
    const site = data.results[0];
    if (!site) throw new Error("No analog returned");
    box.innerHTML = `<h3>${esc(site.label.text)}</h3><p class="chart-caption">Criterion similarity to Jezero Crater</p>` + specs.filter(c => data.weights[c.key] > 0 && site.similarities[c.key] != null).map(c => {
      const source = site.sources?.[c.key] || c;
      return `<div class="evidence-row"><div><span>${esc(c.label)}</span><b class="num">${(site.similarities[c.key] * 100).toFixed(0)}%</b></div><div class="bar"><i style="width:${site.similarities[c.key] * 100}%"></i></div><a href="${esc(source.source_url || c.source_url)}" data-dataset-id="${esc(source.dataset_id || c.dataset_id)}">${esc(source.dataset_id || c.dataset_id || "Dataset source")}</a></div>`;
    }).join("") + `<a class="chart-link" href="finder.html#target=jezero_crater">Inspect this ranking and its sources</a>`;
    revealOnce(box);
  } catch {
    box.innerHTML = '<p>Evidence preview unavailable. <a href="finder.html#target=jezero_crater">Open the Finder to retry.</a></p>';
  }
}
const evidenceObserver = new IntersectionObserver(entries => {
  if (!entries.some(entry => entry.isIntersecting)) return;
  evidenceObserver.disconnect();
  evidence();
}, { rootMargin: "200px" });
evidenceObserver.observe(document.getElementById("missionEvidence"));
