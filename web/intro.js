// Opening frame + "by the numbers" counters for the landing page. Self-contained:
// adds its own DOM, so the cinematic landing code is untouched.
(() => {
  const seen = (() => { try { return sessionStorage.getItem("tn-intro") === "1"; } catch { return false; } })();
  const forced = new URLSearchParams(location.search).has("intro");
  if (!seen || forced) {
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
      removeEventListener("wheel", close); removeEventListener("keydown", close); removeEventListener("touchmove", close);
    };
    el.addEventListener("click", close);
    addEventListener("wheel", close, { passive: true }); addEventListener("keydown", close); addEventListener("touchmove", close, { passive: true });
  }

  // By the numbers, placed right after the first screen.
  const sec = document.createElement("section");
  sec.className = "tn-numbers"; sec.setAttribute("aria-label", "TerraNova by the numbers");
  sec.innerHTML = `<h2>We searched the whole planet.<br><b>Not just the famous places.</b></h2>
    <div class="tn-num"><b data-to="259200">0</b><span>pieces Earth is divided into (0.5° grid, ~55 km each)</span></div>
    <div class="tn-num"><b data-to="78247">0</b><span>land cells, each scored against every target</span></div>
    <div class="tn-num"><b data-to="7">0</b><span>Moon and Mars sites · 9 conditions · 16 known analogs to validate</span></div>`;
  const anchor = document.getElementById("mission");
  if (anchor) anchor.before(sec);
  const run = (b) => {
    const to = +b.dataset.to, t0 = performance.now(), dur = 1600;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      b.textContent = Math.round(to * e).toLocaleString("en-US"); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), { threshold: .4 });
  sec.querySelectorAll("b[data-to]").forEach((b) => io.observe(b));
})();
