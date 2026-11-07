// Project lifecycle: autosave (IndexedDB), restore after reload, new/open/save/save-as and the
// portable .showcase file (zip: project.json + original asset files + fonts).

import { guideAction } from './guideProgress';
import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import { createPage, createProject, defaultBackground, defaultFocal, defaultSafeZone, defaultTextStyle } from '../core/defaults';
import { cleanWatermark } from '../core/watermark';
import { newProjectWatermark } from './watermark';
import { uid } from '../core/ids';
import type { AssetRecord, Background, Page, ProjectDoc, ProjectMeta, SceneObject } from '../core/types';
import { images } from '../render/images';
import { renderPage } from '../render/renderer';
import { db, requestPersistentStorage, usesFiles } from '../services/db';
import { migrateEarlierData } from '../services/migrate';
import { fontBlobs, loadProjectFonts } from '../services/fonts';
import { unzipProject } from '../services/formats';
import { chooseSaveTarget, download, native, writeTarget, type SaveTarget } from '../services/native';
import { hydrateAssets, processAsset } from './assets';
import { restorePrefs, usePrefs } from './prefs';
import { getAsset, getDoc, loadDoc, markFileSaved, mutate, unloadDoc, useDoc } from './doc';
import { askChoice } from '../ui/components/ask';
import { BUILTIN_TEMPLATES, buildTemplatePage, libraryAssets, packNameGuess, DEFAULT_TEMPLATE_OPTIONS, type TemplateOptions } from './generators';
import { fitView, toast, useUI } from './ui';

const LAST_KEY = 'lastProject';
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savingNow = false;
let lastSavedRev = -1;
let fileTarget: SaveTarget | null = null;

export const hasPendingSave = () => !!saveTimer || savingNow;

function meta(d: ProjectDoc, thumb?: string): ProjectMeta {
  const first = d.pages[0];
  return { id: d.id, name: d.name, updatedAt: d.updatedAt, createdAt: d.createdAt, pages: d.pages.length, assets: d.assets.length, thumb, width: first?.width, height: first?.height };
}

// Project thumbnails: the first page rendered small, refreshed at most every few seconds while editing.
const THUMB_SIZE = 360;
let thumb: { id: string; url: string; at: number } | null = null;

async function renderThumb(d: ProjectDoc): Promise<string | undefined> {
  // the first page with something on it (an empty first page made every thumbnail look the same)
  const page = d.pages.find((p) => p.objects.length) ?? d.pages[0];
  if (!page || typeof OffscreenCanvas === 'undefined') return undefined;
  const k = THUMB_SIZE / Math.max(page.width, page.height);
  const c = new OffscreenCanvas(Math.max(1, Math.round(page.width * k)), Math.max(1, Math.round(page.height * k)));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  renderPage(ctx, page, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => res(undefined);
    r.readAsDataURL(blob);
  });
}

async function currentThumb(d: ProjectDoc): Promise<string | undefined> {
  if (thumb && thumb.id === d.id && Date.now() - thumb.at < 4000) return thumb.url;
  const url = await renderThumb(d).catch(() => undefined);
  if (url) thumb = { id: d.id, url, at: Date.now() };
  return url ?? (thumb?.id === d.id ? thumb.url : undefined);
}

let saveFailing = false;
const SAVE_RETRY_MS = 5000;
/** Saves run one after another; closing, switching and deleting wait for the one in flight. */
let saveChain: Promise<boolean> = Promise.resolve(true);
/** Projects deleted in this session: nothing may write them again (a late save would bring them back). */
const deleted = new Set<string>();

