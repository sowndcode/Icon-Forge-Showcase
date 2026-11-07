// Runs a LayoutInstance against a page: builds items from the managed (unpinned) objects,
// runs the algorithm, applies variation, converts visible-box placements back into object
// transforms and updates paint order for depth-aware layouts. Pure: returns a new Page.

import { colliderBounds, rectCollider, type Collider, intersects } from '../core/collide';
import { rectContains } from '../core/geometry';
import { createRng } from '../core/rng';
import { currentVisibleBox, placeImageByVisibleBox, visibleAABB, visibleSize, type AssetLookup } from '../core/transform';
import type { AssetRecord, ImageObject, LayoutInstance, Page, Quad, Rect, SceneObject, Slot, Vec } from '../core/types';
import { placementCollider } from './common';
import type { LayoutAlgorithm } from './types';
import { planeMapper, presetPlane } from './perspective';
import { presetPath } from './path';
import { getAlgorithm, withDefaults } from './registry';
import { edgeFrameZone } from './scatter';
import { num, str, type LayoutContext, type LayoutItem, type Placement } from './types';

export function safeRect(page: Page): Rect {
  const s = page.safeZone;
  if (!s.enabled) return { x: 0, y: 0, w: page.width, h: page.height };
  const l = (page.width * s.left) / 100,
    r = (page.width * s.right) / 100,
    t = (page.height * s.top) / 100,
    b = (page.height * s.bottom) / 100;
  return { x: l, y: t, w: Math.max(10, page.width - l - r), h: Math.max(10, page.height - t - b) };
}

export function layoutArea(page: Page, inst: Pick<LayoutInstance, 'respectSafe'>): Rect {
  return inst.respectSafe ? safeRect(page) : { x: 0, y: 0, w: page.width, h: page.height };
}

export function focalCollider(page: Page): Collider | null {
  const f = page.focal;
  if (!f.enabled || f.w <= 0 || f.h <= 0) return null;
  return f.shape === 'ellipse' ? { kind: 'ellipse', cx: f.x, cy: f.y, rx: f.w / 2, ry: f.h / 2 } : rectCollider(f.x, f.y, f.w, f.h);
}

export function instancePlane(page: Page, inst: LayoutInstance) {
  const alg = getAlgorithm(inst.algorithm);
  if (!alg.plane) return undefined;
  return inst.plane ?? presetPlane(alg.plane, layoutArea(page, inst));
}

export function instancePath(page: Page, inst: LayoutInstance) {
  const alg = getAlgorithm(inst.algorithm);
  if (!alg.usesPath) return undefined;
  return inst.path && inst.path.length >= 2 ? inst.path : presetPath('arc', layoutArea(page, inst));
}

function median(v: number[]) {
  if (!v.length) return 1;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] || 1;
}

function orderItems(items: LayoutItem[], order: string, seed: number): LayoutItem[] {
  const s = items.slice();
  switch (order) {
    case 'name':
      return s.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    case 'category':
      return s.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    case 'size':
      return s.sort((a, b) => b.rel - a.rel);
    case 'aspect':
      return s.sort((a, b) => a.aspect - b.aspect);
    case 'random':
      return createRng(seed ^ 0x5bd1e995).shuffle(s);
    default:
      return s;
  }
}

