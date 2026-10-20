/* Watermelon Dropdown Disclosure, Adaptive Slider and Save Toggle adaptations.
 * Native inputs retain application state, semantics and existing event handlers. */
import { icon, closeMenus } from "./ui.js";
import { animateDisclosure, cancelDisclosure, enhanceInlineDisclosure } from './disclosure-motion.js';
import { enhanceRange } from './range-control.js';
import { onDisconnect, within } from './dom-lifecycle.js';

const selects = new WeakMap();
const segments = new WeakMap();
const openSelects = new Set();
const knownToggles = new WeakSet();

function closeSelects(except) {
  openSelects.forEach(control => { if (control !== except) control.close(); });
}

function enhanceSelect(select) {
  if (selects.has(select)) { selects.get(select).sync(); return; }
  // Keep native selects as the fallback in browsers without top-layer popovers.
  if (!("showPopover" in HTMLElement.prototype)) return;
  const name = select.getAttribute("aria-label") || [...(select.labels || [])].map(label => {
    const clone = label.cloneNode(true);
    clone.querySelectorAll("select, .wm-select").forEach(element => element.remove());
    return clone.textContent.trim();
  }).join(" ") || select.id || "Choose an option";
  const details = document.createElement("details");
  details.className = "wm-select";
  details.innerHTML = `<summary aria-label="${name.replace(/[&<>"']/g, "")}" aria-haspopup="menu" aria-expanded="false"><span class="disclosure-symbol" aria-hidden="true">${select.id === "layer" ? '<span class="score-glyph"><i></i><i></i><i></i><i></i><i></i></span>' : icon("sliders-horizontal")}</span><span class="disclosure-value"></span>${icon("caret-down")}</summary><div class="disclosure-options" popover="manual" role="menu"></div>`;
  const summary = details.querySelector("summary"), text = details.querySelector(".disclosure-value"), panel = details.querySelector(".disclosure-options");
  panel.setAttribute("aria-label", name);
  const header = document.createElement("div");
  header.className = "disclosure-panel-head";
  header.setAttribute("role", "presentation");
  const heading = document.createElement("span");
  heading.textContent = select.id === "layer" ? "Map layer" : name;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "disclosure-close";
  dismiss.setAttribute("role", "menuitem");
  dismiss.setAttribute("aria-label", `Close ${name}`);
  dismiss.innerHTML = icon("x");
  dismiss.addEventListener("click", () => close(true));
  header.append(heading, dismiss);
  select.after(details);
  select.hidden = true;
  let signature = "";
  function close(focus = false) {
    if (!details.open) return;
    details.open = false;
    panel.inert = true;
    animateDisclosure(summary, panel, false, () => {
      if (panel.matches(':popover-open')) panel.hidePopover();
    });
    summary.setAttribute("aria-expanded", "false");
    openSelects.delete(control);
    if (focus && details.isConnected) summary.focus({ preventScroll: true });
  }
  function sync() {
    if (!select.isConnected) { close(); return; }
    const value = select.selectedOptions[0]?.textContent || "Choose";
    if (text.textContent !== value) text.textContent = value;
    summary.setAttribute('aria-label', `${name}: ${value}`);
    const disabled = select.matches(':disabled');
    summary.setAttribute("aria-disabled", String(disabled));
    if (disabled) close();
    const next = JSON.stringify([...select.options].map(option => [option.value, option.textContent, option.disabled || option.parentElement.disabled]));
    if (signature !== next) {
      signature = next;
      panel.replaceChildren(header);
      [...select.options].forEach(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "menuitemradio";
        button.dataset.value = option.value;
        button.disabled = option.disabled || !!option.parentElement.disabled;
        const symbol = document.createElement("span");
        symbol.className = "disclosure-option-icon";
        symbol.setAttribute("aria-hidden", "true");
        symbol.innerHTML = option.value === "score" ? '<span class="score-glyph"><i></i><i></i><i></i><i></i><i></i></span>' : icon("sliders-horizontal");
        const label = document.createElement("span");
        label.className = "disclosure-option-name";
        label.textContent = option.textContent;
        button.append(symbol, label);
        button.addEventListener("click", event => {
          event.preventDefault();
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
          close(true);
        });
        panel.append(button);
      });
    }
    panel.querySelectorAll("button[data-value]").forEach(button => button.setAttribute("aria-checked", String(button.dataset.value === select.value)));
  }
  function show(focus = false) {
    if (select.matches(':disabled')) return;
    closeSelects(control);
    closeMenus();
    cancelDisclosure(panel);
    sync();
    details.open = true;
    panel.inert = false;
    summary.setAttribute("aria-expanded", "true");
    panel.showPopover();
    const bounds = summary.getBoundingClientRect();
    const width = Math.min(Math.max(bounds.width, 260), innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - width - 12))}px`;
    const below = innerHeight - bounds.bottom - 16;
    const above = bounds.top - 16;
    const height = Math.min(350, Math.max(100, below >= 160 || below >= above ? below : above));
    panel.style.maxHeight = `${height}px`;
    panel.style.top = `${below >= 160 || below >= above ? bounds.bottom + 8 : Math.max(8, bounds.top - Math.min(panel.scrollHeight, height) - 8)}px`;
    openSelects.add(control);
    animateDisclosure(summary, panel, true);
    if (focus) (panel.querySelector('[aria-checked="true"]:not(:disabled)') || panel.querySelector("button:not(:disabled)"))?.focus();
  }
  const control = { close, sync, details };
  selects.set(select, control);
  select.addEventListener("change", sync);
  summary.addEventListener("click", event => { event.preventDefault(); details.open ? close() : show(); });
  summary.addEventListener("keydown", event => {
    if (event.key === 'Tab') close();
    if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); show(true); }
  });
  details.addEventListener('focusout', () => requestAnimationFrame(() => {
    if (!details.contains(document.activeElement)) close();
  }));
  let typed = "", typeTimer;
  panel.addEventListener("keydown", event => {
    event.stopPropagation();
    const items = [...panel.querySelectorAll("button[data-value]:not(:disabled)")];
    const current = items.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      typed += event.key.toLowerCase();
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => { typed = ""; }, 700);
      items.find(item => item.textContent.toLowerCase().startsWith(typed))?.focus();
    }
    if (event.key === "Tab") close(true);
  });
  const observer = new MutationObserver(sync);
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label', 'value'] });
  onDisconnect(select, () => {
    clearTimeout(typeTimer);
    close();
    cancelDisclosure(panel);
    observer.disconnect();
    select.removeEventListener('change', sync);
    details.remove();
    select.hidden = false;
    selects.delete(select);
  });
  sync();
}

function enhanceSegment(group) {
  if (segments.has(group)) { segments.get(group)(); return; }
  const buttons = [...group.querySelectorAll(":scope > button")];
  if (!buttons.length) return;
  group.classList.add("wm-segment");
  const slider = document.createElement("span");
  slider.className = "segment-slider";
  slider.setAttribute("aria-hidden", "true");
  group.prepend(slider);
  function update() {
    const on = buttons.find(button => button.getAttribute("aria-pressed") === "true" || button.getAttribute("aria-selected") === "true");
    if (!on || !on.offsetWidth) return;
    slider.style.width = `${on.offsetWidth}px`;
    slider.style.height = `${on.offsetHeight}px`;
    slider.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }
  segments.set(group, update);
  const mutations = new MutationObserver(update), resize = new ResizeObserver(update);
  mutations.observe(group, { attributes: true, subtree: true, attributeFilter: ["aria-pressed", "aria-selected"] });
  resize.observe(group);
  onDisconnect(group, () => { mutations.disconnect(); resize.disconnect(); slider.remove(); segments.delete(group); });
  document.fonts.ready.then(update);
  update();
}

export function enhanceFinderControls(root = document) {
  const known = document.getElementById("showKnown"), toggle = document.getElementById("knownToggle");
  if (known && toggle && !knownToggles.has(toggle)) {
    knownToggles.add(toggle);
    let transition;
    const sync = (animate = false) => {
      toggle.setAttribute("aria-pressed", String(known.checked));
      toggle.querySelector(".save-state").textContent = known.checked ? "Shown" : "Hidden";
      toggle.querySelector(".save-icon").innerHTML = icon(known.checked ? "check-circle" : "stack");
      if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches && toggle.animate) {
        toggle.getAnimations().forEach(animation => animation.cancel());
        const width = toggle.parentElement.getBoundingClientRect().width;
        toggle.dataset.confirming = "true";
        const animation = toggle.animate([{ width: `${width}px` }, { width: "44px", offset: 0.4 }, { width: `${width}px` }], { duration: 550, easing: "cubic-bezier(.16,1,.3,1)" });
        transition = animation;
        const done = () => { if (transition === animation) delete toggle.dataset.confirming; };
        animation.finished.then(done, done);
      }
    };
    toggle.addEventListener("click", () => {
      known.checked = !known.checked;
      known.dispatchEvent(new Event("change", { bubbles: true }));
      sync(true);
    });
    known.addEventListener("change", () => sync());
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
      if (event.matches) toggle.getAnimations().forEach(animation => animation.cancel());
    });
    sync();
  }
  within(root, "select").forEach(enhanceSelect);
  within(root, '.segmented[aria-label="View"], .tabs').forEach(enhanceSegment);
  within(root, "details:not(.wm-select)").forEach(enhanceInlineDisclosure);
  within(root, 'input[type=range]').forEach(enhanceRange);
}

document.addEventListener('navigation-open', () => closeSelects());
document.addEventListener('menu-open', () => closeSelects());

document.addEventListener("pointerdown", event => {
  openSelects.forEach(control => { if (!control.details.contains(event.target)) control.close(); });
}, true);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && openSelects.size) {
    event.preventDefault(); event.stopImmediatePropagation();
    [...openSelects].forEach(control => control.close(true));
  }
}, true);
window.addEventListener("resize", () => closeSelects());
window.addEventListener("scroll", event => {
  openSelects.forEach(control => { if (!control.details.contains(event.target)) control.close(); });
}, true);
