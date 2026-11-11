// Run: playwright-cli -s=rocket-visual run-code --filename=scripts/rocket_visual_review.js
async page => {
  const base = 'http://127.0.0.1:8000', evidence = [];
  for (const viewport of [{width:1600,height:900},{width:800,height:900}]) {
    const capture = await page.context().newPage();
    await capture.setViewportSize(viewport);
    await capture.addInitScript(() => {
      localStorage.setItem('tn-ge-guide','1');
      // Freeze only the authored rocket timeline for reproducible intermediate frames.
      const animate = Element.prototype.animate, timeout = window.setTimeout;
      window.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 3000 || delay === 1500 ? 60000 : delay, ...args);
      Element.prototype.animate = function(...args) {
        const animation = animate.apply(this,args);
        if (this.matches('.rocket-sprite')) { window.rocketCapture = animation; animation.pause(); }
        return animation;
      };
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await capture.route('**/api/health', async route => { await gate; await route.continue(); });
    await capture.goto(`${base}/index.html`);
    await capture.waitForSelector('.cinematic-launch',{state:'attached'});
    await capture.evaluate(() => { const chapter = document.querySelector('.chapter-finale'); scrollTo(0,chapter.offsetTop + innerHeight * .32); });
    await capture.waitForFunction(() => Number(document.querySelector('.chapter-finale .cinematic-copy').style.opacity) > .99);
    await capture.evaluate(() => { document.querySelector('.cinematic-launch').click(); window.rocketCapture.currentTime = 400; });
    await capture.screenshot({path:`artifacts/frontend/rocket-${viewport.width}-approach.png`});
    await capture.evaluate(() => { window.rocketCapture.currentTime = 800; });
    const covered = await capture.evaluate(() => {
      const matrix = document.querySelector('.rocket-sprite').getScreenCTM();
      const a = new DOMPoint(72,200).matrixTransform(matrix), b = new DOMPoint(168,660).matrixTransform(matrix);
      return a.x <= 0 && a.y <= 0 && b.x >= innerWidth && b.y >= innerHeight;
    });
    if (!covered) throw new Error(`Hull does not cover ${viewport.width}`);
    let continueNavigation;
    const navigationGate = new Promise(resolve => { continueNavigation = resolve; });
    await capture.route('**/finder.html*', async route => { await navigationGate; await route.continue(); });
    await capture.evaluate(() => window.rocketCapture.finish());
    await capture.waitForFunction(() => document.querySelector('.rocket-overlay')?.dataset.phase === 'covered');
    await capture.screenshot({path:`artifacts/frontend/rocket-${viewport.width}-covered.png`});
    continueNavigation();
    await capture.waitForURL('**/finder.html#eye=1');
    await capture.waitForFunction(() => window.rocketCapture && document.querySelector('.rocket-overlay')?.dataset.phase === 'departure');
    await capture.screenshot({path:`artifacts/frontend/rocket-${viewport.width}-arrival-covered.png`});
    await capture.evaluate(() => { window.rocketCapture.currentTime = 400; });
    await capture.screenshot({path:`artifacts/frontend/rocket-${viewport.width}-departure.png`});
    await capture.evaluate(() => window.rocketCapture.finish());
    await capture.waitForSelector('.rocket-overlay',{state:'detached'});
    await capture.screenshot({path:`artifacts/frontend/rocket-${viewport.width}-loading.png`});
    release();
    await capture.waitForSelector('#godseye[data-status="ready"]',{timeout:30000});
    await capture.screenshot({path:`artifacts/frontend/rocket-${viewport.width}-terrain.png`});
    evidence.push({viewport,opaqueHullCoverage:covered});
    await capture.close();
  }
  const mobileContext = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${base}/index.html`);
  await mobile.waitForSelector('.home-actions');
  if (await mobile.locator('.cinematic-launch').count()) throw new Error('Mobile incorrectly opted into the cinematic launch');
  await mobile.screenshot({path:'artifacts/frontend/rocket-mobile-unchanged.png'});
  await mobile.locator('.home-actions a').last().click();
  await mobile.waitForSelector('#loading.done',{state:'attached'});
  if (await mobile.locator('#godseye').isVisible()) throw new Error('Mobile unexpectedly auto-opened terrain');
  await mobileContext.close();
  return {evidence,mobile:'unchanged'};
}
