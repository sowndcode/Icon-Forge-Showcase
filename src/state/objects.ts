// Object-level editing actions on the active page.

import { align, centerOnCanvas, distributeCenters, equalGaps, normalizeVisualSize, type AlignOp, type NormalizeMode, type Patches } from '../core/align';
import { createImage } from '../core/defaults';
import { uid } from '../core/ids';
import { selectionAABB, visibleSize } from '../core/transform';
import type { ImageObject, Page, SceneObject, TextObject, Vec } from '../core/types';
import { textHeight, withTextDefaults } from '../render/text';
import { improveContrast, textContrast } from '../core/textLooks';
import { commit, getAsset, getDoc, getPage, mutate, withPage } from './doc';
import { usePrefs } from './prefs';
import { toast, useUI } from './ui';

export const sel = () => useUI.getState().selection;

export function selectedObjects(page = getPage()): SceneObject[] {
  const ids = new Set(sel());
  return page.objects.filter((o) => ids.has(o.id));
}

/** Expand a set of ids so that picking one group member selects the whole group. */
export function expandGroups(ids: string[], page = getPage()): string[] {
  const want = new Set(ids);
  const groups = new Set(page.objects.filter((o) => o.groupId && want.has(o.id)).map((o) => o.groupId!));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const o of page.objects) if (o.groupId && groups.has(o.groupId)) out.add(o.id);
  return [...out];
}

export function select(ids: string[]) {
  useUI.getState().setSelection(ids);
}

function fixText(o: SceneObject): SceneObject {
  if (o.type !== 'text') return o;
  const h = textHeight(o);
  return Math.abs(h - o.h) > 0.01 ? { ...o, h } : o;
}

export function applyPatches(page: Page, patches: Patches | Record<string, Partial<SceneObject>>): Page {
  const map = patches instanceof Map ? patches : new Map(Object.entries(patches));
  if (!map.size) return page;
  let changed = false;
  const objects = page.objects.map((o) => {
    const p = map.get(o.id);
    if (!p) return o;
    changed = true;
    let n = { ...o, ...p } as SceneObject;
    if (n.type === 'text' && ('style' in p || 'text' in p || 'w' in p)) n = fixText(n);
    return n;
  });
  return changed ? { ...page, objects } : page;
}

/** Patch objects with history (or silently while a gesture is running). */
export function patchObjects(patches: Patches | Record<string, Partial<SceneObject>>, label = 'Edit', opts: { key?: string; silent?: boolean } = {}) {
  const fn = (d: ReturnType<typeof getDoc>) => withPage(d, (p) => applyPatches(p, patches));
  if (opts.silent) mutate(fn);
  else commit(label, fn, { key: opts.key });
}

export function patchSelection(patch: Partial<SceneObject> | ((o: SceneObject) => Partial<SceneObject> | null), label = 'Edit', key?: string) {
  const patches: Patches = new Map();
  for (const o of selectedObjects()) {
    const p = typeof patch === 'function' ? patch(o) : patch;
    if (p) patches.set(o.id, p);
  }
  patchObjects(patches, label, { key });
}

export function addObjects(objs: SceneObject[], label = 'Add', selectThem = true) {
  if (!objs.length) return;
  commit(label, (d) => withPage(d, (p) => ({ ...p, objects: [...p.objects, ...objs.map(fixText)] })));
  if (selectThem) select(objs.map((o) => o.id));
}

/** Default on-canvas size for an asset: visible longest side ≈ `frac` of the page's short side. */
export function defaultImageSize(assetId: string, page: Page, frac = 0.22) {
  const a = getAsset(assetId);
  const W = a?.width || 256,
    H = a?.height || 256;
  const v = visibleSize(a);
  const target = Math.min(page.width, page.height) * frac;
  const k = target / Math.max(v.w, v.h);
  return { w: W * k, h: H * k };
}

export function newImageObject(assetId: string, at: Vec, page: Page, frac?: number): ImageObject {
  const a = getAsset(assetId);
  const { w, h } = defaultImageSize(assetId, page, frac);
  return createImage(assetId, a ? a.name.replace(/\.[^.]+$/, '') : 'Image', at.x, at.y, w, h);
}

export function deleteSelection() {
  const ids = new Set(sel());
  if (!ids.size) return;
  commit(`Delete ${ids.size}`, (d) =>
    withPage(d, (p) => ({
      ...p,
      objects: p.objects.filter((o) => !ids.has(o.id)),
      layouts: p.layouts.map((l) => ({ ...l, objectIds: l.objectIds.filter((id) => !ids.has(id)) })).filter((l) => l.objectIds.length),
      groups: p.groups.filter((g) => p.objects.some((o) => o.groupId === g.id && !ids.has(o.id))),
    })),
  );
  select([]);
}

