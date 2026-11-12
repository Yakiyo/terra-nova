// Keep the cinematic Home on mouse/trackpad desktops even with docked DevTools.
// Narrow touch devices retain the lightweight mobile experience.
const desktop = matchMedia('(min-width: 1021px), (hover: hover) and (pointer: fine)');
desktop.addEventListener('change', () => location.reload(), {once: true});
if (desktop.matches) {
  import('./cinematic.js').catch(error => {
    console.error('Cinematic Home unavailable', error);
    document.documentElement.classList.remove('cinematic-pending');
    import('./welcome.js');
    import('./experience.js');
  });
} else {
  import('./welcome.js');
  import('./experience.js');
}
