// Opening frame + "by the numbers" counters for the landing page. Self-contained:
// adds its own DOM, so the cinematic landing code is untouched.
(() => {
  const seen = (() => { try { return sessionStorage.getItem("tn-intro") === "1"; } catch { return false; } })();
  const forced = new URLSearchParams(location.search).has("intro");
  void seen; void forced;
  {
    const el = document.createElement("div");
    el.className = "tn-intro"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "TerraNova introduction");
    const dots = [6, 11, 15, 19, 26, 31, 33, 36, 41, 70, 76, 82, 88, 94].map((x) => `<i style="left:${x}%;animation-delay:${(x % 7) * .4}s"></i>`).join("");
    el.innerHTML = `<div class="tn-rim"></div><div class="tn-line">${dots}<i class="big" style="left:58%"></i></div>
      <div class="tn-word" aria-hidden="true">TERRANOVA</div>
      <div class="tn-copy"><h1>78,247 places on Earth tested.<br>Only <b>16</b> used as analogs so far.</h1>
        <p>Searching our planet for the Moon and Mars · NASA Space Apps 2026</p></div>
      <button class="tn-go" type="button">Begin ↓</button>`;
    document.body.appendChild(el);
    document.documentElement.style.overflow = "hidden";
    const close = () => {
      if (el.classList.contains("is-gone")) return;
      el.classList.add("is-gone"); document.documentElement.style.overflow = "";
      try { sessionStorage.setItem("tn-intro", "1"); } catch { /* private mode */ }
      setTimeout(() => el.remove(), 1100);
    };
    // Stay here until Begin is pressed; block the page from scrolling underneath.
    const go = el.querySelector(".tn-go");
    go.addEventListener("click", close);
    setTimeout(() => go.focus({ preventScroll: true }), 2100);
    const block = (e) => { if (!el.classList.contains("is-gone")) e.preventDefault(); };
    el.addEventListener("wheel", block, { passive: false }); el.addEventListener("touchmove", block, { passive: false });
  }

  // By the numbers: placed inside the "Earth from orbit" chapter of the cinematic page
  // (or before #mission on the plain page), so no new scroll chapter is added.
  const sec = document.createElement("div");
  sec.className = "tn-numbers"; sec.setAttribute("aria-label", "TerraNova by the numbers");
  sec.innerHTML = `<div class="tn-num"><b data-to="259200">259,200</b><span>pieces of Earth (0.5° grid)</span></div>
    <div class="tn-num"><b data-to="78247">78,247</b><span>land cells scored</span></div>
    <div class="tn-num"><b data-to="16">16</b><span>known analogs, until now</span></div>`;
  const run = (b) => {
    const to = +b.dataset.to, t0 = performance.now(), dur = 1600;
    const fin = setTimeout(() => { b.textContent = to.toLocaleString("en-US"); }, dur + 200);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      b.textContent = Math.round(to * e).toLocaleString("en-US"); if (k < 1) requestAnimationFrame(step); else clearTimeout(fin); };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), { threshold: .3 });
  const addLearn = () => {
    const launch = document.querySelector("#cinematic-finale .cinematic-launch");
    if (!launch || launch.parentElement.querySelector(".tn-learn")) return !!launch;
    const a = document.createElement("a");
    a.href = "learn.html"; a.className = "tn-learn"; a.textContent = "Learn about Moon & Mars";
    launch.after(a); return true;
  };
  if (!addLearn()) { const mo2 = new MutationObserver(() => { if (addLearn()) mo2.disconnect(); }); mo2.observe(document.body, { childList: true, subtree: true }); setTimeout(() => mo2.disconnect(), 15000); }
  const observe = () => sec.querySelectorAll("b[data-to]").forEach((b) => io.observe(b));
  const orbitHost = () => document.querySelector("#cinematic-orbit .cinematic-copy");
  const mission = document.getElementById("mission");
  if (orbitHost()) { orbitHost().appendChild(sec); observe(); }
  else {
    if (mission) { mission.before(sec); observe(); }
    // The cinematic landing builds its chapters later; move the counters into it then.
    const mo = new MutationObserver(() => { const h = orbitHost(); if (h) { h.appendChild(sec); mo.disconnect(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 15000);
  }
})();