function cloneObjects(objs: SceneObject[], dx: number, dy: number): SceneObject[] {
  const groupMap = new Map<string, string>();
  return objs.map((o) => {
    let groupId = o.groupId;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid('grp'));
      groupId = groupMap.get(groupId);
    }
    // duplicates are manual objects (not controlled by the original's layout)
    return { ...o, id: uid(o.type.slice(0, 2)), x: o.x + dx, y: o.y + dy, groupId, layoutId: undefined, pinned: undefined } as SceneObject;
  });
}

export function duplicateSelection(offset = 24) {
  const page = getPage();
  const objs = selectedObjects(page);
  if (!objs.length) return;
  const clones = cloneObjects(objs, offset, offset);
  const newGroups = new Map<string, string>();
  objs.forEach((o, i) => o.groupId && clones[i].groupId && newGroups.set(clones[i].groupId!, page.groups.find((g) => g.id === o.groupId)?.name ?? 'Group'));
  commit('Duplicate', (d) =>
    withPage(d, (p) => ({ ...p, objects: [...p.objects, ...clones], groups: [...p.groups, ...[...newGroups].map(([id, name]) => ({ id, name: name + ' copy' }))] })),
  );
  select(clones.map((c) => c.id));
}

let clipboard: SceneObject[] = [];
let pasteCount = 0;
export function copySelection() {
  clipboard = selectedObjects().map((o) => ({ ...o }));
  pasteCount = 0;
  if (clipboard.length) toast(`Copied ${clipboard.length} object${clipboard.length > 1 ? 's' : ''}`);
}
export function paste() {
  if (!clipboard.length) return;
  pasteCount++;
  const clones = cloneObjects(clipboard, 24 * pasteCount, 24 * pasteCount);
  const gids = [...new Set(clones.map((c) => c.groupId).filter(Boolean))] as string[];
  commit('Paste', (d) => withPage(d, (p) => ({ ...p, objects: [...p.objects, ...clones], groups: [...p.groups, ...gids.map((id) => ({ id, name: 'Group' }))] })));
  select(clones.map((c) => c.id));
}
export const hasClipboard = () => clipboard.length > 0;

export function nudge(dx: number, dy: number) {
  const objs = selectedObjects().filter((o) => !o.locked);
  if (!objs.length) return;
  const auto = usePrefs.getState().autoPin;
  patchObjects(new Map(objs.map((o) => [o.id, { x: o.x + dx, y: o.y + dy, ...(auto && o.layoutId ? { pinned: true } : {}) }])), 'Nudge', { key: 'nudge' });
}

// ---------------------------------------------------------------------------
// Layer order
// ---------------------------------------------------------------------------

export type OrderOp = 'forward' | 'backward' | 'front' | 'back';

export function reorderSelection(op: OrderOp) {
  const ids = new Set(sel());
  if (!ids.size) return;
  commit('Reorder', (d) =>
    withPage(d, (p) => {
      const objs = p.objects.slice();
      if (op === 'front') return { ...p, objects: [...objs.filter((o) => !ids.has(o.id)), ...objs.filter((o) => ids.has(o.id))] };
      if (op === 'back') return { ...p, objects: [...objs.filter((o) => ids.has(o.id)), ...objs.filter((o) => !ids.has(o.id))] };
      if (op === 'forward') {
        for (let i = objs.length - 2; i >= 0; i--) if (ids.has(objs[i].id) && !ids.has(objs[i + 1].id)) [objs[i], objs[i + 1]] = [objs[i + 1], objs[i]];
      } else {
        for (let i = 1; i < objs.length; i++) if (ids.has(objs[i].id) && !ids.has(objs[i - 1].id)) [objs[i], objs[i - 1]] = [objs[i - 1], objs[i]];
      }
      return { ...p, objects: objs };
    }),
  );
}

