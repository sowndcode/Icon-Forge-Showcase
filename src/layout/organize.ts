// Structured layouts: Grid, Packed Grid, Rows, Columns, Cascade.

import { intersects, rectCollider } from '../core/collide';
import { insetRect } from '../core/geometry';
import type { Rect } from '../core/types';
import { apportion, autoColumns, boxForSize, fitBox, medianAspect, rectangleRows } from './common';
import { bool, num, str, type LayoutAlgorithm, type LayoutContext, type LayoutItem, type Placement } from './types';

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
}

function gridCells(n: number, area: Rect, cols: number, rows: number, gx: number, gy: number, square: boolean, centerLast: boolean, stagger: boolean, maxCell = Infinity): Cell[] {
  let cw = Math.min(maxCell, (area.w - gx * (cols - 1)) / cols);
  let ch = Math.min(maxCell, (area.h - gy * (rows - 1)) / rows);
  if (square) cw = ch = Math.min(cw, ch);
  const gw = cols * cw + gx * (cols - 1);
  const gh = rows * ch + gy * (rows - 1);
  const x0 = area.x + (area.w - gw) / 2;
  const y0 = area.y + (area.h - gh) / 2;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    if (inRow <= 0 && n > 0) break;
    let off = 0;
    if (centerLast && inRow < cols) off = ((cols - inRow) * (cw + gx)) / 2;
    if (stagger && r % 2 === 1) off += (cw + gx) / 4;
    else if (stagger) off -= (cw + gx) / 4;
    for (let c = 0; c < cols; c++) cells.push({ x: x0 + off + c * (cw + gx), y: y0 + r * (ch + gy), w: cw, h: ch, row: r });
  }
  return cells;
}

/** Cells for a complete rectangle (see rectangleRows); shorter fallback rows are centered. */
function rectangleCells(n: number, area: Rect, gx: number, gy: number, square: boolean, aspect: number, maxCell = Infinity): Cell[] {
  const { cols, counts } = rectangleRows(n, area.w, area.h, gx, gy, aspect);
  const rows = counts.length;
  let cw = Math.min(maxCell, (area.w - gx * (cols - 1)) / cols),
    ch = Math.min(maxCell, (area.h - gy * (rows - 1)) / rows);
  if (square) cw = ch = Math.min(cw, ch);
  const gw = cols * cw + gx * (cols - 1),
    gh = rows * ch + gy * (rows - 1);
  const x0 = area.x + (area.w - gw) / 2,
    y0 = area.y + (area.h - gh) / 2;
  const cells: Cell[] = [];
  counts.forEach((k, r) => {
    const off = ((cols - k) * (cw + gx)) / 2;
    for (let c = 0; c < k; c++) cells.push({ x: x0 + off + c * (cw + gx), y: y0 + r * (ch + gy), w: cw, h: ch, row: r });
  });
  return cells;
}

/**
 * Column count when cells are capped at `maxCell`: several counts then reach the cap, so among those
 * that (nearly) reach it pick the one with the fewest empty cells, then the one closest to the area's
 * shape. When none reaches the cap the usual choice stands.
 */
export function cappedColumns(n: number, W: number, H: number, gx: number, gy: number, aspect: number, maxCell: number): number {
  const base = autoColumns(n, W, H, gx, gy, aspect);
  const sa = Math.sqrt(Math.max(0.2, Math.min(5, aspect)));
  const size = (c: number) => {
    const r = Math.ceil(n / c);
    return Math.min((W - gx * (c - 1)) / c / sa, ((H - gy * (r - 1)) / r) * sa);
  };
  if (size(base) < maxCell * 0.95) return base;
  let best = base,
    bestKey = [Infinity, Infinity];
  for (let c = 1; c <= n; c++) {
    if (size(c) < maxCell * 0.95) continue;
    const r = Math.ceil(n / c);
    const key = [c * r - n, Math.abs(Math.log(c / r / (W / H)))];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      bestKey = key;
      best = c;
    }
  }
  return best;
}

function blocked(cell: Cell, ctx: LayoutContext): boolean {
  const c = rectCollider(cell.x + cell.w / 2, cell.y + cell.h / 2, cell.w * 0.8, cell.h * 0.8);
  return ctx.keepOut.some((k) => intersects(c, k)) || ctx.obstacles.some((k) => intersects(c, k));
}

