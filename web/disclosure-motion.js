/* Native adaptation of Watermelon Dropdown Disclosure's measured spring shell.
 * Geometry is presentation only; native controls retain all application state. */
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
import { onDisconnect } from './dom-lifecycle.js';
const running = new Map();
export const disclosureTiming = { duration: 420, easing: 'linear(0, .12 8%, .42 20%, .76 38%, .94 60%, 1)' };

export function cancelDisclosure(panel) {
  const current = running.get(panel);
  if (!current) return;
  running.delete(panel);
  current.animations.forEach(animation => animation.cancel());
  current.finish();
}

export function animateDisclosure(trigger, panel, opening, done = () => {}) {
  cancelDisclosure(panel);
  if (reduced.matches || !panel.animate) { done(); return; }
  const from = trigger.getBoundingClientRect(), to = panel.getBoundingClientRect();
  if (!to.width || !to.height) { done(); return; }
  const compact = {
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`,
    width: `${from.width}px`, height: `${from.height}px`, opacity: 0.7,
    borderRadius: getComputedStyle(trigger).borderRadius,
  };
  const expanded = { transform: 'translate(0, 0)', width: `${to.width}px`, height: `${to.height}px`, opacity: 1, borderRadius: '16px' };
  const priorOverflow = panel.style.overflow;
  const priorMinWidth = panel.style.minWidth;
  const contentWidths = [...panel.children].map(child => [child, child.style.width, child.getBoundingClientRect().width]);
  contentWidths.forEach(([child, , width]) => { child.style.width = `${width}px`; });
  panel.style.overflow = 'hidden';
  panel.style.minWidth = '0';
  const shell = panel.animate(opening ? [compact, expanded] : [expanded, compact], disclosureTiming);
  const animations = [shell];
  for (const child of panel.children) {
    animations.push(child.animate(opening ? [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: opening ? 300 : 180, delay: opening ? 100 : 0, fill: 'backwards', easing: 'ease-out' }));
  }
  const finish = () => {
    panel.style.overflow = priorOverflow; panel.style.minWidth = priorMinWidth;
    contentWidths.forEach(([child, width]) => { child.style.width = width; });
    done();
  };
  const state = { animations, finish };
  running.set(panel, state);
  shell.finished.then(() => {
    if (running.get(panel) !== state) return;
    running.delete(panel);
    finish();
  }, () => {});
}
reduced.addEventListener('change', () => {
  if (reduced.matches) [...running.keys()].forEach(cancelDisclosure);
});

const inline = new WeakSet();
export function enhanceInlineDisclosure(details) {
  if (inline.has(details)) return;
  inline.add(details);
  const events = new AbortController();
  details.classList.add('wm-disclosure');
  const summary = details.querySelector(':scope > summary');
  if (!summary) return;
  let animation, wanted = details.open;
  details.addEventListener('toggle', () => {
    if (!animation || animation.playState !== 'running') wanted = details.open;
  }, { signal: events.signal });
  summary.addEventListener('click', event => {
    event.preventDefault();
    wanted = !wanted;
    const start = details.getBoundingClientRect().height;
    animation?.cancel();
    details.style.height = '';
    details.open = true;
    const style = getComputedStyle(details);
    const end = wanted ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const finish = () => { details.open = wanted; details.style.height = ''; details.style.overflow = ''; };
    if (reduced.matches) { finish(); return; }
    details.style.overflow = 'hidden';
    animation = details.animate([{ height: `${start}px` }, { height: `${end}px` }], disclosureTiming);
    animation.finished.then(finish, () => {});
  }, { signal: events.signal });
  const settle = () => {
    if (reduced.matches) { animation?.cancel(); details.open = wanted; details.style.height = ''; details.style.overflow = ''; }
  };
  reduced.addEventListener('change', settle);
  onDisconnect(details, () => {
    animation?.cancel();
    details.open = wanted;
    details.style.height = '';
    details.style.overflow = '';
    events.abort();
    reduced.removeEventListener('change', settle);
    inline.delete(details);
  });
}
