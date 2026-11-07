// Smart Layout actions: create/run/update layout instances, pinning, detaching, presets.

import { uid } from '../core/ids';
import { randomSeed } from '../core/rng';
import type { LayoutInstance, LayoutPresetData, OverlapMode, Page, ParamValue, ProjectDoc, Quad, StoredPreset, Vec } from '../core/types';
import { presetPath, type PathPreset } from '../layout/path';
import { presetPlane, type PlanePreset } from '../layout/perspective';
import { defaultParams, getAlgorithm, withDefaults } from '../layout/registry';
import { depthSortObjects, layoutArea, runLayout } from '../layout/run';
import { db } from '../services/db';
import { commit, getAsset, getPage, mutate, withPage } from './doc';
import { select } from './objects';
import { toast, useUI } from './ui';
import { usePrefs } from './prefs';
import { refreshPresets } from './presets';

export function findLayout(page: Page, id: string | null | undefined) {
  return id ? page.layouts.find((l) => l.id === id) : undefined;
}

/** The layout shared by all selected objects (or null if mixed/manual). */
export function selectionLayout(page: Page, ids: string[]): LayoutInstance | null {
  if (!ids.length) return null;
  const objs = page.objects.filter((o) => ids.includes(o.id));
  const lid = objs[0]?.layoutId;
  if (!lid || !objs.every((o) => o.layoutId === lid)) return null;
  return findLayout(page, lid) ?? null;
}

function rerun(page: Page, inst: LayoutInstance): Page {
  const withInst = { ...page, layouts: page.layouts.map((l) => (l.id === inst.id ? inst : l)) };
  return runLayout(withInst, inst, { getAsset });
}

/** Remove objects from their current layouts (dropping empty layouts). */
function detachFromLayouts(page: Page, ids: Set<string>): Page {
  return {
    ...page,
    objects: page.objects.map((o) => (ids.has(o.id) && o.layoutId ? { ...o, layoutId: undefined, pinned: undefined } : o)),
    layouts: page.layouts.map((l) => ({ ...l, objectIds: l.objectIds.filter((id) => !ids.has(id)) })).filter((l) => l.objectIds.length > 0),
  };
}

/**
 * Parameters for a layout created now. New Perspective Floors adapt to small packs (Settings ▸ Layouts);
 * layouts saved earlier keep their own parameters and so their exact arrangement.
 */
export function newParams(alg: ReturnType<typeof getAlgorithm>) {
  const p = defaultParams(alg);
  if (alg.id === 'floor' && usePrefs.getState().floorAdaptive) p.adaptive = 'auto';
  // new grids cap their cells so a few icons don't each take half the page (saved grids keep 0)
  if (alg.id === 'grid') p.maxCell = usePrefs.getState().gridMaxCell;
  return p;
}

export function newInstance(algorithm: string, objectIds: string[], page: Page, base?: Partial<LayoutInstance>): LayoutInstance {
  const alg = getAlgorithm(algorithm);
  return {
    id: uid('lay'),
    name: alg.label,
    algorithm,
    params: newParams(alg),
    seed: randomSeed(),
    objectIds,
    slots: [],
    overlap: alg.defaultOverlap ?? 'strict',
    maxOverlap: 0.3,
    avoidFocal: page.focal.enabled,
    respectSafe: true,
    ...base,
  };
}

/**
 * Apply a layout algorithm to image objects. If they are exactly the members of one existing
 * layout, that layout switches algorithm (keeping seed/rules); otherwise a new layout is created.
 */
