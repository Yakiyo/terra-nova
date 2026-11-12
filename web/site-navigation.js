import { icon, closeMenus } from './ui.js';

function enhanceHeader(header, terrain = false) {
  const brand = header.querySelector('.brand');
  const nav = header.querySelector('.main-nav');
  const trigger = header.querySelector('.site-menu-trigger') || document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'site-menu-trigger';
  trigger.innerHTML = `${icon('list')}<span>Menu</span>`;
  trigger.setAttribute('aria-label', 'Open navigation');
  trigger.setAttribute('aria-expanded', 'false');
  const dialog = document.createElement('dialog');
  dialog.className = 'site-menu';
  dialog.id = terrain ? 'terrainNavigation' : 'siteNavigation';
  dialog.setAttribute('aria-label', 'TerraNova navigation');
  dialog.setAttribute('data-lenis-prevent', '');
  trigger.setAttribute('aria-controls', dialog.id);
  dialog.innerHTML = `<div class="site-menu-head"><button class="site-menu-close" type="button" aria-label="Close navigation">${icon('x')}<span>Close</span></button>${brand.outerHTML}</div>`;
  dialog.append(nav);
  const worlds = document.createElement('div');
  worlds.className = 'site-world-links';
  worlds.innerHTML = '<a href="finder.html#target=lunar_south_pole">Explore the Moon</a><a href="finder.html#target=jezero_crater">Explore Mars</a><a href="learn.html?world=mars">Learn: Mars</a><a href="learn.html?world=moon">Learn: Moon</a>';
  nav.append(worlds);
  // "Learn" as a main destination: in the menu and as a glowing pill in the header.
  if (!nav.querySelector('a[href^="learn.html"].nav-link')) {
    const ln = document.createElement('a');
    ln.href = 'learn.html'; ln.className = 'nav-link'; ln.textContent = 'Learn';
    if (location.pathname.endsWith('learn.html')) ln.setAttribute('aria-current', 'page');
    const home = nav.querySelector('a[href="index.html"]');
    home ? home.after(ln) : nav.prepend(ln);
  }
  if (!document.getElementById('learnPillStyle')) {
    const st = document.createElement('style'); st.id = 'learnPillStyle';
    st.textContent = `.learn-pill{position:absolute;left:clamp(104px,9vw,140px);top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;font:600 13px/1 Roboto,system-ui,sans-serif;color:#fff;text-decoration:none;background:linear-gradient(90deg,rgba(255,106,61,.25),rgba(255,73,97,.25));border:1px solid rgba(255,140,90,.7);box-shadow:0 0 14px rgba(255,106,61,.35);animation:learnGlow 2.6s ease-in-out infinite;z-index:5}
.learn-pill:hover{background:#ff6a3d;border-color:#ff6a3d}
.learn-pill small{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
@keyframes learnGlow{50%{box-shadow:0 0 24px rgba(255,106,61,.65)}}
@media (max-width:760px){.learn-pill{left:96px;padding:6px 10px}.learn-pill small{display:none}}`;
    document.head.append(st);
  }
  if (!terrain && !location.pathname.endsWith('learn.html') && !header.querySelector('.learn-pill')) {
    const pill = document.createElement('a');
    pill.href = 'learn.html'; pill.className = 'learn-pill';
    pill.innerHTML = '<span aria-hidden="true">🪐</span>Learn<small>Moon &amp; Mars</small>';
    if (getComputedStyle(header).position === 'static') header.style.position = 'relative';
    header.append(pill);
  }
  document.body.append(dialog);
  header.prepend(trigger);
  header.classList.add('site-header');
  let overflow;
  let closing;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fitDialog = () => { dialog.style.width = `${header.getBoundingClientRect().width}px`; };
  window.addEventListener('resize', () => { if (dialog.open) fitDialog(); });
  const close = () => {
    if (closing || !dialog.open) return;
    if (reduced.matches) { dialog.close(); return; }
    closing = dialog.animate([{ clipPath: 'inset(0)', opacity: 1 }, { clipPath: 'inset(0 0 100%)', opacity: .7 }],
      { duration: 250, easing: 'cubic-bezier(.4,0,1,1)' });
    closing.finished.then(() => { dialog.close(); closing = null; }, () => {});
  };
  reduced.addEventListener('change', () => {
    if (reduced.matches && closing) { closing.cancel(); closing = null; dialog.close(); }
  });
  trigger.addEventListener('click', () => {
    closeMenus();
    document.dispatchEvent(new Event('navigation-open'));
    overflow = document.documentElement.style.overflow;
    fitDialog();
    document.documentElement.style.overflow = 'hidden';
    document.dispatchEvent(new CustomEvent('navigation-state', { detail: { open: true } }));
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
  });
  dialog.querySelector('.site-menu-close').addEventListener('click', close);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('a')) close(); });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = overflow || '';
    trigger.setAttribute('aria-expanded', 'false');
    document.dispatchEvent(new CustomEvent('navigation-state', { detail: { open: false } }));
    trigger.focus({ preventScroll: true });
  });
  if (terrain) {
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'site-terrain-back';
    back.setAttribute('aria-label', 'Back to Finder');
    back.innerHTML = `${icon('arrow-left')}<span>Back to Finder</span>`;
    back.addEventListener('click', () => document.getElementById('geClose').click());
    header.append(back);
  }
}

const header = document.querySelector('.topbar');
if (header) {
  const terrain = document.getElementById('godseye');
  if (terrain) {
    const terrainHeader = document.createElement('header');
    terrainHeader.className = 'topbar terrain-header';
    terrainHeader.append(header.querySelector('.brand').cloneNode(true), header.querySelector('.main-nav').cloneNode(true));
    terrain.prepend(terrainHeader);
    enhanceHeader(terrainHeader, true);
  }
  enhanceHeader(header);
  if (document.body.matches('.page-home')) {
    let previous = scrollY;
    window.addEventListener('scroll', () => {
      const current = scrollY;
      if (Math.abs(current - previous) < 6) return;
      header.classList.toggle('scroll-hidden', current > previous && current > header.offsetHeight && !header.contains(document.activeElement));
      previous = current;
    }, { passive: true });
    header.addEventListener('focusin', () => header.classList.remove('scroll-hidden'));
  }
}
