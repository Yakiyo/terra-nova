// Run with: playwright-cli -s=terra-review run-code --filename=scripts/godseye_review.js
async page => {
  const base = 'http://127.0.0.1:8000';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto('about:blank');
  await page.goto(`${base}/finder.html#target=jezero_crater&site=1`);
  await page.waitForSelector('#loading.done');
  await page.evaluate(async () => {
    localStorage.setItem('tn-ge-guide', '1');
    const { GodsEye } = await import('./godseye.js');
    const build = GodsEye.prototype._build;
    window.terrainBuildAttempts = 0;
    GodsEye.prototype._build = function(data) {
      window.terrainBuildAttempts++;
      if (window.terrainBuildAttempts === 1) throw new Error('Regression test: interrupted terrain build');
      GodsEye.prototype._build = build;
      return build.call(this, data);
    };
  });
  await page.locator('#openEye').click();
  await page.waitForSelector('#godseye[data-status=error]');
  await page.locator('#geRetry').click();
  await page.waitForSelector('#godseye[data-status=ready]');
  assert(await page.evaluate(() => window.terrainBuildAttempts === 2), 'Retry skipped the failed terrain build');
  assert(await page.locator('#geStats .ge-stat').count() > 0, 'Retry did not build terrain');
  await page.locator('#geClose').click();
  await page.waitForSelector('#godseye', { state: 'hidden' });
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/api/site3d?')) requests++; });
  await page.locator('#openEye').click();
  await page.waitForSelector('#godseye[data-status=ready]');
  assert(requests === 0, 'Reopening fetched cached terrain again');
  // Same-target hash navigation must open the requested terrain, not the old site.
  await page.goto(`${base}/finder.html#target=jezero_crater&site=2&eye=1`);
  await page.waitForFunction(() => document.querySelector('#geBadges')?.textContent.includes('#2 of'));
  await page.waitForSelector('#godseye[data-status=ready]');
  await page.waitForFunction(() => !document.querySelector('#geStatus').textContent.includes('Loading'));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: 'artifacts/frontend/godseye-fixed-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/frontend/godseye-fixed-mobile.png' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Terrain overflows mobile width');
  await page.locator('#geClose').click();
  await page.waitForSelector('#godseye', { state: 'hidden' });
  // The Targets page is retired (targets.html redirects to the Finder).
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert(errors.length === 0, errors.join('\n'));
  return { retry: 'passed', reopenCache: 'passed', sameTargetTerrainLink: 'passed', mobile: 'passed', pageErrors: errors };
}
