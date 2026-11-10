const puppeteer = require('puppeteer-core');
const fs = require('fs');
const QA = JSON.parse(fs.readFileSync('/tmp/qa-env.json', 'utf8'));
const BASE = `http://localhost:${QA.port}`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setCookie({ name: 'ta_session', value: QA.customerCookie.split('=')[1], url: BASE });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('textarea', { timeout: 15000 });
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a')];
    const el = els.find(e => /analyz/i.test(e.textContent || ''));
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 600));
  const ta = await page.$('textarea');
  await ta.type('Appointment for road maintenance. BID NUMBER: RDM-2026-088. CIDB grading 5CE required. Closing date: 15 December 2026.', { delay: 0 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Check this document/i.test(x.textContent || '') && !x.disabled);
    b.click();
  });
  await page.waitForFunction(() => /Returnables Found in This Tender/i.test(document.body.innerText), { timeout: 45000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Draft Bid Response Skeleton/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: '/downloads/skeleton-modal-mobile.png', fullPage: false });
  // capture the copy-text export for content assertions
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Copy Text/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 600));
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  console.log('CLIP:', JSON.stringify({
    humanDate: /15 December 2026/.test(clip),
    jsTimestamp: /GMT|\d{2}:\d{2}:\d{2}/.test(clip),
    level1Default: /B-BBEE Level 1\b/.test(clip),
    emptyReg: /Registration No: \)/.test(clip),
    qualified: /Qualified contractor/.test(clip),
    vatUnconditional: /strictly inclusive of 15%/.test(clip),
  }));
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      modalOpen: /Draft Bid Response Skeleton/i.test(t),
      closingHuman: /15 December 2026/.test(t),
      jsTimestamp: /\d{2}:\d{2}:\d{2}|GMT/.test(t),
      noQualifiedClaim: !/Qualified contractor/.test(t),
      cidbPlaceholder: /this tender states 5CE/i.test(t),
      bbbeeLevel1Default: /B-BBEE Level 1\b/.test(t),
    };
  });
  console.log(JSON.stringify(state));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
