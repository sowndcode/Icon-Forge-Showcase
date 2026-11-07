// Perspective Floor / Perspective Wall — pseudo-3D layouts on an editable plane (four corners).
//
// Plane coordinates: a = across (0..1), d = depth (0 = far, 1 = near).
//   Floor: screen = plane(u = a, v = d)         far edge = top of the quad
//   Wall:  screen = plane(u = 1 - d, v = a)     far edge = right of the quad (left for mirrored quads)
// Row positions are evenly spaced in plane depth, so the projective mapping compresses far rows
// naturally. Item size is interpolated: scale(d) = far + (near - far) · d. Rows hold more items
// toward the back because each item is smaller there.

import { intersects, rectCollider } from '../core/collide';
import { clamp, dist } from '../core/geometry';
import { PlaneMap } from '../core/homography';
import type { Quad, Rect, Vec } from '../core/types';
import { apportion, boxForSize } from './common';
import { bool, num, str, type LayoutAlgorithm, type LayoutContext, type LayoutItem, type Params, type Placement } from './types';

export type PlanePreset = 'centered' | 'left' | 'right' | 'strong' | 'subtle';

/** Default planes, as fractions of the usable area. */
const FLOOR_PRESETS: Record<PlanePreset, [number, number][]> = {
  centered: [
    [0.2, 0.16],
    [0.8, 0.16],
    [1, 1],
    [0, 1],
  ],
  left: [
    [0.02, 0.12],
    [0.5, 0.12],
    [1, 1],
    [0, 1],
  ],
  right: [
    [0.5, 0.12],
    [0.98, 0.12],
    [1, 1],
    [0, 1],
  ],
  strong: [
    [0.32, 0.22],
    [0.68, 0.22],
    [1, 1],
    [0, 1],
  ],
  subtle: [
    [0.08, 0.06],
    [0.92, 0.06],
    [1, 1],
    [0, 1],
  ],
};

const WALL_PRESETS: Record<PlanePreset, [number, number][]> = {
  centered: [
    [0, 0],
    [0.82, 0.24],
    [0.82, 0.76],
    [0, 1],
  ],
  right: [
    [0, 0],
    [0.86, 0.26],
    [0.86, 0.74],
    [0, 1],
  ],
  left: [
    [0.18, 0.26],
    [1, 0],
    [1, 1],
    [0.18, 0.74],
  ],
  strong: [
    [0, 0],
    [0.8, 0.34],
    [0.8, 0.66],
    [0, 1],
  ],
  subtle: [
    [0, 0.02],
    [0.95, 0.14],
    [0.95, 0.86],
    [0, 0.98],
  ],
};

export function presetPlane(kind: 'floor' | 'wall', area: Rect, preset: PlanePreset = 'centered'): Quad {
  const f = (kind === 'floor' ? FLOOR_PRESETS : WALL_PRESETS)[preset];
  return f.map(([x, y]) => ({ x: area.x + x * area.w, y: area.y + y * area.h })) as Quad;
}

/** Wall far side: the shorter vertical edge. Returns true when far side is on the left. */
function wallFarLeft(q: Quad): boolean {
  return dist(q[0], q[3]) < dist(q[1], q[2]);
}

export function planeMapper(kind: 'floor' | 'wall', quad: Quad, strength: number) {
  const pm = new PlaneMap(quad, strength);
  const farLeft = kind === 'wall' && wallFarLeft(quad);
  const map = (a: number, d: number): Vec => (kind === 'floor' ? pm.map(a, d) : pm.map(farLeft ? d : 1 - d, a));
  /** Inverse: screen point → depth (0 far .. 1 near). */
  const depthOf = (p: Vec): number => {
    const uv = pm.unmap(p);
    return clamp(kind === 'floor' ? uv.y : farLeft ? uv.x : 1 - uv.x, 0, 1);
  };
  return { map, depthOf, pm };
}

