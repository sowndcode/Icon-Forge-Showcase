// "The One": one click from a prepared pack folder to a complete marketplace set with the
// recommended settings: perspective hero, square cover, full catalog and one page per category.

import { guideAction } from './guideProgress';
import { buildCatalogPages, DEFAULT_CATALOG } from '../core/catalog';
import { BACKGROUND_PRESETS } from '../core/defaults';
import type { Background, Page } from '../core/types';
import { runLayout } from '../layout/run';
import { commit, getAsset, getDoc, useDoc } from './doc';
import { BUILTIN_TEMPLATES, libraryAssets, packNameGuess, pickRandom, sortForCatalog } from './generators';
import { renameProject } from './project';
import { fitView, setStage, toast, useUI } from './ui';

/** Recommended perspective style for the hero: biggest assets in front, nothing overlapping. */
export const THE_ONE_HERO_STYLE = { arrange: 'organic', rowSort: 'sizeFront', noOverlap: true, near: 1.35, far: 0.38, randPos: 0.12, randScale: 0.06, randRot: 0, density: 0.9 };

let armedUntil = 0;
/** Run The One automatically after the next import finishes (used when there are no assets yet). */
export function armTheOne() {
  armedUntil = Date.now() + 10 * 60 * 1000;
  toast('Choose your pack folder — the store set is built as soon as it is imported', 'info', 5000);
}
export function consumeTheOneArm(): boolean {
  const on = Date.now() < armedUntil;
  armedUntil = 0;
  return on;
}

/** Wait until every asset has been decoded and analysed (layouts need the alpha bounds). */
export function waitForAnalysis(timeoutMs = 180_000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const check = () => {
      const pending = useDoc.getState().doc.assets.some((a) => a.status === 'pending');
      if (!pending || Date.now() - t0 > timeoutMs) return resolve();
      setTimeout(check, 250);
    };
    check();
  });
}

function heroBackground(): Background {
  const doc = getDoc();
  const bgAsset = doc.assets.find((a) => a.kind === 'background' && a.status === 'ready');
  const base = BACKGROUND_PRESETS[4].bg();
  if (bgAsset) {
    // an imported background, softened so the assets stay readable
    return {
      ...base,
      type: 'image',
      color: '#0d0a16',
      image: { ...base.image, assetId: bgAsset.id, fit: 'fill', blur: 10, brightness: -28, saturation: -10 },
      vignette: { enabled: true, strength: 0.45, color: '#000000' },
    };
  }
  const cur = doc.pages.find((p) => p.id === doc.activePageId)?.background;
  return cur && cur.type !== 'transparent' && cur.type !== 'image' ? structuredClone(cur) : base;
}

export async function runTheOne() {
  await waitForAnalysis();
  const all = libraryAssets().filter((a) => a.status === 'ready' && !a.alpha?.empty);
  if (!all.length) {
    toast('Import a pack folder first', 'warning');
    return;
  }
  useUI.setState({ task: { label: 'Building store set', done: 0, total: 1 } });
  try {
    const pack = packNameGuess();
    const bg = heroBackground();
    const seed = Math.floor(Math.random() * 1e6);
    const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;
    const pages: Page[] = [];

    // 1 · Hero 1920×1080 — perspective floor, balanced pick across categories
    let hero = tpl('perspective').build(pickRandom(all, Math.min(60, all.length), 'equal', seed), pack, structuredClone(bg));
    const inst = hero.layouts[0];
    if (inst) {
      const styled = { ...inst, params: { ...inst.params, ...THE_ONE_HERO_STYLE } };
      hero = runLayout({ ...hero, layouts: [styled] }, styled, { getAsset });
    }
    hero.name = 'Hero';
    hero.exportName = 'hero';
    pages.push(hero);

    // 2 · Square cover 1080×1080 — hero composition
    const cover = tpl('square').build(pickRandom(all, Math.min(24, all.length), 'equal', seed + 1), pack, structuredClone(bg));
    cover.name = 'Cover';
    cover.exportName = 'cover';
    pages.push(cover);

    // 3 · Full catalog 3000×3000 — every asset, numbered, grouped by category
    const catalog = buildCatalogPages(sortForCatalog(all), { ...DEFAULT_CATALOG, title: `${pack} — ${all.length} assets` }, { w: 3000, h: 3000 }, BACKGROUND_PRESETS[4].bg());
    catalog.forEach((p, i) => (p.exportName = catalog.length > 1 ? `catalog_${i + 1}` : 'catalog'));
    pages.push(...catalog);

    // 4 · One preview page per category
    const cats = [...new Set(all.map((a) => a.category))].filter(Boolean);
    if (cats.length > 1) {
      for (const cat of cats) {
        const p = tpl('category').build(all.filter((a) => a.category === cat), pack, structuredClone(bg));
        p.name = cat;
        p.exportName = cat.toLowerCase().replace(/\s+/g, '_');
        pages.push(p);
      }
    }

    // replace empty pages, otherwise add after the existing ones
    commit('Complete store set', (d) => {
      const keep = d.pages.filter((p) => p.objects.length > 0);
      return { ...d, pages: [...keep, ...pages], activePageId: pages[0].id };
    });
    if (/^untitled/i.test(getDoc().name)) renameProject(pack);
    useUI.setState({ selection: [], activeLayoutId: null, librarySel: [] });
    setStage('compose');
    requestAnimationFrame(() => fitView(1920, 1080));
    guideAction('storeset');
    toast(`Store set: ${pages.length} pages ready (hero, cover, catalog${cats.length > 1 ? `, ${cats.length} categories` : ''}). Export → all pages when you're happy.`, 'success', 7000);
  } finally {
    useUI.setState({ task: null });
  }
}
