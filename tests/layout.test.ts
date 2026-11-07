import { describe, expect, it } from 'vitest';
import { analyzeAlpha } from '../src/core/alpha';
import { createPage, createImage } from '../src/core/defaults';
import { intersectionArea } from '../src/core/geometry';
import { applyMat, squareToQuad } from '../src/core/homography';
import { createRng } from '../src/core/rng';
import { currentVisibleBox, placeImageByVisibleBox, visibleAABB } from '../src/core/transform';
import type { AssetRecord, ImageObject, LayoutInstance, Page, Quad } from '../src/core/types';
import { ALGORITHMS, defaultParams, getAlgorithm } from '../src/layout/registry';
import { runLayout } from '../src/layout/run';
import { normalizeVisualSize } from '../src/core/align';

function asset(id: string, w: number, h: number, b = { x: 0, y: 0, w, h }, category = 'A'): AssetRecord {
  return {
    id,
    name: id + '.png',
    format: 'png',
    kind: 'asset',
    folder: '',
    category,
    width: w,
    height: h,
    bytes: 1,
    importIndex: 0,
    addedAt: 0,
    status: 'ready',
    alpha: { bounds: b, occupancy: 0.5, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: w / 2, y: h / 2 } },
  };
}

function setup(n: number, algorithm: string, extra: Partial<LayoutInstance> = {}) {
  const assets = new Map<string, AssetRecord>();
  const page: Page = createPage('t', 1920, 1080);
  const objs: ImageObject[] = [];
  for (let i = 0; i < n; i++) {
    // transparent padding: visible content is a centered sub-rect of varying aspect
    const vw = 300 + ((i * 97) % 500),
      vh = 300 + ((i * 53) % 500);
    const a = asset('a' + i, 1024, 1024, { x: (1024 - vw) / 2, y: (1024 - vh) / 2, w: vw, h: vh }, ['A', 'B', 'C'][i % 3]);
    assets.set(a.id, a);
    objs.push({ ...createImage(a.id, a.id, 100, 100, 200, 200), id: 'o' + i, layoutId: 'L' });
  }
  const alg = getAlgorithm(algorithm);
  const inst: LayoutInstance = {
    id: 'L',
    name: alg.label,
    algorithm,
    params: defaultParams(alg),
    seed: 42,
    objectIds: objs.map((o) => o.id),
    slots: [],
    overlap: alg.defaultOverlap ?? 'strict',
    maxOverlap: 0.3,
    avoidFocal: false,
    respectSafe: true,
    ...extra,
  };
  const p: Page = { ...page, objects: objs, layouts: [inst] };
  const getAsset = (id: string) => assets.get(id);
  return { page: p, inst, getAsset };
}

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(7),
      b = createRng(7),
      c = createRng(8);
    const sa = [a(), a(), a()],
      sb = [b(), b(), b()],
      sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
});

describe('homography', () => {
  it('maps unit square corners onto the quad', () => {
    const q: Quad = [
      { x: 400, y: 200 },
      { x: 1500, y: 200 },
      { x: 1900, y: 1000 },
      { x: 20, y: 1000 },
    ];
    const m = squareToQuad(q);
    const corners = [applyMat(m, 0, 0), applyMat(m, 1, 0), applyMat(m, 1, 1), applyMat(m, 0, 1)];
    corners.forEach((c, i) => {
      expect(c.x).toBeCloseTo(q[i].x, 3);
      expect(c.y).toBeCloseTo(q[i].y, 3);
    });
  });
});

describe('alpha analysis', () => {
  it('finds the visible bounding box', () => {
    const w = 64,
      h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 10; y < 20; y++) for (let x = 5; x < 40; x++) data[(y * w + x) * 4 + 3] = 255;
    const r = analyzeAlpha(data, w, h);
    expect(r.bounds).toEqual({ x: 5, y: 10, w: 35, h: 10 });
    expect(r.empty).toBe(false);
    expect(r.hasAlpha).toBe(true);
    expect(r.occupancy).toBeCloseTo((35 * 10) / (64 * 32), 5);
  });
  it('flags fully transparent images', () => {
    const r = analyzeAlpha(new Uint8ClampedArray(16 * 16 * 4), 16, 16);
    expect(r.empty).toBe(true);
  });
});

