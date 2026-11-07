// Object geometry. The key idea: for transparent images we reason about the VISIBLE box
// (alpha bounds), not the full PNG canvas — for hit testing, handles, alignment, snapping and layouts.

import type { AssetRecord, ImageObject, Rect, SceneObject, Vec } from './types';
import { boundsOf, rotate, unionRects } from './geometry';

export type AssetLookup = (id: string) => AssetRecord | undefined;

/** Visible rect in the object's local (unrotated, centered) coordinates. */
export function localVisibleRect(o: SceneObject, asset?: AssetRecord): Rect {
  if (o.type !== 'image' || !asset || !asset.alpha || asset.alpha.empty || !asset.width || !asset.height) {
    return { x: -o.w / 2, y: -o.h / 2, w: o.w, h: o.h };
  }
  const b = asset.alpha.bounds;
  const sx = o.w / asset.width;
  const sy = o.h / asset.height;
  let x = (b.x - asset.width / 2) * sx;
  let y = (b.y - asset.height / 2) * sy;
  const w = b.w * sx;
  const h = b.h * sy;
  if (o.flipX) x = -(x + w);
  if (o.flipY) y = -(y + h);
  return { x, y, w, h };
}

export function localToPage(o: { x: number; y: number; rotation: number }, p: Vec): Vec {
  const r = rotate(p, o.rotation);
  return { x: r.x + o.x, y: r.y + o.y };
}

export function pageToLocal(o: { x: number; y: number; rotation: number }, p: Vec): Vec {
  return rotate({ x: p.x - o.x, y: p.y - o.y }, -o.rotation);
}

export function localCorners(r: Rect): Vec[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function objectCorners(o: SceneObject): Vec[] {
  return localCorners({ x: -o.w / 2, y: -o.h / 2, w: o.w, h: o.h }).map((p) => localToPage(o, p));
}

export function visibleCorners(o: SceneObject, asset?: AssetRecord): Vec[] {
  return localCorners(localVisibleRect(o, asset)).map((p) => localToPage(o, p));
}

/** Axis-aligned page bounds of the full object box. */
export function objectAABB(o: SceneObject): Rect {
  return boundsOf(objectCorners(o));
}

/** Axis-aligned page bounds of the visible content. */
export function visibleAABB(o: SceneObject, asset?: AssetRecord): Rect {
  return boundsOf(visibleCorners(o, asset));
}

export function visibleCenter(o: SceneObject, asset?: AssetRecord): Vec {
  const r = localVisibleRect(o, asset);
  return localToPage(o, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}

export function selectionAABB(objs: SceneObject[], getAsset: AssetLookup, visible = true): Rect | null {
  return unionRects(objs.map((o) => (visible ? visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined) : objectAABB(o))));
}

/** Hit test against the visible rect (images) or box (text/shapes). */
export function hitObject(o: SceneObject, p: Vec, asset?: AssetRecord, tolerance = 0): boolean {
  const l = pageToLocal(o, p);
  const r = localVisibleRect(o, asset);
  if (o.type === 'shape' && o.shape === 'line') {
    const tol = Math.max(tolerance, o.strokeWidth / 2 + 3);
    return Math.abs(l.y) <= tol + r.h / 2 && l.x >= r.x - tol && l.x <= r.x + r.w + tol;
  }
  return l.x >= r.x - tolerance && l.x <= r.x + r.w + tolerance && l.y >= r.y - tolerance && l.y <= r.y + r.h + tolerance;
}

/**
 * Place an image so its VISIBLE box (visW × visH) is centered at (cx, cy) with rotation `rot`.
 * The visible box must have the asset's visible aspect; we fit-contain if it doesn't.
 */
export function placeImageByVisibleBox(
  o: ImageObject,
  asset: AssetRecord | undefined,
  cx: number,
  cy: number,
  boxW: number,
  boxH: number,
  rot: number,
): Partial<ImageObject> {
  const W = asset?.width || o.w || 1;
  const H = asset?.height || o.h || 1;
  const b = asset?.alpha && !asset.alpha.empty ? asset.alpha.bounds : { x: 0, y: 0, w: W, h: H };
  const s = Math.max(1e-4, Math.min(boxW / b.w, boxH / b.h));
  let ox = (b.x + b.w / 2 - W / 2) * s;
  let oy = (b.y + b.h / 2 - H / 2) * s;
  if (o.flipX) ox = -ox;
  if (o.flipY) oy = -oy;
  const off = rotate({ x: ox, y: oy }, rot);
  return { x: cx - off.x, y: cy - off.y, w: W * s, h: H * s, rotation: rot };
}

/** Visible size of an asset in source px (falls back to full size). */
export function visibleSize(asset?: AssetRecord): { w: number; h: number } {
  if (!asset) return { w: 1, h: 1 };
  if (asset.alpha && !asset.alpha.empty) return { w: Math.max(1, asset.alpha.bounds.w), h: Math.max(1, asset.alpha.bounds.h) };
  return { w: Math.max(1, asset.width), h: Math.max(1, asset.height) };
}

/** Current visible box of an image object on the page (center, size, rotation). */
export function currentVisibleBox(o: SceneObject, asset?: AssetRecord) {
  const r = localVisibleRect(o, asset);
  const c = localToPage(o, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  return { cx: c.x, cy: c.y, w: r.w, h: r.h, rot: o.rotation };
}

/** Scale an object uniformly by k about a page-space pivot. */
export function scaleAbout<T extends SceneObject>(o: T, pivot: Vec, kx: number, ky = kx): Partial<T> {
  const patch: Partial<SceneObject> = {
    x: pivot.x + (o.x - pivot.x) * kx,
    y: pivot.y + (o.y - pivot.y) * ky,
    w: Math.max(0.5, o.w * Math.abs(kx)),
    h: Math.max(0.5, o.h * Math.abs(ky)),
  };
  if (o.type === 'text') {
    const k = Math.abs(kx);
    (patch as Record<string, unknown>).style = {
      ...o.style,
      fontSize: Math.max(1, o.style.fontSize * k),
      letterSpacing: o.style.letterSpacing * k,
      stroke: { ...o.style.stroke, width: o.style.stroke.width * k },
      shadow: { ...o.style.shadow, blur: o.style.shadow.blur * k, dx: o.style.shadow.dx * k, dy: o.style.shadow.dy * k },
    };
  }
  if (o.type === 'shape') {
    (patch as Record<string, unknown>).strokeWidth = o.strokeWidth * Math.min(Math.abs(kx), Math.abs(ky));
    (patch as Record<string, unknown>).radius = o.radius * Math.min(Math.abs(kx), Math.abs(ky));
  }
  return patch as Partial<T>;
}

export function rotateAboutPivot<T extends SceneObject>(o: T, pivot: Vec, deg: number): Partial<T> {
  const r = rotate({ x: o.x - pivot.x, y: o.y - pivot.y }, deg);
  return { x: pivot.x + r.x, y: pivot.y + r.y, rotation: o.rotation + deg } as Partial<T>;
}
