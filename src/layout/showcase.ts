// Marketplace-style compositions: Hero Showcase, Split, Diagonal Flow, Orbit, Ring, Dual Cluster
// and Compare (two matching halves, e.g. colour vs grayscale).

import { DEG } from '../core/geometry';
import type { Rect } from '../core/types';
import { apportion, boxForSize, fitBox, fitPlacements } from './common';
import { gridIn } from './extra';
import { clusterLayout } from './scatter';
import { bool, num, str, type LayoutAlgorithm, type LayoutContext, type LayoutItem, type Placement, type Params } from './types';

const sideOptions = [
  { value: 'left', label: 'Icons left' },
  { value: 'right', label: 'Icons right' },
  { value: 'top', label: 'Icons top' },
  { value: 'bottom', label: 'Icons bottom' },
];

/** Split a rect along x (side left/right) or y (top/bottom). `share` is the icon part. */
function splitRect(a: Rect, side: string, share: number, gap: number): { icons: Rect; text: Rect } {
  if (side === 'left' || side === 'right') {
    const iw = a.w * share - gap / 2;
    const tw = a.w - iw - gap;
    const icons = { x: side === 'left' ? a.x : a.x + a.w - iw, y: a.y, w: iw, h: a.h };
    const text = { x: side === 'left' ? a.x + iw + gap : a.x, y: a.y, w: tw, h: a.h };
    return { icons, text };
  }
  const ih = a.h * share - gap / 2;
  const th = a.h - ih - gap;
  const icons = { x: a.x, y: side === 'top' ? a.y : a.y + a.h - ih, w: a.w, h: ih };
  const text = { x: a.x, y: side === 'top' ? a.y + ih + gap : a.y, w: a.w, h: th };
  return { icons, text };
}

/** `c` points evenly spaced by arc length around an ellipse, starting at `startDeg` (+ `phase` of a step). */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, c: number, startDeg: number, phase = 0) {
  const N = 720;
  const cum = [0];
  let prev = { x: rx * Math.cos(startDeg * DEG), y: ry * Math.sin(startDeg * DEG) };
  for (let i = 1; i <= N; i++) {
    const t = (startDeg + (360 * i) / N) * DEG;
    const q = { x: rx * Math.cos(t), y: ry * Math.sin(t) };
    cum.push(cum[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y));
    prev = q;
  }
  const total = cum[N];
  const out: { x: number; y: number }[] = [];
  let k = 0;
  for (let j = 0; j < c; j++) {
    const target = (((j + phase) / c) % 1) * total;
    while (k < N && cum[k + 1] < target) k++;
    const f = (target - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    const t = (startDeg + (360 * (k + f)) / N) * DEG;
    out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return { pts: out, length: total };
}

/** Offset every other row by half a cell (brick / honeycomb feel). */
function stagger(ps: Placement[]): Placement[] {
  const rows = [...new Set(ps.map((p) => Math.round(p.cy)))].sort((a, b) => a - b);
  if (rows.length < 2) return ps;
  const byRow = new Map(rows.map((r, i) => [r, i]));
  const xs = [...new Set(ps.map((p) => Math.round(p.cx)))].sort((a, b) => a - b);
  const step = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i]).filter((d) => d > 1)) : 0;
  return ps.map((p) => ((byRow.get(Math.round(p.cy)) ?? 0) % 2 ? { ...p, cx: p.cx + step / 2 } : p));
}

// ---------------------------------------------------------------------------
// Hero Showcase — a few big icons in balanced rows with room for the title
// ---------------------------------------------------------------------------

