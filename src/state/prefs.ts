import { create } from 'zustand';
import { DEFAULT_EXPORT } from '../core/defaults';
import type { SnapSettings } from '../core/snap';
import type { ExportSettings } from '../core/types';
import { db } from '../services/db';

// Global preferences (small per-device conveniences, not project data). Saved to localStorage and
// mirrored into the app database, so they survive even where localStorage does not persist.

export interface Overlays {
  pixelGrid: boolean;
  compGrid: boolean;
  compDivs: number;
  thirds: boolean;
  center: boolean;
  safe: boolean;
  perspective: boolean;
  rulers: boolean;
  focal: boolean;
  bounds: boolean;
}

export interface Prefs {
  theme: 'dark' | 'light' | 'system';
  leftWidth: number;
  rightWidth: number;
  layersHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Navigation sidebar: full width, icon rail, or automatic (rail while editing on narrower windows). */
  navMode: 'auto' | 'open' | 'rail';
  thumbSize: number;
  librarySort: 'import' | 'name' | 'size' | 'aspect' | 'category';
  overlays: Overlays;
  snap: SnapSettings;
  /** Moving a layout-controlled object pins it so re-running the layout keeps your edit. */
  autoPin: boolean;
  /** Align/distribute using visible alpha bounds. */
  alignVisible: boolean;
  addWithLayout: boolean;
  quickStartDismissed: boolean;
  /** The "New here? Open the Guide" banner on Home was closed. */
  guideBannerDismissed: boolean;
  /** Layout ids starred in the layout picker. */
  favLayouts: string[];
  exportSettings: ExportSettings;
  nudge: number;
  /** Highlight colour of the interface. */
  accent: AccentId;
  /** Interface size (desktop app zoom). */
  uiScale: number;
  /** Colour of smart guides and ruler guides. */
  guideColor: string;
  /** Area around the page in the editor. */
  pasteboard: 'dark' | 'mid' | 'light';
  /** What the app opens on. */
  startScreen: 'home' | 'last';
  /** Home ▸ Recent projects: the view when shown, and whether the section is collapsed. */
  recentView: 'compact' | 'grid';
  recentCollapsed: boolean;
  /** Enlarged small icons: keep pixels sharp (pixel art) or smooth them. */
  pixelIcons: 'auto' | 'sharp' | 'smooth';
  /** Page size of new blank projects, "1920x1080". */
  newProjectSize: string;
  /** Font of new plain text. */
  defaultFont: string;
  /** Turn off interface animations. */
  reduceMotion: boolean;
  /** Clicking a template adds a new page, or rebuilds the page you are on. */
  templateTarget: 'new' | 'replace';
  /** Tile size in the Import screen's asset grid (px). */
  importTileSize: number;
  /** Starred items per library (ids: theme ids, background names, template ids). */
  favorites: Record<LibraryKind, string[]>;
  /** Recently applied items per library, newest first. */
  recents: Record<LibraryKind, string[]>;
  /** Projects pinned to the top of Recent projects. */
  pinnedProjects: string[];
  /** Progress of each interactive tutorial (step reached, finished). */
  tours: Record<string, { step: number; done: boolean }>;
  /** Guide lessons completed (by doing them, or marked as read). */
  guideProgress: Record<string, { how: 'action' | 'read'; at: number }>;
  /** Text inspector: curated looks or every control. */
  textMode: 'simple' | 'advanced';
  /** {brand} in watermarks. */
  brandName: string;
  /** Watermark defaults (never change a project's own watermark). */
  wmDefaults: { newProjects: boolean; preset: string };
  /** Seconds of quiet before an automatic save. */
  autosaveDelay: number;
  /** Undo steps kept per project. */
  historyLimit: number;
  /** Start-up: the workspace that was open last. */
  lastStage: string;
  /** New Perspective Floor layouts adapt rows and depth to small packs (under ~40 icons). */
  floorAdaptive: boolean;
  /** Largest cell of new Grid layouts, as a share of the shorter page side (0 = no limit). */
  gridMaxCell: number;
  /** Layouts used most recently (newest first). */
  recentLayouts: string[];
  /** Text style presets starred in the inspector. */
  favTextStyles: string[];
  /** Text style presets applied most recently (newest first). */
  recentTextStyles: string[];
  /** Export presets starred (built-in names and saved ids). */
  favExports: string[];
}

export type LibraryKind = 'themes' | 'backgrounds' | 'templates' | 'elements' | 'watermarks';

