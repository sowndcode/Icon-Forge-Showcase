// Speed-ups of the shared placement search (Placer) must not move a single icon: every seeded organic
// layout is compared with snapshots recorded before the change, across modes, sizes and obstacles.

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createPage, createProject } from '../src/core/defaults';
import type { AssetRecord, LayoutInstance, OverlapMode, Page } from '../src/core/types';
import { getAsset, loadDoc } from '../src/state/doc';
import { newImageObject } from '../src/state/objects';
import { runLayout } from '../src/layout/run';
import { defaultParams, getAlgorithm } from '../src/layout/registry';

const icon = (i: number): AssetRecord => {
  const s = [32, 48, 64, 96, 128][i % 5];
  return { id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: 'C' + (i % 4), width: s, height: s + (i % 3) * 8, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 2, y: 2, w: s - 4, h: s - 2 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: s / 2, y: s / 2 } } };
};

function run(alg: string, n: number, overlap: OverlapMode, extra: Record<string, number | string | boolean> = {}, pinned = false, focal = false) {
  const d = createProject('x');
  d.assets = Array.from({ length: n }, (_, i) => icon(i));
  let page: Page = createPage('p', 1920, 1080);
  if (focal) page = { ...page, focal: { ...page.focal, enabled: true } };
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  const objs = d.assets.map((a) => newImageObject(a.id, { x: 960, y: 540 }, page, 0.05));
  const inst: LayoutInstance = { id: 'lay1', name: alg, algorithm: alg, params: { ...defaultParams(getAlgorithm(alg)), ...extra }, seed: 5, objectIds: objs.map((o) => o.id), slots: [], overlap, maxOverlap: 0.3, avoidFocal: focal, respectSafe: true };
  page = { ...page, objects: objs.map((o, i) => ({ ...o, layoutId: inst.id, ...(pinned && i < 3 ? { pinned: true, x: 300 + i * 500, y: 400 } : {}) })), layouts: [inst] };
  const out = runLayout(page, inst, { getAsset });
  return JSON.parse(JSON.stringify(out.layouts[0].slots, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}

describe('organic layouts are unchanged by placement speed-ups', () => {
  for (const alg of ['cluster', 'roundcluster', 'dualcluster', 'scatter', 'hero', 'edgeframe'])
    for (const overlap of ['strict', 'relaxed', 'showcase'] as OverlapMode[])
      for (const n of [7, 60, 300])
        it(`${alg} ${overlap} ${n}`, () => {
          expect(run(alg, n, overlap)).toMatchSnapshot();
        });
  it('cluster by category with rotation, pins and a focal region', () => {
    expect(run('cluster', 120, 'relaxed', { byCategory: true, rotation: 30 }, true, true)).toMatchSnapshot();
  });
  it('scatter with rotation, pins and a focal region', () => {
    expect(run('scatter', 150, 'strict', { rotation: 45 }, true, true)).toMatchSnapshot();
  });
});
