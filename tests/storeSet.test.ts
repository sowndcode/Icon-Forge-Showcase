// Generated store sets: the pages asked for, in one look, with safe file names and titles that fit.
import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { BACKGROUND_PRESETS, createProject } from '../src/core/defaults';
import type { AssetRecord, TextObject } from '../src/core/types';
import { naturalWidth } from '../src/render/text';
import { loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, buildCategoryPage, buildStoreSetPages } from '../src/state/generators';

function assets(n: number, cats: string[]): AssetRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `as${i}`,
    name: `icon_${i}.png`,
    format: 'png',
    kind: 'asset',
    folder: 'Pack',
    category: cats[i % cats.length],
    width: 128,
    height: 128,
    bytes: 1000,
    importIndex: i,
    addedAt: 1,
    status: 'ready',
    alpha: { bounds: { x: 8, y: 8, w: 112, h: 112 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 64, y: 64 } },
  }));
}
const setup = (n: number, cats: string[]) => {
  const doc = createProject('Set');
  doc.assets = assets(n, cats);
  loadDoc(doc);
  return doc.assets;
};
const ALL = { hero: true, heroLayout: 'floor', heroCount: 60, cover: true, catalog: true, categories: true, balanced: true };
const texts = (p: { objects: { type: string }[] }) => p.objects.filter((o): o is TextObject => o.type === 'text');

describe('store set', () => {
  it('builds hero, cover, catalog and a page per category', () => {
    const all = setup(40, ['Weapons', 'Potions', 'Armor']);
    const pages = buildStoreSetPages(all, { ...ALL, pack: 'Fantasy RPG' }, BACKGROUND_PRESETS[4].bg(), 7);
    expect(pages.map((p) => p.exportName)).toEqual(['hero', 'cover', 'catalog', 'weapons', 'potions', 'armor']);
    expect(pages.map((p) => [p.width, p.height])).toEqual([[1920, 1080], [1080, 1080], [3000, 3000], [1920, 1080], [1920, 1080], [1920, 1080]]);
    // every category page shows exactly its own icons
    expect(pages[3].objects.filter((o) => o.type === 'image')).toHaveLength(14);
  });

  it('only builds the pages that were asked for', () => {
    const all = setup(12, ['A']);
    const pages = buildStoreSetPages(all, { ...ALL, pack: 'P', hero: false, catalog: false, categories: false }, BACKGROUND_PRESETS[4].bg(), 1);
    expect(pages.map((p) => p.exportName)).toEqual(['cover']);
  });

  it('never gives two category pages the same file name', () => {
    const all = setup(8, ['Old Keys', 'old  keys']);
    const names = buildStoreSetPages(all, { ...ALL, pack: 'P', hero: false, cover: false, catalog: false }, BACKGROUND_PRESETS[4].bg(), 1).map((p) => p.exportName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps a very long pack name inside its text box on every page', () => {
    const all = setup(30, ['Weapons', 'Potions']);
    const pages = buildStoreSetPages(all, { ...ALL, heroLayout: 'edge', pack: 'Cozy Farm Vegetables and Tools Mega Bundle Deluxe Edition' }, BACKGROUND_PRESETS[4].bg(), 3);
    for (const p of pages)
      for (const t of texts(p)) {
        if (t.groupId) continue; // catalog labels are sized by their cells
        const widest = Math.max(...t.text.replace(/\{count\}/g, '000').split('\n').map((l) => naturalWidth(l, t.style)));
        expect(widest, `${p.name}: ${t.text}`).toBeLessThanOrEqual(t.w + 1);
        expect(t.x - t.w / 2, `${p.name}: ${t.text}`).toBeGreaterThanOrEqual(-1);
        expect(t.x + t.w / 2).toBeLessThanOrEqual(p.width + 1);
      }
  });

  it('caps icon size on a category page with only a few icons', () => {
    const all = setup(3, ['Keys']);
    const p = buildCategoryPage(all, 'Keys', 'Pack', BACKGROUND_PRESETS[4].bg());
    for (const o of p.objects.filter((x) => x.type === 'image')) expect(Math.max(o.w, o.h)).toBeLessThan(1080 * 0.5);
  });
});

describe('template titles', () => {
  it('fit their boxes for a long pack name in every template that is not frozen', () => {
    const all = setup(40, ['Weapons', 'Potions', 'Armor']);
    for (const t of BUILTIN_TEMPLATES) {
      if (t.id === 'wall-cover' || t.id === 'cover-ribbon') continue;
      const p = t.build(all, 'Legendary Dungeon Crawler Loot and Treasure Collection', BACKGROUND_PRESETS[4].bg());
      for (const x of texts(p)) {
        if (x.groupId || x.style.curve) continue;
        const widest = Math.max(...x.text.replace(/\{count\}/g, '000').split('\n').map((l) => naturalWidth(l, x.style)));
        // the pass stops shrinking at half size; anything still wider than twice its box would be a layout bug
        expect(widest, `${t.id}: ${x.text}`).toBeLessThanOrEqual(x.w * 2 + 1);
      }
    }
  });
});
