// Alpha-channel analysis: visible bounding box, occupancy, centroid and a coarse coverage mask.
// Pure function over RGBA bytes so it runs in a worker and in tests.

import type { AlphaInfo } from './types';

/** Bump when the analysis changes so cached results are recomputed. */
export const ALPHA_VERSION = 2;

/**
 * Visible bounds that ignore faint haze and isolated specks: only clearly visible pixels count, and a
 * run of rows/columns at an edge that is cut off from the rest by an empty gap is dropped when it
 * holds under 1.5% of the visible pixels. Without this, one stray pixel in a corner made an icon's
 * "visible box" the whole image, so layouts drew it tiny in a big empty spot.
 */
function trimmedRange(counts: Uint32Array, total: number): [number, number] {
  let lo = 0,
    hi = counts.length - 1;
  while (lo <= hi && !counts[lo]) lo++;
  while (hi >= lo && !counts[hi]) hi--;
  const limit = total * 0.015;
  for (let guard = 0; guard < 8 && lo < hi; guard++) {
    let changed = false;
    // leading segment
    let i = lo,
      mass = 0;
    while (i <= hi && counts[i]) mass += counts[i++];
    if (i <= hi && mass < limit) {
      while (i <= hi && !counts[i]) i++;
      lo = i;
      changed = true;
    }
    // trailing segment
    let j = hi;
    mass = 0;
    while (j >= lo && counts[j]) mass += counts[j--];
    if (j >= lo && mass < limit) {
      while (j >= lo && !counts[j]) j--;
      hi = j;
      changed = true;
    }
    if (!changed) break;
  }
  return [lo, hi];
}

export function analyzeAlpha(data: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 8): AlphaInfo {
  let visible = 0;
  let hasAlpha = false;
  let sx = 0,
    sy = 0;
  // "solid" pixels decide the bounds; faint ones (soft glows, haze) still count as visible
  const solid = Math.max(threshold, 28);
  const rows = new Uint32Array(h),
    cols = new Uint32Array(w);
  let solidN = 0;
  for (let y = 0; y < h; y++) {
    let row = y * w * 4 + 3;
    for (let x = 0; x < w; x++, row += 4) {
      const a = data[row];
      if (a < 255) hasAlpha = true;
      if (a > threshold) {
        visible++;
        sx += x;
        sy += y;
        if (a > solid) {
          rows[y]++;
          cols[x]++;
          solidN++;
        }
      }
    }
  }
  if (!visible || !solidN) {
    return { bounds: { x: 0, y: 0, w, h }, occupancy: visible / (w * h), fill: 0, hasAlpha, empty: !visible, centroid: { x: w / 2, y: h / 2 }, v: ALPHA_VERSION };
  }
  const [y0, y1] = trimmedRange(rows, solidN);
  const [x0, x1] = trimmedRange(cols, solidN);
  const bw = x1 - x0 + 1,
    bh = y1 - y0 + 1;
  // 16×16 coverage grid of the bounding box
  const G = 16;
  const cells = new Uint32Array(G * G);
  const totals = new Uint32Array(G * G);
  for (let y = y0; y <= y1; y++) {
    const gy = Math.min(G - 1, Math.floor(((y - y0) / bh) * G));
    for (let x = x0; x <= x1; x++) {
      const gx = Math.min(G - 1, Math.floor(((x - x0) / bw) * G));
      const k = gy * G + gx;
      totals[k]++;
      if (data[(y * w + x) * 4 + 3] > threshold) cells[k]++;
    }
  }
  const mask = new Uint8Array(G * G);
  for (let i = 0; i < G * G; i++) mask[i] = totals[i] ? Math.round((cells[i] / totals[i]) * 255) : 0;
  return {
    bounds: { x: x0, y: y0, w: bw, h: bh },
    occupancy: visible / (w * h),
    fill: visible / (bw * bh),
    hasAlpha,
    empty: false,
    centroid: { x: sx / visible + 0.5, y: sy / visible + 0.5 },
    mask: toBase64(mask),
    v: ALPHA_VERSION,
  };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Scale analysis computed on a downscaled copy back to source pixel units. */
export function scaleAlpha(a: AlphaInfo, k: number, fullW: number, fullH: number): AlphaInfo {
  if (k === 1) return a;
  const x = Math.max(0, Math.floor(a.bounds.x * k));
  const y = Math.max(0, Math.floor(a.bounds.y * k));
  const x2 = Math.min(fullW, Math.ceil((a.bounds.x + a.bounds.w) * k));
  const y2 = Math.min(fullH, Math.ceil((a.bounds.y + a.bounds.h) * k));
  return { ...a, bounds: { x, y, w: x2 - x, h: y2 - y }, centroid: { x: a.centroid.x * k, y: a.centroid.y * k } };
}
