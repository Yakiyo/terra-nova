/* Flat equirectangular map: NASA Blue Marble + the same overlay as the globe.
 * Wheel or buttons to zoom (towards the cursor), drag to pan, click to inspect. */

const MAX_ZOOM = 40;
const TILE_SIZE = { 1: 10, 2: 2.5 };   // degrees; see src/acquire/tiles.py

export class FlatMap {
  constructor(canvas, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.onHover = onHover;
    this.base = null;
    this.overlay = document.createElement("canvas");
    this.overlay.width = 720;
    this.overlay.height = 360;
    this.markers = [];
    this.frame = { x: 0, y: 0, w: 1, h: 1 };   // where the whole world fits at zoom 1
    this.zoom = 1;
    this.center = { u: 0.5, v: 0.5 };           // view centre, in 0..1 map units
    this.overlayOpacity = 1;
    this.tileImages = new Map();                // "z/row/col" -> Image (or "missing")
    new ResizeObserver(() => this.draw()).observe(canvas);
    this._bindPointer();
  }

  setBase(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.base = img; this.draw(); resolve(); };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  setOverlayOpacity(value) {
    this.overlayOpacity = value;
    this.draw();
  }

  /* Sharp NASA imagery tiles for the visible part of the map when zoomed in. */
  _drawTiles(ctx, b, f) {
    const pxPerDeg = b.w / 360;
    // Level 1 under level 2, so a missing sharp tile falls back to a softer one.
    const levels = pxPerDeg > 90 ? [1, 2] : pxPerDeg > 24 ? [1] : [];
    for (const z of levels) this._drawLevel(ctx, b, f, z);
  }

