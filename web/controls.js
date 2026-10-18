/* Native adaptations of Watermelon Button 12, button groups and map controls. */
import { icon } from "./ui.js";
import { revealOnEntry } from "./reveal.js";
import { enhanceFinderControls } from "./finder-controls.js";

const textSelector = ".home-copy h1, .home-copy .lede, .mission-intro h2, .mission-intro p, .evidence-copy h2, .evidence-copy p, .terrain-story h2, .terrain-story p, .dest-head h1, .dest-head p, .planet-intro h2";
function decorate() {
  document.querySelectorAll(".btn-primary, .btn-ghost, .godseye-button, button.primary, button.ghost").forEach(button => {
    if (button.closest('.disclosure-options, .menu') || button.id === "helpButton") return;
    if (button.querySelector(".button-orb")) return;
    const orb = document.createElement("span");
    orb.className = "button-orb";
    orb.setAttribute("aria-hidden", "true");
    const existingIcon = button.querySelector(":scope > svg");
    if (existingIcon) orb.append(existingIcon);
    else orb.innerHTML = icon("arrow-right");
    button.append(orb);
  });
  document.querySelectorAll(textSelector).forEach(element => revealOnEntry(element, true));
  enhanceFinderControls();
}
decorate();
let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; decorate(); });
}).observe(document.body, { childList: true, subtree: true });

// Watermelon Continuous Tabs movement, using links and the current route.
document.querySelectorAll(".main-nav").forEach(nav => {
  const links = [...nav.querySelectorAll("a")];
  const slider = document.createElement("span");
  slider.className = "nav-slider";
  slider.setAttribute("aria-hidden", "true");
  nav.prepend(slider);
  const selected = () => links.find(link => link.getAttribute("aria-current") === "page") || links[0];
  function move(link) {
    if (!link) return;
    const bounds = link.getBoundingClientRect(), parent = nav.getBoundingClientRect();
    slider.style.width = `${bounds.width}px`;
    slider.style.height = `${bounds.height}px`;
    slider.style.transform = `translate(${bounds.left - parent.left}px, ${bounds.top - parent.top}px)`;
    links.forEach(item => item.toggleAttribute("data-indicator", item === link));
  }
  links.forEach(link => {
    link.addEventListener("pointerenter", () => move(link));
    link.addEventListener("focus", () => move(link));
  });
  nav.addEventListener("pointerleave", () => move(nav.contains(document.activeElement) ? document.activeElement : selected()));
  nav.addEventListener("focusout", event => { if (!nav.contains(event.relatedTarget)) move(selected()); });
  new ResizeObserver(() => move(nav.querySelector("[data-indicator]") || selected())).observe(nav);
  document.fonts.ready.then(() => move(selected()));
  move(selected());
});
