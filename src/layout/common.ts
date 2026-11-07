// Shared helpers for layout algorithms.

import { canPlace, colliderBounds, inflate, overlapCost, rectCollider, SpatialHash, type Collider } from '../core/collide';
import type { Rect, Vec } from '../core/types';
import type { LayoutContext, LayoutItem, Placement } from './types';

/**
 * Visual normalisation: size an item so its visible AREA equals (cell·fill)², then clamp so the
 * visible box still fits the cell. Tall/wide items end up with comparable visual weight.
 */
export function fitBox(item: LayoutItem, cw: number, ch: number, fill = 0.85, areaBias = 0.6): { w: number; h: number } {
  const t = Math.min(cw, ch) * fill;
  const a = item.aspect;
  // equal-area box
  let w = t * Math.sqrt(a);
  let h = t / Math.sqrt(a);
  // blend toward "fit longest side" for extreme aspect ratios
  const fitK = Math.min((cw * fill) / item.vw, (ch * fill) / item.vh);
  const fw = item.vw * fitK,
    fh = item.vh * fitK;
  w = w * areaBias + fw * (1 - areaBias);
  h = h * areaBias + fh * (1 - areaBias);
  const k = Math.min(1, (cw * fill) / w, (ch * fill) / h);
  return { w: w * k, h: h * k };
}

/** Equal-area box of side t for an item. */
export function boxForSize(item: LayoutItem, t: number): { w: number; h: number } {
  const s = Math.sqrt(item.aspect);
  // limit extreme aspect ratios so very long items don't dominate
  const maxSide = t * 1.6;
  let w = t * s,
    h = t / s;
  const k = Math.min(1, maxSide / Math.max(w, h));
  w *= k;
  h *= k;
  return { w, h };
}