/** Seeded per-item variation that never pushes items outside the area or into keep-out zones. */
function applyJitter(ps: Placement[], ctx: LayoutContext, jPos: number, jScale: number, jRot: number): Placement[] {
  if (!jPos && !jScale && !jRot) return ps;
  const rng = ctx.rng.fork('jitter');
  const strict = ctx.rules.mode === 'strict';
  const done: Collider[] = [];
  return ps.map((p) => {
    const r = rng.fork(p.id);
    const dx = r.sym() * jPos * p.w * 0.5,
      dy = r.sym() * jPos * p.h * 0.5;
    const ks = 1 + r.sym() * jScale;
    const dr = r.sym() * jRot;
    for (const f of [1, 0.6, 0.3, 0]) {
      const q = { ...p, cx: p.cx + dx * f, cy: p.cy + dy * f, w: p.w * (1 + (ks - 1) * f), h: p.h * (1 + (ks - 1) * f), rot: p.rot + dr * f };
      const c = placementCollider(q);
      const b = { x: c.kind === 'rect' ? c.cx - c.hw : 0, y: c.kind === 'rect' ? c.cy - c.hh : 0, w: c.kind === 'rect' ? c.hw * 2 : 0, h: c.kind === 'rect' ? c.hh * 2 : 0 };
      const inside = rectContains(ctx.area, b, 1);
      const hitsKeep = ctx.keepOut.some((k) => intersects(c, k));
      const hitsOthers = strict && done.some((d) => intersects(c, d));
      if (f === 0 || (inside && !hitsKeep && !hitsOthers)) {
        done.push(c);
        return q;
      }
    }
    return p;
  });
}

// ---------------------------------------------------------------------------
// Keeping the focal region clear for every layout
// ---------------------------------------------------------------------------

/** Layouts built around a centre piece: they move as a whole into the free part of the page. */
const MOVE_WHOLE = new Set(['hero', 'heroshowcase', 'orbit', 'shapefill', 'spiral', 'fan', 'circle', 'arc', 'split', 'pyramid']);
/** Layouts where a hole would break the design (matching halves). */
const NO_KEEPOUT = new Set(['compare']);

const hitsKeepOut = (p: Placement, keepOut: Collider[]) => {
  // a little tolerance: soft edges of icons may graze the region
  const c = placementCollider({ ...p, w: p.w * 0.92, h: p.h * 0.92 });
  return keepOut.some((k) => intersects(c, k));
};

/** Largest free rectangle above, below, left or right of the keep-out shapes. */
function freeRegion(area: Rect, keepOut: Collider[]): Rect | null {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const k of keepOut) {
    const b = colliderBounds(k);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  const m = Math.min(area.w, area.h) * 0.015;
  const cands: Rect[] = [
    { x: area.x, y: area.y, w: area.w, h: y0 - m - area.y },
    { x: area.x, y: y1 + m, w: area.w, h: area.y + area.h - y1 - m },
    { x: area.x, y: area.y, w: x0 - m - area.x, h: area.h },
    { x: x1 + m, y: area.y, w: area.x + area.w - x1 - m, h: area.h },
  ].filter((r) => r.w > area.w * 0.12 && r.h > area.h * 0.12);
  if (!cands.length) return null;
  // prefer roomy and not too thin
  const score = (r: Rect) => r.w * r.h * Math.min(1, Math.min(r.w, r.h) / (Math.max(r.w, r.h) * 0.35));
  const best = cands.sort((a, b) => score(b) - score(a))[0];
  return best.w * best.h >= area.w * area.h * 0.12 ? best : null;
}

/**
 * Stand-in slots: lay out extra copies, drop the slots that fall in the keep-out and give the real
 * icons the rest — grids, rows and other structured layouts keep their look with a hole around the title.
 */
