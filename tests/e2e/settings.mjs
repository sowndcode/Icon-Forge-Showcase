// Every Settings page at a given window size: screenshots, and elements wider than their box.
//   node tests/e2e/settings.mjs [width] [height]
import { launch, outDir, seed } from './lib.mjs';
const W = +(process.argv[2] ?? 1280), H = +(process.argv[3] ?? 720);
const { browser, page, errors } = await launch({ width: W, height: H });
await seed(page, [{ id: 'prjS', name: 'Settings check', assets: 4, pages: [{ name: 'Cover', w: 1920, h: 1080, color: '#20232a', icons: 2 }] }], 'prjS');
await page.click('nav >> text=Settings');
await page.waitForSelector('.settings');
const dir = outDir(`settings-${W}x${H}`);
const cats = await page.$$eval('.set-nav button, .settings nav button', (b) => b.map((x) => x.textContent.trim()).filter(Boolean));
for (const c of cats) {
  await page.click(`.settings >> button:text-is("${c}")`).catch(() => undefined);
  await page.waitForTimeout(250);
  const over = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.settings .set-body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || el.closest('.path-text') || cs.textOverflow === 'ellipsis' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.overflowX !== 'visible') out.push(`${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth}`);
      const r = el.getBoundingClientRect(), p = el.closest('.set-body').getBoundingClientRect();
      if (r.width > 0 && (r.right > p.right + 1 || r.left < p.left - 1)) out.push(`${el.className || el.tagName} sticks out by ${Math.round(r.right - p.right)}px: ${(el.textContent || '').slice(0, 40)}`);
    }
    return [...new Set(out)].slice(0, 8);
  });
  console.log(`${c}: ${over.length ? over.join(' | ') : 'ok'}`);
  await page.screenshot({ path: `${dir}/${c.replace(/[^a-z0-9]+/gi, '_')}.png` });
}
if (errors.length) console.log('errors', errors.slice(0, 3));
await browser.close();
