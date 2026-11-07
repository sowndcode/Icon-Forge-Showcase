// Organic layouts: Scatter, Cluster, Hero Composition, Edge Frame.
// All are seeded, respect overlap rules, pinned objects and keep-out regions.

import { colliderBounds, rectCollider, type Collider } from '../core/collide';
import { clamp, DEG } from '../core/geometry';
import type { Rect, Vec } from '../core/types';
import { areaSampler, boxForSize, freeArea, Placer } from './common';
import { bool, num, str, type LayoutAlgorithm, type LayoutContext, type LayoutItem, type Placement } from './types';

/** Place items one by one (largest first) using best-candidate sampling; shrink when crowded. */
function organicPlace(
  items: LayoutItem[],
  sizeOf: (it: LayoutItem, i: number) => number,
  ctx: LayoutContext,
  sample: (w: number, h: number) => () => Vec | null,
  opts: { rot?: (it: LayoutItem, i: number) => number; weight?: (p: Vec) => number; k?: number; placer?: Placer } = {},
): Placement[] {
  const order = items.map((it, i) => ({ it, i, t: sizeOf(it, i) })).sort((a, b) => b.t - a.t);
  const avg = order.reduce((a, o) => a + o.t, 0) / Math.max(1, order.length);
  const placer = opts.placer ?? new Placer(ctx, avg * 1.5);
  const out: Placement[] = new Array(items.length);
  for (const { it, i, t } of order) {
    const rot = opts.rot ? opts.rot(it, i) : 0;
    let size = t;
    let pos: Vec | null = null;
    let b = boxForSize(it, size);
    for (let shrink = 0; shrink < 7 && !pos; shrink++) {
      b = boxForSize(it, size);
      const rb = rotatedBox(b.w, b.h, rot);
      pos = placer.bestCandidate(rb.w, rb.h, sample(rb.w, rb.h), opts.k ?? 14, 260, opts.weight);
      if (!pos) size *= 0.9;
    }
    if (!pos) {
      const rb = rotatedBox(b.w, b.h, rot);
      pos = placer.leastBad(rb.w, rb.h, sample(rb.w, rb.h));
    }
    const rb = rotatedBox(b.w, b.h, rot);
    placer.add(rectCollider(pos.x, pos.y, rb.w, rb.h));
    out[i] = { id: it.id, cx: pos.x, cy: pos.y, w: b.w, h: b.h, rot };
  }
  return out;
}

/** Collision box for a rotated visible box (between tight box and full AABB — icons aren't solid). */
function rotatedBox(w: number, h: number, rot: number) {
  if (!rot) return { w, h };
  const c = Math.abs(Math.cos(rot * DEG)),
    s = Math.abs(Math.sin(rot * DEG));
  return { w: (w + (w * c + h * s)) / 2, h: (h + (w * s + h * c)) / 2 };
}

const sizeRangeParams = [
  { key: 'sizeMin', label: 'Scale min', type: 'range' as const, default: 0.8, min: 0.2, max: 2, step: 0.01, scale: 100, unit: '%' },
  { key: 'sizeMax', label: 'Scale max', type: 'range' as const, default: 1.15, min: 0.2, max: 2.5, step: 0.01, scale: 100, unit: '%' },
];

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

export const scatterLayout: LayoutAlgorithm = {
  id: 'scatter',
  label: 'Scatter',
  description: 'Even, organic random distribution (seeded). Change the seed for a new arrangement.',
  group: 'Showcase',
  random: true,
  defaultOverlap: 'strict',
  params: [
    { key: 'density', label: 'Density', type: 'range', default: 0.42, min: 0.08, max: 0.85, step: 0.01, scale: 100, unit: '%' },
    { key: 'spacing', label: 'Minimum spacing', type: 'range', default: 10, min: 0, max: 120, unit: 'px' },
    ...sizeRangeParams,
    { key: 'rotation', label: 'Rotation range', type: 'range', default: 0, min: 0, max: 180, unit: '°', hint: '0 keeps every asset upright' },
    { key: 'edge', label: 'Edge padding', type: 'range', default: 20, min: 0, max: 300, unit: 'px', advanced: true },
  ],
  run(items, p, ctx0) {
    if (!items.length) return [];
    const edge = num(p, 'edge', 20);
    const ctx = { ...ctx0, area: shrinkRect(ctx0.area, edge), rules: { ...ctx0.rules, spacing: num(p, 'spacing', 10) } };
    const density = num(p, 'density', 0.42);
    const base = Math.sqrt((freeArea(ctx) * density) / items.length);
    const rng = ctx.rng.fork('scatter');
    const smin = num(p, 'sizeMin', 0.8),
      smax = Math.max(smin, num(p, 'sizeMax', 1.15));
    const sizes = items.map(() => base * (smin + (smax - smin) * rng()));
    const rotR = num(p, 'rotation', 0);
    const rots = items.map(() => rng.sym() * rotR);
    const prng = ctx.rng.fork('scatter-pos');
    return organicPlace(items, (_it, i) => sizes[i], { ...ctx, rng: prng }, (w, h) => areaSampler({ ...ctx, rng: prng }, w, h), { rot: (_it, i) => rots[i] });
  },
};

