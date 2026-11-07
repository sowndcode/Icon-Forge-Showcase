// Asset library: import (files/folders), background analysis, categories, deletion.
// Imported files stay on this device: originals go to IndexedDB, decoding runs in local workers.

import { ALPHA_VERSION } from '../core/alpha';
import { uid } from '../core/ids';
import type { AssetKind, AssetRecord, ProjectDoc } from '../core/types';
import { images, PREVIEW_MAX, previewMaxFor, THUMB_MAX } from '../render/images';
import { db, usesFiles } from '../services/db';
import { categoryFromDir, extOf, formatOf, isImage, type FileEntry } from '../services/formats';
import { analysisPool } from '../services/workerPool';
import { importFonts } from '../services/fonts';
import { commit, getDoc, mutate, useDoc } from './doc';
import { toast, useUI } from './ui';
import { askChoice, askConfirm } from '../ui/components/ask';

const MAX_FILE = 256 * 1024 * 1024;

// Batched record updates from the workers (one store update per frame-ish, not per asset)
const pendingUpdates = new Map<string, Partial<AssetRecord>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function queueUpdate(id: string, patch: Partial<AssetRecord>) {
  pendingUpdates.set(id, { ...pendingUpdates.get(id), ...patch });
  if (!flushTimer) flushTimer = setTimeout(flushUpdates, 120);
}
function flushUpdates() {
  flushTimer = null;
  if (!pendingUpdates.size) return;
  const ups = new Map(pendingUpdates);
  pendingUpdates.clear();
  mutate((d) => ({ ...d, assets: d.assets.map((a) => (ups.has(a.id) ? { ...a, ...ups.get(a.id) } : a)) }));
}

let taskTotal = 0;
let taskDone = 0;
function progress(addTotal = 0, addDone = 0, label = 'Analyzing assets') {
  taskTotal += addTotal;
  taskDone += addDone;
  if (taskDone >= taskTotal) {
    taskTotal = taskDone = 0;
    useUI.setState({ task: null });
  } else useUI.setState({ task: { label, done: taskDone, total: taskTotal } });
}

let iconCountCache = { doc: null as unknown, n: 0 };
/** Icons in the open project (cached per document state: thousands of assets are processed at once). */
function iconCount(): number {
  const d = useDoc.getState().doc;
  if (iconCountCache.doc !== d.assets) iconCountCache = { doc: d.assets, n: d.assets.reduce((n, x) => n + (x.kind === 'asset' ? 1 : 0), 0) };
  return iconCountCache.n;
}

/** Decode + analyse one asset in a worker (alpha analysis only when not cached). */
export function processAsset(a: AssetRecord, priority = 0): Promise<void> {
  const blob = images.blobs.get(a.id);
  if (!blob) {
    queueUpdate(a.id, { status: 'missing', error: 'Source file not found in this project' });
    return Promise.resolve();
  }
  progress(1);
  // icons in big packs get smaller previews (memory); backgrounds, logos and elements keep full previews
  const previewMax = a.kind === 'asset' ? previewMaxFor(iconCount()) : PREVIEW_MAX;
  return analysisPool.run({ id: a.id, blob, analyze: !a.alpha || (a.alpha.v ?? 1) < ALPHA_VERSION, previewMax, thumbMax: THUMB_MAX, threshold: 8 }, priority).then((r) => {
    progress(0, 1);
    if (!r.ok) {
      queueUpdate(a.id, { status: 'error', error: r.error ?? 'Could not decode image' });
      return;
    }
    if (r.preview) images.setPreview(a.id, r.preview);
    if (r.thumb) images.setThumb(a.id, r.thumb);
    const patch: Partial<AssetRecord> = { status: 'ready', error: undefined, width: r.width!, height: r.height! };
    if (r.alpha) {
      patch.alpha = r.alpha;
      if (r.alpha.empty) patch.error = 'Fully transparent image';
    }
    queueUpdate(a.id, patch);
  });
}

