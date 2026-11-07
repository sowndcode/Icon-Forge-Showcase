// Perspective Floor must keep producing exactly the arrangement it produced before small-pack support:
// for layouts saved earlier (no 'adaptive' parameter) at every pack size, and for 'auto' from 40 icons.
// Snapshots were recorded from the implementation before the change.

import './helpers/canvasStub';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPage, createProject } from '../src/core/defaults';
import type { AssetRecord, LayoutInstance, Page } from '../src/core/types';
import { getAsset, loadDoc } from '../src/state/doc';
import { newImageObject } from '../src/state/objects';
import { runLayout } from '../src/layout/run';
import { defaultParams, getAlgorithm } from '../src/layout/registry';

const icon = (i: number): AssetRecord => {
  const s = [48, 64, 96, 128][i % 4];
  return { id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: ['A', 'B', 'C'][i % 3], width: s, height: s + (i % 3) * 6, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 3, y: 2, w: s - 6, h: s - 2 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: s / 2, y: s / 2 } } };
};

let seed = 1;
beforeEach(() => {
  seed = 1;
  vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
});
afterEach(() => vi.restoreAllMocks());

function floor(n: number, extra: Record<string, string | number | boolean> = {}): Page['layouts'][number]['slots'] {
  const d = createProject('x');
  d.assets = Array.from({ length: n }, (_, i) => icon(i));
  let page = createPage('p', 1920, 1080);
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  const objs = d.assets.map((a) => newImageObject(a.id, { x: 960, y: 540 }, page, 0.1));
  const inst: LayoutInstance = { id: 'lay1', name: 'Floor', algorithm: 'floor', params: { ...defaultParams(getAlgorithm('floor')), ...extra }, seed: 7, objectIds: objs.map((o) => o.id), slots: [], overlap: 'showcase', maxOverlap: 0.3, avoidFocal: false, respectSafe: true };
  delete (inst.params as Record<string, unknown>).adaptive;
  Object.assign(inst.params, extra);
  page = { ...page, objects: objs.map((o) => ({ ...o, layoutId: inst.id })), layouts: [inst] };
  const out = runLayout(page, inst, { getAsset });
  return JSON.parse(JSON.stringify(out.layouts[0].slots, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}

describe('Perspective Floor compatibility', () => {
  for (const n of [5, 12, 22, 50, 180, 500])
    for (const arrange of ['organic', 'rows', 'grid'])
      it(`saved layouts unchanged: ${n} icons, ${arrange}`, () => {
        expect(floor(n, { arrange })).toMatchSnapshot();
      });

  for (const n of [40, 50, 180, 500])
    it(`'auto' changes nothing from ${n} icons`, () => {
      expect(floor(n, { adaptive: 'auto' })).toEqual(floor(n));
    });

  it('small packs: steady depth progression, everything on the page', () => {
    for (const n of [5, 12, 22, 30]) {
      const sl = floor(n, { adaptive: 'auto' });
      expect(sl).toHaveLength(n);
      for (const s of sl) {
        expect(s.cy - s.h / 2).toBeGreaterThan(-1);
        expect(s.cy + s.h / 2).toBeLessThan(1081);
      }
      // nearer rows are never smaller than farther rows (by row average)
      const rows = new Map<number, number[]>();
      for (const s of sl) {
        const k = Math.round((s.depth ?? 0) * 20);
        rows.set(k, [...(rows.get(k) ?? []), Math.max(s.w, s.h)]);
      }
      const avgs = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.reduce((x, y) => x + y, 0) / v.length);
      if (avgs.length > 1) expect(avgs[avgs.length - 1] / avgs[0]).toBeGreaterThan(1.6);
    }
  });
});
