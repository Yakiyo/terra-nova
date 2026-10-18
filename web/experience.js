/* Narrative pages only. Maps and scientific controls retain native scrolling. */
import Lenis from "./vendor/lenis/lenis.mjs";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let lenis;
function configure() {
  lenis?.destroy();
  lenis = null;
  if (reduced.matches) return;
  lenis = new Lenis({
    autoRaf: true,
    anchors: true,
    duration: 1.1,
    syncTouch: false,
    prevent: node => node.hasAttribute?.("data-lenis-prevent"),
  });
}
configure();
reduced.addEventListener("change", configure);
window.addEventListener("pagehide", () => lenis?.destroy());
window.addEventListener("pageshow", event => { if (event.persisted) configure(); });

// One scroll-authored moment: the hero gives way to the planetary destinations.
const hero = document.querySelector(".home-globe");
if (hero) {
  const update = () => {
    if (reduced.matches) { hero.style.transform = ""; return; }
    const progress = Math.min(1, Math.max(0, -document.querySelector(".home").getBoundingClientRect().top / innerHeight));
    hero.style.transform = `translateY(${progress * 80}px)`;
  };
  window.addEventListener("scroll", update, { passive: true });
  reduced.addEventListener("change", update);
}