export interface ImportResult {
  ids: string[];
  skipped: number;
  relinked: number;
}

/** SHA-256 of a file's bytes (hex). Identical files give the same hash whatever their name. */
export async function contentHash(blob: Blob): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sort incoming files into new files and exact copies (same bytes as an asset already in the project,
 * or as an earlier file in the same import). Only existing assets with a matching size are hashed.
 * Files that merely share a name with an existing asset are not copies.
 */
export async function findDuplicates(files: { file: File }[], existing: AssetRecord[], blobOf: (id: string) => Blob | undefined): Promise<{ hashes: string[]; copies: Set<number>; inProject: number; sameName: number }> {
  const sizes = new Set(files.map((f) => f.file.size));
  const known = new Map<string, AssetRecord>();
  for (const a of existing) {
    if (a.status === 'missing' || !sizes.has(a.bytes)) continue;
    let h = a.hash;
    if (!h) {
      const b = blobOf(a.id);
      if (!b) continue;
      h = await contentHash(b).catch(() => undefined);
    }
    if (h) known.set(h, a);
  }
  const names = new Set(existing.map((a) => a.name.toLowerCase()));
  const hashes: string[] = [];
  const copies = new Set<number>();
  const seen = new Set<string>();
  let sameName = 0,
    inProject = 0;
  for (let i = 0; i < files.length; i++) {
    const h = await contentHash(files[i].file).catch(() => '');
    hashes.push(h);
    if (h && known.has(h)) inProject++;
    if (h && (known.has(h) || seen.has(h))) copies.add(i);
    else if (names.has(files[i].file.name.toLowerCase())) sameName++;
    if (h) seen.add(h);
  }
  return { hashes, copies, inProject, sameName };
}

