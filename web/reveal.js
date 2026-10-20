/* Presentation-only motion. Accessible API text and final bar widths stay exact. */
const preference = matchMedia("(prefers-reduced-motion: reduce)");
import { onDisconnect } from './dom-lifecycle.js';
const watched = new Map();
const active = new Set();
const localAnimations = new WeakMap();
let lastScroll = window.scrollY;
let scrollingUp = false;
function updateDirection() {
  const next = window.scrollY;
  // Ignore tiny scroll-settling corrections from smooth scrolling.
  if (Math.abs(next - lastScroll) > 12) {
    scrollingUp = next < lastScroll;
    lastScroll = next;
  }
  if (scrollingUp) active.forEach(animation => animation.cancel());
}
window.addEventListener("scroll", updateDirection, { passive: true });
window.addEventListener("wheel", event => {
  if (event.deltaY) scrollingUp = event.deltaY < 0;
  if (scrollingUp) active.forEach(animation => animation.cancel());
}, { passive: true });

function cancel(element) {
  localAnimations.get(element)?.forEach(animation => animation.cancel());
  localAnimations.delete(element);
}

function countUp(element) {
  const counters = [...element.querySelectorAll('.counter-visual')];
  const duration = 1200;
  let frame, start;
  const settle = () => {
    cancelAnimationFrame(frame);
    counters.forEach(counter => { counter.textContent = counter.dataset.final; });
    element.dataset.counting = 'false';
    active.delete(animation);
  };
  const animation = { cancel: settle };
  active.add(animation);
  localAnimations.set(element, [animation]);
  element.dataset.counting = 'true';
  element.dataset.countDuration = String(duration);
  counters.forEach(counter => { counter.textContent = '0'; });
  const tick = now => {
    if (!element.isConnected || preference.matches || document.hidden) { settle(); return; }
    start ??= now;
    const progress = Math.min(1, (now - start) / duration);
    // Intermediate digits are decorative, never measurements or application state.
    counters.forEach(counter => {
      const target = Number(counter.dataset.final.replaceAll(',', ''));
      const text = Math.floor(target * (1 - (1 - progress) ** 3)).toLocaleString('en-US');
      if (counter.textContent !== text) counter.textContent = text;
    });
    if (progress < 1) frame = requestAnimationFrame(tick); else settle();
  };
  frame = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) active.forEach(animation => animation.cancel());
});
window.addEventListener('pagehide', () => active.forEach(animation => animation.cancel()));

const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
  updateDirection();
  for (const entry of entries) {
    const element = entry.target;
    const options = watched.get(element);
    if (!options) continue;
    if (!entry.isIntersecting) {
      element.dataset.inView = "false";
      cancel(element);
      if (!element.isConnected) { observer.unobserve(element); watched.delete(element); }
      continue;
    }
    if (entry.intersectionRatio < 0.2 || element.dataset.inView === "true") continue;
    element.dataset.inView = "true";
    element.dataset.revealed = "true";
    if (!options.repeat) { observer.unobserve(element); watched.delete(element); }
    if (preference.matches || scrollingUp || !element.animate) continue;
    cancel(element);
    element.dataset.revealRuns = String(Number(element.dataset.revealRuns || 0) + 1);
    if (element.querySelector('.counter-visual')) { countUp(element); continue; }
    const parts = options.text ? [element] : element.querySelectorAll(".bar i");
    const animations = [];
    parts.forEach((part, index) => {
      const frames = options.text
        ? [{ clipPath: "inset(0 0 100% 0)", transform: "translateY(16px)" }, { clipPath: "inset(0)", transform: "translateY(0)" }]
        : [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }];
      const animation = part.animate(frames, { duration: options.text ? 1000 : 1250, delay: Math.min(300, index * 60), easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      active.add(animation);
      animations.push(animation);
      animation.finished.then(() => active.delete(animation), () => active.delete(animation));
    });
    localAnimations.set(element, animations);
  }
}, { threshold: [0, 0.2] }) : null;

function observe(element, options) {
  if (!element || watched.has(element)) return;
  if (!observer) { element.dataset.revealed = "true"; return; }
  if (preference.matches) element.dataset.revealed = "true";
  // The browser may already have painted this text before the module loads.
  // Never hide visible arrival content to start a late entrance animation.
  // Keep observing it so leaving and scrolling back down can still replay.
  if (options.text) {
    const bounds = element.getBoundingClientRect();
    const visible = Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0);
    if (bounds.height > 0 && visible >= Math.min(bounds.height, innerHeight) * 0.2 && bounds.right > 0 && bounds.left < innerWidth) {
      element.dataset.revealed = 'true';
      element.dataset.inView = 'true';
    }
  }
  watched.set(element, options);
  observer.observe(element);
  onDisconnect(element, () => { cancel(element); observer.unobserve(element); watched.delete(element); });
}

export function revealOnce(element) {
  if (!element?.dataset.revealed) observe(element, { repeat: false });
}

export function revealOnEntry(element, text = false) {
  observe(element, { repeat: true, text });
}

export function counterMarkup(value) {
  return `<span class="visually-hidden">${value}</span><span class="counter-visual" aria-hidden="true" data-final="${value}" style="min-width:${value.length}ch">${value}</span>`;
}

preference.addEventListener("change", () => {
  if (!preference.matches) return;
  active.forEach(animation => animation.cancel());
  active.clear();
  watched.forEach((options, element) => { element.dataset.revealed = "true"; });
});
