import Lenis from './vendor/lenis/lenis.js';

// Presentation-only navigation. A gesture chooses a chapter; Lenis supplies
// its timed travel rather than multiplying raw wheel distance across the story.
export function createChapterNavigation(root, reduced) {
  const chapters = [...root.querySelectorAll('.cinematic-chapter')];
  const abort = new AbortController(), signal = abort.signal;
  const paused = new Set();
  let lenis, stops = [], current = 0, moving = false, gesture = false;
  let wheelTimer, resizeFrame, wheelSum = 0, lastWheel = 0, tabbing = false;
  const easing = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
  const nearest = () => stops.reduce((best, y, i) => Math.abs(y-scrollY) < Math.abs(stops[best]-scrollY) ? i : best, 0);
  const measure = () => {
    lenis?.resize();
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    stops = chapters.map((chapter, i) => Math.min(max, i === 0 ? 0 : chapter.getBoundingClientRect().top + scrollY + chapter.offsetHeight * .32));
  };
  const mark = value => { moving = value; root.dataset.navigating = String(value); };
  const cancel = () => {
    lenis?.scrollTo(scrollY, {immediate:true, force:true});
    current = nearest(); mark(false);
    clearTimeout(wheelTimer); wheelSum = 0; gesture = false;
  };
  function go(index, {immediate = false, focus = false, interrupt = false} = {}) {
    if (paused.size || document.hidden || (moving && !interrupt)) return;
    const next = Math.max(0, Math.min(chapters.length-1, index));
    if (interrupt) cancel();
    current = next;
    root.dataset.destination = chapters[next].id;
    mark(true);
    const finish = () => {
      mark(false);
      if (performance.now()-lastWheel > 160) gesture = false;
      if (focus) {
        const heading = chapters[next].querySelector('h1,h2,blockquote');
        if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
      }
    };
    if (lenis && !reduced.matches && !immediate) {
      lenis.scrollTo(stops[next], {duration:1.1, lerp:0, easing, lock:true, force:true, onComplete:finish});
    } else {
      if (lenis) lenis.scrollTo(stops[next], {immediate:true, force:true});
      else window.scrollTo({top:stops[next], behavior:'instant'});
      finish();
    }
  }
  const editable = target => target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],dialog,[role="menu"],[data-lenis-prevent]');
  function nestedScroll(event, direction) {
    return event.composedPath().some(node => {
      if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement) return false;
      const style = getComputedStyle(node);
      return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1
        && (direction > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0);
    });
  }
  window.addEventListener('wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY || editable(event.target) || paused.size || document.hidden) return;
    const direction = Math.sign(event.deltaY);
    if (nestedScroll(event, direction)) return;
    event.preventDefault();
    lastWheel = performance.now();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelSum = 0; if (!moving) gesture = false; }, 160);
    if (moving || gesture) { gesture = true; return; }
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    wheelSum = Math.sign(wheelSum) === direction ? wheelSum + delta : delta;
    if (Math.abs(wheelSum) < 8) return;
    gesture = true; wheelSum = 0;
    go(nearest() + direction);
  }, {passive:false, signal});
  document.addEventListener('keydown', event => {
    tabbing = event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || paused.size || event.repeat) return;
    const directions = {PageDown:1, PageUp:-1, ArrowDown:1, ArrowUp:-1};
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); go(event.key === 'Home' ? 0 : chapters.length-1); return;
    }
    const direction = directions[event.key];
    if (!direction || nestedScroll(event, direction)) return;
    event.preventDefault(); go(nearest() + direction);
  }, {signal});
  root.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#cinematic-"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const index = chapters.findIndex(chapter => `#${chapter.id}` === link.getAttribute('href'));
    if (index < 0) return;
    event.preventDefault(); go(index, {focus:true});
  }, {signal});
  root.addEventListener('focusin', event => {
    if (!tabbing || document.hidden || paused.size) return;
    tabbing = false;
    const index = chapters.indexOf(event.target.closest('.cinematic-chapter'));
    if (index >= 0 && (index !== nearest() || Number(chapters[index].querySelector('.cinematic-copy').style.opacity) < .9)) go(index, {immediate:true, interrupt:true});
  }, {signal});
  document.addEventListener('keyup', () => { tabbing = false; }, {signal});
  window.addEventListener('blur', () => { tabbing = false; }, {signal});
  const suspend = (name, active) => {
    if (active) { paused.add(name); cancel(); lenis?.stop(); }
    else { paused.delete(name); if (!paused.size) lenis?.start(); }
  };
  document.addEventListener('navigation-state', event => suspend('menu', event.detail.open), {signal});
  document.addEventListener('rocket-flight', event => suspend('rocket', event.detail.active), {signal});
  document.addEventListener('visibilitychange', () => { tabbing = false; cancel(); }, {signal});
  const configure = () => {
    cancel(); lenis?.destroy(); lenis = null;
    if (!reduced.matches) lenis = new Lenis({autoRaf:false, anchors:false, smoothWheel:false, syncTouch:false, virtualScroll:() => false});
    measure();
    if (paused.size) lenis?.stop();
  };
  measure(); configure();
  reduced.addEventListener('change', configure, {signal});
  window.addEventListener('resize', () => {
    const selected = moving ? current : nearest();
    cancelAnimationFrame(resizeFrame); cancel();
    resizeFrame = requestAnimationFrame(() => { measure(); go(selected, {immediate:true}); });
  }, {signal});
  const hashIndex = chapters.findIndex(chapter => `#${chapter.id}` === location.hash);
  if (hashIndex >= 0) requestAnimationFrame(() => go(hashIndex, {immediate:true}));
  return {
    raf(now) { lenis?.raf(now); },
    destroy() { abort.abort(); clearTimeout(wheelTimer); cancelAnimationFrame(resizeFrame); lenis?.destroy(); mark(false); },
  };
}
