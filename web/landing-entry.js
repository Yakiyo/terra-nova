// Mount only the renderer and scroll controller needed for this viewport.
const desktop = matchMedia('(min-width: 1021px)');
desktop.addEventListener('change', () => location.reload(), {once: true});
if (desktop.matches) {
  import('./cinematic.js');
} else {
  import('./welcome.js');
  import('./experience.js');
}
