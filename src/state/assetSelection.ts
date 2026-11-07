// Which icons a layout uses: all of the project's, some categories, a hand-picked set or a random
// subset (count + seed). The choice belongs to the layout, never to the project: changing it adds and
// removes only that layout's icons, keeps the look of the icons that stay (and gives new ones the
// same look), and leaves the page's background, theme and text exactly as they are.

import { uid } from '../core/ids';
import { createRng } from '../core/rng';
import type { AssetRecord, AssetSelection, ImageObject, LayoutInstance, Page, ProjectDoc, SavedAssetSet, SceneObject } from '../core/types';
import { runLayout } from '../layout/run';
import { commit, getAsset, getDoc, mutate, withPage } from './doc';
import { newImageObject, select } from './objects';
import { useUI } from './ui';

/** Icons a layout can use: the project's icons that can be drawn. */
export function selectableAssets(doc: Pick<ProjectDoc, 'assets'> = getDoc()): AssetRecord[] {
  return doc.assets.filter((a) => a.kind === 'asset' && a.status !== 'error' && a.status !== 'missing');
}

export interface Resolved {
  assets: AssetRecord[];
  /** Hand-picked ids that are no longer usable (deleted, missing or damaged files). */
  unavailable: string[];
}

/** The icons a selection stands for, in the project's order (random: the seeded pick, in pick order). */
export function resolveSelection(sel: AssetSelection, all: AssetRecord[]): Resolved {
  const inCats = (a: AssetRecord) => !sel.categories?.length || sel.categories.includes(a.category);
  switch (sel.mode) {
    case 'all':
      return { assets: all, unavailable: [] };
    case 'categories':
      return { assets: all.filter(inCats), unavailable: [] };
    case 'manual': {
      const byId = new Map(all.map((a) => [a.id, a]));
      const ids = sel.ids ?? [];
      return { assets: ids.map((id) => byId.get(id)).filter((a): a is AssetRecord => !!a), unavailable: ids.filter((id) => !byId.has(id)) };
    }
    case 'random': {
      const pool = all.filter(inCats);
      const n = Math.max(0, Math.min(pool.length, Math.round(sel.count ?? 20)));
      return { assets: createRng(sel.seed ?? 1).shuffle(pool.slice()).slice(0, n), unavailable: [] };
    }
  }
}

/** What a layout uses now: its own selection, or — for layouts made before — the icons it holds. */
export function layoutSelection(page: Page, inst: LayoutInstance): AssetSelection {
  if (inst.assetSelection) return inst.assetSelection;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of inst.objectIds) {
    const o = page.objects.find((x) => x.id === id);
    if (o?.type === 'image' && !seen.has(o.assetId)) {
      seen.add(o.assetId);
      ids.push(o.assetId);
    }
  }
  return { mode: 'manual', ids };
}

/** Assets of the layout's icons, one per asset, in layout order. */
export function layoutAssetIds(page: Page, inst: LayoutInstance): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  for (const id of inst.objectIds) {
    const o = byId.get(id);
    if (o?.type === 'image' && !seen.has(o.assetId)) {
      seen.add(o.assetId);
      out.push(o.assetId);
    }
  }
  return out;
}

/** How a layout's icons differ from what its selection stands for now (e.g. after an import). */
export function selectionDrift(page: Page, inst: LayoutInstance, all: AssetRecord[]): { add: number; remove: number } {
  if (!inst.assetSelection) return { add: 0, remove: 0 };
  const want = new Set(resolveSelection(inst.assetSelection, all).assets.map((a) => a.id));
  const have = new Set(layoutAssetIds(page, inst));
  let add = 0,
    remove = 0;
  for (const id of want) if (!have.has(id)) add++;
  for (const id of have) if (!want.has(id)) remove++;
  return { add, remove };
}

/** Effects an icon carries that a new icon of the same layout should share. */
const LOOK_KEYS = ['shadow', 'outline', 'glow', 'filter', 'opacity', 'locked'] as const;

/**
 * `page` with layout `inst` holding exactly `assets` (pure). Icons that stay keep everything (their
 * effects, pinning, position until the layout runs); icons of assets no longer chosen leave the page;
 * new icons copy the look of the layout's first icon and are painted where the layout's icons are.
 * The layout then runs again. Nothing else on the page changes.
 */