/** Move objects (layers panel drag) so they sit directly above `targetId` (or at the bottom). */
export function moveLayers(ids: string[], targetId: string | null, above: boolean) {
  const set = new Set(ids);
  commit('Reorder layers', (d) =>
    withPage(d, (p) => {
      const moving = p.objects.filter((o) => set.has(o.id));
      const rest = p.objects.filter((o) => !set.has(o.id));
      let idx = targetId ? rest.findIndex((o) => o.id === targetId) : 0;
      if (idx < 0) idx = rest.length;
      else if (above) idx += 1;
      // dropping onto a group member joins that group
      const target = rest.find((o) => o.id === targetId);
      const moved = moving.map((o) => (target && target.groupId !== o.groupId ? { ...o, groupId: target.groupId } : o));
      return { ...p, objects: [...rest.slice(0, idx), ...moved, ...rest.slice(idx)] };
    }),
  );
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function groupSelection() {
  const objs = selectedObjects();
  if (objs.length < 2) return;
  const id = uid('grp');
  const ids = new Set(objs.map((o) => o.id));
  const page = getPage();
  const n = page.groups.length + 1;
  commit('Group', (d) =>
    withPage(d, (p) => {
      const members = p.objects.filter((o) => ids.has(o.id)).map((o) => ({ ...o, groupId: id }));
      const top = Math.max(...p.objects.map((o, i) => (ids.has(o.id) ? i : -1)));
      const before = p.objects.slice(0, top + 1).filter((o) => !ids.has(o.id));
      const after = p.objects.slice(top + 1);
      const used = new Set([...before, ...after].map((o) => o.groupId).filter(Boolean));
      return { ...p, objects: [...before, ...members, ...after], groups: [...p.groups.filter((g) => used.has(g.id)), { id, name: `Group ${n}` }] };
    }),
  );
}

export function ungroupSelection() {
  const gids = new Set(selectedObjects().map((o) => o.groupId).filter(Boolean) as string[]);
  if (!gids.size) return;
  commit('Ungroup', (d) =>
    withPage(d, (p) => ({ ...p, objects: p.objects.map((o) => (o.groupId && gids.has(o.groupId) ? { ...o, groupId: undefined } : o)), groups: p.groups.filter((g) => !gids.has(g.id)) })),
  );
}

export function renameGroup(id: string, name: string) {
  commit('Rename group', (d) => withPage(d, (p) => ({ ...p, groups: p.groups.map((g) => (g.id === id ? { ...g, name } : g)) })));
}

export function setGroupFlag(id: string, patch: Partial<Pick<SceneObject, 'hidden' | 'locked'>>) {
  commit('Group visibility', (d) => withPage(d, (p) => ({ ...p, objects: p.objects.map((o) => (o.groupId === id ? { ...o, ...patch } : o)) })));
}

export function toggleGroupCollapsed(id: string) {
  mutate((d) => withPage(d, (p) => ({ ...p, groups: p.groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)) })));
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

export function flipSelection(axis: 'x' | 'y') {
  const objs = selectedObjects();
  if (!objs.length) return;
  const box = selectionAABB(objs, getAsset, false)!;
  const cx = box.x + box.w / 2,
    cy = box.y + box.h / 2;
  const patches: Patches = new Map();
  for (const o of objs) {
    if (axis === 'x') patches.set(o.id, { flipX: !o.flipX, x: objs.length > 1 ? 2 * cx - o.x : o.x, rotation: -o.rotation });
    else patches.set(o.id, { flipY: !o.flipY, y: objs.length > 1 ? 2 * cy - o.y : o.y, rotation: -o.rotation });
  }
  patchObjects(patches, axis === 'x' ? 'Flip horizontal' : 'Flip vertical');
}

export function resetTransform() {
  patchSelection((o) => {
    if (o.type === 'image') {
      const a = getAsset(o.assetId);
      const ar = a && a.height ? a.width / a.height : o.w / o.h;
      // a Ground Plane icon stands up again
      return { rotation: 0, flipX: false, flipY: false, opacity: 1, h: o.w / ar, warp: undefined };
    }
    return { rotation: 0, flipX: false, flipY: false, opacity: 1 };
  }, 'Reset transform');
}

export function setSelectionScale(k: number) {
  // absolute source scale for images (1 = 100% of source pixels)
  patchSelection((o) => {
    if (o.type !== 'image') return null;
    const a = getAsset(o.assetId);
    if (!a) return null;
    return { w: a.width * k, h: a.height * k };
  }, 'Scale');
}

// ---------------------------------------------------------------------------
// Align / distribute / normalise
// ---------------------------------------------------------------------------

export function alignSelection(op: AlignOp, toCanvas = false) {
  const objs = selectedObjects().filter((o) => !o.locked);
  if (!objs.length) return;
  const page = getPage();
  const visible = usePrefs.getState().alignVisible;
  const target = toCanvas || objs.length === 1 ? { x: 0, y: 0, w: page.width, h: page.height } : undefined;
  patchObjects(markPinned(align(objs, op, getAsset, visible, target)), 'Align');
}

export function distributeSelection(axis: 'x' | 'y', mode: 'centers' | 'gaps') {
  const objs = selectedObjects().filter((o) => !o.locked);
  const visible = usePrefs.getState().alignVisible;
  const p = mode === 'centers' ? distributeCenters(objs, axis, getAsset, visible) : equalGaps(objs, axis, getAsset, visible);
  patchObjects(markPinned(p), 'Distribute');
}

export function centerSelection(axes: 'both' | 'x' | 'y') {
  const objs = selectedObjects().filter((o) => !o.locked);
  patchObjects(markPinned(centerOnCanvas(objs, getPage(), getAsset, usePrefs.getState().alignVisible, axes)), 'Center on canvas');
}

