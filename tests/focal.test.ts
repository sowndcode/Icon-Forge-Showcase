import { describe, expect, it } from 'vitest';
import { createImage, createPage } from '../src/core/defaults';
import { intersects, rectCollider } from '../src/core/collide';
import { visibleAABB } from '../src/core/transform';
import type { AssetRecord, ImageObject, LayoutInstance, Page } from '../src/core/types';
import { ALGORITHMS, defaultParams } from '../src/layout/registry';
import { runLayout } from '../src/layout/run';

function asset(id: string, vw: number, vh: number, category: string): AssetRecord {
  return { id, name: id + '.png', format: 'png', kind: 'asset', folder: '', category, width: 512, height: 512, bytes: 1, importIndex: 0, addedAt: 0, status: 'ready', alpha: { bounds: { x: (512 - vw) / 2, y: (512 - vh) / 2, w: vw, h: vh }, occupancy: 0.5, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 256, y: 256 } } };
}

/** Icons whose visible box covers part of the focal region (beyond a small tolerance). */
export function focalHits(algorithm: string, n: number, top = false) {
  const assets = new Map<string, AssetRecord>();
  const page: Page = createPage('t', 1920, 1080);
  page.focal = top ? { enabled: true, shape: 'rect', x: 960, y: 170, w: 1300, h: 220 } : { enabled: true, shape: 'ellipse', x: 960, y: 540, w: 760, h: 300 };
  const objs: ImageObject[] = [];
  for (let i = 0; i < n; i++) {
    const a = asset('a' + i, 200 + ((i * 97) % 300), 200 + ((i * 53) % 300), ['A', 'B', 'C'][i % 3]);
    assets.set(a.id, a);
    objs.push({ ...createImage(a.id, a.id, 100, 100, 200, 200), id: 'o' + i, layoutId: 'L' });
  }
  const alg = ALGORITHMS.find((a) => a.id === algorithm)!;
  const inst: LayoutInstance = { id: 'L', name: '', algorithm, params: defaultParams(alg), seed: 7, objectIds: objs.map((o) => o.id), slots: [], overlap: alg.defaultOverlap ?? 'strict', maxOverlap: 0.3, avoidFocal: true, respectSafe: true };
  const out = runLayout({ ...page, objects: objs, layouts: [inst] }, inst, { getAsset: (id) => assets.get(id) });
  const f = top ? rectCollider(960, 170, 1300 - 12, 220 - 12) : { kind: 'ellipse' as const, cx: 960, cy: 540, rx: 380 - 6, ry: 150 - 6 };
  return out.objects.filter((o) => {
    const b = visibleAABB(o, assets.get((o as ImageObject).assetId));
    return intersects(rectCollider(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.9, b.h * 0.9), f);
  }).length;
}

// layouts where avoiding a central region contradicts the design (the center is the point)
const CENTER_BY_DESIGN = new Set(['compare']);

describe('avoid focal region', () => {
  for (const alg of ALGORITHMS)
    for (const n of [12, 60])
      it(`${alg.id} with ${n} icons keeps the focal region clear`, () => {
        if (CENTER_BY_DESIGN.has(alg.id)) return;
        expect(focalHits(alg.id, n)).toBe(0);
      });

  for (const alg of ALGORITHMS)
    it(`${alg.id} keeps a title band at the top clear`, () => {
      if (CENTER_BY_DESIGN.has(alg.id)) return;
      expect(focalHits(alg.id, 40, true)).toBe(0);
    });
});
