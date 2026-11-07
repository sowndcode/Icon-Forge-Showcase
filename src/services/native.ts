// File output, three tiers:
//   1. Desktop app (Electron): native dialogs + direct writes through the preload bridge
//   2. Chromium browser: File System Access API (save picker / directory picker)
//   3. Fallback: regular download
// Nothing is ever sent over the network.

import type { StoredPreset } from '../core/types';
import type { StoredProject } from './db';

/** App storage in <project>/data (electron/store.cjs). */
export interface NativeStore {
  listProjects(): Promise<StoredProject['meta'][]>;
  getProject(id: string): Promise<StoredProject | undefined>;
  putProject(p: StoredProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getBlob(key: string): Promise<{ data: ArrayBuffer; type: string } | undefined>;
  putBlob(key: string, data: ArrayBuffer, type: string): Promise<void>;
  deleteBlob(key: string): Promise<void>;
  listPresets(): Promise<StoredPreset[]>;
  putPreset(p: StoredPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  getKV(key: string): Promise<unknown>;
  setKV(key: string, value: unknown): Promise<void>;
  /** Bytes used in data/ by projects, files, settings, autosaves and the trash. */
  usage(): Promise<number>;
  /** Older desktop builds lack it. */
  usageDetail?(): Promise<Record<'projects' | 'files' | 'autosaves' | 'trash' | 'settings' | 'cache' | 'logs', number>>;
  listTrash(): Promise<TrashedProject[]>;
  /** Returns the id the project is back under. */
  restoreTrash(trashId: string): Promise<string>;
  /** Deletes for good; returns how many. */
  purgeTrash(ids: string[] | 'all'): Promise<number>;
}

/** A deleted project waiting in data/trash (it keeps its own images until the trash is emptied). */
export interface TrashedProject {
  trashId: string;
  id: string;
  name: string;
  deletedAt: number;
  files: string[];
  thumb?: string;
  pages?: number;
  assets?: number;
}

type Imported = 'written' | 'same' | 'conflict' | 'exists';

/** One-time import of data saved by earlier versions (electron/migrate.cjs). */
export interface NativeMigrate {
  status(): Promise<{ pending: boolean; from: string | null }>;
  project(p: StoredProject): Promise<Imported>;
  blob(key: string, data: ArrayBuffer, type: string): Promise<Imported>;
  preset(p: StoredPreset): Promise<Imported>;
  kv(key: string, value: unknown): Promise<Imported>;
  finish(summary: unknown): Promise<{ ok: boolean; problems: string[]; projects: number; reportPath: string }>;
}

interface NativeBridge {
  chooseSavePath(defaultName: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>;
  writeFile(path: string, data: ArrayBuffer): Promise<string>;
  pickFolder(): Promise<string | null>;
  /** Returns the file name actually written (differs from `rel` when keepExisting renamed it). */
  writeInFolder(root: string, rel: string, data: ArrayBuffer, keepExisting?: boolean): Promise<string>;
  openFile(filters: { name: string; extensions: string[] }[]): Promise<{ path: string; name: string; data: ArrayBuffer } | null>;
  openFolder(dir: string): Promise<string | null>;
  /** Interface zoom (desktop app only). */
  setZoom?(factor: number): void;
  appInfo?(): Promise<{ version: string; electron: string; chrome: string; dataPath: string; exportsPath?: string }>;
  openDataFolder?(): Promise<string | null>;
  /** Native title bar and dialogs follow the app theme (desktop app only). */
  setTheme?(theme: 'dark' | 'light' | 'system'): Promise<void>;
  log?(level: 'info' | 'warn' | 'error', message: string): Promise<void>;
  store?: NativeStore;
  migrate?: NativeMigrate;
}

declare global {
  interface Window {
    showcaseNative?: NativeBridge;
    showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
    showDirectoryPicker?: (o?: unknown) => Promise<FileSystemDirectoryHandle>;
  }
}

export const native = () => window.showcaseNative;
export const isDesktop = () => !!window.showcaseNative;

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type SaveTarget = { kind: 'native'; path: string } | { kind: 'handle'; handle: FileSystemFileHandle } | { kind: 'download' };

/** Ask where to save (once). Returns null if the user cancelled. */
export async function chooseSaveTarget(name: string, mime: string, ext: string, label: string): Promise<SaveTarget | null> {
  const n = native();
  if (n) {
    const path = await n.chooseSavePath(name, [{ name: label, extensions: [ext] }]);
    return path ? { kind: 'native', path } : null;
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: label, accept: { [mime]: ['.' + ext] } }] });
      return { kind: 'handle', handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
    }
  }
  return { kind: 'download' };
}

export async function writeTarget(t: SaveTarget, blob: Blob, name: string): Promise<string> {
  if (t.kind === 'native') return native()!.writeFile(t.path, await blob.arrayBuffer());
  if (t.kind === 'handle') {
    const w = await t.handle.createWritable();
    await w.write(blob);
    await w.close();
    return t.handle.name;
  }
  download(blob, name);
  return name;
}

export type FolderTarget = { kind: 'native'; root: string } | { kind: 'dir'; handle: FileSystemDirectoryHandle } | { kind: 'download' };

export async function chooseFolder(): Promise<FolderTarget | null> {
  const n = native();
  if (n) {
    const root = await n.pickFolder();
    return root ? { kind: 'native', root } : null;
  }
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      return { kind: 'dir', handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
    }
  }
  return { kind: 'download' };
}

/** "name.png" → "name_2.png" */
export function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}_${n}${name.slice(dot)}` : `${name}_${n}`;
}

async function existsIn(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write one file into the chosen folder. With `keepExisting`, a file that is already there is never
 * replaced: the new one gets a number instead (name_2.png). Returns the name that was written.
 */
export async function writeInFolder(t: FolderTarget, name: string, blob: Blob, keepExisting = true): Promise<string> {
  if (t.kind === 'native') return native()!.writeInFolder(t.root, name, await blob.arrayBuffer(), keepExisting);
  if (t.kind === 'dir') {
    let final = name;
    if (keepExisting) for (let i = 2; (await existsIn(t.handle, final)) && i < 10000; i++) final = numberedName(name, i);
    const fh = await t.handle.getFileHandle(final, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return final;
  }
  download(blob, name); // the browser numbers duplicate downloads itself
  await new Promise((r) => setTimeout(r, 250)); // browsers throttle rapid downloads
  return name;
}

export function revealFolder(t: FolderTarget) {
  if (t.kind === 'native') void native()!.openFolder(t.root);
}
