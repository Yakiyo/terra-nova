// God's Eye side panel as a 4-tab console. Pure layout: every control keeps its id and
// its behaviour in godseye.js. Results that appear (probe, route, profile) bring their
// tab forward, so nothing important lands on a hidden tab.
(() => {
  const panel = document.querySelector(".ge-console");
  if (!panel) return;
  const tabs = [...panel.querySelectorAll("[data-getab]")];
  const show = (name) => {
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.getab === name));
    for (const p of panel.querySelectorAll("[data-getab-panel]")) p.hidden = p.dataset.getabPanel !== name;
    panel.scrollTop = 0;
  };
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.getab)));
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
  // Each time God's Eye opens, start on the overview.
  const root = document.getElementById("godseye");
  if (root) new MutationObserver(() => { if (!root.hidden) show("overview"); }).observe(root, { attributes: true, attributeFilter: ["hidden"] });
})();
