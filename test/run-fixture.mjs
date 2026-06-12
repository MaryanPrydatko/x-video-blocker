// Login-free smoke test: loads test/fixture.html (a replica of X's timeline
// DOM) in headless Chromium, injects the extension's CSS + JS the way the
// browser would, and walks the full hide -> dropdown -> confirm -> cancel ->
// reveal flow. Run: node test/run-fixture.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const check = (ok, name) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`file://${path.join(root, 'test', 'fixture.html')}`);
await page.addStyleTag({ content: readFileSync(path.join(root, 'content.css'), 'utf8') });
await page.addScriptTag({ content: readFileSync(path.join(root, 'content.js'), 'utf8') });
await page.waitForTimeout(300);

const videoPost = page.locator('#video-post');
const gifPost = page.locator('#gif-post');

// Hiding
check((await page.locator('#text-post[data-tvb-state]').count()) === 0, 'text-only post untouched');
check((await videoPost.getAttribute('data-tvb-state')) === 'hidden', 'video post hidden');
check((await gifPost.getAttribute('data-tvb-state')) === 'hidden', 'GIF post hidden');
check(
  await videoPost.evaluate((a) =>
    [...a.children].filter((c) => !c.classList.contains('tvb-placeholder'))
      .every((c) => getComputedStyle(c).display === 'none')
  ),
  'video post content is display:none'
);
check(
  await videoPost.evaluate((a) => [...a.querySelectorAll('video')].every((v) => v.paused)),
  'hidden video is paused'
);

// Placeholder content
const ph = videoPost.locator('.tvb-placeholder');
check((await ph.locator('.tvb-title').innerText()) === '1 post hidden — contains a video', 'video title text');
check(
  (await gifPost.locator('.tvb-title').innerText()) === '1 post hidden — contains a GIF',
  'GIF detected and labelled'
);
check(
  (await ph.locator('.tvb-author').innerText()) === 'Wildlife Clips @wildclips',
  'author name + handle parsed'
);

// Dropdown
await ph.locator('summary').click();
check(
  (await ph.locator('.tvb-text').innerText()).includes("This eagle's dive is unreal"),
  "what's-it-about dropdown shows post text"
);

// Confirm -> cancel
await ph.locator('.tvb-show').click();
check(await ph.locator('.tvb-confirm').isVisible(), 'confirm step appears');
await ph.locator('.tvb-no').click();
check((await videoPost.getAttribute('data-tvb-state')) === 'hidden', 'cancel keeps post hidden');
check(await ph.locator('.tvb-show').isVisible(), 'show button returns after cancel');

// Confirm -> reveal
await ph.locator('.tvb-show').click();
await ph.locator('.tvb-yes').click();
await page.waitForTimeout(100);
check((await videoPost.getAttribute('data-tvb-state')) === 'revealed', 'post revealed after yes');
check((await videoPost.locator('.tvb-placeholder').count()) === 0, 'placeholder removed on reveal');
check(
  await videoPost.evaluate((a) =>
    [...a.children].some((c) => getComputedStyle(c).display !== 'none')
  ),
  'post content visible again'
);

// MutationObserver: dynamically inserted video post gets hidden
await page.evaluate(() => {
  const a = document.createElement('article');
  a.dataset.testid = 'tweet';
  a.id = 'late-post';
  a.innerHTML = `<div class="body">
    <div data-testid="User-Name"><a href="/late">Late Poster</a> <span>@late</span> ·
      <a href="/late/status/1004"><time>1m</time></a></div>
    <div data-testid="tweetText">freshly streamed in</div>
    <div data-testid="videoComponent"><video muted src="data:video/mp4;base64,AAAA"></video></div>
  </div>`;
  document.querySelector('main').appendChild(a);
});
await page.waitForTimeout(300);
check(
  (await page.locator('#late-post').getAttribute('data-tvb-state')) === 'hidden',
  'dynamically added video post hidden by observer'
);

// Placeholder resilience: simulate React wiping it
await page.evaluate(() => document.querySelector('#late-post .tvb-placeholder').remove());
await page.waitForTimeout(300);
check(
  (await page.locator('#late-post .tvb-placeholder').count()) === 1,
  'placeholder rebuilt after removal'
);

// Whitelist via the "Always show posts from @…" shortcut
const ph2 = page.locator('#video-post-2 .tvb-placeholder');
check((await ph2.count()) === 1, 'second wildclips post hidden initially');
check(
  (await ph2.locator('.tvb-allow').innerText()) === 'Always show posts from @wildclips',
  'always-allow shortcut labelled with handle'
);
await ph2.locator('.tvb-allow').click();
await page.waitForTimeout(300);
check(
  (await page.locator('#video-post-2[data-tvb-state]').count()) === 0,
  'whitelisted account post unhidden'
);
check(
  (await page.locator('#video-post[data-tvb-state]').count()) === 0,
  'other post from whitelisted account unhidden too'
);
check(
  (await page.locator('#late-post[data-tvb-state="hidden"]').count()) === 1,
  'other accounts still hidden after whitelisting'
);

check(errors.length === 0, `no page errors${errors.length ? ` (${errors[0]})` : ''}`);

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
