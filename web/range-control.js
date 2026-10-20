/* Shared Overlay slider presentation. Native input values/events remain authoritative. */
const ranges = new WeakMap();
import { onDisconnect } from './dom-lifecycle.js';
export function enhanceRange(input) {
  if (ranges.has(input)) { ranges.get(input)(); return; }
  const shell = document.createElement('span');
  shell.className = 'adaptive-range';
  input.before(shell);
  shell.innerHTML = '<span class="adaptive-track" aria-hidden="true"><span class="adaptive-fill"></span><span class="adaptive-knob"></span></span>';
  shell.append(input);
  const overlay = input.id === 'overlayOpacity';
  let output;
  if (overlay) {
    input.closest('label').classList.add('adaptive-overlay');
    output = document.createElement('output');
    output.className = 'adaptive-value';
    output.htmlFor = input.id;
    shell.after(output);
  }
  const update = () => {
    const min = Number(input.min || 0), max = Number(input.max || 100);
    const ratio = max > min ? Math.max(0, Math.min(1, (Number(input.value) - min) / (max - min))) : 0;
    shell.style.setProperty('--range-ratio', ratio);
    shell.style.setProperty('--range-position', `${ratio * 100}%`);
    shell.classList.toggle('is-disabled', input.disabled);
    if (output) {
      output.value = `${input.value}%`;
      input.closest('label').style.setProperty('--overlay-position', `${input.value}%`);
    }
  };
  ranges.set(input, update);
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  // Native setters do not dispatch events. Preserve their behavior while syncing
  // presets, URL restoration and terrain/climate reset operations immediately.
  for (const property of ['value', 'valueAsNumber']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, property);
    Object.defineProperty(input, property, {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) { descriptor.set.call(this, value); update(); },
    });
  }
  const observer = new MutationObserver(update);
  observer.observe(input, { attributes: true, attributeFilter: ['min', 'max', 'step', 'value', 'disabled'] });
  onDisconnect(input, () => {
    observer.disconnect();
    input.removeEventListener('input', update);
    input.removeEventListener('change', update);
    delete input.value;
    delete input.valueAsNumber;
    if (input.parentElement === shell) shell.replaceWith(input); else shell.remove();
    output?.remove();
    ranges.delete(input);
  });
  update();
}
