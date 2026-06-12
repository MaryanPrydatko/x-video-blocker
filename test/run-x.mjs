// Live test against real x.com.
//
// Opens a visible Chromium window with the extension loaded. Log into X in
// that window (session persists in test/.profile, gitignored). Once login is
// detected the script scrolls the home timeline until it finds a hidden post,
// exercises the dropdown -> confirm -> cancel -> reveal flow, asserts each
// step, and saves screenshots to screenshots/.
//
// Run: node test/run-x.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Set TVB_BROWSER to a Chromium-based binary (e.g. Brave) to test in it;
// defaults to Playwright's bundled Chromium. Brave still supports
// --load-extension, which Chrome stable removed.
const executablePath = process.env.TVB_BROWSER || '';
const profileDir = path.join(root, 'test', executablePath ? '.profile-brave' : '.profile');
const shotsDir = path.join(root, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const log = (m) => console.log(`[x-test] ${m}`);
const fail = (m) => {
  console.error(`[x-test] FAIL: ${m}`);
  process.exitCode = 1;
};

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  ...(executablePath ? { executablePath } : { channel: 'chromium' }),
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
  ],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

log('Waiting for X login (up to 8 minutes)…');
const deadline = Date.now() + 8 * 60 * 1000;
let loggedIn = false;
while (Date.now() < deadline) {
  const cookies = await context.cookies('https://x.com');
  if (cookies.some((c) => c.name === 'auth_token')) {
    loggedIn = true;
    break;
  }
  await page.waitForTimeout(2000);
}
if (!loggedIn) {
  fail('not logged in within 8 minutes — rerun `node test/run-x.mjs` and log in');
  await context.close();
  process.exit(1);
}

log('Login detected. Loading home timeline…');
await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article[data-testid="tweet"]', { timeout: 60_000 });
await page.waitForTimeout(2500);

// Screenshot helper: clip to the timeline column so shots look clean.
const shot = async (name) => {
  const clip = await page.evaluate(() => {
    const col = document.querySelector('[data-testid="primaryColumn"]');
    const r = col.getBoundingClientRect();
    const x = Math.max(0, r.x - 1);
    return { x, y: 0, width: Math.min(r.width + 2, innerWidth - x), height: innerHeight };
  });
  await page.screenshot({ path: path.join(shotsDir, name), clip });
  log(`screenshot -> screenshots/${name}`);
};

// Scroll until the extension hides a video post.
log('Scrolling timeline looking for a video post…');
let found = (await page.locator('.tvb-placeholder').count()) > 0;
for (let i = 0; i < 50 && !found; i++) {
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(600);
  found = (await page.locator('.tvb-placeholder').count()) > 0;
}
if (!found) {
  fail('no video post found in 50 scrolls — timeline had no videos?');
  await context.close();
  process.exit(1);
}

const ph = page.locator('.tvb-placeholder').first();
await ph.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -200));
await page.waitForTimeout(500);

// 1. Placeholder content + original post actually hidden.
const title = await ph.locator('.tvb-title').innerText();
if (!/^1 post hidden — contains a (video|GIF)$/.test(title)) {
  fail(`unexpected title: "${title}"`);
} else {
  log(`placeholder title OK: "${title}"`);
}

const hiddenOk = await ph.evaluate((el) => {
  const article = el.closest('article');
  return [...article.children]
    .filter((c) => c !== el)
    .every((c) => getComputedStyle(c).display === 'none');
});
hiddenOk ? log('original post content is display:none OK') : fail('post content still visible');

const playing = await ph.evaluate((el) =>
  [...el.closest('article').querySelectorAll('video')].some((v) => !v.paused)
);
playing ? fail('a hidden video is still playing') : log('no hidden video is playing OK');

await shot('01-post-hidden.png');

// 2. "What's it about?" dropdown (only present when the post has text).
const details = ph.locator('.tvb-details');
if (await details.count()) {
  await details.locator('summary').click();
  await page.waitForTimeout(300);
  const preview = (await details.locator('.tvb-text').innerText()).trim();
  preview.length > 0 ? log(`dropdown preview OK (${preview.length} chars)`) : fail('dropdown empty');
  await shot('02-whats-it-about.png');
} else {
  log('post has no text — dropdown correctly absent');
}

// 3. Show video -> confirm appears.
await ph.locator('.tvb-show').click();
await ph.locator('.tvb-confirm').waitFor({ state: 'visible', timeout: 5000 });
log('confirmation step appears OK');
await shot('03-are-you-sure.png');

// 4. Cancel -> still hidden.
await ph.locator('.tvb-no').click();
await page.waitForTimeout(300);
const stillHidden = await ph.evaluate(
  (el) => el.closest('article').getAttribute('data-tvb-state') === 'hidden'
);
stillHidden ? log('cancel keeps post hidden OK') : fail('cancel revealed the post');

// 5. Show video -> Yes -> revealed.
await ph.locator('.tvb-show').click();
await ph.locator('.tvb-yes').click();
await page.waitForSelector('article[data-tvb-state="revealed"]', { timeout: 5000 });
const revealedOk = await page.evaluate(() => {
  const article = document.querySelector('article[data-tvb-state="revealed"]');
  return (
    article &&
    !article.querySelector('.tvb-placeholder') &&
    [...article.children].some((c) => getComputedStyle(c).display !== 'none')
  );
});
revealedOk ? log('post revealed after confirmation OK') : fail('reveal did not restore the post');
await page.waitForTimeout(1500);
await shot('04-revealed.png');

// 6. Sanity: text-only posts untouched.
const untouched = await page.evaluate(() => {
  const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
  return articles
    .filter((a) => !a.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'))
    .every((a) => !a.getAttribute('data-tvb-state'));
});
untouched ? log('text-only posts untouched OK') : fail('a text-only post was hidden');

const remaining = await page.locator('.tvb-placeholder').count();
log(`${remaining} other post(s) currently hidden on screen`);

log(process.exitCode ? 'DONE — with failures' : 'ALL CHECKS PASSED');
await page.waitForTimeout(2000);
await context.close();
