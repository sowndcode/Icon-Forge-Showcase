// Transient UI state (not saved with the project, not undoable).

import { create } from 'zustand';
import type { TemplatePageOptions } from '../core/types';

export type Stage = 'home' | 'guide' | 'import' | 'compose' | 'arrange' | 'watermark' | 'review' | 'export';
export type Tool = 'select' | 'hand' | 'text' | 'rect' | 'ellipse' | 'line' | 'focal' | 'path';
export type LeftTab = 'assets' | 'backgrounds' | 'elements' | 'templates';
export type InspectorTab = 'design' | 'arrange' | 'export';
export type Dialog =
  | null
  | 'projects'
  | 'newProject'
  | 'shortcuts'
  | 'settings'
  | 'newPage'
  | 'catalog'
  | 'marketplace'
  | 'categoryShowcase'
  | 'replaceSet'
  | 'randomSelect'
  | 'export'
  | 'saveTemplate'
  | 'templatePreviews'
  | 'variations'
  | 'compare'
  | 'shareCode'
  | 'addFromProject'
  | 'assetPreview'
  | 'library'
  | 'applyPreview'
  | 'importLooks';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export interface ContextMenuItem {
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Shows a check column (menus with toggles). */
  checked?: boolean;
  onClick?: () => void;
  separator?: boolean;
}

import type { SnapGuideLine } from '../core/snap';
export type SnapGuide = SnapGuideLine;

interface UIState {
  stage: Stage;
  /** Where Export's Back button returns to. */
  exportReturn?: Stage;
  tool: Tool;
  selection: string[];
  /** Asset library selection (asset ids). */
  librarySel: string[];
  libraryAnchor: string | null;
  leftTab: LeftTab;
  inspectorTab: InspectorTab;
  /** Backgrounds tab: plain backgrounds or themes. */
  bgView: 'backgrounds' | 'themes';
  /** Pages picked with Ctrl / Shift in the page strip (for batch actions). */
  pageSel: string[];
  /** Base colour for the “From your icons” backgrounds and themes (null = icons' main colour). */
  matchColor: string | null;
  /** Which accent harmony the clean “From your icons” themes use (Shuffle). */
  matchSeed: number;
  /** Templates tab: format, look (theme), text style and icon size for new template pages. */
  templateUi: TemplatePageOptions;
  focusMode: boolean;
  editingTextId: string | null;
  /** Layout whose guides/handles are shown on the canvas. */
  activeLayoutId: string | null;
  dialog: Dialog;
  dialogArg: unknown;
  hoverId: string | null;
  snapGuides: SnapGuide[];
  toasts: Toast[];
  menu: { x: number; y: number; items: ContextMenuItem[] } | null;
  task: { label: string; done: number; total: number; cancel?: () => void } | null;
  spaceDown: boolean;
  booting: boolean;
  /** Shown on the start-up screen while something longer runs (moving earlier data). */
  bootNote: string | null;
  /** Watermark layer being edited in the Watermark workspace. */
  wmSel: string | null;
  /** Review and export previews show the watermark (Review's clean / watermarked toggle). */
  showWatermark: boolean;
  /** Lesson the Guide opens on (set by links into the guide). */
  guideLesson: string | null;
  setSelection: (ids: string[]) => void;
  set: (p: Partial<UIState>) => void;
}

export const useUI = create<UIState>((set) => ({
  stage: 'home',
  tool: 'select',
  selection: [],
  librarySel: [],
  libraryAnchor: null,
  leftTab: 'assets',
  inspectorTab: 'design',
  bgView: 'backgrounds',
  pageSel: [],
  matchColor: null,
  matchSeed: 0,
  templateUi: { size: '', themeId: 'auto', themeParts: 'all', text: 'keep', icons: 1 },
  focusMode: false,
  editingTextId: null,
  activeLayoutId: null,
  dialog: null,
  dialogArg: null,
  hoverId: null,
  snapGuides: [],
  toasts: [],
  menu: null,
  task: null,
  spaceDown: false,
  booting: true,
  bootNote: null,
  guideLesson: null,
  wmSel: null,
  showWatermark: true,
  setSelection: (ids) => set({ selection: ids }),
  set: (p) => set(p),
}));

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3200) {
  const id = ++toastId;
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }));
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function openDialog(dialog: Dialog, arg: unknown = null) {
  // export has one place: the Export workspace (the Export tab beside the canvas stays for quick changes)
  if (dialog === 'export') return openExport();
  useUI.setState({ dialog, dialogArg: arg });
}

/** Go to the Export workspace, remembering where to come back to. The open page stays selected. */
export function openExport() {
  const s = useUI.getState();
  useUI.setState({ dialog: null, ...(s.stage !== 'export' ? { exportReturn: s.stage === 'home' || s.stage === 'guide' ? 'compose' : s.stage } : {}) });
  setStage('export');
}

/** Leave the Export workspace for the workspace it was opened from. */
export function leaveExport() {
  setStage(useUI.getState().exportReturn ?? 'compose');
}

export function setStage(stage: Stage) {
  const tab = stage === 'arrange' ? 'arrange' : stage === 'compose' ? 'design' : useUI.getState().inspectorTab;
  useUI.setState({ stage, inspectorTab: tab });
}

// ---------------------------------------------------------------------------
// Viewport (zoom/pan) — separate store so wheel/pan don't re-render panels.
// ---------------------------------------------------------------------------

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  /** Size of the canvas element in CSS px. */
  vw: number;
  vh: number;
  /** True while the view is "fit canvas" — kept fitted when the editor resizes. */
  fitted: boolean;
}

export const useViewport = create<ViewportState>(() => ({ zoom: 0.5, panX: 40, panY: 40, vw: 800, vh: 600, fitted: true }));

export function fitView(pageW: number, pageH: number, margin = 48) {
  const { vw, vh } = useViewport.getState();
  const zoom = Math.max(0.02, Math.min((vw - margin * 2) / pageW, (vh - margin * 2) / pageH));
  useViewport.setState({ zoom, panX: (vw - pageW * zoom) / 2, panY: (vh - pageH * zoom) / 2, fitted: true });
}

export function zoomTo(z: number, cx?: number, cy?: number) {
  const s = useViewport.getState();
  const zoom = Math.max(0.02, Math.min(32, z));
  const px = cx ?? s.vw / 2,
    py = cy ?? s.vh / 2;
  // keep the page point under (px,py) fixed
  const wx = (px - s.panX) / s.zoom,
    wy = (py - s.panY) / s.zoom;
  useViewport.setState({ zoom, panX: px - wx * zoom, panY: py - wy * zoom, fitted: false });
}

export function zoomToRect(r: { x: number; y: number; w: number; h: number }, margin = 80) {
  const { vw, vh } = useViewport.getState();
  const zoom = Math.max(0.02, Math.min(8, (vw - margin * 2) / Math.max(1, r.w), (vh - margin * 2) / Math.max(1, r.h)));
  useViewport.setState({ zoom, panX: vw / 2 - (r.x + r.w / 2) * zoom, panY: vh / 2 - (r.y + r.h / 2) * zoom, fitted: false });
}