/** Row sizes for a balanced, symmetric look (7 → 2·3·2, 9 → 3·3·3, 10 → 3·4·3). */
function balancedRows(n: number, maxRows: number): number[] {
  if (n <= 4) return [n];
  const rows = Math.min(maxRows, Math.max(2, Math.round(Math.sqrt(n / 2))));
  const base = Math.floor(n / rows);
  const out = Array(rows).fill(base) as number[];
  let rest = n - base * rows;
  // extra icons go to the middle rows first so the shape stays symmetric
  const mid = (rows - 1) / 2;
  const order = out.map((_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  for (let i = 0; rest > 0; i++, rest--) out[order[i % rows]]++;
  return out;
}

export const heroShowcaseLayout: LayoutAlgorithm = {
  id: 'heroshowcase',
  label: 'Hero Showcase',
  description: 'A handful of big icons (6–10 is ideal) in balanced rows, with a band kept free for the title.',
  group: 'Showcase',
  params: [
    {
      key: 'title',
      label: 'Title space',
      type: 'select',
      default: 'top',
      options: [
        { value: 'top', label: 'Above the icons' },
        { value: 'bottom', label: 'Below the icons' },
        { value: 'middle', label: 'Between the rows' },
        { value: 'none', label: 'No title space' },
      ],
    },
    { key: 'titleSize', label: 'Title space size', type: 'range', default: 0.28, min: 0.1, max: 0.5, step: 0.01, scale: 100, unit: '%', when: (p) => p.title !== 'none' },
    { key: 'scale', label: 'Icon size', type: 'range', default: 0.9, min: 0.4, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    { key: 'gap', label: 'Spacing', type: 'range', default: 0.12, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%', hint: 'Space between icons, relative to icon size' },
    { key: 'center', label: 'Bigger center icon', type: 'bool', default: true },
    { key: 'arch', label: 'Arch', type: 'range', default: 0.25, min: -1, max: 1, step: 0.01, scale: 100, unit: '%', hint: 'Bends the rows into a gentle smile or frown' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const mode = str(p, 'title', 'top');
    const ts = mode === 'none' ? 0 : num(p, 'titleSize', 0.28);
    const counts = balancedRows(n, 4);
    const R = counts.length;
    // free band for the title
    const bandH = a.h * ts;
    const rect: Rect = mode === 'top' ? { ...a, y: a.y + bandH, h: a.h - bandH } : mode === 'bottom' ? { ...a, h: a.h - bandH } : a;
    const midGap = mode === 'middle' ? bandH : 0;
    const gapK = num(p, 'gap', 0.12);
    const maxCols = Math.max(...counts);
    const cell = Math.min(rect.w / (maxCols + gapK * (maxCols - 1)), (rect.h - midGap) / (R + gapK * (R - 1))) * num(p, 'scale', 0.9);
    const step = cell * (1 + gapK);
    const totalH = R * cell + (R - 1) * cell * gapK + midGap;
    let y = rect.y + (rect.h - totalH) / 2 + cell / 2;
    const arch = num(p, 'arch', 0.25);
    const out: Placement[] = [];
    let k = 0;
    const bigCenter = bool(p, 'center', true);
    counts.forEach((c, ri) => {
      const rowW = (c - 1) * step;
      for (let j = 0; j < c; j++, k++) {
        const it = items[k];
        const u = c > 1 ? (j / (c - 1)) * 2 - 1 : 0; // -1 … 1 across the row
        const isCenter = bigCenter && R % 2 === 1 && ri === (R - 1) / 2 && c % 2 === 1 && j === (c - 1) / 2;
        const sz = cell * (isCenter ? 1.22 : 1) * (1 - Math.abs(u) * 0.06);
        const b = fitBox(it, sz, sz, 0.94);
        out.push({ id: it.id, cx: rect.x + rect.w / 2 - rowW / 2 + j * step, cy: y - arch * cell * 0.35 * (1 - u * u), w: b.w, h: b.h, rot: 0, z: isCenter ? 10 : 1 - Math.abs(u) });
      }
      y += step + (mode === 'middle' && ri === Math.floor(R / 2) - 1 ? midGap : 0);
    });
    return fitPlacements(out, rect);
  },
};

// ---------------------------------------------------------------------------
// Split — icons on one side, text space on the other
// ---------------------------------------------------------------------------

export const splitLayout: LayoutAlgorithm = {
  id: 'split',
  label: 'Split',
  description: 'Icons fill one side; the other side stays free for your title and text. Flip it with “Icons on”.',
  group: 'Showcase',
  params: [
    { key: 'side', label: 'Icons on', type: 'select', default: 'right', options: sideOptions },
    { key: 'share', label: 'Icon side size', type: 'range', default: 0.55, min: 0.3, max: 0.8, step: 0.01, scale: 100, unit: '%' },
    {
      key: 'style',
      label: 'Arrangement',
      type: 'select',
      default: 'grid',
      options: [
        { value: 'grid', label: 'Neat grid' },
        { value: 'stagger', label: 'Staggered rows' },
        { value: 'cluster', label: 'Organic cluster' },
      ],
    },
    { key: 'gap', label: 'Spacing', type: 'range', default: 14, min: 0, max: 120, unit: 'px' },
    { key: 'fill', label: 'Icon size', type: 'range', default: 0.86, min: 0.4, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'divide', label: 'Gap between sides', type: 'range', default: 40, min: 0, max: 300, unit: 'px', advanced: true },
  ],
  run(items, p, ctx) {
    if (!items.length) return [];
    const { icons } = splitRect(ctx.area, str(p, 'side', 'right'), num(p, 'share', 0.55), num(p, 'divide', 40));
    const style = str(p, 'style', 'grid');
    if (style === 'cluster') return clusterIn(items, icons, ctx, { density: 0.62, gap: num(p, 'gap', 14) * 0.5, variation: 0.2, shape: 'fit' });
    const ps = gridIn(items, icons, num(p, 'gap', 14), num(p, 'fill', 0.86));
    return style === 'stagger' ? fitPlacements(stagger(ps), icons) : ps;
  },
};

/** Run the Cluster layout inside a sub-rectangle. */
function clusterIn(items: LayoutItem[], area: Rect, ctx: LayoutContext, over: Params): Placement[] {
  const params: Params = {};
  for (const d of clusterLayout.params) params[d.key] = d.default;
  return clusterLayout.run(items, { ...params, ...over }, { ...ctx, area, rng: ctx.rng.fork(`${area.x},${area.y}`) });
}

// ---------------------------------------------------------------------------
// Diagonal Flow
// ---------------------------------------------------------------------------

export const diagonalLayout: LayoutAlgorithm = {
  id: 'diagonal',
  label: 'Diagonal Flow',
  description: 'Icons stream across the canvas in diagonal lanes, growing (or shrinking) along the way.',
  group: 'Showcase',
  params: [
    {
      key: 'dir',
      label: 'Direction',
      type: 'select',
      default: 'up',
      options: [
        { value: 'up', label: 'Bottom-left → top-right' },
        { value: 'down', label: 'Top-left → bottom-right' },
      ],
    },
    { key: 'lanes', label: 'Lanes', type: 'int', default: 0, min: 0, max: 10, autoZero: true },
    { key: 'angle', label: 'Steepness', type: 'range', default: 30, min: 10, max: 60, unit: '°' },
    { key: 'growth', label: 'Size progression', type: 'range', default: 0.5, min: -1, max: 1, step: 0.01, scale: 100, unit: '%', hint: 'Positive: icons get bigger along the flow' },
    { key: 'fill', label: 'Icon size', type: 'range', default: 0.82, min: 0.3, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    { key: 'tilt', label: 'Tilt icons with the flow', type: 'bool', default: false },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const up = str(p, 'dir', 'up') === 'up';
    const ang = num(p, 'angle', 30) * DEG * (up ? -1 : 1);
    const d = { x: Math.cos(ang), y: Math.sin(ang) };
    const nrm = { x: -d.y, y: d.x };
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    // extent of the area across the lanes
    const across = Math.abs(a.w * nrm.x) + Math.abs(a.h * nrm.y);
    let lanes = num(p, 'lanes');
    // spacing along a lane ≈ spacing between lanes: lane gap ≈ √(area / n)
    if (!lanes) lanes = Math.max(1, Math.min(14, Math.round(across / Math.sqrt((a.w * a.h) / n))));
    const laneGap = across / lanes;
    // clip each lane line to the area → segment lengths
    const segs = Array.from({ length: lanes }, (_, k) => {
      const off = (k - (lanes - 1) / 2) * laneGap;
      const ox = cx + nrm.x * off,
        oy = cy + nrm.y * off;
      let t0 = -Infinity,
        t1 = Infinity;
      for (const [o, v, lo, hi] of [
        [ox, d.x, a.x, a.x + a.w],
        [oy, d.y, a.y, a.y + a.h],
      ] as const) {
        if (Math.abs(v) < 1e-9) continue;
        const ta = (lo - o) / v,
          tb = (hi - o) / v;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
      return { ox, oy, t0, t1, len: Math.max(0, t1 - t0) };
    });
    const counts = apportion(n, segs.map((s) => s.len), 0);
    const growth = num(p, 'growth', 0.5);
    const fill = num(p, 'fill', 0.82);
    const tilt = bool(p, 'tilt');
    const total = Math.abs(a.w * d.x) + Math.abs(a.h * d.y);
    const gMax = 1 + Math.abs(growth) * 0.6;
    const out: Placement[] = [];
    let k = 0;
    segs.forEach((s, li) => {
      const c = counts[li];
      if (!c) return;
      const step = s.len / c;
      for (let j = 0; j < c; j++, k++) {
        const it = items[k];
        const t = s.t0 + step * (j + 0.5);
        const x = s.ox + d.x * t,
          y = s.oy + d.y * t;
        // position along the whole flow (0 start … 1 end), for size progression
        const u = Math.max(0, Math.min(1, ((x - cx) * d.x + (y - cy) * d.y) / total + 0.5));
        const g = (1 + growth * (u - 0.5) * 1.2) / gMax;
        const cell = Math.min(step, laneGap) * g;
        const b = fitBox(it, cell, cell, Math.min(0.96, fill));
        out.push({ id: it.id, cx: x, cy: y, w: b.w, h: b.h, rot: tilt ? ang / DEG : 0, z: u });
      }
    });
    return fitPlacements(out, a);
  },
};

// ---------------------------------------------------------------------------
// Orbit — a hero in the middle with icons on orbital rings
// ---------------------------------------------------------------------------

export const orbitLayout: LayoutAlgorithm = {
  id: 'orbit',
  label: 'Orbit',
  description: 'One big icon in the center (mark it as hero, or the first is used) with smaller icons on orbits around it.',
  group: 'Showcase',
  params: [
    { key: 'rings', label: 'Orbits', type: 'int', default: 0, min: 0, max: 6, autoZero: true },
    { key: 'hero', label: 'Center icon size', type: 'range', default: 0.34, min: 0.1, max: 0.6, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Orbit icon size', type: 'range', default: 0.8, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
    { key: 'falloff', label: 'Smaller further out', type: 'range', default: 0.25, min: 0, max: 0.7, step: 0.01, scale: 100, unit: '%' },
    { key: 'tilt', label: 'Orbit tilt', type: 'range', default: 0, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%', hint: 'Flattens the orbits into ellipses' },
    { key: 'stretch', label: 'Use the full width', type: 'bool', default: true },
    { key: 'start', label: 'Start angle', type: 'range', default: -90, min: -180, max: 180, unit: '°', advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    const heroIdx = Math.max(0, items.findIndex((i) => i.hero));
    const hero = items[heroIdx];
    const rest = items.filter((_, i) => i !== heroIdx);
    const R = Math.min(a.w, a.h) / 2;
    const heroT = R * 2 * num(p, 'hero', 0.34);
    const hb = boxForSize(hero, heroT);
    const out: Placement[] = [{ id: hero.id, cx, cy, w: hb.w, h: hb.h, rot: 0, z: 1e6 }];
    if (!rest.length) return out;
    const tilt = num(p, 'tilt', 0);
    const stretch = bool(p, 'stretch', true);
    const sx = stretch ? Math.max(1, a.w / a.h) : 1;
    const sy = 1 - tilt;
    let rings = num(p, 'rings');
    if (!rings) rings = Math.max(1, Math.min(4, Math.round(Math.sqrt(rest.length / 6))));
    // first orbit clears the hero, also vertically when the orbits are tilted flat
    const r0 = Math.max(heroT * 0.5 + (R - heroT * 0.5) / (rings + 0.5), (hb.h * 0.5 + R * 0.14) / sy, (hb.w * 0.5 + R * 0.14) / sx);
    const radii = Array.from({ length: rings }, (_, k) => r0 + ((R - r0) * k) / Math.max(1, rings - 0.5));
    // circumference of each (possibly elliptical) orbit
    const circ = radii.map((r) => Math.PI * (3 * (r * sx + r * sy) - Math.sqrt((3 * r * sx + r * sy) * (r * sx + 3 * r * sy))));
    const counts = apportion(rest.length, circ, 1);
    const fall = num(p, 'falloff', 0.25);
    const fill = num(p, 'fill', 0.8);
    const ringGap = rings > 1 ? radii[1] - radii[0] : R - r0;
    const start = num(p, 'start', -90);
    let k = 0;
    radii.forEach((r, ri) => {
      const c = counts[ri];
      const { pts, length } = ellipsePoints(cx, cy, r * sx, r * sy, c, start, ri % 2 ? 0.5 : 0);
      const cell = Math.min(length / Math.max(1, c), ringGap * sy) * (1 - (fall * ri) / Math.max(1, rings - 1 || 1));
      for (let j = 0; j < c; j++, k++) {
        const it = rest[k];
        const b = fitBox(it, cell, cell, Math.min(0.95, fill));
        // icons on the near half of a tilted orbit draw in front
        out.push({ id: it.id, cx: pts[j].x, cy: pts[j].y, w: b.w, h: b.h, rot: 0, z: tilt > 0 ? pts[j].y : ri });
      }
    });
    return fitPlacements(out, a);
  },
};

// ---------------------------------------------------------------------------
// Ring — one or more rings framing a free center
// ---------------------------------------------------------------------------

/** Point at fraction t (0..1) along the perimeter of a rounded rectangle. */
function rectPerimeterPoint(r: Rect, t: number) {
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

export const ringLayout: LayoutAlgorithm = {
  id: 'ring',
  label: 'Ring',
  description: 'Icons form a ring (round, oval or frame-shaped) around an empty center for your title.',
  group: 'Showcase',
  params: [
    {
      key: 'shape',
      label: 'Shape',
      type: 'select',
      default: 'oval',
      options: [
        { value: 'oval', label: 'Oval (fills the canvas)' },
        { value: 'circle', label: 'Circle' },
        { value: 'frame', label: 'Rectangle frame' },
      ],
    },
    { key: 'rings', label: 'Rings', type: 'int', default: 1, min: 1, max: 4 },
    { key: 'inset', label: 'Margin', type: 'range', default: 0.08, min: 0, max: 0.3, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Icon size', type: 'range', default: 0.85, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
    { key: 'start', label: 'Start angle', type: 'range', default: -90, min: -180, max: 180, unit: '°', advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const shape = str(p, 'shape', 'oval');
    const rings = Math.max(1, Math.min(4, num(p, 'rings', 1)));
    const fill = num(p, 'fill', 0.85);
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    const inset = num(p, 'inset', 0.08) * Math.min(a.w, a.h);
    // approximate icon size: perimeter of the outer ring shared by its icons
    const rx0 = (shape === 'circle' ? Math.min(a.w, a.h) / 2 : a.w / 2) - inset;
    const ry0 = (shape === 'circle' ? Math.min(a.w, a.h) / 2 : a.h / 2) - inset;
    const perOf = (rx: number, ry: number) => (shape === 'frame' ? 4 * (rx + ry) : Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))));
    const est = Math.sqrt((perOf(rx0, ry0) * Math.min(rx0, ry0) * 0.5) / n) * 0.9;
    const band = Math.min(est * 1.05, Math.min(rx0, ry0) / (rings + 0.4));
    const rs = Array.from({ length: rings }, (_, k) => ({ rx: rx0 - band * (k + 0.5), ry: ry0 - band * (k + 0.5) }));
    const counts = apportion(n, rs.map((r) => perOf(r.rx, r.ry)), 1);
    const start = num(p, 'start', -90);
    const out: Placement[] = [];
    let k = 0;
    rs.forEach((r, ri) => {
      const c = counts[ri];
      const phase = ri % 2 ? 0.5 : 0;
      const pts =
        shape === 'frame'
          ? Array.from({ length: c }, (_, j) => rectPerimeterPoint({ x: cx - r.rx, y: cy - r.ry, w: r.rx * 2, h: r.ry * 2 }, (j + phase) / c + (start + 90) / 360))
          : ellipsePoints(cx, cy, r.rx, r.ry, c, start, phase).pts;
      // frame corners bring neighbours closer (diagonal), so leave a little more room there
      const cell = Math.min(perOf(r.rx, r.ry) / Math.max(1, c) / (shape === 'frame' ? 1.45 : 1), band);
      for (let j = 0; j < c; j++, k++) {
        const it = items[k];
        const b = fitBox(it, cell, cell, Math.min(0.95, fill));
        out.push({ id: it.id, cx: pts[j].x, cy: pts[j].y, w: b.w, h: b.h, rot: 0 });
      }
    });
    return fitPlacements(out, a);
  },
};

// ---------------------------------------------------------------------------
// Dual Cluster — two groups either side of a central text area
// ---------------------------------------------------------------------------

export const dualClusterLayout: LayoutAlgorithm = {
  id: 'dualcluster',
  label: 'Dual Cluster',
  description: 'Two organic groups on either side of a free central area for the title.',
  group: 'Showcase',
  random: true,
  defaultOverlap: 'relaxed',
  params: [
    {
      key: 'axis',
      label: 'Groups',
      type: 'select',
      default: 'lr',
      options: [
        { value: 'lr', label: 'Left and right' },
        { value: 'tb', label: 'Top and bottom' },
      ],
    },
    { key: 'center', label: 'Center space', type: 'range', default: 0.32, min: 0.05, max: 0.7, step: 0.01, scale: 100, unit: '%' },
    { key: 'balance', label: 'Balance', type: 'range', default: 0.5, min: 0.2, max: 0.8, step: 0.01, scale: 100, unit: '%', hint: 'Share of icons in the first group' },
    {
      key: 'split',
      label: 'Split icons',
      type: 'select',
      default: 'alternate',
      options: [
        { value: 'alternate', label: 'Alternate (mixed)' },
        { value: 'halves', label: 'In order (first / second half)' },
        { value: 'category', label: 'By category' },
      ],
    },
    { key: 'density', label: 'Size', type: 'range', default: 0.6, min: 0.2, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'gap', label: 'Gap', type: 'range', default: 6, min: 0, max: 60, unit: 'px' },
    { key: 'variation', label: 'Size variation', type: 'range', default: 0.25, min: 0, max: 0.8, step: 0.01, scale: 100, unit: '%' },
    { key: 'shape', label: 'Round groups', type: 'bool', default: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const lr = str(p, 'axis', 'lr') === 'lr';
    const c = num(p, 'center', 0.32);
    const bal = num(p, 'balance', 0.5);
    const nA = Math.max(1, Math.min(n - 1, Math.round(n * bal)));
    let A: LayoutItem[], B: LayoutItem[];
    const mode = str(p, 'split', 'alternate');
    if (mode === 'category') {
      const sorted = items.slice().sort((x, y) => x.category.localeCompare(y.category));
      A = sorted.slice(0, nA);
      B = sorted.slice(nA);
    } else if (mode === 'halves') {
      A = items.slice(0, nA);
      B = items.slice(nA);
    } else {
      // alternate, but keep the requested balance
      A = [];
      B = [];
      items.forEach((it, i) => ((A.length / Math.max(1, i) < bal && A.length < nA) || B.length >= n - nA ? A : B).push(it));
    }
    const len = lr ? a.w : a.h;
    const free = len * c;
    const sideLen = (len - free) / 2;
    const rA: Rect = lr ? { x: a.x, y: a.y, w: sideLen, h: a.h } : { x: a.x, y: a.y, w: a.w, h: sideLen };
    const rB: Rect = lr ? { x: a.x + a.w - sideLen, y: a.y, w: sideLen, h: a.h } : { x: a.x, y: a.y + a.h - sideLen, w: a.w, h: sideLen };
    const over: Params = { density: num(p, 'density', 0.6), gap: num(p, 'gap', 6), variation: num(p, 'variation', 0.25), shape: bool(p, 'shape', true) ? 'circle' : 'fit' };
    return [...clusterIn(A, rA, ctx, over), ...(B.length ? clusterIn(B, rB, ctx, over) : [])];
  },
};

// ---------------------------------------------------------------------------
// Compare — two matching halves (colour vs grayscale, before / after, free vs full)
// ---------------------------------------------------------------------------

export const compareLayout: LayoutAlgorithm = {
  id: 'compare',
  label: 'Compare',
  description: 'Splits the icons into two matching halves side by side or stacked — used by Color vs Grayscale.',
  group: 'Organize',
  noCommon: true,
  params: [
    {
      key: 'axis',
      label: 'Halves',
      type: 'select',
      default: 'side',
      options: [
        { value: 'side', label: 'Side by side' },
        { value: 'stack', label: 'Stacked' },
      ],
    },
    { key: 'divide', label: 'Space between halves', type: 'range', default: 0.06, min: 0, max: 0.3, step: 0.01, scale: 100, unit: '%' },
    { key: 'label', label: 'Room for labels', type: 'range', default: 0.12, min: 0, max: 0.3, step: 0.01, scale: 100, unit: '%', hint: 'Free band above each half for “COLOR” / “GRAYSCALE”' },
    { key: 'gap', label: 'Spacing', type: 'range', default: 12, min: 0, max: 80, unit: 'px' },
    { key: 'fill', label: 'Icon size', type: 'range', default: 0.86, min: 0.4, max: 1, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const side = str(p, 'axis', 'side') === 'side';
    const div = (side ? a.w : a.h) * num(p, 'divide', 0.06);
    const lab = num(p, 'label', 0.12);
    const half = Math.ceil(n / 2);
    const halves: Rect[] = side
      ? [
          { x: a.x, y: a.y, w: (a.w - div) / 2, h: a.h },
          { x: a.x + (a.w + div) / 2, y: a.y, w: (a.w - div) / 2, h: a.h },
        ]
      : [
          { x: a.x, y: a.y, w: a.w, h: (a.h - div) / 2 },
          { x: a.x, y: a.y + (a.h + div) / 2, w: a.w, h: (a.h - div) / 2 },
        ];
    const inner = halves.map((r) => ({ ...r, y: r.y + r.h * lab, h: r.h * (1 - lab) }));
    // both halves get the same number of cells, so pairs line up exactly
    const gap = num(p, 'gap', 12),
      fill = num(p, 'fill', 0.86);
    const A = items.slice(0, half),
      B = items.slice(half);
    const first = gridIn(A, inner[0], gap, fill);
    const second = gridIn(B.length < A.length ? [...B, A[A.length - 1]] : B, inner[1], gap, fill).slice(0, B.length);
    return [...first, ...second];
  },
};
