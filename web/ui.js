/* Small interface helpers shared by every page: icons and toasts. */

/* An icon from icons.svg (Phosphor, MIT). Decorative unless a label is given. */
export function icon(name, label = "") {
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true"`;
  return `<svg class="i" ${a11y}><use href="icons.svg#i-${name}"></use></svg>`;
}

const KIND_ICON = { info: "info", success: "check-circle", error: "warning-circle" };

const openMenus = new Set();

/* menu(button, panel): a drop-down that opens from a button. Closes on outside click,
 * Esc, Tab or choosing an item; arrows, Home and End move between its controls. */
export function menu(button, panel) {
  const items = () => [...panel.querySelectorAll("button, a[href]")].filter((el) => !el.disabled && !el.hidden);
  const api = {
    close(focusButton = false) {
      if (panel.hidden) return;
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      openMenus.delete(api);
      if (focusButton) button.focus();
    },
    open(focusFirst = false) {
      for (const m of [...openMenus]) m.close();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      openMenus.add(api);
      if (focusFirst) items()[0]?.focus();
    },
  };
  let byKey = false;
  button.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") byKey = true;
    if (e.key === "ArrowDown") { e.preventDefault(); api.open(true); }
  });
  button.addEventListener("click", () => {
    if (panel.hidden) api.open(byKey); else api.close();
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
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) api.close();
  });
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
