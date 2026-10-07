/* Climate simulation for God's Eye: an illustrative day and season at the site.
 *
 * Driven only by the cell's own numbers from /api/score or /api/explain:
 *   mean_annual_temperature, annual_temperature_range (NASA POWER, MERRA-2),
 *   lst_diurnal_range (MODIS land-surface temperature), precipitation (NASA POWER)
 *   and the cell's mean elevation.
 * The sun position is real solar geometry for the site's latitude, month and hour.
 * Temperatures follow smooth daily and yearly cycles through those numbers, cooled
 * with height at the standard lapse rate (6.5 °C/km) and warmed on sunlit slopes.
 * It is a picture of the climate, not a forecast or a measurement. */

import * as THREE from "three";

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LAPSE = 6.5;   // °C per km

/* Thermal colours: fixed scale so day, night and season changes are visible. */
export const THERMAL_RANGE = [-40, 60];
const THERMAL_STOPS = [[-40, [38, 52, 150]], [-15, [86, 146, 226]], [0, [232, 238, 244]], [20, [250, 190, 92]], [40, [228, 88, 40]], [60, [118, 16, 16]]];
export function thermalColour(t) {
  if (t <= THERMAL_STOPS[0][0]) return THERMAL_STOPS[0][1].map((v) => v / 255);
  for (let i = 1; i < THERMAL_STOPS.length; i++) {
    const [t1, c1] = THERMAL_STOPS[i];
    const [t0, c0] = THERMAL_STOPS[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return c0.map((v, k) => (v + (c1[k] - v) * f) / 255);
    }
  }
  return THERMAL_STOPS[THERMAL_STOPS.length - 1][1].map((v) => v / 255);
}
export function thermalGradient() {
  const [lo, hi] = THERMAL_RANGE;
  return `linear-gradient(90deg, ${THERMAL_STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${(((t - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(", ")})`;
}

/* Sun elevation and azimuth (degrees, azimuth clockwise from north) at local solar time. */
export function solarPosition(lat, month, hour) {
  const day = 15 + month * 30.44;
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10)) * DEG;
  const phi = lat * DEG;
  const H = (hour - 12) * 15 * DEG;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const fromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));
  return { elevation: el / DEG, azimuth: ((fromSouth / DEG) + 180 + 360) % 360 };
}

/* Whole degrees, never "-0". */
function deg(t) {
  const r = Math.round(t);
  return `${r === 0 ? 0 : r}`;
}

function compass(az) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];
}

