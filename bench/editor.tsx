// Editor benchmark: the real <Editor/> canvas at 1600×900, timed frame by frame.
// Every animation-frame callback is timed (that is where the editor draws), while the benchmark
// applies a layout, pans, zooms with the wheel and moves the pointer over a full selection.
import { createRoot } from 'react-dom/client';
import { createPage, createProject } from '../src/core/defaults';
import { getPage, loadDoc } from '../src/state/doc';
import { applyLayout } from '../src/state/layoutActions';
import { newImageObject } from '../src/state/objects';
import { fitView } from '../src/state/ui';
import { Editor } from '../src/ui/canvas/Editor';
import { makeIcons } from './icons';

const q = new URLSearchParams(location.search);
const COUNTS = (q.get('n') ?? '20,180,1000,2267').split(',').map(Number);
const ALGS = (q.get('alg') ?? 'floor,groundplane').split(',');

// time every rAF callback
let frames: { start: number; ms: number }[] = [];
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) =>
  raf((t) => {
    const s = performance.now();
    cb(t);
    frames.push({ start: s, ms: performance.now() - s });
  });
const nextFrame = () => new Promise<void>((r) => raf(() => raf(() => r())));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wait until no frame has run for `quiet` ms. */
async function idle(quiet = 400, max = 60_000) {
  const t0 = performance.now();
  for (;;) {
    await sleep(50);
    const end = frames.length ? frames.at(-1)!.start + frames.at(-1)!.ms : t0;
    if (performance.now() - end > quiet || performance.now() - t0 > max) return;
  }
}
const med = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);

const host = document.getElementById('host')!;
createRoot(host).render(<Editor />);

async function bench(alg: string, n: number) {
  const assets = await makeIcons(n);
  const d = createProject('bench');
  const page0 = createPage('p', 1920, 1080);
  d.assets = assets;
  loadDoc({ ...d, pages: [page0], activePageId: page0.id });
  const objs = assets.map((a) => newImageObject(a.id, { x: 960, y: 540 }, page0, 0.05));
  loadDoc({ ...d, pages: [{ ...page0, objects: objs }], activePageId: page0.id });
  fitView(1920, 1080);
  await idle();
  const el = host.querySelector('.editor') as HTMLElement;

  // apply the layout: how long until the first frame shows it, and until every icon is final
  frames = [];
  const t0 = performance.now();
  applyLayout(alg, objs.map((o) => o.id));
  const actionMs = performance.now() - t0;
  await idle();
  const applyFirst = frames.length ? frames[0].start + frames[0].ms - t0 : 0;
  const applyDone = frames.length ? frames.at(-1)!.start + frames.at(-1)!.ms - t0 : 0;
  const applyMaxFrame = Math.max(0, ...frames.map((f) => f.ms));
  const applyFrames = frames.length;

  const wheel = (o: WheelEventInit) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 800, clientY: 450, ...o }));
  // pan: shift + wheel, one step per frame
  frames = [];
  for (let i = 0; i < 30; i++) {
    wheel({ deltaY: i % 2 ? 40 : -40, shiftKey: true });
    await nextFrame();
  }
  const pan = med(frames.map((f) => f.ms));
  await idle();
  // zoom in with the wheel, one notch per frame, then the sharp frame when it stops
  frames = [];
  for (let i = 0; i < 16; i++) {
    wheel({ deltaY: -100 });
    await nextFrame();
  }
  const zoomFrames = frames.map((f) => f.ms);
  frames = [];
  await idle();
  const settleIn = frames.reduce((a, f) => a + f.ms, 0);
  const settleInMax = Math.max(0, ...frames.map((f) => f.ms));
  // and out again
  frames = [];
  for (let i = 0; i < 16; i++) {
    wheel({ deltaY: 100 });
    await nextFrame();
  }
  const zoomOutFrames = frames.map((f) => f.ms);
  frames = [];
  await idle();
  const settleOut = frames.reduce((a, f) => a + f.ms, 0);
  const settleOutMax = Math.max(0, ...frames.map((f) => f.ms));
  // the pointer moving over the whole selection (hover highlight, overlays)
  fitView(1920, 1080);
  await idle();
  frames = [];
  for (let i = 0; i < 30; i++) {
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 200 + i * 40, clientY: 300 + (i % 5) * 60, pointerId: 1 }));
    await nextFrame();
  }
  const hover = med(frames.map((f) => f.ms));
  return { alg, n, actionMs, applyFirst, applyDone, applyMaxFrame, applyFrames, pan, zoom: med(zoomFrames), zoomMax: Math.max(...zoomFrames), settleIn, settleInMax, zoomOut: med(zoomOutFrames), zoomOutMax: Math.max(...zoomOutFrames), settleOut, settleOutMax, hover, objects: getPage().objects.length };
}

(async () => {
  await nextFrame();
  const rows: Awaited<ReturnType<typeof bench>>[] = [];
  for (const alg of ALGS) for (const n of COUNTS) rows.push(await bench(alg, n));
  const f = (v: number) => v.toFixed(v < 10 ? 1 : 0).padStart(7);
  const head = 'layout        n  action 1stFrame allFinal maxFrame    pan zoomIn  (max) settle  (max) zoomOut (max) settle  (max)  hover';
  const lines = rows.map((r) => `${r.alg.padEnd(12)}${String(r.n).padStart(5)}${f(r.actionMs)} ${f(r.applyFirst)} ${f(r.applyDone)} ${f(r.applyMaxFrame)}${f(r.pan)}${f(r.zoom)}${f(r.zoomMax)}${f(r.settleIn)}${f(r.settleInMax)}${f(r.zoomOut)}${f(r.zoomOutMax)}${f(r.settleOut)}${f(r.settleOutMax)}${f(r.hover)}`);
  const text = [head, ...lines].join('\n');
  document.getElementById('out')!.textContent = text;
  (window as unknown as { benchResult: unknown }).benchResult = { rows, text };
})().catch((e) => ((window as unknown as { benchResult: unknown }).benchResult = { error: String(e?.stack ?? e) }));
