/** Screenshot runner: drives headless Chrome against the QA server. */
import puppeteer from 'puppeteer-core';

const { port, customerCookie, adminCookie } = JSON.parse(process.env.QA_SERVER);
const base = `http://127.0.0.1:${port}`;
const outDir = '/tmp/qa-shots';
import fs from 'node:fs';
fs.mkdirSync(outDir, { recursive: true });

function cookieFrom(pair, url) {
  const [name, value] = pair.split('=');
  return { name, value, url };
}

async function dismissInstallPrompt(page) {
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => x.textContent?.trim() === 'Not now');
    if (b) { b.click(); return true; }
    return false;
  });
  if (clicked) await new Promise(r => setTimeout(r, 300));
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

async function newIsolatedPage() {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  return ctx.newPage();
}

async function shot(name, url, cookie, clicks = []) {
  const page = await newIsolatedPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  if (cookie) await page.setCookie(cookieFrom(cookie, base));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await dismissInstallPrompt(page);
  for (const sel of clicks) {
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel);
    await new Promise(r => setTimeout(r, 600));
  }
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot ${name}`);
  await page.close();
}

// 1. Signed-out landing (public face)
await shot('01-landing', base);
// 2. Customer dashboard (analyzer default)
await shot('02-dashboard', base, customerCookie);
// 3. Customer account view
await shot('03-account', base, customerCookie, []);
// 4. Admin overview
await shot('04-admin', base, adminCookie);

// Sidebar tab navigation for account/admin views needs clicks on button text.
async function shotTab(name, cookie, tabLabel) {
  const page = await newIsolatedPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.setCookie(cookieFrom(cookie, base));
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await dismissInstallPrompt(page);
  const clicked = await page.evaluate((label) => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => x.textContent?.includes(label));
    if (b) { b.click(); return true; }
    return false;
  }, tabLabel);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot ${name} (clicked=${clicked})`);
  await page.close();
}

await shotTab('03b-account-tab', customerCookie, 'Account');
await shotTab('04b-admin-tab', adminCookie, 'Platform Overview');
// Admin sees ADMINISTRATION section; customer does not - capture customer sidebar for the boundary check.
await shotTab('05-customer-readiness', customerCookie, 'Bid Readiness');


// Mobile viewport review (390x844, iPhone-class)
async function shotMobile(name, cookie, tabLabel) {
  const page = await newIsolatedPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (cookie) await page.setCookie(cookieFrom(cookie, base));
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await dismissInstallPrompt(page);
  if (tabLabel) {
    // open the mobile sidebar drawer first, then tap the item
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const menu = btns.find(x => x.getAttribute('aria-label')?.toLowerCase().includes('menu') || x.getAttribute('aria-label')?.toLowerCase().includes('sidebar'));
      if (menu) menu.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate((label) => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => x.textContent?.includes(label));
      if (b) b.click();
    }, tabLabel);
    await new Promise(r => setTimeout(r, 800));
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`shot ${name}`);
  await page.close();
}

await shotMobile('m1-landing');
await shotMobile('m2-dashboard', customerCookie);
await shotMobile('m3-admin', adminCookie, 'Platform Overview');

await browser.close();
console.log('done');