  _drawLevel(ctx, b, f, z) {
    const size = TILE_SIZE[z];
    const west = -180 + ((f.x - b.x) / b.w) * 360;
    const east = -180 + ((f.x + f.w - b.x) / b.w) * 360;
    const north = 90 - ((f.y - b.y) / b.h) * 180;
    const south = 90 - ((f.y + f.h - b.y) / b.h) * 180;
    const r0 = Math.max(0, Math.floor((90 - north) / size));
    const r1 = Math.min(Math.round(180 / size) - 1, Math.floor((90 - south) / size));
    const c0 = Math.max(0, Math.floor((west + 180) / size));
    const c1 = Math.min(Math.round(360 / size) - 1, Math.floor((east + 180) / size));
    if ((r1 - r0 + 1) * (c1 - c0 + 1) > 80) return;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = `${z}/${r}/${c}`;
        let img = this.tileImages.get(key);
        if (!img) {
          img = new Image();
          img.onload = () => this.draw();
          img.onerror = () => this.tileImages.set(key, "missing");
          img.src = `/api/tile/${key}.jpg`;
          this.tileImages.set(key, img);
          if (this.tileImages.size > 400) this.tileImages.delete(this.tileImages.keys().next().value);
        }
        if (img === "missing" || !img.complete || !img.naturalWidth) continue;
        const x = b.x + ((c * size) / 360) * b.w;
        const y = b.y + ((r * size) / 180) * b.h;
        // +0.5 px overlap hides hairline seams between tiles.
        ctx.drawImage(img, x, y, (size / 360) * b.w + 0.5, (size / 180) * b.h + 0.5);
      }
    }
  }

  setOverlay(imageData) {
    this.overlay.getContext("2d").putImageData(imageData, 0, 0);
    this.draw();
  }

  setMarkers(markers) {
    this.markers = markers;
    this.placeMarkers();
  }

  /* ---------------------------------------------------------------- view */

  /* The world rectangle on screen at the current zoom and centre. */
  box() {
    const f = this.frame;
    const w = f.w * this.zoom;
    const h = f.h * this.zoom;
    return { x: f.x + f.w / 2 - this.center.u * w, y: f.y + f.h / 2 - this.center.v * h, w, h };
  }

  _clamp() {
    const half = 0.5 / this.zoom;
    this.center.u = Math.min(1 - half, Math.max(half, this.center.u));
    this.center.v = Math.min(1 - half, Math.max(half, this.center.v));
  }

  /* Zoom by a factor around a screen point (default: frame centre). */
  zoomBy(factor, sx, sy) {
    const f = this.frame;
    const px = sx ?? f.x + f.w / 2;
    const py = sy ?? f.y + f.h / 2;
    const before = this.box();
    const u = (px - before.x) / before.w;
    const v = (py - before.y) / before.h;
    this.zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom * factor));
    const w = f.w * this.zoom;
    const h = f.h * this.zoom;
    // Keep the map point under the cursor fixed.
    this.center.u = u - (px - f.x - f.w / 2) / w;
    this.center.v = v - (py - f.y - f.h / 2) / h;
    this._clamp();
    this.draw();
  }

  home() {
    this.zoom = 1;
    this.center = { u: 0.5, v: 0.5 };
    this.draw();
  }

  flyTo(lat, lon, zoom = 4) {
    this.zoom = Math.max(this.zoom, zoom);
    this.center = { u: (lon + 180) / 360, v: (90 - lat) / 180 };
    this._clamp();
    this.draw();
  }

  _toLatLon(sx, sy) {
    const b = this.box();
    const u = (sx - b.x) / b.w;
    const v = (sy - b.y) / b.h;
    const f = this.frame;
    if (sx < f.x || sx > f.x + f.w || sy < f.y || sy > f.y + f.h) return null;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { lat: 90 - v * 180, lon: -180 + u * 360 };
  }

  _bindPointer() {
    const c = this.canvas;
    let drag = null;
    const local = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    c.addEventListener("pointerdown", (e) => {
      const p = local(e);
      drag = { x: p.x, y: p.y, u: this.center.u, v: this.center.v, moved: 0 };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (drag) {
        const b = this.box();
        drag.moved = Math.max(drag.moved, Math.hypot(p.x - drag.x, p.y - drag.y));
        if (drag.moved > 4 && this.zoom > 1) {
          c.style.cursor = "grabbing";
          this.center.u = drag.u - (p.x - drag.x) / b.w;
          this.center.v = drag.v - (p.y - drag.y) / b.h;
          this._clamp();
          this.draw();
        }
        if (this.onHover) this.onHover(null);
        return;
      }
      if (this.onHover) this.onHover(this._toLatLon(p.x, p.y), p.x, p.y);
    });
    c.addEventListener("pointerup", (e) => {
      const p = local(e);
      const click = drag && drag.moved <= 4;
      drag = null;
      c.style.cursor = "";
      if (!click) return;
      const hit = this._toLatLon(p.x, p.y);
      if (hit && this.onPick) this.onPick(hit.lat, hit.lon);
    });
    c.addEventListener("pointerleave", () => this.onHover && this.onHover(null));
    c.addEventListener("dblclick", (e) => { const p = local(e); this.zoomBy(2, p.x, p.y); });
  }

  /* ---------------------------------------------------------------- draw */

  draw() {
    const { canvas } = this;
    if (canvas.hidden) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Leave room for the controls above and the legend / twin globe below.
    const side = 16;
    const top = 64;
    const bottom = cw > 700 ? 130 : 16;
    let w = cw - side * 2;
    let h = w / 2;
    if (h > ch - top - bottom) { h = ch - top - bottom; w = h * 2; }
    this.frame = { x: (cw - w) / 2, y: top + (ch - top - bottom - h) / 2, w, h };
    this._clamp();
    const f = this.frame;
    const b = this.box();

    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x, f.y, f.w, f.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (this.base) ctx.drawImage(this.base, b.x, b.y, b.w, b.h);
    this._drawTiles(ctx, b, f);
    // Zoomed in, show the 0.5 degree cells as they are instead of smearing them,
    // and fade the overlay so the imagery underneath stays readable.
    ctx.imageSmoothingEnabled = this.zoom < 2.5;
    ctx.globalAlpha = this.overlayOpacity * Math.min(1, Math.max(0.45, 2.2 / this.zoom));
    ctx.drawImage(this.overlay, b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = this.zoom >= 6 ? 5 : this.zoom >= 3 ? 10 : 30;
    for (let lon = -180 + step; lon < 180; lon += step) {
      const px = b.x + ((lon + 180) / 360) * b.w;
      ctx.moveTo(px, f.y); ctx.lineTo(px, f.y + f.h);
    }
    for (let lat = -90 + step; lat < 90; lat += step) {
      const py = b.y + ((90 - lat) / 180) * b.h;
      ctx.moveTo(f.x, py); ctx.lineTo(f.x + f.w, py);
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    this.placeMarkers();
  }

  placeMarkers() {
    const f = this.frame;
    const b = this.box();
    for (const m of this.markers) {
      const x = b.x + ((m.lon + 180) / 360) * b.w;
      const y = b.y + ((90 - m.lat) / 180) * b.h;
      const inside = x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
      m.el.style.display = inside ? "" : "none";
      m.el.style.opacity = "1";
      m.el.style.left = `${x}px`;
      m.el.style.top = `${y}px`;
      if (inside) m.onPlace?.(x, y, this.canvas.clientWidth, this.canvas.clientHeight);
    }
  }
}
