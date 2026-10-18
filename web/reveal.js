/* Decorative reveals only. Exact API text and final bar widths stay unchanged. */
const preference = matchMedia("(prefers-reduced-motion: reduce)");
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
    const digits = element.querySelectorAll(".counter-digit");
    const parts = options.text ? [element] : digits.length ? digits : element.querySelectorAll(".bar i");
    const animations = [];
    element.dataset.revealRuns = String(Number(element.dataset.revealRuns || 0) + 1);
    parts.forEach((part, index) => {
      const frames = options.text
        ? [{ clipPath: "inset(0 0 100% 0)", transform: "translateY(16px)" }, { clipPath: "inset(0)", transform: "translateY(0)" }]
        : digits.length ? [{ transform: "translateY(105%)" }, { transform: "translateY(0)" }]
        : [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }];
      const animation = part.animate(frames, { duration: options.text ? 1000 : digits.length ? 1000 : 1250, delay: Math.min(300, index * (digits.length ? 50 : 60)), easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
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
  watched.set(element, options);
  observer.observe(element);
}

export function revealOnce(element) {
  if (!element?.dataset.revealed) observe(element, { repeat: false });
}

export function revealOnEntry(element, text = false) {
  observe(element, { repeat: true, text });
}

export function counterMarkup(value) {
  return `<span class="visually-hidden">${value}</span><span class="counter-visual" aria-hidden="true">${[...value].map(digit => `<span class="counter-window"><span class="counter-digit">${digit}</span></span>`).join("")}</span>`;
}

preference.addEventListener("change", () => {
  if (!preference.matches) return;
  active.forEach(animation => animation.cancel());
  active.clear();
  watched.forEach((options, element) => { element.dataset.revealed = "true"; });
});