function fmtHour(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* Soft round sprite for snow, dust and cloud puffs. */
function softTexture(size, inner = 0.0) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ClimateSim {
  constructor(eye) {
    this.eye = eye;
    this.month = new Date().getMonth();
    this.hour = 13;
    this.solar = false;      // sun driven by the clock (true) or by the Sun sliders
    this.playing = false;
    this.weather = false;
    this.version = 0;        // bumped whenever the thermal colours need a redraw
    this.drawn = -1;
    this.lastDraw = 0;
    this.snowTex = softTexture(32, 0.1);
    this.cloudTex = softTexture(128);
    this._bindUi();
  }

  _bindUi() {
    $("geMonth").addEventListener("input", (e) => { this.month = Number(e.target.value); this._useClock(); });
    $("geHour").addEventListener("input", (e) => { this.hour = Number(e.target.value); this._useClock(); });
    $("geDayPlay").addEventListener("click", () => this.setPlaying(!this.playing));
    $("geWeather").addEventListener("click", () => this.setWeather(!this.weather));
  }

  /* New site: read its climate numbers. */
  setSite(site, values) {
    this.lat = site.lat;
    const v = values || {};
    const num = (x) => (Number.isFinite(Number(x)) && x !== null ? Number(x) : null);
    this.v = {
      meanT: num(v.mean_annual_temperature),
      annual: num(v.annual_temperature_range),
      diurnal: num(v.lst_diurnal_range),
      precip: num(v.precipitation),
      elevation: num(v.elevation),
    };
    this.available = this.v.meanT !== null;
    this.reset();
    $("geClimatePanel").classList.toggle("unavailable", !this.available);
  }

  /* Back to the opening state (used by Reset all and on every new site). */
  reset() {
    this.solar = false;
    this.setPlaying(false);
    this.setWeather(false);
    this.month = new Date().getMonth();
    this.hour = 13;
    $("geMonth").value = this.month;
    $("geHour").value = this.hour;
    this._readout();
  }

  /* The user moved the Sun sliders or presets: the clock no longer drives the sun. */
  manualSun() {
    this.solar = false;
    this.setPlaying(false);
  }

  setPlaying(on) {
    this.playing = on && this.available;
    $("geDayPlay").setAttribute("aria-pressed", String(this.playing));
    $("geDayPlay").querySelector("use").setAttribute("href", `icons.svg#i-${this.playing ? "pause" : "play"}`);
    $("geDayPlay").querySelector("span").textContent = this.playing ? "Pause the day" : "Play a day";
    if (this.playing) this._useClock();
  }

  setWeather(on) {
    this.weather = on && this.available;
    $("geWeather").setAttribute("aria-pressed", String(this.weather));
    this._clearParticles();
    if (this.weather && this.eye.mesh) this._buildParticles();
    this.eye._applySun(true);
    this._readout();
  }

  _useClock() {
    if (!this.available) return;
    this.solar = true;
    this.eye._setSunPlaying(false);
    this._applyClock();
  }

  _applyClock() {
    const pos = solarPosition(this.lat, this.month, this.hour);
    this.trueElevation = pos.elevation;
    this.eye.sun = { elevation: Math.max(0.5, Math.round(pos.elevation * 2) / 2), azimuth: Math.round(pos.azimuth), lunar: false };
    this.eye._applySun(false);
    $("geMonth").value = this.month;
    $("geHour").value = this.hour;
    this._readout();
  }

  /* ----------------------------------------------------- temperatures */

  /* Cell-mean monthly air temperature: warmest in July (north) or January (south). */
  monthTemp() {
    const { meanT, annual } = this.v;
    const hemi = this.lat >= 0 ? 1 : -1;
    return meanT + hemi * ((annual || 0) / 2) * Math.cos((2 * Math.PI * (this.month - 6)) / 12);
  }

  /* Cell-mean ground temperature now: peaks at 13:30, coldest just before dawn. */
  groundTemp(hour = this.hour) {
    return this.monthTemp() + ((this.v.diurnal || 0) / 2) * Math.cos((2 * Math.PI * (hour - 13.5)) / 24);
  }

  /* Ground temperature at one vertex: lapse rate plus sunlit/shaded slope. */
  _localTemp(i, base, sun, dayFactor) {
    const e = this.eye;
    const ref = this.v.elevation ?? e.base;
    const n = e.mesh.geometry.attributes.normal.array;
    const inc = Math.max(0, n[i * 3] * sun.x + n[i * 3 + 1] * sun.y + n[i * 3 + 2] * sun.z);
    const flat = Math.max(0, sun.y);
    const aspect = dayFactor * ((this.v.diurnal || 0) / 2) * 0.8 * (inc - flat);
    return base - (LAPSE * (e.heights[i] - ref)) / 1000 + aspect;
  }

  _dayFactor() {
    const el = this.solar ? this.trueElevation : Number(this.eye.sun.elevation);
    return Math.min(1, Math.max(0, Math.sin(el * DEG) * 3));
  }

  /* Ground temperature under a probe at (u, v) in the mosaic. */
  tempAt(u, v) {
    const e = this.eye;
    if (!this.available || !e.mesh) return null;
    const c = Math.round(Math.min(1, Math.max(0, u)) * (e.cols - 1));
    const r = Math.round(Math.min(1, Math.max(0, v)) * (e.rows - 1));
    return this._localTemp(r * e.cols + c, this.groundTemp(), e.light.position.clone().normalize(), this._dayFactor());
  }

  thermalColours() {
    const e = this.eye;
    const out = e.thermalColours || (e.thermalColours = new Float32Array(e.rows * e.cols * 3));
    if (!this.available) { out.fill(0.6); return out; }
    const base = this.groundTemp();
    const sun = e.light.position.clone().normalize();
    const day = this._dayFactor();
    for (let i = 0; i < e.rows * e.cols; i++) out.set(thermalColour(this._localTemp(i, base, sun, day)), i * 3);
    return out;
  }

  /* -------------------------------------------------------- lighting */

  /* Called at the end of every sun change: night, twilight and cloud cover. */
  afterSun() {
    const e = this.eye;
    if (this.solar) {
      const day = Math.min(1, Math.max(0, (this.trueElevation + 4) / 10));
      e.light.intensity *= day;
      e.hemi.intensity = 0.07 + 0.48 * day;
      const sky = new THREE.Color(0x02040a).lerp(new THREE.Color(0x0a111c), day);
      e.scene.background = sky;
      if (e.scene.fog) e.scene.fog.color.copy(sky);
      e.stars.visible = day < 0.6;
      $("geSunNote").textContent = this.trueElevation < 0
        ? "Night: the Sun is below the horizon at this hour and month."
        : "Sun position computed for this latitude, month and local solar time.";
    }
    // Clouds, rain, snow and dust are unlit sprites: darken them with the daylight.
    const light = this.solar ? Math.min(1, Math.max(0, (this.trueElevation + 4) / 10)) : 1;
    for (const obj of [this.particles, ...(this.clouds?.children || [])]) {
      if (!obj) continue;
      obj.material.color.copy(obj.userData.base).multiplyScalar(0.18 + 0.82 * light);
    }
    if (this.weather) {
      const cover = this._cover();
      e.light.intensity *= 1 - 0.55 * cover;
      if (e.scene.fog) {
        const s = e.sizeKm || 100;
        e.scene.fog.near = s * (1.4 - 0.9 * cover);
        e.scene.fog.far = s * (4 - 2.2 * cover);
      }
    }
    // A thermal camera sees in the dark: keep the colours readable at night.
    if (e.imagery === "thermal") e.hemi.intensity = Math.max(e.hemi.intensity, 1.1);
    this.version++;
  }

  _cover() {
    return Math.min(1, Math.max(0.08, (this.v.precip || 0) / 1500));
  }

  /* -------------------------------------------------------- particles */

  _kind() {
    // Below freezing it is snow (in polar deserts, fine ice crystals); warm and dry, it is dust.
    const air = this.monthTemp() + ((this.v.diurnal || 0) / 4) * Math.cos((2 * Math.PI * (this.hour - 13.5)) / 24);
    if (air < 0.5) return "snow";
    return (this.v.precip || 0) < 150 ? "dust" : "rain";
  }

  _buildParticles() {
    const e = this.eye;
    const s = e.sizeKm;
    const kind = this._kind();
    this.kind = kind;
    const p = this.v.precip || 0;
    const n = kind === "dust" ? 1400 : Math.round(500 + 3500 * Math.min(1, p / 2000));
    this.ceiling = (e.top - e.base) / 1000 * e.exaggeration + s * 0.14;
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this._spawn(i, true);
    const geo = new THREE.BufferGeometry();
    if (kind === "rain") {
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3));
      this.particles = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa8ccff, transparent: true, opacity: 0.55, depthWrite: false }));
    } else {
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const snow = kind === "snow";
      this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
        color: snow ? 0xffffff : 0xf0d2a8, size: snow ? 3.4 : 3, sizeAttenuation: false, map: this.snowTex,
        transparent: true, opacity: snow ? 0.9 : 0.55, depthWrite: false,
      }));
    }
    this.particles.userData.base = this.particles.material.color.clone();
    this.particles.frustumCulled = false;
    e.scene.add(this.particles);

    // Clouds: soft puffs high over the block, more of them where it is wetter.
    const cover = this._cover();
    this.clouds = new THREE.Group();
    let seed = Math.round((this.lat + 90) * 1000);
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const count = kind === "dust" ? 5 : Math.round(8 + 34 * cover);
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, depthWrite: false,
        color: kind === "dust" ? 0xe9dcc8 : cover > 0.6 ? 0xc9d0da : 0xf2f5f8, opacity: (0.25 + 0.45 * cover) * (0.6 + 0.4 * rand()) });
      const sp = new THREE.Sprite(m);
      sp.userData.base = m.color.clone();
      const w = s * (0.12 + 0.22 * rand());
      sp.scale.set(w, w * 0.55, 1);
      sp.position.set((rand() - 0.5) * s, this.ceiling * (0.85 + 0.25 * rand()), (rand() - 0.5) * s);
      this.clouds.add(sp);
    }
    e.scene.add(this.clouds);
    this.wind = { x: s * 0.02, z: s * 0.008 };
  }

  _spawn(i, anywhere) {
    const e = this.eye;
    const s = e.sizeKm;
    const x = (Math.random() - 0.5) * s;
    const z = (Math.random() - 0.5) * s;
    const ground = e._heightAt(x / s + 0.5, z / s + 0.5);
    let y;
    if (this.kind === "dust") y = ground + Math.random() * s * 0.03;
    else y = anywhere ? ground + Math.random() * (this.ceiling - ground) : this.ceiling * (0.9 + Math.random() * 0.1);
    this.drops.set([x, y, z], i * 3);
  }

  _clearParticles() {
    for (const obj of [this.particles, this.clouds]) {
      if (!obj) continue;
      this.eye.scene.remove(obj);
      obj.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.particles = this.clouds = null;
  }

  _stepParticles(dt) {
    const e = this.eye;
    const s = e.sizeKm;
    const n = this.drops.length / 3;
    const pos = this.particles.geometry.attributes.position.array;
    const fall = this.kind === "rain" ? s * 0.32 : this.kind === "snow" ? s * 0.035 : 0;
    const len = s * 0.012;
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let x = this.drops[k], y = this.drops[k + 1], z = this.drops[k + 2];
      if (this.kind === "snow") {
        x += (this.wind.x * 0.5 + Math.sin(t * 1.3 + i) * s * 0.004) * dt;
        z += (this.wind.z * 0.5 + Math.cos(t * 1.1 + i * 0.7) * s * 0.004) * dt;
      } else if (this.kind === "dust") {
        x += this.wind.x * 2.2 * dt;
        z += this.wind.z * 2.2 * dt;
        y += Math.sin(t * 2 + i) * s * 0.0015 * dt;
      } else {
        x += this.wind.x * dt;
        z += this.wind.z * dt;
      }
      y -= fall * dt;
      const out = Math.abs(x) > s / 2 || Math.abs(z) > s / 2;
      if (out || (this.kind !== "dust" && y < e._heightAt(x / s + 0.5, z / s + 0.5))) {
        this._spawn(i, this.kind === "dust");
        if (this.kind === "dust" && out) this.drops[k] = -Math.sign(x) * s / 2 * 0.98;
        continue;
      }
      this.drops[k] = x; this.drops[k + 1] = y; this.drops[k + 2] = z;
    }
    if (this.kind === "rain") {
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        pos[i * 6] = this.drops[k]; pos[i * 6 + 1] = this.drops[k + 1]; pos[i * 6 + 2] = this.drops[k + 2];
        pos[i * 6 + 3] = this.drops[k] - this.wind.x * 0.04; pos[i * 6 + 4] = this.drops[k + 1] + len; pos[i * 6 + 5] = this.drops[k + 2] - this.wind.z * 0.04;
      }
    } else {
      pos.set(this.drops);
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    for (const c of this.clouds.children) {
      c.position.x += this.wind.x * 0.6 * dt;
      c.position.z += this.wind.z * 0.6 * dt;
      if (c.position.x > s * 0.6) c.position.x = -s * 0.6;
      if (c.position.z > s * 0.6) c.position.z = -s * 0.6;
    }
  }

  /* ------------------------------------------------------------- frame */

  tick(dt) {
    if (!this.available) return;
    if (this.playing) {
      this.hour = (this.hour + dt * 1.6) % 24;   // a day in 15 seconds
      this._applyClock();
      // Rain or dust turns to snow (and back) as the air crosses freezing.
      if (this.weather && this._kind() !== this.kind) this.setWeather(true);
    }
    if (this.weather && this.particles) this._stepParticles(Math.min(dt, 0.05));
    const e = this.eye;
    if (e.imagery === "thermal" && this.version !== this.drawn && performance.now() - this.lastDraw > 120) {
      this.drawn = this.version;
      this.lastDraw = performance.now();
      const attr = e.mesh.geometry.attributes.color;
      attr.array.set(this.thermalColours());
      attr.needsUpdate = true;
    }
  }

  /* Rebuild after the terrain changes (new site or height exaggeration). */
  rebuild() {
    this.version++;
    if (this.weather) { this._clearParticles(); this._buildParticles(); this.eye._applySun(true); }
  }

  _readout() {
    const box = $("geClimate");
    if (!this.available) {
      box.innerHTML = `<span class="hint">No climate numbers for this cell.</span>`;
      return;
    }
    $("geMonthValue").textContent = MONTHS[this.month];
    $("geHourValue").textContent = fmtHour(this.hour);
    const lo = this.groundTemp(1.5), hi = this.groundTemp(13.5), now = this.groundTemp();
    const pos = solarPosition(this.lat, this.month, this.hour);
    const sun = pos.elevation < 0 ? "below the horizon" : `${pos.elevation.toFixed(0)}° up in the ${compass(pos.azimuth)}`;
    const p = this.v.precip;
    const kind = this._kind();
    const when = `this ${MONTHS[this.month]} ${this.hour >= 6 && this.hour < 18 ? "day" : "night"}`;
    let wx = "";
    if (p !== null && kind === "dust") wx = `${Math.round(p)} mm/yr: too dry for rain; wind-blown dust ${when}`;
    else if (p !== null && kind === "snow" && p < 150) wx = `${Math.round(p)} mm/yr: a polar or cold desert; fine snow and ice crystals ${when}`;
    else if (p !== null) wx = `${Math.round(p)} mm/yr, falling as ${kind} ${when}`;
    box.innerHTML = `
      <div class="ge-clim-now"><b class="num">${deg(now)} °C</b><span>ground, cell average<br>${MONTHS[this.month]} · ${fmtHour(this.hour)} solar time</span></div>
      <div class="ge-clim-row"><span>Today</span><b class="num">${deg(lo)} to ${deg(hi)} °C</b></div>
      <div class="ge-clim-row"><span>Sun</span><b>${sun}</b></div>
      ${wx ? `<div class="ge-clim-row"><span>Weather</span><b>${wx}</b></div>` : ""}`;
  }

  dispose() {
    this.setPlaying(false);
    this._clearParticles();
  }
}
