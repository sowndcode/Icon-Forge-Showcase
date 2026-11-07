import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FolderInput, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import '../styles.css';
import '../styles.workflow.css';
import { importFiles } from '../state/assets';
import { setHistoryLimit, useDoc } from '../state/doc';
import { applyAppearance, applyTheme, usePrefs } from '../state/prefs';
import { boot, createNewProject, openProjectFile, startAutosave } from '../state/project';
import { startGuideTracking } from '../state/guideProgress';
import { setStage, toast, useUI } from '../state/ui';
import { entriesFromDataTransfer, entriesFromInput, extOf, ACCEPT_IMAGES, type FileEntry } from '../services/formats';
import { consumeTheOneArm, runTheOne } from '../state/theOne';
import { setTextVars } from '../render/text';
import { setImageScaling } from '../render/renderer';
import { setDefaultFont, setNewProjectSize } from '../core/defaults';
import type { AssetKind, ProjectDoc } from '../core/types';
import { GuideView } from './views/GuideView';
import { Editor } from './canvas/Editor';
import { LeftPanel } from './left/LeftPanel';
import { RightPanel } from './right/RightPanel';
import { PageStrip } from './PageStrip';
import { Logo, NavSidebar, StatusBar, WorkHeader, useNavRail } from './Shell';
import { ContextMenu } from './menus';
import { useShortcuts } from './shortcuts';
import { Dialogs } from './dialogs/Dialogs';
import { WatermarkView } from './views/WatermarkView';
import { ExportView } from './views/ExportView';
import { TourHost } from './tour';
import { ReviewView } from './views/ReviewView';
import { ImportView } from './views/ImportView';
import { EmptyState, QuickStart } from './views/EmptyState';
import { OptionsBar, ToolDock } from './canvas/EditorChrome';
import { HomeView } from './views/HomeView';
import { AskHost } from './components/ask';
import { PaletteSync } from './components/PaletteSync';

// shared hidden inputs so any component can open the pickers
export const pickers = { files: null as HTMLInputElement | null, folder: null as HTMLInputElement | null, project: null as HTMLInputElement | null, kind: 'asset' as AssetKind };
// stable ref callbacks (an inline arrow would detach/re-attach the input on every render)
const refFiles = (el: HTMLInputElement | null) => void (el && (pickers.files = el));
const refFolder = (el: HTMLInputElement | null) => void (el && (pickers.folder = el));
const refProject = (el: HTMLInputElement | null) => void (el && (pickers.project = el));
const input = (which: 'files' | 'folder' | 'project') => pickers[which] ?? document.querySelector<HTMLInputElement>(`input[data-picker="${which}"]`);

export function openFilePicker(kind: typeof pickers.kind = 'asset') {
  pickers.kind = kind;
  input('files')?.click();
}
export function openFolderPicker(kind: typeof pickers.kind = 'asset') {
  pickers.kind = kind;
  input('folder')?.click();
}
export function openProjectPicker() {
  input('project')?.click();
}

/** Import, then run The One if it was waiting for this import. With no project open, a new one is made for the files. */
async function importAndContinue(list: FileEntry[], kind: typeof pickers.kind) {
  if (!useDoc.getState().open) {
    await createNewProject({ name: 'Untitled showcase', width: 1920, height: 1080, copyAssets: false });
    if (!useDoc.getState().open) return;
  }
  await importFiles(list, kind);
  if (consumeTheOneArm()) await runTheOne();
}