export async function importFiles(entries: FileEntry[], kind: AssetKind = 'asset'): Promise<ImportResult> {
  if (useUI.getState().stage === 'home') useUI.setState({ stage: 'import' });
  const imgs = entries.filter((e) => isImage(e.file));
  const skippedType = entries.length - imgs.length;
  const fonts = entries.filter((e) => ['ttf', 'otf', 'woff', 'woff2'].includes(extOf(e.file.name)));
  if (fonts.length) {
    await importFonts(fonts.map((f) => f.file));
  }
  if (!imgs.length) {
    if (skippedType - fonts.length > 0) toast(`No supported images found (${skippedType} file${skippedType > 1 ? 's' : ''} skipped)`, 'warning');
    return { ids: [], skipped: skippedType, relinked: 0 };
  }
  const doc = getDoc();
  const roots = new Set(imgs.map((e) => e.dir.split('/')[0]).filter(Boolean));
  // exact copies (same bytes) of icons already here, or repeated inside this import
  const dupes = await findDuplicates(imgs, doc.assets.filter((a) => a.kind === kind), (id) => images.blobs.get(id));
  let keepCopies = false;
  if (dupes.copies.size) {
    const n = dupes.copies.size,
      repeats = n - dupes.inProject;
    const answer = await askChoice({
      title: `${n} duplicate file${n === 1 ? '' : 's'}`,
      message: [
        dupes.inProject ? `${dupes.inProject} ha${dupes.inProject === 1 ? 's' : 've'} exactly the same image data as an asset already in this project.` : '',
        repeats ? `${repeats} ${repeats === 1 ? 'is a copy' : 'are copies'} of another file in this import.` : '',
        'Files that only share a name are not duplicates and are imported normally. Nothing is deleted from your disk.',
      ].filter(Boolean).join(' '),
      choices: [
        { value: 'keep', label: 'Import them too' },
        { value: 'skip', label: 'Skip copies', primary: true },
      ],
    });
    if (answer === null) return { ids: [], skipped: imgs.length, relinked: 0 };
    keepCopies = answer === 'keep';
  }
  const missing = new Map(doc.assets.filter((a) => a.status === 'missing').map((a) => [a.name.toLowerCase(), a]));
  let importIndex = doc.assets.reduce((m, a) => Math.max(m, a.importIndex), -1) + 1;
  const created: AssetRecord[] = [];
  const relinked: AssetRecord[] = [];
  let dup = 0,
    tooBig = 0;
  for (let fi = 0; fi < imgs.length; fi++) {
    const { file, dir } = imgs[fi];
    if (file.size > MAX_FILE) {
      tooBig++;
      continue;
    }
    if (file.size === 0) {
      created.push(record(file, dir, kind, importIndex++, roots.size, 'error', 'Empty file (0 bytes)'));
      continue;
    }
    const miss = missing.get(file.name.toLowerCase());
    if (miss) {
      images.blobs.set(miss.id, file);
      relinked.push(miss);
      missing.delete(file.name.toLowerCase());
      continue;
    }
    if (dupes.copies.has(fi) && !keepCopies) {
      dup++;
      continue;
    }
    const rec = { ...record(file, dir, kind, importIndex++, roots.size, 'pending'), hash: dupes.hashes[fi] || undefined };
    images.blobs.set(rec.id, file);
    created.push(rec);
  }
  if (created.length || relinked.length) {
    mutate((d: ProjectDoc) => ({
      ...d,
      assets: [...d.assets.map((a) => (relinked.some((r) => r.id === a.id) ? { ...a, status: 'pending' as const, error: undefined } : a)), ...created],
    }));
  }
  // persist originals (once), then analyse
  for (const a of [...created, ...relinked]) {
    const blob = images.blobs.get(a.id);
    if (blob) db.putBlob(a.id, blob).catch(() => toast('Could not store a file locally — storage may be full', 'error'));
  }
  const toProcess = [...created.filter((c) => c.status === 'pending'), ...relinked];
  toProcess.forEach((a, i) => void processAsset(a, -i * 0.001));
  const parts = [`Imported ${created.length} ${kind === 'background' ? 'background' : kind === 'element' ? 'element' : kind === 'watermark' ? 'logo' : 'asset'}${created.length === 1 ? '' : 's'}`];
  if (relinked.length) parts.push(`relinked ${relinked.length} missing`);
  if (dup) parts.push(`${dup} exact cop${dup === 1 ? 'y' : 'ies'} skipped`);
  if (dupes.sameName) parts.push(`${dupes.sameName} share a name with an existing file (both kept)`);
  if (tooBig) parts.push(`${tooBig} too large`);
  if (skippedType - fonts.length > 0) {
    const odd = entries.filter((e) => !isImage(e.file) && !['ttf', 'otf', 'woff', 'woff2'].includes(extOf(e.file.name)));
    parts.push(`${odd.length} not an image (${odd.slice(0, 3).map((e) => e.file.name).join(', ')}${odd.length > 3 ? '…' : ''})`);
  }
  toast(parts.join(' · '), created.length || relinked.length ? 'success' : 'warning', parts.length > 1 ? 7000 : 3200);
  return { ids: created.map((c) => c.id), skipped: dup + tooBig + skippedType, relinked: relinked.length };
}

function record(file: File, dir: string, kind: AssetKind, importIndex: number, rootCount: number, status: AssetRecord['status'], error?: string): AssetRecord {
  return {
    id: uid('as'),
    name: file.name,
    format: formatOf(file),
    kind,
    folder: dir,
    category: categoryFromDir(dir, rootCount),
    width: 0,
    height: 0,
    bytes: file.size,
    importIndex,
    addedAt: Date.now(),
    status,
    error,
  };
}