export function applyLayout(algorithm: string, ids?: string[]) {
  const page = getPage();
  let targetIds = (ids ?? useUI.getState().selection).filter((id) => page.objects.find((o) => o.id === id)?.type === 'image');
  if (!targetIds.length) targetIds = page.objects.filter((o) => o.type === 'image' && !o.locked && !o.hidden).map((o) => o.id);
  if (!targetIds.length) {
    toast('Add some assets to the canvas first', 'warning');
    return null;
  }
  const existing = selectionLayout(page, targetIds);
  const alg = getAlgorithm(algorithm);
  let instId = '';
  commit(`Layout: ${alg.label}`, (d) =>
    withPage(d, (p) => {
      if (existing && existing.objectIds.length === targetIds.length) {
        const prevAlg = getAlgorithm(existing.algorithm);
        const inst: LayoutInstance = {
          ...existing,
          algorithm,
          name: alg.label,
          params: { ...newParams(alg), order: existing.params.order ?? 'current' },
          overlap: prevAlg.id === alg.id ? existing.overlap : alg.defaultOverlap ?? existing.overlap,
          plane: alg.plane ? existing.plane && prevAlg.plane === alg.plane ? existing.plane : undefined : existing.plane,
        };
        instId = inst.id;
        return rerun(p, inst);
      }
      const set = new Set(targetIds);
      let np = detachFromLayouts(p, set);
      const inst = newInstance(algorithm, targetIds, np);
      instId = inst.id;
      np = { ...np, objects: np.objects.map((o) => (set.has(o.id) ? { ...o, layoutId: inst.id, pinned: false } : o)), layouts: [...np.layouts, inst] };
      return rerun(np, inst);
    }),
  );
  useUI.setState({ activeLayoutId: instId });
  select(targetIds);
  return instId;
}

export function updateLayout(instId: string, patch: Partial<LayoutInstance>, opts: { key?: string; label?: string; silent?: boolean } = {}) {
  const fn = (d: ProjectDoc) =>
    withPage(d, (p) => {
      const inst = findLayout(p, instId);
      if (!inst) return p;
      return rerun(p, { ...inst, ...patch });
    });
  if (opts.silent) mutate(fn);
  else commit(opts.label ?? 'Layout settings', fn, { key: opts.key });
}

// Slider drags fire many changes; heavy layouts (Cluster with hundreds of icons) take ~150 ms per
// run, so changes arriving in quick succession are merged and only the latest value is run.
const pendingParams = new Map<string, { instId: string; params: Record<string, ParamValue> }>();
let paramTimer: ReturnType<typeof setTimeout> | null = null;

export function setLayoutParam(instId: string, key: string, value: ParamValue) {
  const inst = findLayout(getPage(), instId);
  if (!inst) return;
  const prev = pendingParams.get(instId);
  pendingParams.set(instId, { instId, params: { ...(prev?.params ?? inst.params), [key]: value } });
  if (paramTimer) return;
  paramTimer = setTimeout(() => {
    paramTimer = null;
    const batch = [...pendingParams.values()];
    pendingParams.clear();
    for (const b of batch) updateLayout(b.instId, { params: b.params }, { key: `lp:${b.instId}:${key}`, label: 'Layout parameter' });
  }, 16);
}

export function reapplyLayout(instId: string) {
  updateLayout(instId, {}, { label: 'Reapply layout' });
}

export function randomizeLayout(instId: string) {
  const inst = findLayout(getPage(), instId);
  if (inst) rememberSeed(instId, inst.seed);
  updateLayout(instId, { seed: randomSeed() }, { label: 'Shuffle layout' });
}

/** Set an exact seed (keeps the previous one in the history). */
export function setLayoutSeed(instId: string, seed: number) {
  const inst = findLayout(getPage(), instId);
  if (!inst || inst.seed === seed) return;
  rememberSeed(instId, inst.seed);
  updateLayout(instId, { seed }, { label: 'Change seed' });
}

/** Shuffle which asset sits in which spot, keeping the arrangement itself. */
export function reorganizeLayout(instId: string) {
  const inst = findLayout(getPage(), instId);
  if (!inst) return;
  updateLayout(instId, { params: { ...inst.params, order: 'random', orderSeed: randomSeed() } }, { label: 'Reorganize assets' });
}

/** Reset every setting of the layout to its defaults (keeps objects, seed and rules). */
export function resetLayoutParams(instId: string) {
  const inst = findLayout(getPage(), instId);
  if (!inst) return;
  updateLayout(instId, { params: newParams(getAlgorithm(inst.algorithm)) }, { label: 'Reset layout settings' });
}

