// playwright-cli -s=chapter-review run-code --filename=scripts/chapter_review.js
async page => {
  const base = new URL(page.url()).origin, checks = [], errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const check = (ok, name) => { if (!ok) throw new Error(name); checks.push(name); console.log('PASS ' + name); };
  const settled = async index => {
    await page.waitForFunction(i => {
      const root = document.querySelector('.cinematic');
      const chapter = root?.querySelectorAll('.cinematic-chapter')[i];
      return root?.dataset.navigating === 'false' && root.dataset.chapter === String(i)
        && Number(chapter.querySelector('.cinematic-copy').style.opacity) > .99
        && Number(root.querySelector('.cinematic-blackout').style.opacity) < .01;
    }, index);
  };
  const key = async (key, index) => { await page.keyboard.press(key); await settled(index); };
  try {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(`${base}/index.html`);
    await page.waitForSelector('.cinematic-scroll');
    await page.mouse.move(1300, 600);
    await page.mouse.wheel(0, 120);
    await settled(1);
    check(true, 'a small mouse wheel gesture settles on the next fully readable chapter');
    await key('Home', 0);
    // A continuous momentum stream must not become a second gesture when the
    // first animation completes. Input fixtures contain no scientific values.
    await page.evaluate(async () => {
      for (let i=0; i<20; i++) {
        window.dispatchEvent(new WheelEvent('wheel', {deltaY:i<4 ? 120 : 10, bubbles:true, cancelable:true}));
        await new Promise(resolve => setTimeout(resolve, 80));
      }
    });
    await settled(1);
    check(true, 'a sustained wheel burst and momentum advance only one chapter');
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, 2000); await settled(2);
    check(true, 'a large fresh gesture advances one chapter without skipping');
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -120); await settled(1);
    check(true, 'reverse scrolling settles on the previous chapter');
    await key('PageDown', 2); await key('PageUp', 1); await key('End', 5); await key('Home', 0);
    check(true, 'Page Up/Down and Home/End share the chapter stops');
    const arrows = await page.locator('.cinematic-chapter .cinematic-scroll').count();
    check(arrows === await page.locator('.cinematic-chapter').count(), 'every chapter has a down chevron');
    for (let i=0; i<5; i++) {
      await page.locator('.cinematic-chapter').nth(i).locator('.cinematic-scroll').click();
      await settled(i+1);
      check(await page.evaluate(() => /H1|H2|BLOCKQUOTE/.test(document.activeElement.tagName)), 'arrow arrival focuses the next chapter heading');
    }
    check(await page.locator('[data-finder-launch]').getAttribute('aria-label') === 'Open Finder', 'the final chevron names Finder as its destination');
    await key('Home', 0);
    await page.evaluate(() => { const arrow = document.querySelector('.cinematic-scroll'); arrow.click(); arrow.click(); arrow.click(); });
    await settled(1);
    check(true, 'repeated arrow activation does not queue or skip chapters');
    await page.locator('body > .site-header .site-menu-trigger').focus();
    await page.keyboard.press('Enter');
    const beforeMenuWheel = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 1000);
    check(await page.evaluate(() => scrollY) === beforeMenuWheel, 'open navigation suspends chapter input');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#siteNavigation', {state:'hidden'});
    await key('PageDown', 2);
    await page.setViewportSize({width:800,height:700});
    await settled(2);
    check(true, 'resize preserves the selected readable chapter');
    // Focus restoration alone must never navigate chapters.
    await page.evaluate(() => document.querySelector('#cinematic-start .cinematic-scroll').focus({preventScroll:true}));
    check(await page.evaluate(() => document.querySelector('.cinematic').dataset.chapter) === '2', 'programmatic focus does not jump chapters');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => {
      const chapter = document.activeElement.closest('.cinematic-chapter');
      return chapter && Number(chapter.querySelector('.cinematic-copy').style.opacity) > .99;
    });
    check(true, 'Tab navigation reveals the focused chapter');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(() => !document.documentElement.classList.contains('lenis'));
    await key('End', 5); await key('Home', 0);
    check(await page.evaluate(() => !document.documentElement.classList.contains('lenis')), 'reduced motion uses immediate chapter navigation');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await key('End', 5);
    await page.locator('[data-finder-launch]').click();
    await page.waitForURL('**/finder.html*');
    await page.waitForSelector('#loading.done', {state:'attached'});
    await page.waitForSelector('.rocket-overlay', {state:'detached'});
    check(await page.locator('#godseye').isHidden(), 'the final chevron opens Finder through the shared transition');
    check(!errors.length, 'chapter navigation produces no uncaught page errors');
    return {passed:checks, errors};
  } finally { page.off('pageerror', onError); }
}
