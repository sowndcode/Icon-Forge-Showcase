// Ground Plane — icons lying flat on a receding floor, like tiles or cards laid on a table.
//
// Unlike Perspective Floor (icons stand upright and face the viewer), every icon here is projected
// onto the plane: it is foreshortened, narrower toward the back and its top points away. The layout
// works in plane coordinates (u across, v depth: 0 = far, 1 = near) on a grid of square floor cells;
// the runner maps each icon's rectangle through the plane (run.ts groundPatch) and the renderer warps
// the bitmap (renderer.ts). The plane's four corners are editable like Perspective Floor's.

import { planeMapper, presetPlane } from './perspective';
import { num, str, type LayoutAlgorithm, type LayoutItem, type Params, type Placement } from './types';

/** Columns and rows for `n` square floor cells on a plane of physical aspect `k` (width / depth). */
export function groundGrid(n: number, k: number, cols = 0, rows = 0): { C: number; R: number } {
  if (cols && rows) return { C: cols, R: rows };
  if (cols) return { C: cols, R: Math.max(1, Math.ceil(n / cols)) };
  if (rows) return { C: Math.max(1, Math.ceil(n / rows)), R: rows };
  const C = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * k))));
  return { C, R: Math.max(1, Math.ceil(n / C)) };
}

function runGround(items: LayoutItem[], p: Params, ctx: Parameters<LayoutAlgorithm['run']>[2]): Placement[] {
  const n = items.length;
  if (!n) return [];
  const quad = ctx.plane ?? presetPlane('floor', ctx.area, 'strong');
  const { map } = planeMapper('floor', quad, num(p, 'strength', 1));
  const spread = num(p, 'spread', 0.92);
  const farPad = num(p, 'farPad', 0.04),
    nearPad = num(p, 'nearPad', 0.04);
  const fill = num(p, 'fill', 0.8);
  // how deep the floor is compared with its width (1.6: a floor somewhat wider than it is deep)
  const depthRatio = num(p, 'depthRatio', 1.6);
  const depth = Math.max(0.05, 1 - farPad - nearPad);
  const { C, R } = groundGrid(n, (spread * depthRatio) / depth, num(p, 'columns'), num(p, 'rows'));
  const du = spread / C,
    dv = depth / R;
  // physical cell size (square when the counts came out even); icons fit inside with `fill`
  const cellW = du * depthRatio,
    cellH = dv;
  const order = str(p, 'fillFrom', 'front');
  const out: Placement[] = [];
  items.forEach((it, i) => {
    // fill rows from the front (or the back); a partial row is centred
    const r = Math.floor(i / C);
    const inRow = r === R - 1 ? n - C * (R - 1) : C;
    const c = i - r * C;
    const row = order === 'front' ? R - 1 - r : r;
    const off = (C - inRow) / 2;
    const uc = 0.5 - spread / 2 + du * (c + 0.5 + off);
    const vc = farPad + dv * (row + 0.5);
    // fit the icon's visible box (its aspect) inside the cell, in physical units
    const a = Math.max(0.05, it.aspect);
    let w = cellW * fill,
      h = w / a;
    if (h > cellH * fill) {
      h = cellH * fill;
      w = h * a;
    }
    const uw = w / depthRatio / 2,
      vh = h / 2;
    const uv = { u0: uc - uw, u1: uc + uw, v0: vc - vh, v1: vc + vh };
    const q = [map(uv.u0, uv.v0), map(uv.u1, uv.v0), map(uv.u1, uv.v1), map(uv.u0, uv.v1)];
    const xs = q.map((v) => v.x),
      ys = q.map((v) => v.y);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    out.push({ id: it.id, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, rot: 0, depth: vc, uv });
  });
  return out;
}

export const groundPlaneLayout: LayoutAlgorithm = {
  id: 'groundplane',
  label: 'Ground Plane',
  description: 'Icons lying flat on a receding floor, like cards on a table. Drag the 4 plane corners to change the camera angle.',
  group: 'Perspective',
  plane: 'floor',
  noCommon: true,
  params: [
    { key: 'fill', label: 'Icon size', type: 'range', default: 0.8, min: 0.3, max: 1, step: 0.01, scale: 100, unit: '%', hint: 'How much of its floor square each icon covers' },
    { key: 'spread', label: 'Horizontal spread', type: 'range', default: 0.92, min: 0.3, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    { key: 'strength', label: 'Perspective strength', type: 'range', default: 1, min: 0, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'depthRatio', label: 'Floor depth', type: 'range', default: 1.6, min: 0.6, max: 4, step: 0.05, decimals: 2, hint: 'Width of the floor compared with its depth: higher gives more columns and shorter, flatter tiles' },
    { key: 'rows', label: 'Rows', type: 'int', default: 0, min: 0, max: 40, autoZero: true },
    { key: 'columns', label: 'Columns', type: 'int', default: 0, min: 0, max: 60, autoZero: true },
    {
      key: 'fillFrom',
      label: 'First icons',
      type: 'select',
      default: 'front',
      options: [
        { value: 'front', label: 'In front' },
        { value: 'back', label: 'At the back' },
      ],
    },
    { key: 'nearPad', label: 'Near padding', type: 'range', default: 0.04, min: 0, max: 0.4, step: 0.01, scale: 100, unit: '%', advanced: true },
    { key: 'farPad', label: 'Far padding', type: 'range', default: 0.04, min: 0, max: 0.4, step: 0.01, scale: 100, unit: '%', advanced: true },
  ],
  run: (items, p, ctx) => runGround(items, p, ctx),
};