export function normalizeSelection(mode: NormalizeMode, opts: { refId?: string; occupancy?: number; metric?: 'area' | 'longest' } = {}) {
  const objs = selectedObjects().filter((o) => !o.locked);
  if (objs.filter((o) => o.type === 'image').length < (mode === 'occupancy' ? 1 : 2)) {
    toast('Select at least two images to normalize', 'warning');
    return;
  }
  patchObjects(markPinned(normalizeVisualSize(objs, getAsset, mode, opts)), 'Normalize visual size');
}

/** Manual edits on layout-controlled objects pin them (when auto-pin is on). */
export function markPinned(p: Patches): Patches {
  if (!usePrefs.getState().autoPin) return p;
  const page = getPage();
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  for (const [id, patch] of p) if (byId.get(id)?.layoutId) p.set(id, { ...patch, pinned: true });
  return p;
}

export function setPinned(ids: string[], pinned: boolean) {
  patchObjects(new Map(ids.map((id) => [id, { pinned }])), pinned ? 'Pin' : 'Unpin');
}

export function setHero(ids: string[], hero: boolean) {
  patchObjects(new Map(ids.map((id) => [id, { hero }])), hero ? 'Mark hero' : 'Unmark hero');
}

export function updateText(id: string, patch: Partial<TextObject>, key?: string) {
  // typed words are user content: templates and themes must never replace them
  patchObjects({ [id]: patch.text !== undefined ? { ...patch, textEdited: true } : patch }, 'Edit text', { key });
}

/**
 * Change part of a text object's style. The patch is merged into the style as it is in the document at
 * that moment (not as a component last rendered it), so quick successive edits never undo each other.
 */
export function updateTextStyle(id: string, patch: Partial<TextObject['style']> | ((s: TextObject['style']) => Partial<TextObject['style']>), key?: string, label = 'Text style') {
  const o = getPage().objects.find((x) => x.id === id);
  if (!o || o.type !== 'text') return;
  const p = typeof patch === 'function' ? patch(o.style) : patch;
  patchObjects({ [id]: { style: { ...o.style, ...p } } as Partial<TextObject> }, label, { key });
}

export function replaceImageAsset(objId: string, assetId: string) {
  const page = getPage();
  const o = page.objects.find((x) => x.id === objId);
  if (!o || o.type !== 'image') return;
  const oldA = getAsset(o.assetId),
    newA = getAsset(assetId);
  if (!newA) return;
  // keep the visible size: match longest visible side
  const ov = visibleSize(oldA),
    nv = visibleSize(newA);
  const oldK = o.w / (oldA?.width || o.w);
  const visLongest = Math.max(ov.w, ov.h) * oldK;
  const k = visLongest / Math.max(nv.w, nv.h);
  patchObjects({ [objId]: { assetId, w: newA.width * k, h: newA.height * k, name: newA.name.replace(/\.[^.]+$/, '') } as Partial<ImageObject> }, 'Replace image');
}

export function selectAllObjects() {
  select(getPage().objects.filter((o) => !o.hidden && !o.locked).map((o) => o.id));
}

export function setObjectsFlag(ids: string[], patch: Partial<Pick<SceneObject, 'hidden' | 'locked' | 'name'>>, label: string) {
  patchObjects(new Map(ids.map((id) => [id, patch])), label);
}

/** Texts on a page that are hard to read where they sit (contrast under 4.5:1), with the colour fix for each. */
export function pageReadability(page: Page, sample: (p: Page, id: string) => { avg: string; dark: string; light: string } | null) {
  const out: { id: string; ratio: number; fix: Partial<TextObject['style']> }[] = [];
  for (const o of page.objects) {
    if (o.type !== 'text' || o.hidden) continue;
    const b = sample(page, o.id);
    if (!b) continue;
    const tones = [b.dark, b.avg, b.light];
    const s = withTextDefaults(o.style);
    const ratio = textContrast(s, tones);
    if (ratio < 4.5) out.push({ id: o.id, ratio, fix: improveContrast(s, tones) });
  }
  return out;
}

/** Apply colour fixes to several texts in one undo step. */
export function fixTexts(fixes: { id: string; fix: Partial<TextObject['style']> }[]) {
  const page = getPage();
  const patches: Record<string, Partial<SceneObject>> = {};
  for (const f of fixes) {
    const o = page.objects.find((x) => x.id === f.id);
    if (o?.type === 'text') patches[f.id] = { style: { ...o.style, ...f.fix } } as Partial<TextObject>;
  }
  if (Object.keys(patches).length) patchObjects(patches, `Improve contrast of ${fixes.length} text${fixes.length === 1 ? '' : 's'}`);
}