/** Choose a column count that maximises item size for n items in W×H. */
export function autoColumns(n: number, W: number, H: number, gx: number, gy: number, aspect = 1): number {
  let best = 1,
    bestScore = -Infinity;
  const sa = Math.sqrt(Math.max(0.2, Math.min(5, aspect)));
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const cw = (W - gx * (c - 1)) / c;
    const ch = (H - gy * (r - 1)) / r;
    if (cw <= 0 || ch <= 0) continue;
    const t = Math.min(cw / sa, ch * sa);
    const score = t * (1 - 0.004 * (c * r - n));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Rows for a "complete rectangle": every row holds the same number of items. Uses the divisor pair
 * (cols × rows = n) that gives the biggest cells; when n has no reasonable pair (e.g. a prime count),
 * falls back to rows that differ by at most one item, each centered.
 */
export function rectangleRows(n: number, W: number, H: number, gx: number, gy: number, aspect = 1): { cols: number; counts: number[]; exact: boolean } {
  const sa = Math.sqrt(Math.max(0.2, Math.min(5, aspect)));
  const score = (c: number, r: number) => {
    const cw = (W - gx * (c - 1)) / c,
      ch = (H - gy * (r - 1)) / r;
    return cw > 0 && ch > 0 ? Math.min(cw / sa, ch * sa) : 0;
  };
  const c0 = autoColumns(n, W, H, gx, gy, aspect);
  const r0 = Math.ceil(n / c0);
  let best = { c: 0, s: 0 };
  for (let c = 1; c <= n; c++) if (n % c === 0 && score(c, n / c) > best.s) best = { c, s: score(c, n / c) };
  if (best.c && best.s >= 0.7 * score(c0, r0)) return { cols: best.c, counts: new Array(n / best.c).fill(best.c), exact: true };
  const base = Math.floor(n / r0),
    extra = n % r0;
  return { cols: base + (extra ? 1 : 0), counts: Array.from({ length: r0 }, (_, i) => base + (i < extra ? 1 : 0)), exact: false };
}

export function medianAspect(items: LayoutItem[]): number {
  if (!items.length) return 1;
  const a = items.map((i) => i.aspect).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

export function insideArea(c: Collider, area: Rect, tol = 0.5): boolean {
  const b = colliderBounds(c);
  return b.x >= area.x - tol && b.y >= area.y - tol && b.x + b.w <= area.x + area.w + tol && b.y + b.h <= area.y + area.h + tol;
}

/** Collider of a placement's visible box (rotation ignored — boxes are small-angle approximations). */
export function placementCollider(p: { cx: number; cy: number; w: number; h: number; rot?: number }): Collider {
  // Inflate rotated boxes a little: the AABB of a rotated rect is larger than the rect.
  const r = Math.abs(((p.rot ?? 0) * Math.PI) / 180);
  if (r > 0.01) {
    const c = Math.abs(Math.cos(r)),
      s = Math.abs(Math.sin(r));
    const w = p.w * c + p.h * s,
      h = p.w * s + p.h * c;
    // average between tight and AABB: icons are rarely solid rectangles
    return rectCollider(p.cx, p.cy, (w + p.w) / 2, (h + p.h) / 2);
  }
  return rectCollider(p.cx, p.cy, p.w, p.h);
}

/**
 * Incremental placer: keeps a spatial index of placed items + obstacles and finds positions
 * that respect area bounds, overlap rules and keep-out regions.
 */
export class Placer {
  hash: SpatialHash<{ c: Collider }>;
  /**
   * Cells lying entirely inside a placed box. A candidate whose center region (or, in strict mode, its
   * spaced box) overlaps one is refused by every overlap mode, so it is rejected without the full
   * check. Pure speed-up: results are identical (large packs make ~20 M checks otherwise).
   */
  private cov: { x0: number; y0: number; s: number; cols: number; rows: number; bits: Uint8Array } | null = null;
  constructor(public ctx: LayoutContext, cellSize: number) {
    this.hash = new SpatialHash(cellSize);
    const a = ctx.area;
    const s = Math.max(1, cellSize / 20);
    const cols = Math.ceil(a.w / s) + 1,
      rows = Math.ceil(a.h / s) + 1;
    if (Number.isFinite(cols * rows) && cols > 0 && rows > 0 && cols * rows <= 4_000_000) this.cov = { x0: a.x, y0: a.y, s, cols, rows, bits: new Uint8Array(cols * rows) };
    for (const o of ctx.obstacles) this.insert(o);
  }
  private insert(c: Collider) {
    this.hash.insert({ c });
    const g = this.cov;
    if (!g || c.kind !== 'rect') return;
    // cells [i·s, (i+1)·s] that lie fully inside the box (a hair inside, so rounding never puts one outside)
    const e = 1e-6;
    const i0 = Math.max(0, Math.ceil((c.cx - c.hw - g.x0) / g.s + e)),
      i1 = Math.min(g.cols, Math.floor((c.cx + c.hw - g.x0) / g.s - e));
    const j0 = Math.max(0, Math.ceil((c.cy - c.hh - g.y0) / g.s + e)),
      j1 = Math.min(g.rows, Math.floor((c.cy + c.hh - g.y0) / g.s - e));
    for (let j = j0; j < j1; j++) g.bits.fill(1, j * g.cols + i0, j * g.cols + Math.max(i0, i1));
  }
  /**
   * True when a covered cell overlaps the open box (x ± dx, y ± dy) by more than a hair. That cell lies
   * inside a placed box, so any collider containing this box overlaps the placed one.
   */
  private touchesCovered(x: number, y: number, dx: number, dy: number): boolean {
    const g = this.cov;
    if (!g) return false;
    const e = 1e-6;
    const fx0 = (x - dx - g.x0) / g.s + e,
      fx1 = (x + dx - g.x0) / g.s - e,
      fy0 = (y - dy - g.y0) / g.s + e,
      fy1 = (y + dy - g.y0) / g.s - e;
    if (fx1 <= fx0 || fy1 <= fy0) return false;
    const i0 = Math.max(0, Math.floor(fx0)),
      i1 = Math.min(g.cols - 1, Math.ceil(fx1) - 1),
      j0 = Math.max(0, Math.floor(fy0)),
      j1 = Math.min(g.rows - 1, Math.ceil(fy1) - 1);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return this.covered(x, y);
    for (let j = j0; j <= j1; j++) {
      const row = j * g.cols;
      for (let i = i0; i <= i1; i++) if (g.bits[row + i] === 1) return true;
    }
    return false;
  }
  private covered(x: number, y: number): boolean {
    const g = this.cov;
    if (!g) return false;
    const i = Math.floor((x - g.x0) / g.s),
      j = Math.floor((y - g.y0) / g.s);
    return i >= 0 && j >= 0 && i < g.cols && j < g.rows && g.bits[j * g.cols + i] === 1;
  }
  /**
   * Quick, exact rejection for a w×h box centred at (x, y). In strict mode the box grown by the spacing
   * may not touch anything; otherwise its inner 40% (the "center" no other item may cover) may not.
   */
  private rejected(x: number, y: number, w: number, h: number): boolean {
    if (!(w > 0 && h > 0)) return false;
    const r = this.ctx.rules;
    return r.mode === 'strict' ? this.touchesCovered(x, y, w / 2 + Math.max(0, r.spacing), h / 2 + Math.max(0, r.spacing)) : this.touchesCovered(x, y, (w / 2) * 0.4, (h / 2) * 0.4);
  }
  valid(c: Collider): boolean {
    if (c.kind === 'rect' && this.rejected(c.cx, c.cy, c.hw * 2, c.hh * 2)) return false;
    return insideArea(c, this.ctx.area) && canPlace(c, this.hash, this.ctx.rules, this.ctx.keepOut);
  }
  /** valid(rectCollider(x, y, w, h)) without building the collider for the many rejected candidates. */
  validBox(x: number, y: number, w: number, h: number): boolean {
    if (this.rejected(x, y, w, h)) return false;
    return this.valid(rectCollider(x, y, w, h));
  }
  add(c: Collider) {
    this.insert(c);
  }
  /** Distance from point to nearest placed center (bounded by `cap`). */
  nearest(p: Vec, cap: number): number {
    let best = cap;
    for (const o of this.hash.query({ x: p.x - cap, y: p.y - cap, w: cap * 2, h: cap * 2 })) {
      const ob = colliderBounds(o.c);
      // distance between box edges (0 if overlapping) + center distance blend
      const dx = Math.max(0, Math.abs(p.x - (ob.x + ob.w / 2)) - ob.w / 2);
      const dy = Math.max(0, Math.abs(p.y - (ob.y + ob.h / 2)) - ob.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
    return best;
  }
  /**
   * Best-candidate sampling (Mitchell): evaluate `k` valid random candidates and keep the one
   * farthest from existing items, giving an even but organic distribution.
   * Returns null if no valid candidate was found within the attempt budget.
   */
  bestCandidate(w: number, h: number, sample: () => Vec | null, k = 18, attempts = 220, weight?: (p: Vec) => number): Vec | null {
    let best: Vec | null = null;
    let bestScore = -Infinity;
    let found = 0;
    const cap = Math.max(w, h) * 4;
    for (let i = 0; i < attempts && found < k; i++) {
      const p = sample();
      if (!p) continue;
      const c = rectCollider(p.x, p.y, w, h);
      if (!this.valid(c)) continue;
      found++;
      const score = this.nearest(p, cap) * (weight ? weight(p) : 1);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }
  /** Least-overlapping candidate (fallback when nothing is valid). */
  leastBad(w: number, h: number, sample: () => Vec | null, attempts = 60): Vec {
    let best: Vec = { x: this.ctx.area.x + this.ctx.area.w / 2, y: this.ctx.area.y + this.ctx.area.h / 2 };
    let bestCost = Infinity;
    for (let i = 0; i < attempts; i++) {
      const p = sample();
      if (!p) continue;
      const c = rectCollider(p.x, p.y, w, h);
      if (!insideArea(c, this.ctx.area)) continue;
      const cost = overlapCost(inflate(c, this.ctx.rules.spacing), this.hash, this.ctx.keepOut);
      if (cost < bestCost) {
        bestCost = cost;
        best = p;
      }
    }
    return best;
  }
}

/** Random point inside the area keeping a box of w×h fully inside. */
export function areaSampler(ctx: LayoutContext, w: number, h: number): () => Vec {
  const a = ctx.area;
  return () => ({ x: a.x + w / 2 + ctx.rng() * Math.max(0, a.w - w), y: a.y + h / 2 + ctx.rng() * Math.max(0, a.h - h) });
}

/** Free area (area minus keep-out & obstacles, approximated). */
export function freeArea(ctx: LayoutContext): number {
  let a = ctx.area.w * ctx.area.h;
  for (const k of [...ctx.keepOut, ...ctx.obstacles]) {
    const b = colliderBounds(k);
    const ix = Math.max(0, Math.min(b.x + b.w, ctx.area.x + ctx.area.w) - Math.max(b.x, ctx.area.x));
    const iy = Math.max(0, Math.min(b.y + b.h, ctx.area.y + ctx.area.h) - Math.max(b.y, ctx.area.y));
    a -= ix * iy * (k.kind === 'ellipse' ? 0.785 : 1);
  }
  return Math.max(a * 0.15, a);
}

/** Uniformly scale a set of placements about a point. */
export function scalePlacements(ps: Placement[], center: Vec, k: number): Placement[] {
  return ps.map((p) => ({ ...p, cx: center.x + (p.cx - center.x) * k, cy: center.y + (p.cy - center.y) * k, w: p.w * k, h: p.h * k }));
}

/** Fit the bounding box of placements into the area (only shrinks unless `grow`). */
export function fitPlacements(ps: Placement[], area: Rect, grow = false): Placement[] {
  if (!ps.length) return ps;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of ps) {
    const c = placementCollider(p);
    const b = colliderBounds(c);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  const bw = x1 - x0,
    bh = y1 - y0;
  let k = Math.min(area.w / bw, area.h / bh);
  if (!grow) k = Math.min(1, k);
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const tx = area.x + area.w / 2,
    ty = area.y + area.h / 2;
  return ps.map((p) => ({ ...p, cx: tx + (p.cx - cx) * k, cy: ty + (p.cy - cy) * k, w: p.w * k, h: p.h * k }));
}

/** Split n into `parts` integers proportional to weights (largest remainder), each ≥ min. */
export function apportion(n: number, weights: number[], min = 0): number[] {
  const parts = weights.length;
  if (!parts) return [];
  const base = Math.min(min, Math.floor(n / parts));
  let rest = n - base * parts;
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * rest);
  const out = raw.map((r) => Math.floor(r));
  rest -= out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < rest; i++) out[order[i % parts][1]]++;
  return out.map((v) => v + base);
}
