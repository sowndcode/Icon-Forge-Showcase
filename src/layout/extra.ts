// Thumbnail-oriented layouts: Honeycomb, Side Bands, Pyramid.

import { insetRect } from '../core/geometry';
import type { Rect } from '../core/types';
import { apportion, autoColumns, fitBox, medianAspect } from './common';
import { bool, num, str, type LayoutAlgorithm, type LayoutItem, type Placement } from './types';

/** Largest square cell an auto-sized grid of n items can use inside `r`. */
export function gridCell(n: number, items: LayoutItem[], r: Rect, gap: number) {
  const cols = autoColumns(n, r.w, r.h, gap, gap, medianAspect(items));
  const rows = Math.ceil(n / cols);
  return { cols, rows, cell: Math.min((r.w - gap * (cols - 1)) / cols, (r.h - gap * (rows - 1)) / rows) };
}

/** Lay items out in an auto-sized grid centered in `r`, every item normalised to its cell. */
export function gridIn(items: LayoutItem[], r: Rect, gap: number, fill: number, maxCell = Infinity): Placement[] {
  const n = items.length;
  if (!n) return [];
  const g = gridCell(n, items, r, gap);
  const { cols, rows } = g;
  const cell = Math.min(g.cell, maxCell);
  const gw = cols * cell + gap * (cols - 1),
    gh = rows * cell + gap * (rows - 1);
  const x0 = r.x + (r.w - gw) / 2,
    y0 = r.y + (r.h - gh) / 2;
  return items.map((it, i) => {
    const row = Math.floor(i / cols),
      inRow = Math.min(cols, n - row * cols);
    const off = ((cols - inRow) * (cell + gap)) / 2;
    const col = i % cols;
    const b = fitBox(it, cell, cell, fill);
    return { id: it.id, cx: x0 + off + col * (cell + gap) + cell / 2, cy: y0 + row * (cell + gap) + cell / 2, w: b.w, h: b.h, rot: 0 };
  });
}

// ---------------------------------------------------------------------------
// Honeycomb
// ---------------------------------------------------------------------------

