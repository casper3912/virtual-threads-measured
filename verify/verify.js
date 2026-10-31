// Behavioral oracle for index.html, run in CI before every deploy.
// Opens the page from file:// in Chromium at desktop, phone and dark-mode sizes, then fails if:
//   - any embedded self-test fails (window.__vtTests), or fewer than MIN_TESTS ran
//   - the page throws, logs a console error, or requests anything off the file system
//   - the layout scrolls sideways
//   - with scripts disabled, the quiz answers are missing
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
const MIN_TESTS = 38;
const VIEWS = [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true }],
  ['dark', { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }],
];

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  for (const [name, opts] of VIEWS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) external.push(r.url()); });
    await page.goto(FILE);
    await page.waitForFunction(() => window.__vtTests, null, { timeout: 15000 });
    const t = await page.evaluate(() => window.__vtTests);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${name}: ${t.pass} passed, ${t.fail} failed, overflow ${overflow}px, external requests ${external.length}`);
    if (t.fail > 0) failures.push(`${name}: ${t.log.filter(l => l.startsWith('FAIL')).join(' | ')}`);
    if (t.pass + t.fail < MIN_TESTS) failures.push(`${name}: only ${t.pass + t.fail} tests ran (expected ≥ ${MIN_TESTS})`);
    if (errors.length) failures.push(`${name}: page errors: ${errors.join(' | ')}`);
    if (external.length) failures.push(`${name}: external requests: ${external.join(', ')}`);
    if (overflow > 1) failures.push(`${name}: horizontal overflow of ${overflow}px`);
    await ctx.close();
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const p = await noJs.newPage();
  await p.goto(FILE);
  const answers = await p.locator('details.ans').count();
  console.log(`no-script: ${answers} quiz answers readable`);
  if (answers < 8) failures.push(`no-script: only ${answers} quiz answers`);
  await browser.close();
  if (failures.length) {
    console.error('\nFAILED\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('\nAll checks passed.');
})();
