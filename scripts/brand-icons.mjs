// Renders the app icon files from the brand sources (assets/brand/*.svg), so every icon is the same
// mark: electron/icon.png (512 px, window icon on Linux/macOS), electron/icon.ico (16–256 px, the
// Windows window, taskbar and executable icon) and public/favicon.svg (the page itself).
//   node scripts/brand-icons.mjs
// Needs Playwright with Chromium (used from a global installation; not a project dependency).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const big = fs.readFileSync(path.join(root, 'assets/brand/app-icon.svg'), 'utf8');
const small = fs.readFileSync(path.join(root, 'assets/brand/app-icon-small.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size) {
  const b64 = await page.evaluate(
    async ({ b64svg, size }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + b64svg;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/png').split(',')[1];
    },
    { b64svg: Buffer.from(svg, 'utf8').toString('base64'), size },
  );
  return Buffer.from(b64, 'base64');
}

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = [];
for (const s of sizes) images.push({ size: s, data: await png(s <= 32 ? small : big, s) });
fs.writeFileSync(path.join(root, 'electron/icon.png'), await png(big, 512));
await browser.close();

// .ico: a directory of PNG images (supported since Windows Vista)
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const dir = images.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
fs.writeFileSync(path.join(root, 'electron/icon.ico'), Buffer.concat([head, ...dir, ...images.map((i) => i.data)]));
fs.copyFileSync(path.join(root, 'assets/brand/app-icon.svg'), path.join(root, 'public/favicon.svg'));
console.log(`icon.png 512 px, icon.ico ${sizes.join('/')} px, favicon.svg`);