export const honeycombLayout: LayoutAlgorithm = {
  id: 'honeycomb',
  label: 'Honeycomb',
  description: 'Offset hexagonal rows — denser and livelier than a plain grid.',
  group: 'Organize',
  params: [
    { key: 'columns', label: 'Columns', type: 'int', default: 0, min: 0, max: 40, autoZero: true },
    { key: 'complete', label: 'Complete rectangle', type: 'bool', default: false, hint: 'Every row gets the same number of assets when possible.' },
    { key: 'gap', label: 'Gap', type: 'range', default: 12, min: 0, max: 160, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 32, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.9, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const area = insetRect(ctx.area, num(p, 'padding', 32));
    const gap = num(p, 'gap', 12);
    // hex rows overlap vertically by 25%, so search the column count that gives the largest cells
    let best = { cols: 1, cell: 0 };
    const fixed = num(p, 'columns');
    const cellFor = (cols: number) => {
      const rows = Math.ceil(n / cols);
      const cellW = (area.w - gap * (cols - 1)) / (cols + (rows > 1 ? 0.5 : 0));
      const cellH = (area.h - gap * (rows - 1)) / (1 + (rows - 1) * 0.8);
      return Math.min(cellW, cellH);
    };
    for (let cols = fixed || 1; cols <= (fixed || n); cols++) if (cellFor(cols) > best.cell) best = { cols, cell: cellFor(cols) };
    if (bool(p, 'complete') && !fixed) {
      // full rows only: the best column count that divides n, if it isn't much smaller
      let exact = { cols: 0, cell: 0 };
      for (let cols = 1; cols <= n; cols++) if (n % cols === 0 && cellFor(cols) > exact.cell) exact = { cols, cell: cellFor(cols) };
      if (exact.cols && exact.cell >= best.cell * 0.7) best = exact;
    }
    const { cols, cell } = best;
    const rows = Math.ceil(n / cols);
    const rowStep = cell * 0.8 + gap;
    const gw = cols * cell + gap * (cols - 1) + (rows > 1 ? cell / 2 : 0);
    const gh = cell + (rows - 1) * rowStep;
    const x0 = area.x + (area.w - gw) / 2,
      y0 = area.y + (area.h - gh) / 2;
    const fill = num(p, 'fill', 0.9);
    return items.map((it, i) => {
      const row = Math.floor(i / cols),
        col = i % cols;
      const inRow = Math.min(cols, n - row * cols);
      const off = (row % 2 ? cell / 2 : 0) + ((cols - inRow) * (cell + gap)) / 2;
      const b = fitBox(it, cell, cell, fill);
      return { id: it.id, cx: x0 + off + col * (cell + gap) + cell / 2, cy: y0 + row * rowStep + cell / 2, w: b.w, h: b.h, rot: 0 };
    });
  },
};

// ---------------------------------------------------------------------------
// Side bands
// ---------------------------------------------------------------------------

export const bandsLayout: LayoutAlgorithm = {
  id: 'bands',
  label: 'Side Bands',
  description: 'Assets in tidy bands along the edges, leaving the middle free for your title.',
  group: 'Showcase',
  params: [
    {
      key: 'sides',
      label: 'Bands',
      type: 'select',
      default: 'lr',
      options: [
        { value: 'lr', label: 'Left + right' },
        { value: 'tb', label: 'Top + bottom' },
        { value: 'all', label: 'All four sides' },
        { value: 'b', label: 'Bottom only' },
        { value: 't', label: 'Top only' },
      ],
    },
    { key: 'band', label: 'Band size', type: 'range', default: 0.28, min: 0.1, max: 0.48, step: 0.01, scale: 100, unit: '%' },
    { key: 'gap', label: 'Gap', type: 'range', default: 14, min: 0, max: 160, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 28, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.88, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = insetRect(ctx.area, num(p, 'padding', 28));
    const t = num(p, 'band', 0.28);
    const sides = str(p, 'sides', 'lr');
    const bw = a.w * t,
      bh = a.h * t;
    const rects: Rect[] = [];
    if (sides === 'lr' || sides === 'all') rects.push({ x: a.x, y: a.y, w: bw, h: a.h }, { x: a.x + a.w - bw, y: a.y, w: bw, h: a.h });
    if (sides === 'tb' || sides === 'all') {
      const x = sides === 'all' ? a.x + bw : a.x,
        w = sides === 'all' ? a.w - 2 * bw : a.w;
      rects.push({ x, y: a.y, w, h: bh }, { x, y: a.y + a.h - bh, w, h: bh });
    }
    if (sides === 'b') rects.push({ x: a.x, y: a.y + a.h - bh, w: a.w, h: bh });
    if (sides === 't') rects.push({ x: a.x, y: a.y, w: a.w, h: bh });
    // share items by band area so every band ends up with similar asset sizes
    const counts = apportion(n, rects.map((r) => r.w * r.h));
    const gap = num(p, 'gap', 14),
      fill = num(p, 'fill', 0.88);
    const groups: LayoutItem[][] = [];
    let i = 0;
    for (const c of counts) {
      groups.push(items.slice(i, i + c));
      i += c;
    }
    // same asset size in every band: the tightest band sets the cell size
    const cell = Math.min(...rects.map((r, k) => (groups[k].length ? gridCell(groups[k].length, groups[k], r, gap).cell : Infinity)));
    return rects.flatMap((r, k) => gridIn(groups[k], r, gap, fill, cell));
  },
};

// ---------------------------------------------------------------------------
// Pyramid
// ---------------------------------------------------------------------------

export const pyramidLayout: LayoutAlgorithm = {
  id: 'pyramid',
  label: 'Pyramid',
  description: 'Rows that grow by one toward the bottom (or top) — first assets get the spotlight.',
  group: 'Showcase',
  params: [
    { key: 'invert', label: 'Point down', type: 'bool', default: false },
    { key: 'grow', label: 'Top row larger', type: 'range', default: 0.25, min: 0, max: 1, step: 0.01, scale: 100, unit: '%', hint: 'Make the rows near the tip bigger' },
    { key: 'gap', label: 'Gap', type: 'range', default: 12, min: 0, max: 160, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 28, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.9, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = insetRect(ctx.area, num(p, 'padding', 28));
    const gap = num(p, 'gap', 12),
      fill = num(p, 'fill', 0.9),
      grow = num(p, 'grow', 0.25);
    // rows 1, 2, 3 … until all items fit; the last row takes the remainder
    const rows: number[] = [];
    for (let left = n, k = 1; left > 0; k++) {
      rows.push(Math.min(k, left));
      left -= k;
    }
    const R = rows.length;
    // relative row heights: the tip is up to (1 + grow) times larger than the base
    const rel = rows.map((_, r) => 1 + grow * (R > 1 ? 1 - r / (R - 1) : 0));
    const widest = Math.max(...rows.map((c, r) => c * rel[r]));
    const sumH = rel.reduce((s, v) => s + v, 0);
    const unit = Math.min((a.w - gap * (Math.max(...rows) - 1)) / widest, (a.h - gap * (R - 1)) / sumH);
    const totalH = sumH * unit + gap * (R - 1);
    let y = a.y + (a.h - totalH) / 2;
    const order = bool(p, 'invert') ? rows.map((_, r) => R - 1 - r) : rows.map((_, r) => r);
    const out: Placement[] = [];
    let idx = 0;
    const rowItems = rows.map((c) => {
      const s = items.slice(idx, idx + c);
      idx += c;
      return s;
    });
    for (const r of order) {
      const cell = unit * rel[r];
      const its = rowItems[r];
      const rw = its.length * cell + gap * (its.length - 1);
      let x = a.x + (a.w - rw) / 2;
      for (const it of its) {
        const b = fitBox(it, cell, cell, fill);
        out.push({ id: it.id, cx: x + cell / 2, cy: y + cell / 2, w: b.w, h: b.h, rot: 0 });
        x += cell + gap;
      }
      y += cell + gap;
    }
    return out;
  },
};