function App() {
  const theme = usePrefs((s) => s.theme);
  const booting = useUI((s) => s.booting);
  const bootNote = useUI((s) => s.bootNote);
  const stage = useUI((s) => s.stage);
  const focus = useUI((s) => s.focusMode);
  const prefs = usePrefs();
  const rail = useNavRail();
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => applyTheme(theme), [theme]);
  const look = usePrefs((s) => `${s.accent}|${s.guideColor}|${s.pasteboard}|${s.uiScale}|${s.theme}`);
  useEffect(() => applyAppearance(usePrefs.getState()), [look]);
  const pixelIcons = usePrefs((s) => s.pixelIcons);
  useEffect(() => setImageScaling(pixelIcons), [pixelIcons]);
  const historyLimit = usePrefs((s) => s.historyLimit);
  useEffect(() => setHistoryLimit(historyLimit), [historyLimit]);
  // remember the workspace for Settings ▸ General ▸ Open on: last project
  const stageNow = useUI((s) => s.stage);
  useEffect(() => {
    if (!['home', 'guide'].includes(stageNow) && usePrefs.getState().lastStage !== stageNow) usePrefs.getState().setPrefs({ lastStage: stageNow });
  }, [stageNow]);
  const newSize = usePrefs((s) => s.newProjectSize);
  const defaultFont = usePrefs((s) => s.defaultFont);
  useEffect(() => {
    const [w, h] = newSize.split('x').map(Number);
    setNewProjectSize(w, h);
    setDefaultFont(defaultFont);
  }, [newSize, defaultFont]);
  const reduceMotion = usePrefs((s) => s.reduceMotion);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);
  useEffect(() => {
    startAutosave();
    const stopTracking = startGuideTracking();
    void boot();
    // {count}, {categories} and {project} in text objects follow the project
    const vars = (d: ProjectDoc) => {
      const own = d.assets.filter((a) => a.kind === 'asset');
      setTextVars({ count: String(own.length), categories: String(new Set(own.map((a) => a.category).filter(Boolean)).size), project: d.name });
    };
    vars(useDoc.getState().doc);
    const stopVars = useDoc.subscribe((s, prev) => {
      if (s.doc.assets !== prev.doc.assets || s.doc.name !== prev.doc.name) vars(s.doc);
    });
    return () => {
      stopVars();
      stopTracking();
    };
  }, []);
  useShortcuts();
  useGlobalDrop(setDragOver);
  // with no project open only Home and the Guide exist
  const projectOpen = useDoc((s) => s.open);
  useEffect(() => {
    if (!booting && !projectOpen && stage !== 'home' && stage !== 'guide') setStage('home');
  }, [booting, projectOpen, stage]);

  if (booting)
    return (
      <div className="boot">
        <Logo size={28} />
        <span>{bootNote ?? 'Opening your last project…'}</span>
      </div>
    );
  const home = stage === 'home' || stage === 'guide' || !projectOpen;
  const editor = !home && stage !== 'import';
  const showLeft = !focus && editor && stage !== 'review' && stage !== 'watermark' && stage !== 'export';
  const showRight = !focus && editor && stage !== 'export';
  const leftW = prefs.leftCollapsed ? 0 : prefs.leftWidth;
  const rightW = prefs.rightCollapsed ? 0 : prefs.rightWidth;
  const cols = [showLeft ? (prefs.leftCollapsed ? '36px 8px' : `${leftW}px 8px`) : '', 'minmax(0, 1fr)', showRight ? (prefs.rightCollapsed ? '8px 36px' : `8px ${rightW}px`) : ''].filter(Boolean).join(' ');
  return (
    <div className={`app ${focus ? 'focus' : ''}`}>
      {!focus && <NavSidebar rail={rail} />}
      <div className="workarea">
        <WorkHeader />
        <div className="main" style={{ gridTemplateColumns: cols }}>
          {showLeft &&
            (prefs.leftCollapsed ? (
              <>
                <div className="collapsed-rail">
                  <button className="icon-btn" title="Show library" aria-label="Show library" onClick={() => prefs.setPrefs({ leftCollapsed: false })}>
                    <PanelLeftOpen size={16} strokeWidth={1.75} />
                  </button>
                </div>
                <div className="gutter" />
              </>
            ) : (
              <>
                <aside className="panel" aria-label="Library">
                  <LeftPanel />
                </aside>
                <Resizer side="left" />
              </>
            ))}
          <main className={`center ${editor ? 'is-editor' : ''}`}>
            {stage === 'guide' ? (
              <GuideView />
            ) : home ? (
              <HomeView />
            ) : stage === 'import' ? (
              <ImportView />
            ) : stage === 'export' ? (
              <ExportView />
            ) : stage === 'watermark' ? (
              <>
                <WatermarkView />
                {!focus && <PageStrip />}
              </>
            ) : (
              <>
                {stage !== 'review' && <OptionsBar />}
                <div className="workspace">
                  <div className="canvas-area">
                    <Editor />
                    <EmptyState />
                    <QuickStart />
                    {stage !== 'review' && <ToolDock />}
                  </div>
                </div>
                {stage === 'review' && <ReviewView />}
                {!focus && <PageStrip />}
              </>
            )}
          </main>
          {showRight &&
            (prefs.rightCollapsed ? (
              <>
                <div className="gutter" />
                <div className="collapsed-rail">
                  <button className="icon-btn" title="Show inspector" aria-label="Show inspector" onClick={() => prefs.setPrefs({ rightCollapsed: false })}>
                    <PanelRightOpen size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Resizer side="right" />
                <aside className="panel" aria-label="Inspector">
                  <RightPanel />
                </aside>
              </>
            ))}
        </div>
        <StatusBar />
      </div>
      <input
        ref={refFiles}
        data-picker="files"
        type="file"
        multiple
        hidden
        accept={ACCEPT_IMAGES + ',.ttf,.otf,.woff,.woff2'}
        onChange={(e) => {
          const list = entriesFromInput(e.target.files ?? []);
          e.target.value = '';
          if (list.length) void importAndContinue(list, pickers.kind);
        }}
      />
      <input
        ref={refFolder}
        data-picker="folder"
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => {
          const list = entriesFromInput(e.target.files ?? []);
          e.target.value = '';
          if (list.length) void importAndContinue(list, pickers.kind);
        }}
      />
      <input
        ref={refProject}
        data-picker="project"
        type="file"
        hidden
        accept=".showcase,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void openProjectFile(f);
        }}
      />
      <Dialogs />
      <AskHost />
      <TourHost />
      <PaletteSync />
      <ContextMenu />
      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-card">
            <FolderInput size={24} strokeWidth={1.5} />
            <b>Drop images or folders to import</b>
            <small>Folders become categories</small>
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}

