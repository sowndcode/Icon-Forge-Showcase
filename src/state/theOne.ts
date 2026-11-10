// "The One": one click from a prepared pack folder to a complete marketplace set with the
// recommended settings: perspective hero, square cover, full catalog and one page per category.

import { guideAction } from './guideProgress';
import { BACKGROUND_PRESETS } from '../core/defaults';
import type { Background } from '../core/types';
import { commit, getDoc, useDoc } from './doc';
import { buildStoreSetPages, libraryAssets, packNameGuess } from './generators';
import { renameProject } from './project';
import { fitView, setStage, toast, useUI } from './ui';

/** Recommended perspective style for the hero: biggest assets in front, nothing overlapping. */
export { STORE_HERO_STYLE as THE_ONE_HERO_STYLE } from './generators';

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
    const cats = [...new Set(all.map((a) => a.category))].filter(Boolean);
    // hero 1920×1080 (balanced pick across categories), square cover, full catalog, a page per category
    const pages = buildStoreSetPages(all, { pack, hero: true, heroLayout: 'floor', heroCount: 60, cover: true, catalog: true, categories: cats.length > 1, balanced: true }, bg, Math.floor(Math.random() * 1e6));

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