export function withLayoutAssets(page: Page, inst: LayoutInstance, assets: AssetRecord[], sel: AssetSelection): Page {
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const members = inst.objectIds.map((id) => byId.get(id)).filter((o): o is ImageObject => o?.type === 'image');
  const want = new Set(assets.map((a) => a.id));
  const keep = members.filter((o) => want.has(o.assetId));
  const drop = new Set(members.filter((o) => !want.has(o.assetId)).map((o) => o.id));
  const have = new Set(keep.map((o) => o.assetId));
  const model = members[0];
  const added: ImageObject[] = [];
  for (const a of assets) {
    if (have.has(a.id)) continue;
    have.add(a.id);
    const at = model ? { x: model.x, y: model.y } : { x: page.width / 2, y: page.height / 2 };
    const o = newImageObject(a.id, at, page, 0.1);
    const look: Partial<ImageObject> = {};
    if (model) for (const k of LOOK_KEYS) if (model[k] !== undefined) (look as Record<string, unknown>)[k] = structuredClone(model[k]);
    added.push({ ...o, ...look, layoutId: inst.id, pinned: false });
  }
  // order in the layout: the chosen order (random picks, hand-picked order), kept icons first per asset
  const firstOf = new Map<string, ImageObject>();
  for (const o of [...keep, ...added]) if (!firstOf.has(o.assetId)) firstOf.set(o.assetId, o);
  const extraKept = keep.filter((o) => firstOf.get(o.assetId) !== o);
  const objectIds = [...assets.map((a) => firstOf.get(a.id)!.id), ...extraKept.map((o) => o.id)];
  // paint new icons with the layout's icons: just above the topmost one that stays (or where the first was)
  const objects: SceneObject[] = [];
  const lastKept = page.objects.reduce((m, o, i) => (o.type === 'image' && o.layoutId === inst.id && !drop.has(o.id) ? i : m), -1);
  const firstMember = page.objects.findIndex((o) => o.type === 'image' && o.layoutId === inst.id);
  const insertAt = lastKept >= 0 ? lastKept : firstMember >= 0 ? firstMember - 1 : -1;
  if (insertAt < 0) objects.push(...added);
  page.objects.forEach((o, i) => {
    if (!drop.has(o.id)) objects.push(o);
    if (i === insertAt) objects.push(...added);
  });
  const next: LayoutInstance = { ...inst, objectIds, assetSelection: sel, slots: [] };
  const p: Page = {
    ...page,
    objects,
    layouts: page.layouts.map((l) => (l.id === inst.id ? next : l)),
    // a template page rebuilds from its icon list: it uses the new choice too
    fromTemplate: page.fromTemplate && page.layouts[0]?.id === inst.id ? { ...page.fromTemplate, assetIds: assets.map((a) => a.id) } : page.fromTemplate,
  };
  return runLayout(p, next, { getAsset });
}

/** Give a layout of a page a new choice of icons (one undo step). Returns how many icons it holds. */
export function setLayoutAssets(pageId: string, instId: string, sel: AssetSelection): number {
  const d = getDoc();
  const page = d.pages.find((p) => p.id === pageId);
  const inst = page?.layouts.find((l) => l.id === instId);
  if (!page || !inst) return 0;
  const { assets } = resolveSelection(sel, selectableAssets(d));
  if (!assets.length) return 0;
  const label = sel.mode === 'all' ? 'all icons' : sel.mode === 'categories' ? `${sel.categories?.length ?? 0} categories` : sel.mode === 'random' ? `${assets.length} random icons` : `${assets.length} chosen icons`;
  commit(`Layout icons: ${label}`, (doc) => withPage(doc, (p) => withLayoutAssets(p, inst, assets, sel), pageId));
  // selected objects that left the page are no longer selected
  const ids = new Set(getDoc().pages.find((p) => p.id === pageId)!.objects.map((o) => o.id));
  const s = useUI.getState().selection;
  if (s.some((id) => !ids.has(id))) select(s.filter((id) => ids.has(id)));
  return assets.length;
}

// ---------------------------------------------------------------------------
// Saved choices (per project, not part of undo — like the asset library)
// ---------------------------------------------------------------------------

export function saveAssetSet(name: string, ids: string[]): SavedAssetSet {
  const set: SavedAssetSet = { id: uid('set'), name: name.trim() || 'Icon set', ids: [...new Set(ids)] };
  mutate((d) => ({ ...d, assetSets: [...(d.assetSets ?? []), set] }));
  return set;
}

export function deleteAssetSet(id: string) {
  mutate((d) => ({ ...d, assetSets: (d.assetSets ?? []).filter((s) => s.id !== id) }));
}

export function renameAssetSet(id: string, name: string) {
  mutate((d) => ({ ...d, assetSets: (d.assetSets ?? []).map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)) }));
}

export const newSeed = () => Math.floor(Math.random() * 1e9);
