/* Small interface helpers shared by every page: icons and toasts. */
import { animateDisclosure, cancelDisclosure } from './disclosure-motion.js';

/* An icon from icons.svg (Phosphor, MIT). Decorative unless a label is given. */
export function icon(name, label = "") {
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  return `<svg class="i" ${a11y}><use href="icons.svg#i-${name}"></use></svg>`;
}

const KIND_ICON = { info: "info", success: "check-circle", error: "warning-circle" };

export const ANALOG_ROLES = {
  positive: { label: 'Known analog', icon: 'rocket', description: 'Environmental analog used as a positive validation control.' },
  geology: { label: 'Geology only', icon: 'mountains', description: 'Geology outside this model; excluded from validation scoring.' },
  negative: { label: 'Non-analog reference', icon: 'crosshair', description: 'Validation comparison, not a universal geological judgment.' },
};

export function catalogRole(site) {
  return site.kind === 'environment' ? 'positive' : site.kind === 'geology' ? 'geology' : null;
}

export function analogRoleBadge(role) {
  const definition = ANALOG_ROLES[role];
  if (!definition) return '';
  return `<span class="analog-role ${role}" data-analog-role="${role}" title="${definition.description}" data-source-url="/api/analogs" data-dataset-id="terra_nova_known_analogs">${icon(definition.icon)}${definition.label}</span>`;
}

const openMenus = new Set();

/* menu(button, panel): a drop-down that opens from a button. Closes on outside click,
 * Esc, Tab or choosing an item; arrows, Home and End move between its controls. */
export function menu(button, panel) {
  let opened = false;
  const topLayer = 'showPopover' in panel;
  if (topLayer) panel.setAttribute('popover', 'manual');
  if (button.classList.contains("wm-disclosure-trigger")) {
    panel.classList.add("disclosure-panel");
    const header = document.createElement("div");
    header.className = "disclosure-panel-head";
    header.setAttribute("role", "presentation");
    const title = document.createElement("span");
    title.textContent = button.id === "statusPill" ? "Data & validation" : "Help";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "disclosure-close";
    close.setAttribute("aria-label", `Close ${title.textContent}`);
    if (panel.getAttribute("role") === "menu") close.setAttribute("role", "menuitem");
    close.innerHTML = icon("x");
    close.addEventListener("click", () => api.close(true));
    header.append(title, close);
    panel.prepend(header);
  }
  const items = () => [...panel.querySelectorAll("button, a[href]")].filter((el) => !el.disabled && !el.hidden);
  const api = {
    close(focusButton = false) {
      if (!opened) return;
      opened = false;
      panel.inert = true;
      animateDisclosure(button, panel, false, () => {
        panel.hidden = true;
        if (topLayer && panel.matches(':popover-open')) panel.hidePopover();
      });
      button.setAttribute("aria-expanded", "false");
      openMenus.delete(api);
      if (focusButton) button.focus();
    },
    open(focusFirst = false) {
      for (const m of [...openMenus]) m.close();
      document.dispatchEvent(new Event('menu-open'));
      cancelDisclosure(panel);
      opened = true;
      panel.hidden = false;
      panel.inert = false;
      if (topLayer) panel.showPopover();
      button.setAttribute("aria-expanded", "true");
      openMenus.add(api);
      if (panel.classList.contains("disclosure-panel")) {
        const bounds = button.getBoundingClientRect();
        panel.style.position = "fixed";
        panel.style.right = "auto";
        panel.style.left = `${Math.max(12, Math.min(bounds.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 12))}px`;
        panel.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, innerHeight - panel.offsetHeight - 12))}px`;
      }
      animateDisclosure(button, panel, true);
      if (focusFirst) items()[0]?.focus();
    },
  };
  let byKey = false;
  button.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") byKey = true;
    if (e.key === "ArrowDown") { e.preventDefault(); api.open(true); }
  });
  button.addEventListener("click", () => {
    if (!opened) api.open(byKey); else api.close();
    byKey = false;
  });
  panel.addEventListener("keydown", (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (to !== undefined && list.length) { e.preventDefault(); list[(to + list.length) % list.length].focus(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); api.close(true); }
    if (e.key === "Tab") api.close();
  });
  // Capture phase: close (and hand focus back to the button) before the item acts, so a
  // dialog it opens keeps focus and returns it to the button when it closes.
  panel.addEventListener("click", (e) => { if (e.target.closest("button, a")) api.close(true); }, true);
  document.addEventListener("pointerdown", (e) => {
    if (opened && !panel.contains(e.target) && !button.contains(e.target)) api.close();
  });
  document.addEventListener('navigation-open', () => api.close());
  window.addEventListener('resize', () => api.close());
  return api;
}

/* Close any open menu; true if one was open (so Esc stops there). */
export function closeMenus() {
  const open = [...openMenus];
  for (const m of open) m.close(true);
  return open.length > 0;
}

/* toast(message, kind): info and success hide after 5 s; errors stay until dismissed. */
export function toast(message, kind = "error") {
  let stack = document.querySelector(".toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toasts";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.innerHTML = `${icon(KIND_ICON[kind] || "info")}<p></p>
    <button class="icon-button" type="button" aria-label="Dismiss">${icon("x")}</button>`;
  el.querySelector("p").textContent = message;
  const close = () => {
    if (el.classList.contains("leaving")) return;
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector("button").addEventListener("click", close);
  stack.appendChild(el);
  // Keep at most three on screen.
  while (stack.children.length > 3) stack.firstElementChild.remove();
  if (kind !== "error") setTimeout(close, 5000);
  return close;
}