function shrinkRect(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: Math.max(10, r.w - 2 * d), h: Math.max(10, r.h - 2 * d) };
}

// ---------------------------------------------------------------------------
// Cluster
// ---------------------------------------------------------------------------

export const clusterLayout: LayoutAlgorithm = {
  id: 'cluster',
  label: 'Cluster',
  description: 'Tight organic groups growing from cluster centers; optionally one cluster per category.',
  group: 'Showcase',
  random: true,
  defaultOverlap: 'relaxed',
  params: [
    {
      key: 'shape',
      label: 'Shape',
      type: 'select',
      default: 'fit',
      options: [
        { value: 'fit', label: 'Fit the canvas' },
        { value: 'circle', label: 'Round' },
        { value: 'wide', label: 'Wide band' },
      ],
      when: (q) => Number(q.clusters ?? 1) <= 1 && !q.byCategory,
    },
    { key: 'clusters', label: 'Clusters', type: 'int', default: 1, min: 1, max: 8 },
    { key: 'byCategory', label: 'Cluster by category', type: 'bool', default: false },
    { key: 'density', label: 'Size', type: 'range', default: 0.5, min: 0.1, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'gap', label: 'Gap', type: 'range', default: 6, min: 0, max: 80, unit: 'px' },
    { key: 'variation', label: 'Size variation', type: 'range', default: 0.25, min: 0, max: 0.8, step: 0.01, scale: 100, unit: '%' },
    { key: 'rotation', label: 'Rotation range', type: 'range', default: 0, min: 0, max: 90, unit: '°', hint: '0 keeps every asset upright' },
  ],
  run(items, p, ctx0) {
    const n = items.length;
    if (!n) return [];
    const ctx = { ...ctx0, rules: { ...ctx0.rules, spacing: num(p, 'gap', 6) } };
    const a = ctx.area;
    const rng = ctx.rng.fork('cluster');
    // groups
    let groups: LayoutItem[][];
    if (bool(p, 'byCategory')) {
      const m = new Map<string, LayoutItem[]>();
      for (const it of items) {
        const k = it.category || '—';
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(it);
      }
      groups = [...m.values()];
    } else {
      const k = Math.max(1, Math.min(num(p, 'clusters', 1), n));
      groups = Array.from({ length: k }, () => []);
      items.forEach((it, i) => groups[i % k].push(it));
    }
    const k = groups.length;
    // cluster centers: spread evenly through the area (best candidate), avoiding keep-out
    const centers: Vec[] = [];
    if (k === 1 && !ctx.keepOut.length) centers.push({ x: a.x + a.w / 2, y: a.y + a.h / 2 });
    else {
      for (let c = 0; c < k; c++) {
        let best: Vec = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        let bestD = -1;
        for (let t = 0; t < 80; t++) {
          const q = { x: a.x + a.w * (0.15 + 0.7 * rng()), y: a.y + a.h * (0.15 + 0.7 * rng()) };
          if (ctx.keepOut.some((ko) => pointInCollider(q, ko))) continue;
          let d = Infinity;
          for (const o of centers) d = Math.min(d, Math.hypot((q.x - o.x) / a.w, (q.y - o.y) / a.h));
          for (const ko of ctx.keepOut) {
            const kb = colliderBounds(ko);
            d = Math.min(d, Math.hypot((q.x - (kb.x + kb.w / 2)) / a.w, (q.y - (kb.y + kb.h / 2)) / a.h) * 1.4);
          }
          d = Math.min(d, (q.x - a.x) / a.w * 2, (a.x + a.w - q.x) / a.w * 2, (q.y - a.y) / a.h * 2, (a.y + a.h - q.y) / a.h * 2);
          if (d > bestD) {
            bestD = d;
            best = q;
          }
        }
        centers.push(best);
      }
    }
    const base0 = Math.sqrt((freeArea(ctx) * num(p, 'density', 0.5)) / n);
    const variation = num(p, 'variation', 0.25);
    const rotR = num(p, 'rotation', 0);
    // Per-item size factor and rotation are drawn once so a retry at a smaller scale keeps the same look.
    const plan = groups.map((g) => g.map((it) => ({ it, k: 1 + rng.sym() * variation, rot: rng.sym() * rotR })).sort((x, y) => y.k - x.k));
    const phases = groups.map(() => rng() * 360);
    // Grow each cluster as an ellipse matching the area's shape, so wide canvases get wide clusters
    // instead of a circle squashed against the top and bottom edges.
    const shape = str(p, 'shape', 'fit');
    const aspect = k > 1 ? 1 : shape === 'circle' ? 1 : shape === 'wide' ? clamp((a.w / a.h) * 1.7, 0.4, 4) : clamp(a.w / a.h, 0.4, 2.5);
    const sx = Math.sqrt(aspect),
      sy = 1 / Math.sqrt(aspect);
    // Furthest spiral radius that can still land inside the area, per cluster center: beyond it every
    // candidate is off-canvas, so a failing search can stop there instead of scanning on.
    const maxRs = centers.map((c) => Math.max(...[a.x, a.x + a.w].flatMap((x) => [a.y, a.y + a.h].map((y) => Math.hypot((x - c.x) / sx, (y - c.y) / sy)))));

    // Place everything at `scale`. Returns null if any item had no valid spot (caller shrinks and retries),
    // unless `force` is set, in which case the least-overlapping spot is used.
    const attempt = (scale: number, force: boolean): Placement[] | null => {
      const base = base0 * scale;
      const placer = new Placer(ctx, base * 1.4);
      const out: Placement[] = [];
      for (let gi = 0; gi < plan.length; gi++) {
        const center = centers[gi];
        for (const { it, k: sk, rot } of plan[gi]) {
          const b = boxForSize(it, base * sk);
          const rb = rotatedBox(b.w, b.h, rot);
          // golden-angle spiral outward from the cluster center
          const step = Math.max(2, Math.min(rb.w, rb.h) * 0.3);
          let placed: Placement | null = null;
          for (let s = 0; s < 20000; s++) {
            const r = step * Math.sqrt(s);
            if (r > maxRs[gi]) break;
            const ang = (phases[gi] + s * 137.508) * DEG;
            const qx = center.x + Math.cos(ang) * r * sx,
              qy = center.y + Math.sin(ang) * r * sy;
            if (placer.validBox(qx, qy, rb.w, rb.h)) {
              placer.add(rectCollider(qx, qy, rb.w, rb.h));
              placed = { id: it.id, cx: qx, cy: qy, w: b.w, h: b.h, rot };
              break;
            }
          }
          if (!placed) {
            if (!force) return null;
            const q = placer.leastBad(rb.w, rb.h, areaSampler(ctx, rb.w, rb.h), 120);
            placer.add(rectCollider(q.x, q.y, rb.w, rb.h));
            placed = { id: it.id, cx: q.x, cy: q.y, w: b.w, h: b.h, rot };
          }
          out.push(placed);
        }
      }
      return out;
    };

    let out: Placement[] | null = null;
    let scale = 1;
    for (let tries = 0; tries < 10 && !out; tries++) {
      out = attempt(scale, false);
      if (!out) scale *= 0.9;
    }
    out ??= attempt(scale, true)!;
    // A single free-standing cluster is re-centered (the spiral can drift toward one side).
    if (k === 1 && !ctx.keepOut.length && !ctx.obstacles.length) out = recenter(out, a);
    return out;
  },
};

