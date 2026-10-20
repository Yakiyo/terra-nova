/* Targets page: the Moon and Mars sites from /api/targets, plus a custom profile. */

import { initStarfield } from "./starfield.js";
import { icon } from "./ui.js";
import { breadcrumbs } from "./navigation.js";
import { escapeHtml as esc } from './format.js';

initStarfield("starfield");
let loadGeneration = 0;

function selectedBody() {
  const query = new URLSearchParams(location.search);
  const value = (query.has("body") ? query.get("body") : location.hash.slice(1)).toLowerCase();
  return ["moon", "mars"].includes(value) ? value : "";
}

function renderNavigation(body) {
  const name = body === "moon" ? "Moon" : "Mars";
  document.title = body ? `TerraNova · ${name} target sites` : "TerraNova · Choose a target site";
  document.querySelector(".dest-head h1").innerHTML = body ? `${name === "Moon" ? "The Moon" : "Mars"}.<br><em>Choose your site.</em>` : "Where do we<br><em>go next?</em>";
  breadcrumbs(document.getElementById("targetBreadcrumbs"), [{ label: "Home", href: "index.html" }, body ? { label: "Targets", href: "targets.html" } : { label: "Targets" }, ...(body ? [{ label: name }] : [])]);
  document.querySelectorAll(".body-switch a").forEach(link => {
    if (link.dataset.body === body) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector(".body-switch").style.setProperty("--selected-index", body === "moon" ? 1 : body === "mars" ? 2 : 0);
}
const coord = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;

function card(t, i) {
  const body = t.body.toLowerCase();
  return `<a class="dest-card reveal" style="--d: ${i}" data-source-url="${esc(t.source_url)}" data-dataset-id="${esc(t.id)}" href="finder.html#target=${encodeURIComponent(t.id)}">
      <span class="orb" style="background-image: url('assets/${esc(body)}_sm.jpg'); --x: ${(((t.longitude + 180) / 360) * 100 + 25).toFixed(1)}%" aria-hidden="true"></span>
      <div>
        <h3>${esc(t.short_name)}</h3>
        <span class="where num">${esc(t.body)} · ${coord(t.latitude, t.longitude)}</span>
        <p>${esc(t.summary)}</p>
      </div>
      <span class="go">${icon("arrow-right")}</span>
    </a>`;
}

function customCard(i) {
  return `<a class="dest-card reveal" style="--d: ${i}" href="finder.html#target=custom">
      <span class="orb custom" aria-hidden="true">${icon("sliders-horizontal")}</span>
      <div>
        <h3>Your own profile</h3>
        <span class="where">Any body, any site</span>
        <p>Type the rainfall, temperature swing, slope and other values you need, and see where Earth comes closest.</p>
      </div>
      <span class="go">${icon("arrow-right")}</span>
    </a>`;
}

async function load() {
  const generation = ++loadGeneration;
  const box = document.getElementById("groups");
  const selected = selectedBody();
  renderNavigation(selected);
  try {
    const res = await fetch("/api/targets");
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    const targets = (await res.json()).targets || [];
    if (generation !== loadGeneration) return;
    const bodies = [["Moon", "The Moon"], ["Mars", "Mars"]].filter(([body]) => !selected || body.toLowerCase() === selected);
    let i = 0;
    box.innerHTML = bodies.map(([body, title]) => {
      const items = targets.filter((t) => t.body === body);
      if (!items.length) return "";
      return `<section class="dest-group planet-group" id="${body}" aria-labelledby="g-${body}">
          <div class="planet-intro"><img src="assets/${body.toLowerCase()}.jpg" alt="" loading="lazy"><h2 id="g-${body}">${title}</h2><a href="${body === "Moon" ? "https://trek.nasa.gov/moon/" : "https://trek.nasa.gov/mars/"}" data-dataset-id="${body === "Moon" ? "LRO_WAC" : "Viking_MDIM_2.1"}" class="planet-credit">NASA ${body} Trek imagery</a></div>
          <div class="dest-grid">${items.map((t) => card(t, i++)).join("")}</div>
        </section>`;
    }).join("") + (selected ? "" : `<section class="dest-group" aria-labelledby="g-custom">
        <h2 id="g-custom">Custom</h2>
        <div class="dest-grid">${customCard(i)}</div>
      </section>`);
    if (!box.children.length) box.innerHTML = '<p class="dest-state">No target sites available for this destination. <a href="targets.html">View all targets</a></p>';
  } catch (err) {
    if (generation !== loadGeneration) return;
    box.innerHTML = `<div class="dest-state" role="alert">${icon("warning-circle")}
        <span>Could not load the target sites (${esc(err.message)}). Check that the TerraNova server is running.</span>
        <button class="btn btn-ghost" type="button" id="retry">${icon("arrow-counter-clockwise")} Try again</button></div>`;
    document.getElementById("retry").addEventListener("click", load);
  }
}

load();
window.addEventListener("hashchange", load);
window.addEventListener("popstate", load);
document.querySelector(".body-switch").addEventListener("click", event => {
  const link = event.target.closest("a");
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState(null, "", link.href);
  load();
});
