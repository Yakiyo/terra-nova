async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width:1600,height:900});
  await page.route('**/landing-entry.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto('http://127.0.0.1:8000/', {waitUntil:'commit'});
  await page.locator('.home').waitFor({state:'attached'});
  const loading = await page.evaluate(() => ({
    pending:document.documentElement.classList.contains('cinematic-pending'),
    legacyHidden:getComputedStyle(document.querySelector('.home')).display === 'none',
  }));
  await page.screenshot({path:'artifacts/home-refresh-loading.png'});
  await page.waitForSelector('.cinematic-site-link');
  await page.unroute('**/landing-entry.js');
  await page.screenshot({path:'artifacts/home-shared-space.png'});
  const backgrounds = [];
  for (const selector of ['.chapter-hero','.chapter-moon','.chapter-mars','.chapter-analogs','.chapter-finale']) {
    await page.evaluate(selector => {
      const chapter = document.querySelector(selector);
      scrollTo(0,chapter.offsetTop+(selector === '.chapter-finale' ? innerHeight : chapter.offsetHeight)*.32);
    },selector);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.cinematic-blackout')).opacity === '0');
    backgrounds.push(await page.evaluate(selector => ({
      selector,
      image:getComputedStyle(document.querySelector('.cinematic-space-media')).backgroundImage,
      behindPlanets:Number(getComputedStyle(document.querySelector('.cinematic-space-media')).zIndex) < Number(getComputedStyle(document.querySelector('.cinematic-canvas')).zIndex),
    }),selector));
  }
  await page.evaluate(() => {
    const chapter = document.querySelector('.chapter-analogs');
    scrollTo(0,chapter.offsetTop+chapter.offsetHeight*.32);
  });
  await page.waitForFunction(() => document.querySelector('.cinematic').dataset.chapter === '4');
  const focusRestore = await page.evaluate(async () => {
    const before = scrollY;
    document.querySelector('.cinematic-scroll').focus({preventScroll:true});
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {before,after:scrollY,stable:scrollY === before};
  });
  // Freeze midway through a smooth anchor scroll, as when the user changes tabs.
  const visibility = await page.evaluate(async () => {
    document.querySelector('.cinematic-scroll').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
    const before = scrollY;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = scrollY;
    delete document.hidden;
    return {before,after,stable:before === after};
  });
  const other = await page.context().newPage();
  const beforeTab = await page.evaluate(() => scrollY);
  await other.goto('about:blank');
  await other.bringToFront();
  await page.bringToFront();
  await other.close();
  const actualTabs = {before:beforeTab,after:await page.evaluate(() => scrollY)};
  const mobile = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const phone = await mobile.newPage();
  await phone.goto('http://127.0.0.1:8000/');
  await phone.waitForFunction(() => document.querySelector('#facts dd'));
  const phoneState = await phone.evaluate(() => ({
    pending:document.documentElement.classList.contains('cinematic-pending'),
    legacyVisible:getComputedStyle(document.querySelector('.home')).display !== 'none',
  }));
  await mobile.close();
  return {loading,backgrounds,focusRestore,visibility,actualTabs,phoneState,errors};
}
