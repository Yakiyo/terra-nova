// Run with a local app page open:
// playwright-cli -s=rocket-visual run-code --filename=scripts/rocket_visual_review.js
async page => {
  const base = new URL(page.url()).origin, evidence = [];
  const home = async capture => {
    await capture.goto(`${base}/index.html`);
    await capture.waitForSelector('.cinematic-launch', {state:'attached'});
    await capture.evaluate(() => {
      const chapter = document.querySelector('.chapter-finale');
      scrollTo(0, chapter.offsetTop + innerHeight * .32);
    });
    await capture.waitForFunction(() => Number(document.querySelector('.chapter-finale .cinematic-copy').style.opacity) > .99);
  };
  for (const viewport of [{width:1600,height:900},{width:800,height:900}]) {
    const capture = await page.context().newPage();
    await capture.setViewportSize(viewport);
    await capture.addInitScript(() => {
      // Only deterministic stills pause the page layer; the real-time run below
      // uses a fresh page without these overrides.
      const animate = Element.prototype.animate, timeout = window.setTimeout, raf = window.requestAnimationFrame;
      window.holdCover = true; window.coverFrames = [];
      window.requestAnimationFrame = fn => raf(now => {
        if (window.holdCover && location.pathname.endsWith('/index.html') && document.querySelector('.rocket-overlay')?.dataset.phase === 'covered') window.coverFrames.push(() => fn(now));
        else fn(now);
      });
      window.setTimeout = (fn, delay, ...args) => timeout(fn, delay === 3000 || delay === 1500 ? 60000 : delay, ...args);
      Element.prototype.animate = function(...args) {
        const animation = animate.apply(this,args);
        if (this.matches('.page-leaf,.page-fold,.rocket-sprite')) {
          (window.pageCaptures ||= []).push(animation);
          if (this.matches('.page-leaf')) window.pageCapture = animation;
          animation.pause();
        }
        return animation;
      };
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await capture.route('**/api/health', async route => { await gate; await route.continue(); });
    await home(capture);
    await capture.evaluate(() => { document.querySelector('.cinematic-launch').click(); window.pageCaptures.forEach(a => { a.currentTime = 440; }); });
    await capture.screenshot({path:`artifacts/frontend/page-turn-${viewport.width}-fold.png`});
    const rocketSize = await capture.locator('.rocket-sprite').boundingBox();
    await capture.evaluate(() => { window.pageCaptures.forEach(a => { a.currentTime = 800; }); });
    const laterSize = await capture.locator('.rocket-sprite').boundingBox();
    if (laterSize.width <= rocketSize.width || laterSize.y >= rocketSize.y) throw new Error('Rocket did not grow and travel upward');

    await capture.evaluate(() => window.pageCapture.finish());
    await capture.waitForFunction(() => document.querySelector('.rocket-overlay')?.dataset.phase === 'covered');
    // Hit testing respects the polygon clip: its opaque red face must cover
    // every corner, rather than merely the transparent overlay wrapper.
    const covered = await capture.evaluate(() => [[1,1],[innerWidth-1,1],[1,innerHeight-1],[innerWidth-1,innerHeight-1]]
      .every(([x,y]) => document.elementFromPoint(x,y)?.classList.contains('page-leaf')));
    await capture.screenshot({path:`artifacts/frontend/page-turn-${viewport.width}-covered.png`});

    if (!covered) throw new Error(`Page does not cover ${viewport.width}`);
    await capture.screenshot({path:`artifacts/frontend/page-turn-${viewport.width}-covered.png`});
    await capture.evaluate(() => { window.holdCover = false; window.coverFrames.splice(0).forEach(fn => fn()); });
    await capture.waitForURL('**/finder.html*', {waitUntil:'domcontentloaded'});
    await capture.waitForFunction(() => document.querySelector('.rocket-overlay')?.dataset.phase === 'covered');
    await capture.screenshot({path:`artifacts/frontend/page-turn-${viewport.width}-arrival-covered.png`});
    release();
    try { await capture.waitForSelector('#loading.done', {state:'attached'}); } catch(error) { console.log('CAPTURE STARTUP', await capture.evaluate(() => ({url:location.href,text:document.querySelector('#loadingText')?.textContent,classes:document.querySelector('#loading')?.className,errors:document.querySelector('.toast')?.textContent,phase:document.querySelector('.rocket-overlay')?.dataset.phase,ready:document.readyState,criteria:document.querySelector('#layer')?.options.length,results:document.querySelector('#siteList')?.childElementCount}))); throw error; }
    await capture.waitForFunction(() => window.pageCapture && document.querySelector('.rocket-overlay')?.dataset.phase === 'revealing');
    await capture.evaluate(() => { window.pageCaptures.forEach(a => { a.currentTime = 300; }); });
    await capture.screenshot({path:`artifacts/frontend/page-turn-${viewport.width}-reveal.png`});
    await capture.evaluate(() => window.pageCapture.finish());
    await capture.waitForSelector('.rocket-overlay', {state:'detached'});
    if (await capture.locator('#godseye').isVisible()) throw new Error('Launch opened terrain');
    await capture.screenshot({path:`artifacts/frontend/page-turn-${viewport.width}-finder.png`});
    evidence.push({viewport,opaquePageCoverage:covered,rocketGrowsUpward:laterSize.width > rocketSize.width && laterSize.y < rocketSize.y});
    await capture.close();
  }

  // Unpaused playback with timestamped frames preserves the actual pace and
  // cross-document interval when assembled into a review video.
  const live = await page.context().newPage();
  await live.setViewportSize({width:1440,height:900});
  await home(live);
  const playback = [], started = Date.now();
  await live.locator('.cinematic-launch').click();
  for (let i = 0; i < 30; i++) {
    const path = `artifacts/frontend/page-turn-live-${String(i).padStart(2,'0')}.png`;
    const elapsed = Date.now() - started;
    await live.screenshot({path});
    const phase = await live.evaluate(() => document.querySelector('.rocket-overlay')?.dataset.phase || 'finished').catch(() => 'navigating');
    playback.push({path,elapsed,phase});
    if (phase === 'finished' && new URL(live.url()).pathname.endsWith('/finder.html')) break;
  }
  await live.waitForSelector('#loading.done', {state:'attached'});
  await live.waitForSelector('.rocket-overlay', {state:'detached'});
  await live.close();

  const mobileContext = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${base}/index.html`);
  await mobile.waitForSelector('.home-actions');
  if (await mobile.locator('.cinematic-launch').count()) throw new Error('Mobile incorrectly opted into the cinematic launch');
  await mobile.screenshot({path:'artifacts/frontend/page-turn-mobile-unchanged.png'});
  await mobile.locator('.home-actions a').last().click();
  await mobile.waitForSelector('#loading.done', {state:'attached'});
  if (await mobile.locator('#godseye').isVisible()) throw new Error('Mobile unexpectedly auto-opened terrain');
  await mobileContext.close();
  return {evidence,playback,mobile:'unchanged'};
}
