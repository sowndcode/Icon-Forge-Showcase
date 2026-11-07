// Layout performance benchmark (development only, not part of the app build).
//   npm run dev, then open http://localhost:5183/bench/index.html?n=20,180,1000,2267&alg=floor,groundplane
// or run `node bench/run.mjs`, which drives it headless and prints the table.
// Every number is a real measurement of the app's own modules: the layout action (with undo history),
// the editor's page render (cold, panned, zoom steps), hit testing and the export render.

import { createPage, createProject } from '../src/core/defaults';
import type { ImageObject } from '../src/core/types';
import { hitObject } from '../src/core/transform';
import { images } from '../src/render/images';
import { makeIcons } from './icons';
import { renderPage } from '../src/render/renderer';
import { renderPageCanvas } from '../src/services/exporter';
import { getAsset, getPage, loadDoc, useDoc } from '../src/state/doc';
import { applyLayout } from '../src/state/layoutActions';
import { newImageObject } from '../src/state/objects';

const q = new URLSearchParams(location.search);
const COUNTS = (q.get('n') ?? '20,180,1000,2267').split(',').map(Number);
const ALGS = (q.get('alg') ?? 'floor,groundplane').split(',');
const VW = 1600,
  VH = 900;

const now = () => performance.now();
/** Canvas work is queued; reading one pixel makes the timing include it. */
const flush = (c: OffscreenCanvas | HTMLCanvasElement) => (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, 1, 1);

function median(v: number[]) {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function bench(alg: string, n: number) {
  const assets = await makeIcons(n);
  const d = createProject('bench');
  const page0 = createPage('p', 1920, 1080);
  d.assets = assets;
  loadDoc({ ...d, pages: [page0], activePageId: page0.id });
  const objs = assets.map((a) => newImageObject(a.id, { x: 960, y: 540 }, page0, 0.05));
  loadDoc({ ...d, pages: [{ ...page0, objects: objs }], activePageId: page0.id });

  let t = now();
  applyLayout(alg, objs.map((o) => o.id));
  const layoutMs = now() - t;
  const page = getPage();

  // the editor: the page fitted into a 1600×900 view at device pixel ratio 1
  const canvas = document.createElement('canvas');
  canvas.width = VW;
  canvas.height = VH;
  const ctx = canvas.getContext('2d')!;
  const fit = Math.min((VW - 80) / page.width, (VH - 80) / page.height);
  const drawAt = (zoom: number, panX: number, panY: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
    renderPage(ctx, page, { pxScale: zoom, getImage: (id, px) => images.get(id, px), getAsset, placeholders: true });
    flush(canvas);
  };
  const px0 = (VW - page.width * fit) / 2,
    py0 = (VH - page.height * fit) / 2;
  t = now();
  drawAt(fit, px0, py0);
  const coldMs = now() - t;
  const pans: number[] = [];
  for (let i = 0; i < 8; i++) {
    t = now();
    drawAt(fit, px0 + i * 7, py0 + i * 3);
    pans.push(now() - t);
  }
  // a wheel zoom: 12 steps of 8% around the centre
  const zooms: number[] = [];
  let z = fit;
  for (let i = 0; i < 12; i++) {
    z *= 1.08;
    t = now();
    drawAt(z, VW / 2 - (page.width * z) / 2, VH / 2 - (page.height * z) / 2);
    zooms.push(now() - t);
  }
  // zooming back out reuses what was drawn on the way in (or should)
  const back: number[] = [];
  for (let i = 0; i < 12; i++) {
    z /= 1.08;
    t = now();
    drawAt(z, VW / 2 - (page.width * z) / 2, VH / 2 - (page.height * z) / 2);
    back.push(now() - t);
  }
  // hit testing: what the pointer finds under 300 positions (the editor's hover / click path)
  t = now();
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    const p = { x: ((i * 97) % 1920) + 0.5, y: ((i * 53) % 1080) + 0.5 };
    for (let k = page.objects.length - 1; k >= 0; k--) {
      const o = page.objects[k];
      if (hitObject(o, p, o.type === 'image' ? getAsset(o.assetId) : undefined, 1)) {
        hits++;
        break;
      }
    }
  }
  const hitMs = (now() - t) / 300;
  // export at 1× (1920×1080)
  t = now();
  const ex = await renderPageCanvas(page, getAsset, 1);
  flush(ex);
  const exportMs = now() - t;
  const warped = page.objects.filter((o) => o.type === 'image' && (o as ImageObject).warp).length;
  return { alg, n, layoutMs, coldMs, panMs: median(pans), zoomMs: median(zooms), zoomMaxMs: Math.max(...zooms), zoomBackMs: median(back), hitMs, exportMs, warped, hits, history: useDoc.getState().past.length };
}

(async () => {
  const rows: Awaited<ReturnType<typeof bench>>[] = [];
  for (const alg of ALGS) for (const n of COUNTS) rows.push(await bench(alg, n));
  const f = (v: number) => v.toFixed(v < 10 ? 2 : 0).padStart(8);
  const head = 'layout        n   layout     cold      pan  zoom(med) zoom(max) zoomBack   hit/pt   export';
  const lines = rows.map((r) => `${r.alg.padEnd(12)}${String(r.n).padStart(5)}${f(r.layoutMs)} ${f(r.coldMs)} ${f(r.panMs)} ${f(r.zoomMs)}  ${f(r.zoomMaxMs)} ${f(r.zoomBackMs)} ${f(r.hitMs)} ${f(r.exportMs)}`);
  const text = [head, ...lines].join('\n');
  document.getElementById('out')!.textContent = text;
  (window as unknown as { benchResult: unknown }).benchResult = { rows, text };
})().catch((e) => {
  document.getElementById('out')!.textContent = 'failed: ' + (e?.stack ?? e);
  (window as unknown as { benchResult: unknown }).benchResult = { error: String(e?.stack ?? e) };
});
