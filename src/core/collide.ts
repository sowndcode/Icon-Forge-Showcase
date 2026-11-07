// Collision / overlap model used by Smart Layouts.
//
// V1 colliders are axis-aligned visible boxes and ellipses (for focal regions). Everything goes
// through the `Collider` union and the functions below, so a future mask/polygon collider can be
// added as another variant without touching the layout algorithms.

import type { OverlapMode, Rect } from './types';
import { clamp, intersectionArea } from './geometry';

export type Collider =
  | { kind: 'rect'; cx: number; cy: number; hw: number; hh: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export function rectCollider(cx: number, cy: number, w: number, h: number): Collider {
  return { kind: 'rect', cx, cy, hw: w / 2, hh: h / 2 };
}

export function colliderBounds(c: Collider): Rect {
  return c.kind === 'rect'
    ? { x: c.cx - c.hw, y: c.cy - c.hh, w: c.hw * 2, h: c.hh * 2 }
    : { x: c.cx - c.rx, y: c.cy - c.ry, w: c.rx * 2, h: c.ry * 2 };
}

export function colliderArea(c: Collider): number {
  return c.kind === 'rect' ? 4 * c.hw * c.hh : Math.PI * c.rx * c.ry;
}

/** Does a rect intersect an ellipse? (exact for axis-aligned shapes) */
function rectEllipseIntersect(r: Rect, e: { cx: number; cy: number; rx: number; ry: number }): boolean {
  const px = clamp(e.cx, r.x, r.x + r.w);
  const py = clamp(e.cy, r.y, r.y + r.h);
  const dx = (px - e.cx) / e.rx;
  const dy = (py - e.cy) / e.ry;
  return dx * dx + dy * dy < 1;
}

/** Approximate overlap area between two colliders. */
export function overlapArea(a: Collider, b: Collider): number {
  const ra = colliderBounds(a);
  const rb = colliderBounds(b);
  const box = intersectionArea(ra, rb);
  if (!box) return 0;
  if (a.kind === 'rect' && b.kind === 'rect') return box;
  // ellipse involvement: test real intersection, then scale the box overlap by ellipse fill
  if (a.kind === 'rect' && b.kind === 'ellipse' && !rectEllipseIntersect(ra, b)) return 0;
  if (b.kind === 'rect' && a.kind === 'ellipse' && !rectEllipseIntersect(rb, a)) return 0;
  return box * (a.kind === 'ellipse' && b.kind === 'ellipse' ? 0.62 : 0.785);
}

export function intersects(a: Collider, b: Collider): boolean {
  return overlapArea(a, b) > 0;
}

/** Fraction of the SMALLER collider covered by the other (0..1). */
export function overlapRatio(a: Collider, b: Collider): number {
  const ov = overlapArea(a, b);
  if (!ov) return 0;
  return ov / Math.max(1e-6, Math.min(colliderArea(a), colliderArea(b)));
}

/** Does `b` cover the visual center region (inner 40%) of `a`? */
export function coversCenter(a: Collider, b: Collider): boolean {
  const inner: Collider = a.kind === 'rect' ? { ...a, hw: a.hw * 0.4, hh: a.hh * 0.4 } : { ...a, rx: a.rx * 0.4, ry: a.ry * 0.4 };
  return intersects(inner, b);
}

export function inflate(c: Collider, d: number): Collider {
  return c.kind === 'rect' ? { ...c, hw: c.hw + d, hh: c.hh + d } : { ...c, rx: c.rx + d, ry: c.ry + d };
}

export interface OverlapRules {
  mode: OverlapMode;
  /** Max fraction of the smaller item that may be covered (relaxed/showcase). */
  maxOverlap: number;
  /** Extra spacing around each item (px), used in strict mode. */
  spacing: number;
}

export function effectiveMaxOverlap(rules: OverlapRules): number {
  if (rules.mode === 'strict') return 0;
  if (rules.mode === 'relaxed') return Math.min(0.15, Math.max(0.05, rules.maxOverlap));
  return clamp(rules.maxOverlap, 0, 0.9);
}

/** Intersection area of the box (cx, cy, ±hw, ±hh) with a rect collider, computed exactly as colliderBounds + intersectionArea. */
function boxOverlap(cx: number, cy: number, hw: number, hh: number, o: { cx: number; cy: number; hw: number; hh: number }): number {
  const ax = cx - hw,
    aw = hw * 2,
    ay = cy - hh,
    ah = hh * 2;
  const bx = o.cx - o.hw,
    bw = o.hw * 2,
    by = o.cy - o.hh,
    bh = o.hh * 2;
  const w = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const h = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Uniform-grid spatial index for fast neighbour queries. */
export class SpatialHash<T extends { c: Collider }> {
  // cells hold item indices; `seen` marks items already returned by the current query
  private cells = new Map<number, number[]>();
  readonly items: T[] = [];
  private seen = new Uint32Array(64);
  private stamp = 0;
  constructor(private cell: number) {
    this.cell = Math.max(4, cell);
  }
  private key(ix: number, iy: number) {
    return (ix + 32768) * 65536 + (iy + 32768);
  }
  private range(r: Rect) {
    const s = this.cell;
    return [Math.floor(r.x / s), Math.floor(r.y / s), Math.floor((r.x + r.w) / s), Math.floor((r.y + r.h) / s)];
  }
  insert(item: T) {
    const idx = this.items.length;
    this.items.push(item);
    if (idx >= this.seen.length) {
      const grown = new Uint32Array(this.seen.length * 2);
      grown.set(this.seen);
      this.seen = grown;
    }
    const [x0, y0, x1, y1] = this.range(colliderBounds(item.c));
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = this.key(x, y);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(idx);
      }
  }
  /** Items whose cells touch `r`, each once, in first-seen order (the order a Set gave before). */
  query(r: Rect): T[] {
    const [x0, y0, x1, y1] = this.range(r);
    const out: T[] = [];
    if (++this.stamp === 0xffffffff) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const arr = this.cells.get(this.key(x, y));
        if (arr)
          for (const idx of arr)
            if (this.seen[idx] !== stamp) {
              this.seen[idx] = stamp;
              out.push(this.items[idx]);
            }
      }
    return out;
  }
}

