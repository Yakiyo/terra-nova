import "./site-navigation.js";
/* Native adaptations of Watermelon Button 12, button groups and map controls. */
import { icon } from "./ui.js";
import { revealOnEntry } from "./reveal.js";
import { enhanceFinderControls } from "./finder-controls.js";
import { within } from './dom-lifecycle.js';

const textSelector = ".home-copy h1, .home-copy .lede, .mission-intro h2, .mission-intro p, .evidence-copy h2, .evidence-copy p, .terrain-story h2, .terrain-story p, .dest-head h1, .dest-head p, .planet-intro h2";
function decorate(root = document) {
  within(root, 'a[href]').forEach(link => {
    const excluded = link.matches('.btn, .nav-link, .mission-world, .dest-card, .skip, .scroll-cue') || link.closest('.brand, .body-switch, .site-world-links');
    link.classList.toggle('text-link-motion', !excluded);
  });
  within(root, ".btn-primary, .btn-ghost, .godseye-button, button.primary, button.ghost").forEach(button => {
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
  within(root, textSelector).forEach(element => revealOnEntry(element, true));
  enhanceFinderControls(root);
}
decorate();
let scheduled = false;
const pending = new Set();
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) if (node instanceof Element) pending.add(node);
  }
  if (!pending.size) return;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const roots = [...pending].filter(node => node.isConnected);
    pending.clear();
    roots.filter(node => !roots.some(parent => parent !== node && parent.contains(node))).forEach(decorate);
  });
}).observe(document.body, { childList: true, subtree: true });
