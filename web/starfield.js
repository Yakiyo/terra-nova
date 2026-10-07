/* Background stars behind the pages: a fixed, viewport-sized 2D canvas.
 * Gentle twinkle and a small parallax that eases toward the pointer. Draws once and
 * stops under reduced motion, and pauses while the tab is hidden or when asked
 * (the Finder pauses it while the full-screen 3D view is open). */

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initStarfield(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return { pause() {}, resume() {} };
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let stars = [];
  let frame = 0;
  let paused = false;
  const pointer = { x: 0, y: 0 };
  const offset = { x: 0, y: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // About one star per 7,000 square pixels, so phones and big screens look alike.
    const count = Math.round(Math.min(320, (width * height) / 7000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: Math.random() * 2 + 0.6,
      size: Math.random() * 1.1 + 0.35,
      alpha: Math.random() * 0.45 + 0.25,
      phase: Math.random() * Math.PI * 2,
    }));
    if (REDUCED || paused) draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    offset.x += ((pointer.x - width / 2) * 0.02 - offset.x) * 0.05;
    offset.y += ((pointer.y - height / 2) * 0.02 - offset.y) * 0.05;
    for (const s of stars) {
      let x = (s.x - offset.x / s.z) % width;
      let y = (s.y - offset.y / s.z) % height;
      if (x < 0) x += width;
      if (y < 0) y += height;
      const a = REDUCED ? s.alpha : s.alpha + Math.sin(t * 0.0012 * s.size + s.phase) * 0.15;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = "#eef0f3";
      ctx.fillRect(x, y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    frame = 0;
    if (paused || document.hidden) return;
    draw(t);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (!REDUCED && !paused && !frame && !document.hidden) frame = requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  document.addEventListener("visibilitychange", start);
  pointer.x = window.innerWidth / 2;
  pointer.y = window.innerHeight / 2;
  resize();
  if (REDUCED) draw(0); else start();

  return {
    pause() { paused = true; if (frame) cancelAnimationFrame(frame); frame = 0; },
    resume() { paused = false; start(); },
  };
}
