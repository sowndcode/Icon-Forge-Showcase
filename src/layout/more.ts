// More structured layouts: Feature Grid, Masonry, Category Blocks, Shape Fill.

import { insetRect } from '../core/geometry';
import type { Rect } from '../core/types';
import { autoColumns, fitBox } from './common';
import { gridCell, gridIn } from './extra';
import { bool, num, str, type LayoutAlgorithm, type LayoutItem, type Placement } from './types';

// ---------------------------------------------------------------------------
// Feature Grid: one large asset in the middle, the rest in a grid around it
// ---------------------------------------------------------------------------

export const featureGridLayout: LayoutAlgorithm = {
  id: 'feature',
  label: 'Feature Grid',
  description: 'One large featured asset in the middle of an even grid. Mark a hero to choose which one.',
  group: 'Organize',
  params: [
    { key: 'span', label: 'Feature size', type: 'select', default: '2', options: [{ value: '2', label: '2 × 2 cells' }, { value: '3', label: '3 × 3 cells' }] },
    { key: 'gap', label: 'Gap', type: 'range', default: 14, min: 0, max: 160, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 28, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.86, min: 0.3, max: 1.2, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    if (n === 1) return gridIn(items, insetRect(ctx.area, num(p, 'padding', 28)), 0, num(p, 'fill', 0.86));
    const area = insetRect(ctx.area, num(p, 'padding', 28));
    const gap = num(p, 'gap', 14),
      fill = num(p, 'fill', 0.86);
    const span = Math.min(Number(str(p, 'span', '2')) || 2, Math.max(1, Math.floor(Math.sqrt(n))));
    const feature = items.find((i) => i.hero) ?? items[0];
    const rest = items.filter((i) => i !== feature);
    // grid big enough for the rest plus the feature block, with the block fitting inside
    let cols = Math.max(span + 2, autoColumns(rest.length + span * span, area.w, area.h, gap, gap, 1));
    let rows = Math.max(span, Math.ceil((rest.length + span * span) / cols));
    while (cols * rows - span * span < rest.length) rows++;
    const cell = Math.min((area.w - gap * (cols - 1)) / cols, (area.h - gap * (rows - 1)) / rows);
    const gw = cols * cell + gap * (cols - 1),
      gh = rows * cell + gap * (rows - 1);
    const x0 = area.x + (area.w - gw) / 2,
      y0 = area.y + (area.h - gh) / 2;
    const c0 = Math.floor((cols - span) / 2),
      r0 = Math.floor((rows - span) / 2);
    const inBlock = (r: number, c: number) => r >= r0 && r < r0 + span && c >= c0 && c < c0 + span;
    const cells: { r: number; c: number }[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!inBlock(r, c)) cells.push({ r, c });
    // keep the arrangement balanced: use the cells closest to the feature first
    const cr = r0 + span / 2 - 0.5,
      cc = c0 + span / 2 - 0.5;
    const used = cells
      .map((q) => ({ ...q, d: Math.hypot((q.r - cr) * 1.05, q.c - cc) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, rest.length)
      .sort((a, b) => a.r - b.r || a.c - b.c);
    const out: Placement[] = rest.map((it, i) => {
      const q = used[i];
      const b = fitBox(it, cell, cell, fill);
      return { id: it.id, cx: x0 + q.c * (cell + gap) + cell / 2, cy: y0 + q.r * (cell + gap) + cell / 2, w: b.w, h: b.h, rot: 0 };
    });
    const big = span * cell + (span - 1) * gap;
    const fb = fitBox(feature, big, big, fill);
    out.push({ id: feature.id, cx: x0 + c0 * (cell + gap) + big / 2, cy: y0 + r0 * (cell + gap) + big / 2, w: fb.w, h: fb.h, rot: 0, z: 1e6 });
    return out;
  },
};

// ---------------------------------------------------------------------------
// Masonry: columns of assets at their own aspect ratio, each placed in the shortest column
// ---------------------------------------------------------------------------

export const masonryLayout: LayoutAlgorithm = {
  id: 'masonry',
  label: 'Masonry',
  description: 'Pinterest-style columns: every asset keeps its shape and drops into the shortest column.',
  group: 'Organize',
  params: [
    { key: 'columns', label: 'Columns', type: 'int', default: 0, min: 0, max: 30, autoZero: true },
    { key: 'gap', label: 'Gap', type: 'range', default: 14, min: 0, max: 160, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 28, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.9, min: 0.3, max: 1, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const area = insetRect(ctx.area, num(p, 'padding', 28));
    const gap = num(p, 'gap', 14),
      fill = num(p, 'fill', 0.9);
    const layoutFor = (cols: number) => {
      const colW = (area.w - gap * (cols - 1)) / cols;
      const heights = new Array(cols).fill(0);
      const ps = items.map((it) => {
        const h = Math.min(colW / Math.max(0.4, Math.min(2.5, it.aspect)), colW * 1.6);
        const c = heights.indexOf(Math.min(...heights));
        const y = heights[c];
        heights[c] += h + gap;
        return { it, c, y, h };
      });
      return { colW, ps, height: Math.max(...heights) - gap };
    };
    let cols = num(p, 'columns');
    if (!cols) {
      // the column count whose result best matches the area's height (largest assets that fit)
      let best = 1,
        bestK = 0;
      for (let c = 1; c <= Math.min(n, 30); c++) {
        const l = layoutFor(c);
        const k = Math.min(1, area.h / l.height) * l.colW;
        if (k > bestK) {
          bestK = k;
          best = c;
        }
      }
      cols = best;
    }
    const l = layoutFor(cols);
    const k = Math.min(1, area.h / l.height);
    const totalW = (cols * l.colW + gap * (cols - 1)) * k;
    const x0 = area.x + (area.w - totalW) / 2,
      y0 = area.y + (area.h - l.height * k) / 2;
    return l.ps.map(({ it, c, y, h }) => {
      const cw = l.colW * k,
        ch = h * k;
      const b = fitBox(it, cw, ch, fill, 0);
      return { id: it.id, cx: x0 + c * (cw + gap * k) + cw / 2, cy: y0 + y * k + ch / 2, w: b.w, h: b.h, rot: 0 };
    });
  },
};

// ---------------------------------------------------------------------------
// Category Blocks: one tidy grid per category
// ---------------------------------------------------------------------------

export const categoryBlocksLayout: LayoutAlgorithm = {
  id: 'catblocks',
  label: 'Category Blocks',
  description: 'Each category gets its own block, laid out side by side — perfect for packs with sub-folders.',
  group: 'Organize',
  params: [
    { key: 'blockGap', label: 'Space between blocks', type: 'range', default: 48, min: 0, max: 300, unit: 'px' },
    { key: 'gap', label: 'Gap', type: 'range', default: 10, min: 0, max: 120, unit: 'px' },
    { key: 'padding', label: 'Outer padding', type: 'range', default: 28, min: 0, max: 400, unit: 'px' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.86, min: 0.3, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    { key: 'equal', label: 'Same asset size in every block', type: 'bool', default: true },
  ],
  run(items, p, ctx) {
    if (!items.length) return [];
    const area = insetRect(ctx.area, num(p, 'padding', 28));
    const groups = new Map<string, LayoutItem[]>();
    for (const it of items) {
      const k = it.category || 'Other';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    const list = [...groups.values()];
    const bg = num(p, 'blockGap', 48),
      gap = num(p, 'gap', 10),
      fill = num(p, 'fill', 0.86);
    // blocks in rows; each row's width shared by item count so bigger categories get more room
    const m = list.length;
    const bcols = autoColumns(m, area.w, area.h, bg, bg, area.w / area.h);
    const brows = Math.ceil(m / bcols);
    const rh = (area.h - bg * (brows - 1)) / brows;
    const rects: Rect[] = [];
    for (let r = 0; r < brows; r++) {
      const row = list.slice(r * bcols, r * bcols + bcols);
      const total = row.reduce((s, g) => s + Math.sqrt(g.length), 0);
      let x = area.x;
      const avail = area.w - bg * (row.length - 1);
      for (const g of row) {
        const w = (avail * Math.sqrt(g.length)) / total;
        rects.push({ x, y: area.y + r * (rh + bg), w, h: rh });
        x += w + bg;
      }
    }
    const cell = bool(p, 'equal', true) ? Math.min(...list.map((g, i) => gridCell(g.length, g, rects[i], gap).cell)) : Infinity;
    return list.flatMap((g, i) => gridIn(g, rects[i], gap, fill, cell));
  },
};

// ---------------------------------------------------------------------------
// Shape Fill: assets fill a heart, star, circle…
// ---------------------------------------------------------------------------

type Inside = (x: number, y: number) => boolean;

function polygon(n: number, inner?: number, rot = -Math.PI / 2): Inside {
  const pts: [number, number][] = [];
  const count = inner ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * Math.PI * 2;
    const r = inner && i % 2 ? inner : 1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i],
        [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

const SHAPES: Record<string, Inside> = {
  heart: (x, y) => {
    const X = x * 1.25,
      Y = -y * 1.25 + 0.2;
    const a = X * X + Y * Y - 1;
    return a * a * a - X * X * Y * Y * Y <= 0;
  },
  circle: (x, y) => x * x + y * y <= 1,
  star: polygon(5, 0.48),
  diamond: (x, y) => Math.abs(x) + Math.abs(y) <= 1,
  hexagon: polygon(6, undefined, 0),
  triangle: polygon(3, undefined, -Math.PI / 2),
};

export const shapeFillLayout: LayoutAlgorithm = {
  id: 'shapefill',
  label: 'Shape Fill',
  description: 'Assets fill a heart, star, circle, diamond, hexagon or triangle.',
  group: 'Showcase',
  params: [
    {
      key: 'shape',
      label: 'Shape',
      type: 'select',
      default: 'heart',
      options: [
        { value: 'heart', label: 'Heart' },
        { value: 'star', label: 'Star' },
        { value: 'circle', label: 'Circle' },
        { value: 'diamond', label: 'Diamond' },
        { value: 'hexagon', label: 'Hexagon' },
        { value: 'triangle', label: 'Triangle' },
      ],
    },
    { key: 'size', label: 'Shape size', type: 'range', default: 0.94, min: 0.3, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.92, min: 0.3, max: 1.4, step: 0.01, scale: 100, unit: '%' },
    { key: 'stretch', label: 'Stretch to canvas', type: 'bool', default: false },
    { key: 'stagger', label: 'Offset rows', type: 'bool', default: true, advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const inside = SHAPES[str(p, 'shape', 'heart')] ?? SHAPES.heart;
    const a = ctx.area;
    const k = num(p, 'size', 0.94);
    const stretch = bool(p, 'stretch');
    const bw = (stretch ? a.w : Math.min(a.w, a.h)) * k,
      bh = (stretch ? a.h : Math.min(a.w, a.h)) * k;
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    const stagger = bool(p, 'stagger', true);
    const cellsFor = (s: number) => {
      const out: { x: number; y: number; d: number }[] = [];
      const rowsN = Math.floor(bh / s);
      for (let r = 0; r < rowsN; r++) {
        const y = cy - (rowsN * s) / 2 + s * (r + 0.5);
        const off = stagger && r % 2 ? s / 2 : 0;
        for (let x = cx - bw / 2 + s / 2 + off - s; x <= cx + bw / 2; x += s) {
          const nx = ((x - cx) / bw) * 2,
            ny = ((y - cy) / bh) * 2;
          if (Math.abs(nx) <= 1 && inside(nx, ny)) out.push({ x, y, d: Math.hypot(nx, ny) });
        }
      }
      return out;
    };
    // largest cell size that still yields enough cells
    let lo = 2,
      hi = Math.max(bw, bh);
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (cellsFor(mid).length >= n) lo = mid;
      else hi = mid;
    }
    const s = lo;
    // extra cells are dropped from the outside so the silhouette stays even
    const cells = cellsFor(s)
      .sort((u, v) => u.d - v.d)
      .slice(0, n)
      .sort((u, v) => u.y - v.y || u.x - v.x);
    const fill = num(p, 'fill', 0.92);
    return items.map((it, i) => {
      const c = cells[i] ?? cells[cells.length - 1];
      const b = fitBox(it, s, s, fill);
      return { id: it.id, cx: c.x, cy: c.y, w: b.w, h: b.h, rot: 0 };
    });
  },
};

