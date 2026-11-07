// File-based app storage (desktop app). Replaces the browser database with plain files in data/:
//
//   data/projects/<id>/project.json   the project document (+ list info), written atomically
//   data/projects/<id>/meta.json      list info only (name, size, thumbnail) — fast project list
//   data/projects/_files/<key>.<ext>  original imported images / fonts, written once at import
//   data/autosaves/<id>/<time>.json   earlier versions of each project (recovery), last 10, ≥ 3 min apart
//   data/settings/preferences.json    preferences
//   data/settings/state.json          small app state (last project, dismissed tips…)
//   data/settings/presets.json        saved styles, layouts, templates and export presets
//   data/trash/projects/<id>-<time>/  deleted projects WITH their files, kept until the trash is emptied
//   data/trash/files/<key>.<ext>      single deleted images/fonts (undo-able), kept 30 days
//
// Deleting only ever moves things into data/trash (a rename, no copies). Only "Delete permanently" /
// "Empty trash" (confirmed in the UI) and the 30-day limit for single files remove anything for good.
//
// Damaged files are never deleted: they are renamed to *.corrupt-<time>.json and the newest good copy is used.
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const log = require('./log.cjs');

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SNAPSHOT_EVERY_MS = 3 * 60 * 1000;
const SNAPSHOTS_KEPT = 10;
const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const TRASHED_FILE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const TRASH_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}-\d{4}-[0-9T-]+Z$/;
const idOfTrash = (trashId) => trashId.replace(/-\d{4}-[0-9T-]+Z$/, '');

const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif',
  'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff', 'font/woff2': 'woff2',
};
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
const EXTS = [...new Set([...Object.values(EXT), 'bin'])];

let L = null;

function checkId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid id');
  return id;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---------------------------------------------------------------------------
// Atomic writes, one at a time per file
// ---------------------------------------------------------------------------

const queues = new Map();

function queued(file, job) {
  const prev = queues.get(file) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  queues.set(file, next);
  void next.finally(() => queues.get(file) === next && queues.delete(file)).catch(() => undefined);
  return next;
}

async function renameRetry(from, to) {
  // Windows: antivirus / indexers briefly hold new files open
  for (let i = 0; ; i++) {
    try {
      return await fsp.rename(from, to);
    } catch (e) {
      if (i >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 30 * (i + 1)));
    }
  }
}

/** Write to a temp file, then swap it in, so a crash mid-write never leaves a half-written file. */
function writeAtomic(file, data) {
  return queued(file, async () => {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await fsp.writeFile(tmp, data);
    await renameRetry(tmp, file);
  });
}

async function readJson(file) {
  let text;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { missing: true };
    throw e;
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { corrupt: true };
  }
}

/** Keep a damaged file for inspection instead of deleting it. */
async function quarantine(file) {
  const to = file.replace(/\.json$/, '') + `.corrupt-${stamp()}.json`;
  try {
    await renameRetry(file, to);
    log.warn('store', 'damaged file kept as', path.basename(to));
  } catch (e) {
    log.error('store', 'could not set aside damaged file', path.basename(file), e);
  }
}

// ---------------------------------------------------------------------------
// Small JSON documents kept in memory (settings, state, presets)
// ---------------------------------------------------------------------------

function jsonDoc(fileOf, empty, valid = (v) => !!v && typeof v === 'object') {
  let cache = null;
  let cachedFile = null;
  return {
    async get() {
      const file = fileOf();
      if (cache && cachedFile === file) return cache;
      const r = await readJson(file);
      // unreadable, or readable but the wrong shape: keep it aside (never overwrite it) and start empty
      const bad = r.corrupt || (!r.missing && !valid(r.value));
      if (bad) await quarantine(file);
      cache = !bad && r.value !== undefined ? r.value : empty();
      cachedFile = file;
      return cache;
    },
    async set(v) {
      cache = v;
      cachedFile = fileOf();
      await writeAtomic(fileOf(), JSON.stringify(v, null, 1));
    },
  };
}

const prefsDoc = jsonDoc(() => path.join(L.settings, 'preferences.json'), () => null);
const stateDoc = jsonDoc(() => path.join(L.settings, 'state.json'), () => ({}));
const presetsDoc = jsonDoc(() => path.join(L.settings, 'presets.json'), () => [], Array.isArray);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projectDir = (id) => path.join(L.projects, checkId(id));
const projectFile = (id) => path.join(projectDir(id), 'project.json');

