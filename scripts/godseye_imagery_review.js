// playwright-cli -s=terra-review run-code --filename=scripts/godseye_imagery_review.js
async page => {
  const base = 'http://127.0.0.1:8000';
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = () => page.waitForFunction(() => document.querySelector('#godseye').dataset.status === 'ready'
    && !document.querySelector('#geStatus').textContent.includes('Loading'));
  await page.goto('about:blank');
  await page.route('**/api/imagery/**', route => route.abort());
  await page.goto(`${base}/finder.html#target=jezero_crater&site=1&eye=1`);
  await settle();
  if (await page.locator('#geGuide').isVisible()) await page.locator('#geGuideOk').click();
  assert(await page.locator('[data-imagery=relief]').getAttribute('aria-pressed') === 'true', 'Missing imagery did not fall back');
  await page.unroute('**/api/imagery/**');
  const responses = [];
  const collect = response => { if (response.url().includes('/api/imagery/')) responses.push(response.status()); };
  page.on('response', collect);
  await page.locator('[data-imagery=s2]').click();
  await settle();
  assert(responses.length > 0 && responses.every(status => status === 200), 'Satellite retry did not load every tile');
  assert(await page.locator('[data-imagery=s2]').getAttribute('aria-pressed') === 'true', 'Satellite retry did not restore imagery');
  page.off('response', collect);
  // A forced failure at another site must not carry automatic Relief into the
  // next site after its satellite tiles have become available.
  await page.route('**/api/imagery/**', route => route.abort());
  await page.locator('#geClose').click();
  await page.waitForSelector('#godseye', { state: 'hidden' });
  await page.locator('#detail .back').click();
  await page.locator('.site-list li:nth-child(2) .site').click();
  await page.locator('#openEye').click();
  await settle();
  assert(await page.locator('[data-imagery=relief]').getAttribute('aria-pressed') === 'true', 'Forced failure did not fall back');
  await page.unroute('**/api/imagery/**');
  await page.locator('#geClose').click();
  await page.waitForSelector('#godseye', { state: 'hidden' });
  await page.locator('#detail .back').click();
  await page.locator('.site-list li:first-child .site').click();
  await page.locator('#openEye').click();
  await settle();
  assert(await page.locator('[data-imagery=s2]').getAttribute('aria-pressed') === 'true', 'Automatic Relief carried over to the next site');
  const verified = [];
  for (const target of ['lunar_south_pole', 'jezero_crater']) {
    for (const rank of [2, 5, 10, 20]) {
      responses.length = 0;
      page.on('response', collect);
      await page.goto(`${base}/finder.html#target=${target}&site=${rank}&eye=1`);
      await settle();
      page.off('response', collect);
      assert(await page.locator('[data-imagery=s2]').getAttribute('aria-pressed') === 'true', `${target} rank ${rank}: satellite unavailable`);
      assert(responses.every(status => status === 200), `${target} rank ${rank}: missing imagery tile`);
      verified.push({ target, rank, title: await page.locator('#geTitle').textContent(), imagery: 'loaded' });
      if (target === 'lunar_south_pole' && rank === 2) {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.screenshot({ path: 'artifacts/frontend/gobi-satellite-fixed.png' });
      }
    }
  }
  return { satelliteRetry: 'passed', fallbackDoesNotCarryOver: 'passed', verified };
}
