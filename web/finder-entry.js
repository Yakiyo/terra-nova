// Catch module/import and renderer failures as well as asynchronous startup errors.
import('./app.js').then(module => module.startup).catch(error => {
  window.rocketTransition?.fail(error.message || 'The application could not start.');
  const loading = document.getElementById('loading');
  loading.classList.add('failed');
  document.getElementById('loadingText').textContent = 'TerraNova could not start. Check browser graphics support and retry.';
  const retry = document.getElementById('loadingRetry');
  retry.hidden = false;
  retry.onclick = () => location.reload();
  console.error('Finder startup failed', error);
});
