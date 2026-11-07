// What actually sits behind a text: the page rendered without that text and without anything painted
// above it (background, imported image, panels, icons below), sampled over the text's box. Small and
// cheap (at most 96 px wide), so it can run whenever a text is selected or a background changes.

import type { Page } from '../core/types';
import { images } from './images';
import { renderPage } from './renderer';

export interface Behind {
  /** Average colour of the area. */
  avg: string;
  /** Darkest and lightest tones (10th / 90th percentile), for busy images and gradients. */
  dark: string;
  light: string;
  /** 0 (flat) … 1 (very busy): spread of luminance in the area. */
  busy: number;
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function sampleBehind(page: Page, objectId: string, getAsset: Parameters<typeof renderPage>[2]['getAsset']): Behind | null {
  const i = page.objects.findIndex((o) => o.id === objectId);
  if (i < 0 || typeof OffscreenCanvas === 'undefined') return null;
  const o = page.objects[i];
  const below = { ...page, objects: page.objects.slice(0, i).filter((x) => !x.hidden) };
  const k = Math.min(1, 96 / Math.max(1, o.w));
  const W = Math.max(4, Math.round(o.w * k)),
    H = Math.max(4, Math.round(o.h * k));
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  // the text's box (rotation ignored: a sample of the area is enough)
  ctx.setTransform(k, 0, 0, k, -(o.x - o.w / 2) * k, -(o.y - o.h / 2) * k);
  // transparent pages are judged against the checkerboard grey they are previewed on
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, page.width, page.height);
  renderPage(ctx, below, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
  const d = ctx.getImageData(0, 0, W, H).data;
  if (!d.length) return null;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  const ls: { l: number; p: number }[] = [];
  for (let p = 0; p < d.length; p += 4) {
    r += d[p];
    g += d[p + 1];
    b += d[p + 2];
    n++;
    ls.push({ l: lum(d[p], d[p + 1], d[p + 2]), p });
  }
  if (!n) return null;
  ls.sort((a, z) => a.l - z.l);
  const at = (q: number) => ls[Math.min(ls.length - 1, Math.floor(q * ls.length))].p;
  const px = (p: number) => hex(d[p], d[p + 1], d[p + 2]);
  const lo = at(0.1),
    hi = at(0.9);
  return { avg: hex(r / n, g / n, b / n), dark: px(lo), light: px(hi), busy: Math.max(0, ls[Math.floor(ls.length * 0.9) - 1]?.l - ls[Math.floor(ls.length * 0.1)]?.l || 0) };
}
