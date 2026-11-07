// Automatic composition warnings (no AI — geometry and simple heuristics only).

import { intersectionArea, rectContains, rectsIntersect } from './geometry';
import { visibleAABB, type AssetLookup } from './transform';
import type { Page, Rect } from './types';

export interface CompositionWarning {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  objectIds: string[];
  /** A one-click fix, when there is an obvious one. */
  fix?: { label: string; run: () => void };
}

/** Layouts that run icons off the page on purpose: their cropping is not a problem. */
export const BLEED_LAYOUTS = new Set(['tiltwall', 'endlessfloor', 'cropframe']);

export function analyzeComposition(page: Page, getAsset: AssetLookup, safe: Rect | null): CompositionWarning[] {
  const out: CompositionWarning[] = [];
  const visible = page.objects.filter((o) => !o.hidden && o.opacity > 0.02);
  if (!visible.length) {
    out.push({ id: 'empty', severity: 'warning', title: 'Empty composition', detail: 'This page has no visible objects.', objectIds: [] });
    return out;
  }
  const W = page.width,
    H = page.height;
  const pageRect = { x: 0, y: 0, w: W, h: H };
  const boxes = visible.map((o) => ({ o, b: visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined) }));
  const bleeding = new Set(page.layouts.filter((l) => BLEED_LAYOUTS.has(l.algorithm)).map((l) => l.id));
  const smallText: string[] = [];
  const outside: string[] = [],
    touching: string[] = [],
    tiny: string[] = [],
    upscaled: string[] = [],
    missing: string[] = [],
    textOut: string[] = [];
  const edge = Math.max(2, Math.min(W, H) * 0.004);
  const minSide = Math.min(W, H) * 0.018;
  for (const { o, b } of boxes) {
    const intentional = !!o.layoutId && bleeding.has(o.layoutId);
    if (o.type === 'text' && o.style.fontSize * Math.min(1, 480 / Math.max(W, H)) < 9 && !o.style.badge?.enabled) smallText.push(o.id);
    // icons a bleeding layout runs off the page are cropped on purpose
    if (!intentional) {
      if (!rectsIntersect(b, pageRect)) outside.push(o.id);
      else if (!rectContains(pageRect, b) || b.x < edge || b.y < edge || b.x + b.w > W - edge || b.y + b.h > H - edge) {
        if (o.type !== 'shape') touching.push(o.id);
      }
    }
    if (o.type === 'image') {
      if (Math.max(b.w, b.h) < minSide) tiny.push(o.id);
      const a = getAsset(o.assetId);
      if (!a || a.status === 'missing' || a.status === 'error') missing.push(o.id);
      else if (a.width && o.w / a.width > 1.6) upscaled.push(o.id);
    }
    if (o.type === 'text' && safe && !rectContains(safe, b, 1)) textOut.push(o.id);
  }
  // overlap / hidden (spatial grid to stay fast with hundreds of objects)
  const cell = Math.max(64, Math.min(W, H) / 12);
  const grid = new Map<string, number[]>();
  boxes.forEach(({ b }, i) => {
    for (let gx = Math.floor(b.x / cell); gx <= Math.floor((b.x + b.w) / cell); gx++)
      for (let gy = Math.floor(b.y / cell); gy <= Math.floor((b.y + b.h) / cell); gy++) {
        const k = gx + ',' + gy;
        const arr = grid.get(k);
        if (arr) arr.push(i);
        else grid.set(k, [i]);
      }
  });
  const extreme = new Set<string>();
  const hidden = new Set<string>();
  const checked = new Set<string>();
  for (const arr of grid.values()) {
    for (let x = 0; x < arr.length; x++)
      for (let y = x + 1; y < arr.length; y++) {
        const i = Math.min(arr[x], arr[y]),
          j = Math.max(arr[x], arr[y]); // j is above i
        const key = i + ':' + j;
        if (checked.has(key)) continue;
        checked.add(key);
        const A = boxes[i],
          B = boxes[j];
        if (A.o.type === 'shape' || B.o.type === 'shape') continue;
        const ov = intersectionArea(A.b, B.b);
        if (!ov) continue;
        const small = Math.min(A.b.w * A.b.h, B.b.w * B.b.h);
        // the lower object is fully covered by an opaque-ish object above it
        const upper = B.o;
        const fill = upper.type === 'image' ? getAsset(upper.assetId)?.alpha?.fill ?? 1 : 0.6;
        if (rectContains(B.b, A.b, 1) && fill > 0.85 && B.o.opacity > 0.9) hidden.add(A.o.id);
        else if (ov / Math.max(1, small) > 0.6 && A.o.type === 'image' && B.o.type === 'image') {
          extreme.add(A.o.id);
          extreme.add(B.o.id);
        }
      }
  }
  const push = (id: string, ids: string[] | Set<string>, severity: CompositionWarning['severity'], title: string, detail: string) => {
    const list = [...ids];
    if (list.length) out.push({ id, severity, title: `${title} (${list.length})`, detail, objectIds: list });
  };
  push('missing', missing, 'error', 'Missing source images', 'These objects reference assets that are missing or failed to load.');
  push('outside', outside, 'warning', 'Objects outside the canvas', 'They will not appear in the export.');
  push('touching', touching, 'info', 'Objects touching the canvas edge', 'Cropped or edge-hugging objects can look accidental.');
  push('hidden', hidden, 'warning', 'Fully hidden objects', 'Completely covered by an object above.');
  push('overlap', extreme, 'info', 'Extreme overlap', 'More than 60% of the smaller object is covered.');
  push('tiny', tiny, 'info', 'Very small objects', 'May be unreadable when the image is shown as a thumbnail.');
  push('upscaled', upscaled, 'warning', 'Low-resolution sources scaled up', 'Scaled beyond 160% of the source pixels — may look blurry.');
  push('textSafe', textOut, 'warning', 'Text outside the safe zone', 'Marketplaces may crop text close to the edges.');
  push('textSmall', smallText, 'info', 'Text too small for a thumbnail', 'Shown 480 px wide, this text is under 9 px tall and hard to read. Make it larger or remove it from small covers.');
  return out;
}
