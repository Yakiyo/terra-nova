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
  worlds.innerHTML = '<a href="targets.html?body=moon">Explore the Moon</a><a href="targets.html?body=mars">Explore Mars</a>';
  nav.append(worlds);
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
  if (document.body.matches('.page-home, .page-targets')) {
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
