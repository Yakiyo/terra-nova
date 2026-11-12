/* Shared, synchronous bootstrap: the same inline SVG paints on both documents.
 * Artwork and viewport geometry are decorative, never scientific measurements.
 * No renderer, remote asset, or application module is needed for the handoff. */
(() => {
  const KEY = 'terranova-page-handoff-v3';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1021px), (hover: hover) and (pointer: fine)');
  const params = new URLSearchParams(location.hash.slice(1));
  const isFinder = location.pathname.endsWith('/finder.html');
  const wantsEye = isFinder && params.get('eye') === '1';
  // Decorative storyboard geometry. The curved red boundary travels diagonally
  // across the viewport; the outlined rocket grows in front of the red surface.
  const curve = [[[-5,-2],[15,28],[35,27],[50,24]], [[50,24],[53,60],[82,92],[105,103]]];
  const edgePoints = curve.flatMap(segment => Array.from({length:25}, (_, i) => {
    const t = i / 24, u = 1 - t;
    return [0,1].map(axis => u*u*u*segment[0][axis] + 3*u*u*t*segment[1][axis] + 3*u*t*t*segment[2][axis] + t*t*t*segment[3][axis]);
  }));
  const clip = (offset, revealing = false) => `polygon(${edgePoints.map(([x,y]) => `${x}% ${y+offset}%`).join(',')},105% ${revealing ? '-150%' : '250%'},-5% ${revealing ? '-150%' : '250%'})`;
  const paper = `<svg class="page-fold" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path class="page-shadow" d="M-5 -2C15 28 35 27 50 24C53 60 82 92 105 103"/>
    <path class="page-crease" d="M-5 -2C15 28 35 27 50 24C53 60 82 92 105 103"/>
  </svg>`;
  const rocket = `<svg class="rocket-sprite" viewBox="0 0 200 200" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M58 134C62 81 112 36 177 24C174 88 132 136 80 143Z"/>
      <circle cx="128" cy="74" r="15"/>
      <path d="M63 100C40 96 25 111 18 137L58 130M112 137C115 162 91 178 67 184L78 144M61 140L49 153L62 163L76 146"/>
      <path class="rocket-trail" d="M37 151L21 167M45 170L34 184M19 153L10 162"/>
    </g>
  </svg>`;
  const coveredRocket = 'translate(-50%,-50%) translate(58vw,48vh) scale(1)';
  const startRocket = 'translate(-50%,-50%) translate(-4vw,104vh) scale(.12)';
  const endRocket = 'translate(-50%,-50%) translate(140vw,-45vh) scale(1)';
  let overlay, leaf, fold, sprite, animation, accents = [], watchdog, revealTimer, unlockFlight, destination, phase = 'idle';
  let finderIsReady = false, animatedArrival = false, arrivalFocused = false;
  let pending = false, cancelled = false, adopted = false, unlockShell, shellAbort, bootTimer;
  let arrivalReady = Promise.resolve();
  const painted = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function lockExcept(exempt) {
    const saved = [...(document.body?.children || [])].filter(el => el !== exempt && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    saved.forEach(([el]) => { el.inert = true; });
    return () => saved.forEach(([el, inert]) => { el.inert = inert; });
  }
  function createOverlay(receiving = false) {
    // Temporarily release the browser gutter so the cover can paint to the
    // physical edge, while preserving the underlying document's content width.
    document.documentElement.style.setProperty('--flight-content-width', `${document.documentElement.getBoundingClientRect().width}px`);
    overlay = document.createElement('div');
    overlay.className = 'rocket-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<div class="page-leaf"></div>${paper}${rocket}`;
    // Head bootstrap must paint before body parsing or module evaluation.
    document.documentElement.append(overlay);
    leaf = overlay.firstElementChild;
    fold = overlay.querySelector('.page-fold'); sprite = overlay.querySelector('.rocket-sprite');
    leaf.style.clipPath = clip(receiving ? -120 : 120);
    fold.style.transform = `translateY(${receiving ? -120 : 120}%)`;
    sprite.style.transform = receiving ? coveredRocket : startRocket;
    document.documentElement.classList.add('rocket-busy');
  }
  function setPhase(value) {
    phase = value;
    if (overlay) overlay.dataset.phase = value;
  }
  function cleanup() {
    clearTimeout(watchdog);
    clearTimeout(revealTimer);
    animation?.cancel(); animation = null;
    accents.forEach(effect => effect.cancel()); accents = [];
    overlay?.remove(); overlay = leaf = fold = sprite = null;
    unlockFlight?.(); unlockFlight = null;
    document.documentElement.classList.remove('rocket-busy');
    document.documentElement.style.removeProperty('--flight-content-width');
    document.dispatchEvent(new CustomEvent('rocket-flight', { detail: { active: false } }));
    phase = 'finished';
  }
  function clearMarker() { try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } }
  function navigateDirect() {
    const href = destination; destination = null;
    clearMarker(); cleanup();
    if (href) location.assign(href);
  }
  function animate(revealing) {
    const options = {duration: revealing ? 650 : 1000, easing:'cubic-bezier(.45,0,.2,1)', fill:'forwards'};
    leaf.style.clipPath = clip(120, revealing);
    fold.style.transform = 'translateY(120%)';
    animation = leaf.animate([{clipPath:clip(120, revealing)}, {clipPath:clip(-120, revealing)}], options);
    accents = [
      fold.animate([{transform:'translateY(120%)'}, {transform:'translateY(-120%)'}], options),
      sprite.animate([{transform:revealing ? coveredRocket : startRocket}, {transform:revealing ? endRocket : coveredRocket}], options),
    ];
    return animation.finished;
  }
  async function launch(link) {
    destination = link.href;
    if (reduced.matches || !desktop.matches) return navigateDirect();
    try {
      // Test storage before hiding anything; the receiver consumes this exact URL.
      sessionStorage.setItem(KEY, JSON.stringify({ version: 3, destination, created: Date.now() }));
      createOverlay(); unlockFlight = lockExcept(null);
      document.dispatchEvent(new CustomEvent('rocket-flight', { detail: { active: true } }));
      setPhase('covering');
      watchdog = setTimeout(navigateDirect, 3000);
      await animate(false);
      if (!overlay) return;
      leaf.style.clipPath = clip(-120);
      fold.style.transform = 'translateY(-120%)';
      sprite.style.transform = coveredRocket;
      animation.cancel(); animation = null;
      accents.forEach(effect => effect.cancel()); accents = [];
      setPhase('covered');
      await painted();
      if (!overlay) return;
      location.assign(destination);
    } catch { navigateDirect(); }
  }
  function focusArrival() {
    if (animatedArrival && !wantsEye) {
      if (!finderIsReady || arrivalFocused || overlay || document.activeElement !== document.body) return;
      const results = document.getElementById('results');
      if (results) { results.tabIndex = -1; results.focus({ preventScroll: true }); arrivalFocused = true; }
      return;
    }
    const root = document.getElementById('godseye');
    if (root && !root.hidden && !cancelled) root.focus({ preventScroll: true });
  }
  async function depart() {
    if (phase === 'revealing') return;
    if (!overlay) { focusArrival(); return; }
    clearTimeout(revealTimer); clearTimeout(watchdog);
    if (reduced.matches) { cleanup(); focusArrival(); return; }
    setPhase('revealing');
    try {
      unlockFlight ??= lockExcept(null);
      await painted();
      if (!overlay) return;
      watchdog = setTimeout(() => { cleanup(); focusArrival(); }, 1500);
      await animate(true);
    } catch { /* Motion must never prevent arrival. */ }
    cleanup(); focusArrival();
  }
  function finderReady() {
    finderIsReady = true;
    // Do not return a promise to application startup: readiness flows one way.
    if (animatedArrival && !wantsEye) void depart();
  }
  function cancelArrival(event) {
    if (!pending) return;
    event?.preventDefault();
    cancelled = true; pending = false;
    clearTimeout(bootTimer); shellAbort?.abort();
    cleanup(); unlockShell?.(); unlockShell = null;
    const root = document.getElementById('godseye');
    root.hidden = true; delete root.dataset.arrival;
    const hash = new URLSearchParams(location.hash.slice(1));
    hash.delete('eye');
    history.replaceState(null, '', `${location.pathname}${location.search}${hash.size ? `#${hash}` : ''}`);
    document.querySelector('.site-menu-trigger')?.focus({ preventScroll: true });
  }
  function fail(message) {
    if (animatedArrival) cleanup();
    if (!pending || cancelled || adopted) return;
    clearTimeout(bootTimer);
    const root = document.getElementById('godseye');
    root.dataset.arrival = 'error';
    document.getElementById('geArrivalStatus').textContent = 'God’s Eye could not open. Retry, or return to Finder to choose a site.';
    document.getElementById('geArrivalDetail').textContent = message;
    document.getElementById('geArrivalError').hidden = false;
    document.getElementById('geArrivalRetry').hidden = false;
  }
  function prepareArrival() {
    if (animatedArrival && !wantsEye) {
      unlockFlight ??= lockExcept(null);
      // Give the first real frame a chance to arrive, then expose the existing
      // loading UI instead of holding an unresponsive red screen indefinitely.
      clearTimeout(watchdog);
      revealTimer = setTimeout(() => void depart(), 1500);
      if (finderIsReady) void depart();
      return;
    }
    if (!wantsEye || pending || cancelled) return;
    pending = true;
    const root = document.getElementById('godseye');
    root.hidden = false; root.tabIndex = -1; root.dataset.arrival = 'loading';
    root.setAttribute('aria-labelledby', 'geArrivalTitle');
    document.getElementById('geArrival').hidden = false;
    unlockShell = lockExcept(root);
    shellAbort = new AbortController();
    const options = { signal: shellAbort.signal };
    document.getElementById('geArrivalBack').addEventListener('click', cancelArrival, options);
    document.getElementById('geArrivalRetry').addEventListener('click', () => location.reload(), options);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') return cancelArrival(event);
      if (event.key !== 'Tab') return;
      const items = [...root.querySelectorAll('#geArrival a, #geArrival button, #geArrival summary')].filter(el => !el.hidden && el.offsetParent !== null);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && [root, first].includes(document.activeElement)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }, options);
    bootTimer = setTimeout(() => fail('Startup timed out while preparing the ranked sites.'), 30000);
    arrivalReady = depart();
  }
  function adopt() {
    if (!pending || cancelled) return false;
    adopted = true; pending = false;
    clearTimeout(bootTimer); shellAbort?.abort();
    // Flight owns the outer inert snapshot until its last frame.
    cleanup(); unlockShell?.(); unlockShell = null;
    const root = document.getElementById('godseye');
    delete root.dataset.arrival;
    root.setAttribute('aria-labelledby', 'geTitle');
    document.getElementById('geArrival').hidden = true;
    return true;
  }
  window.rocketTransition = { prepareArrival, finderReady, fail, adopt, get ready() { return arrivalReady; }, get pending() { return pending && !cancelled; }, get cancelled() { return cancelled; } };
  // A recent same-tab, normal navigation may restore the covered pose once.
  try {
    sessionStorage.removeItem('terranova-rocket-handoff');
    sessionStorage.removeItem('terranova-page-handoff-v2');
    const raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY);
    const marker = raw && JSON.parse(raw);
    const navigation = performance.getEntriesByType('navigation')[0];
    const age = Date.now() - marker?.created;
    if (isFinder && marker?.version === 3 && marker.destination === location.href && age >= 0 && age < 10000 && navigation?.type === 'navigate' && !reduced.matches) {
      animatedArrival = true;
      createOverlay(true); setPhase('covered');
      watchdog = setTimeout(() => { cleanup(); focusArrival(); }, 3000);
    }
  } catch { /* Native navigation remains available without storage. */ }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a.cinematic-launch, a[data-finder-launch]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (link.target && link.target !== '_self') || link.hasAttribute('download') || link.origin !== location.origin) return;
    event.preventDefault();
    if (phase !== 'idle' && phase !== 'finished') return;
    launch(link);
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches || !overlay) return;
    if (destination) navigateDirect(); else { cleanup(); focusArrival(); }
  });
  addEventListener('resize', () => {
    if (!overlay) return;
    if (destination) navigateDirect(); else { cleanup(); focusArrival(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !overlay) return;
    if (destination) navigateDirect(); else cleanup();
  });
  addEventListener('pagehide', () => { cleanup(); clearTimeout(bootTimer); });
  addEventListener('pageshow', event => {
    if (event.persisted) {
      clearMarker(); cleanup();
      if (pending) fail('Startup was interrupted by navigation. Retry to reload the local data.');
    }
  });
})();