async function saveOnce(): Promise<boolean> {
  const s = useDoc.getState();
  // no project open, or one that was just deleted: nothing to save
  if (!s.open || !s.doc.id || deleted.has(s.doc.id)) return true;
  if (s.rev === lastSavedRev) return true;
  savingNow = true;
  const doc = s.doc,
    rev = s.rev;
  try {
    const t = await currentThumb(doc);
    // deleted while the thumbnail was made: don't write it back
    if (deleted.has(doc.id)) return true;
    await db.putProject({ id: doc.id, meta: meta(doc, t), doc });
    // the project to reopen next time: only while it is still the open one
    const now = useDoc.getState();
    if (now.open && now.doc.id === doc.id) await db.setKV(LAST_KEY, doc.id);
    if (useDoc.getState().doc.id === doc.id) lastSavedRev = rev;
    if (saveFailing) toast('Saved again — your changes are safe', 'success');
    saveFailing = false;
    return true;
  } catch (e) {
    // say it once per failure, and keep retrying (a full disk or a locked file is often temporary)
    if (!saveFailing) toast('Autosave failed: ' + (e instanceof Error ? e.message : String(e)) + ' — retrying every few seconds. Keep the app open.', 'error', 15000);
    saveFailing = true;
    lastSaveError = e instanceof Error ? e.message : String(e);
    if (!saveTimer) saveTimer = setTimeout(() => void saveNow(), SAVE_RETRY_MS);
    return false;
  } finally {
    savingNow = false;
  }
}

let lastSaveError = '';

/** Save the open project now (after any save in flight). Resolves false when the write failed. */
export function saveNow(): Promise<boolean> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  saveChain = saveChain.then(saveOnce, saveOnce);
  return saveChain;
}

/** Wait for every save in flight, without starting one. */
const settleSaves = () => saveChain.then(() => undefined, () => undefined);

/** True while saving keeps failing (retries are scheduled). */
export const autosaveFailing = () => saveFailing;

export function startAutosave() {
  useDoc.subscribe((s, prev) => {
    if (s.rev === prev.rev) return;
    if (saveTimer) clearTimeout(saveTimer);
    // Settings ▸ Projects & autosave: seconds of quiet before saving
    saveTimer = setTimeout(() => void saveNow(), Math.max(300, (usePrefs.getState().autosaveDelay || 0.7) * 1000));
  });
  window.addEventListener('beforeunload', (e) => {
    if (hasPendingSave()) {
      void saveNow();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveNow();
  });
}

/** The objects of `v` when it is a list (anything else in it is dropped); otherwise an empty list. */
const list = <T,>(v: unknown, keep: (x: Record<string, unknown>) => boolean = () => true): T[] => (Array.isArray(v) ? v.filter((x) => !!x && typeof x === 'object' && !Array.isArray(x) && keep(x)) : []) as T[];
const OBJECT_TYPES = new Set(['image', 'text', 'shape']);
const finitePos = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
const finite = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Fill fields that older/foreign documents may be missing, and drop entries a damaged or hand-edited
 * file cannot use (so one bad object never makes a whole project unopenable or crash drawing).
 */
export function sanitizeDoc(d: ProjectDoc): ProjectDoc {
  const rawPages = list<Page>(d.pages);
  const pages = (rawPages.length ? rawPages : createProject().pages).map((p) => ({
    ...p,
    width: finitePos(p.width, 1920),
    height: finitePos(p.height, 1080),
    objects: list<SceneObject>(p.objects, (o) => OBJECT_TYPES.has(o.type as string) && typeof o.id === 'string').map((o) => {
      const b = { ...o, x: finite(o.x, 0), y: finite(o.y, 0), w: finite(o.w, 1), h: finite(o.h, 1), rotation: finite(o.rotation, 0), opacity: finite(o.opacity, 1), flipX: !!o.flipX, flipY: !!o.flipY, name: typeof o.name === 'string' ? o.name : o.type };
      // saved styles are kept exactly as they are (the renderer fills missing keys); only a missing style is replaced
      if (b.type === 'text') return { ...b, text: typeof b.text === 'string' ? b.text : '', style: b.style && typeof b.style === 'object' ? b.style : defaultTextStyle() } as SceneObject;
      return b as SceneObject;
    }),
    groups: list<Page['groups'][number]>(p.groups),
    layouts: list<Page['layouts'][number]>(p.layouts, (l) => typeof l.algorithm === 'string').map((l) => ({ ...Object.assign({ slots: [], overlap: 'strict' as const, maxOverlap: 0.3, avoidFocal: false, respectSafe: true }, l), objectIds: Array.isArray(l.objectIds) ? l.objectIds : [], params: l.params && typeof l.params === 'object' ? l.params : {} })),
    guides: list<Page['guides'][number]>(p.guides),
    safeZone: { ...defaultSafeZone(), ...p.safeZone },
    focal: { ...defaultFocal(p.width, p.height), ...p.focal },
    background: { ...defaultBackground(), ...p.background, image: { ...defaultBackground().image, ...p.background?.image }, overlay: { ...defaultBackground().overlay, ...p.background?.overlay }, pattern: { ...defaultBackground().pattern, ...p.background?.pattern }, light: { ...defaultBackground().light, ...p.background?.light }, vignette: { ...defaultBackground().vignette, ...p.background?.vignette } },
  }));
  return {
    ...d,
    version: 1,
    name: typeof d.name === 'string' ? d.name : 'Untitled showcase',
    fonts: list<ProjectDoc['fonts'][number]>(d.fonts, (f) => typeof f.id === 'string'),
    assets: list<ProjectDoc['assets'][number]>(d.assets, (a) => typeof a.id === 'string').map((a) => ({ ...a, status: a.status === 'ready' || a.status === 'pending' ? ('pending' as const) : a.status })),
    pages,
    activePageId: pages.some((p) => p.id === d.activePageId) ? d.activePageId : pages[0].id,
    // projects saved before watermarks have none (disabled); saved settings are completed, never reset
    watermark: d.watermark ? cleanWatermark(d.watermark) : undefined,
  };
}

async function activate(doc: ProjectDoc, blobs?: Map<string, Blob>, clean = true) {
  images.clear();
  fileTarget = null;
  loadDoc(doc, { clean });
  lastSavedRev = -1;
  useUI.setState({ selection: [], librarySel: [], activeLayoutId: null, editingTextId: null });
  await loadProjectFonts(blobs);
  void hydrateAssets(doc, blobs);
  const p = doc.pages.find((x) => x.id === doc.activePageId) ?? doc.pages[0];
  requestAnimationFrame(() => fitView(p.width, p.height));
}

/**
 * Before another project replaces the open one: save it and confirm that worked. If saving fails the
 * user decides — keep it open (the default) or continue without the latest changes.
 */
async function releaseOpenProject(action: string): Promise<boolean> {
  if (!useDoc.getState().open) return true;
  if (await saveNow()) return true;
  const answer = await askChoice({
    title: 'Your latest changes could not be saved',
    message: `${lastSaveError || 'Saving failed.'}\n\nKeep the project open to try again (autosave keeps retrying), or ${action} without the changes made since the last successful save.`,
    choices: [
      { value: 'go', label: `${action[0].toUpperCase()}${action.slice(1)} anyway` },
      { value: 'keep', label: 'Keep it open', primary: true },
    ],
  });
  const go = answer === 'go';
  if (go) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    saveFailing = false;
  }
  return go;
}

