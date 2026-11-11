/* Shared, synchronous bootstrap: the same inline SVG paints on both documents.
 * Artwork and viewport geometry are decorative, never scientific measurements.
 * No renderer, remote asset, or application module is needed for the handoff. */
(() => {
  const KEY = 'terranova-rocket-handoff';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1021px), (hover: hover) and (pointer: fine)');
  const params = new URLSearchParams(location.hash.slice(1));
  const isFinder = location.pathname.endsWith('/finder.html');
  const wantsEye = isFinder && params.get('eye') === '1';
  // Opaque silver hull, inset panels, machined rings, swept fins and red livery.
  const artwork = `<svg class="rocket-sprite" viewBox="0 0 240 800" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rocket-metal"><stop stop-color="#35404b"/><stop offset=".16" stop-color="#85939f"/><stop offset=".38" stop-color="#e8eef2"/><stop offset=".56" stop-color="#c5cfd6"/><stop offset=".82" stop-color="#7f8e9c"/><stop offset="1" stop-color="#27323d"/></linearGradient>
      <linearGradient id="rocket-red"><stop stop-color="#6b0719"/><stop offset=".38" stop-color="#f33450"/><stop offset=".7" stop-color="#d5092b"/><stop offset="1" stop-color="#680e20"/></linearGradient>
      <linearGradient id="rocket-fin" x2="1" y2="1"><stop stop-color="#cbd6df"/><stop offset="1" stop-color="#35414d"/></linearGradient>
      <linearGradient id="rocket-exhaust" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6f3dd"/><stop offset=".3" stop-color="#efa977"/><stop offset="1" stop-color="#d55330" stop-opacity="0"/></linearGradient>
    </defs>
    <path d="M105 714Q98 753 120 800Q142 753 135 714Z" fill="url(#rocket-exhaust)"/>
    <path d="M75 542L18 659L18 702L77 658ZM165 542L222 659L222 702L163 658Z" fill="url(#rocket-fin)" stroke="#475563" stroke-width="2"/>
    <path d="M18 659L18 702L42 684L43 610ZM222 659L222 702L198 684L197 610Z" fill="url(#rocket-red)"/>
    <path d="M98 677L91 721Q120 733 149 721L142 677Z" fill="#27323d" stroke="#8a9aa6" stroke-width="3"/>
    <path d="M120 18C91 64 70 119 70 181V654Q70 686 94 695H146Q170 686 170 654V181C170 119 149 64 120 18Z" fill="url(#rocket-metal)"/>
    <path d="M120 18C108 37 98 58 91 80Q120 88 149 80C142 58 132 37 120 18Z" fill="url(#rocket-red)"/>
    <path d="M70 176Q120 184 170 176V205Q120 214 70 205Z" fill="url(#rocket-red)"/>
    <path d="M72 225H168M72 496H168M72 637H168M76 661H164" fill="none" stroke="#495b6a" stroke-opacity=".55" stroke-width="2"/>
    <path d="M84 242V474M84 511V622M157 242V474M157 511V622" stroke="#f7fafb" stroke-opacity=".28"/>
    <rect x="102" y="260" width="36" height="60" rx="18" fill="#3c4b58" stroke="#e2eaf0" stroke-width="4"/>
    <rect x="108" y="267" width="24" height="46" rx="12" fill="#0c263d"/>
    <path d="M111 293V279Q111 270 120 270" fill="none" stroke="#99bfd6" stroke-width="3"/>
    <path d="M114 565L110 690L120 711L130 690L126 565Z" fill="url(#rocket-metal)" stroke="#687887"/>
    <path d="M111 664L110 690L120 711L130 690L129 664Z" fill="url(#rocket-red)"/>
    <g fill="#536675"><circle cx="78" cy="236" r="2"/><circle cx="162" cy="236" r="2"/><circle cx="78" cy="486" r="2"/><circle cx="162" cy="486" r="2"/><circle cx="78" cy="628" r="2"/><circle cx="162" cy="628" r="2"/></g>
  </svg>`;
  let overlay, sprite, animation, watchdog, unlockFlight, destination, phase = 'idle';
  let pending = false, cancelled = false, adopted = false, unlockShell, shellAbort, bootTimer;
  let arrivalReady = Promise.resolve();
  const painted = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const coverScale = () => Math.max(innerWidth / 96, innerHeight / 460) * 1.06;
  const coveredPose = () => `translateY(0px) rotate(0deg) scale(${coverScale()})`;
  function lockExcept(exempt) {
    const saved = [...document.body.children].filter(el => el !== exempt && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    saved.forEach(([el]) => { el.inert = true; });
    return () => saved.forEach(([el, inert]) => { el.inert = inert; });
  }
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'rocket-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = artwork;
    // Head bootstrap must paint before body parsing or module evaluation.
    document.documentElement.append(overlay);
    sprite = overlay.firstElementChild;
    document.documentElement.classList.add('rocket-busy');
  }
  function setPhase(value) {
    phase = value;
    if (overlay) overlay.dataset.phase = value;
  }
  function cleanup() {
    clearTimeout(watchdog);
    animation?.cancel(); animation = null;
    overlay?.remove(); overlay = sprite = null;
    unlockFlight?.(); unlockFlight = null;
    document.documentElement.classList.remove('rocket-busy');
    document.dispatchEvent(new CustomEvent('rocket-flight', { detail: { active: false } }));
    phase = 'idle';
  }
  function clearMarker() { try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } }
  function navigateDirect() {
    const href = destination; destination = null;
    clearMarker(); cleanup();
    if (href) location.assign(href);
  }
  function animate(frames, duration, easing) {
    animation = sprite.animate(frames, { duration, easing, fill: 'forwards' });
    return animation.finished;
  }
  async function launch(link) {
    destination = link.href;
    if (reduced.matches || !desktop.matches) return navigateDirect();
    try {
      // Test storage before hiding anything; the receiver consumes this exact URL.
      sessionStorage.setItem(KEY, JSON.stringify({ destination, created: Date.now() }));
      createOverlay(); unlockFlight = lockExcept(null);
      document.dispatchEvent(new CustomEvent('rocket-flight', { detail: { active: true } }));
      setPhase('approach');
      watchdog = setTimeout(navigateDirect, 3000);
      const startScale = Math.min(innerWidth / 800, innerHeight / 1100);
      await animate([
        { transform: `translateY(${innerHeight * .8}px) rotate(-14deg) scale(${startScale})` },
        { transform: `translateY(${innerHeight * .1}px) rotate(-7deg) scale(${startScale * 2})`, offset: .48 },
        { transform: coveredPose() },
      ], 800, 'cubic-bezier(.55,.02,.82,.45)');
      if (!overlay) return;
      // Retire the scaled compositor bitmap and paint the SVG at its final size.
      // The receiver starts from this same sharp, static covered pose.
      sprite.style.transform = coveredPose();
      sprite.style.willChange = 'auto';
      animation.cancel(); animation = null;
      setPhase('covered');
      await painted();
      if (!overlay) return;
      location.assign(destination);
    } catch { navigateDirect(); }
  }
  function focusArrival() {
    const root = document.getElementById('godseye');
    if (root && !root.hidden && !cancelled) root.focus({ preventScroll: true });
  }
  async function depart() {
    if (!overlay) { focusArrival(); return; }
    if (reduced.matches) { cleanup(); focusArrival(); return; }
    try {
      unlockFlight = lockExcept(null);
      sprite.style.transform = coveredPose();
      await painted();
      if (!overlay) return;
      setPhase('departure');
      watchdog = setTimeout(() => { cleanup(); focusArrival(); }, 1500);
      await animate([
        { transform: coveredPose() },
        { transform: `translateY(${-370 * coverScale() - innerHeight * .6}px) rotate(0deg) scale(${coverScale()})` },
      ], 500, 'cubic-bezier(.4,0,.8,.3)');
    } catch { /* Motion must never prevent arrival. */ }
    cleanup(); focusArrival();
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
  window.rocketTransition = { prepareArrival, fail, adopt, get ready() { return arrivalReady; }, get pending() { return pending && !cancelled; }, get cancelled() { return cancelled; } };
  // A recent same-tab, normal navigation may restore the covered pose once.
  try {
    const raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY);
    const marker = raw && JSON.parse(raw);
    const navigation = performance.getEntriesByType('navigation')[0];
    if (wantsEye && marker?.destination === location.href && Date.now() - marker.created < 10000 && navigation?.type === 'navigate' && !reduced.matches) {
      createOverlay(); sprite.style.transform = coveredPose(); setPhase('covered');
      watchdog = setTimeout(() => { cleanup(); focusArrival(); }, 3000);
    }
  } catch { /* Native navigation remains available without storage. */ }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a.cinematic-launch');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return;
    event.preventDefault();
    if (phase !== 'idle') return;
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
