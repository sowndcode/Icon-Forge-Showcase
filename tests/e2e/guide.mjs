// Guide progress in the real app: first-time state, Mark as read, an action lesson completed by doing
// it, progress kept after a reload and a project switch, scroll highlighting and the last lesson.
//   node tests/e2e/guide.mjs   (with a freshly started npm run dev)
import { check, failed, launch, outDir, seed } from './lib.mjs';

const A = { id: 'prjGA', name: 'Guide A', assets: 8, pages: [{ name: 'Cover', w: 1920, h: 1080, color: '#2457c5', icons: 6 }] };
const B = { id: 'prjGB', name: 'Guide B', assets: 4, pages: [{ name: 'Cover', w: 1080, h: 1080, color: '#c0392b', icons: 3 }] };
const dir = outDir('guide');
const { browser, page, errors } = await launch({ width: 1600, height: 900 });
await seed(page, [A, B], A.id);
const count = () => page.textContent('.guide-nav-head .muted');

await page.click('nav [data-tour="nav-guide"]');
await page.waitForSelector('.guide-nav');
const first = await count();
check(/^0 of \d+ lessons complete$/.test(first.trim()), 'a first-time user has no completed lessons (opening the Guide completes nothing)', first);
await page.click('.guide-ch >> text=Getting started');
await page.waitForSelector('#g-import');
// scrolling to the bottom of a page completes nothing, and the last lesson becomes the current one
await page.evaluate(() => (document.querySelector('.guide-body').scrollTop = 1e7));
await page.waitForTimeout(300);
const active = await page.textContent('.guide-toc button.on');
check(active.includes('Export the image'), 'at the bottom of the page the last lesson is highlighted', active);
check((await count()).startsWith('0 of'), 'scrolling to the end completes nothing', await count());
check((await page.textContent('#g-export .gsec-status')).includes('Completes when you export an image'), 'the export lesson says what completes it');
await page.screenshot({ path: `${dir}/getting-started-end.png` });

// an action lesson: apply a theme (changes the background) in the editor
await page.evaluate(async () => {
  const { applyTheme } = await import('/src/state/themes.ts');
  const { THEMES } = await import('/src/core/themes.ts');
  applyTheme(THEMES.find((t) => t.id === 'minimal-dark'));
});
await page.waitForTimeout(300);
check((await page.textContent('#g-background .gsec-status')).includes('Done'), 'Pick a background completes when a theme changes the background');
const bgToc = await page.$eval('.guide-toc button:has-text("Pick a background")', (b) => b.classList.contains('done'));
check(bgToc, 'the lesson list shows it as complete');

// a reading lesson: Mark as read
await page.click('.guide-ch >> text=Reference & help');
await page.waitForSelector('#g-faq');
await page.click('#g-faq >> text=Mark as read');
check((await page.textContent('#g-faq .gsec-status')).includes('Marked as read'), 'Mark as read completes a reading lesson');
check((await count()).startsWith('2 of'), 'the overall count follows', await count());
// clicking a lesson in the list opens it and highlights it
await page.click('.guide-toc >> text=Keyboard shortcuts');
await page.waitForTimeout(700);
check((await page.textContent('.guide-toc button.on')).includes('Keyboard shortcuts'), 'clicking a lesson highlights it');
check(!!(await page.$('.guide-finish')), 'the last page ends with what is left to do');
await page.screenshot({ path: `${dir}/reference.png` });

// persistence: reload, then switch projects
await page.waitForTimeout(400);
await page.reload();
await page.waitForSelector('.app');
await page.click('nav [data-tour="nav-guide"]');
await page.waitForSelector('.guide-nav');
check((await count()).startsWith('2 of'), 'progress is kept after a restart', await count());
await page.evaluate(async () => (await import('/src/state/project.ts')).openStoredProject('prjGB'));
await page.click('nav [data-tour="nav-guide"]');
await page.waitForSelector('.guide-nav');
check((await count()).startsWith('2 of'), 'progress is kept after switching projects', await count());

// finishing: every lesson complete shows the final message with a next step
await page.evaluate(async () => {
  const { completeLesson } = await import('/src/state/guideProgress.ts');
  for (const id of ['import', 'arrange', 'title', 'export', 'layouts', 'shuffle', 'grids', 'text', 'shapes', 'focal', 'bg-more', 'storeset', 'catalog', 'templates', 'pages', 'projects', 'replace', 'review', 'export-more', 'folder', 'keys']) completeLesson(id, 'read');
});
await page.click('.guide-ch >> text=Reference & help');
await page.waitForSelector('.guide-finish.complete');
check((await page.textContent('.guide-finish.complete')).includes('You have finished the Guide'), 'finishing every lesson shows a completion message');
check(!!(await page.$('.guide-finish.complete >> text=Continue working')), 'and a next step (Continue working with a project open)');
await page.evaluate(() => (document.querySelector('.guide-body').scrollTop = 1e7));
await page.screenshot({ path: `${dir}/finished.png` });
check(!errors.length, 'no errors in the window', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed');
process.exit(failed() ? 1 : 0);
