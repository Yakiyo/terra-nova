
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
  const sync = () => { const eyeOpen = document.getElementById("godseye") && !document.getElementById("godseye").hidden;
    b.hidden = document.body.classList.contains("touring") || eyeOpen; };
  new MutationObserver(sync).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden", "class"] });
  const place = () => { const z = document.querySelector(".zoom-controls"); if (!z || innerWidth <= 760) { b.style.top = b.style.right = ""; return; }
    const r = z.getBoundingClientRect(); if (!r.height) return;
    b.style.top = `${Math.round(r.bottom + 14)}px`; b.style.right = `${Math.round(innerWidth - r.right)}px`; };
  addEventListener("resize", place); setTimeout(place, 300); setTimeout(place, 2000);
  sync(); void stage;
})();
