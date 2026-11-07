import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createPage, createProject } from '../src/core/defaults';
import type { AssetRecord, ImageObject, LayoutInstance, Page } from '../src/core/types';
import { getAsset, loadDoc } from '../src/state/doc';
import { newImageObject } from '../src/state/objects';
import { runLayout } from '../src/layout/run';
import { defaultParams, getAlgorithm, ALGORITHMS } from '../src/layout/registry';
import { groundGrid } from '../src/layout/ground';

const icon = (i: number): AssetRecord => ({ id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: '', width: 64, height: 64, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 8, y: 8, w: 48, h: 48 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } } });

function laid(n: number, algorithm = 'groundplane', start?: Page): Page {
  const d = createProject('g');
  d.assets = Array.from({ length: n }, (_, i) => icon(i));
  let page = start ?? createPage('p', 1920, 1080);
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  const objs = start ? (start.objects as ImageObject[]) : d.assets.map((a) => newImageObject(a.id, { x: 960, y: 540 }, page, 0.1));
  const inst: LayoutInstance = { id: 'lay1', name: 'L', algorithm, params: defaultParams(getAlgorithm(algorithm)), seed: 3, objectIds: objs.map((o) => o.id), slots: [], overlap: 'showcase', maxOverlap: 0.3, avoidFocal: false, respectSafe: true };
  page = { ...page, objects: objs.map((o) => ({ ...o, layoutId: inst.id })), layouts: [inst] };
  return runLayout(page, inst, { getAsset });
}
const imgs = (p: Page) => p.objects.filter((o): o is ImageObject => o.type === 'image');

describe('Ground Plane', () => {
  it('is registered as a perspective layout next to Perspective Floor', () => {
    const ids = ALGORITHMS.map((a) => a.id);
    expect(ids.indexOf('groundplane')).toBe(ids.indexOf('floor') + 1);
    expect(getAlgorithm('groundplane').plane).toBe('floor');
  });

  it('chooses roughly square floor cells', () => {
    expect(groundGrid(12, 1.6)).toEqual({ C: 4, R: 3 });
    expect(groundGrid(100, 1.6)).toEqual({ C: 13, R: 8 });
    expect(groundGrid(10, 1.6, 5)).toEqual({ C: 5, R: 2 });
  });

  it('every icon lies on the floor: warped, foreshortened and smaller at the back', () => {
    const p = laid(30);
    const objs = imgs(p);
    expect(objs.every((o) => o.warp && o.warp.length === 4)).toBe(true);
    for (const o of objs) {
      const [tl, tr, br, bl] = o.warp!;
      // the far edge (top of the icon) is narrower than the near edge, and higher on screen
      expect(tr.x - tl.x).toBeLessThan(br.x - bl.x + 1e-9);
      expect(tl.y).toBeLessThan(bl.y);
      // corners stay inside the object's box
      for (const c of o.warp!) expect(Math.abs(c.x) <= 0.5 + 1e-6 && Math.abs(c.y) <= 0.5 + 1e-6).toBe(true);
    }
    const back = Math.min(...objs.map((o) => o.y)),
      front = Math.max(...objs.map((o) => o.y));
    const wAt = (y: number) => objs.filter((o) => Math.abs(o.y - y) < 5).map((o) => o.w)[0];
    expect(wAt(front)).toBeGreaterThan(wAt(back) * 1.4);
    // nearer icons are painted later (on top)
    const ys = objs.map((o) => o.y);
    expect(ys[ys.length - 1]).toBeGreaterThanOrEqual(ys[0]);
  });

  it('switching to another layout stands the icons up again', () => {
    const p = laid(12);
    const back = laid(12, 'grid', p);
    expect(imgs(back).every((o) => o.warp === undefined)).toBe(true);
  });
});
