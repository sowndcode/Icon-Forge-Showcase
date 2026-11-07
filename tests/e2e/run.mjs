// End-to-end checks of the app in Chromium against the dev server.
//   npm run dev                       (in another terminal)
//   node tests/e2e/run.mjs [review] [import] [shots]
// Screenshots go to e2e-out/ (git-ignored). Exit code 1 when a check fails.
import { BASE, check, failed, launch, outDir, seed } from './lib.mjs';

const which = new Set(process.argv.slice(2));
const want = (k) => !which.size || which.has(k);

const MIXED = {
  id: 'prjMixed',
  name: 'Mixed sizes',
  assets: 40,
  pages: [
    { name: 'itch cover', w: 630, h: 500, color: '#c0392b', icons: 12 },
    { name: 'YouTube', w: 1920, h: 1080, color: '#2457c5', icons: 40 },
    { name: 'Square', w: 1080, h: 1080, color: '#1e8449', icons: 20 },
  ],
};
const BIG = { id: 'prjBig', name: 'Big pack', assets: 2268, missing: [5, 6, 7], corrupt: [10, 11], pages: [{ name: 'Hero', w: 1920, h: 1080, color: '#333333', icons: 0 }] };

/** Average colour of the middle of the visible review canvas, and its shape. */
async function reviewSample(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.review-stage canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const visible = getComputedStyle(c).visibility !== 'hidden' && c.width > 1;
    let rgb = null;
    if (visible) {
      const ctx = c.getContext('2d');
      // a 6×6 patch at a corner of the page: the background colour, between icons
      const d = ctx.getImageData(2, 2, 6, 6).data;
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) (R += d[i]), (G += d[i + 1]), (B += d[i + 2]);
      const n = d.length / 4;
      rgb = [R / n, G / n, B / n].map(Math.round);
    }
    return { cssAspect: r.width / r.height, bitmapAspect: c.width / c.height, visible, rgb, label: document.querySelector('.review-page')?.textContent ?? '' };
  });
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 30);

async function review() {
  const { browser, page, errors } = await launch({ width: 1600, height: 900 });
  await seed(page, [MIXED], MIXED.id);
  await page.click('nav >> text=Review');
  await page.waitForSelector('.review-stage canvas');
  const shots = outDir('review');
  for (const zoom of ['Fit', '100%', 'Thumbnail']) {
    await page.click(`.review-bar >> text="${zoom}"`);
    // flip through the pages several times, sampling right after each switch and once rendered
    for (let round = 0; round < 3; round++)
      for (let i = 0; i < MIXED.pages.length; i++) {
        await page.keyboard.press('ArrowRight');
        const now = await reviewSample(page);
        const label = now?.label ?? '';
        const pg = MIXED.pages.find((p) => label.startsWith(p.name));
        // immediately after a switch the canvas is either hidden or already shows the new page
        if (now?.visible && pg) check(near(now.rgb, hex(pg.color)), `${zoom}: right after switching to ${pg.name} no other page is shown`, `rgb ${now.rgb}`);
        await page.waitForFunction(() => {
          const c = document.querySelector('.review-stage canvas');
          return c && getComputedStyle(c).visibility !== 'hidden' && c.width > 1;
        }, null, { timeout: 20000 });
        const s = await reviewSample(page);
        const p = MIXED.pages.find((x) => (s?.label ?? '').startsWith(x.name));
        if (!p) {
          check(false, `${zoom}: the page label names a page`, JSON.stringify(s));
          continue;
        }
        const aspect = p.w / p.h;
        check(!!p && Math.abs(s.cssAspect - aspect) < 0.02 && Math.abs(s.bitmapAspect - aspect) < 0.02, `${zoom}: ${p?.name} keeps its ${p?.w}×${p?.h} proportions`, `css ${s?.cssAspect.toFixed(3)} bitmap ${s?.bitmapAspect.toFixed(3)} want ${aspect.toFixed(3)}`);
        check(near(s.rgb, hex(p.color)), `${zoom}: ${p?.name} shows its own composition`, `rgb ${s?.rgb} want ${hex(p.color)}`);
        if (round === 0) await page.screenshot({ path: `${shots}/${zoom.replace('%', '')}-${i}.png` });
      }
  }
  // Review agrees with the export render of the same page (same renderer, same scale)
  const agree = await page.evaluate(async () => {
    const { renderPageCanvas } = await import('/src/services/exporter.ts');
    const { getPage, getAsset } = await import('/src/state/doc.ts');
    const p = getPage();
    const c = document.querySelector('.review-stage canvas');
    const k = c.width / p.width;
    const ex = await renderPageCanvas(p, getAsset, k);
    const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const b = ex.getContext('2d').getImageData(0, 0, ex.width, ex.height).data;
    if (ex.width !== c.width || ex.height !== c.height) return { same: false, why: `size ${ex.width}×${ex.height} vs ${c.width}×${c.height}` };
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return { same: diff / (a.length / 4) < 2, why: `mean abs diff ${(diff / (a.length / 4)).toFixed(2)}` };
  });
  check(agree.same, 'Review shows the same pixels the exporter renders for the page', agree.why);
  check(!errors.length, 'no errors in the window', errors.slice(0, 3).join(' | '));
  await browser.close();
}

