// Learn page: one world (Mars or Moon) told in five chapters, with an interactive
// day/dust slider, the missions and the places on Earth where they were tested, and the
// processes TerraNova characterises. Photos come live from the NASA Image Library.
const W = {
  mars: {
    name: "Mars", tex: "assets/mars.jpg", target: "gale_crater", tint: "#ff6a3d",
    kicker: "The red planet",
    intro: "Cold, dry, dusty and thin-aired. Every rover that has driven on Mars was first tested somewhere on Earth.",
    stats: [["Gravity", "38", "% of Earth"], ["Air pressure", "0.6", "% of Earth"], ["Day (sol)", "24h 37", "min"], ["Mean temperature", "−63", "°C"]],
    slider: { label: "Time of day on Mars", unit: "h", max: 24.6, step: 0.1, start: 14,
      dust: true, temp: (h, tau) => { const amp = 42 / (1 + 0.25 * tau), mean = -40 - 2 * tau; return mean + amp * Math.cos(2 * Math.PI * (h - 14) / 24.6); },
      earth: (h) => 15 + 13 * Math.cos(2 * Math.PI * (h - 14) / 24), earthName: "Atacama Desert, Chile",
      note: "Simplified daily curve based on Curiosity's weather station (REMS) in Gale Crater. Dust storms flatten the swing: less sun by day, more warmth trapped at night." },
    missions: [
      { name: "Curiosity", year: "2012", where: "Gale Crater", earth: "Dumont Dunes, Mojave Desert, USA", q: "Curiosity rover selfie", text: "A test rover, 'Scarecrow', practised driving on sand dunes in the Mojave before Curiosity tackled Martian dunes." },
      { name: "Spirit & Opportunity", year: "2004", where: "Gusev Crater & Meridiani", earth: "Silver Lake, Mojave Desert, USA", q: "Opportunity rover Mars", text: "The FIDO prototype rover rehearsed whole mission days in the Mojave before launch." },
      { name: "Perseverance", year: "2021", where: "Jezero Crater", earth: "Atacama Desert, Chile", q: "Perseverance rover Jezero", text: "NASA's ARADS project drilled in the Atacama, Earth's driest desert, to practise hunting for traces of life." },
      { name: "Humans on Mars", year: "future", where: "—", earth: "Devon Island, Canada · Mauna Loa, Hawaii", q: "Haughton Mars Project Devon Island", text: "The Haughton-Mars Project and the HI-SEAS habitat rehearse how crews would live and work on Mars." },
    ],
  },
  moon: {
    name: "Moon", tex: "assets/moon.jpg", target: "lunar_south_pole", tint: "#cfd6e4",
    kicker: "Our nearest world",
    intro: "No air, no weather, and a day that lasts two weeks. Apollo astronauts learned their geology on Earth before walking on the Moon.",
    stats: [["Gravity", "16.5", "% of Earth"], ["Air pressure", "0", "vacuum"], ["Day", "29.5", "Earth days"], ["Surface", "+120 / −170", "°C"]],
    slider: { label: "Days into a lunar day", unit: " d", max: 29.5, step: 0.1, start: 7.4,
      dust: false, temp: (d) => d < 14.75 ? -170 + 290 * Math.pow(Math.sin(Math.PI * d / 14.75), 0.4) : -170 - 10 * Math.sin(Math.PI * (d - 14.75) / 14.75),
      earth: (d) => -25 + 8 * Math.sin(2 * Math.PI * d), earthName: "Devon Island, Canada",
      note: "Simplified equatorial surface temperature. Near the south pole, crater floors that never see sunlight stay below −230 °C and can trap water ice." },
    missions: [
      { name: "Apollo 11–17", year: "1969–72", where: "Six landing sites", earth: "Iceland · Hawaii · Arizona", q: "Apollo astronauts geology training", text: "Crews trained in Iceland's lava fields, on Hawaii's volcanoes and among Arizona's cinder craters." },
      { name: "Apollo 14", year: "1971", where: "Fra Mauro", earth: "Cinder Lake crater field, Arizona, USA", q: "Cinder Lake crater field Apollo", text: "Engineers blasted craters near Flagstaff to recreate a lunar landing site for training." },
      { name: "Artemis", year: "2020s", where: "South Pole", earth: "San Francisco volcanic field, Arizona · Iceland", q: "Artemis astronaut field training Arizona", text: "Artemis crews practise moonwalks and sample collection on volcanic ground in Arizona." },
      { name: "Lava-tube explorers", year: "future", where: "Lunar pits", earth: "Lanzarote, Spain", q: "ESA PANGAEA Lanzarote", text: "ESA's PANGAEA and CAVES courses train astronauts in Lanzarote's lava tubes, a model for lunar caves." },
    ],
  },
};
const PROCESSES = [
  { t: "Dust & wind", mars: "Planet-wide dust storms bury solar panels.", earth: "Sahara and Taklamakan dust, measured by NASA MERRA-2.", q: "Mars dust storm", qe: "Sahara dust storm satellite" },
  { t: "Ice & cold", mars: "Ice caps and ground ice; lunar craters hide ice.", earth: "Permafrost and ice fields, from NASA MODIS snow cover.", q: "Mars north polar ice cap", qe: "Devon Island Haughton crater" },
  { t: "Volcanic rock", mars: "Basalt plains and giant volcanoes.", earth: "Basalt fields in Iceland, Hawaii, Lanzarote.", q: "Olympus Mons", qe: "Iceland lava field" },
  { t: "Caves & lava tubes", mars: "Skylights into lava tubes: shelter from radiation.", earth: "Lava tubes used for astronaut and robot training.", q: "Mars lava tube skylight", qe: "lava tube cave Lava Beds" },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const worldId = new URLSearchParams(location.search).get("world") === "moon" ? "moon" : "mars";
const w = W[worldId];
document.title = `Learn: ${w.name} · TerraNova`;
document.documentElement.style.setProperty("--tint", w.tint);
document.querySelector(`[data-world="${worldId}"]`)?.setAttribute("aria-current", "page");

const chapters = ["Meet " + w.name, "Feel a day", "Tested on Earth", "Processes", "Find your own"];
const pad = (n) => String(n).padStart(2, "0");

document.getElementById("learn").innerHTML = `
<section class="ln-hero">
  <div class="ln-hero-copy">
    <span class="ln-mono">${esc(w.kicker)}</span>
    <h1>Explore<br>${esc(w.name)}</h1>
    <p>${esc(w.intro)}</p>
  </div>
  <ol class="ln-chapters">${chapters.map((c, i) => `<li><a href="#ch${i + 1}"><span class="ln-mono">${pad(i + 1)}</span>${esc(c)}</a></li>`).join("")}</ol>
  <div class="ln-planet" style="--tex:url('${w.tex}')" aria-hidden="true"></div>
</section>

<section class="ln-sec" id="ch1">
  <header class="ln-h"><span class="ln-mono">01</span><h2>Meet ${esc(w.name)}/</h2></header>
  <div class="ln-stats">${w.stats.map(([k, v, u]) => `<div><span class="ln-mono">${esc(k)}</span><b>${esc(v)}</b><small>${esc(u)}</small></div>`).join("")}</div>
</section>

<section class="ln-sec" id="ch2">
  <header class="ln-h"><span class="ln-mono">02</span><h2>Feel a day/</h2><span class="ln-mono ln-tag">Interactive</span></header>
  <div class="ln-day">
    <div class="ln-day-ctl">
      <label class="ln-mono" for="lnT">${esc(w.slider.label)}: <b id="lnTv"></b></label>
      <input id="lnT" type="range" min="0" max="${w.slider.max}" step="${w.slider.step}" value="${w.slider.start}">
      ${w.slider.dust ? `<label class="ln-mono" for="lnD">Dust in the air: <b id="lnDv"></b></label><input id="lnD" type="range" min="0" max="5" step="0.1" value="0.5">` : ""}
      <div class="ln-read">
        <div><span class="ln-mono">${esc(w.name)}</span><b id="lnTemp"></b></div>
        <div><span class="ln-mono">${esc(w.slider.earthName)}</span><b id="lnEarth"></b></div>
        <div><span class="ln-mono">Difference</span><b id="lnDiff"></b></div>
      </div>
      <svg id="lnCurve" class="ln-curve" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true"></svg>
      <p class="ln-note">${esc(w.slider.note)}</p>
    </div>
    <div class="ln-ball" style="--tex:url('${w.tex}')"><i id="lnShade"></i><i id="lnHaze"></i></div>
  </div>
</section>

<section class="ln-sec" id="ch3">
  <header class="ln-h"><span class="ln-mono">03</span><h2>Tested on Earth first/</h2></header>
  <div class="ln-missions">${w.missions.map((m, i) => `<article class="ln-mis">
    <div class="ln-ph" data-q="${esc(m.q)}"></div>
    <span class="ln-mono">${pad(i + 1)} · ${esc(m.year)}</span><h3>${esc(m.name)}</h3>
    <p>${esc(m.text)}</p>
    <dl><dt class="ln-mono">On ${esc(w.name)}</dt><dd>${esc(m.where)}</dd><dt class="ln-mono">On Earth</dt><dd>${esc(m.earth)}</dd></dl>
  </article>`).join("")}</div>
</section>

<section class="ln-sec" id="ch4">
  <header class="ln-h"><span class="ln-mono">04</span><h2>Same processes, two worlds/</h2></header>
  <div class="ln-grid">${PROCESSES.map((p, i) => `<article class="ln-pair">
    <div class="ln-ph" data-q="${esc(worldId === "moon" && i < 2 ? (i ? "lunar south pole crater shadow" : "lunar regolith dust Apollo") : worldId === "moon" && i === 2 ? "lunar mare basalt" : worldId === "moon" ? "lunar pit lava tube LRO" : p.q)}"><span class="ln-mono">${esc(w.name)}</span></div>
    <div class="ln-ph" data-q="${esc(p.qe)}"><span class="ln-mono">Earth</span></div>
    <div class="ln-pair-t"><span class="ln-mono">${pad(i + 1)}</span><h3>${esc(p.t)}</h3><p>${esc(worldId === "moon" ? p.earth : p.mars + " " + p.earth)}</p></div>
  </article>`).join("")}</div>
  <p class="ln-note">Earth can't copy everything: low gravity, vacuum, thin air and space radiation stay out of reach. TerraNova shows, for every site, what matches and what doesn't.</p>
</section>

<section class="ln-sec ln-end" id="ch5">
  <header class="ln-h"><span class="ln-mono">05</span><h2>Find your own analog/</h2></header>
  <p>TerraNova scored all <b>78,247</b> land cells on Earth against ${esc(w.name)}. Only <b>16</b> of them are catalogued analog sites today; the rest are waiting to be explored.</p>
  <a class="ln-btn" href="finder.html#target=${w.target}">Search Earth for ${esc(w.name)} →</a>
</section>`;

// ---- day slider
const T = document.getElementById("lnT"), D = document.getElementById("lnD");
const fmt = (c) => `${c > 0 ? "+" : ""}${Math.round(c)} °C`;
function draw() {
  const h = +T.value, tau = D ? +D.value : 0, s = w.slider;
  const tm = s.temp(h, tau), te = s.earth(h);
  document.getElementById("lnTv").textContent = `${h.toFixed(1)}${s.unit}`;
  if (D) document.getElementById("lnDv").textContent = tau < 1 ? "clear" : tau < 3 ? "dusty" : "dust storm";
  document.getElementById("lnTemp").textContent = fmt(tm);
  document.getElementById("lnEarth").textContent = fmt(te);
  document.getElementById("lnDiff").textContent = `${Math.round(Math.abs(tm - te))} °C ${tm < te ? "colder" : "warmer"}`;
  // planet lighting: sun angle across the day
  const frac = h / s.max, ang = frac * 360;
  document.getElementById("lnShade").style.background =
    `linear-gradient(${ang + 90}deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.92) 62%)`;
  document.getElementById("lnHaze").style.opacity = Math.min(1, tau / 5) * 0.75;
  // curve
  const N = 80, ys = Array.from({ length: 61 }, (_, i) => [s.temp(i / 60 * s.max, 0), s.temp(i / 60 * s.max, 5), s.earth(i / 60 * s.max)]).flat(), lo = Math.min(...ys) - 10, hi = Math.max(...ys) + 10, Y = (c) => 105 - ((c - lo) / (hi - lo)) * 100;
  const path = (fn) => Array.from({ length: N + 1 }, (_, i) => { const x = (i / N) * s.max; return `${i ? "L" : "M"}${(i / N * 300).toFixed(1)},${Y(fn(x)).toFixed(1)}`; }).join("");
  const zero = Y(0);
  document.getElementById("lnCurve").innerHTML = `
    <line x1="0" y1="${zero}" x2="300" y2="${zero}" class="z"/><text x="2" y="${zero - 3}">0 °C</text>
    <path d="${path((x) => s.earth(x))}" class="e"/><path d="${path((x) => s.temp(x, tau))}" class="m"/>
    <line x1="${frac * 300}" y1="0" x2="${frac * 300}" y2="110" class="now"/>
    <circle cx="${frac * 300}" cy="${Y(tm)}" r="3.5" class="m"/><circle cx="${frac * 300}" cy="${Y(te)}" r="3" class="e"/>`;
}
T.addEventListener("input", draw); D?.addEventListener("input", draw); draw();

// ---- NASA Image Library photos (public domain), loaded lazily
const io = new IntersectionObserver((entries) => entries.forEach(async (e) => {
  if (!e.isIntersecting) return; io.unobserve(e.target);
  const el = e.target;
  try {
    const r = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(el.dataset.q)}&media_type=image`);
    const item = (await r.json()).collection.items.find((x) => x.links?.[0]?.href);
    if (!item) return;
    const img = new Image(); img.alt = item.data?.[0]?.title || ""; img.loading = "lazy";
    img.onload = () => el.classList.add("is-in"); img.src = item.links[0].href;
    img.title = `${item.data?.[0]?.title || ""} · NASA Image Library`;
    el.prepend(img);
  } catch { /* keep the placeholder */ }
}), { rootMargin: "200px" });
document.querySelectorAll(".ln-ph").forEach((el) => io.observe(el));