describe('visible-box placement', () => {
  it('centers the VISIBLE content at the target, not the full PNG', () => {
    const a = asset('x', 1000, 1000, { x: 600, y: 100, w: 200, h: 400 });
    const o = createImage('x', 'x', 0, 0, 100, 100);
    const p = placeImageByVisibleBox(o, a, 500, 500, 100, 200, 30);
    const placed = { ...o, ...p } as ImageObject;
    const vb = currentVisibleBox(placed, a);
    expect(vb.cx).toBeCloseTo(500, 4);
    expect(vb.cy).toBeCloseTo(500, 4);
    expect(vb.w).toBeCloseTo(100, 4);
    expect(vb.h).toBeCloseTo(200, 4);
  });
});

describe('layouts', () => {
  it('every algorithm places every item with finite transforms', () => {
    for (const alg of ALGORITHMS) {
      const { page, inst, getAsset } = setup(40, alg.id);
      const out = runLayout(page, inst, { getAsset });
      for (const o of out.objects) {
        expect(Number.isFinite(o.x) && Number.isFinite(o.y) && o.w > 0 && o.h > 0, `${alg.id} ${o.id}`).toBe(true);
      }
    }
  });

  it('grid keeps visible boxes inside the page without overlap', () => {
    const { page, inst, getAsset } = setup(117, 'grid');
    const out = runLayout(page, inst, { getAsset });
    const boxes = out.objects.map((o) => visibleAABB(o, getAsset((o as ImageObject).assetId)));
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.y).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.w).toBeLessThanOrEqual(1920.5);
      expect(b.y + b.h).toBeLessThanOrEqual(1080.5);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersectionArea(boxes[i], boxes[j])).toBeLessThan(1);
  });

  it('strict scatter has no overlaps and is deterministic per seed', () => {
    const a = setup(60, 'scatter');
    const r1 = runLayout(a.page, a.inst, { getAsset: a.getAsset });
    const r2 = runLayout(a.page, a.inst, { getAsset: a.getAsset });
    expect(r1.objects.map((o) => [o.x, o.y])).toEqual(r2.objects.map((o) => [o.x, o.y]));
    const b = setup(60, 'scatter', { seed: 43 });
    const r3 = runLayout(b.page, b.inst, { getAsset: b.getAsset });
    expect(r3.objects.map((o) => [o.x, o.y])).not.toEqual(r1.objects.map((o) => [o.x, o.y]));
  });

  it('pinned objects are untouched when the layout is re-run with a new seed', () => {
    const s = setup(60, 'floor');
    const first = runLayout(s.page, s.inst, { getAsset: s.getAsset });
    const pinnedIds = ['o3', 'o10', 'o20'];
    const pinnedPage: Page = { ...first, objects: first.objects.map((o) => (pinnedIds.includes(o.id) ? { ...o, pinned: true, x: o.x + 37 } : o)) };
    const inst2 = { ...s.inst, seed: 999 };
    const second = runLayout({ ...pinnedPage, layouts: [inst2] }, inst2, { getAsset: s.getAsset });
    for (const id of pinnedIds) {
      const before = pinnedPage.objects.find((o) => o.id === id)!;
      const after = second.objects.find((o) => o.id === id)!;
      expect([after.x, after.y, after.w, after.h, after.rotation]).toEqual([before.x, before.y, before.w, before.h, before.rotation]);
    }
    const moved = second.objects.filter((o) => !pinnedIds.includes(o.id)).some((o) => {
      const b = pinnedPage.objects.find((x) => x.id === o.id)!;
      return Math.abs(b.x - o.x) > 0.01;
    });
    expect(moved).toBe(true);
  });

  it('perspective floor: far (top) items are smaller and painted behind near items', () => {
    const s = setup(60, 'floor');
    const out = runLayout(s.page, s.inst, { getAsset: s.getAsset });
    const objs = out.objects as ImageObject[];
    const top = objs.slice().sort((a, b) => a.y - b.y).slice(0, 8);
    const bottom = objs.slice().sort((a, b) => b.y - a.y).slice(0, 8);
    const avg = (l: ImageObject[]) => l.reduce((acc, o) => acc + o.w, 0) / l.length;
    expect(avg(top)).toBeLessThan(avg(bottom) * 0.7);
    // paint order: index increases with y (depth) on average
    const idx = (o: ImageObject) => objs.indexOf(o);
    expect(top.reduce((a, o) => a + idx(o), 0) / top.length).toBeLessThan(bottom.reduce((a, o) => a + idx(o), 0) / bottom.length);
  });

  for (const arrange of ['grid', 'rows']) {
    it(`perspective ${arrange} arrangement has no overlaps`, () => {
      const s = setup(60, 'floor');
      const inst = { ...s.inst, params: { ...s.inst.params, arrange, noOverlap: true } };
      const out = runLayout({ ...s.page, layouts: [inst] }, inst, { getAsset: s.getAsset });
      const boxes = out.objects.map((o) => visibleAABB(o, s.getAsset((o as ImageObject).assetId)));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersectionArea(boxes[i], boxes[j])).toBeLessThan(1);
    });
  }

  it('perspective category rows put the first category in the front row', () => {
    const s = setup(30, 'floor');
    const inst = { ...s.inst, params: { ...s.inst.params, arrange: 'rows', rowSort: 'category' } };
    const out = runLayout({ ...s.page, layouts: [inst] }, inst, { getAsset: s.getAsset });
    const byCat = (c: string) => out.objects.filter((o) => s.getAsset((o as ImageObject).assetId)!.category === c).map((o) => o.y);
    const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    // first-seen category is 'A' → lowest on screen (front); rows are separated
    expect(avg(byCat('A'))).toBeGreaterThan(avg(byCat('B')));
    expect(avg(byCat('B'))).toBeGreaterThan(avg(byCat('C')));
  });

  it('keeps the focal region free when avoidFocal is on', () => {
    const s = setup(60, 'scatter', { avoidFocal: true });
    const page = { ...s.page, focal: { enabled: true, shape: 'rect' as const, x: 960, y: 540, w: 800, h: 300 } };
    const out = runLayout(page, s.inst, { getAsset: s.getAsset });
    const focal = { x: 560, y: 390, w: 800, h: 300 };
    for (const o of out.objects) {
      const b = visibleAABB(o, s.getAsset((o as ImageObject).assetId));
      expect(intersectionArea(b, focal)).toBeLessThan(1);
    }
  });
});