function useGlobalDrop(setOver: (v: boolean) => void) {
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const over = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const entries = await entriesFromDataTransfer(e.dataTransfer!);
      const proj = entries.find((x) => extOf(x.file.name) === 'showcase');
      if (proj) return void openProjectFile(proj.file);
      const tab = useUI.getState().leftTab;
      const kind = tab === 'backgrounds' ? 'background' : tab === 'elements' ? 'element' : 'asset';
      if (entries.length) {
        if (useUI.getState().stage === 'home') setStage('import');
        await importAndContinue(entries, kind);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [setOver]);
}

function Resizer({ side }: { side: 'left' | 'right' }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`resizer ${dragging ? 'dragging' : ''}`}
      onDoubleClick={() => usePrefs.getState().setPrefs(side === 'left' ? { leftCollapsed: true } : { rightCollapsed: true })}
      title="Drag to resize · double-click to collapse"
      onPointerDown={(e) => {
        const start = e.clientX;
        const p = usePrefs.getState();
        const w0 = side === 'left' ? p.leftWidth : p.rightWidth;
        setDragging(true);
        const move = (ev: PointerEvent) => {
          const d = ev.clientX - start;
          const w = Math.max(240, Math.min(560, side === 'left' ? w0 + d : w0 - d));
          usePrefs.getState().setPrefs(side === 'left' ? { leftWidth: w } : { rightWidth: w });
        };
        const up = () => {
          setDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-dot" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// report unexpected errors without crashing the editor
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Unexpected error: ' + (e.reason instanceof Error ? e.reason.message : String(e.reason)), 'error');
});

// reuse the root when the dev server hot-reloads this module
const host = document.getElementById('root') as HTMLElement & { __root?: ReturnType<typeof createRoot> };
host.__root ??= createRoot(host);
host.__root.render(<App />);
