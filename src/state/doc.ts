// Project document store + undo/redo.
//
// History snapshots hold only the undoable part of the document (pages + active page). Because
// every update is immutable, a snapshot is just a reference — unchanged pages/objects are shared.
// The asset library is NOT part of history (imports/analysis results must never be "undone").
//
// Continuous interactions (drag, slider) are one history step:
//   - pointer drags: beginGesture() → many mutate() → endGesture()
//   - sliders: commit(..., { key }) coalesces consecutive commits with the same key.

import { create } from 'zustand';
import { createProject } from '../core/defaults';
import type { AssetRecord, Page, ProjectDoc } from '../core/types';
import { useUI } from './ui';

interface Snapshot {
  pages: Page[];
  activePageId: string;
  /** The project watermark is undoable too (it is not part of any page). */
  watermark?: ProjectDoc['watermark'];
}

interface HistoryEntry {
  label: string;
  before: Snapshot;
  selection: string[];
  key?: string;
  time: number;
}

interface DocState {
  /**
   * The open project. While no project is open (`open` false) this is an inert placeholder: never
   * saved, never listed, never shown as a project; it only keeps components that read the current
   * page from crashing while Home is shown.
   */
  doc: ProjectDoc;
  /** Whether a project is open. Saving, the editor workspaces and project commands require it. */
  open: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Increments on every change (drives autosave). */
  rev: number;
  /** rev at the last explicit Save to file (unsaved-changes indicator). */
  fileRev: number;
}

/** Undo steps kept (Settings ▸ Performance). */
let MAX_HISTORY = 150;
export function setHistoryLimit(n: number) {
  MAX_HISTORY = Math.max(20, Math.min(1000, Math.round(n) || 150));
}
const COALESCE_MS = 1500;

/** The placeholder held while no project is open (empty id: nothing can save it). */
function closedDoc(): ProjectDoc {
  return { ...createProject(''), id: '' };
}

export const useDoc = create<DocState>(() => ({
  doc: closedDoc(),
  open: false,
  past: [],
  future: [],
  rev: 0,
  fileRev: 0,
}));

const snap = (d: ProjectDoc): Snapshot => ({ pages: d.pages, activePageId: d.activePageId, watermark: d.watermark });

let gesture: { entry: HistoryEntry; startRev: number } | null = null;

/** Undoable change. */
export function commit(label: string, fn: (d: ProjectDoc) => ProjectDoc, opts: { key?: string } = {}) {
  const s = useDoc.getState();
  const next = fn(s.doc);
  if (next === s.doc) return;
  const now = Date.now();
  const last = s.past[s.past.length - 1];
  if (opts.key && last && last.key === opts.key && now - last.time < COALESCE_MS && !gesture) {
    last.time = now;
    useDoc.setState({ doc: { ...next, updatedAt: now }, future: [], rev: s.rev + 1 });
    return;
  }
  const entry: HistoryEntry = { label, before: snap(s.doc), selection: useUI.getState().selection, key: opts.key, time: now };
  useDoc.setState({ doc: { ...next, updatedAt: now }, past: [...s.past.slice(-MAX_HISTORY + 1), entry], future: [], rev: s.rev + 1 });
}

/** Non-undoable change (asset analysis results, transient drag updates inside a gesture). */
export function mutate(fn: (d: ProjectDoc) => ProjectDoc) {
  const s = useDoc.getState();
  const next = fn(s.doc);
  if (next === s.doc) return;
  useDoc.setState({ doc: { ...next, updatedAt: Date.now() }, rev: s.rev + 1 });
}

export function beginGesture(label: string) {
  const s = useDoc.getState();
  gesture = { entry: { label, before: snap(s.doc), selection: useUI.getState().selection, time: Date.now() }, startRev: s.rev };
}

export function endGesture() {
  if (!gesture) return;
  const s = useDoc.getState();
  if (s.rev !== gesture.startRev) useDoc.setState({ past: [...s.past.slice(-MAX_HISTORY + 1), gesture.entry], future: [] });
  gesture = null;
}

