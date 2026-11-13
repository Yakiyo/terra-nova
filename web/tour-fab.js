
// Floating "guided tour" button beside the globe, under the zoom controls.
(() => {
  const start = document.getElementById("startTour");
  const stage = document.querySelector(".zoom-controls, #zoomIn")?.closest("[class]")?.parentElement || document.body;
  if (!start || document.querySelector(".tour-fab")) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "tour-fab";
  b.innerHTML = '<span class="tour-fab-play" aria-hidden="true">▶</span><span><b>Guided tour</b><small>60 seconds</small></span>';
  b.addEventListener("click", () => start.click());
  document.body.appendChild(b);
  // Hide during the tour and in God's Eye. Watch only body's class and God's Eye's
  // hidden flag, and only write when the value changes (no self-triggering loop).
  const sync = () => {
    const eye = document.getElementById("godseye");
    const hide = document.body.classList.contains("touring") || (!!eye && !eye.hidden);
    if (b.hidden !== hide) b.hidden = hide;
  };
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const eyeEl = document.getElementById("godseye");
  if (eyeEl) new MutationObserver(sync).observe(eyeEl, { attributes: true, attributeFilter: ["hidden"] });
  const place = () => { const z = document.querySelector(".zoom-controls"); if (!z || innerWidth <= 760) { b.style.top = b.style.right = ""; return; }
    const r = z.getBoundingClientRect(); if (!r.height) return;
    b.style.top = `${Math.round(r.bottom + 14)}px`; b.style.right = `${Math.round(innerWidth - r.right)}px`; };
  addEventListener("resize", place); setTimeout(place, 300); setTimeout(place, 2000);
  sync(); void stage;
})();
