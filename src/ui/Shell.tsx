// Application shell: the navigation sidebar (workspaces and library sections), the header above the
// work area (menus, project name, undo/redo, export) and the status bar.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Download,
  FolderInput,
  House,
  Images,
  LayoutGrid,
  LayoutTemplate,
  MousePointer2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  ScanEye,
  Settings,
  Shapes,
  ShieldCheck,
  Undo2,
  Wallpaper,
  type LucideIcon,
  Stamp,
} from 'lucide-react';
import { activePageOf, redo, redoLabel, undo, undoLabel, useDoc } from '../state/doc';
import { BUILTIN_TEMPLATES } from '../state/generators';
import { usePresets } from '../state/presets';
import { usePrefs } from '../state/prefs';
import { renameProject } from '../state/project';
import { openDialog, setStage, useUI, useViewport, type LeftTab, type Stage } from '../state/ui';
import { MenuBar } from './MenuBar';

export const STAGES: { id: Stage; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'import', label: 'Import', hint: 'Manage assets, backgrounds and categories', icon: FolderInput },
  { id: 'compose', label: 'Compose', hint: 'Manual canvas editing', icon: MousePointer2 },
  { id: 'arrange', label: 'Arrange', hint: 'Smart layouts and perspective', icon: LayoutGrid },
  { id: 'watermark', label: 'Watermark', hint: 'Text or logo over your exports, never into the pages', icon: Stamp },
  { id: 'review', label: 'Review', hint: 'Preview at real sizes, check for problems', icon: ScanEye },
  { id: 'export', label: 'Export', hint: 'Render final images', icon: Download },
];

type LibraryId = 'assets' | 'templates' | 'backgrounds' | 'themes' | 'elements';
const LIBRARY: { id: LibraryId; label: string; hint: string; icon: LucideIcon; tab: LeftTab }[] = [
  { id: 'assets', label: 'Assets', hint: 'Your imported icons and sprites', icon: Images, tab: 'assets' },
  { id: 'templates', label: 'Templates', hint: 'Ready-made pages with a title and arrangement', icon: LayoutTemplate, tab: 'templates' },
  { id: 'backgrounds', label: 'Backgrounds', hint: 'Solids, gradients, patterns and scenes', icon: Wallpaper, tab: 'backgrounds' },
  { id: 'themes', label: 'Themes', hint: 'A background plus matching title and badge colours', icon: Palette, tab: 'backgrounds' },
  { id: 'elements', label: 'Elements', hint: 'Text styles, badges and shapes', icon: Shapes, tab: 'elements' },
];

/** Stages that show the library panel beside the canvas. */
export const libraryStage = (s: Stage) => s === 'compose' || s === 'arrange';

export function openLibrary(id: LibraryId) {
  const item = LIBRARY.find((l) => l.id === id)!;
  const ui = useUI.getState();
  const patch: Partial<ReturnType<typeof useUI.getState>> = { leftTab: item.tab };
  if (id === 'backgrounds') patch.bgView = 'backgrounds';
  if (id === 'themes') patch.bgView = 'themes';
  useUI.setState(patch);
  if (!libraryStage(ui.stage)) setStage('compose');
  if (usePrefs.getState().leftCollapsed) usePrefs.getState().setPrefs({ leftCollapsed: false });
}

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** Whether the navigation shows as a narrow icon rail. */
export function useNavRail() {
  const mode = usePrefs((s) => s.navMode);
  const stage = useUI((s) => s.stage);
  const width = useWindowWidth();
  if (mode !== 'auto') return mode === 'rail';
  const editing = stage === 'compose' || stage === 'arrange' || stage === 'watermark' || stage === 'review' || stage === 'export';
  return editing && width < 1720;
}

/** Flat mark: three icons standing on a floor, the product's own picture. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="logo-mark">
      <rect x="2" y="2.5" width="4.5" height="4.5" rx="1.25" fill="currentColor" />
      <rect x="7.75" y="1" width="4.5" height="6" rx="1.25" fill="currentColor" />
      <rect x="13.5" y="2.5" width="4.5" height="4.5" rx="1.25" fill="currentColor" />
      <path d="M4 10.5h12l3 7.5H1z" fill="currentColor" opacity="0.42" />
    </svg>
  );
}

/** Tooltip beside the icon rail: shown on hover and on keyboard focus, never clipped by the rail. */
type Tip = { text: string; top: number; left: number } | null;
let showTip: (t: Tip) => void = () => undefined;
const tipProps = (text: string) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => tipAt(e.currentTarget, text),
  onFocus: (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && tipAt(e.currentTarget, text),
  onMouseLeave: () => showTip(null),
  onBlur: () => showTip(null),
});
function tipAt(el: HTMLElement, text: string) {
  if (!el.closest('.nav.rail')) return;
  const r = el.getBoundingClientRect();
  showTip({ text, top: r.top + r.height / 2, left: r.right + 8 });
}
function RailTip() {
  const [t, setT] = useState<Tip>(null);
  useEffect(() => {
    showTip = setT;
    return () => void (showTip = () => undefined);
  }, []);
  return t ? (
    <div className="rail-tip" role="tooltip" style={{ top: t.top, left: t.left }}>
      {t.text}
    </div>
  ) : null;
}

