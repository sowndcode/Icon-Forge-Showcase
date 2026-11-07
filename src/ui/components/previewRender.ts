// Shared preview renders for Review, Export and Watermark.
//
// A preview is always rendered from the page it is asked for, at the scale it is asked for (or a
// larger one that is downsampled), so a view can never show one page's bitmap inside another page's
// frame. Requests for the same page, variant and scale share one render; several views of one page
// (Review's thumbnails and crops) reuse the largest finished render instead of rendering again.
// A render nobody waits for any more is cancelled between objects, so flipping quickly through
// pages never queues full renders of pages already left behind.

import type { Page } from '../../core/types';
import type { WatermarkRender } from '../../render/renderer';
import { images } from '../../render/images';
import { RenderCancelled, renderPageCanvas, withoutBackground } from '../../services/exporter';
import { getAsset } from '../../state/doc';

export type Bitmap = OffscreenCanvas | HTMLCanvasElement;

export interface PreviewVariant {
  /** The watermark drawn over the page (as exported), if any. */
  wm?: WatermarkRender;
  /** Background left out (transparent export). */
  transparent?: boolean;
  /** Colour under transparent areas (JPG export). */
  matte?: string;
}

export interface PreviewRender {
  /** The page this bitmap shows (its identity: a new object after every edit). */
  page: Page;
  canvas: Bitmap;
  /** Device pixels per page pixel of `canvas`. */
  scale: number;
}

interface Entry extends PreviewRender {
  variant: PreviewVariant;
  imgVersion: number;
}

interface Job {
  page: Page;
  variant: PreviewVariant;
  scale: number;
  imgVersion: number;
  promise: Promise<PreviewRender>;
  signal: { cancelled: boolean };
  waiters: number;
}

const MAX_SCALE = 4;
/** A finished render this many times larger than needed is still used (downsampled) for small views. */
const REUSE_RATIO = 4;
const KEEP = 8;

const done: Entry[] = [];
const jobs: Job[] = [];

const sameVariant = (a: PreviewVariant, b: PreviewVariant) => a.wm === b.wm && !!a.transparent === !!b.transparent && (a.matte ?? '') === (b.matte ?? '');

/** Device pixels per page pixel, kept in a sane range and rounded so tiny resizes share a render. */
export function previewScale(scale: number) {
  return Math.max(0.02, Math.min(MAX_SCALE, Math.round(scale * 1000) / 1000));
}

/** A finished render of `page` usable at `scale` (exact: only one rendered at exactly that scale). */
export function cachedPreview(page: Page, scale: number, variant: PreviewVariant, exact = false): PreviewRender | null {
  const s = previewScale(scale);
  let best: Entry | null = null;
  for (const e of done) {
    if (e.page !== page || !sameVariant(e.variant, variant) || e.imgVersion !== images.version) continue;
    if (exact ? Math.abs(e.scale - s) > 1e-6 : e.scale < s - 1e-6 || e.scale > s * REUSE_RATIO) continue;
    if (!best || e.scale < best.scale) best = e;
  }
  return best;
}

/**
 * Render `page` for a preview. Returns the render and a release function; releasing before the
 * render finishes cancels it if no other view still waits for it.
 */
export function requestPreview(page: Page, scale: number, variant: PreviewVariant = {}, exact = false): { promise: Promise<PreviewRender>; release: () => void } {
  const hit = cachedPreview(page, scale, variant, exact);
  if (hit) return { promise: Promise.resolve(hit), release: () => undefined };
  const s = previewScale(scale);
  const v = images.version;
  let job = jobs.find((j) => j.page === page && sameVariant(j.variant, variant) && j.imgVersion === v && Math.abs(j.scale - s) < 1e-6 && !j.signal.cancelled);
  if (!job) {
    const signal = { cancelled: false };
    const pg = variant.transparent ? withoutBackground(page) : page;
    const created: Job = { page, variant, scale: s, imgVersion: v, signal, waiters: 0, promise: null as unknown as Promise<PreviewRender> };
    created.promise = renderPageCanvas(pg, getAsset, s, variant.matte, undefined, variant.wm, { signal, sliceMs: 12 })
      .then((canvas) => {
        const r: Entry = { page, canvas, scale: s, variant, imgVersion: v };
        done.unshift(r);
        if (done.length > KEEP) done.length = KEEP;
        return r;
      })
      .finally(() => {
        const i = jobs.indexOf(created);
        if (i >= 0) jobs.splice(i, 1);
      });
    // a cancelled render is not an error anyone needs to hear about
    created.promise.catch(() => undefined);
    jobs.push(created);
    job = created;
  }
  const j = job;
  j.waiters++;
  let released = false;
  return {
    promise: j.promise,
    release: () => {
      if (released) return;
      released = true;
      if (--j.waiters <= 0) j.signal.cancelled = true;
    },
  };
}

export const isCancelled = (e: unknown) => e instanceof RenderCancelled;

/**
 * Draw the part of a render that shows the page area `sx, sy, sw, sh` (page pixels) into `ctx` at
 * `dw × dh` device pixels. Large reductions halve in steps so small previews stay sharp rather
 * than aliased; 1:1 draws are not smoothed, so 100% shows the real pixels.
 */
export function drawPreview(ctx: Pick<CanvasRenderingContext2D, 'drawImage' | 'imageSmoothingEnabled' | 'imageSmoothingQuality'>, r: PreviewRender, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number) {
  let src: CanvasImageSource = r.canvas as CanvasImageSource;
  let k = r.scale;
  let x = sx * k,
    y = sy * k,
    w = sw * k,
    h = sh * k;
  // step down by halves until within 2× of the target
  while (w / dw > 2.2 && h / dh > 2.2) {
    const tw = Math.max(1, Math.round(w / 2)),
      th = Math.max(1, Math.round(h / 2));
    const c: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(tw, th) : Object.assign(document.createElement('canvas'), { width: tw, height: th });
    const cx = c.getContext('2d') as CanvasRenderingContext2D;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, x, y, w, h, 0, 0, tw, th);
    src = c;
    x = 0;
    y = 0;
    w = tw;
    h = th;
    k /= 2;
  }
  ctx.imageSmoothingEnabled = Math.abs(w - dw) > 0.5 || Math.abs(h - dh) > 0.5;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, 0, 0, dw, dh);
}

/** Forget every finished render (tests; projects closing). */
export function clearPreviews() {
  done.length = 0;
  for (const j of jobs) j.signal.cancelled = true;
}
