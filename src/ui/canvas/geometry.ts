// Screen-space geometry for the editor: view transform, selection box and transform handles.

import { boundsOf, rotate } from '../../core/geometry';
import { currentVisibleBox, visibleCorners, type AssetLookup } from '../../core/transform';
import type { SceneObject, Vec } from '../../core/types';

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const toScreen = (v: View, p: Vec): Vec => ({ x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY });
export const toPage = (v: View, p: Vec): Vec => ({ x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom });

/** Oriented selection box in page units (visible bounds). */
export interface SelBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

export function selectionBox(objs: SceneObject[], getAsset: AssetLookup): SelBox | null {
  if (!objs.length) return null;
  if (objs.length === 1) {
    const o = objs[0];
    const vb = currentVisibleBox(o, o.type === 'image' ? getAsset(o.assetId) : undefined);
    return { cx: vb.cx, cy: vb.cy, w: Math.max(vb.w, 0.01), h: Math.max(vb.h, 0.01), rot: o.rotation };
  }
  const b = boundsOf(objs.flatMap((o) => visibleCorners(o, o.type === 'image' ? getAsset(o.assetId) : undefined)));
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: 0 };
}

export function boxCorners(b: SelBox): Vec[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => boxPoint(b, sx, sy));
}

export function boxPoint(b: SelBox, sx: number, sy: number): Vec {
  const r = rotate({ x: (sx * b.w) / 2, y: (sy * b.h) / 2 }, b.rot);
  return { x: b.cx + r.x, y: b.cy + r.y };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';
export const HANDLE_DIR: Record<HandleId, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  rot: [0, -1],
};

export interface HandlePos {
  id: HandleId;
  x: number;
  y: number;
}

/** Screen positions of handles. Side handles only for single objects and when there's room. */
export function handlePositions(b: SelBox, v: View, single: boolean): HandlePos[] {
  const out: HandlePos[] = [];
  const sw = b.w * v.zoom,
    sh = b.h * v.zoom;
  const ids: HandleId[] = ['nw', 'ne', 'se', 'sw'];
  if (single && sw > 36) ids.push('n', 's');
  if (single && sh > 36) ids.push('e', 'w');
  for (const id of ids) {
    const [sx, sy] = HANDLE_DIR[id];
    const p = toScreen(v, boxPoint(b, sx, sy));
    out.push({ id, x: p.x, y: p.y });
  }
  const top = toScreen(v, boxPoint(b, 0, -1));
  const up = rotate({ x: 0, y: -1 }, b.rot);
  out.push({ id: 'rot', x: top.x + up.x * 26, y: top.y + up.y * 26 });
  return out;
}

export function hitHandle(handles: HandlePos[], p: Vec, r = 7): HandleId | null {
  for (let i = handles.length - 1; i >= 0; i--) {
    const h = handles[i];
    if (Math.abs(h.x - p.x) <= r && Math.abs(h.y - p.y) <= r) return h.id;
  }
  return null;
}

const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
/** Resize cursor for a handle, rotated with the box. */
export function handleCursor(id: HandleId, rot: number): string {
  if (id === 'rot') return 'grab';
  const [sx, sy] = HANDLE_DIR[id];
  const ang = (Math.atan2(sy, sx) * 180) / Math.PI + rot; // direction of the handle
  const a = (((ang % 180) + 180) % 180) / 45; // 0..4
  const idx = Math.round(a) % 4; // 0: horizontal, 1: diag \, 2: vertical, 3: diag /
  return [CURSORS[2], CURSORS[3], CURSORS[0], CURSORS[1]][idx];
}