/** The app icon (window, taskbar, executable, About): the mark on the app's graphite. Same as assets/brand/app-icon.svg. */
export function AppIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="app-icon">
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#141415" />
      <rect x="2.5" y="2.5" width="59" height="59" rx="13.5" fill="none" stroke="#ffffff" strokeOpacity="0.12" />
      <g transform="translate(12 13) scale(2)" fill="#ededef">
        <rect x="2" y="2.5" width="4.5" height="4.5" rx="1.25" />
        <rect x="7.75" y="1" width="4.5" height="6" rx="1.25" />
        <rect x="13.5" y="2.5" width="4.5" height="4.5" rx="1.25" />
        <path d="M4 10.5h12l3 7.5H1z" opacity="0.42" />
      </g>
    </svg>
  );
}

function NavRow({ icon: Icon, label, title, on, count, onClick, disabled }: { icon: LucideIcon; label: string; title: string; on?: boolean; count?: ReactNode; onClick: () => void; disabled?: boolean }) {
  const rail = !!useNavRailMode();
  const hint = disabled ? `${label} — open or create a project first` : title;
  return (
    <button className={`nav-row ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled} title={rail ? undefined : hint} aria-label={rail ? hint : undefined} aria-current={on ? 'page' : undefined} data-tour={`nav-${label.toLowerCase()}`} {...tipProps(disabled ? `${label} · open a project first` : count !== undefined && count !== '' ? `${label} · ${count}` : label)}>
      <Icon size={16} strokeWidth={1.75} />
      <span className="nav-label">{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}

const NavRailContext = createContext(false);
const useNavRailMode = () => useContext(NavRailContext);

export function NavSidebar({ rail }: { rail: boolean }) {
  return (
    <NavRailContext.Provider value={rail}>
      <NavSidebarInner rail={rail} />
    </NavRailContext.Provider>
  );
}

function NavSidebarInner({ rail }: { rail: boolean }) {
  const stage = useUI((s) => s.stage);
  const leftTab = useUI((s) => s.leftTab);
  const bgView = useUI((s) => s.bgView);
  const leftCollapsed = usePrefs((s) => s.leftCollapsed);
  const counts = useDoc((s) => {
    const c = { asset: 0, background: 0, element: 0, watermark: 0 };
    for (const a of s.doc.assets) c[a.kind]++;
    return `${c.asset}|${c.background}|${c.element}|${s.doc.pages.length}`;
  });
  const [nAssets, nBgs, nEls, nPages] = counts.split('|').map(Number);
  const myTemplates = usePresets('template').length;
  const open = useDoc((s) => s.open);
  const libOpen = libraryStage(stage) && !leftCollapsed;
  const libOn = (l: (typeof LIBRARY)[number]) => libOpen && leftTab === l.tab && (l.tab !== 'backgrounds' || (l.id === 'themes') === (bgView === 'themes'));
  const libCount = (id: LibraryId) => (id === 'assets' ? nAssets : id === 'templates' ? BUILTIN_TEMPLATES.length + myTemplates : id === 'backgrounds' ? nBgs || undefined : id === 'elements' ? nEls || undefined : undefined);
  const toggle = () => {
    showTip(null);
    usePrefs.getState().setPrefs({ navMode: rail ? 'open' : 'rail' });
  };
  // the same button in the same place at the top: beside the name when open, under the logo as a rail
  const toggleBtn = (
    <button className="icon-btn nav-toggle" onClick={toggle} title={rail ? undefined : 'Collapse to icons'} aria-label={rail ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!rail} {...tipProps(rail ? 'Expand navigation' : '')}>
      {rail ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
    </button>
  );
  return (
    <nav className={`nav ${rail ? 'rail' : ''}`} aria-label="Navigation">
      <div className="nav-brand">
        <button className="brand" onClick={() => setStage('home')} title={rail ? undefined : 'Home (Alt+0)'} aria-label="Icon Forge Showcase — Home" {...tipProps('Icon Forge Showcase · Home')}>
          <Logo />
          {!rail && <span className="brand-name">Icon Forge Showcase</span>}
        </button>
        {toggleBtn}
      </div>
      <div className="nav-scroll">
        <div className="nav-group">
          <div className="nav-head">Workspace</div>
          <NavRow icon={House} label="Home" title="Home — projects and templates (Alt+0)" on={stage === 'home'} onClick={() => setStage('home')} />
          {STAGES.map((s, i) => (
            <NavRow
              key={s.id}
              icon={s.icon}
              label={s.label}
              title={`${s.label} — ${s.hint} (Alt+${i + 1})`}
              on={stage === s.id}
              count={!open ? undefined : s.id === 'import' ? nAssets : s.id === 'compose' ? nPages : undefined}
              onClick={() => setStage(s.id)}
              disabled={!open}
            />
          ))}
        </div>
        <div className="nav-group">
          <div className="nav-head">Library</div>
          {LIBRARY.map((l) => (
            <NavRow key={l.id} icon={l.icon} label={l.label} title={`${l.label} — ${l.hint}`} on={open && libOn(l)} count={open ? libCount(l.id) : undefined} onClick={() => openLibrary(l.id)} disabled={!open} />
          ))}
        </div>
      </div>
      <div className="nav-foot">
        <NavRow icon={BookOpen} label="Guide" title="Guide — how everything works, with short clips (F1)" on={stage === 'guide'} onClick={() => setStage('guide')} />
        <NavRow icon={Settings} label="Settings" title="Settings" onClick={() => openDialog('settings')} />
        {!rail && (
          <div className="nav-offline" title="Images never leave this computer. No uploads, no accounts, works offline.">
            <ShieldCheck size={14} strokeWidth={1.75} /> Offline, files stay on this computer
          </div>
        )}
      </div>
      <RailTip />
    </nav>
  );
}

export function WorkHeader() {
  const name = useDoc((s) => s.doc.name);
  const open = useDoc((s) => s.open);
  const dirty = useDoc((s) => s.open && s.rev !== s.fileRev);
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  // window title like a document-based app: "Project — Icon Forge Showcase"
  useEffect(() => {
    document.title = open ? `${name || 'Untitled'}${dirty ? ' •' : ''} — Icon Forge Showcase` : 'Icon Forge Showcase';
  }, [name, dirty, open]);
  if (!open)
    return (
      <header className="workhead">
        <MenuBar />
        <div className="doc-title">
          <span className="muted no-project">No project open</span>
        </div>
        <div className="workhead-actions" />
      </header>
    );
  return (
    <header className="workhead">
      <MenuBar />
      <div className="doc-title">
        <input
          className="project-name"
          value={name}
          onChange={(e) => renameProject(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          title="Project name — used for exported file names"
          aria-label="Project name"
        />
        {dirty && <span className="dirty-dot" title="Autosaved on this computer; not yet saved to a .showcase file (Ctrl+S)" />}
      </div>
      <div className="workhead-actions">
        <button className="icon-btn" disabled={!canUndo} title={`Undo ${undoLabel() ?? ''} (Ctrl+Z)`} aria-label="Undo" onClick={undo}>
          <Undo2 size={16} strokeWidth={1.75} />
        </button>
        <button className="icon-btn" disabled={!canRedo} title={`Redo ${redoLabel() ?? ''} (Ctrl+Shift+Z)`} aria-label="Redo" onClick={redo}>
          <Redo2 size={16} strokeWidth={1.75} />
        </button>
        <button className="btn primary export-btn" title="Export (Ctrl+E)" onClick={() => openDialog('export')} data-tour="export">
          <Download size={14} strokeWidth={1.75} /> Export
        </button>
      </div>
    </header>
  );
}

export function StatusBar() {
  const assets = useDoc((s) => s.doc.assets.filter((a) => a.kind === 'asset').length);
  const page = useDoc((s) => activePageOf(s.doc));
  const pageIndex = useDoc((s) => s.doc.pages.findIndex((p) => p.id === s.doc.activePageId));
  const pages = useDoc((s) => s.doc.pages.length);
  const onCanvas = page.objects.filter((o) => o.type === 'image').length;
  const sel = useUI((s) => s.selection.length);
  const zoom = useViewport((s) => s.zoom);
  const task = useUI((s) => s.task);
  const open = useDoc((s) => s.open);
  if (!open)
    return (
      <footer className="statusbar">
        <span>No project open</span>
        {task && (
          <span className="task">
            <span className="spinner" />
            {task.label}
          </span>
        )}
      </footer>
    );
  return (
    <footer className="statusbar">
      <span>
        <b>{assets}</b> assets
      </span>
      <span>
        <b>{onCanvas}</b> on canvas
      </span>
      <span>
        <b>{sel}</b> selected
      </span>
      <span className="sb-page">
        {page.name} <b>{page.width} × {page.height}</b>
        {pages > 1 && <> · page {pageIndex + 1} of {pages}</>}
      </span>
      <span>
        Zoom <b>{Math.round(zoom * 100)}%</b>
      </span>
      {task && (
        <span className="task">
          <span className="spinner" />
          {task.label} {task.total > 1 ? `${task.done}/${task.total}` : ''}
          {task.total > 1 && (
            <span className="progress-bar">
              <div style={{ width: `${(task.done / task.total) * 100}%` }} />
            </span>
          )}
          {task.cancel && (
            <button className="link-btn task-cancel" onClick={task.cancel} title="Stop after the image being rendered; files already written stay">
              Cancel
            </button>
          )}
        </span>
      )}
    </footer>
  );
}