function slotsAround(alg: LayoutAlgorithm, items: LayoutItem[], params: Record<string, unknown>, ctx: LayoutContext, first: Placement[]): Placement[] | null {
  const n = items.length;
  const areaOf = new Map(first.map((p) => [p.id, p.w * p.h]));
  let extra = Math.max(1, first.filter((p) => hitsKeepOut(p, ctx.keepOut)).length);
  for (let iter = 0; iter < 8; iter++) {
    const padded = [...items, ...Array.from({ length: extra }, (_, i) => ({ ...items[i % n], id: `__slot${i}`, index: n + i }))];
    const free = alg.run(padded, params as never, { ...ctx, rng: ctx.rng.fork('slots' + iter) }).filter((p) => !hitsKeepOut(p, ctx.keepOut));
    if (free.length >= n) {
      // big icons keep big slots (hero-like layouts); within a size class the order is kept
      const cls = (a: number) => Math.round(Math.log2(Math.max(1, a)) * 2);
      const order = items.map((it, i) => ({ it, i, c: cls(areaOf.get(it.id) ?? 0) })).sort((a, b) => b.c - a.c || a.i - b.i);
      const slots = free
        .slice(0, n)
        .map((p, i) => ({ p, i, c: cls(p.w * p.h) }))
        .sort((a, b) => b.c - a.c || a.i - b.i);
      return order.map(({ it }, k) => {
        const slot = slots[k].p;
        // refit the icon into its new slot at the same visual area
        const area = slot.w * slot.h;
        let w = Math.sqrt(area * it.aspect),
          h = Math.sqrt(area / it.aspect);
        const over = Math.max(w / (Math.max(slot.w, slot.h) * 1.1), h / (Math.max(slot.w, slot.h) * 1.1), 1);
        w /= over;
        h /= over;
        const fitted = { ...slot, id: it.id, w, h };
        if (!hitsKeepOut(fitted, ctx.keepOut)) return fitted;
        // next to the region: stay inside the slot's own box
        const shrink = Math.min(slot.w / w, slot.h / h, 1);
        return { ...slot, id: it.id, w: w * shrink, h: h * shrink };
      });
    }
    extra += Math.ceil((n - free.length) * 1.4) + 1;
  }
  return null;
}

/** Run a layout and make sure nothing lands in the keep-out (focal region) when asked to avoid it. */
function runAvoiding(alg: LayoutAlgorithm, items: LayoutItem[], params: Record<string, unknown>, ctx: LayoutContext): Placement[] {
  const first = alg.run(items, params as never, ctx);
  if (!ctx.keepOut.length || !items.length || NO_KEEPOUT.has(alg.id) || !first.some((p) => hitsKeepOut(p, ctx.keepOut))) return first;
  if (MOVE_WHOLE.has(alg.id)) {
    const region = freeRegion(ctx.area, ctx.keepOut);
    if (region) {
      const moved = alg.run(items, params as never, { ...ctx, area: region });
      if (!moved.some((p) => hitsKeepOut(p, ctx.keepOut))) return moved;
    }
  }
  return slotsAround(alg, items, params, ctx, first) ?? first;
}

export interface RunOptions {
  getAsset: AssetLookup;
}

export function buildContext(page: Page, inst: LayoutInstance, obstacles: Collider[]): LayoutContext {
  const focal = focalCollider(page);
  return {
    page: { w: page.width, h: page.height },
    area: layoutArea(page, inst),
    obstacles,
    keepOut: inst.avoidFocal && focal ? [focal] : [],
    focal,
    rules: { mode: inst.overlap, maxOverlap: inst.maxOverlap, spacing: 0 },
    rng: createRng(inst.seed),
    seed: inst.seed,
    plane: instancePlane(page, inst),
    path: instancePath(page, inst),
  };
}

