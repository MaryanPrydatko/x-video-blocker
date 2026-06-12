// Generates README screenshots from the fixture page (X dark-mode replica)
// and the settings popup. Run: node test/gen-shots.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 2 });

await page.goto(`file://${path.join(root, 'test', 'fixture.html')}`);
await page.addStyleTag({ content: readFileSync(path.join(root, 'content.css'), 'utf8') });
await page.addScriptTag({ content: readFileSync(path.join(root, 'content.js'), 'utf8') });
await page.waitForTimeout(300);

const main = page.locator('main');
const shot = async (name) => {
  await main.screenshot({ path: path.join(shotsDir, name) });
  console.log(`screenshots/${name}`);
};

await shot('timeline-hidden.png');

const ph = page.locator('#video-post .tvb-placeholder');
await ph.locator('summary').click();
await page.waitForTimeout(200);
await shot('whats-it-about.png');

await ph.locator('.tvb-show').click();
await page.waitForTimeout(200);
await shot('are-you-sure.png');

// Popup (chrome.* stubbed so it renders outside the extension context)
const popup = await browser.newPage({ viewport: { width: 320, height: 400 }, deviceScaleFactor: 2 });
await popup.addInitScript(() => {
  window.chrome = {
    storage: {
      sync: {
        get: async (d) => ({ ...d, whitelist: ['wildclips', 'natgeo'] }),
        set: async () => {},
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://x.com/home' }],
      sendMessage: async () => ({ hidden: 3, revealed: 1 }),
    },
    runtime: { getManifest: () => ({ version: '1.2.0' }) },
  };
});
await popup.goto(`file://${path.join(root, 'popup.html')}`);
await popup.waitForTimeout(300);
await popup.locator('body').screenshot({ path: path.join(shotsDir, 'popup.png') });
console.log('screenshots/popup.png');

await browser.close();
