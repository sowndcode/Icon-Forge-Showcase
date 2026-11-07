// CPU profile of one benchmark run: prints the functions with the most self time.
//   node bench/profile.mjs --n=2267 --alg=groundplane
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const browser = await chromium.launch();
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.goto(`http://localhost:5183/bench/index.html?n=${arg('n', '2267')}&alg=${arg('alg', 'groundplane')}`);
await page.waitForFunction(() => window.benchResult, null, { timeout: 600000, polling: 500 });
const { profile } = await cdp.send('Profiler.stop');
console.log((await page.evaluate(() => window.benchResult)).text);
const self = new Map();
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
});
[...self].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(v.toFixed(0).padStart(7), 'ms ', k));
await browser.close();
