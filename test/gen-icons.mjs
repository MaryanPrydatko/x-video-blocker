// Renders the extension icon to PNG at all manifest sizes: a white video
// card with a play button and a red "blocked" slash on a blue gradient.
// Designed at 128px and scaled, so every size stays proportional.
// Run: node test/gen-icons.mjs
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
  #wrap { width: 128px; height: 128px; }
  #icon {
    width: 128px; height: 128px; border-radius: 30px;
    background: linear-gradient(160deg, #6ec0ff 0%, #1d9bf0 45%, #0b6bb8 100%);
    position: relative; overflow: hidden;
    transform-origin: top left;
  }
  #icon::before {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,0.25), transparent 55%);
  }
  .card {
    position: absolute; left: 20px; top: 36px; width: 88px; height: 58px;
    background: #fff; border-radius: 15px;
    box-shadow: 0 6px 14px rgba(5, 50, 90, 0.35);
  }
  .play {
    position: absolute; left: 54%; top: 50%;
    width: 26px; height: 30px;
    transform: translate(-50%, -50%);
    background: #1d9bf0;
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  .slash {
    position: absolute; left: -14px; top: 56px;
    width: 156px; height: 17px;
    background: #f4212e; border-radius: 999px;
    transform: rotate(-38deg);
    transform-origin: center;
    box-shadow: 0 3px 8px rgba(110, 0, 12, 0.4);
  }
</style>
<div id="wrap">
  <div id="icon">
    <div class="card"><div class="play"></div></div>
    <div class="slash"></div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);

for (const size of [16, 32, 48, 128]) {
  await page.evaluate((s) => {
    document.getElementById('wrap').style.width = `${s}px`;
    document.getElementById('wrap').style.height = `${s}px`;
    document.getElementById('icon').style.transform = `scale(${s / 128})`;
  }, size);
  await page.locator('#wrap').screenshot({
    path: path.join(iconsDir, `icon${size}.png`),
    omitBackground: true,
  });
  console.log(`icons/icon${size}.png`);
}

await browser.close();