// Recently used seeds per layout (session only), so a nice arrangement can be found again.
const seedHistory = new Map<string, number[]>();
const seedListeners = new Set<() => void>();
function rememberSeed(instId: string, seed: number) {
  const list = (seedHistory.get(instId) ?? []).filter((s) => s !== seed);
  seedHistory.set(instId, [seed, ...list].slice(0, 8));
  seedListeners.forEach((f) => f());
}
export function seedHistoryOf(instId: string): number[] {
  return seedHistory.get(instId) ?? [];
}
export function onSeedHistory(fn: () => void) {
  seedListeners.add(fn);
  return () => void seedListeners.delete(fn);
}

export function unpinAll(instId: string) {
  commit('Unpin all', (d) =>
    withPage(d, (p) => {
      const inst = findLayout(p, instId);
      if (!inst) return p;
      const np = { ...p, objects: p.objects.map((o) => (o.layoutId === instId && o.pinned ? { ...o, pinned: false } : o)) };
      return rerun(np, inst);
    }),
  );
}

export function deleteLayout(instId: string) {
  commit('Remove layout', (d) =>
    withPage(d, (p) => ({
      ...p,
      objects: p.objects.map((o) => (o.layoutId === instId ? { ...o, layoutId: undefined, pinned: undefined } : o)),
      layouts: p.layouts.filter((l) => l.id !== instId),
    })),
  );
  if (useUI.getState().activeLayoutId === instId) useUI.setState({ activeLayoutId: null });
}

export function detachObjects(ids: string[]) {
  commit('Detach from layout', (d) => withPage(d, (p) => detachFromLayouts(p, new Set(ids))));
}

/** Add objects to an existing layout and re-run it. */
export function addToLayout(instId: string, ids: string[]) {
  commit('Add to layout', (d) =>
    withPage(d, (p) => {
      const set = new Set(ids);
      let np = detachFromLayouts(p, set);
      const inst = findLayout(np, instId) ?? findLayout(p, instId);
      if (!inst) return p;
      const next = { ...inst, objectIds: [...inst.objectIds.filter((id) => !set.has(id)), ...ids] };
      np = { ...np, objects: np.objects.map((o) => (set.has(o.id) ? { ...o, layoutId: instId, pinned: false } : o)), layouts: np.layouts.some((l) => l.id === instId) ? np.layouts : [...np.layouts, next] };
      return rerun(np, next);
    }),
  );
}

export function setPlane(instId: string, plane: Quad | undefined, silent = false) {
  updateLayout(instId, { plane }, { silent, label: 'Perspective plane' });
}

export function setPlanePreset(instId: string, preset: PlanePreset) {
  const page = getPage();
  const inst = findLayout(page, instId);
  if (!inst) return;
  const alg = getAlgorithm(inst.algorithm);
  if (!alg.plane) return;
  updateLayout(instId, { plane: presetPlane(alg.plane, layoutArea(page, inst), preset) }, { label: 'Perspective preset' });
}

export function setPath(instId: string, path: Vec[] | undefined, silent = false) {
  updateLayout(instId, { path }, { silent, label: 'Edit path' });
}

export function setPathPreset(instId: string, preset: PathPreset) {
  const page = getPage();
  const inst = findLayout(page, instId);
  if (!inst) return;
  updateLayout(instId, { path: presetPath(preset, layoutArea(page, inst)) }, { label: 'Path preset' });
}

/** After manual moves in a perspective layout: re-sort paint order by depth. */
export function resortDepth(ids: string[]) {
  const page = getPage();
  const insts = new Set(page.objects.filter((o) => ids.includes(o.id) && o.layoutId).map((o) => o.layoutId!));
  for (const lid of insts) {
    const inst = findLayout(page, lid);
    if (!inst || !getAlgorithm(inst.algorithm).plane) continue;
    mutate((d) => withPage(d, (p) => ({ ...p, objects: depthSortObjects(p.objects, p, inst, getAsset) })));
  }
}