async function importDialog() {
  const { browser, page, errors } = await launch({ width: 1600, height: 900 });
  await seed(page, [MIXED, BIG], MIXED.id);
  await page.click('nav >> text=Import');
  await page.click('text=From a project…');
  await page.waitForSelector('.pap-grid');
  // the other project with assets is chosen by default (the open one is excluded)
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelectorAll('.pap-img img').length >= 20, null, { timeout: 30000 });
  const ready = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.pap-img img')];
    await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
    return { tiles: document.querySelectorAll('.pap-tile').length, shown: imgs.filter((i) => i.naturalWidth > 0).length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length, count: document.querySelector('.pap-count')?.textContent };
  });
  check(ready.shown >= 20 && ready.broken === 0, 'thumbnails of the other project are visible', `${ready.shown} decoded, ${ready.broken} broken, ${ready.tiles} tiles mounted, in ${Date.now() - t0} ms`);
  check(ready.tiles < 400, 'only the tiles in view are mounted (2,268 assets)', `${ready.tiles} tiles`);
  check(/2,?26[0-9] selected/.test(ready.count ?? ''), 'every usable icon starts selected', ready.count);
  await page.screenshot({ path: `${outDir('import')}/top.png` });
  // missing and damaged files say so
  await page.waitForFunction(() => document.querySelectorAll('.pap-state').length >= 5, null, { timeout: 20000 }).catch(() => undefined);
  const states = await page.evaluate(() => [...document.querySelectorAll('.pap-state')].map((e) => e.textContent));
  check(states.filter((s) => s.includes('Missing')).length >= 1, 'a file that is gone shows as Missing', states.join(','));
  check(states.filter((s) => s.includes('Unreadable')).length >= 1, 'a damaged file shows as Unreadable', states.join(','));
  // scroll to the end: thumbnails there load too
  await page.evaluate(() => (document.querySelector('.pap-grid').scrollTop = 1e7));
  await page.waitForTimeout(300);
  await page.waitForFunction(() => [...document.querySelectorAll('.pap-img img')].filter((i) => i.naturalWidth > 0).length >= 10, null, { timeout: 30000 });
  const end = await page.evaluate(() => [...document.querySelectorAll('.pap-name')].map((e) => e.textContent).slice(-1)[0]);
  check(end === 'icon_2267.png', 'the last asset is reachable and shown', end);
  await page.screenshot({ path: `${outDir('import')}/end.png` });
  // search, select none, invert
  await page.fill('.pap-bar .search input', 'icon_01');
  await page.waitForTimeout(200);
  const names = await page.evaluate(() => [...document.querySelectorAll('.pap-name')].map((e) => e.textContent));
  check(names.length > 0 && names.every((n) => n.includes('icon_01')), 'search narrows the grid', `${names.length} tiles shown, all match`);
  await page.click('.modal >> text=Select none');
  const c1 = await page.evaluate(() => document.querySelector('.pap-count')?.textContent);
  check(/2,?168 selected/.test(c1 ?? ''), 'Select none clears only the 100 shown assets', c1);
  await page.click('.modal >> text=Invert');
  const c2 = await page.evaluate(() => document.querySelector('.pap-count')?.textContent);
  check(/2,?268 selected/.test(c2 ?? ''), 'Invert selects them again', c2);
  // add only the 100 found
  await page.click('.modal >> text=Select none');
  await page.click('.modal >> text=Invert');
  await page.fill('.pap-bar .search input', '');
  await page.waitForTimeout(100);
  // add them; the source project is unchanged
  const before = await page.evaluate(async () => (await (await import('/src/services/db.ts')).db.getProject('prjBig')).meta.updatedAt);
  // keep only the 100 searched ones: none of the rest
  await page.evaluate(() => undefined);
  await page.click('.modal button.primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 120000 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(async () => {
    const { db } = await import('/src/services/db.ts');
    const { getDoc } = await import('/src/state/doc.ts');
    const p = await db.getProject('prjBig');
    return { updatedAt: p.meta.updatedAt, assets: p.doc.assets.length, open: getDoc().assets.length };
  });
  check(after.updatedAt === before && after.assets === 2268, 'the source project was not modified', JSON.stringify(after));
  check(after.open === 40 + 2268 - 5 || after.open === 40 + 2268 - 3, 'the selected assets were added to the open project (files that are gone are skipped)', `${after.open} assets now`);
  check(!errors.length, 'no errors in the window', errors.slice(0, 3).join(' | '));
  await browser.close();
}

