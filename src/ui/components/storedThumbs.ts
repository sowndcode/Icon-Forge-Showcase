// Thumbnails of assets read straight from storage — for libraries that are not open (another
// project's assets in "Add assets from a project"), or for long pickers where only the visible
// tiles should cost anything.
//
// Each thumbnail is decoded from the original file at its tile size (never shown full size), a few
// at a time, newest requests first (the tiles scrolled to most recently). Results are kept in a
// bounded cache; the object URLs are owned by the cache, so a tile unmounting never revokes an
// image another tile still shows. Reading never changes the source project.

import { images } from '../../render/images';
import { assetBlob } from '../../state/project';

export type ThumbState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'missing' } | { status: 'error' };

const SIZE = 192;
const KEEP = 900;
const PARALLEL = 6;

const done = new Map<string, ThumbState>();
const waiting: string[] = [];
const listeners = new Map<string, Set<(s: ThumbState) => void>>();
let running = 0;

function settle(id: string, s: ThumbState) {
  done.delete(id);
  done.set(id, s);
  if (done.size > KEEP) {
    for (const [k, v] of done) {
      if (done.size <= KEEP) break;
      // keep what is on screen
      if (listeners.get(k)?.size) continue;
      if (v.status === 'ready') URL.revokeObjectURL(v.url);
      done.delete(k);
    }
  }
  for (const fn of listeners.get(id) ?? []) fn(s);
}

async function decode(blob: Blob, w?: number, h?: number): Promise<Blob> {
  const side = Math.round(SIZE * Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1)));
  let bmp: ImageBitmap | null = null;
  try {
    // decode at tile size where the browser can (PNG, JPG, WebP, GIF, BMP, AVIF)
    bmp = w && h ? await createImageBitmap(blob, w >= h ? { resizeWidth: Math.min(side, w), resizeQuality: 'high' } : { resizeHeight: Math.min(side, h), resizeQuality: 'high' }) : await createImageBitmap(blob);
  } catch {
    bmp = null;
  }
  let src: CanvasImageSource;
  let sw: number, sh: number;
  if (bmp) {
    src = bmp;
    sw = bmp.width;
    sh = bmp.height;
  } else {
    // SVG and anything createImageBitmap refuses: let an <img> decode it (still no script: an
    // SVG shown through <img> never runs code)
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      src = img;
      sw = img.naturalWidth || w || SIZE;
      sh = img.naturalHeight || h || SIZE;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const k = Math.min(1, side / Math.max(sw, sh, 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  bmp?.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
}

const sizes = new Map<string, [number, number]>();

function pump() {
  while (running < PARALLEL && waiting.length) {
    // most recent request first: the tiles the user just scrolled to
    const id = waiting.pop()!;
    if (!listeners.get(id)?.size) continue;
    running++;
    void (async () => {
      try {
        const blob = await assetBlob(id);
        if (!blob) return settle(id, { status: 'missing' });
        const [w, h] = sizes.get(id) ?? [0, 0];
        const t = await decode(blob, w, h);
        settle(id, { status: 'ready', url: URL.createObjectURL(t) });
      } catch {
        settle(id, { status: 'error' });
      } finally {
        running--;
        pump();
      }
    })();
  }
}

/** Current state of an asset's thumbnail (without requesting it). */
export function thumbState(id: string): ThumbState {
  const own = images.thumbs.get(id);
  if (own) return { status: 'ready', url: own };
  return done.get(id) ?? { status: 'loading' };
}

/**
 * Watch an asset's thumbnail; it is loaded if needed. `w`/`h` (the asset's size) let it decode
 * straight at tile size. Returns the unsubscribe function.
 */
export function watchThumb(id: string, w: number | undefined, h: number | undefined, fn: (s: ThumbState) => void): () => void {
  let set = listeners.get(id);
  if (!set) listeners.set(id, (set = new Set()));
  set.add(fn);
  const now = thumbState(id);
  if (now.status !== 'loading') fn(now);
  else {
    if (w && h) sizes.set(id, [w, h]);
    const i = waiting.indexOf(id);
    if (i >= 0) waiting.splice(i, 1);
    waiting.push(id);
    pump();
  }
  return () => {
    set!.delete(fn);
    if (!set!.size) listeners.delete(id);
  };
}

/** Forget cached thumbnails (e.g. after the source project changed). */
export function clearStoredThumbs() {
  for (const v of done.values()) if (v.status === 'ready') URL.revokeObjectURL(v.url);
  done.clear();
  waiting.length = 0;
}
