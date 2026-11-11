// Run: playwright-cli -s=rocket-review run-code --filename=scripts/rocket_review.js
async page => {
  const base = 'http://127.0.0.1:8000';
  const checks = [], errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const assert = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  const go = async path => { await page.goto('about:blank'); await page.goto(`${base}/${path}`); };
  const eye = () => page.waitForSelector('#godseye[data-status="ready"], #godseye[data-status="error"]', {timeout:30000});
  const home = async () => {
    await page.emulateMedia({reducedMotion:'no-preference'});
    await go('index.html');
    await page.waitForSelector('.cinematic-launch', {state:'attached'});
    await page.evaluate(() => { const el = document.querySelector('.chapter-finale'); scrollTo(0, el.offsetTop + innerHeight * .32); });
    await page.waitForFunction(() => Number(document.querySelector('.chapter-finale .cinematic-copy').style.opacity) > .99);
  };
  try {
    await page.setViewportSize({width:1440,height:900});
    await go('finder.html#eye=1'); await eye();
    assert(await page.locator('#geBadges').textContent().then(t => t.includes('#1 of')), 'default arrival selects the first API-ranked terrain site');
    assert(await page.locator('#godseye').getAttribute('data-status') === 'ready', 'cached offline terrain renders');
    await go('finder.html'); await page.waitForSelector('#loading.done', {state:'attached'});
    assert(await page.locator('#godseye').isHidden(), 'ordinary Finder navigation stays in Finder');

    await home();
    assert(await page.evaluate(() => {
      let native = false;
      document.addEventListener('click', event => { native = !event.defaultPrevented; event.preventDefault(); }, {once:true});
      document.querySelector('.cinematic-launch').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}));
      return native && !document.querySelector('.rocket-overlay');
    }), 'modified activation retains native link behavior');
    await page.evaluate(() => {
      const link = document.querySelector('.cinematic-launch'); link.click(); link.click();
    });
    await page.waitForURL('**/finder.html#**'); await eye();
    assert(await page.locator('.rocket-overlay').count() === 0, 'repeated activation completes a single flyby and releases the overlay');
    assert(await page.evaluate(() => !document.documentElement.classList.contains('rocket-busy') && !document.querySelector('body>[inert]')), 'arrival restores scrolling and interaction');
    await page.reload(); await eye();
    assert(await page.locator('.rocket-overlay').count() === 0, 'reload does not replay the handoff');
    await page.goBack();
    assert(await page.locator('.rocket-overlay').count() === 0, 'browser Back does not retain a rocket cover');
    await page.goForward(); await eye();
    assert(await page.locator('.rocket-overlay').count() === 0, 'browser Forward does not replay the handoff');

    for (const mode of ['reduced', 'storage', 'animation', 'resize', 'preference', 'hidden']) {
      await home();
      if (mode === 'reduced') await page.emulateMedia({reducedMotion:'reduce'});
      if (mode === 'storage') await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) { if (key === 'terranova-rocket-handoff') throw new Error('test: storage blocked'); return original.call(this,key,value); };
      });
      if (mode === 'animation') await page.evaluate(() => {
        const original = Element.prototype.animate;
        Element.prototype.animate = function(...args) { if (this.matches('.rocket-sprite')) throw new Error('test: motion unavailable'); return original.apply(this,args); };
      });
      await page.locator('.cinematic-launch').focus();
      await page.keyboard.press('Enter');
      if (mode === 'resize') await page.setViewportSize({width:980,height:800});
      if (mode === 'preference') await page.emulateMedia({reducedMotion:'reduce'});
      if (mode === 'hidden') await page.evaluate(() => {
        Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'));
      }).catch(() => {}); // The document may already have navigated.
      await page.waitForURL('**/finder.html#**'); await eye();
      assert(await page.locator('.rocket-overlay').count() === 0, `${mode} fallback preserves keyboard navigation`);
      await page.setViewportSize({width:1440,height:900});
    }
    await page.emulateMedia({reducedMotion:'no-preference'});

    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/health', async route => { await gate; await route.continue(); });
    await go('finder.html#eye=1');
    assert(await page.locator('#geArrival').isVisible(), 'loading shell paints while startup is delayed');
    await page.locator('#geArrivalBack').click(); release();
    await page.unroute('**/api/health');
    await page.waitForSelector('#loading.done', {state:'attached'});
    assert(await page.locator('#godseye').isHidden(), 'leaving the loading shell cancels automatic opening');

    for (const endpoint of ['health','score']) {
      await page.route(`**/api/${endpoint}`, route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Regression fixture: service unavailable'})}));
      await go('finder.html#eye=1');
      await page.waitForSelector('#godseye[data-arrival="error"]');
      assert(await page.locator('#geArrivalRetry').isVisible(), `${endpoint} failure exposes Retry`);
      await page.unroute(`**/api/${endpoint}`);
      await page.locator('#geArrivalRetry').click(); await eye();
      assert(await page.locator('#godseye').getAttribute('data-status') === 'ready', `${endpoint} Retry recovers`);
    }

    await page.route('**/api/score', async route => {
      const response = await route.fetch(), payload = await response.json();
      payload.results = []; await route.fulfill({response,json:payload});
    });
    await go('finder.html#eye=1'); await page.waitForSelector('#godseye[data-arrival="error"]');
    assert(await page.locator('#geArrivalDetail').textContent().then(t => t.includes('No ranked sites')), 'empty rankings expose an actionable error');
    await page.unroute('**/api/score');

    // Deliberately unsupported coordinate fixture; all ranking values stay API-supplied.
    await page.route('**/api/score', async route => {
      const response = await route.fetch(), payload = await response.json();
      payload.results[0].lat = 90; await route.fulfill({response,json:payload});
    });
    await go('finder.html#eye=1'); await eye();
    assert(await page.locator('#geBadges').textContent().then(t => t.includes('#2 of')), 'implicit arrival skips a terrain-unsupported result in API order');
    await go('finder.html#eye=1&site=1'); await page.waitForSelector('#godseye[data-arrival="error"]');
    assert(await page.locator('#geArrivalDetail').textContent().then(t => t.includes('outside terrain coverage')), 'explicit unsupported site is not replaced');
    await page.unroute('**/api/score');

    await go('finder.html#eye=1&site=missing'); await page.waitForSelector('#godseye[data-arrival="error"]');
    assert(await page.locator('#geArrivalDetail').textContent().then(t => t.includes('linked site')), 'invalid explicit site is never silently substituted');
    await go('finder.html#target=jezero_crater&site=2&eye=1'); await eye();
    assert(await page.locator('#geBadges').textContent().then(t => t.includes('#2 of')), 'explicit-site links retain their selected rank');

    let releaseTerrain;
    const terrainGate = new Promise(resolve => { releaseTerrain = resolve; });
    await page.route('**/api/site3d?*', async route => { await terrainGate; await route.continue(); });
    await go('finder.html#eye=1');
    await page.waitForSelector('#godseye[data-status="loading"]');
    assert(await page.locator('#geLoading').isVisible() && await page.locator('.rocket-overlay').count() === 0, 'delayed terrain uses the existing visible loading interface');
    releaseTerrain(); await page.unroute('**/api/site3d?*'); await eye();

    await page.route('**/api/site3d?*', route => route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:'Terrain is not cached in offline mode'})}));
    await go('finder.html#eye=1'); await page.waitForSelector('#godseye[data-status="error"]');
    assert(await page.locator('#geRetry').isVisible() && await page.locator('#geErrorClose').isVisible(), 'missing offline terrain retains Retry and Back');
    await page.unroute('**/api/site3d?*');
    await page.locator('#geRetry').click(); await page.waitForSelector('#godseye[data-status="ready"]');
    if (await page.locator('#geGuide').isVisible()) await page.locator('#geGuideOk').click();
    await page.locator('#geClose').click(); await page.waitForSelector('#godseye', {state:'hidden'});
    assert(await page.evaluate(() => document.activeElement.matches('#siteList .site.active, #tabResults')), 'closing terrain returns focus to a usable Finder control');

    const failurePage = await page.context().newPage();
    await failurePage.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type,...args) { return type.includes('webgl') ? null : get.call(this,type,...args); };
    });
    await failurePage.goto(`${base}/finder.html#eye=1`);
    await failurePage.waitForSelector('#godseye[data-arrival="error"]');
    assert(await failurePage.locator('#geArrivalBack').isVisible(), 'WebGL initialization failure leaves the shell navigable');
    await failurePage.close();
    assert(errors.length === 0, `no uncaught page errors: ${errors.join('; ')}`);
    return {passed:checks};
  } finally {
    page.off('pageerror',onError);
    await page.unrouteAll({behavior:'ignoreErrors'});
  }
}