/** Cluster preset that packs into a circle — reads well behind or under a centered title. */
export const roundClusterLayout: LayoutAlgorithm = {
  ...clusterLayout,
  id: 'roundcluster',
  label: 'Round Cluster',
  description: 'A tight, circular bunch of assets in the middle of the canvas.',
  params: clusterLayout.params.map((d) => (d.key === 'shape' ? { ...d, default: 'circle' } : d.key === 'density' ? { ...d, default: 0.36 } : d)),
};

function recenter(ps: Placement[], area: Rect): Placement[] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of ps) {
    const rb = rotatedBox(p.w, p.h, p.rot);
    x0 = Math.min(x0, p.cx - rb.w / 2);
    x1 = Math.max(x1, p.cx + rb.w / 2);
    y0 = Math.min(y0, p.cy - rb.h / 2);
    y1 = Math.max(y1, p.cy + rb.h / 2);
  }
  const dx = area.x + area.w / 2 - (x0 + x1) / 2,
    dy = area.y + area.h / 2 - (y0 + y1) / 2;
  return ps.map((p) => ({ ...p, cx: p.cx + dx, cy: p.cy + dy }));
}

function pointInCollider(p: Vec, c: Collider) {
  if (c.kind === 'rect') return Math.abs(p.x - c.cx) <= c.hw && Math.abs(p.y - c.cy) <= c.hh;
  return ((p.x - c.cx) / c.rx) ** 2 + ((p.y - c.cy) / c.ry) ** 2 <= 1;
}

