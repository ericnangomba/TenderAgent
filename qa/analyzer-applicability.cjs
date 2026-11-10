// Verifies analyzer applicability behavior on the built bundle.
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const QA = JSON.parse(fs.readFileSync('/tmp/qa-env.json', 'utf8'));
const BASE = `http://localhost:${QA.port}`;

const SILENT = `TENDER NOTICE
Provision of Office Cleaning Services for a period of twenty four months.
BID NUMBER: CLN-2026-014
Closing date: 15 December 2026. Enquiries: Supply Chain Management office.`;

const LISTING = `TENDER NOTICE
Appointment of a service provider for road maintenance. BID NUMBER: RDM-2026-088.
Bidders must be registered on the Central Supplier Database (CSD) and provide
a valid SARS Tax Compliance Status PIN. A valid COIDA Letter of Good Standing
is required. Submit SBD 4 and SBD 6.1 with your bid. CIDB grading 5CE required.`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setCookie({ name: 'ta_session', value: QA.customerCookie.split('=')[1], url: BASE });

  async function analyze(text, label, viewport) {
    await page.setViewport(viewport);
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('textarea', { timeout: 15000 });
    // navigate to analyzer view
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a')];
      const el = els.find(e => /analyz/i.test(e.textContent || ''));
      if (el) el.click();
    });
    await new Promise(r => setTimeout(r, 800));
    const ta = await page.$('textarea');
    await ta.click({ clickCount: 3 });
    await ta.type(text, { delay: 0 });
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => /Check this document/i.test(x.textContent || '') && !x.disabled);
      if (b) { b.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('analyze button not found');
    await page.waitForFunction(() => /Returnables Found in This Tender/i.test(document.body.innerText), { timeout: 45000 });
    await new Promise(r => setTimeout(r, 1200));
    const shot = `/downloads/analyzer-${label}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    const state = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        listedByTender: (t.match(/Listed by tender/gi) || []).length,
        notListed: (t.match(/Not listed - check returnables/gi) || []).length,
        mandatoryBadges: (t.match(/Mandatory/g) || []).length,
        notListedByTender: (t.match(/Not listed by this tender/g) || []).length,
        missingForListed: (t.match(/Missing for a listed requirement/g) || []).length,
        universalRequired: /required for all South African/i.test(t),
        refShown: (t.match(/Ref: [A-Z0-9\/.-]+/i) || [''])[0],
        notStatedSystem: /Not stated/.test(t),
        confirmSystem: /did not state the preference-point system/.test(t),
        finished: /Finished - results below/.test(t),
        waitingOnly: /Waiting/.test(t) && !/Finished/.test(t),
        techCollapsed: (() => { const d = document.querySelector('details'); return d ? !d.open : null; })(),
      };
    });
    console.log(label, JSON.stringify(state));
    return state;
  }

  const mobile = { width: 390, height: 844, isMobile: true, hasTouch: true };
  const desktop = { width: 1440, height: 900 };

  const s1 = await analyze(SILENT, 'silent-mobile', mobile);
  const s2 = await analyze(LISTING, 'listing-mobile', mobile);
  await analyze(LISTING, 'listing-desktop', desktop);
  const s3 = await analyze(LISTING + '\nEvaluation: 90/10 preference point system applies.', 'points90-mobile', mobile);

  let fail = [];
  if (s1.listedByTender !== 0) fail.push('silent text must list nothing');
  if (s1.mandatoryBadges !== 0) fail.push('no Mandatory badges allowed');
  if (s1.notListedByTender < 4) fail.push('profile rows must show Not listed by this tender when unlisted');
  if (s2.listedByTender < 3) fail.push('listing text should mark CSD/SARS/COIDA listed');
  if (!/RDM-2026-088/.test(s2.refShown)) fail.push('extracted ref wrong: ' + s2.refShown);
  if (!s1.notStatedSystem || !s1.confirmSystem) fail.push('silent text must show system Not stated + confirm wording');
  if (!s2.notStatedSystem) fail.push('listing text states no system - must show Not stated');
  if (s3.notStatedSystem) fail.push('90/10 text must not show Not stated');
  if (!s1.finished) fail.push('progress must show Finished after results');
  if (s1.techCollapsed !== true) fail.push('technical details must be collapsed by default');
  if (s2.mandatoryBadges !== 0) fail.push('no Mandatory badges on listing text either');
  if (fail.length) { console.error('FAIL: ' + fail.join('; ')); process.exit(1); }
  console.log('ANALYZER-APPLICABILITY-OK');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
