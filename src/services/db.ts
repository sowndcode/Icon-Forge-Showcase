import type { ProjectDoc, ProjectMeta, StoredPreset } from '../core/types';
import type { NativeStore } from './native';

// App storage. In the desktop app everything is saved as files in <project>/data (electron/store.cjs);
// in a plain browser (dev server) it uses this IndexedDB layout instead (all local, nothing leaves the device):
//   projects: { id, meta, doc }       — JSON document, autosaved (debounced)
//   blobs:    key = assetId → Blob    — the ORIGINAL imported file, written once at import
//   presets:  StoredPreset            — global reusable styles/layouts/templates/export presets
//   kv:       misc (last project id, quick-start dismissed…)
// Decoded previews/thumbnails are never persisted; they are rebuilt from the blobs.

const DB_NAME = 'asset-forge-showcase';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('presets')) db.createObjectStore('presets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        let result: T;
        if (r) r.onsuccess = () => (result = r.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
      }),
  );
}

export interface StoredProject {
  id: string;
  meta: ProjectMeta;
  doc: ProjectDoc;
  /** Set when a damaged project file was replaced by its newest autosave (desktop app). */
  recovered?: string;
}

/** The browser database (dev server in a browser; data saved by earlier desktop versions). */
export const idb = {
  async listProjects(): Promise<ProjectMeta[]> {
    const all = await tx<StoredProject[]>('projects', 'readonly', (s) => s.getAll());
    return (all ?? []).map((p) => p.meta).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  allProjects: () => tx<StoredProject[]>('projects', 'readonly', (s) => s.getAll()),
  getProject: (id: string) => tx<StoredProject | undefined>('projects', 'readonly', (s) => s.get(id)),
  putProject: (p: StoredProject) => tx('projects', 'readwrite', (s) => s.put(p)),
  async deleteProject(id: string) {
    const p = await idb.getProject(id);
    if (p) await Promise.all([...p.doc.assets.map((a) => a.id), ...(p.doc.fonts ?? []).map((f) => f.id)].map((k) => idb.deleteBlob(k)));
    await tx('projects', 'readwrite', (s) => s.delete(id));
  },
  blobKeys: () => tx<IDBValidKey[]>('blobs', 'readonly', (s) => s.getAllKeys()),
  getBlob: (key: string) => tx<Blob | undefined>('blobs', 'readonly', (s) => s.get(key)),
  putBlob: (key: string, blob: Blob) => tx('blobs', 'readwrite', (s) => s.put(blob, key)),
  deleteBlob: (key: string) => tx('blobs', 'readwrite', (s) => s.delete(key)),
  listPresets: () => tx<StoredPreset[]>('presets', 'readonly', (s) => s.getAll()),
  putPreset: (p: StoredPreset) => tx('presets', 'readwrite', (s) => s.put(p)),
  deletePreset: (id: string) => tx('presets', 'readwrite', (s) => s.delete(id)),
  kvKeys: () => tx<IDBValidKey[]>('kv', 'readonly', (s) => s.getAllKeys()),
  getKV: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key)),
  setKV: (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key)),
  /** Close and delete the whole database (used only on the migrated copy inside data/cache). */
  async drop() {
    if (dbPromise) (await dbPromise.catch(() => null))?.close();
    dbPromise = null;
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
      r.onblocked = () => resolve();
    });
  },
};

/** Desktop app: plain files in <project>/data, through the main process (see electron/store.cjs). */
function fileStore(s: NativeStore) {
  return {
    listProjects: () => s.listProjects(),
    getProject: (id: string) => s.getProject(id),
    putProject: (p: StoredProject) => s.putProject(p),
    deleteProject: (id: string) => s.deleteProject(id),
    async getBlob(key: string): Promise<Blob | undefined> {
      const r = await s.getBlob(key);
      return r ? new Blob([r.data], { type: r.type }) : undefined;
    },
    putBlob: async (key: string, blob: Blob) => s.putBlob(key, await blob.arrayBuffer(), blob.type),
    deleteBlob: (key: string) => s.deleteBlob(key),
    listPresets: () => s.listPresets(),
    putPreset: (p: StoredPreset) => s.putPreset(p),
    deletePreset: (id: string) => s.deletePreset(id),
    getKV: <T>(key: string) => s.getKV(key) as Promise<T | undefined>,
    setKV: (key: string, value: unknown) => s.setKV(key, value),
  };
}

const nativeStore = typeof window !== 'undefined' ? window.showcaseNative?.store : undefined;

/** What the app uses to save and load (the same calls work on either backend). */
export interface AppStore {
  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<StoredProject | undefined>;
  putProject(p: StoredProject): Promise<unknown>;
  deleteProject(id: string): Promise<unknown>;
  getBlob(key: string): Promise<Blob | undefined>;
  putBlob(key: string, blob: Blob): Promise<unknown>;
  deleteBlob(key: string): Promise<unknown>;
  listPresets(): Promise<StoredPreset[]>;
  putPreset(p: StoredPreset): Promise<unknown>;
  deletePreset(id: string): Promise<unknown>;
  getKV<T>(key: string): Promise<T | undefined>;
  setKV(key: string, value: unknown): Promise<unknown>;
}

export const db: AppStore = nativeStore ? fileStore(nativeStore) : idb;
export const usesFiles = !!nativeStore;

export async function requestPersistentStorage() {
  if (usesFiles) return;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not critical */
  }
}