export function runLayout(page: Page, inst: LayoutInstance, { getAsset }: RunOptions): Page {
  const alg = getAlgorithm(inst.algorithm);
  const params = withDefaults(alg, inst.params);
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const members = inst.objectIds.map((id) => byId.get(id)).filter((o): o is ImageObject => !!o && o.type === 'image' && o.layoutId === inst.id);
  const pinned = members.filter((o) => o.pinned);
  const free = members.filter((o) => !o.pinned && !o.hidden);
  const obstacles: Collider[] = pinned.map((o) => {
    const b = visibleAABB(o, getAsset(o.assetId));
    return rectCollider(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h);
  });
  const ctx = buildContext(page, inst, obstacles);
  const sizes = free.map((o) => visibleSize(getAsset(o.assetId)));
  const med = median(sizes.map((s) => Math.sqrt(s.w * s.h)));
  let items: LayoutItem[] = free.map((o, i) => {
    const a = getAsset(o.assetId);
    const s = sizes[i];
    return { id: o.id, index: i, vw: s.w, vh: s.h, aspect: s.w / s.h, category: a?.category ?? '', name: a?.name ?? o.name, rel: Math.sqrt(s.w * s.h) / med, hero: !!o.hero };
  });
  // Reorganize gives the random order its own seed, so shuffling who-goes-where never moves the slots
  items = orderItems(items, str(params, 'order', 'current'), num(params, 'orderSeed', inst.seed));
  let placements = runAvoiding(alg, items, params, ctx);
  if (!alg.noCommon) placements = applyJitter(placements, ctx, num(params, 'jPos'), num(params, 'jScale'), num(params, 'jRot'));

  // Manual depth overrides (perspective): rescale to the override depth
  const near = num(params, 'near', 1),
    far = num(params, 'far', 1);
  const scaleAt = (d: number) => Math.max(0.01, far + (near - far) * d);
  const pmap = new Map(placements.map((p) => [p.id, p]));
  const patches = new Map<string, Partial<SceneObject>>();
  for (const o of free) {
    const pl = pmap.get(o.id);
    if (!pl) continue;
    let { w, h } = pl;
    if (alg.plane && o.depthMode === 'manual' && typeof o.depth === 'number' && pl.depth !== undefined) {
      const k = scaleAt(o.depth) / scaleAt(pl.depth);
      w *= k;
      h *= k;
    }
    if (pl.uv && alg.plane && ctx.plane) patches.set(o.id, groundPatch(o, getAsset(o.assetId), pl.uv, planeMapper(alg.plane, ctx.plane, num(params, 'strength', 1)).map));
    else {
      const patch: Partial<ImageObject> = placeImageByVisibleBox(o, getAsset(o.assetId), pl.cx, pl.cy, w, h, pl.rot);
      // an icon that lay on a Ground Plane stands up again under any other layout
      if (o.warp) patch.warp = undefined;
      patches.set(o.id, patch);
    }
  }
  const slots: Slot[] = placements.map((p) => ({ cx: p.cx, cy: p.cy, w: p.w, h: p.h, rot: p.rot, depth: p.depth }));
  let objects = page.objects.map((o) => {
    const p = patches.get(o.id);
    return p ? ({ ...o, ...p } as SceneObject) : o;
  });

  // Paint order
  const hasDepth = placements.some((p) => p.depth !== undefined);
  const hasZ = placements.some((p) => p.z !== undefined);
  if (hasDepth) objects = depthSortObjects(objects, { ...page, objects }, inst, getAsset);
  else if (hasZ) {
    const z = new Map(placements.map((p) => [p.id, p.z ?? 0]));
    objects = reorderSubset(objects, new Set(z.keys()), (a, b) => (z.get(a.id) ?? 0) - (z.get(b.id) ?? 0));
  }
  const layouts = page.layouts.map((l) => (l.id === inst.id ? { ...inst, slots } : l));
  return { ...page, objects, layouts };
}

/**
 * An image lying on the plane: its visible box covers the plane rectangle `uv`; the whole bitmap (with
 * its transparent padding) is mapped through the plane, and the corners are stored in box units.
 */
