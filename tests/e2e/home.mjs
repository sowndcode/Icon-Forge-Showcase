// Home with and without an open project, and the Recent projects display modes (persisted).
//   node tests/e2e/home.mjs   (with a freshly started npm run dev)
import { check, failed, launch, outDir, seed } from './lib.mjs';

const PROJECTS = Array.from({ length: 9 }, (_, i) => ({ id: `prjH${i}`, name: `Pack ${String.fromCharCode(65 + i)}`, assets: 6 + i, pages: [{ name: 'Cover', w: 1920, h: 1080, color: ['#2457c5', '#c0392b', '#1e8449'][i % 3], icons: 4 }] }));
const dir = outDir('home');

for (const [w, h] of [[1280, 720], [1600, 900], [1920, 1080]]) {
  const { browser, page, errors } = await launch({ width: w, height: h });
  // no project open: seed without a last project
  await seed(page, PROJECTS, '');
  const st = await page.evaluate(async () => ({ open: (await import('/src/state/doc.ts')).useDoc.getState().open, stage: (await import('/src/state/ui.ts')).useUI.getState().stage }));
  check(!st.open && st.stage === 'home', `${w}: starts on Home with no project open when none was open`, JSON.stringify(st));
  check(!(await page.$('.current-project')), `${w}: no current-project card without a project`);
  check(!(await page.$('.pc-badge')), `${w}: no project is marked Open`);
  const recentTop = await page.$eval('.recent', (e) => e.getBoundingClientRect().top);
  check(recentTop < h * 0.5, `${w}: Recent projects starts in the upper half of the window`, `${Math.round(recentTop)}px`);
  const overflow = await page.evaluate(() => document.querySelector('.home').scrollWidth > document.querySelector('.home').clientWidth);
  check(!overflow, `${w}: no horizontal overflow on Home`);
  await page.screenshot({ path: `${dir}/${w}-none.png` });
  // the project-only workspaces are disabled
  const disabled = await page.$eval('nav [data-tour="nav-compose"]', (b) => b.disabled);
  check(disabled, `${w}: Compose is unavailable with no project open`);

  if (w === 1600) {
    // compact, grid, hidden, persisted across a reload
    await page.click('.recent-modes >> text=Compact');
    check(!!(await page.$('.project-list .project-row')), 'Compact shows a list');
    await page.click('.recent-modes >> text=Hidden');
    const thumbs = await page.evaluate(() => document.querySelectorAll('.recent img').length);
    check(!(await page.$('#recent-projects-body')) && thumbs === 0, 'Hidden collapses to the header and loads no thumbnails', `${thumbs} images`);
    await page.reload();
    await page.waitForSelector('.recent');
    check(!(await page.$('#recent-projects-body')), 'the collapsed state is kept after a restart');
    await page.click('.recent-toggle');
    await page.waitForSelector('.project-list, .project-grid', { timeout: 5000 }).catch(() => undefined);
    check(!!(await page.$('.project-list')), 'expanding restores the chosen view (Compact) without changing it');
    await page.reload();
    await page.waitForSelector('.recent');
    check(!!(await page.$('.project-list')), 'the Compact view is kept after a restart');
    // keyboard: the header toggles, a row opens with Enter
    await page.focus('.recent-toggle');
    await page.keyboard.press('Enter');
    check(!(await page.$('#recent-projects-body')), 'the header collapses with the keyboard');
    await page.keyboard.press('Enter');
    await page.fill('.pb-toolbar .search input', 'Pack C');
    await page.waitForTimeout(200);
    const rows = await page.$$eval('.project-row', (r) => r.map((x) => x.textContent));
    check(rows.length === 1 && rows[0].includes('Pack C'), 'search works in the compact view', rows.join(' | '));
    await page.focus('.project-row');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    const opened = await page.evaluate(async () => (await import('/src/state/doc.ts')).getDoc().name);
    check(opened === 'Pack C', 'Enter on a row opens that project', opened);
    await page.click('nav [data-tour="nav-home"]');
    await page.waitForSelector('.current-project');
    check((await page.textContent('.project-row.current')).includes('Pack C'), 'the open project is marked in the list');
    await page.screenshot({ path: `${dir}/${w}-open-compact.png` });
    await page.click('.recent-modes >> text=Grid');
    await page.screenshot({ path: `${dir}/${w}-open-grid.png` });
    // Generate pages menu
    await page.click('.current-project >> text=Generate pages');
    await page.waitForSelector('.menu button');
    const items = await page.$$eval('.menu button', (b) => b.map((x) => x.textContent.trim()));
    check(['Complete store set', 'Custom store set…', 'Catalog…', 'Category pages…'].every((t) => items.some((i) => i.startsWith(t))), 'Generate pages offers all four generators', items.join(', '));
    await page.keyboard.press('Escape');
    // close the project
    await page.click('.current-project >> text=Close project');
    await page.waitForTimeout(800);
    const after = await page.evaluate(async () => ({ open: (await import('/src/state/doc.ts')).useDoc.getState().open, n: (await (await import('/src/services/db.ts')).db.listProjects()).length }));
    check(!after.open && after.n === 9, 'Close project leaves 9 projects and none open', JSON.stringify(after));
    check(!(await page.$('.project-row.current')), 'no project is marked Open after closing');
  }
  check(!errors.length, `${w}: no errors in the window`, errors.slice(0, 3).join(' | '));
  await browser.close();
}
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
process.exit(failed() ? 1 : 0);
