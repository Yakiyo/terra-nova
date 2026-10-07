/* Scenery around an Earth globe: the Moon and Mars hanging in the background,
 * and the occasional comet streaking past behind the Earth. Decoration only:
 * sizes and distances are chosen to frame the globe, not to scale.
 *
 * The Moon and Mars are real objects parked in space around the Earth. The Earth is the
 * point of reference: dragging turns your view around it, so the sky behind changes and
 * the Moon and Mars come into view (or slip behind you) as they would from orbit. They
 * are placed once, behind the Earth as first seen, so they start in view; each turns
 * slowly on its own tilted axis (Mars inside a thin dusty haze), still under reduced motion. */

import * as THREE from "three";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEG = Math.PI / 180;

/* Load a big equirectangular texture and keep a small copy (decoration needs little detail). */
function smallTexture(url, width = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = width / 2;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SPIN = new THREE.Quaternion();

/* Mars's thin dusty atmosphere: a faint butterscotch rim, brightest at the limb. */
function haze(r) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.07, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV;
        void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.6); gl_FragColor = vec4(0.93, 0.62, 0.42, f * 0.55); }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }),
  );
  mesh.renderOrder = 11;
  return mesh;
}

/* The Earth's atmosphere, shaped by geometry rather than a fresnel trick: each pixel
 * measures how close its line of sight passes to the Earth's centre. Outside the disc the
 * glow peaks at the limb and falls smoothly to nothing, so there is no hard outer ring;
 * just inside the limb a soft rim blends the disc into the haze. It is drawn after the
 * Moon, Mars and comets, so anything passing behind the Earth sinks into the haze
 * instead of being clipped like a cut-out. */
export function atmosphere(earthRadius, color = 0x5b9dff, strength = 1) {
  const shell = earthRadius * 1.28;
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uR: { value: earthRadius },
    uShell: { value: shell },
    uH: { value: earthRadius * 0.065 },
    uStrength: { value: strength },
  };
  const vertexShader = `varying vec3 vW;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  // Distance from the centre to the line of sight through this pixel.
  const common = `uniform vec3 uColor; uniform float uR, uShell, uH, uStrength; varying vec3 vW;
    float closest() { vec3 dir = normalize(vW - cameraPosition); float t = -dot(cameraPosition, dir);
      return length(cameraPosition + max(t, 0.0) * dir); }`;
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(shell, 96, 48),
    new THREE.ShaderMaterial({
      uniforms, vertexShader,
      fragmentShader: `${common}
        void main() { float d = closest(); if (d < uR) discard;
          float a = 0.7 * exp(-(d - uR) / uH) * smoothstep(uShell, uShell - (uShell - uR) * 0.5, d) * uStrength;
          gl_FragColor = vec4(uColor * a, a); }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }),
  );
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius * 1.002, 96, 48),
    new THREE.ShaderMaterial({
      uniforms, vertexShader,
      fragmentShader: `${common}
        void main() { float d = closest();
          float a = exp(-max(uR - d, 0.0) / (uH * 0.9)) * 0.32 * uStrength;
          gl_FragColor = vec4(uColor * a, a); }`,
      side: THREE.FrontSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }),
  );
  halo.renderOrder = rim.renderOrder = 20;
  const group = new THREE.Group();
  group.add(rim, halo);
  return group;
}

const COMET_POINTS = 160;