/** After opening a project: load blobs from storage and rebuild previews (page assets first). */
export async function hydrateAssets(doc: ProjectDoc, blobs?: Map<string, Blob>) {
  const used = new Set<string>();
  const active = doc.pages.find((p) => p.id === doc.activePageId);
  for (const o of active?.objects ?? []) if (o.type === 'image') used.add(o.assetId);
  if (active?.background.image.assetId) used.add(active.background.image.assetId);
  const missing: string[] = [];
  await Promise.all(
    doc.assets.map(async (a) => {
      const b = blobs?.get(a.id) ?? (await db.getBlob(a.id).catch(() => undefined));
      if (b) images.blobs.set(a.id, b);
      else missing.push(a.id);
    }),
  );
  if (missing.length) {
    const ms = new Set(missing);
    mutate((d) => ({ ...d, assets: d.assets.map((a) => (ms.has(a.id) ? { ...a, status: 'missing' as const, error: 'Source file missing — re-import the file to relink it' } : a)) }));
    toast(`${missing.length} asset file${missing.length > 1 ? 's are' : ' is'} missing. Import them again to relink.`, 'warning', 6000);
  }
  for (const a of useDoc.getState().doc.assets) if (!missing.includes(a.id)) void processAsset(a, used.has(a.id) ? 10 : 0);
}

export function setAssetCategory(ids: string[], category: string) {
  const set = new Set(ids);
  commit('Set category', (d) => ({ ...d, assets: d.assets.map((a) => (set.has(a.id) ? { ...a, category } : a)) }));
}

export function setAssetKind(ids: string[], kind: AssetKind) {
  const set = new Set(ids);
  mutate((d) => ({ ...d, assets: d.assets.map((a) => (set.has(a.id) ? { ...a, kind } : a)) }));
}

export function assetUsage(doc: ProjectDoc, ids: Set<string>): number {
  let n = 0;
  for (const p of doc.pages) {
    for (const o of p.objects) if (o.type === 'image' && ids.has(o.assetId)) n++;
    if (p.background.image.assetId && ids.has(p.background.image.assetId)) n++;
  }
  return n;
}

/** Delete source assets (warns when they are used on pages; their instances are removed too). */
export async function deleteAssets(ids: string[], confirmFn: (title: string, msg: string) => boolean | Promise<boolean> = (title, message) => askConfirm({ title, message, danger: true })) {
  if (!ids.length) return;
  const set = new Set(ids);
  const doc = getDoc();
  const used = assetUsage(doc, set);
  const title = `Delete ${ids.length} asset${ids.length > 1 ? 's' : ''} from the library?`;
  const msg = used ? `They are used ${used} time${used > 1 ? 's' : ''} on your pages — those copies are removed too. You can undo with Ctrl+Z.` : 'You can undo with Ctrl+Z.';
  if (!(await confirmFn(title, msg))) return;
  commit('Delete assets', (d) => ({
    ...d,
    assets: d.assets.filter((a) => !set.has(a.id)),
    pages: d.pages.map((p) => {
      const removed = new Set(p.objects.filter((o) => o.type === 'image' && set.has(o.assetId)).map((o) => o.id));
      if (!removed.size && !(p.background.image.assetId && set.has(p.background.image.assetId))) return p;
      return {
        ...p,
        objects: p.objects.filter((o) => !removed.has(o.id)),
        layouts: p.layouts.map((l) => ({ ...l, objectIds: l.objectIds.filter((id) => !removed.has(id)) })).filter((l) => l.objectIds.length),
        background: p.background.image.assetId && set.has(p.background.image.assetId) ? { ...p.background, image: { ...p.background.image, assetId: undefined } } : p.background,
      };
    }),
  }));
  // The decoded images stay in memory so Ctrl+Z brings the assets straight back. Desktop app: the original
  // file moves to data/trash/files (kept 30 days, restored automatically if an undone asset needs it).
  // Browser: the file stays in the database, since undo would otherwise leave the asset without its image.
  if (usesFiles) for (const id of ids) void db.deleteBlob(id).catch(() => undefined);
  useUI.setState((s) => ({ librarySel: s.librarySel.filter((x) => !set.has(x)), selection: s.selection.filter((x) => getDoc().pages.some((p) => p.objects.some((o) => o.id === x))) }));
}

export function categoriesOf(assets: AssetRecord[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of assets) m.set(a.category, (m.get(a.category) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
