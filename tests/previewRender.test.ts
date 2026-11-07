// Review / Export previews: a view must only ever show the page it was asked for, at that page's
// proportions, however quickly pages are switched (regression: a 1920×1080 page showed the
// previous 630×500 page stretched until its own render finished).
import './helpers/canvasStub';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPage, createProject } from '../src/core/defaults';
import type { Page } from '../src/core/types';
import { loadDoc } from '../src/state/doc';
import { cachedPreview, clearPreviews, drawPreview, previewScale, requestPreview, type PreviewRender } from '../src/ui/components/previewRender';

const itch = () => createPage('itch.io cover', 630, 500);
const hd = () => createPage('YouTube', 1920, 1080);

function project(...pages: Page[]) {
  const d = createProject('p');
  loadDoc({ ...d, pages, activePageId: pages[0].id });
}

/** A drawing context that records drawImage calls. */
function recorder() {
  const calls: number[][] = [];
  return {
    calls,
    ctx: {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      drawImage: (...a: unknown[]) => void calls.push(a.slice(1) as number[]),
    } as unknown as CanvasRenderingContext2D,
  };
}

beforeEach(() => clearPreviews());

describe('preview renders', () => {
  it('render each page at its own size, whatever was rendered before', async () => {
    const a = itch(),
      b = hd();
    project(a, b);
    for (let i = 0; i < 6; i++) {
      const p = i % 2 ? b : a;
      const scale = 0.37 + (i % 3) * 0.1;
      const r = await requestPreview(p, scale).promise;
      expect(r.page).toBe(p);
      expect(r.canvas.width).toBe(Math.round(p.width * r.scale));
      expect(r.canvas.height).toBe(Math.round(p.height * r.scale));
      // the bitmap has the page's proportions
      expect(r.canvas.width / r.canvas.height).toBeCloseTo(p.width / p.height, 1);
    }
  });

  it('never reuses a render of another page, even one of the same size', async () => {
    const a = hd(),
      b = hd();
    project(a, b);
    await requestPreview(a, 0.5).promise;
    expect(cachedPreview(a, 0.5, {})).not.toBeNull();
    expect(cachedPreview(b, 0.5, {})).toBeNull();
    const rb = await requestPreview(b, 0.5).promise;
    expect(rb.page).toBe(b);
  });

  it('an edited page is a new render; the old one is not served for it', async () => {
    const a = itch();
    project(a);
    await requestPreview(a, 0.5).promise;
    const edited = { ...a, objects: [] };
    expect(cachedPreview(edited, 0.5, {})).toBeNull();
  });

  it('small views reuse a larger render of the same page (thumbnails render once)', async () => {
    const a = hd();
    project(a);
    const big = await requestPreview(a, 0.5).promise;
    for (const s of [0.4, 0.25, 0.13]) expect((await requestPreview(a, s).promise).canvas).toBe(big.canvas);
    // 100% asks for exactly 1:1 and gets a render of its own
    const exact = await requestPreview(a, 1, {}, true).promise;
    expect(exact.scale).toBe(1);
    expect(exact.canvas).not.toBe(big.canvas);
  });

  it('a watermark or transparency is a different render', async () => {
    const a = itch();
    project(a);
    const plain = await requestPreview(a, 0.5).promise;
    const wm = { watermark: { layers: [], pages: 'all' } as never, vars: {} };
    expect((await requestPreview(a, 0.5, { wm }).promise).canvas).not.toBe(plain.canvas);
    expect((await requestPreview(a, 0.5, { transparent: true }).promise).canvas).not.toBe(plain.canvas);
  });

  it('a render nobody waits for any more is cancelled; one still wanted is not', async () => {
    const a = itch(),
      b = hd();
    project(a, b);
    // switch quickly: A requested, then left for B before it finished
    const ra = requestPreview(a, 0.5);
    ra.release();
    await expect(ra.promise).rejects.toThrow('cancelled');
    const rb1 = requestPreview(b, 0.5);
    const rb2 = requestPreview(b, 0.5);
    rb1.release();
    const r = await rb2.promise;
    expect(r.page).toBe(b);
  });

  it('draws the whole page area into the whole view (no stretch, no offset)', () => {
    const page = hd();
    const r: PreviewRender = { page, canvas: new OffscreenCanvas(960, 540), scale: 0.5 };
    const { ctx, calls } = recorder();
    drawPreview(ctx, r, 0, 0, 1920, 1080, 800, 450);
    expect(calls).toEqual([[0, 0, 960, 540, 0, 0, 800, 450]]);
    // 1:1 is not smoothed (100% shows the real pixels)
    const one: PreviewRender = { page, canvas: new OffscreenCanvas(1920, 1080), scale: 1 };
    drawPreview(ctx, one, 0, 0, 1920, 1080, 1920, 1080);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it('crops take the centred area of the page they belong to', () => {
    const page = itch();
    const r: PreviewRender = { page, canvas: new OffscreenCanvas(630, 500), scale: 1 };
    const { ctx, calls } = recorder();
    // square crop of a 630×500 page: 500×500 from x = 65
    drawPreview(ctx, r, 65, 0, 500, 500, 200, 200);
    const last = calls.at(-1)!;
    expect(last.slice(4)).toEqual([0, 0, 200, 200]);
    // halved in steps to stay sharp; the final source keeps the square shape
    expect(last[2] / last[3]).toBeCloseTo(1, 5);
  });

  it('rounds tiny scale differences so resizing the window shares renders', () => {
    expect(previewScale(0.33333)).toBe(previewScale(0.33349));
    expect(previewScale(10)).toBe(4);
  });
});
