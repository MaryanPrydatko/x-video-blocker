// Renders the extension icon (blue rounded square + video-off glyph) to PNG
// at all manifest sizes using headless Chromium. Run: node test/gen-icons.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(root, 'icons');
mkdirSync(iconsDir, { recursive: true });

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: transparent; }
  #icon {
    width: 128px; height: 128px; border-radius: 24%;
    background: linear-gradient(135deg, #1d9bf0, #0b6bb8);
    display: flex; align-items: center; justify-content: center;
  }
  svg { width: 60%; height: 60%; }
</style>
<div id="icon">
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.66 5H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.66"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);

for (const size of [16, 32, 48, 128]) {
  await page.evaluate((s) => {
    const el = document.getElementById('icon');
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
  }, size);
  await page.locator('#icon').screenshot({
    path: path.join(iconsDir, `icon${size}.png`),
    omitBackground: true,
  });
  console.log(`icons/icon${size}.png`);
}

await browser.close();