/**
 * Checks whether collider `c` may be placed given already placed items and obstacles.
 * Obstacles (pinned objects, focal region) are never allowed to be overlapped beyond the rules;
 * hard obstacles (focal region) may not be touched at all.
 */
export function canPlace(
  c: Collider,
  placed: SpatialHash<{ c: Collider }>,
  rules: OverlapRules,
  hard: Collider[],
): boolean {
  for (const h of hard) if (intersects(c, h)) return false;
  const maxOv = effectiveMaxOverlap(rules);
  const probe = rules.mode === 'strict' ? inflate(c, rules.spacing) : c;
  for (const other of placed.query(colliderBounds(probe))) {
    const o = other.c;
    if (c.kind === 'rect' && o.kind === 'rect') {
      // rect–rect without allocating: the same arithmetic as overlapArea / overlapRatio / coversCenter
      if (rules.mode === 'strict') {
        if (probe.kind === 'rect' && boxOverlap(probe.cx, probe.cy, probe.hw, probe.hh, o)) return false;
        continue;
      }
      const ov = boxOverlap(c.cx, c.cy, c.hw, c.hh, o);
      if (!ov) continue;
      const r = ov / Math.max(1e-6, Math.min(4 * c.hw * c.hh, 4 * o.hw * o.hh));
      if (r > maxOv) return false;
      if (r > 0 && (boxOverlap(c.cx, c.cy, c.hw * 0.4, c.hh * 0.4, o) > 0 || boxOverlap(o.cx, o.cy, o.hw * 0.4, o.hh * 0.4, c) > 0)) return false;
      continue;
    }
    if (rules.mode === 'strict') {
      if (intersects(probe, other.c)) return false;
    } else {
      const r = overlapRatio(c, other.c);
      if (r > maxOv) return false;
      if (r > 0 && (coversCenter(c, other.c) || coversCenter(other.c, c))) return false;
    }
  }
  return true;
}

/** Overlap "cost" — used to choose the least-bad candidate when no valid position exists. */
export function overlapCost(c: Collider, placed: SpatialHash<{ c: Collider }>, hard: Collider[]): number {
  let cost = 0;
  for (const h of hard) cost += overlapArea(c, h) * 4;
  for (const o of placed.query(colliderBounds(c))) cost += overlapArea(c, o.c);
  return cost;
}
