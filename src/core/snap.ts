// Smart guides for move operations (Canva / Figma style): the moving selection's visible bounds
// snap to the page edges and center, to nearby objects' edges and centers, to guides, the safe
// zone and the grid — and to equal spacing between its neighbours, with distance labels.

import type { Rect } from './types';

export interface SnapLine {
  pos: number;
  /** Extent along the other axis, for drawing the guide between matched objects. */
  from: number;
  to: number;
  kind: 'canvas' | 'center' | 'object' | 'guide' | 'grid' | 'safe';
  /** The object this line belongs to (object lines only) — used to ignore far-away objects. */
  rect?: Rect;
}

export interface SnapTargets {
  x: SnapLine[];
  y: SnapLine[];
  /** Other objects, for equal-spacing snaps. */
  rects: Rect[];
  page: { width: number; height: number };
}

export interface SnapSettings {
  enabled: boolean;
  canvas: boolean;
  objects: boolean;
  guides: boolean;
  grid: boolean;
  gridSize: number;
  /** Threshold in screen pixels. */
  strength: number;
  /** Snap to equal spacing between neighbours (with distance labels). */
  spacing?: boolean;
}

export interface SnapGuideLine {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  /** 'line' = alignment guide; 'gap' = spacing measurement (drawn with end ticks and a label);
   *  'box' = outline of the snapped selection (`rect`). */
  kind?: 'line' | 'edge' | 'center' | 'gap' | 'box' | 'target';
  label?: string;
  rect?: Rect;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuideLine[];
}

export function buildTargets(page: { width: number; height: number }, others: Rect[], guides: { axis: 'x' | 'y'; pos: number }[], safe: Rect | null, s: SnapSettings): SnapTargets {
  const x: SnapLine[] = [],
    y: SnapLine[] = [];
  if (s.canvas) {
    x.push({ pos: 0, from: 0, to: page.height, kind: 'canvas' }, { pos: page.width / 2, from: 0, to: page.height, kind: 'center' }, { pos: page.width, from: 0, to: page.height, kind: 'canvas' });
    y.push({ pos: 0, from: 0, to: page.width, kind: 'canvas' }, { pos: page.height / 2, from: 0, to: page.width, kind: 'center' }, { pos: page.height, from: 0, to: page.width, kind: 'canvas' });
    if (safe) {
      for (const v of [safe.x, safe.x + safe.w]) x.push({ pos: v, from: 0, to: page.height, kind: 'safe' });
      for (const v of [safe.y, safe.y + safe.h]) y.push({ pos: v, from: 0, to: page.width, kind: 'safe' });
    }
  }
  if (s.guides) for (const g of guides) (g.axis === 'x' ? x : y).push({ pos: g.pos, from: 0, to: g.axis === 'x' ? page.height : page.width, kind: 'guide' });
  if (s.objects) {
    for (const r of others) {
      for (const v of [r.x, r.x + r.w / 2, r.x + r.w]) x.push({ pos: v, from: r.y, to: r.y + r.h, kind: 'object', rect: r });
      for (const v of [r.y, r.y + r.h / 2, r.y + r.h]) y.push({ pos: v, from: r.x, to: r.x + r.w, kind: 'object', rect: r });
    }
  }
  return { x, y, rects: s.objects ? others : [], page };
}

/** Gap between two rects (0 when they overlap). */
function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

function snapAxis(edges: number[], lines: SnapLine[], threshold: number, moving: Rect, reach: number): { d: number; line: SnapLine | null; edge: number } {
  let best = { d: 0, line: null as SnapLine | null, edge: 0, score: Infinity };
  for (const l of lines) {
    // with many icons, only nearby objects are useful alignment targets
    if (l.rect && rectDistance(l.rect, moving) > reach) continue;
    for (const e of edges) {
      const d = l.pos - e;
      const a = Math.abs(d);
      if (a > threshold) continue;
      // page center and edges win ties so centering is easy to hit
      const score = a - (l.kind === 'center' ? threshold * 0.5 : l.kind === 'canvas' ? threshold * 0.2 : 0);
      if (score < best.score) best = { d, line: l, edge: e, score };
    }
  }
  return best;
}

const fmt = (v: number) => String(Math.round(v));

