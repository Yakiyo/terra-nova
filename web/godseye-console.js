// God's Eye side panel as a 4-tab console. Pure layout: every control keeps its id and
// its behaviour in godseye.js. Results that appear (probe, route, profile) bring their
// tab forward, so nothing important lands on a hidden tab.
(() => {
  const panel = document.querySelector(".ge-console");
  if (!panel) return;
  const tabs = [...panel.querySelectorAll("[data-getab]")];
  const bar = panel.querySelector(".ge-tabs");
  const close = document.createElement("button");
  close.type = "button"; close.className = "ge-fold"; close.title = "Fold panel away"; close.setAttribute("aria-label", "Fold panel away");
  close.textContent = "\u2715"; bar.appendChild(close);
  const hint = document.createElement("div");
  hint.className = "ge-hint"; hint.textContent = "Tap a tab to open terrain tools";
  bar.after(hint);
  let current = "overview";
  const setCollapsed = (on) => {
    panel.classList.toggle("is-collapsed", on);
    if (on) for (const t of tabs) t.setAttribute("aria-selected", "false");
    else for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.getab === current));
  };
  close.addEventListener("click", () => setCollapsed(true));
  // Drag the left edge to make the panel wider or narrower (remembered per browser).
  const grip = document.createElement("div");
  grip.className = "ge-resize"; grip.title = "Drag to resize"; grip.setAttribute("aria-hidden", "true");
  panel.appendChild(grip);
  try { const w0 = +localStorage.getItem("ge-width"); if (w0) panel.style.width = `${w0}px`; } catch { /* storage off */ }
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); panel.classList.add("is-resizing");
    const right = panel.getBoundingClientRect().right;
    const move = (ev) => { panel.style.width = `${Math.max(280, Math.min(innerWidth * 0.7, right - ev.clientX))}px`; };
    const up = () => { panel.classList.remove("is-resizing"); grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up);
      try { localStorage.setItem("ge-width", parseInt(panel.style.width, 10)); } catch { /* storage off */ } };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up);
  });

  const show = (name) => {
    current = name; panel.classList.remove("is-collapsed");
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.getab === name));
    for (const p of panel.querySelectorAll("[data-getab-panel]")) p.hidden = p.dataset.getabPanel !== name;
    panel.scrollTop = 0;
  };
  tabs.forEach((t) => t.addEventListener("click", () => {
    if (!panel.classList.contains("is-collapsed") && current === t.dataset.getab) setCollapsed(true);
    else show(t.dataset.getab);
  }));
  panel.addEventListener("keydown", (e) => {
    if (!e.target.matches("[data-getab]") || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const i = tabs.indexOf(e.target), next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    next.focus(); show(next.dataset.getab);
  });
  // Bring the Plan tab forward when a probe, route or profile appears.
  const watch = (id, tab) => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(() => { if (!el.hidden) show(tab); }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  };
  watch("geProbe", "plan"); watch("geRoute", "plan"); watch("geProfile", "plan");
  // Title block: a match pill and the coordinates, no rank/candidate badges.
  const sub = document.getElementById("geSub");
  if (sub) {
    const tidy = () => {
      if (sub.querySelector(".ge-match")) return;
      const m = sub.textContent.match(/^(.*?)\s*·\s*(\d+%)\s*match to\s*(.+)$/);
      if (!m) return;
      sub.innerHTML = `<span class="ge-match"><b>${m[2]}</b> match to ${m[3].replace(/[<>&]/g, "")}</span><span class="ge-coord">${m[1].replace(/[<>&]/g, "")}</span>`;
    };
    new MutationObserver(tidy).observe(sub, { childList: true, characterData: true, subtree: true });
    tidy();
  }
  // Each time God's Eye opens, start on the overview.
  const root = document.getElementById("godseye");
  if (root) new MutationObserver(() => { if (!root.hidden) { show("overview"); setCollapsed(true); } }).observe(root, { attributes: true, attributeFilter: ["hidden"] });
})();