export type AccentId = 'blue' | 'purple' | 'teal' | 'green' | 'orange' | 'pink';
export const ACCENTS: Record<AccentId, { label: string; main: string; hover: string }> = {
  blue: { label: 'Blue', main: '#378ef0', hover: '#2680eb' },
  purple: { label: 'Purple', main: '#9256d9', hover: '#7e3bd0' },
  teal: { label: 'Teal', main: '#12a594', hover: '#0e8a7c' },
  green: { label: 'Green', main: '#2d9d78', hover: '#268e6c' },
  orange: { label: 'Orange', main: '#e68619', hover: '#cb6f10' },
  pink: { label: 'Pink', main: '#e3448f', hover: '#c9327a' },
};
/** 'accent' follows the accent colour; the rest are fixed colours. */
export const GUIDE_COLORS = ['accent', '#d633ff', '#ff3fa4', '#22d3ee', '#ff8a00', '#34d058'];
const PASTEBOARD = { dark: '#19191b', mid: '#29292c', light: '#8a8a8e' };

const DEFAULTS: Prefs = {
  theme: 'dark',
  leftWidth: 288,
  rightWidth: 304,
  layersHeight: 260,
  leftCollapsed: false,
  rightCollapsed: false,
  navMode: 'auto',
  thumbSize: 84,
  librarySort: 'import',
  overlays: { pixelGrid: true, compGrid: false, compDivs: 8, thirds: false, center: false, safe: true, perspective: true, rulers: true, focal: true, bounds: false },
  snap: { enabled: true, canvas: true, objects: true, guides: true, grid: false, gridSize: 20, strength: 10, spacing: true },
  autoPin: true,
  alignVisible: true,
  addWithLayout: true,
  quickStartDismissed: false,
  guideBannerDismissed: false,
  favLayouts: ['cluster', 'roundcluster', 'grid'],
  exportSettings: DEFAULT_EXPORT,
  nudge: 1,
  accent: 'blue',
  uiScale: 1,
  guideColor: 'accent',
  pasteboard: 'dark',
  startScreen: 'home',
  recentView: 'grid',
  recentCollapsed: false,
  pixelIcons: 'auto',
  newProjectSize: '1920x1080',
  defaultFont: 'Segoe UI Black',
  reduceMotion: false,
  templateTarget: 'new',
  importTileSize: 150,
  favorites: { themes: [], backgrounds: [], templates: [], elements: [], watermarks: [] },
  recents: { themes: [], backgrounds: [], templates: [], elements: [], watermarks: [] },
  pinnedProjects: [],
  tours: {},
  guideProgress: {},
  textMode: 'simple',
  brandName: '',
  wmDefaults: { newProjects: false, preset: 'corner-signature' },
  autosaveDelay: 0.7,
  historyLimit: 150,
  lastStage: 'compose',
  floorAdaptive: true,
  gridMaxCell: 0.36,
  recentLayouts: [],
  favTextStyles: [],
  recentTextStyles: [],
  favExports: [],
};

const KEY = 'asset-forge-showcase:prefs';

/** Fill in settings added in later versions and apply small migrations. */
function normalize(p: Partial<Prefs>): Prefs {
  // the old default pull (6px) felt too weak; move it to the new default unless the user changed it
  const snap = { ...DEFAULTS.snap, ...p.snap };
  if (snap.strength === 6) snap.strength = DEFAULTS.snap.strength;
  // the previous default guide colour becomes "follow the accent"
  if (p.guideColor === '#d633ff') p = { ...p, guideColor: 'accent' };
  // the previous default library width (300) clipped the panel's tab names; a width the user dragged stays
  if (p.leftWidth === 300 || p.leftWidth === 312) p = { ...p, leftWidth: DEFAULTS.leftWidth };
  // the redesigned shell adds a navigation sidebar, so the earlier default panel widths shrink a little
  if (p.rightWidth === 320) p = { ...p, rightWidth: DEFAULTS.rightWidth };
  return {
    ...DEFAULTS,
    ...p,
    overlays: { ...DEFAULTS.overlays, ...p.overlays },
    snap,
    exportSettings: { ...DEFAULTS.exportSettings, ...p.exportSettings },
    favorites: { ...DEFAULTS.favorites, ...p.favorites },
    recents: { ...DEFAULTS.recents, ...p.recents },
    tours: { ...p.tours },
    guideProgress: p.guideProgress && typeof p.guideProgress === 'object' ? { ...p.guideProgress } : {},
    wmDefaults: { ...DEFAULTS.wmDefaults, ...p.wmDefaults },
    recentView: p.recentView === 'compact' ? 'compact' : 'grid',
    recentCollapsed: p.recentCollapsed === true,
  };
}