async function listProjects() {
  let names = [];
  try {
    names = await fsp.readdir(L.projects, { withFileTypes: true });
  } catch {
    return [];
  }
  const metas = [];
  for (const d of names) {
    if (!d.isDirectory() || !ID.test(d.name)) continue;
    const m = await readJson(path.join(L.projects, d.name, 'meta.json'));
    if (m.value?.id) {
      metas.push(m.value);
      continue;
    }
    // list info missing or damaged: rebuild it from the project file
    const p = await getProject(d.name).catch(() => undefined);
    if (p?.meta) {
      metas.push(p.meta);
      void writeAtomic(path.join(L.projects, d.name, 'meta.json'), JSON.stringify(p.meta)).catch(() => undefined);
    }
  }
  return metas.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

async function snapshots(id) {
  const dir = path.join(L.autosaves, checkId(id));
  try {
    return (await fsp.readdir(dir)).filter((n) => /^\d{4}-.*\.json$/.test(n)).sort().map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

async function getProject(id) {
  const file = projectFile(id);
  const r = await readJson(file);
  if (r.missing) return undefined;
  if (r.value && r.value.doc) return r.value;
  // damaged: keep it aside and fall back to the newest autosave that reads correctly
  await quarantine(file);
  for (const snap of (await snapshots(id)).reverse()) {
    const s = await readJson(snap);
    if (s.value?.doc) {
      await writeAtomic(file, JSON.stringify(s.value));
      log.warn('store', `project ${id} restored from autosave ${path.basename(snap)}`);
      return { ...s.value, recovered: path.basename(snap, '.json') };
    }
  }
  throw new Error('This project file is damaged and no autosave was found. The damaged file was kept in its project folder.');
}

const lastSnapshot = new Map();

async function snapshot(id) {
  const file = projectFile(id);
  const now = Date.now();
  if (now - (lastSnapshot.get(id) ?? 0) < SNAPSHOT_EVERY_MS) return;
  const list = await snapshots(id);
  const newest = list[list.length - 1];
  if (newest && now - (await fsp.stat(newest)).mtimeMs < SNAPSHOT_EVERY_MS) {
    lastSnapshot.set(id, now);
    return;
  }
  try {
    await fsp.mkdir(path.join(L.autosaves, id), { recursive: true });
    await fsp.copyFile(file, path.join(L.autosaves, id, `${stamp()}.json`));
    lastSnapshot.set(id, now);
    for (const old of (await snapshots(id)).slice(0, -SNAPSHOTS_KEPT)) await fsp.unlink(old).catch(() => undefined);
  } catch (e) {
    if (e.code !== 'ENOENT') log.warn('store', 'autosave snapshot failed', e.message);
  }
}

async function putProject(p) {
  if (!p || typeof p !== 'object' || !p.doc || !p.meta) throw new Error('Invalid project');
  const id = checkId(p.id);
  await snapshot(id);
  await writeAtomic(projectFile(id), JSON.stringify(p));
  await writeAtomic(path.join(projectDir(id), 'meta.json'), JSON.stringify(p.meta));
}

const fileKeys = (doc) => [...(doc?.assets ?? []).map((a) => a.id), ...(doc?.fonts ?? []).map((f) => f.id)].filter((k) => typeof k === 'string' && ID.test(k));

/** Files used by projects other than `except` (normally none: ids are unique per project, but never take a shared one). */
async function keysUsedElsewhere(except) {
  const used = new Set();
  for (const d of await fsp.readdir(L.projects, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory() || !ID.test(d.name) || d.name === except) continue;
    const r = await readJson(path.join(L.projects, d.name, 'project.json'));
    for (const k of fileKeys(r.value?.doc)) used.add(k);
  }
  return used;
}

/** Move a project and its files into the trash (one rename each: nothing is copied or erased). */
async function deleteProject(id) {
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) return null;
  const p = await getProject(id).catch(() => undefined);
  const trashId = `${id}-${stamp()}`;
  const dest = path.join(L.trashProjects, trashId);
  await fsp.mkdir(L.trashProjects, { recursive: true });
  await renameRetry(dir, dest);
  const elsewhere = await keysUsedElsewhere(id);
  const moved = [];
  await fsp.mkdir(path.join(dest, 'files'), { recursive: true });
  for (const k of fileKeys(p?.doc)) {
    if (elsewhere.has(k)) continue;
    const found = await findBlob(k, false);
    if (!found) continue;
    await renameRetry(found.file, path.join(dest, 'files', path.basename(found.file)));
    moved.push(k);
  }
  const info = { id, trashId, name: p?.meta?.name ?? p?.doc?.name ?? id, deletedAt: Date.now(), files: moved, thumb: p?.meta?.thumb, pages: p?.meta?.pages, assets: p?.meta?.assets };
  await writeAtomic(path.join(dest, 'trash.json'), JSON.stringify(info));
  log.info('store', `project ${id} moved to trash (${moved.length} files)`);
  return trashId;
}

function trashDir(trashId) {
  if (typeof trashId !== 'string' || !TRASH_ID.test(trashId)) throw new Error('Invalid trash item');
  return path.join(L.trashProjects, trashId);
}

async function listTrash() {
  const items = [];
  for (const d of await fsp.readdir(L.trashProjects, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory() || !TRASH_ID.test(d.name)) continue;
    const r = await readJson(path.join(L.trashProjects, d.name, 'trash.json'));
    // an entry without readable info still shows (and restores): it is described from the folder name
    const info = r.value ?? { id: idOfTrash(d.name), name: idOfTrash(d.name), deletedAt: (await fsp.stat(path.join(L.trashProjects, d.name))).mtimeMs, files: [] };
    items.push({ ...info, trashId: d.name });
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Put a trashed project back. If its id was taken meanwhile, it comes back under a new id. Returns the id. */
async function restoreTrash(trashId) {
  const src = trashDir(trashId);
  const r = await readJson(path.join(src, 'trash.json'));
  let id = checkId(r.value?.id ?? idOfTrash(trashId));
  if (fs.existsSync(projectDir(id))) {
    const p = await readJson(path.join(src, 'project.json'));
    if (!p.value?.doc) throw new Error('A project with this id already exists');
    const newId = checkId(`${id}r${Date.now().toString(36)}`);
    const copy = { ...p.value, id: newId, doc: { ...p.value.doc, id: newId }, meta: { ...p.value.meta, id: newId } };
    await writeAtomic(path.join(src, 'project.json'), JSON.stringify(copy));
    await writeAtomic(path.join(src, 'meta.json'), JSON.stringify(copy.meta));
    id = newId;
  }
  for (const n of await fsp.readdir(path.join(src, 'files')).catch(() => [])) {
    const to = path.join(L.files, n);
    if (!fs.existsSync(to)) await renameRetry(path.join(src, 'files', n), to);
  }
  await fsp.rm(path.join(src, 'files'), { recursive: true, force: true });
  await fsp.rm(path.join(src, 'trash.json'), { force: true });
  await renameRetry(src, projectDir(id));
  log.info('store', `project ${id} restored from trash`);
  return id;
}

/** Erase trashed projects for good (the UI asks first). `ids`: trash ids, or 'all'. */
async function purgeTrash(ids) {
  const list = ids === 'all' ? (await listTrash()).map((t) => t.trashId) : Array.isArray(ids) ? ids : [];
  for (const t of list) await fsp.rm(trashDir(t), { recursive: true, force: true });
  if (list.length) log.info('store', `${list.length} trashed project(s) deleted permanently`);
  return list.length;
}

// ---------------------------------------------------------------------------
// Original files (images, fonts)
// ---------------------------------------------------------------------------

function sniff(b) {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 4 && b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  const head = b.toString('latin1', 0, Math.min(b.length, 4));
  if (head === 'wOFF') return 'woff';
  if (head === 'wOF2') return 'woff2';
  if (head === 'OTTO') return 'otf';
  if (b.length >= 4 && b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) return 'ttf';
  if (/^\s*(<\?xml|<svg)/i.test(b.toString('utf8', 0, Math.min(b.length, 256)))) return 'svg';
  return 'bin';
}

async function findIn(dir, key) {
  for (const e of EXTS) {
    const f = path.join(dir, `${key}.${e}`);
    try {
      await fsp.access(f);
      return { file: f, ext: e };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Locate a stored file. One deleted earlier (e.g. an asset removal that was then undone) comes back from the trash. */
async function findBlob(key, fromTrash = true) {
  checkId(key);
  const found = await findIn(L.files, key);
  if (found || !fromTrash) return found;
  const trashed = await findIn(L.trashFiles, key);
  if (!trashed) return null;
  const back = path.join(L.files, path.basename(trashed.file));
  await renameRetry(trashed.file, back);
  return { file: back, ext: trashed.ext };
}

async function getBlob(key) {
  const found = await findBlob(key);
  if (!found) return undefined;
  const buf = await fsp.readFile(found.file);
  return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), type: TYPE[found.ext] ?? '' };
}

function toBuffer(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('Invalid file data');
}

async function putBlob(key, data, type) {
  checkId(key);
  const buf = toBuffer(data);
  const ext = EXT[type] ?? sniff(buf);
  const old = await findBlob(key);
  await writeAtomic(path.join(L.files, `${key}.${ext}`), buf);
  if (old && old.ext !== ext) await fsp.unlink(old.file).catch(() => undefined);
}

/** Removing a file moves it to data/trash/files (kept 30 days), so undo can still bring it back. */
async function deleteBlob(key) {
  const found = await findBlob(key, false);
  if (!found) return;
  await fsp.mkdir(L.trashFiles, { recursive: true });
  const to = path.join(L.trashFiles, path.basename(found.file));
  await renameRetry(found.file, to);
  const now = new Date();
  await fsp.utimes(to, now, now).catch(() => undefined); // the 30 days count from the deletion
}

// ---------------------------------------------------------------------------
// Presets and key/value state
// ---------------------------------------------------------------------------

// entries that can't be a preset (hand-edited or damaged file) are skipped, not shown
const listPresets = async () => (await presetsDoc.get()).filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.kind === 'string');

const PRESET_KINDS = new Set(['text', 'background', 'layout', 'export', 'template', 'theme', 'watermark']);
const MAX_PRESET_BYTES = 4 * 1024 * 1024;

async function putPreset(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid preset');
  checkId(p.id);
  if (!PRESET_KINDS.has(p.kind) || typeof p.name !== 'string' || p.name.length > 200) throw new Error('Invalid preset');
  if (JSON.stringify(p).length > MAX_PRESET_BYTES) throw new Error('This preset is too large to save');
  const list = (await presetsDoc.get()).filter((x) => x.id !== p.id);
  await presetsDoc.set([...list, p]);
}

async function deletePreset(id) {
  await presetsDoc.set((await presetsDoc.get()).filter((x) => x.id !== id));
}

const KEY = /^[A-Za-z0-9:_.-]{1,100}$/;

async function getKV(key) {
  if (typeof key !== 'string' || !KEY.test(key)) throw new Error('Invalid key');
  if (key === 'prefs') return (await prefsDoc.get()) ?? undefined;
  return (await stateDoc.get())[key];
}

async function setKV(key, value) {
  if (typeof key !== 'string' || !KEY.test(key)) throw new Error('Invalid key');
  if (key === 'prefs') return prefsDoc.set(value);
  await stateDoc.set({ ...(await stateDoc.get()), [key]: value });
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** Leftover temp files from an interrupted write, and autosaves older than 30 days. */
async function cleanup() {
  const now = Date.now();
  try {
    for (const d of await fsp.readdir(L.autosaves, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = path.join(L.autosaves, d.name);
      for (const n of await fsp.readdir(dir)) {
        const f = path.join(dir, n);
        if (now - (await fsp.stat(f)).mtimeMs > SNAPSHOT_MAX_AGE_MS) await fsp.unlink(f).catch(() => undefined);
      }
      await fsp.rmdir(dir).catch(() => undefined); // only succeeds when empty
    }
    for (const n of await fsp.readdir(L.trashFiles).catch(() => [])) {
      const f = path.join(L.trashFiles, n);
      if (now - (await fsp.stat(f)).mtimeMs > TRASHED_FILE_MAX_AGE_MS) await fsp.unlink(f).catch(() => undefined);
    }
    // this process's own temp files are saves in progress, not leftovers
    const stale = async (dir) => {
      for (const n of await fsp.readdir(dir).catch(() => [])) {
        const pid = /\.tmp-(\d+)$/.exec(n)?.[1];
        if (pid && Number(pid) !== process.pid) await fsp.unlink(path.join(dir, n)).catch(() => undefined);
      }
    };
    await stale(L.files);
    await stale(L.settings);
    for (const d of await fsp.readdir(L.projects, { withFileTypes: true })) if (d.isDirectory()) await stale(path.join(L.projects, d.name));
    await sweepOrphans();
  } catch (e) {
    log.warn('store', 'cleanup skipped', e.message);
  }
}

const ORPHAN_MIN_AGE_MS = 7 * 24 * 3600 * 1000;

/** Every quoted id-like string in the JSON files under `dir` (recursively). */
async function idsIn(dir, into) {
  for (const d of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await idsIn(p, into);
    else if (d.name.endsWith('.json')) {
      const text = await fsp.readFile(p, 'utf8').catch(() => '');
      for (const m of text.matchAll(/"([A-Za-z0-9][A-Za-z0-9_-]{0,127})"/g)) into.add(m[1]);
    }
  }
  return into;
}

/**
 * Stored images and fonts that nothing refers to any more — left behind when an import or a project
 * opening was interrupted before the first save. Anything named in a project, an autosave, a trashed
 * project, a conflict copy, the presets or the app state counts as used. Unused files at least a week
 * old move to the trash (kept 30 days, and brought back automatically if something asks for them);
 * nothing is erased here. Returns the number of files moved and their size.
 */
async function sweepOrphans(now = Date.now()) {
  const used = new Set();
  for (const dir of [L.projects, L.autosaves, L.trashProjects, L.settings]) await idsIn(dir, used);
  let files = 0,
    bytes = 0;
  for (const n of await fsp.readdir(L.files).catch(() => [])) {
    const m = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.([a-z0-9]+)$/.exec(n);
    if (!m || !EXTS.includes(m[2]) || used.has(m[1])) continue;
    const f = path.join(L.files, n);
    const st = await fsp.stat(f).catch(() => null);
    if (!st?.isFile() || now - st.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
    await fsp.mkdir(L.trashFiles, { recursive: true });
    const to = path.join(L.trashFiles, n);
    if (fs.existsSync(to)) continue;
    await renameRetry(f, to);
    const t = new Date(now);
    await fsp.utimes(to, t, t).catch(() => undefined); // the 30 days count from today
    files++;
    bytes += st.size;
  }
  if (files) log.info('store', `${files} unused stored file(s) moved to the trash (${Math.round(bytes / 1024)} KB)`);
  return { files, bytes };
}

/** Bytes used by projects, their files, settings, autosaves and the trash (the cache and logs are not counted). */
async function walkSize(dir, skip) {
  let n = 0;
  for (const d of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, d.name);
    if (p === skip) continue;
    n += d.isDirectory() ? await walkSize(p, skip) : (await fsp.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return n;
}

async function usage() {
  const d = await usageDetail();
  return d.projects + d.files + d.settings + d.autosaves + d.trash;
}

/** Bytes per part of the data folder, for Settings ▸ Storage. */
async function usageDetail() {
  return {
    projects: await walkSize(L.projects, L.files),
    files: await walkSize(L.files),
    autosaves: await walkSize(L.autosaves),
    trash: await walkSize(L.trash),
    settings: await walkSize(L.settings),
    cache: await walkSize(L.cache),
    logs: await walkSize(L.logs),
  };
}

function init(layout) {
  L = layout;
  void cleanup();
}

module.exports = {
  init,
  cleanup,
  sweepOrphans,
  usage,
  usageDetail,
  checkId,
  stamp,
  readJson,
  writeAtomic,
  findBlob,
  listProjects,
  getProject,
  putProject,
  deleteProject,
  listTrash,
  restoreTrash,
  purgeTrash,
  getBlob,
  putBlob,
  deleteBlob,
  listPresets,
  putPreset,
  deletePreset,
  getKV,
  setKV,
  presetsDoc,
  stateDoc,
  prefsDoc,
};