export function setDepthOverride(ids: string[], mode: 'auto' | 'manual', depth?: number) {
  commit('Depth override', (d) =>
    withPage(d, (p) => {
      let np: Page = { ...p, objects: p.objects.map((o) => (ids.includes(o.id) ? { ...o, depthMode: mode, depth: mode === 'manual' ? depth ?? o.depth ?? 0.5 : undefined } : o)) };
      const lids = new Set(np.objects.filter((o) => ids.includes(o.id) && o.layoutId).map((o) => o.layoutId!));
      for (const lid of lids) {
        const inst = findLayout(np, lid);
        if (inst && getAlgorithm(inst.algorithm).plane) np = { ...np, objects: depthSortObjects(np.objects, np, inst, getAsset) };
      }
      return np;
    }),
    { key: 'depth:' + ids.join(',') },
  );
}

export function setOverlapMode(instId: string, overlap: OverlapMode) {
  updateLayout(instId, { overlap }, { label: 'Overlap mode' });
}

// ---------------------------------------------------------------------------
// Layout presets (global; reusable across projects)
// ---------------------------------------------------------------------------

function normQuad(q: Quad | undefined, page: Page): Quad | undefined {
  return q ? (q.map((p) => ({ x: p.x / page.width, y: p.y / page.height })) as Quad) : undefined;
}
function denormQuad(q: Quad | undefined, page: Page): Quad | undefined {
  return q ? (q.map((p) => ({ x: p.x * page.width, y: p.y * page.height })) as Quad) : undefined;
}

export function presetFromInstance(inst: LayoutInstance, page: Page): LayoutPresetData {
  return {
    algorithm: inst.algorithm,
    params: inst.params,
    seed: inst.seed,
    overlap: inst.overlap,
    maxOverlap: inst.maxOverlap,
    avoidFocal: inst.avoidFocal,
    respectSafe: inst.respectSafe,
    plane: normQuad(inst.plane, page),
    path: inst.path?.map((p) => ({ x: p.x / page.width, y: p.y / page.height })),
  };
}

export async function saveLayoutPreset(instId: string, name: string) {
  const page = getPage();
  const inst = findLayout(page, instId);
  if (!inst) return;
  const preset: StoredPreset<LayoutPresetData> = { id: uid('lp'), kind: 'layout', name, createdAt: Date.now(), data: presetFromInstance(inst, page) };
  await db.putPreset(preset);
  await refreshPresets();
  toast(`Saved layout preset “${name}”`, 'success');
}

export function instanceFromPreset(data: LayoutPresetData, page: Page): Partial<LayoutInstance> {
  const alg = getAlgorithm(data.algorithm);
  return {
    algorithm: alg.id,
    name: alg.label,
    params: withDefaults(alg, data.params),
    seed: data.seed,
    overlap: data.overlap,
    maxOverlap: data.maxOverlap,
    avoidFocal: data.avoidFocal,
    respectSafe: data.respectSafe,
    plane: denormQuad(data.plane, page),
    path: data.path?.map((p) => ({ x: p.x * page.width, y: p.y * page.height })),
  };
}

/** Apply a stored preset: to the current layout of the selection, or as a new layout. */
export function applyLayoutPreset(data: LayoutPresetData) {
  const page = getPage();
  const ids = useUI.getState().selection;
  const existing = selectionLayout(page, ids);
  if (existing) {
    updateLayout(existing.id, instanceFromPreset(data, page), { label: 'Apply layout preset' });
    return;
  }
  const id = applyLayout(data.algorithm, ids);
  if (id) updateLayout(id, instanceFromPreset(data, getPage()), { label: 'Apply layout preset' });
}

/** Re-run every layout on the page that avoids the focal region (after the region changed). */
export function rerunFocalLayouts(silent = true) {
  const page = getPage();
  const ids = page.layouts.filter((l) => l.avoidFocal || getAlgorithm(l.algorithm).safeZoneParams).map((l) => l.id);
  if (!ids.length) return;
  const fn = (d: ProjectDoc) =>
    withPage(d, (p) => {
      let np = p;
      for (const id of ids) {
        const inst = findLayout(np, id);
        if (inst) np = runLayout(np, inst, { getAsset });
      }
      return np;
    });
  if (silent) mutate(fn);
  else commit('Re-run layouts', fn);
}