let loadedFromLocal = false;
function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      loadedFromLocal = true;
      return normalize(JSON.parse(raw));
    }
  } catch {
    /* private mode etc. */
  }
  return DEFAULTS;
}

const DB_KEY = 'prefs';

/** At start-up: take the database copy when localStorage came back empty (or is older). */
export async function restorePrefs() {
  try {
    const saved = await db.getKV<Partial<Prefs> & { savedAt?: number }>(DB_KEY);
    if (!saved) return;
    let localAt = 0;
    try {
      localAt = JSON.parse(localStorage.getItem(KEY) ?? '{}').savedAt ?? 0;
    } catch {
      /* ignore */
    }
    if (!loadedFromLocal || (saved.savedAt ?? 0) > localAt) usePrefs.setState(normalize(saved));
  } catch {
    /* settings are a convenience — never block start-up */
  }
}

/** Everything back to factory settings (keeps nothing). */
/**
 * Things you collected rather than configured: favourites, recent picks, pinned projects, guide
 * progress and the brand name. "Restore defaults" keeps them.
 */
export const KEPT_ON_RESET = ['favLayouts', 'favorites', 'recents', 'pinnedProjects', 'tours', 'guideProgress', 'brandName', 'recentLayouts', 'favTextStyles', 'recentTextStyles', 'favExports', 'lastStage'] as const satisfies readonly (keyof Prefs)[];

/** Restore defaults: every setting, or only `keys` (one Settings section). Collections are kept. */
export function resetPrefs(keys?: readonly (keyof Prefs)[]) {
  const kept = new Set<string>(KEPT_ON_RESET);
  const patch: Partial<Prefs> = {};
  for (const k of keys ?? (Object.keys(DEFAULTS) as (keyof Prefs)[])) if (!kept.has(k)) (patch as Record<string, unknown>)[k] = structuredClone(DEFAULTS[k]);
  usePrefs.setState(patch);
  persist();
}

/** The default value of a setting (for "changed" markers and section resets). */
export const prefDefault = <K extends keyof Prefs>(k: K): Prefs[K] => DEFAULTS[k];

interface PrefsState extends Prefs {
  setPrefs: (p: Partial<Prefs>) => void;
  setOverlay: (p: Partial<Overlays>) => void;
  setSnap: (p: Partial<SnapSettings>) => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...load(),
  setPrefs: (p) => {
    set(p);
    persist();
  },
  setOverlay: (p) => {
    set({ overlays: { ...get().overlays, ...p } });
    persist();
  },
  setSnap: (p) => {
    set({ snap: { ...get().snap, ...p } });
    persist();
  },
}));

let t: ReturnType<typeof setTimeout> | null = null;
function writePrefs() {
  t = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { setPrefs, setOverlay, setSnap, ...rest } = usePrefs.getState();
    const data = { ...rest, savedAt: Date.now() };
    void db.setKV(DB_KEY, data).catch(() => undefined);
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function persist() {
  if (t) clearTimeout(t);
  t = setTimeout(writePrefs, 200);
}

// a change made just before the window closes or reloads is written right away, not lost
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const flush = () => {
    if (t) {
      clearTimeout(t);
      writePrefs();
    }
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}

/** Accent, guide and pasteboard colours as CSS variables, plus the interface size. */
export function applyAppearance(p: Pick<Prefs, 'accent' | 'guideColor' | 'pasteboard' | 'uiScale' | 'theme'>) {
  const root = document.documentElement.style;
  const a = ACCENTS[p.accent] ?? ACCENTS.blue;
  const hex = a.main.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
  root.setProperty('--accent', a.main);
  root.setProperty('--accent-2', a.hover);
  root.setProperty('--accent-soft', `rgba(${rgb}, 0.18)`);
  root.setProperty('--row-selected', `rgba(${rgb}, 0.16)`);
  root.setProperty('--guide', p.guideColor === 'accent' ? a.main : p.guideColor);
  const light = p.theme === 'light' || (p.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  if (p.pasteboard === 'dark' && light) root.removeProperty('--canvas');
  else root.setProperty('--canvas', PASTEBOARD[p.pasteboard] ?? PASTEBOARD.dark);
  window.showcaseNative?.setZoom?.(p.uiScale);
}

export function applyTheme(theme: Prefs['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // the desktop window's own title bar follows (dark title bar with the dark theme on Windows)
  void window.showcaseNative?.setTheme?.(theme);
}
