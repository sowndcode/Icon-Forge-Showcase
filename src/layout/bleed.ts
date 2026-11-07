// Full-bleed layouts: icons run past the canvas edges so only part of the set shows — the busy
// "there is so much in this pack" look of store covers. Tilted Wall, Endless Floor, Cropped Frame.

import { intersects } from '../core/collide';
import { DEG } from '../core/geometry';
import type { Rect } from '../core/types';
import { fitBox, placementCollider } from './common';
import { bool, num, type LayoutAlgorithm, type LayoutContext, type Placement } from './types';

function grow(a: Rect, k: number): Rect {
  return { x: a.x - a.w * k, y: a.y - a.h * k, w: a.w * (1 + 2 * k), h: a.h * (1 + 2 * k) };
}

const hitsKeepOut = (p: Placement, ctx: LayoutContext) => ctx.keepOut.length > 0 && ctx.keepOut.some((k) => intersects(placementCollider(p), k));

// ---------------------------------------------------------------------------
// Tilted Wall
// ---------------------------------------------------------------------------

export const tiltedWallLayout: LayoutAlgorithm = {
  id: 'tiltwall',
  label: 'Tilted Wall',
  description: 'A dense, rotated grid that fills the whole canvas and runs off every edge — only part of the pack shows.',
  group: 'Perspective',
  noCommon: true,
  params: [
    { key: 'angle', label: 'Angle', type: 'range', default: -14, min: -45, max: 45, unit: '°' },
    { key: 'size', label: 'Icon size', type: 'range', default: 1, min: 0.4, max: 2.5, step: 0.01, scale: 100, unit: '%', hint: 'Bigger icons: fewer fit on the canvas, more run off the edges' },
    { key: 'gap', label: 'Spacing', type: 'range', default: 0.18, min: 0, max: 0.8, step: 0.01, scale: 100, unit: '%' },
    { key: 'bleed', label: 'Run off the edges', type: 'range', default: 0.06, min: 0, max: 0.3, step: 0.01, scale: 100, unit: '%' },
    { key: 'turn', label: 'Turn icons with the grid', type: 'bool', default: true },
    { key: 'stagger', label: 'Staggered rows', type: 'bool', default: false },
    { key: 'persp', label: 'Depth', type: 'range', default: 0, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%', hint: 'Icons get bigger toward the bottom, like a floor seen from above' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const E = grow(a, num(p, 'bleed', 0.06));
    const ang = num(p, 'angle', -14) * DEG;
    const u = { x: Math.cos(ang), y: Math.sin(ang) },
      v = { x: -Math.sin(ang), y: Math.cos(ang) };
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    // cell so that n cells cover the (grown) area at size 1
    // cells always cover the whole (grown) area; "smaller" shrinks the icons inside their cells
    const size = num(p, 'size', 1);
    const cell = Math.sqrt((E.w * E.h) / n) * Math.max(1, size);
    const fill = Math.min(1, size) / (1 + num(p, 'gap', 0.18));
    const stagger = bool(p, 'stagger');
    const turn = bool(p, 'turn', true);
    // enough lattice cells to cover the area at any angle (plus spares for keep-out holes)
    const R = Math.ceil(Math.hypot(E.w, E.h) / 2 / cell) + 2;
    const cells: { x: number; y: number; d: number }[] = [];
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        const gi = i + (stagger && j % 2 ? 0.5 : 0);
        const x = cx + (gi * u.x + j * v.x) * cell,
          y = cy + (gi * u.y + j * v.y) * cell;
        // fill outward from the center in a canvas-shaped (not round) order
        cells.push({ x, y, d: Math.max(Math.abs(x - cx) / E.w, Math.abs(y - cy) / E.h) + Math.hypot(x - cx, y - cy) * 1e-6 });
      }
    cells.sort((q, r) => q.d - r.d);
    const out: Placement[] = [];
    let k = 0;
    for (const c of cells) {
      if (k >= n) break;
      const it = items[k];
      // depth: smaller toward the top, bigger toward the bottom (spacing stays, so keep it under the gap)
      const depth = 1 + num(p, 'persp', 0) * ((c.y - cy) / (E.h / 2));
      const b = fitBox(it, cell * Math.max(0.3, depth), cell * Math.max(0.3, depth), fill / (1 + num(p, 'persp', 0)));
      const pl: Placement = { id: it.id, cx: c.x, cy: c.y, w: b.w, h: b.h, rot: turn ? ang / DEG : 0 };
      if (hitsKeepOut(pl, ctx)) continue;
      out.push(pl);
      k++;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Endless Floor
// ---------------------------------------------------------------------------

export const endlessFloorLayout: LayoutAlgorithm = {
  id: 'endlessfloor',
  label: 'Endless Floor',
  description: 'Rows of icons receding to a horizon and running off the sides and bottom — like a field full of items.',
  group: 'Perspective',
  noCommon: true,
  params: [
    { key: 'horizon', label: 'Horizon height', type: 'range', default: 0.3, min: 0.05, max: 0.7, step: 0.01, scale: 100, unit: '%', hint: 'Where the floor fades into the distance (from the top)' },
    { key: 'far', label: 'Smallest (far) size', type: 'range', default: 0.35, min: 0.12, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'size', label: 'Icon size', type: 'range', default: 1, min: 0.4, max: 2.5, step: 0.01, scale: 100, unit: '%' },
    { key: 'gap', label: 'Spacing', type: 'range', default: 0.15, min: 0, max: 0.8, step: 0.01, scale: 100, unit: '%' },
    { key: 'bleed', label: 'Run off the sides', type: 'range', default: 0.12, min: 0, max: 0.4, step: 0.01, scale: 100, unit: '%' },
    { key: 'tilt', label: 'Tilt', type: 'range', default: 0, min: -25, max: 25, unit: '°' },
    { key: 'stand', label: 'Icons stand on the floor', type: 'bool', default: true, hint: 'Off: icons lie flat (squashed with the floor)' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const bleed = num(p, 'bleed', 0.12);
    const hy = a.y + a.h * num(p, 'horizon', 0.3);
    const bottom = a.y + a.h * 1.04; // the first row starts just below the canvas
    const G = bottom - hy;
    const farScale = num(p, 'far', 0.35);
    const zMax = 1 / farScale;
    const halfW = (a.w * (1 + 2 * bleed)) / 2;
    const cx = a.x + a.w / 2;
    const fill = Math.min(1, num(p, 'size', 1)) / (1 + num(p, 'gap', 0.15));
    // rows for a given near cell size C (px at z = 1); returns the cells
    const build = (C: number) => {
      const cells: { x: number; y: number; z: number; t: number; rowH: number }[] = [];
      const dz = C / G;
      for (let z = 1; z <= zMax; z += dz * z) {
        const t = C / z; // cell width at this depth
        const yTop = hy + G / (z + dz * z),
          yBot = hy + G / z;
        const cols = Math.max(1, Math.floor((halfW * 2) / t));
        const x0 = cx - (cols * t) / 2 + t / 2;
        for (let i = 0; i < cols; i++) cells.push({ x: x0 + i * t, y: (yTop + yBot) / 2, z, t, rowH: yBot - yTop });
        if (cells.length > n * 4) break;
      }
      return cells;
    };
    // largest cell size that still gives every icon a cell
    let lo = 4,
      hi = Math.max(a.w, a.h);
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) / 2;
      if (build(mid).length >= n) lo = mid;
      else hi = mid;
    }
    // the floor always reaches the page edges; "smaller" only shrinks the icons in their cells
    const C = lo * Math.max(1, num(p, 'size', 1));
    const cells = build(C);
    // the visible middle fills first; leftover cells (if any) are the far ends of the rows
    const focusY = a.y + a.h * 0.72;
    cells.sort((q, r) => Math.abs(q.x - cx) / a.w + Math.abs(q.y - focusY) / a.h - (Math.abs(r.x - cx) / a.w + Math.abs(r.y - focusY) / a.h));
    const stand = bool(p, 'stand', true);
    const tilt = num(p, 'tilt', 0) * DEG;
    const cos = Math.cos(tilt),
      sin = Math.sin(tilt);
    const cy = a.y + a.h / 2;
    const out: Placement[] = [];
    let k = 0;
    for (const c of cells) {
      if (k >= n) break;
      const it = items[k];
      // standing icons may rise a little over the row behind (they are drawn in front of it)
      const b = fitBox(it, c.t, stand ? Math.min(c.t, c.rowH * 1.25) : c.t, fill);
      const h = stand ? b.h : Math.min(b.h, c.rowH * fill);
      // standing icons rest on the row's floor line
      const y = stand ? c.y + c.rowH / 2 - h / 2 : c.y;
      const px = cx + (c.x - cx) * cos - (y - cy) * sin,
        py = cy + (c.x - cx) * sin + (y - cy) * cos;
      const pl: Placement = { id: it.id, cx: px, cy: py, w: b.w, h, rot: tilt / DEG, z: 1 / c.z, depth: 1 / c.z };
      if (hitsKeepOut(pl, ctx)) continue;
      out.push(pl);
      k++;
    }
    // icons that found no free cell (keep-out took too many) go far off-canvas behind everything
    for (; k < n; k++) out.push({ id: items[k].id, cx: cx, cy: hy - a.h, w: 1, h: 1, rot: 0, z: -1 });
    return out.map(({ depth: _d, ...rest }) => rest);
  },
};

// ---------------------------------------------------------------------------
// Cropped Frame
// ---------------------------------------------------------------------------

function perimeterPoint(r: Rect, t: number) {
  const per = 2 * (r.w + r.h);
  let d = (((t % 1) + 1) % 1) * per;
  if (d < r.w) return { x: r.x + d, y: r.y };
  d -= r.w;
  if (d < r.h) return { x: r.x + r.w, y: r.y + d };
  d -= r.h;
  if (d < r.w) return { x: r.x + r.w - d, y: r.y + r.h };
  d -= r.w;
  return { x: r.x, y: r.y + r.h - d };
}

export const croppedFrameLayout: LayoutAlgorithm = {
  id: 'cropframe',
  label: 'Cropped Frame',
  description: 'Big icons around the border, partly cut off by the canvas edge, leaving the middle for a large title.',
  group: 'Showcase',
  random: true,
  noCommon: true,
  params: [
    { key: 'size', label: 'Icon size', type: 'range', default: 0.2, min: 0.08, max: 0.45, step: 0.01, scale: 100, unit: '%' },
    { key: 'crop', label: 'Cut off by the edge', type: 'range', default: 0.3, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%' },
    { key: 'rotation', label: 'Rotation', type: 'range', default: 8, min: 0, max: 35, unit: '°' },
    { key: 'sizeVar', label: 'Size variation', type: 'range', default: 0.15, min: 0, max: 0.5, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const rng = ctx.rng.fork('cropframe');
    let size = Math.min(a.w, a.h) * num(p, 'size', 0.2);
    const crop = num(p, 'crop', 0.3);
    // the ring the icon centers sit on: the edge, pushed out by the crop amount
    const off = size * (0.5 - crop);
    let r: Rect = { x: a.x + off, y: a.y + off, w: a.w - off * 2, h: a.h - off * 2 };
    const per = 2 * (r.w + r.h);
    // shrink when there are more icons than fit side by side
    // (neighbours either side of a corner are closer than their distance along the edge)
  size = Math.min(size, (per / n) * 0.7);
    const off2 = size * (0.5 - crop);
    r = { x: a.x + off2, y: a.y + off2, w: a.w - off2 * 2, h: a.h - off2 * 2 };
    const rotMax = num(p, 'rotation', 8);
    const sv = num(p, 'sizeVar', 0.15);
    const phase = rng() / n;
    return items.map((it, i) => {
      const q = perimeterPoint(r, i / n + phase);
      const s = size * (1 - sv / 2 + rng() * sv);
      const b = fitBox(it, s, s, 0.95);
      return { id: it.id, cx: q.x, cy: q.y, w: b.w, h: b.h, rot: (rng() * 2 - 1) * rotMax };
    });
  },
};

