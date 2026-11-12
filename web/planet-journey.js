import * as THREE from 'three';
import { createChapterNavigation } from './chapter-navigation.js';

// Presentation geometry only. Scientific measurements remain in src/compute.
export function surfacePoint(lat, lon, radius = 1) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  return new THREE.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)).multiplyScalar(radius);
}
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const planetVertex = `
  varying vec2 uvMap;
  varying vec3 normalW;
  void main() {
    uvMap = uv;
    normalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

export function initPlanetJourney(root, getSelection) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = root.querySelector('.cinematic-canvas');
  const blackout = root.querySelector('.cinematic-blackout');
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .88;
  const scene = new THREE.Scene();
  // Parallel framing keeps each cropped limb consistent across laptop/desktop ratios.
  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, .1, 100);
  camera.position.z = 20;
  const light = new THREE.DirectionalLight(0xfff3e6, 2.1);
  light.position.set(-8, 4, 5);
  scene.add(light, new THREE.AmbientLight(0x7593bc, .075));
  const loader = new THREE.TextureLoader(), textures = [];
  const texture = (name, color = true) => {
    const t = loader.load(`assets/cinematic/${name}`);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.wrapS = THREE.RepeatWrapping;
    textures.push(t);
    return t;
  };
  const geometry = new THREE.SphereGeometry(1, 160, 96), worlds = {};
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      day: {value: texture('earth.jpg')}, clouds: {value: texture('earth-clouds.jpg', false)},
      sun: {value: new THREE.Vector3(-.65, .7, .45).normalize()},
      cloudDrift: {value: 0}, exposure: {value: .7},
    },
    vertexShader: planetVertex,
    fragmentShader: `
      uniform sampler2D day, clouds;
      uniform vec3 sun;
      uniform float cloudDrift, exposure;
      varying vec2 uvMap;
      varying vec3 normalW;
      void main() {
        vec3 n = normalize(normalW);
        float daylight = smoothstep(-.18, .65, dot(n, sun));
        vec2 cloudUV = uvMap + vec2(cloudDrift, 0.);
        float cloud = smoothstep(.08, .88, texture2D(clouds, cloudUV).r);
        float shadow = texture2D(clouds, cloudUV + vec2(.0018, -.001)).r;
        vec3 land = texture2D(day, uvMap).rgb;
        // Desaturated land, deep oceans, cloud shadows: photographic rather than atlas-like.
        float ocean = smoothstep(.005, .075, land.b - max(land.r, land.g));
        float luminance = dot(land, vec3(.2126, .7152, .0722));
        land = mix(vec3(luminance), land, .3);
        land = mix(land, vec3(.007, .024, .058), ocean * .74);
        land *= 1. - shadow * .42;
        vec3 color = mix(land * vec3(.55, .72, 1.), vec3(.5, .62, .82), cloud * .9);
        color *= (.018 + .72 * daylight) * exposure;
        float rim = pow(1. - max(n.z, 0.), 3.8);
        color += vec3(.026, .12, .38) * rim * daylight * .8;
        float glint = pow(max(dot(reflect(-sun, n), vec3(0., 0., 1.)), 0.), 70.);
        color += vec3(.35, .48, .6) * glint * ocean * (1. - cloud) * .22;
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (const name of ['earth', 'moon', 'mars']) {
    const group = new THREE.Group(), surface = new THREE.Group();
    group.add(surface); scene.add(group);
    const map = name === 'earth' ? null : texture(`${name}.jpg`);
    const material = name === 'earth' ? earthMaterial : new THREE.MeshStandardMaterial({
      map, bumpMap: map, bumpScale: name === 'moon' ? .025 : .018,
      color: name === 'moon' ? 0xb4bccb : 0xc0a79c, roughness: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    surface.add(mesh); worlds[name] = {group, surface, mesh};
  }
  const atmosphere = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: planetVertex,
    fragmentShader: `
      varying vec3 normalW;
      void main() {
        vec3 n = normalize(normalW);
        float rim = pow(1. - abs(n.z), 9.);
        float lit = smoothstep(-.3, .7, dot(n, normalize(vec3(-.65,.7,.45))));
        gl_FragColor = vec4(.08, .27, .68, rim * lit * .32);
      }`,
  }));
  atmosphere.scale.setScalar(1.012);
  worlds.earth.surface.add(atmosphere);

  const starPositions = []; let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1600; i++) starPositions.push(random() * 2 - 1, random() * 2 - 1, -15);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starUniforms = {
    starExtent: {value: new THREE.Vector2(5.2, 3.2)},
    starOffset: {value: new THREE.Vector2()},
  };
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xd5d5d5, size: 1.5, sizeAttenuation: false, transparent: true, opacity: .2, depthWrite: false,
  }));
  // Wrap in screen-aligned space instead of rotating the flat field out of view.
  stars.material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, starUniforms);
    shader.vertexShader = `uniform vec2 starExtent; uniform vec2 starOffset;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        transformed.xy = mod(position.xy * starExtent + starOffset + starExtent, starExtent * 2.) - starExtent;
      `);
  };
  // The shader owns the viewport-sized positions, not the CPU bounding sphere.
  stars.frustumCulled = false;
  scene.add(stars);

  // A soft, animated optical corona, with no hard-edged sphere underneath it.
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {time: {value: 0}},
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - .5) * 2.;
        float r = length(p), a = atan(p.y, p.x);
        float flow = sin(a * 13. + time * .18 + r * 15.) * sin(a * 7. - time * .12 - r * 9.);
        float core = exp(-r * r * 300.);
        float corona = exp(-r * 14.) * (.76 + .24 * flow);
        float haze = exp(-r * r * 12.) * .12;
        float rays = pow(abs(sin(a * 5. + .3 * sin(a * 9.) + time * .025)), 18.) * exp(-r * 10.) * .13;
        float edge = 1. - smoothstep(.65, 1., r);
        vec3 c = vec3(1., .89, .67) * core * 2. + vec3(1., .57, .22) * corona;
        c += vec3(.72, .36, .13) * (haze + rays);
        gl_FragColor = vec4(c * edge, edge);
      }`,
  }));
  sun.position.z = -9; scene.add(sun);

  // Selected-site highlight: a glowing amber ring, a bright core and a repeating pulse.
  const ring = new THREE.Mesh(new THREE.RingGeometry(.045, .056, 64), new THREE.MeshBasicMaterial({
    color: 0xffc45c, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: .95,
  }));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(.045, 48), new THREE.MeshBasicMaterial({
    color: 0xffb038, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: .22,
  }));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(.05, .058, 64), new THREE.MeshBasicMaterial({
    color: 0xffc45c, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: .8,
  }));
  ring.add(glow, pulse);
  ring.add(new THREE.Mesh(new THREE.CircleGeometry(.014, 24), new THREE.MeshBasicMaterial({color: 0xffffff, side: THREE.DoubleSide})));
  ring.visible = false;
  const siteLabel = document.createElement('div');
  siteLabel.className = 'cinematic-site-label';
  siteLabel.hidden = true;
  root.appendChild(siteLabel);
  const labelPos = new THREE.Vector3();
  // Highlighted land for the selected analog (Natural Earth outlines, web/assets/analog-areas.json),
  // painted on a transparent shell just above the Earth's surface.
  const areaCanvas = Object.assign(document.createElement('canvas'), {width: 4096, height: 2048});
  const areaTex = new THREE.CanvasTexture(areaCanvas);
  areaTex.colorSpace = THREE.SRGBColorSpace;
  const areaShell = new THREE.Mesh(new THREE.SphereGeometry(1.003, 128, 64),
    new THREE.MeshBasicMaterial({map: areaTex, transparent: true, depthWrite: false, opacity: 0}));
  areaShell.visible = false;
  let areas = null, areaKey = '';
  fetch('assets/analog-areas.json').then(r => r.json()).then(j => { areas = j.areas; }).catch(() => {});
  const paintArea = (name) => {
    const g = areaCanvas.getContext('2d'), W = areaCanvas.width, H = areaCanvas.height;
    g.clearRect(0, 0, W, H);
    const a = areas?.[name];
    if (!a) return false;
    g.beginPath();
    a.ring.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * W, y = (90 - la) / 180 * H; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath();
    g.fillStyle = 'rgba(255, 176, 56, 0.55)'; g.fill();
    g.lineJoin = 'round'; g.shadowColor = 'rgba(255, 170, 40, 1)'; g.shadowBlur = 10;
    g.strokeStyle = 'rgb(255, 200, 90)'; g.lineWidth = 3; g.stroke();
    areaTex.needsUpdate = true;
    return true;
  };

  const chapters = [...root.querySelectorAll('.cinematic-chapter')];
  const copies = chapters.map(c => c.querySelector('.cinematic-copy'));
  let tops = [], halfWidth = 5, raf, last = 0, failed = false;
  const pointer = new THREE.Vector2(), pointerAim = new THREE.Vector2();
  let spin = 0;
  const movePointer = event => { pointerAim.set(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1); };
  const resetPointer = () => pointerAim.set(0, 0);
  window.addEventListener('pointermove', movePointer);
  document.documentElement.addEventListener('pointerleave', resetPointer);
  let selectionKey = '', targetQ = new THREE.Quaternion();
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    halfWidth = 3 * innerWidth / innerHeight;
    starUniforms.starExtent.value.set(halfWidth + .2, 3.2);
    camera.left = -halfWidth; camera.right = halfWidth; camera.updateProjectionMatrix();
    tops = chapters.map(c => c.getBoundingClientRect().top + scrollY);
  };
  resize(); addEventListener('resize', resize);
  const navigation = createChapterNavigation(root, reduced);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000 || 0, .05); last = now;
    if (document.hidden || failed) return;
    navigation.raf(now);
    if (!reduced.matches) spin += dt * .16;
    pointer.lerp(reduced.matches ? new THREE.Vector2() : pointerAim, 1 - Math.exp(-dt * 4));
    let index = 0;
    while (index < chapters.length - 1 && scrollY >= tops[index + 1]) index++;
    const raw = index < chapters.length - 1 ? clamp((scrollY - tops[index]) / (tops[index + 1] - tops[index])) : clamp((scrollY - tops[index]) / innerHeight);
    // Exit -> full black hold -> scene swap -> entrance. Never crossfade two planets.
    const arrive = index === 0 || reduced.matches ? 1 : ease(raw / .20);
    const leave = index === chapters.length - 1 || reduced.matches ? 0 : ease((raw - .55) / .45);
    const visibility = arrive * (1 - leave);
    blackout.style.opacity = String(1 - visibility);
    root.dataset.chapter = String(index);
    copies.forEach((copy, i) => {
      copy.style.opacity = reduced.matches ? String(i === index ? 1 : 0) : String(i === index ? (index === 0 ? 1 : ease((raw - .04) / .20)) * (index === chapters.length - 1 ? 1 : 1 - ease((raw - .52) / .36)) : 0);
      copy.style.pointerEvents = Number(copy.style.opacity) > .1 ? '' : 'none';
    });
    for (const w of Object.values(worlds)) w.group.visible = false;
    sun.visible = index === 0;
    sun.position.set(halfWidth * .44, 2.05, -9);
    sun.material.uniforms.time.value = reduced.matches ? 0 : now / 1000;
    stars.visible = true;
    if (!reduced.matches) {
      const offset = starUniforms.starOffset.value, extent = starUniforms.starExtent.value;
      offset.x = (offset.x + dt * .025) % (extent.x * 2);
      offset.y = (offset.y + dt * .012) % (extent.y * 2);
    }
    const drift = reduced.matches ? 0 : raw;
    const enter = reduced.matches ? 1 : ease(raw / .32);
    const earth = worlds.earth;
    light.position.set(-8, 4, 5);
    if (index === 0) {
      earth.group.visible = true;
      earth.group.position.set(halfWidth * .17, -8.2 + drift * .22, 0);
      earth.group.scale.setScalar(7.6);
      earth.surface.rotation.set(-.4 + pointer.y * .10, 1.1 + drift * .08 + spin * .45 + pointer.x * .22, -.24 + pointer.x * .025);
      earthMaterial.uniforms.exposure.value = .45;
      for (const [name, x, y, size] of [['moon', -.57, 1.45, .23], ['mars', .68, .65, .17]]) {
        const w = worlds[name]; w.group.visible = true;
        w.group.position.set(halfWidth * x, y, 0); w.group.scale.setScalar(size);
        w.surface.rotation.set(.12, reduced.matches ? .2 : spin, .1); if (!reduced.matches) w.group.position.y += Math.sin(now * .0003 + x * 3) * .09;
      }
    } else if (index === 1) {
      earth.group.visible = true;
      earth.group.position.set(.2, -2.8 + drift * .12, 0);
      earth.group.scale.setScalar(8.4);
      earth.surface.rotation.set(.1 + pointer.y * .10, 1.05 + drift * .08 + spin * .45 + pointer.x * .22, -.28);
      earthMaterial.uniforms.exposure.value = .13;
    } else if (index === 2 || index === 3) {
      const side = index === 2 ? 1 : -1, w = worlds[index === 2 ? 'moon' : 'mars'];
      w.group.visible = true;
      w.group.scale.setScalar(4.5);
      w.group.position.set(side * (halfWidth * .22 + 4.5 + (1 - enter) * halfWidth * .78), -.1, 0);
      light.position.set(side * -8, 4, -3);
      w.surface.rotation.set(.12, .2 + spin, .1);
    } else if (index === 4) {
      earth.group.visible = true; earth.group.scale.setScalar(2.65);
      earth.group.position.set(halfWidth * .64 + (1 - enter) * halfWidth, -.1, 0);
      earthMaterial.uniforms.exposure.value = .8;
    }
    const chosen = getSelection(index);
    ring.visible = false;
    siteLabel.hidden = true;
    if (!(chosen && index === 4)) { areaShell.visible = false; areaShell.material.opacity = 0; }
    if (chosen && index === 4) {
      const name = index === 2 ? 'moon' : index === 3 ? 'mars' : 'earth', w = worlds[name];
      const key = `${name}:${chosen.lat},${chosen.lon}`, normal = surfacePoint(chosen.lat, chosen.lon);
      if (key !== selectionKey) {
        selectionKey = key;
        const facing = new THREE.Vector3(index === 2 ? -.76 : index === 3 ? .76 : -.25, 0, .65).normalize();
        targetQ.setFromUnitVectors(normal, facing);
        w.surface.add(ring); ring.position.copy(normal).multiplyScalar(1.006);
        if (!areaShell.parent) w.surface.add(areaShell);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        root.dataset.selectedLocation = chosen.name || key;
        if (arrive < .1) w.surface.quaternion.copy(targetQ);
      }
      w.surface.quaternion.slerp(targetQ, reduced.matches ? 1 : 1 - Math.exp(-dt * 3));
      ring.visible = visibility > .05;
      if (areas && areaKey !== (chosen.name || '')) { areaKey = chosen.name || ""; areaShell.userData.has = paintArea(areaKey); areaShell.material.opacity = 0; }
      areaShell.visible = !!areaShell.userData.has && ring.visible;
      areaShell.material.opacity = Math.min(1, areaShell.material.opacity + dt * 2) * visibility;
      // Pulse: expand and fade every 1.8 s.
      const ph = reduced.matches ? .3 : (now / 1800) % 1;
      pulse.scale.setScalar(1 + ph * 1.6);
      pulse.material.opacity = .8 * (1 - ph);
      // Name label beside the marker, in screen space.
      ring.getWorldPosition(labelPos);
      const facingCam = labelPos.clone().sub(w.group.position).dot(camera.position.clone().sub(labelPos)) > 0;
      labelPos.project(camera);
      if (ring.visible && facingCam && Math.abs(labelPos.x) < 1 && Math.abs(labelPos.y) < 1) {
        siteLabel.hidden = false;
        siteLabel.textContent = chosen.name || '';
        siteLabel.style.left = `${((labelPos.x + 1) / 2) * 100}%`;
        siteLabel.style.top = `${((1 - labelPos.y) / 2) * 100}%`;
        siteLabel.style.opacity = String(visibility);
      }
    }
    if (!reduced.matches && index < 2) earthMaterial.uniforms.cloudDrift.value += dt * .00035;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); failed = true; navigation.destroy(); root.classList.add('cinematic-no-webgl');
    copies.forEach(copy => { copy.style.opacity = '1'; copy.style.pointerEvents = ''; });
  });
  addEventListener('pagehide', () => {
    cancelAnimationFrame(raf); navigation.destroy();
    removeEventListener('pointermove', movePointer); document.documentElement.removeEventListener('pointerleave', resetPointer);
    removeEventListener('resize', resize);
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose();
  }, {once: true});
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  return {renderer, worlds};
}