export function cancelGesture() {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  const s = useDoc.getState();
  useDoc.setState({ doc: { ...s.doc, pages: g.entry.before.pages, activePageId: g.entry.before.activePageId, watermark: g.entry.before.watermark }, rev: s.rev + 1 });
}

export function inGesture() {
  return !!gesture;
}

function restore(entry: HistoryEntry, from: ProjectDoc): ProjectDoc {
  // keep pages that reference the current asset list; assets are not part of history
  return { ...from, pages: entry.before.pages, activePageId: entry.before.activePageId, watermark: entry.before.watermark, updatedAt: Date.now() };
}

export function undo() {
  endGesture();
  const s = useDoc.getState();
  const e = s.past[s.past.length - 1];
  if (!e) return;
  const redo: HistoryEntry = { ...e, before: snap(s.doc), selection: useUI.getState().selection };
  useDoc.setState({ doc: restore(e, s.doc), past: s.past.slice(0, -1), future: [...s.future, redo], rev: s.rev + 1 });
  useUI.getState().setSelection(e.selection.filter((id) => activePageOf(useDoc.getState().doc).objects.some((o) => o.id === id)));
}

export function redo() {
  const s = useDoc.getState();
  const e = s.future[s.future.length - 1];
  if (!e) return;
  const back: HistoryEntry = { ...e, before: snap(s.doc), selection: useUI.getState().selection };
  useDoc.setState({ doc: restore(e, s.doc), future: s.future.slice(0, -1), past: [...s.past, back], rev: s.rev + 1 });
  const page = activePageOf(useDoc.getState().doc);
  useUI.getState().setSelection(useUI.getState().selection.filter((id) => page.objects.some((o) => o.id === id)));
}

export const undoLabel = () => useDoc.getState().past.at(-1)?.label;
export const redoLabel = () => useDoc.getState().future.at(-1)?.label;

export function loadDoc(doc: ProjectDoc, opts: { clean?: boolean } = {}) {
  const s = useDoc.getState();
  gesture = null;
  // a new document never inherits the undo history of the previous one
  useDoc.setState({ doc, open: true, past: [], future: [], rev: s.rev + 1, fileRev: opts.clean ? s.rev + 1 : -1 });
}

/** No project open: the placeholder, no history. The caller has saved what needed saving. */
export function unloadDoc() {
  const s = useDoc.getState();
  gesture = null;
  useDoc.setState({ doc: closedDoc(), open: false, past: [], future: [], rev: s.rev + 1, fileRev: s.rev + 1 });
}

export const isProjectOpen = () => useDoc.getState().open;

export function markFileSaved() {
  useDoc.setState((s) => ({ fileRev: s.rev }));
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function activePageOf(d: ProjectDoc): Page {
  return d.pages.find((p) => p.id === d.activePageId) ?? d.pages[0];
}

export const getDoc = () => useDoc.getState().doc;
export const getPage = () => activePageOf(useDoc.getState().doc);

let assetIndex: { list: AssetRecord[]; map: Map<string, AssetRecord> } | null = null;
/** O(1) asset lookup, rebuilt only when the asset array identity changes. */
export function getAsset(id: string): AssetRecord | undefined {
  const list = useDoc.getState().doc.assets;
  if (!assetIndex || assetIndex.list !== list) assetIndex = { list, map: new Map(list.map((a) => [a.id, a])) };
  return assetIndex.map.get(id);
}

/** Replace the active page via a function (helper for actions). */
export function withPage(d: ProjectDoc, fn: (p: Page) => Page, pageId = d.activePageId): ProjectDoc {
  let changed = false;
  const pages = d.pages.map((p) => {
    if (p.id !== pageId) return p;
    const n = fn(p);
    if (n !== p) changed = true;
    return n;
  });
  return changed ? { ...d, pages } : d;
}

export function usePage(): Page {
  return useDoc((s) => activePageOf(s.doc));
}
