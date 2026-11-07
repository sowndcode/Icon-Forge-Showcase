// Alignment, distribution and visual-size normalisation. All functions are pure and return
// per-object patches. `visible` = use alpha bounds (preferred for transparent assets).

import type { Rect, SceneObject } from './types';
import { objectAABB, scaleAbout, visibleAABB, visibleCenter, type AssetLookup } from './transform';

export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type Patches = Map<string, Partial<SceneObject>>;

function boxOf(o: SceneObject, getAsset: AssetLookup, visible: boolean): Rect {
  return visible ? visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined) : objectAABB(o);
}

/** Align objects to each other (or to `target`, e.g. the canvas, when given or when only one object). */
export function align(objs: SceneObject[], op: AlignOp, getAsset: AssetLookup, visible: boolean, target?: Rect): Patches {
  const out: Patches = new Map();
  if (!objs.length) return out;
  const boxes = objs.map((o) => boxOf(o, getAsset, visible));
  const ref =
    target ??
    boxes.reduce((acc, b) => {
      const x0 = Math.min(acc.x, b.x),
        y0 = Math.min(acc.y, b.y);
      return { x: x0, y: y0, w: Math.max(acc.x + acc.w, b.x + b.w) - x0, h: Math.max(acc.y + acc.h, b.y + b.h) - y0 };
    });
  objs.forEach((o, i) => {
    const b = boxes[i];
    let dx = 0,
      dy = 0;
    switch (op) {
      case 'left':
        dx = ref.x - b.x;
        break;
      case 'right':
        dx = ref.x + ref.w - (b.x + b.w);
        break;
      case 'hcenter':
        dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
        break;
      case 'top':
        dy = ref.y - b.y;
        break;
      case 'bottom':
        dy = ref.y + ref.h - (b.y + b.h);
        break;
      case 'vcenter':
        dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
        break;
    }
    if (dx || dy) out.set(o.id, { x: o.x + dx, y: o.y + dy });
  });
  return out;
}

/** Distribute centers evenly between the outermost objects. */
export function distributeCenters(objs: SceneObject[], axis: 'x' | 'y', getAsset: AssetLookup, visible: boolean): Patches {
  const out: Patches = new Map();
  if (objs.length < 3) return out;
  const items = objs
    .map((o) => {
      const c = visible ? visibleCenter(o, o.type === 'image' ? getAsset(o.assetId) : undefined) : { x: o.x, y: o.y };
      return { o, c: axis === 'x' ? c.x : c.y };
    })
    .sort((a, b) => a.c - b.c);
  const first = items[0].c,
    last = items[items.length - 1].c;
  const step = (last - first) / (items.length - 1);
  items.forEach((it, i) => {
    const d = first + step * i - it.c;
    if (Math.abs(d) > 1e-6) out.set(it.o.id, axis === 'x' ? { x: it.o.x + d } : { y: it.o.y + d });
  });
  return out;
}

/** Equal gaps between visible edges (sorted along the axis). `gap` forces a specific gap. */
export function equalGaps(objs: SceneObject[], axis: 'x' | 'y', getAsset: AssetLookup, visible: boolean, gap?: number): Patches {
  const out: Patches = new Map();
  if (objs.length < 2) return out;
  const items = objs.map((o) => ({ o, b: boxOf(o, getAsset, visible) })).sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const size = (b: Rect) => (axis === 'x' ? b.w : b.h);
  const start = axis === 'x' ? items[0].b.x : items[0].b.y;
  const end = axis === 'x' ? items[items.length - 1].b.x + items[items.length - 1].b.w : items[items.length - 1].b.y + items[items.length - 1].b.h;
  const total = items.reduce((a, it) => a + size(it.b), 0);
  const g = gap ?? (end - start - total) / (items.length - 1);
  let cur = start;
  for (const it of items) {
    const pos = axis === 'x' ? it.b.x : it.b.y;
    const d = cur - pos;
    if (Math.abs(d) > 1e-6) out.set(it.o.id, axis === 'x' ? { x: it.o.x + d } : { y: it.o.y + d });
    cur += size(it.b) + g;
  }
  return out;
}

/** Move the selection as a whole so its bounds are centered on the page. */
export function centerOnCanvas(objs: SceneObject[], page: { width: number; height: number }, getAsset: AssetLookup, visible: boolean, axes: 'both' | 'x' | 'y'): Patches {
  const out: Patches = new Map();
  if (!objs.length) return out;
  const boxes = objs.map((o) => boxOf(o, getAsset, visible));
  const x0 = Math.min(...boxes.map((b) => b.x)),
    y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)),
    y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const dx = axes === 'y' ? 0 : page.width / 2 - (x0 + x1) / 2;
  const dy = axes === 'x' ? 0 : page.height / 2 - (y0 + y1) / 2;
  for (const o of objs) out.set(o.id, { x: o.x + dx, y: o.y + dy });
  return out;
}

export type NormalizeMode = 'largest' | 'smallest' | 'median' | 'reference' | 'occupancy';
export type SizeMetric = 'area' | 'longest';

/**
 * Normalise the visual size of image objects using their visible alpha bounds.
 *  - largest / smallest / median: match that object's visible size
 *  - reference: match `refId`
 *  - occupancy: visible content occupies `occupancy` of a common box (the median full box)
 * Objects are scaled about their visible center so they stay in place.
 */
export function normalizeVisualSize(
  objs: SceneObject[],
  getAsset: AssetLookup,
  mode: NormalizeMode,
  opts: { refId?: string; occupancy?: number; metric?: SizeMetric } = {},
): Patches {
  const out: Patches = new Map();
  const imgs = objs.filter((o) => o.type === 'image');
  if (!imgs.length) return out;
  const metric = opts.metric ?? 'area';
  const measure = (o: SceneObject) => {
    const a = o.type === 'image' ? getAsset(o.assetId) : undefined;
    const vb = a?.alpha && !a.alpha.empty ? a.alpha.bounds : { w: a?.width ?? o.w, h: a?.height ?? o.h };
    const sx = o.w / (a?.width || o.w),
      sy = o.h / (a?.height || o.h);
    const w = vb.w * sx,
      h = vb.h * sy;
    return metric === 'area' ? Math.sqrt(w * h) : Math.max(w, h);
  };
  const sizes = imgs.map(measure);
  let target: number;
  const sorted = sizes.slice().sort((a, b) => a - b);
  switch (mode) {
    case 'largest':
      target = sorted[sorted.length - 1];
      break;
    case 'smallest':
      target = sorted[0];
      break;
    case 'reference': {
      const ref = imgs.find((o) => o.id === opts.refId);
      target = ref ? measure(ref) : sorted[Math.floor(sorted.length / 2)];
      break;
    }
    case 'occupancy': {
      const fulls = imgs.map((o) => Math.max(o.w, o.h)).sort((a, b) => a - b);
      const box = fulls[Math.floor(fulls.length / 2)];
      target = box * (opts.occupancy ?? 0.8);
      break;
    }
    default:
      target = sorted[Math.floor(sorted.length / 2)];
  }
  imgs.forEach((o, i) => {
    if (mode === 'reference' && o.id === opts.refId) return;
    const k = target / Math.max(1e-6, sizes[i]);
    if (Math.abs(k - 1) < 1e-3) return;
    const c = visibleCenter(o, o.type === 'image' ? getAsset(o.assetId) : undefined);
    out.set(o.id, scaleAbout(o, c, k));
  });
  return out;
}