function perspectiveParams(kind: 'floor' | 'wall') {
  const across = kind === 'floor' ? 'Rows' : 'Columns';
  const organic = (q: Params) => (q.arrange ?? 'organic') === 'organic';
  return [
    {
      key: 'arrange',
      label: 'Arrangement',
      type: 'select' as const,
      default: 'organic',
      options: [
        { value: 'organic', label: 'Organic showcase' },
        { value: 'grid', label: 'Perfect grid' },
        { value: 'rows', label: 'Fitted rows' },
      ],
      hint: 'Organic: lively, slightly random. Perfect grid: equal columns converging to the vanishing point. Fitted rows: clean rows, more items in the back.',
    },
    {
      key: 'rowSort',
      label: 'Depth sorting',
      type: 'select' as const,
      default: 'order',
      options: [
        { value: 'order', label: 'Asset order' },
        { value: 'category', label: 'One category per row' },
        { value: 'sizeFront', label: 'Largest in front' },
        { value: 'sizeBack', label: 'Largest in back' },
      ],
    },
    { key: 'noOverlap', label: 'No overlap', type: 'bool' as const, default: false, hint: 'Shrinks items just enough that no two visible boxes overlap' },
    { key: 'near', label: 'Near scale', type: 'range' as const, default: 1.15, min: 0.2, max: 3, step: 0.01, scale: 100, unit: '%', when: (q: Params) => q.arrange !== 'grid' },
    { key: 'far', label: 'Far scale', type: 'range' as const, default: 0.42, min: 0.05, max: 2, step: 0.01, scale: 100, unit: '%', when: (q: Params) => q.arrange !== 'grid' },
    { key: 'strength', label: 'Perspective strength', type: 'range' as const, default: 1, min: 0, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'spread', label: kind === 'floor' ? 'Horizontal spread' : 'Vertical spread', type: 'range' as const, default: 0.94, min: 0.2, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    { key: 'density', label: 'Density', type: 'range' as const, default: 0.86, min: 0.3, max: 1.4, step: 0.01, scale: 100, unit: '%' },
    { key: 'rows', label: across, type: 'int' as const, default: 0, min: 0, max: 40, autoZero: true },
    { key: 'columns', label: kind === 'floor' ? 'Items per row' : 'Items per column', type: 'int' as const, default: 0, min: 0, max: 60, autoZero: true, advanced: true },
    { key: 'depthSpacing', label: 'Depth spacing', type: 'range' as const, default: 1, min: 0.4, max: 2.5, step: 0.01, decimals: 2, advanced: true, hint: '<1 bunches rows toward the front, >1 toward the back' },
    { key: 'nearPad', label: 'Near padding', type: 'range' as const, default: 0.07, min: 0, max: 0.4, step: 0.01, scale: 100, unit: '%', advanced: true },
    { key: 'farPad', label: 'Far padding', type: 'range' as const, default: 0.03, min: 0, max: 0.4, step: 0.01, scale: 100, unit: '%', advanced: true },
    { key: 'stagger', label: 'Stagger rows', type: 'bool' as const, default: true, advanced: true, when: organic },
    { key: 'randPos', label: 'Random position', type: 'range' as const, default: 0.18, min: 0, max: 1, step: 0.01, scale: 100, unit: '%', when: organic },
    { key: 'randScale', label: 'Random scale', type: 'range' as const, default: 0.08, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%', when: organic },
    { key: 'randRot', label: 'Random rotation', type: 'range' as const, default: 0, min: 0, max: 45, unit: '°', when: organic },
    { key: 'overlap', label: 'Overlap', type: 'range' as const, default: 0.15, min: 0, max: 1, step: 0.01, scale: 100, unit: '%', when: organic },
    { key: 'vpBias', label: 'Vanishing point bias', type: 'range' as const, default: 0, min: -1, max: 1, step: 0.01, scale: 100, unit: '%', advanced: true },
    ...(kind === 'floor'
      ? [
          {
            key: 'adaptive',
            label: 'Small packs',
            type: 'select' as const,
            // 'off' for layouts saved before this option existed, so they keep their exact arrangement;
            // new floors get 'auto' (state/layoutActions.ts)
            default: 'off',
            options: [
              { value: 'auto', label: 'Deeper floor under 40 icons' },
              { value: 'off', label: 'Same as large packs' },
            ],
            hint: 'With fewer than 40 icons: more rows toward the back, a stronger size difference and icons capped so the front row still holds several. Larger packs are never affected.',
            when: (q: Params) => q.arrange !== 'grid',
          },
        ]
      : []),
  ];
}

/** Below this many icons a floor can adapt its depth (option “Small packs”). */
export const SMALL_PACK = 40;

interface Row {
  d: number;
  count: number;
}

function runPerspective(kind: 'floor' | 'wall', items: LayoutItem[], p: Params, ctx: LayoutContext): Placement[] {
  const n = items.length;
  if (!n) return [];
  const quad = ctx.plane ?? presetPlane(kind, ctx.area);
  const { map } = planeMapper(kind, quad, num(p, 'strength', 1));
  const mode0 = str(p, 'arrange', 'organic');
  // small packs: more rows and a clearer near/far difference so the floor reads as a floor
  const small = kind === 'floor' && str(p, 'adaptive', 'off') === 'auto' && n < SMALL_PACK && mode0 !== 'grid' && str(p, 'rowSort', 'order') !== 'category' && !num(p, 'rows') && !num(p, 'columns');
  const near = num(p, 'near', 1.15),
    far = num(p, 'far', 0.42) * (small ? 0.82 : 1);
  const spread = num(p, 'spread', 0.94);
  const density = num(p, 'density', 0.86);
  // very small packs use the nearer part of the floor, so a handful of icons do not sit far apart
  const farPad = num(p, 'farPad', 0.03) + (small ? (n < 10 ? 0.3 : n < 20 ? 0.12 : 0) : 0),
    nearPad = num(p, 'nearPad', 0.07);
  const dsp = num(p, 'depthSpacing', 1);
  const mode = str(p, 'arrange', 'organic');
  const clean = mode !== 'organic';
  const rowSort = str(p, 'rowSort', 'order');
  // categories in first-seen order (first category goes to the front)
  const catOrder: string[] = [];
  for (const it of items) if (!catOrder.includes(it.category)) catOrder.push(it.category);
  const catRows = rowSort === 'category' && mode !== 'grid' && catOrder.length > 1;
  let gridCols = 0;
  const scaleAt = (d: number) => Math.max(0.01, far + (near - far) * d);
  const rel = (d: number) => scaleAt(d) / Math.max(near, far, 0.01);
  const widthAt = (d: number) => dist(map(0, d), map(1, d)) * spread;
  const depthFor = (r: number, R: number) => {
    const t = R === 1 ? 0.5 : r / (R - 1);
    return farPad + (1 - farPad - nearPad) * Math.pow(t, dsp);
  };
  const rowStep = (r: number, R: number) => {
    const d0 = depthFor(Math.max(0, r - 0.5), R),
      d1 = depthFor(Math.min(R - 1, r + 0.5), R);
    const span = R === 1 ? 1 - farPad - nearPad : Math.max(1e-3, d1 - d0) * (r === 0 || r === R - 1 ? 2 : 1);
    return dist(map(0.5, Math.max(0, depthFor(r, R) - span / 2)), map(0.5, Math.min(1, depthFor(r, R) + span / 2)));
  };
  const blockedFn = (pt: Vec, size: number) => {
    if (!ctx.keepOut.length && !ctx.obstacles.length) return false;
    // test the box the item will actually occupy (floor items stand on the point)
    const c = rectCollider(pt.x, kind === 'floor' ? pt.y - size * 0.42 : pt.y, size * 0.92, size * 0.92);
    return ctx.keepOut.some((k) => intersects(c, k)) || ctx.obstacles.some((k) => intersects(c, rectColliderShrink(k)));
  };

  const plan = (target: number): Row[] => {
    if (catRows) {
      // one depth row per category; front row = first category
      const counts = catOrder.map((c) => items.filter((it) => it.category === c).length);
      const extra = target - n;
      if (extra > 0) counts[counts.length - 1] += extra; // spare slots (keep-out) at the back
      const R = counts.length;
      return counts.map((count, k) => ({ d: depthFor(R - 1 - k, R), count })).reverse();
    }
    if (mode === 'grid') {
      // constant column count: columns converge to the vanishing point like a real floor grid
      let C = num(p, 'columns');
      let R = num(p, 'rows');
      if (C && !R) R = Math.ceil(target / C);
      else if (R && !C) C = Math.ceil(target / R);
      else if (!R && !C) {
        let best = { R: 1, C: target, cost: Infinity };
        for (let r = 1; r <= Math.min(target, 30); r++) {
          const c = Math.ceil(target / r);
          let cost = 0;
          for (let i = 0; i < r; i++) cost += Math.abs(Math.log(widthAt(depthFor(i, r)) / c / rowStep(i, r)));
          cost = cost / r + 0.02 * (r * c - target);
          if (cost < best.cost) best = { R: r, C: c, cost };
        }
        R = best.R;
        C = best.C;
      }
      gridCols = C;
      const counts = Array.from({ length: R }, (_, i) => (i === 0 ? target - C * (R - 1) : C));
      return counts.map((count, i) => ({ d: depthFor(i, R), count: Math.max(0, count) }));
    }
    const fixedCols = num(p, 'columns');
    let R = num(p, 'rows');
    if (fixedCols && !R) R = Math.ceil(target / fixedCols);
    // small packs: 2 rows for a handful of icons up to 5 rows near the threshold
    if (!R && small) R = Math.max(2, Math.min(5, Math.round(Math.sqrt(target) * 0.95)));
    if (!R) {
      let best = 1,
        bestCost = Infinity;
      for (let r = 1; r <= Math.min(target, 40); r++) {
        const ds = Array.from({ length: r }, (_, i) => depthFor(i, r));
        const counts = apportion(target, ds.map((d) => widthAt(d) / rel(d)), 1);
        let cost = 0;
        ds.forEach((d, i) => {
          const cellW = widthAt(d) / counts[i];
          const cellH = rowStep(i, r);
          cost += Math.abs(Math.log(cellW / (cellH * 1.25)));
        });
        cost /= r;
        if (cost < bestCost) {
          bestCost = cost;
          best = r;
        }
      }
      R = best;
    }
    const ds = Array.from({ length: R }, (_, i) => depthFor(i, R));
    const counts = fixedCols ? ds.map((_, i) => Math.max(0, Math.min(fixedCols, target - i * fixedCols))) : apportion(target, ds.map((d) => widthAt(d) / rel(d)), 1);
    // fixed columns: fill from the front
    if (fixedCols) counts.reverse();
    return ds.map((d, i) => ({ d, count: counts[i] }));
  };

  const rng = ctx.rng.fork('persp');
  const randPos = clean ? 0 : num(p, 'randPos', 0.18),
    randScale = clean ? 0 : num(p, 'randScale', 0.08),
    randRot = clean ? 0 : num(p, 'randRot', 0);
  const overlap = clean ? 0 : num(p, 'overlap', 0.15);
  const vpBias = num(p, 'vpBias');
  const stagger = !clean && bool(p, 'stagger', true);

  let smallBase = 0;
  const buildSlots = (target: number) => {
    const rows = plan(target);
    const R = rows.length;
    if (small) {
      // the largest base size at which every row fits its width (≥ 4 places) and its depth band
      smallBase = Infinity;
      rows.forEach((row, ri) => {
        if (!row.count) return;
        const across = widthAt(row.d) / Math.max(4, row.count) / rel(row.d);
        const deep = (rowStep(ri, R) * 1.3) / rel(row.d);
        smallBase = Math.min(smallBase, across, deep);
      });
      smallBase = (Number.isFinite(smallBase) ? smallBase : 100) * Math.min(1, density);
    }
    const slots: { pt: Vec; d: number; size: number; a: number; r: number; cellW: number; cellH: number }[] = [];
    rows.forEach((row, ri) => {
      if (!row.count) return;
      const perRow = mode === 'grid' && gridCols ? gridCols : row.count;
      const cellA = spread / perRow; // across fraction per cell
      const w = widthAt(row.d);
      const cellW = w / perRow;
      const cellH = rowStep(ri, R);
      let size = clean ? Math.min(cellW, cellH) * Math.min(density, 1) : Math.min(cellW, cellH * (1.25 + overlap)) * density * (1 + overlap * 0.5);
      // small packs: one base size scaled by depth, so sizes shrink steadily toward the back
      if (small) size = smallBase * rel(row.d) * (1 + overlap * 0.3);
      const partial = (perRow - row.count) / 2; // center a partial (back) grid row
      const off = stagger && ri % 2 === 1 && row.count > 1 ? cellA * 0.25 : stagger && row.count > 1 ? -cellA * 0.25 : 0;
      for (let j = 0; j < row.count; j++) {
        let a = 0.5 - spread / 2 + cellA * (j + 0.5 + partial) + off;
        let d = row.d;
        a += vpBias * 0.25 * (1 - d);
        const jr = rng.fork(ri * 1000 + j);
        a += jr.sym() * randPos * cellA * 0.45;
        d += jr.sym() * randPos * (cellH / Math.max(1, dist(map(0.5, 0), map(0.5, 1)))) * 0.45;
        d = clamp(d, 0, 1);
        a = clamp(a, 0.0, 1.0);
        slots.push({ pt: map(a, d), d, size: size * (1 + jr.sym() * randScale), a, r: ri, cellW, cellH });
      }
    });
    return slots;
  };

  const hasBlocks = ctx.keepOut.length + ctx.obstacles.length > 0;
  let target = hasBlocks ? Math.ceil(n * 1.35) + 2 : n;
  let slots = buildSlots(target);
  for (let iter = 0; iter < 8; iter++) {
    const free = slots.filter((s) => !blockedFn(s.pt, s.size));
    if (free.length >= (hasBlocks ? Math.ceil(n * 1.3) : n)) {
      slots = free;
      break;
    }
    target += Math.max(2, (hasBlocks ? Math.ceil(n * 1.3) : n) - free.length + 1);
    slots = buildSlots(target);
    if (iter === 7) slots = free.length ? free : slots;
  }
  // Slots ordered front → back (by row), left → right; first items go to the front.
  slots.sort((s1, s2) => s2.r - s1.r || s1.a - s2.a);
  // depth sorting of the items themselves
  if (rowSort === 'sizeFront') items = items.slice().sort((x, y) => y.rel - x.rel);
  else if (rowSort === 'sizeBack') items = items.slice().sort((x, y) => x.rel - y.rel);
  else if (rowSort === 'category') items = catOrder.flatMap((c) => items.filter((it) => it.category === c));
  const rot = (i: number) => rng.fork('rot' + i).sym() * randRot;
  const hard = ctx.keepOut.length > 0 || ctx.obstacles.length > 0;
  const used = new Array(slots.length).fill(false);
  const out: Placement[] = [];
  const place = (it: LayoutItem, i: number, si: number) => {
    const s = slots[si];
    let b = boxForSize(it, s.size);
    if (clean) {
      // fit inside the cell so neighbours never touch
      const k = Math.min(1, (s.cellW * 0.96) / b.w, (s.cellH * 0.98) / b.h);
      b = { w: b.w * k, h: b.h * k };
    }
    // anchor: the bottom of the visible box sits on the plane point (objects "stand" on the floor)
    const cy = kind === 'floor' ? s.pt.y - b.h * 0.42 : s.pt.y;
    return { id: it.id, cx: s.pt.x, cy, w: b.w, h: b.h, rot: rot(i), depth: s.d };
  };
  items.forEach((it, i) => {
    let chosen = -1;
    for (let si = 0; si < slots.length; si++) {
      if (used[si]) continue;
      if (!hard) {
        chosen = si;
        break;
      }
      // check the item's real box against keep-out regions / pinned objects
      const pl = place(it, i, si);
      const r = Math.abs((pl.rot * Math.PI) / 180);
      const c = rectCollider(pl.cx, pl.cy, pl.w * Math.cos(r) + pl.h * Math.sin(r), pl.w * Math.sin(r) + pl.h * Math.cos(r));
      if (!ctx.keepOut.some((k) => intersects(c, k)) && !ctx.obstacles.some((k) => intersects(c, rectColliderShrink(k)))) {
        chosen = si;
        break;
      }
    }
    if (chosen < 0) chosen = used.indexOf(false);
    if (chosen < 0) chosen = i % slots.length;
    used[chosen] = true;
    out.push(place(it, i, chosen));
  });
  if (bool(p, 'noOverlap')) resolveOverlaps(out, kind);
  return out;
}

/** Shrink overlapping items (floor items keep standing on their point) until no boxes overlap. */
function resolveOverlaps(out: Placement[], kind: 'floor' | 'wall') {
  for (let iter = 0; iter < 24; iter++) {
    const k = new Float64Array(out.length).fill(1);
    // axis-aligned extents of the (possibly rotated) visible boxes
    const box = out.map((pl) => {
      const r = Math.abs((pl.rot * Math.PI) / 180);
      const c = Math.abs(Math.cos(r)),
        s = Math.abs(Math.sin(r));
      return { cx: pl.cx, cy: pl.cy, w: pl.w * c + pl.h * s + 1, h: pl.w * s + pl.h * c + 1 };
    });
    const idx = box.map((_, i) => i).sort((a, b) => box[a].cx - box[a].w / 2 - (box[b].cx - box[b].w / 2));
    let any = false;
    for (let x = 0; x < idx.length; x++) {
      const A = box[idx[x]];
      const ax1 = A.cx + A.w / 2;
      for (let y = x + 1; y < idx.length; y++) {
        const B = box[idx[y]];
        if (B.cx - B.w / 2 >= ax1) break;
        const ox = Math.min(ax1, B.cx + B.w / 2) - Math.max(A.cx - A.w / 2, B.cx - B.w / 2);
        const oy = Math.min(A.cy + A.h / 2, B.cy + B.h / 2) - Math.max(A.cy - A.h / 2, B.cy - B.h / 2);
        if (ox > 0.25 && oy > 0.25) {
          any = true;
          const kx = 1 - (2 * ox) / (A.w + B.w);
          const ky = 1 - (2 * oy) / (A.h + B.h);
          const f = Math.max(0.2, Math.max(kx, ky) * 0.97);
          k[idx[x]] = Math.min(k[idx[x]], f);
          k[idx[y]] = Math.min(k[idx[y]], f);
        }
      }
    }
    if (!any) return;
    out.forEach((pl, i) => {
      if (k[i] >= 1) return;
      const foot = pl.cy + pl.h * 0.42;
      pl.w *= k[i];
      pl.h *= k[i];
      if (kind === 'floor') pl.cy = foot - pl.h * 0.42;
    });
  }
}

function rectColliderShrink(c: ReturnType<typeof rectCollider>) {
  return c.kind === 'rect' ? { ...c, hw: c.hw * 0.6, hh: c.hh * 0.6 } : c;
}

export const perspectiveFloor: LayoutAlgorithm = {
  id: 'floor',
  label: 'Perspective Floor',
  description: 'Assets across a receding floor plane: small in the back, large in front. Drag the 4 plane corners.',
  group: 'Perspective',
  plane: 'floor',
  random: true,
  noCommon: true,
  params: perspectiveParams('floor'),
  run: (items, p, ctx) => runPerspective('floor', items, p, ctx),
};

export const perspectiveWall: LayoutAlgorithm = {
  id: 'wall',
  label: 'Perspective Wall',
  description: 'Assets on a wall receding toward a vanishing point at the side.',
  group: 'Perspective',
  plane: 'wall',
  random: true,
  noCommon: true,
  params: perspectiveParams('wall'),
  run: (items, p, ctx) => runPerspective('wall', items, p, ctx),
};
