/** PWA privacy verification: SW cache contents across sign-in, offline, sign-out. */
import puppeteer from 'puppeteer-core';

const { port, customerCookie } = JSON.parse(process.env.QA_SERVER);
const base = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
const page = await ctx.newPage();
const out = {};

async function cachedUrls() {
  return page.evaluate(async () => {
    const keys = await caches.keys();
    const urls = [];
    for (const k of keys) {
      const c = await caches.open(k);
      for (const req of await c.keys()) urls.push(`${k} :: ${new URL(req.url).pathname}`);
    }
    return urls;
  });
}

// 1. Register SW signed-out, then sign in and browse (fires /api/auth/me, /api/profile)
await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => navigator.serviceWorker.ready);
const [name, value] = customerCookie.split('=');
await page.setCookie({ name, value, url: base });
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate(() => navigator.serviceWorker.ready);
await new Promise(r => setTimeout(r, 1500)); // allow any SW caching to settle

out.cacheNamesAfterSignin = await page.evaluate(() => caches.keys());
const urls = await cachedUrls();
out.apiEntriesAfterSignin = urls.filter(u => u.includes('/api/'));
out.shellEntryCount = urls.length;

// 3. Sign out via the real UI button (exercises the actual purge path + reload)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => x.textContent?.includes('Account'));
  if (b) b.click();
});
await new Promise(r => setTimeout(r, 800));
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => undefined),
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => x.textContent?.includes('Sign out'));
    if (b) b.click();
  }),
]);
await new Promise(r => setTimeout(r, 1500));
out.cacheNamesAfterSignout = await page.evaluate(() => caches.keys());
out.apiEntriesAfterSignout = (await cachedUrls()).filter(u => u.includes('/api/'));
out.signedOutShowsLanding = await page.evaluate(() => document.body.textContent.includes('Read the tender'));

// 2. True offline: kill the QA server, reload from the cached shell, and
// confirm /api/profile fails honestly instead of serving cached account data.
await fetch(`${base}/qa/shutdown`, { method: 'POST' }).catch(() => undefined);
await new Promise(r => setTimeout(r, 1200));
await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
out.shellLoadsOffline = await page.evaluate(() => document.body.textContent.includes('Read the tender'));
out.offlineProfile = await page.evaluate(async () => {
  try {
    const r = await fetch('/api/profile');
    const body = await r.json().catch(() => ({}));
    return { status: r.status, offline: body.offline === true, bodyText: JSON.stringify(body) };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
