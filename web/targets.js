/* Targets page: the Moon and Mars sites from /api/targets, plus a custom profile. */

import { initStarfield } from "./starfield.js";
import { icon } from "./ui.js";

initStarfield("starfield");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const coord = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;

function card(t, i) {
  const body = t.body.toLowerCase();
  return `<a class="dest-card reveal" style="--d: ${i}" href="finder.html#target=${encodeURIComponent(t.id)}">
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
  const box = document.getElementById("groups");
  try {
    const res = await fetch("/api/targets");
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    const targets = (await res.json()).targets || [];
    const bodies = [["Moon", "The Moon"], ["Mars", "Mars"]];
    let i = 0;
    box.innerHTML = bodies.map(([body, title]) => {
      const items = targets.filter((t) => t.body === body);
      if (!items.length) return "";
      return `<section class="dest-group" aria-labelledby="g-${body}">
          <h2 id="g-${body}">${title}</h2>
          <div class="dest-grid">${items.map((t) => card(t, i++)).join("")}</div>
        </section>`;
    }).join("") + `<section class="dest-group" aria-labelledby="g-custom">
        <h2 id="g-custom">Custom</h2>
        <div class="dest-grid">${customCard(i)}</div>
      </section>`;
  } catch (err) {
    box.innerHTML = `<div class="dest-state" role="alert">${icon("warning-circle")}
        <span>Could not load the target sites (${esc(err.message)}). Check that the TerraNova server is running.</span>
        <button class="btn btn-ghost" type="button" id="retry">${icon("arrow-counter-clockwise")} Try again</button></div>`;
    document.getElementById("retry").addEventListener("click", load);
  }
}

load();