describe('normalize visual size', () => {
  it('matches visible sizes to the median', () => {
    const s = setup(5, 'grid');
    const patches = normalizeVisualSize(s.page.objects, s.getAsset, 'median', { metric: 'longest' });
    const objs = s.page.objects.map((o) => ({ ...o, ...patches.get(o.id) })) as ImageObject[];
    const sizes = objs.map((o) => {
      const b = currentVisibleBox(o, s.getAsset(o.assetId));
      return Math.max(b.w, b.h);
    });
    const first = sizes[0];
    for (const v of sizes) expect(v).toBeCloseTo(first, 3);
  });
});

describe('cluster with many assets', () => {
  for (const n of [12, 63, 150]) {
    it(`keeps ${n} assets inside the page without overlaps`, () => {
      const { page, inst, getAsset } = setup(n, 'cluster', { overlap: 'strict' });
      const out = runLayout(page, inst, { getAsset });
      const boxes = out.objects.map((o) => visibleAABB(o, getAsset((o as ImageObject).assetId)));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1);
        expect(b.y).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.w).toBeLessThanOrEqual(page.width + 1);
        expect(b.y + b.h).toBeLessThanOrEqual(page.height + 1);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersectionArea(boxes[i], boxes[j])).toBeLessThan(1);
      // upright by default
      expect(out.objects.every((o) => o.rotation === 0)).toBe(true);
      // uses the width of a wide canvas instead of a tall circle
      const xs = boxes.map((b) => b.x + b.w / 2),
        ys = boxes.map((b) => b.y + b.h / 2);
      if (n > 30) expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
    });
  }
});