export function groundPatch(o: ImageObject, asset: AssetRecord | undefined, uv: NonNullable<Placement['uv']>, map: (a: number, d: number) => Vec): Partial<ImageObject> {
  const W = asset?.width || o.w || 1,
    H = asset?.height || o.h || 1;
  const b = asset?.alpha && !asset.alpha.empty ? asset.alpha.bounds : { x: 0, y: 0, w: W, h: H };
  const du = (uv.u1 - uv.u0) / Math.max(1, b.w),
    dv = (uv.v1 - uv.v0) / Math.max(1, b.h);
  const uL = uv.u0 - b.x * du,
    uR = uv.u1 + (W - b.x - b.w) * du,
    vT = uv.v0 - b.y * dv,
    vB = uv.v1 + (H - b.y - b.h) * dv;
  // the icon's top points away from the viewer
  const q = [map(uL, vT), map(uR, vT), map(uR, vB), map(uL, vB)];
  const x0 = Math.min(...q.map((p) => p.x)),
    x1 = Math.max(...q.map((p) => p.x)),
    y0 = Math.min(...q.map((p) => p.y)),
    y1 = Math.max(...q.map((p) => p.y));
  const w = Math.max(1e-3, x1 - x0),
    h = Math.max(1e-3, y1 - y0);
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  // the renderer applies the object's flips after the warp: pre-mirror so the corners land in place
  const warp = q.map((p) => ({ x: ((p.x - cx) / w) * (o.flipX ? -1 : 1), y: ((p.y - cy) / h) * (o.flipY ? -1 : 1) })) as Quad;
  return { x: cx, y: cy, w, h, rotation: 0, warp };
}

/** Reorder a subset of objects among the stack positions they already occupy. */
export function reorderSubset(objects: SceneObject[], ids: Set<string>, cmp: (a: SceneObject, b: SceneObject) => number): SceneObject[] {
  const idx: number[] = [];
  const subset: SceneObject[] = [];
  objects.forEach((o, i) => {
    if (ids.has(o.id)) {
      idx.push(i);
      subset.push(o);
    }
  });
  if (subset.length < 2) return objects;
  subset.sort(cmp);
  const out = objects.slice();
  idx.forEach((pos, k) => (out[pos] = subset[k]));
  return out;
}

/** Depth of an object on a perspective layout's plane (manual override or from position). */
export function objectDepth(o: SceneObject, page: Page, inst: LayoutInstance, getAsset: AssetLookup): number {
  if (o.depthMode === 'manual' && typeof o.depth === 'number') return o.depth;
  const alg = getAlgorithm(inst.algorithm);
  const plane = instancePlane(page, inst);
  if (!alg.plane || !plane) return 0.5;
  const { depthOf } = planeMapper(alg.plane, plane, num(withDefaults(alg, inst.params), 'strength', 1));
  const vb = currentVisibleBox(o, o.type === 'image' ? getAsset(o.assetId) : undefined);
  // floors: objects stand on the plane → use the bottom of the visible box (flat Ground Plane tiles: the middle)
  const pt = alg.plane === 'floor' && !(o.type === 'image' && o.warp) ? { x: vb.cx, y: vb.cy + vb.h * 0.42 } : { x: vb.cx, y: vb.cy };
  return depthOf(pt);
}

export function depthSortObjects(objects: SceneObject[], page: Page, inst: LayoutInstance, getAsset: AssetLookup): SceneObject[] {
  const ids = new Set(inst.objectIds);
  const depth = new Map<string, number>();
  for (const o of objects) if (ids.has(o.id) && o.layoutId === inst.id) depth.set(o.id, objectDepth(o, page, inst, getAsset));
  const alg = getAlgorithm(inst.algorithm);
  return reorderSubset(objects, new Set(depth.keys()), (a, b) => {
    const d = (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0);
    if (Math.abs(d) > 1e-4) return d;
    return alg.plane === 'floor' ? a.y - b.y : 0;
  });
}

/** Editor-only guides for a layout instance. */
export function layoutGuides(page: Page, inst: LayoutInstance) {
  const alg = getAlgorithm(inst.algorithm);
  const params = withDefaults(alg, inst.params);
  const area = layoutArea(page, inst);
  return {
    area,
    plane: instancePlane(page, inst),
    planeKind: alg.plane,
    strength: num(params, 'strength', 1),
    path: instancePath(page, inst),
    zone: alg.safeZoneParams ? edgeFrameZone(params, area, focalCollider(page)) : null,
  };
}