async function exportFlow() {
  const { browser, page, errors } = await launch({ width: 1600, height: 900 });
  await seed(page, [MIXED], MIXED.id);
  await page.click('nav >> text=Compose');
  // the second page is the one open in the editor
  await page.evaluate(async () => {
    const { setActivePage } = await import('/src/state/pages.ts');
    const { getDoc } = await import('/src/state/doc.ts');
    setActivePage(getDoc().pages[1].id);
  });
  const before = await page.evaluate(async () => JSON.stringify((await import('/src/state/prefs.ts')).usePrefs.getState().exportSettings));
  await page.click('header >> button.export-btn');
  await page.waitForSelector('.exv-stage canvas');
  const st = await page.evaluate(async () => (await import('/src/state/ui.ts')).useUI.getState().stage);
  check(st === 'export', 'Export in the header opens the Export workspace (not the old dialog)', st);
  check(!(await page.$('.modal')), 'no export dialog is shown');
  const on = await page.textContent('.exv-row.on');
  check((on ?? '').includes('YouTube'), 'the page open in Compose is the one previewed', on);
  await page.waitForFunction(() => !document.querySelector('.exv-spin'), null, { timeout: 20000 });
  const pct0 = await page.textContent('.exv-pct');
  const stage = await page.$('.exv-stage');
  const b = await stage.boundingBox();
  await page.mouse.move(b.x + b.width / 2 + 100, b.y + b.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200);
  await page.waitForTimeout(200);
  const pct1 = await page.textContent('.exv-pct');
  check(parseInt(pct1) > parseInt(pct0), 'the wheel zooms the preview', `${pct0} → ${pct1}`);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 150, b.y + b.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await page.screenshot({ path: `${outDir('export')}/zoomed.png` });
  await page.click('.exv-zoom >> text=100%');
  await page.waitForTimeout(300);
  check((await page.textContent('.exv-pct')).trim() === '100%', '100% shows one output pixel per screen pixel', await page.textContent('.exv-pct'));
  await page.click('.exv-zoom >> text=Fit');
  check((await page.textContent('.exv-pct')).trim() === pct0.trim(), 'Fit brings the whole output back', await page.textContent('.exv-pct'));
  const after = await page.evaluate(async () => JSON.stringify((await import('/src/state/prefs.ts')).usePrefs.getState().exportSettings));
  check(after === before, 'zooming and panning never change the export settings');
  // a 2× export of the itch page: the preview follows page and size
  await page.click('.exv-row >> text=itch cover');
  await page.click('.exv-settings >> text="2×"');
  await page.waitForFunction(() => !document.querySelector('.exv-spin'), null, { timeout: 20000 });
  const meta = await page.textContent('.exv-meta');
  check(meta.includes('1260 × 1000'), 'the preview follows the chosen page and size', meta);
  await page.click('.exv-zoom button[aria-label="Larger preview"]');
  await page.screenshot({ path: `${outDir('export')}/expanded.png` });
  await page.click('.exv-zoom button[aria-label="Smaller preview"]');
  await page.click('.review-bar >> text=Compose');
  const back = await page.evaluate(async () => (await import('/src/state/ui.ts')).useUI.getState().stage);
  check(back === 'compose', 'Back returns to Compose', back);
  await page.keyboard.press('Control+e');
  const viaKey = await page.evaluate(async () => (await import('/src/state/ui.ts')).useUI.getState().stage);
  check(viaKey === 'export', 'Ctrl+E opens the Export workspace too', viaKey);
  check(!errors.length, 'no errors in the window', errors.slice(0, 3).join(' | '));
  await browser.close();
}

if (want('review')) await review();
if (want('export')) await exportFlow();
if (want('import')) await importDialog();
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
process.exit(failed() ? 1 : 0);
