// Per-layout icon choice: a layout uses all icons, some categories, a hand-picked set or a seeded
// random subset; changing it touches only that layout's icons.
import './helpers/canvasStub';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPage, createProject, createText } from '../src/core/defaults';
import type { AssetRecord, ImageObject, Page } from '../src/core/types';
import { getDoc, getPage, loadDoc, undo } from '../src/state/doc';
import { applyLayout } from '../src/state/layoutActions';
import { newImageObject } from '../src/state/objects';
import { layoutAssetIds, layoutSelection, resolveSelection, saveAssetSet, selectableAssets, selectionDrift, setLayoutAssets } from '../src/state/assetSelection';
import { remapIds } from '../src/state/project';

const CATS = ['Weapons', 'Potions', 'Armor', 'Gems'];
const icon = (i: number, extra: Partial<AssetRecord> = {}): AssetRecord => ({ id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: CATS[i % 4], width: 64, height: 64, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 4, y: 4, w: 56, h: 56 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } }, ...extra });

function setup(n: number, onPage = n, alg = 'grid') {
  const d = createProject('sel');
  d.assets = Array.from({ length: n }, (_, i) => icon(i));
  let page = createPage('p', 1920, 1080);
  page.background = { ...page.background, type: 'solid', color: '#123456' };
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  const objs = d.assets.slice(0, onPage).map((a) => ({ ...newImageObject(a.id, { x: 960, y: 540 }, page, 0.05), shadow: { enabled: true, color: '#000000', blur: 12, dx: 0, dy: 4, opacity: 0.5 } }) as ImageObject);
  const title = createText('My pack', 960, 100);
  page = { ...page, objects: [...objs, title] };
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  applyLayout(alg, objs.map((o) => o.id));
  return getPage();
}
const inst = (p: Page = getPage()) => p.layouts[0];
const images = (p: Page) => p.objects.filter((o): o is ImageObject => o.type === 'image');

describe('resolving a choice of icons', () => {
  const all = Array.from({ length: 40 }, (_, i) => icon(i));
  it('all, categories and hand-picked', () => {
    expect(resolveSelection({ mode: 'all' }, all).assets).toHaveLength(40);
    expect(resolveSelection({ mode: 'categories', categories: ['Gems'] }, all).assets.every((a) => a.category === 'Gems')).toBe(true);
    const r = resolveSelection({ mode: 'manual', ids: ['as3', 'gone', 'as1'] }, all);
    expect(r.assets.map((a) => a.id)).toEqual(['as3', 'as1']);
    expect(r.unavailable).toEqual(['gone']);
  });
  it('random picks are repeatable with a seed and change with another', () => {
    const a = resolveSelection({ mode: 'random', count: 10, seed: 7 }, all).assets.map((x) => x.id);
    expect(resolveSelection({ mode: 'random', count: 10, seed: 7 }, all).assets.map((x) => x.id)).toEqual(a);
    expect(resolveSelection({ mode: 'random', count: 10, seed: 8 }, all).assets.map((x) => x.id)).not.toEqual(a);
    expect(new Set(a).size).toBe(10);
    const fromCat = resolveSelection({ mode: 'random', count: 5, seed: 1, categories: ['Potions'] }, all).assets;
    expect(fromCat.every((x) => x.category === 'Potions')).toBe(true);
    expect(resolveSelection({ mode: 'random', count: 999, seed: 1 }, all).assets).toHaveLength(40);
  });
  it('icons that cannot be drawn are not offered', () => {
    expect(selectableAssets({ assets: [icon(1), icon(2, { status: 'error' }), icon(3, { status: 'missing' }), icon(4, { kind: 'background' })] }).map((a) => a.id)).toEqual(['as1']);
  });
});

describe('a layout with its own choice of icons', () => {
  beforeEach(() => undefined);

  it('layouts made before keep exactly their icons (a hand-picked choice)', () => {
    const p = setup(12, 8);
    expect(layoutSelection(p, inst(p))).toEqual({ mode: 'manual', ids: layoutAssetIds(p, inst(p)) });
    expect(selectionDrift(p, inst(p), selectableAssets())).toEqual({ add: 0, remove: 0 });
  });

  it('a random subset of a large library: only that layout changes, in one undo step', () => {
    const p0 = setup(300, 300, 'groundplane');
    const before = { bg: p0.background, title: p0.objects.find((o) => o.type === 'text') };
    const n = setLayoutAssets(p0.id, inst(p0).id, { mode: 'random', count: 30, seed: 42 });
    expect(n).toBe(30);
    const p = getPage();
    expect(images(p)).toHaveLength(30);
    expect(inst(p).objectIds).toHaveLength(30);
    expect(inst(p).assetSelection).toEqual({ mode: 'random', count: 30, seed: 42 });
    // background, theme and text untouched
    expect(p.background).toEqual(before.bg);
    expect(p.objects.find((o) => o.type === 'text')).toEqual(before.title);
    // every icon is laid out (Ground Plane: lying on the floor)
    expect(images(p).every((o) => o.warp && o.layoutId === inst(p).id)).toBe(true);
    // the project's library is untouched
    expect(getDoc().assets).toHaveLength(300);
    undo();
    expect(images(getPage())).toHaveLength(300);
  });

  it('icons that stay keep their look; new icons take it', () => {
    const p0 = setup(20, 5);
    const kept = images(p0)[0];
    setLayoutAssets(p0.id, inst(p0).id, { mode: 'manual', ids: [kept.assetId, 'as10', 'as11'] });
    const p = getPage();
    const objs = images(p);
    expect(objs.map((o) => o.assetId).sort()).toEqual([kept.assetId, 'as10', 'as11'].sort());
    expect(objs.find((o) => o.assetId === kept.assetId)!.id).toBe(kept.id);
    expect(objs.every((o) => o.shadow?.enabled && o.shadow.blur === 12)).toBe(true);
    // text stays above the icons
    expect(p.objects.at(-1)!.type).toBe('text');
  });

  it('categories follow the library: new matching icons show as an update', () => {
    const p0 = setup(16);
    setLayoutAssets(p0.id, inst(p0).id, { mode: 'categories', categories: ['Gems'] });
    expect(images(getPage()).every((o) => o.assetId && Number(o.assetId.slice(2)) % 4 === 3)).toBe(true);
    // an import adds two gems
    const d = getDoc();
    loadDoc({ ...d, assets: [...d.assets, icon(19), icon(23)] });
    const p = getPage();
    expect(selectionDrift(p, inst(p), selectableAssets())).toEqual({ add: 2, remove: 0 });
    setLayoutAssets(p.id, inst(p).id, inst(p).assetSelection!);
    expect(images(getPage())).toHaveLength(6);
  });

  it('a choice that leaves nothing is refused', () => {
    const p0 = setup(8);
    expect(setLayoutAssets(p0.id, inst(p0).id, { mode: 'categories', categories: ['None'] })).toBe(0);
    expect(images(getPage())).toHaveLength(8);
  });

  it('saved choices and layout choices follow the icons when a project is copied', () => {
    const p0 = setup(10);
    setLayoutAssets(p0.id, inst(p0).id, { mode: 'manual', ids: ['as1', 'as2'] });
    saveAssetSet('Two', ['as1', 'as2']);
    const copy = remapIds(structuredClone(getDoc()), new Map());
    const ids = new Set(copy.assets.map((a) => a.id));
    expect(copy.assetSets![0].ids.every((id) => ids.has(id))).toBe(true);
    expect(copy.pages[0].layouts[0].assetSelection!.ids!.every((id) => ids.has(id))).toBe(true);
  });
});