/** Forget the open project's editor state (no project open afterwards). */
function unloadProject() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  images.clear();
  fileTarget = null;
  thumb = null;
  unloadDoc();
  lastSavedRev = useDoc.getState().rev;
  useUI.setState({ selection: [], librarySel: [], activeLayoutId: null, editingTextId: null, hoverId: null, pageSel: [], stage: useUI.getState().stage === 'guide' ? 'guide' : 'home', dialog: null });
}

/**
 * Close the open project: save it (waiting for the save to finish), then show Home with no project
 * open. Nothing is deleted or created; the project stays in Recent projects. The next start opens
 * no project. Returns false when the user kept the project open after a failed save.
 */
export async function closeProject(): Promise<boolean> {
  if (!useDoc.getState().open) return true;
  if (!(await releaseOpenProject('close it'))) return false;
  await settleSaves();
  unloadProject();
  await db.setKV(LAST_KEY, '').catch(() => undefined);
  return true;
}

/** A damaged project file was replaced by its newest autosave: say so. */
function noteRecovery(p: { recovered?: string } | undefined) {
  if (p?.recovered) toast(`This project's file was damaged — restored from the autosave of ${p.recovered.slice(0, 10)}. The damaged file was kept.`, 'info');
}

export async function boot() {
  void requestPersistentStorage();
  // data saved by earlier versions moves into the data folder once (desktop app)
  const moved = await migrateEarlierData((bootNote) => useUI.setState({ bootNote })).catch((e) => {
    console.error('migration', e);
    return { ok: false, projects: 0, problems: [String(e)], reportPath: '' };
  });
  await restorePrefs();
  if (moved?.ok && moved.projects) toast(`Moved ${moved.projects} project${moved.projects === 1 ? '' : 's'} into the app's data folder. The old copy was left untouched.`, 'success');
  else if (moved && !moved.ok) toast('Some earlier data could not be moved yet — nothing was deleted, and it will be retried on the next start. See data/migration/report.txt.', 'error');
  try {
    const last = await db.getKV<string>(LAST_KEY);
    const stored = last ? await db.getProject(last) : undefined;
    noteRecovery(stored);
    // no project last time (closed, deleted or first start): Home with no project open
    if (stored) await activate(sanitizeDoc(stored.doc), undefined, true);
    // Settings → Start on: last project goes straight into the editor
    if (stored && usePrefs.getState().startScreen === 'last') {
      const last = usePrefs.getState().lastStage;
      useUI.setState({ stage: (['compose', 'arrange', 'watermark', 'review', 'export', 'import'] as const).find((s) => s === last) ?? 'compose' });
    }
  } catch (e) {
    toast('Could not open the last project: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
  if (!useDoc.getState().open) useUI.setState({ stage: 'home' });
  useUI.setState({ booting: false, bootNote: null });
}

/** "Untitled showcase", then "Untitled showcase 2", 3… so exports from different projects never share a name. */
async function uniqueProjectName(base: string): Promise<string> {
  const taken = new Set((await db.listProjects().catch(() => [])).map((p) => p.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

export async function newProject(name = 'Untitled showcase') {
  await createNewProject({ name, width: 1920, height: 1080, copyAssets: false });
}

export interface NewProjectOptions {
  name: string;
  width: number;
  height: number;
  /** Built-in template id; built at its own size unless `templateOptions.size` says otherwise. */
  templateId?: string;
  templateOptions?: TemplateOptions;
  background?: Background;
  /** Copy the asset library of the currently open project into the new one (all of it). */
  copyAssets: boolean;
  /** Reuse assets from a saved project instead: only these ids are copied, under new ids. */
  reuse?: { projectId: string; assetIds: string[] };
}

/** A saved project's library, read without opening or changing it. */
export interface ProjectLibrary {
  id: string;
  name: string;
  assets: AssetRecord[];
  fonts: ProjectDoc['fonts'];
  /** Pages, for importing their themes or layouts (never written back). */
  pages: ProjectDoc['pages'];
}

export async function readProjectLibrary(id: string): Promise<ProjectLibrary | undefined> {
  const cur = getDoc();
  if (id === cur.id) return { id, name: cur.name, assets: cur.assets, fonts: cur.fonts, pages: cur.pages };
  const p = await db.getProject(id);
  if (!p) return undefined;
  const d = sanitizeDoc(p.doc);
  return { id, name: d.name, assets: d.assets.filter((a) => a.status !== 'missing'), fonts: d.fonts, pages: d.pages };
}

/** The original file of an asset in any saved project (the open one's from memory). */
export async function assetBlob(id: string): Promise<Blob | undefined> {
  return images.blobs.get(id) ?? (await db.getBlob(id).catch(() => undefined));
}

/** Copy asset (and font) files under fresh ids, so deleting one project never removes another's files. */
async function copyLibrary(src: Pick<ProjectDoc, 'assets' | 'fonts'>, only?: Set<string>, startIndex = 0): Promise<{ assets: ProjectDoc['assets']; fonts: ProjectDoc['fonts']; blobs: Map<string, Blob> }> {
  const blobs = new Map<string, Blob>();
  const copy = async (oldId: string, prefix: string) => {
    const b = images.blobs.get(oldId) ?? (await db.getBlob(oldId).catch(() => undefined));
    const id = uid(prefix);
    if (b) {
      await db.putBlob(id, b);
      blobs.set(id, b);
    }
    return id;
  };
  const assets: ProjectDoc['assets'] = [];
  let index = startIndex;
  for (const a of src.assets) {
    if (only && !only.has(a.id)) continue;
    const b = await assetBlob(a.id);
    if (!b) continue; // the source file is gone: nothing to reuse
    const id = uid('as');
    await db.putBlob(id, b);
    blobs.set(id, b);
    assets.push({ ...a, id, status: 'pending', importIndex: index++ });
  }
  const fonts: ProjectDoc['fonts'] = [];
  for (const f of src.fonts) fonts.push({ ...f, id: await copy(f.id, 'fnt') });
  return { assets, fonts, blobs };
}

/** Create, open and save a new project (optionally starting from a template and/or the current assets). */
export async function createNewProject(o: NewProjectOptions) {
  if (!(await releaseOpenProject('create the new project'))) return;
  const src = useDoc.getState().open ? getDoc() : { assets: [], fonts: [] };
  const doc = createProject(await uniqueProjectName(o.name.trim() || 'Untitled showcase'));
  const bg = o.background ?? defaultBackground();
  const first = createPage('Page 1', Math.round(o.width), Math.round(o.height), bg);
  doc.pages = [first];
  doc.activePageId = first.id;
  // watermarks stay off for new projects unless Settings ▸ Watermark says otherwise
  doc.watermark = newProjectWatermark();
  let blobs: Map<string, Blob> | undefined;
  if (o.reuse && o.reuse.assetIds.length) {
    const from = await readProjectLibrary(o.reuse.projectId);
    if (from) {
      const lib = await copyLibrary(from, new Set(o.reuse.assetIds));
      doc.assets = lib.assets;
      doc.fonts = lib.fonts;
      blobs = lib.blobs;
    }
  } else if (o.copyAssets && src.assets.length) {
    const lib = await copyLibrary(src);
    doc.assets = lib.assets;
    doc.fonts = lib.fonts;
    blobs = lib.blobs;
  }
  await activate(doc, blobs, true);
  const t = o.templateId ? BUILTIN_TEMPLATES.find((x) => x.id === o.templateId) : undefined;
  if (t) {
    // templates lay out the (copied) library right away, or wait for the first import
    const page = { ...buildTemplatePage(t, libraryAssets(), packNameGuess(), o.templateOptions ?? DEFAULT_TEMPLATE_OPTIONS, bg), name: t.name };
    mutate((d) => ({ ...d, pages: [page], activePageId: page.id }));
    requestAnimationFrame(() => fitView(page.width, page.height));
  }
  await saveNow();
  guideAction('project');
  useUI.setState({ stage: doc.assets.length ? 'compose' : 'import', dialog: null });
}

/**
 * Add assets from another saved project to the open one. The files are copied under new ids, so the
 * source project is never changed and deleting either copy never affects the other.
 */
export async function importAssetsFromProject(projectId: string, assetIds: string[]): Promise<number> {
  const from = await readProjectLibrary(projectId);
  if (!from || projectId === getDoc().id) return 0;
  const start = getDoc().assets.reduce((m, a) => Math.max(m, a.importIndex), -1) + 1;
  const lib = await copyLibrary({ assets: from.assets, fonts: [] }, new Set(assetIds), start);
  if (!lib.assets.length) return 0;
  for (const [id, b] of lib.blobs) images.blobs.set(id, b);
  mutate((d) => ({ ...d, assets: [...d.assets, ...lib.assets] }));
  lib.assets.forEach((a, i) => void processAsset(a, -i * 0.001));
  return lib.assets.length;
}

/** Copy a stored project (with its own copies of the asset files). Returns the new id. */
export async function duplicateStoredProject(id: string): Promise<string | undefined> {
  await saveNow();
  const p = await db.getProject(id);
  if (!p) return undefined;
  const blobs = new Map<string, Blob>();
  for (const k of [...p.doc.assets.map((a) => a.id), ...p.doc.fonts.map((f) => f.id)]) {
    const b = images.blobs.get(k) ?? (await db.getBlob(k).catch(() => undefined));
    if (b) blobs.set(k, b);
  }
  const copy = remapIds(sanitizeDoc(p.doc), blobs);
  copy.name = await uniqueProjectName(`${p.doc.name} copy`);
  copy.createdAt = copy.updatedAt = Date.now();
  for (const [k, b] of blobs) await db.putBlob(k, b);
  await db.putProject({ id: copy.id, meta: { ...meta(copy), thumb: p.meta.thumb }, doc: copy });
  return copy.id;
}

// Desktop app: deleting moves projects (with their images) to data/trash, restorable from Settings → Storage.
// Browser (dev server): deleting is permanent, as before.
export const trashEnabled = usesFiles;
export const deleteOneNote = () =>
  trashEnabled ? 'It moves to the Trash with its images. You can restore it from Settings → Storage → Trash.' : 'The project and its stored images are removed from this computer. This cannot be undone.';
export const deleteManyNote = () =>
  trashEnabled
    ? 'They move to the Trash with their images. You can restore them from Settings → Storage → Trash. Exported images and .showcase files are not affected.'
    : 'Their stored images are removed from this computer too. Exported images and .showcase files are not affected. This cannot be undone.';
export const deleteLabel = () => (trashEnabled ? 'Move to Trash' : 'Delete');
export const deletedToast = (n: number) => (trashEnabled ? `Moved ${n} project${n === 1 ? '' : 's'} to the Trash` : `Deleted ${n} project${n === 1 ? '' : 's'}`);

/**
 * Delete stored projects. When the open project is among them it closes first (no save: it is being
 * deleted) and Home shows with no project open; no replacement project is made. Other projects,
 * including the open one when it is not deleted, are not touched.
 */
export async function deleteStoredProjects(ids: string[]) {
  const s = useDoc.getState();
  const closing = s.open && ids.includes(s.doc.id);
  // nothing may write these again, then let a save already in flight finish before deleting
  for (const id of ids) deleted.add(id);
  if (closing && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await settleSaves();
  if (closing) {
    saveFailing = false;
    unloadProject();
    await db.setKV(LAST_KEY, '').catch(() => undefined);
  }
  for (const id of ids) await db.deleteProject(id);
}

export async function renameStoredProject(id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  if (id === getDoc().id) {
    renameProject(clean);
    await saveNow();
    return;
  }
  const p = await db.getProject(id);
  if (!p) return;
  const doc = { ...p.doc, name: clean };
  await db.putProject({ id, meta: { ...p.meta, name: clean }, doc });
}

/**
 * Open a stored project. The open one is saved first (and stays open if that fails and the user keeps
 * it). Returns whether `id` is now the open project.
 */
export async function openStoredProject(id: string): Promise<boolean> {
  const s = useDoc.getState();
  if (s.open && s.doc.id === id) return true;
  if (!(await releaseOpenProject('switch projects'))) return false;
  await settleSaves();
  const p = await db.getProject(id).catch((e) => void toast(e instanceof Error ? e.message : String(e), 'error'));
  if (!p || deleted.has(id)) {
    toast('Project not found', 'error');
    return false;
  }
  noteRecovery(p);
  await activate(sanitizeDoc(p.doc));
  void db.setKV(LAST_KEY, id);
  return true;
}

export const deleteStoredProject = (id: string) => deleteStoredProjects([id]);

export const listProjects = () => db.listProjects();

export function renameProject(name: string) {
  if (!useDoc.getState().open) return;
  useDoc.setState((s) => ({ doc: { ...s.doc, name, updatedAt: Date.now() }, rev: s.rev + 1 }));
}

// ---------------------------------------------------------------------------
// .showcase files
// ---------------------------------------------------------------------------

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';

export async function buildProjectFile(): Promise<Blob> {
  await saveNow();
  const doc = getDoc();
  const files: Zippable = { 'project.json': [strToU8(JSON.stringify({ format: 'asset-forge-showcase', ...doc })), { level: 6 }] };
  for (const a of doc.assets) {
    const b = images.blobs.get(a.id) ?? (await db.getBlob(a.id).catch(() => undefined));
    if (b) files[`assets/${a.id}.${a.format === 'jpeg' ? 'jpg' : a.format}`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
  }
  for (const [id, b] of await fontBlobs()) files[`fonts/${id}`] = [new Uint8Array(await b.arrayBuffer()), { level: 6 }];
  const zipped = zipSync(files);
  return new Blob([zipped], { type: 'application/zip' });
}

/** Save to the current file (asks once), or always ask with saveAs. */
export async function saveProjectFile(saveAs = false) {
  const doc = getDoc();
  const name = safeName(doc.name) + '.showcase';
  let target = saveAs ? null : fileTarget;
  if (!target) {
    target = await chooseSaveTarget(name, 'application/zip', 'showcase', 'Showcase project');
    if (!target) return;
  }
  useUI.setState({ task: { label: 'Saving project', done: 0, total: 1 } });
  try {
    const blob = await buildProjectFile();
    const where = await writeTarget(target, blob, name);
    if (target.kind !== 'download') fileTarget = target;
    markFileSaved();
    toast(`Saved ${where}`, 'success');
  } catch (e) {
    toast('Save failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
  } finally {
    useUI.setState({ task: null });
  }
}

export async function exportProjectFile() {
  const blob = await buildProjectFile();
  download(blob, safeName(getDoc().name) + '.showcase');
}

/** Open a .showcase file. Assets get fresh ids so the file never clashes with stored projects. */
export async function openProjectFile(file: File | { name: string; data: ArrayBuffer }) {
  if (!(await releaseOpenProject('open the file'))) return;
  useUI.setState({ task: { label: 'Opening project', done: 0, total: 1 } });
  try {
    await settleSaves();
    const buf = new Uint8Array(file instanceof File ? await file.arrayBuffer() : file.data);
    let json: ProjectDoc;
    const blobs = new Map<string, Blob>();
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      const z = unzipProject(buf);
      if (!z['project.json']) throw new Error('Not a Showcase project (project.json missing)');
      json = JSON.parse(strFromU8(z['project.json']));
      for (const [path, data] of Object.entries(z)) {
        const m = /^(assets|fonts)\/([^.]+)/.exec(path);
        if (m) blobs.set(m[2], new Blob([data as Uint8Array<ArrayBuffer>]));
      }
    } else json = JSON.parse(new TextDecoder().decode(buf));
    const doc = remapIds(sanitizeDoc(json), blobs);
    for (const [id, b] of blobs) await db.putBlob(id, b);
    await activate(doc, blobs, true);
    await saveNow();
    toast(`Opened ${doc.name}`, 'success');
  } catch (e) {
    toast('Could not open project: ' + (e instanceof Error ? e.message : String(e)), 'error');
  } finally {
    useUI.setState({ task: null });
  }
}

export function remapIds(d: ProjectDoc, blobs: Map<string, Blob>): ProjectDoc {
  const map = new Map<string, string>();
  for (const a of d.assets) map.set(a.id, uid('as'));
  for (const f of d.fonts) map.set(f.id, uid('fnt'));
  for (const [old, nid] of map) {
    const b = blobs.get(old);
    if (b) {
      blobs.delete(old);
      blobs.set(nid, b);
    }
  }
  // a file the project doesn't use keeps the id it came with and could overwrite a stored file with that id
  const fresh = new Set(map.values());
  for (const id of blobs.keys()) if (!fresh.has(id)) blobs.delete(id);
  const m = (id?: string) => (id ? map.get(id) ?? id : id);
  return {
    ...d,
    id: uid('prj'),
    assets: d.assets.map((a) => ({ ...a, id: map.get(a.id)! })),
    fonts: d.fonts.map((f) => ({ ...f, id: map.get(f.id)! })),
    pages: d.pages.map((p) => ({
      ...p,
      background: { ...p.background, image: { ...p.background.image, assetId: m(p.background.image.assetId) } },
      objects: p.objects.map((o) => (o.type === 'image' ? { ...o, assetId: m(o.assetId)! } : o)),
      // live templates and catalogs rebuild from these lists: without new ids they would come back empty
      fromTemplate: p.fromTemplate ? { ...p.fromTemplate, assetIds: p.fromTemplate.assetIds.map((id) => m(id)!) } : p.fromTemplate,
      catalog: p.catalog ? { ...p.catalog, assetIds: p.catalog.assetIds.map((id) => m(id)!) } : p.catalog,
      layouts: p.layouts.map((l) => (l.assetSelection?.ids ? { ...l, assetSelection: { ...l.assetSelection, ids: l.assetSelection.ids.map((id) => m(id)!) } } : l)),
    })),
    assetSets: d.assetSets?.map((s) => ({ ...s, ids: s.ids.map((id) => m(id)!) })),
    watermark: d.watermark ? { ...d.watermark, layers: d.watermark.layers.map((l) => ({ ...l, assetId: m(l.assetId) })) } : d.watermark,
  };
}

export async function openProjectViaDialog(): Promise<boolean> {
  const n = native();
  if (n) {
    try {
      const res = await n.openFile([{ name: 'Showcase project', extensions: ['showcase', 'json'] }]);
      if (res) await openProjectFile({ name: res.name, data: res.data });
    } catch (e) {
      toast('Could not open the file: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
    return true;
  }
  return false;
}