/** Equal spacing between the nearest neighbours on each side along one axis. */
function spacingSnap(m: Rect, rects: Rect[], axis: 'x' | 'y', threshold: number, maxGap: number): { d: number; guides: SnapGuideLine[] } | null {
  const lo = axis === 'x' ? (r: Rect) => r.x : (r: Rect) => r.y;
  const size = axis === 'x' ? (r: Rect) => r.w : (r: Rect) => r.h;
  const cross0 = axis === 'x' ? (r: Rect) => r.y : (r: Rect) => r.x;
  const crossS = axis === 'x' ? (r: Rect) => r.h : (r: Rect) => r.w;
  const overlaps = (r: Rect) => cross0(r) < cross0(m) + crossS(m) && cross0(m) < cross0(r) + crossS(r);
  let before: Rect | null = null,
    after: Rect | null = null;
  for (const r of rects) {
    if (!overlaps(r)) continue;
    const gb = lo(m) - (lo(r) + size(r));
    const ga = lo(r) - (lo(m) + size(m));
    if (gb >= -threshold && gb < maxGap && (!before || lo(r) + size(r) > lo(before) + size(before))) before = r;
    if (ga >= -threshold && ga < maxGap && (!after || lo(r) < lo(after))) after = r;
  }
  if (!before || !after) return null;
  const g1 = lo(m) - (lo(before) + size(before));
  const g2 = lo(after) - (lo(m) + size(m));
  const d = (g2 - g1) / 2;
  if (Math.abs(d) > threshold) return null;
  const gap = g1 + d;
  if (gap < 1) return null;
  // measurement lines sit in the middle of the overlap between neighbours and the moving box
  const mid = (a: Rect) => (Math.max(cross0(a), cross0(m)) + Math.min(cross0(a) + crossS(a), cross0(m) + crossS(m))) / 2;
  const s0 = lo(before) + size(before),
    s1 = lo(m) + d;
  const e0 = lo(m) + d + size(m),
    e1 = lo(after);
  return {
    d,
    guides: [
      { axis, pos: mid(before), from: s0, to: s1, kind: 'gap', label: fmt(gap) },
      { axis, pos: mid(after), from: e0, to: e1, kind: 'gap', label: fmt(gap) },
      // the two neighbours the spacing is measured against
      { axis, pos: 0, from: 0, to: 0, kind: 'target', rect: before },
      { axis, pos: 0, from: 0, to: 0, kind: 'target', rect: after },
    ],
  };
}

/** Snap the moving rect (already offset by the raw drag) and return the correction + guides. */
export function snapRect(moving: Rect, targets: SnapTargets, s: SnapSettings, zoom: number): SnapResult {
  const res: SnapResult = { dx: 0, dy: 0, guides: [] };
  if (!s.enabled) return res;
  const th = s.strength / Math.max(zoom, 1e-3);
  const reach = Math.max(moving.w, moving.h) * 3 + 120 / Math.max(zoom, 1e-3);
  const ex = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const ey = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const sx = snapAxis(ex, targets.x, th, moving, reach);
  const sy = snapAxis(ey, targets.y, th, moving, reach);
  const maxGap = Math.max(targets.page.width, targets.page.height) * 0.4;
  const spacing = s.spacing !== false;
  const gx = !spacing || sx.line?.kind === 'center' ? null : spacingSnap(moving, targets.rects, 'x', th, maxGap);
  const gy = !spacing || sy.line?.kind === 'center' ? null : spacingSnap(moving, targets.rects, 'y', th, maxGap);
  let useGapX = false,
    useGapY = false;
  if (sx.line && (!gx || Math.abs(sx.d) <= Math.abs(gx.d))) res.dx = sx.d;
  else if (gx) {
    res.dx = gx.d;
    useGapX = true;
  } else if (s.grid && s.gridSize > 0) {
    const g = s.gridSize;
    const d = Math.round(moving.x / g) * g - moving.x;
    if (Math.abs(d) <= th) res.dx = d;
  }
  if (sy.line && (!gy || Math.abs(sy.d) <= Math.abs(gy.d))) res.dy = sy.d;
  else if (gy) {
    res.dy = gy.d;
    useGapY = true;
  } else if (s.grid && s.gridSize > 0) {
    const g = s.gridSize;
    const d = Math.round(moving.y / g) * g - moving.y;
    if (Math.abs(d) <= th) res.dy = d;
  }
  const my0 = moving.y + res.dy,
    my1 = my0 + moving.h;
  const mx0 = moving.x + res.dx,
    mx1 = mx0 + moving.w;
  // One clear guide per direction (like Canva): page lines run edge to edge, object lines join the
  // moving selection to the object it lines up with.
  const lineGuide = (axis: 'x' | 'y', l: SnapLine, a0: number, a1: number): SnapGuideLine => ({
    axis,
    pos: l.pos,
    kind: l.kind === 'center' ? 'center' : l.kind === 'object' ? 'line' : 'edge',
    from: l.kind === 'object' ? Math.min(l.from, a0) : l.from,
    to: l.kind === 'object' ? Math.max(l.to, a1) : l.to,
  });
  if (sx.line && !useGapX) res.guides.push(lineGuide('x', sx.line, my0, my1));
  if (sy.line && !useGapY) res.guides.push(lineGuide('y', sy.line, mx0, mx1));
  // show which object an alignment line belongs to
  const linked = [sx.line && !useGapX ? sx.line.rect : undefined, sy.line && !useGapY ? sy.line.rect : undefined].filter((r): r is Rect => !!r);
  for (const r of new Set(linked)) res.guides.push({ axis: 'x', pos: 0, from: 0, to: 0, kind: 'target', rect: r });
  if (useGapX && gx) res.guides.push(...gx.guides);
  if (useGapY && gy) res.guides.push(...gy.guides);
  if (res.guides.length) res.guides.push({ axis: 'x', pos: 0, from: 0, to: 0, kind: 'box', rect: { x: mx0, y: my0, w: moving.w, h: moving.h } });
  return res;
}