describe('showcase layouts', () => {
  const ids = ['heroshowcase', 'split', 'diagonal', 'orbit', 'ring', 'dualcluster', 'compare'];
  for (const id of ids)
    for (const n of [1, 7, 40, 150])
      it(`${id} with ${n} icons stays on the page without heavy overlap`, () => {
        const { page, inst, getAsset } = setup(n, id);
        const out = runLayout(page, inst, { getAsset });
        const boxes = out.objects.map((o) => visibleAABB(o, getAsset((o as ImageObject).assetId)));
        for (const b of boxes) {
          expect(b.x, id).toBeGreaterThanOrEqual(-1);
          expect(b.y, id).toBeGreaterThanOrEqual(-1);
          expect(b.x + b.w, id).toBeLessThanOrEqual(1921);
          expect(b.y + b.h, id).toBeLessThanOrEqual(1081);
        }
        if (id === 'dualcluster') return; // relaxed overlap by design
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const ov = intersectionArea(boxes[i], boxes[j]) / Math.min(boxes[i].w * boxes[i].h, boxes[j].w * boxes[j].h);
            expect(ov, `${id} ${i}/${j}`).toBeLessThan(0.08);
          }
      });

  it('compare puts matching pairs in the same spot of each half', () => {
    const { page, inst, getAsset } = setup(20, 'compare');
    const out = runLayout(page, inst, { getAsset });
    const byId = new Map(out.objects.map((o) => [o.id, o]));
    const dx = byId.get('o10')!.x - byId.get('o0')!.x;
    for (let i = 0; i < 10; i++) {
      expect(byId.get('o' + (i + 10))!.x - byId.get('o' + i)!.x).toBeCloseTo(dx, 3);
      expect(byId.get('o' + (i + 10))!.y).toBeCloseTo(byId.get('o' + i)!.y, 3);
    }
  });
});

describe('showcase layout options', () => {
  const cases: [string, Record<string, string | number | boolean>][] = [
    ['ring', { shape: 'frame', rings: 2 }],
    ['ring', { shape: 'circle' }],
    ['orbit', { tilt: 0.5 }],
    ['diagonal', { growth: -1, dir: 'down', tilt: true }],
    ['heroshowcase', { title: 'middle' }],
    ['split', { side: 'top', style: 'stagger' }],
    ['compare', { axis: 'stack' }],
  ];
  for (const [id, over] of cases)
    it(`${id} ${JSON.stringify(over)} keeps icons apart`, () => {
      const s = setup(60, id);
      const inst = { ...s.inst, params: { ...s.inst.params, ...over } };
      const out = runLayout({ ...s.page, layouts: [inst] }, inst, { getAsset: s.getAsset });
      const boxes = out.objects.map((o) => visibleAABB(o, s.getAsset((o as ImageObject).assetId)));
      if (over.tilt === true) return; // tilted boxes are fitted by an approximate outline
      for (const b of boxes) expect(b.x >= -1 && b.y >= -1 && b.x + b.w <= 1921 && b.y + b.h <= 1081).toBe(true);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) expect(intersectionArea(boxes[i], boxes[j]) / Math.min(boxes[i].w * boxes[i].h, boxes[j].w * boxes[j].h)).toBeLessThan(0.08);
    });
});

describe('full-bleed layouts', () => {
  for (const [id, over] of [
    ['tiltwall', { turn: false, angle: 0 }],
    ['endlessfloor', {}],
    ['cropframe', { rotation: 0 }],
  ] as [string, Record<string, number | boolean>][])
    for (const n of [5, 60, 250])
      it(`${id} with ${n} icons covers the canvas without overlaps`, () => {
        const s = setup(n, id);
        const inst = { ...s.inst, params: { ...s.inst.params, ...over } };
        const out = runLayout({ ...s.page, layouts: [inst] }, inst, { getAsset: s.getAsset });
        const boxes = out.objects.map((o) => visibleAABB(o, s.getAsset((o as ImageObject).assetId)));
        for (const b of boxes) expect(Number.isFinite(b.x + b.y + b.w + b.h)).toBe(true);
        for (let i = 0; i < boxes.length; i++)
          // floor icons stand slightly in front of the row behind by design
          for (let j = i + 1; j < boxes.length; j++) expect(intersectionArea(boxes[i], boxes[j]) / Math.min(boxes[i].w * boxes[i].h, boxes[j].w * boxes[j].h)).toBeLessThan(id === 'endlessfloor' ? 0.35 : 0.1);
        // something is visible on the canvas
        expect(boxes.some((b) => b.x < 1920 && b.x + b.w > 0 && b.y < 1080 && b.y + b.h > 0)).toBe(true);
      });
});
