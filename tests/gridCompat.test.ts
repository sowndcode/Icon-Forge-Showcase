// Grid must keep producing exactly the arrangement it produced before the size cap was added, for
// grids saved earlier (no 'maxCell' parameter) at every pack size. Snapshots were recorded from the
// implementation before the change.

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
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

type Slots = Page['layouts'][number]['slots'];

export function grid(n: number, extra: Record<string, string | number | boolean> = {}, W = 1920, H = 1080, saved = true): Slots {
  const d = createProject('x');
  d.assets = Array.from({ length: n }, (_, i) => icon(i));
  let page = createPage('p', W, H);
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  const objs = d.assets.map((a) => newImageObject(a.id, { x: W / 2, y: H / 2 }, page, 0.1));
  const inst: LayoutInstance = { id: 'lay1', name: 'Grid', algorithm: 'grid', params: { ...defaultParams(getAlgorithm('grid')) }, seed: 7, objectIds: objs.map((o) => o.id), slots: [], overlap: 'strict', maxOverlap: 0, avoidFocal: false, respectSafe: true };
  if (saved) delete (inst.params as Record<string, unknown>).maxCell;
  Object.assign(inst.params, extra);
  page = { ...page, objects: objs.map((o) => ({ ...o, layoutId: inst.id })), layouts: [inst] };
  const out = runLayout(page, inst, { getAsset });
  return JSON.parse(JSON.stringify(out.layouts[0].slots, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}

describe('Grid compatibility', () => {
  for (const n of [1, 5, 12, 22, 50, 180, 500])
    for (const variant of [{} as Record<string, string | number | boolean>, { complete: true }, { square: false }, { columns: 4 }, { stagger: true, align: 'bottom' }])
      it(`saved grids unchanged: ${n} icons, ${JSON.stringify(variant)}`, () => {
        expect(grid(n, variant)).toMatchSnapshot();
      });
  it('saved grids unchanged on a portrait page', () => {
    expect(grid(12, {}, 1080, 1920)).toMatchSnapshot();
  });
});

describe('Grid size cap (new grids)', () => {
  const cap = (n: number, extra: Record<string, string | number | boolean> = {}, W = 1920, H = 1080) => grid(n, { maxCell: 0.36, ...extra }, W, H, false);
  it('a few icons stay a sensible size and the grid is centered', () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const sl = cap(n);
      expect(sl).toHaveLength(n);
      for (const s of sl) expect(Math.max(s.w, s.h)).toBeLessThanOrEqual(0.36 * 1080 + 0.01);
      const xs = sl.map((s) => s.cx);
      const ys = sl.map((s) => s.cy);
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 960)).toBeLessThan(2);
      expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 540)).toBeLessThan(2);
    }
  });
  it('without the cap a few icons are much larger', () => {
    const a = Math.max(...cap(3).map((s) => s.w));
    const b = Math.max(...grid(3, {}, 1920, 1080, false).map((s) => s.w));
    expect(b / a).toBeGreaterThan(1.3);
  });
  it('prefers counts that leave no empty cells when the cap allows it', () => {
    // 5 icons: one row of 5 rather than 3 + 2
    const rows = new Set(cap(5).map((s) => Math.round(s.cy)));
    expect(rows.size).toBe(1);
  });
  it('large packs are unaffected by the cap', () => {
    for (const n of [50, 180, 500]) expect(cap(n)).toEqual(grid(n, {}, 1920, 1080, false));
  });
  it('is deterministic and respects fixed columns', () => {
    expect(cap(12)).toEqual(cap(12));
    const sl = cap(6, { columns: 2 });
    expect(new Set(sl.map((s) => Math.round(s.cx))).size).toBe(2);
  });
  it('quick styles only use known parameters', async () => {
    const { getAlgorithm } = await import('../src/layout/registry');
    const alg = getAlgorithm('grid');
    const keys = new Set(alg.params.map((d) => d.key));
    for (const st of alg.styles ?? []) for (const k of Object.keys(st.params)) expect(keys.has(k)).toBe(true);
  });
});