function cometMaterial(pixelRatio) {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 26 * pixelRatio }, uFade: { value: 1 }, uHead: { value: new THREE.Color(0xf4fbff) }, uTail: { value: new THREE.Color(0x5fc8ff) } },
    vertexShader: `attribute float aT; uniform float uSize; varying float vT;
      void main() { vT = aT; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * mix(1.0, 0.18, sqrt(aT)) * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uFade; uniform vec3 uHead, uTail; varying float vT;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
        float a = pow(1.0 - d, 1.4) * pow(1.0 - vT, 1.5) * uFade * (vT < 0.01 ? 1.0 : 0.55);
        gl_FragColor = vec4(mix(uHead, uTail, smoothstep(0.0, 0.35, vT)) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export class SpaceScenery {
  /* scene, camera: the globe's; radius: the Earth's radius in scene units. */
  constructor(scene, camera, { radius = 1, pixelRatio = 1, comets = true, assets = "assets", settle = false } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.radius = radius;
    this.comets = [];
    this.cometsOn = comets && !REDUCED;
    this.nextComet = performance.now() + 2500;
    this.pixelRatio = pixelRatio;

    // Where each body first appears (-1..1 across and up the first view), how far behind
    // the Earth (in Earth radii), its apparent size there (radians), axial tilt, and spin
    // (radians per second: one turn in about 90 s for the Moon, 60 s for Mars).
    const specs = [
      { key: "moon", x: 0.78, y: 0.55, behind: 8, angular: 0.032, tilt: 6.7, spin: 0.07 },
      { key: "mars", x: -0.72, y: 0.62, behind: 20, angular: 0.02, tilt: 25.2, spin: 0.105 },
    ];
    // Wait for the opening camera move to settle before placing them (the Finder flies to
    // the top site first); the Home page places them at once.
    this.settle = settle;
    this.born = performance.now();
    this.still = 0;
    this.lastCam = new THREE.Vector3();
    this.placed = false;
    this.bodies = specs.map((s) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 24),
        new THREE.MeshLambertMaterial({ color: 0x6a6a6a }),
      );
      mesh.rotation.z = s.tilt * DEG;
      mesh.visible = false;
      mesh.renderOrder = 10;
      scene.add(mesh);
      smallTexture(`${assets}/${s.key}_sm.jpg`).then((tex) => {
        mesh.material.dispose();
        // Transparent only while fading in; the atmosphere is drawn after it and hazes it near the limb.
        mesh.material = new THREE.MeshLambertMaterial({ map: tex, color: s.key === "mars" ? 0xd8d8d8 : 0xc4c4c4, transparent: true, opacity: 0 });
        b.ready = true;
      }).catch(() => {});
      if (s.key === "mars") mesh.add(haze(1));
      const b = { ...s, mesh, axis: new THREE.Quaternion().setFromEuler(mesh.rotation), angle: Math.random() * Math.PI * 2, shown: 0 };
      return b;
    });
  }

  /* Park the bodies in space, once: behind the Earth as seen from the current view. */
  _place() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const dist = cam.position.length();
    const vf = Math.tan((cam.fov * DEG) / 2);
    const hf = vf * cam.aspect;
    for (const b of this.bodies) {
      const d = dist + b.behind * this.radius;
      const r = b.angular * d;
      // Keep the whole disc inside narrow first views.
      const x = Math.sign(b.x) * Math.min(Math.abs(b.x) * hf * d, hf * d - r * 1.3);
      b.mesh.position.copy(cam.localToWorld(new THREE.Vector3(x, b.y * vf * d, -d)));
      b.mesh.scale.setScalar(r);
    }
    this.placed = true;
  }

  /* The opening camera move has finished when the camera has kept still for a moment. */
  _settled(dt) {
    if (!this.settle) return true;
    const moved = this.camera.position.distanceToSquared(this.lastCam) > 1e-8;
    this.lastCam.copy(this.camera.position);
    this.still = moved ? 0 : this.still + dt;
    return this.still > 0.6 || performance.now() - this.born > 6000;
  }

  _spawnComet() {
    const cam = this.camera;
    const dist = cam.position.length();
    const depth = dist + this.radius * (3 + Math.random() * 7);
    const vf = Math.tan((cam.fov * DEG) / 2);
    const hf = vf * cam.aspect;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y0 = (Math.random() * 1.3 - 0.4) * vf;
    const y1 = y0 + (Math.random() - 0.6) * vf;
    const start = cam.localToWorld(new THREE.Vector3(-dir * hf * 1.25 * depth, y0 * depth, -depth));
    const end = cam.localToWorld(new THREE.Vector3(dir * hf * 1.25 * depth, y1 * depth, -depth));
    const pos = new Float32Array(COMET_POINTS * 3);
    const t = new Float32Array(COMET_POINTS);
    for (let i = 0; i < COMET_POINTS; i++) t[i] = i / (COMET_POINTS - 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(t, 1));
    const points = new THREE.Points(geo, cometMaterial(this.pixelRatio));
    points.frustumCulled = false;
    this.scene.add(points);
    // A gentle arc: bow the path a little toward the top of the screen.
    const bow = cam.localToWorld(new THREE.Vector3(0, depth * vf * 0.18, -depth)).sub(cam.localToWorld(new THREE.Vector3(0, 0, -depth)));
    this.comets.push({ points, start, end, bow, t0: performance.now(), dur: 2600 + Math.random() * 2200, tail: 0.12 + Math.random() * 0.08 });
  }

  _cometAt(c, f) {
    return c.start.clone().lerp(c.end, f).addScaledVector(c.bow, 4 * f * (1 - f));
  }

  update(dt) {
    const step = Math.min(dt || 0, 0.1);
    if (!this.placed && this._settled(step)) this._place();
    for (const b of this.bodies) {
      if (!REDUCED) b.angle += b.spin * step;
      b.mesh.quaternion.copy(b.axis).multiply(SPIN.setFromAxisAngle(Y_AXIS, b.angle));
      // Fade in once placed and textured.
      const show = this.placed && b.ready;
      b.mesh.visible = show;
      if (show && b.shown < 1) {
        b.shown = REDUCED ? 1 : Math.min(1, b.shown + step / 0.9);
        b.mesh.material.opacity = b.shown;
      }
    }
    if (!this.cometsOn) return;
    const now = performance.now();
    if (now > this.nextComet && this.comets.length < 2) {
      this._spawnComet();
      this.nextComet = now + 5000 + Math.random() * 9000;
    }
    this.comets = this.comets.filter((c) => {
      const f = (now - c.t0) / c.dur;
      if (f >= 1 + c.tail) {
        this.scene.remove(c.points);
        c.points.geometry.dispose();
        c.points.material.dispose();
        return false;
      }
      const pos = c.points.geometry.attributes.position.array;
      for (let i = 0; i < COMET_POINTS; i++) {
        const p = this._cometAt(c, Math.max(0, f - (i / (COMET_POINTS - 1)) * c.tail));
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      }
      c.points.geometry.attributes.position.needsUpdate = true;
      // Fade in at the start and out once the head has left the frame.
      c.points.material.uniforms.uFade.value = Math.min(1, f * 6, (1 + c.tail - f) * 5);
      return true;
    });
  }
}
