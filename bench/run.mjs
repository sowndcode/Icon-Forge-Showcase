// Runs bench/index.html in Chromium against a running dev server and prints the results.
//   npm run dev   (in another terminal)
//   node bench/run.mjs [--n=20,180,1000,2267] [--alg=floor,groundplane] [--url=http://localhost:5183]
import { createRequire } from 'node:module';
// Playwright is not a project dependency: use the copy installed globally (or in the project, if present)
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const base = arg('url', 'http://localhost:5183');
const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`${base}/bench/${arg('page', 'index')}.html?n=${arg('n', '20,180,1000,2267')}&alg=${arg('alg', 'floor,groundplane')}`);
await page.waitForFunction(() => window.benchResult, null, { timeout: 15 * 60_000, polling: 1000 });
const r = await page.evaluate(() => window.benchResult);
console.log(r.text ?? r.error);
if (process.argv.includes('--json')) console.log(JSON.stringify(r.rows));
await browser.close();