export const gridLayout: LayoutAlgorithm = {
  id: 'grid',
  label: 'Grid',
  description: 'Even rows and columns; each asset normalised to its cell by visible size.',
  group: 'Organize',
  params: [
    { key: 'columns', label: 'Columns', type: 'int', default: 0, min: 0, max: 60, autoZero: true },
    { key: 'rows', label: 'Rows', type: 'int', default: 0, min: 0, max: 60, autoZero: true },
    { key: 'gapX', label: 'Horizontal gap', type: 'range', default: 16, min: 0, max: 200, unit: 'px' },
    { key: 'gapY', label: 'Vertical gap', type: 'range', default: 16, min: 0, max: 200, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 24, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.84, min: 0.3, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    // 0 (no limit) is the default so grids saved before this setting keep their exact sizes; new grids
    // start with a cap (layoutActions.newParams) so a handful of icons don't each fill half the page
    { key: 'maxCell', label: 'Largest cell', type: 'range', default: 0, min: 0.1, max: 0.8, step: 0.01, scale: 100, unit: '%', zeroLabel: 'No limit', hint: 'Caps each cell at a share of the shorter page side, so a few icons stay a sensible size and the grid sits centered. Large packs are not affected.' },
    {
      key: 'align',
      label: 'Cell alignment',
      type: 'select',
      default: 'center',
      options: [
        { value: 'center', label: 'Center' },
        { value: 'bottom', label: 'Bottom' },
        { value: 'top', label: 'Top' },
      ],
    },
    { key: 'complete', label: 'Complete rectangle', type: 'bool', default: false, hint: 'Every row gets the same number of assets (no half-empty last row). Applies when columns and rows are Auto.' },
    { key: 'square', label: 'Square cells', type: 'bool', default: true, advanced: true },
    { key: 'centerLast', label: 'Center last row', type: 'bool', default: true, advanced: true },
    { key: 'stagger', label: 'Stagger rows', type: 'bool', default: false, advanced: true },
  ],
  styles: [
    { label: 'Contact sheet', hint: 'Even spacing, icons well inside their cells', params: { gapX: 16, gapY: 16, padding: 24, fill: 0.84, align: 'center', square: true, stagger: false } },
    { label: 'Airy', hint: 'Wide gaps and margins for a calm, premium look', params: { gapX: 56, gapY: 56, padding: 96, fill: 0.74, align: 'center', square: true, stagger: false } },
    { label: 'Tight', hint: 'Dense sheet with thin gutters, icons as large as possible', params: { gapX: 4, gapY: 4, padding: 12, fill: 0.94, align: 'center', square: true, stagger: false } },
    { label: 'Shelf', hint: 'Icons stand on a shared baseline in each row', params: { gapX: 24, gapY: 40, padding: 48, fill: 0.84, align: 'bottom', square: false, stagger: false } },
    { label: 'Honeycomb', hint: 'Alternate rows shifted by a quarter cell', params: { gapX: 20, gapY: 12, padding: 48, fill: 0.84, align: 'center', square: true, stagger: true } },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const area = insetRect(ctx.area, num(p, 'padding'));
    const gx = num(p, 'gapX'),
      gy = num(p, 'gapY');
    const fill = num(p, 'fill', 0.84);
    const hasBlocks = ctx.keepOut.length + ctx.obstacles.length > 0;
    const capK = num(p, 'maxCell');
    const maxCell = capK > 0 ? capK * Math.min(ctx.area.w, ctx.area.h) : Infinity;
    let need = n;
    let cells: Cell[] = [];
    if (bool(p, 'complete') && !num(p, 'columns') && !num(p, 'rows') && !hasBlocks) cells = rectangleCells(n, area, gx, gy, bool(p, 'square', true), medianAspect(items), maxCell);
    for (let iter = 0; iter < 12 && cells.length < n; iter++) {
      let cols = num(p, 'columns');
      let rows = num(p, 'rows');
      if (!cols && !rows) cols = maxCell < Infinity ? cappedColumns(need, area.w, area.h, gx, gy, medianAspect(items), maxCell) : autoColumns(need, area.w, area.h, gx, gy, medianAspect(items));
      else if (!cols) cols = Math.ceil(need / rows);
      rows = Math.max(rows, Math.ceil(need / cols));
      const all = gridCells(need, area, cols, rows, gx, gy, bool(p, 'square', true), bool(p, 'centerLast', true) && !hasBlocks, bool(p, 'stagger'), maxCell);
      cells = hasBlocks ? all.filter((c) => !blocked(c, ctx)) : all;
      if (cells.length >= n) break;
      need += Math.max(1, n - cells.length);
    }
    const align = str(p, 'align', 'center');
    return items.map((it, i) => {
      const c = cells[i] ?? cells[cells.length - 1];
      const b = fitBox(it, c.w, c.h, fill);
      let cy = c.y + c.h / 2;
      if (align === 'bottom') cy = c.y + c.h - (c.h * (1 - Math.min(1, fill))) / 2 - b.h / 2;
      if (align === 'top') cy = c.y + (c.h * (1 - Math.min(1, fill))) / 2 + b.h / 2;
      return { id: it.id, cx: c.x + c.w / 2, cy, w: b.w, h: b.h, rot: 0 };
    });
  },
};

// ---------------------------------------------------------------------------
// Packed grid (justified rows on visible aspect ratios)
// ---------------------------------------------------------------------------

function packRows(items: LayoutItem[], sizes: number[], rowH: number, W: number, gap: number) {
  const rows: { idx: number[]; width: number; h: number }[] = [];
  let cur: number[] = [];
  let width = 0;
  let maxH = 0;
  items.forEach((it, i) => {
    const h = rowH * sizes[i];
    const w = h * it.aspect;
    const add = (cur.length ? gap : 0) + w;
    if (cur.length && width + add > W) {
      rows.push({ idx: cur, width, h: maxH });
      cur = [];
      width = 0;
      maxH = 0;
    }
    width += (cur.length ? gap : 0) + w;
    maxH = Math.max(maxH, h);
    cur.push(i);
  });
  if (cur.length) rows.push({ idx: cur, width, h: maxH });
  return rows;
}

export const packedLayout: LayoutAlgorithm = {
  id: 'packed',
  label: 'Packed Grid',
  description: 'Justified rows built from visible aspect ratios — maximum canvas usage, no overlaps.',
  group: 'Organize',
  params: [
    { key: 'gap', label: 'Spacing', type: 'range', default: 18, min: 0, max: 160, unit: 'px' },
    { key: 'density', label: 'Target density', type: 'range', default: 0.9, min: 0.4, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'variation', label: 'Scale variation', type: 'range', default: 0, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%' },
    { key: 'relative', label: 'Preserve relative size', type: 'bool', default: false },
    { key: 'justify', label: 'Justify rows', type: 'bool', default: true, advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const area = ctx.area;
    const gap = num(p, 'gap', 18);
    const density = num(p, 'density', 0.9);
    const variation = num(p, 'variation');
    const relative = bool(p, 'relative');
    const rng = ctx.rng.fork('packed');
    const sizes = items.map((it) => {
      let s = relative ? Math.max(0.35, Math.min(2.5, it.rel)) : 1;
      if (variation) s *= 1 + rng.sym() * variation;
      return s;
    });
    // aspect used for packing: width per unit height
    const W = area.w,
      H = area.h * density;
    let lo = 4,
      hi = Math.max(area.h, area.w);
    let rows = packRows(items, sizes, lo, W, gap);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const r = packRows(items, sizes, mid, W, gap);
      const total = r.reduce((a, row) => a + row.h, 0) + gap * (r.length - 1);
      if (total <= H) {
        lo = mid;
        rows = r;
      } else hi = mid;
    }
    rows = packRows(items, sizes, lo, W, gap);
    const justify = bool(p, 'justify', true);
    const out: Placement[] = [];
    // compute justified heights
    const layoutRows = rows.map((row, ri) => {
      const isLast = ri === rows.length - 1;
      const gaps = gap * (row.idx.length - 1);
      const k = justify && !(isLast && row.width < W * 0.75) ? Math.min(1.35, (W - gaps) / Math.max(1, row.width - gaps)) : 1;
      return { ...row, k, h: row.h * k };
    });
    let total = layoutRows.reduce((a, r) => a + r.h, 0) + gap * (layoutRows.length - 1);
    const shrink = total > area.h ? area.h / total : 1;
    total *= shrink;
    let y = area.y + (area.h - total) / 2;
    for (const row of layoutRows) {
      const rh = row.h * shrink;
      const widths = row.idx.map((i) => lo * sizes[i] * row.k * shrink * items[i].aspect);
      const rowW = widths.reduce((a, b) => a + b, 0) + gap * shrink * (row.idx.length - 1);
      let x = area.x + (area.w - rowW) / 2;
      row.idx.forEach((i, j) => {
        const h = lo * sizes[i] * row.k * shrink;
        const w = widths[j];
        out.push({ id: items[i].id, cx: x + w / 2, cy: y + rh / 2, w, h, rot: 0 });
        x += w + gap * shrink;
      });
      y += rh + gap * shrink;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Rows / Columns
// ---------------------------------------------------------------------------

function rowsLayout(items: LayoutItem[], p: Record<string, unknown>, area: Rect, vertical: boolean, ctx: LayoutContext): Placement[] {
  const n = items.length;
  const P = p as Record<string, number | boolean | string>;
  const A = vertical ? { x: area.y, y: area.x, w: area.h, h: area.w } : area;
  let lines = num(P, 'lines');
  if (!lines) {
    const cols = autoColumns(n, A.w, A.h, 0, 0, vertical ? 1 / medianAspect(items) : medianAspect(items));
    lines = Math.max(1, Math.ceil(n / cols));
  }
  lines = Math.min(lines, n);
  const counts = apportion(n, new Array(lines).fill(1), 1);
  const gap = num(P, 'gap', 24);
  const lineH = (A.h - gap * (lines - 1)) / lines;
  const fill = num(P, 'fill', 0.85);
  const stagger = bool(P, 'stagger');
  const wave = num(P, 'wave');
  const out: Placement[] = [];
  let k = 0;
  for (let r = 0; r < lines; r++) {
    const cnt = counts[r];
    const cellW = A.w / (cnt + (stagger ? 0.5 : 0));
    const off = stagger && r % 2 ? cellW / 2 : 0;
    for (let c = 0; c < cnt; c++, k++) {
      const it = items[k];
      const b = fitBox(vertical ? { ...it, aspect: 1 / it.aspect, vw: it.vh, vh: it.vw } : it, cellW, lineH, fill);
      let lx = A.x + off + cellW * (c + 0.5);
      let ly = A.y + r * (lineH + gap) + lineH / 2;
      if (wave) ly += Math.sin(((lx - A.x) / A.w) * Math.PI * 2 + r * 1.3) * lineH * wave * 0.5;
      const w = vertical ? b.h : b.w;
      const h = vertical ? b.w : b.h;
      out.push(vertical ? { id: it.id, cx: ly, cy: lx, w, h, rot: 0 } : { id: it.id, cx: lx, cy: ly, w, h, rot: 0 });
    }
  }
  void ctx;
  return out;
}

const lineParams = (label: string) => [
  { key: 'lines', label, type: 'int' as const, default: 0, min: 0, max: 40, autoZero: true },
  { key: 'gap', label: 'Line spacing', type: 'range' as const, default: 24, min: 0, max: 300, unit: 'px' },
  { key: 'fill', label: 'Asset scale', type: 'range' as const, default: 0.85, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
  { key: 'stagger', label: 'Stagger', type: 'bool' as const, default: false },
  { key: 'wave', label: 'Wave', type: 'range' as const, default: 0, min: 0, max: 1, step: 0.01, scale: 100, unit: '%', advanced: true },
];

export const rowsLayoutAlg: LayoutAlgorithm = {
  id: 'rows',
  label: 'Rows',
  description: 'Assets spread evenly across horizontal rows.',
  group: 'Organize',
  params: lineParams('Rows'),
  run: (items, p, ctx) => (items.length ? rowsLayout(items, p, ctx.area, false, ctx) : []),
};

export const columnsLayoutAlg: LayoutAlgorithm = {
  id: 'columns',
  label: 'Columns',
  description: 'Assets spread evenly down vertical columns.',
  group: 'Organize',
  params: lineParams('Columns'),
  run: (items, p, ctx) => (items.length ? rowsLayout(items, p, ctx.area, true, ctx) : []),
};

// ---------------------------------------------------------------------------
// Cascade
// ---------------------------------------------------------------------------

export const cascadeLayout: LayoutAlgorithm = {
  id: 'cascade',
  label: 'Cascade',
  description: 'Overlapping diagonal stacks — a dynamic "deck" look.',
  group: 'Showcase',
  defaultOverlap: 'showcase',
  params: [
    { key: 'stacks', label: 'Stacks', type: 'int', default: 0, min: 0, max: 20, autoZero: true },
    { key: 'step', label: 'Step', type: 'range', default: 0.38, min: 0.1, max: 1, step: 0.01, scale: 100, unit: '%' },
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      default: 'down-right',
      options: [
        { value: 'down-right', label: 'Down right' },
        { value: 'down-left', label: 'Down left' },
        { value: 'up-right', label: 'Up right' },
        { value: 'right', label: 'Horizontal' },
      ],
    },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.95, min: 0.3, max: 1.4, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const area = ctx.area;
    const dir = str(p, 'direction', 'down-right');
    let stacks = num(p, 'stacks');
    if (!stacks) stacks = Math.max(1, Math.min(n, Math.round(Math.sqrt(n / 3) * (area.w / area.h))));
    const per = Math.ceil(n / stacks);
    const step = num(p, 'step', 0.38);
    const sx = dir === 'down-left' ? -step : step;
    const sy = dir === 'up-right' ? -step : dir === 'right' ? 0 : step;
    const cellW = area.w / stacks;
    const t = Math.min(cellW / (1 + (per - 1) * Math.abs(sx)), area.h / (1 + (per - 1) * Math.abs(sy))) * num(p, 'fill', 0.95);
    const out: Placement[] = [];
    items.forEach((it, i) => {
      const s = Math.floor(i / per),
        j = i % per;
      const b = boxForSize(it, t * 0.92);
      const extX = t * (per - 1) * sx,
        extY = t * (per - 1) * sy;
      const cx0 = area.x + cellW * (s + 0.5) - extX / 2;
      const cy0 = area.y + area.h / 2 - extY / 2;
      out.push({ id: it.id, cx: cx0 + j * t * sx, cy: cy0 + j * t * sy, w: b.w, h: b.h, rot: 0, z: j * 1000 + s });
    });
    return out;
  },
};
