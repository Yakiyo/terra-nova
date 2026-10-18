/* Adapted from Watermelon Breadcrumb 1; native links preserve browser history. */
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

export function breadcrumbs(container, segments) {
  if (!container) return;
  container.setAttribute("aria-label", "Breadcrumb");
  container.innerHTML = `<ol>${segments.map((segment, index) => `<li>${index ? '<svg class="crumb-separator" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>' : ""}${segment.href ? `<a href="${escape(segment.href)}"${segment.action ? ` data-crumb-action="${escape(segment.action)}"` : ""}>${escape(segment.label)}</a>` : `<span aria-current="page">${escape(segment.label)}</span>`}</li>`).join("")}</ol>`;
}

export function targetTrail(target) {
  const segments = [{ label: "Home", href: "index.html" }, { label: "Targets", href: "targets.html" }];
  if (["Moon", "Mars"].includes(target?.body)) segments.push({ label: target.body, href: `targets.html?body=${target.body.toLowerCase()}` });
  return segments;
}
