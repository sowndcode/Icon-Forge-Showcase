// Screenshots of every workspace at the usual window sizes, for visual review.
//   node tests/e2e/screens.mjs   → e2e-out/screens/<width>/<workspace>.png
import { launch, outDir, seed } from './lib.mjs';

const SIZES = [[1280, 720], [1600, 900], [1920, 1080]];
const PROJECT = { id: 'prjQA', name: 'Fantasy RPG icons', assets: 180, pages: [{ name: 'Ground plane', w: 1920, h: 1080, color: '#1d2230', icons: 180 }, { name: 'itch cover', w: 630, h: 500, color: '#2a1d30', icons: 24 }] };

for (const [w, h] of SIZES) {
  const { browser, page, errors } = await launch({ width: w, height: h });
  await seed(page, [PROJECT], PROJECT.id);
  await page.evaluate(async () => {
    const { applyLayout } = await import('/src/state/layoutActions.ts');
    const gen = await import('/src/state/generators.ts');
    const { THEMES } = await import('/src/core/themes.ts');
    const { getDoc } = await import('/src/state/doc.ts');
    applyLayout('groundplane');
    // a template page with a dark panel under a light theme (the readability case)
    const t = gen.BUILTIN_TEMPLATES.find((x) => x.id === 'wall-cover');
    gen.createFromTemplate(t, getDoc().assets.slice(0, 40), 'Fantasy RPG', { text: 'keep', icons: 1, theme: THEMES.find((x) => x.id === 'minimal-light') }, 'new');
  });
  await page.waitForTimeout(1500);
  const dir = outDir(`screens/${w}`);
  const go = async (label) => {
    await page.click(`nav [data-tour="nav-${label.toLowerCase()}"]`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/${label}.png` });
  };
  for (const s of ['Home', 'Import', 'Compose', 'Arrange', 'Watermark', 'Review', 'Export']) await go(s);
  await page.click(`nav [data-tour="nav-compose"]`);
  await page.click('.addpage');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/NewPage.png` });
  await page.keyboard.press('Escape');
  console.log(w, errors.length ? errors.slice(0, 3) : 'no errors');
  await browser.close();
}