/** Soft rotation snap to 0°, 45°, 90°… within `tol` degrees. */
export function snapAngle(deg: number, tol = 4): number {
  const n = Math.round(deg / 45) * 45;
  return Math.abs(n - deg) <= tol ? n : deg;
}

// ---------------------------------------------------------------------------
// Resizing: only the edges being dragged snap (to the page, guides and other objects)
// ---------------------------------------------------------------------------

export interface EdgeSnap {
  /** Correction for the snapped edge. */
  d: number;
  /** Which edge snapped: -1 = left / top, 1 = right / bottom. */
  side: -1 | 1;
  line: SnapLine;
}

/**
 * Snap the moving edges of a resized rect along one axis. `move`: -1 low edge, 1 high edge,
 * 2 both (resizing from the center), 0 none.
 */
export function snapResizeAxis(rect: Rect, axis: 'x' | 'y', move: -1 | 0 | 1 | 2, targets: SnapTargets, s: SnapSettings, zoom: number): EdgeSnap | null {
  if (!s.enabled || !move) return null;
  const th = s.strength / Math.max(zoom, 1e-3);
  const reach = Math.max(rect.w, rect.h) * 3 + 120 / Math.max(zoom, 1e-3);
  const lo = axis === 'x' ? rect.x : rect.y;
  const hi = lo + (axis === 'x' ? rect.w : rect.h);
  const edges = move === -1 ? [lo] : move === 1 ? [hi] : [lo, hi];
  const r = snapAxis(edges, axis === 'x' ? targets.x : targets.y, th, rect, reach);
  if (!r.line) return null;
  return { d: r.d, side: r.edge === hi && move !== -1 ? 1 : -1, line: r.line };
}

/** Guides for a finished resize step: the matched lines and the selection outline. */
export function resizeGuides(rect: Rect, sx: EdgeSnap | null, sy: EdgeSnap | null): SnapGuideLine[] {
  const out: SnapGuideLine[] = [];
  const mk = (axis: 'x' | 'y', l: SnapLine, a0: number, a1: number): SnapGuideLine => ({
    axis,
    pos: l.pos,
    kind: l.kind === 'center' ? 'center' : l.kind === 'object' ? 'line' : 'edge',
    from: l.kind === 'object' ? Math.min(l.from, a0) : l.from,
    to: l.kind === 'object' ? Math.max(l.to, a1) : l.to,
  });
  if (sx) out.push(mk('x', sx.line, rect.y, rect.y + rect.h));
  if (sy) out.push(mk('y', sy.line, rect.x, rect.x + rect.w));
  for (const r of new Set([sx?.line.rect, sy?.line.rect].filter((v): v is Rect => !!v))) out.push({ axis: 'x', pos: 0, from: 0, to: 0, kind: 'target', rect: r });
  if (out.length) out.push({ axis: 'x', pos: 0, from: 0, to: 0, kind: 'box', rect });
  return out;
}