// ---------------------------------------------------------------------------
// Hero composition
// ---------------------------------------------------------------------------

const HERO_SLOTS: Record<number, { x: number; y: number; s: number }[]> = {
  1: [{ x: 0, y: 0, s: 1 }],
  2: [
    { x: -0.32, y: 0.02, s: 0.92 },
    { x: 0.32, y: -0.02, s: 0.92 },
  ],
  3: [
    { x: 0, y: -0.04, s: 1 },
    { x: -0.5, y: 0.1, s: 0.72 },
    { x: 0.5, y: 0.1, s: 0.72 },
  ],
  4: [
    { x: -0.2, y: -0.04, s: 0.88 },
    { x: 0.2, y: -0.04, s: 0.88 },
    { x: -0.62, y: 0.12, s: 0.66 },
    { x: 0.62, y: 0.12, s: 0.66 },
  ],
  5: [
    { x: 0, y: -0.06, s: 1 },
    { x: -0.42, y: 0.04, s: 0.74 },
    { x: 0.42, y: 0.04, s: 0.74 },
    { x: -0.8, y: 0.16, s: 0.58 },
    { x: 0.8, y: 0.16, s: 0.58 },
  ],
};

export const heroLayout: LayoutAlgorithm = {
  id: 'hero',
  label: 'Hero Composition',
  description: '1–5 large hero assets in focus, the rest distributed around them.',
  group: 'Showcase',
  random: true,
  defaultOverlap: 'showcase',
  params: [
    { key: 'heroCount', label: 'Hero assets', type: 'int', default: 1, min: 1, max: 5, hint: 'Uses objects marked as hero, else the first in order.' },
    { key: 'heroScale', label: 'Hero scale', type: 'range', default: 0.42, min: 0.12, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'supportScale', label: 'Supporting scale', type: 'range', default: 1, min: 0.3, max: 2, step: 0.01, scale: 100, unit: '%' },
    { key: 'spread', label: 'Radial spread', type: 'range', default: 0.85, min: 0.3, max: 1.3, step: 0.01, scale: 100, unit: '%' },
    { key: 'density', label: 'Density', type: 'range', default: 0.4, min: 0.1, max: 0.85, step: 0.01, scale: 100, unit: '%' },
    { key: 'falloff', label: 'Size falloff', type: 'range', default: 0.4, min: 0, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'rotation', label: 'Rotation variation', type: 'range', default: 0, min: 0, max: 90, unit: '°', hint: '0 keeps every asset upright' },
    { key: 'heroY', label: 'Hero vertical offset', type: 'range', default: 0, min: -0.4, max: 0.4, step: 0.01, scale: 100, unit: '%', advanced: true },
  ],
  run(items, p, ctx0) {
    const n = items.length;
    if (!n) return [];
    const ctx = { ...ctx0, rules: { ...ctx0.rules, spacing: 6 } };
    const a = ctx.area;
    const rng = ctx.rng.fork('hero');
    const want = clamp(Math.round(num(p, 'heroCount', 1)), 1, Math.min(5, n));
    const flagged = items.filter((i) => i.hero);
    const heroes = (flagged.length ? flagged : items).slice(0, want);
    const heroSet = new Set(heroes.map((h) => h.id));
    const support = items.filter((i) => !heroSet.has(i.id));
    const hs = Math.min(a.w, a.h) * num(p, 'heroScale', 0.42);
    // hero group center; if the focal region is in the middle, sit the heroes just below it
    let hc: Vec = { x: a.x + a.w / 2, y: a.y + a.h / 2 + num(p, 'heroY') * a.h };
    const slots = HERO_SLOTS[heroes.length];
    const groupW = hs * (heroes.length > 1 ? 1.6 + heroes.length * 0.15 : 1);
    if (ctx.keepOut.length) {
      let best = hc,
        bestScore = -Infinity;
      for (let t = 0; t < 60; t++) {
        const q = { x: a.x + a.w * (0.2 + 0.6 * rng()), y: a.y + a.h * (0.2 + 0.6 * rng()) };
        const c = rectCollider(q.x, q.y, groupW, hs);
        const hit = ctx.keepOut.some((k) => overlapsCollider(c, k));
        const score = (hit ? -1e6 : 0) - Math.hypot(q.x - hc.x, q.y - hc.y);
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
      hc = best;
    }
    const placer = new Placer(ctx, hs * 0.5);
    const out: Placement[] = [];
    const rotR = num(p, 'rotation', 0);
    heroes.forEach((h, i) => {
      const s = slots[i];
      const b = boxForSize(h, hs * s.s);
      const rot = rng.sym() * rotR * 0.4;
      const cx = clamp(hc.x + s.x * groupW * 0.62, a.x + b.w / 2, a.x + a.w - b.w / 2);
      const cy = clamp(hc.y + s.y * hs, a.y + b.h / 2, a.y + a.h - b.h / 2);
      out.push({ id: h.id, cx, cy, w: b.w, h: b.h, rot, z: 1e6 - i * 10 });
      // heroes block the inner part of their box; supporting items may tuck under the edges
      placer.add(rectCollider(cx, cy, b.w * 0.82, b.h * 0.82));
    });
    if (!support.length) return out;
    const spread = num(p, 'spread', 0.85);
    const rx = (a.w / 2) * spread,
      ry = (a.h / 2) * spread;
    const ellArea = Math.PI * rx * ry;
    const heroArea = out.reduce((acc, o) => acc + o.w * o.h, 0);
    const base = Math.sqrt((Math.max(ellArea - heroArea, ellArea * 0.3) * num(p, 'density', 0.4)) / support.length) * num(p, 'supportScale', 1);
    const falloff = num(p, 'falloff', 0.4);
    const prng = ctx.rng.fork('hero-pos');
    const sizes = support.map(() => base * (0.85 + prng() * 0.3));
    const rots = support.map(() => prng.sym() * rotR);
    const sampler = (w: number, h: number) => () => {
      const ang = prng() * Math.PI * 2;
      const r = Math.sqrt(prng());
      const q = { x: hc.x + Math.cos(ang) * r * rx, y: hc.y + Math.sin(ang) * r * ry };
      if (q.x - w / 2 < a.x || q.x + w / 2 > a.x + a.w || q.y - h / 2 < a.y || q.y + h / 2 > a.y + a.h) return null;
      return q;
    };
    const placed = organicPlace(
      support,
      (_it, i) => sizes[i],
      { ...ctx, rng: prng },
      sampler,
      {
        placer,
        rot: (_it, i) => rots[i],
        // prefer positions near the heroes
        weight: (q) => 1.4 - Math.min(1, Math.hypot((q.x - hc.x) / rx, (q.y - hc.y) / ry)) * 0.6,
      },
    );
    for (const pl of placed) {
      const d = Math.min(1, Math.hypot((pl.cx - hc.x) / rx, (pl.cy - hc.y) / ry));
      const k = 1 - falloff * 0.45 * d;
      out.push({ ...pl, w: pl.w * k, h: pl.h * k, z: Math.round(pl.w * pl.h) });
    }
    return out;
  },
};

function overlapsCollider(a: Collider, b: Collider) {
  const ra = colliderBounds(a),
    rb = colliderBounds(b);
  return ra.x < rb.x + rb.w && rb.x < ra.x + ra.w && ra.y < rb.y + rb.h && rb.y < ra.y + ra.h;
}

// ---------------------------------------------------------------------------
// Edge frame
// ---------------------------------------------------------------------------

/** Central safe zone used by Edge Frame (also drawn as an editor guide). */
export function edgeFrameZone(p: Record<string, unknown>, area: Rect, focal: Collider | null): Collider {
  if (focal && p.useFocal !== false) return focal;
  const w = area.w * (typeof p.safeW === 'number' ? p.safeW : 0.5);
  const h = area.h * (typeof p.safeH === 'number' ? p.safeH : 0.42);
  const cx = area.x + area.w / 2,
    cy = area.y + area.h / 2;
  return p.safeShape === 'ellipse' ? { kind: 'ellipse', cx, cy, rx: w / 2, ry: h / 2 } : rectCollider(cx, cy, w, h);
}

export const edgeFrameLayout: LayoutAlgorithm = {
  id: 'edgeframe',
  label: 'Edge Frame',
  description: 'Assets frame the canvas edges, keeping a central safe zone free for a title.',
  group: 'Showcase',
  random: true,
  defaultOverlap: 'relaxed',
  safeZoneParams: true,
  params: [
    { key: 'safeW', label: 'Safe zone width', type: 'range', default: 0.5, min: 0.1, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'safeH', label: 'Safe zone height', type: 'range', default: 0.42, min: 0.1, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    {
      key: 'safeShape',
      label: 'Safe zone shape',
      type: 'select',
      default: 'rect',
      options: [
        { value: 'rect', label: 'Rectangle' },
        { value: 'ellipse', label: 'Ellipse' },
      ],
    },
    { key: 'useFocal', label: 'Use focal region as safe zone', type: 'bool', default: true },
    { key: 'density', label: 'Edge density', type: 'range', default: 0.55, min: 0.1, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'scale', label: 'Scale', type: 'range', default: 1, min: 0.3, max: 2, step: 0.01, scale: 100, unit: '%' },
    { key: 'rotation', label: 'Rotation', type: 'range', default: 0, min: 0, max: 90, unit: '°', hint: '0 keeps every asset upright' },
    { key: 'corners', label: 'Corner concentration', type: 'range', default: 0.35, min: 0, max: 1, step: 0.01, scale: 100, unit: '%' },
  ],
  run(items, p, ctx0) {
    const n = items.length;
    if (!n) return [];
    const zone = edgeFrameZone(p, ctx0.area, ctx0.focal);
    const ctx = { ...ctx0, keepOut: [...ctx0.keepOut.filter((k) => k !== zone), zone], rules: { ...ctx0.rules, spacing: 6 } };
    const a = ctx.area;
    const zb = colliderBounds(zone);
    const ringArea = Math.max(a.w * a.h - zb.w * zb.h * (zone.kind === 'ellipse' ? 0.785 : 1), a.w * a.h * 0.1);
    const band = Math.max(20, Math.min(zb.x - a.x, a.x + a.w - (zb.x + zb.w), zb.y - a.y, a.y + a.h - (zb.y + zb.h)) * 2);
    let base = Math.sqrt((ringArea * num(p, 'density', 0.55)) / n) * num(p, 'scale', 1);
    base = Math.min(base, Math.max(band * 0.95, base * 0.6));
    const rng = ctx.rng.fork('edge');
    const rotR = num(p, 'rotation', 0);
    const cc = num(p, 'corners', 0.35);
    const sizes = items.map(() => base * (0.85 + rng() * 0.3));
    const rots = items.map(() => rng.sym() * rotR);
    const prng = ctx.rng.fork('edge-pos');
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    const sampler = (w: number, h: number) => {
      const s = areaSampler({ ...ctx, rng: prng }, w, h);
      return () => {
        const q = s();
        if (cc > 0) {
          const nx = Math.abs(q.x - cx) / (a.w / 2),
            ny = Math.abs(q.y - cy) / (a.h / 2);
          const corner = Math.min(1, nx * ny * 1.2);
          if (prng() > 1 - cc + cc * corner) return null;
        }
        return q;
      };
    };
    return organicPlace(items, (_it, i) => sizes[i], { ...ctx, rng: prng }, sampler, { rot: (_it, i) => rots[i] });
  },
};
