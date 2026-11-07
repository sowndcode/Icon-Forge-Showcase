// Home: the open project (if any) in one compact row, then the project library, then quick ways to
// start a new project. Page generators that need the open project's assets live in its Generate
// pages menu. With no project open, Home is the project library and starting point.

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Download, FilePlus2, FolderInput, FolderOpen, House, LayoutGrid, LayoutTemplate, List, Plus, Sparkles, X } from 'lucide-react';
import { armTheOne, runTheOne } from '../../state/theOne';
import { useDoc } from '../../state/doc';
import { categoriesOf } from '../../state/assets';
import { CANVAS_PRESETS, presetName } from '../../core/defaults';
import { closeProject, openProjectViaDialog } from '../../state/project';
import { openDialog, openExport, setStage } from '../../state/ui';
import { usePrefs } from '../../state/prefs';
import { images } from '../../render/images';
import { openFolderPicker, openProjectPicker } from '../App';
import { ProjectBrowser, useProjectList } from '../dialogs/ProjectDialogs';
import { PagePreview } from '../components/PagePreview';
import { openMenu } from '../menus';

/** Bumps whenever decoded images arrive, so previews redraw once the icons are ready. */
function useImagesReady() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = images.subscribe(() => {
      if (!t) t = setTimeout(() => ((t = null), setN((x) => x + 1)), 400);
    });
    return () => {
      if (t) clearTimeout(t);
      unsub();
    };
  }, []);
  return n;
}

/** Pick the pack folder; a hero, square cover, catalog and category pages are built from it. */
function storeSetFromFolder() {
  armTheOne();
  openFolderPicker();
}

export function HomeView() {
  const open = useDoc((s) => s.open);
  const name = useDoc((s) => s.doc.name);
  const openFile = async () => {
    if (!(await openProjectViaDialog())) openProjectPicker();
  };
  return (
    <div className="home">
      <div className="home-inner">
        <div className="page-crumb">
          <House size={16} /> Home
        </div>
        <header className="home-head">
          <h1 className="home-title">
            {open ? name || 'Untitled project' : 'Icon Forge Showcase'}
            {!open && <span>store art from your icon packs</span>}
          </h1>
          <div className="home-actions">
            <button className="btn" onClick={() => void openFile()}>
              <FolderOpen size={16} /> Open file…
            </button>
            <button className={`btn ${open ? '' : 'primary'}`} onClick={() => openDialog('newProject')} data-tour="home-new">
              <FilePlus2 size={16} /> New project
            </button>
          </div>
        </header>

        {open && <CurrentProject />}
        <RecentProjects />
        <NewProjectRow />
      </div>
    </div>
  );
}

/** The open project in one row: preview, counts, Continue, Generate pages, Export and Close. */
function CurrentProject() {
  const doc = useDoc((s) => s.doc);
  const rev = useDoc((s) => s.rev);
  const ready = useImagesReady();
  const assets = useMemo(() => doc.assets.filter((a) => a.kind === 'asset'), [doc.assets]);
  const cats = useMemo(() => categoriesOf(assets), [assets]);
  const nObjects = doc.pages.reduce((a, p) => a + p.objects.length, 0);
  const first = doc.pages.find((p) => p.objects.length) ?? doc.pages[0];
  const generate = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const none = !assets.length;
    openMenu(r.left, r.bottom + 4, [
      { label: 'Complete store set', disabled: none, onClick: () => void runTheOne() },
      { label: 'Custom store set…', disabled: none, onClick: () => openDialog('marketplace') },
      { label: 'Catalog…', disabled: none, onClick: () => openDialog('catalog') },
      { label: 'Category pages…', disabled: none, onClick: () => openDialog('categoryShowcase') },
      { separator: true },
      { label: 'Preview templates with my assets…', disabled: none, onClick: () => openDialog('templatePreviews') },
      { label: 'Store set from a pack folder…', onClick: storeSetFromFolder },
    ]);
  };
  return (
    <section className="card current-project" aria-label="Open project">
      <button className="cp-thumb checker" onClick={() => setStage('compose')} title="Open the editor" aria-label="Open the editor">
        {first && nObjects > 0 ? <PagePreview cacheKey={`home|${first.id}|${rev}|${ready}`} width={220} build={() => first} className="fill" /> : <span className="muted small">No pages built yet</span>}
      </button>
      <div className="cp-text">
        <span className="card-label">Open project</span>
        <span className="cp-figures">
          <span>
            <b>{doc.pages.length}</b> page{doc.pages.length === 1 ? '' : 's'}
          </span>
          <span>
            <b>{assets.length}</b> asset{assets.length === 1 ? '' : 's'}
          </span>
          {cats.length > 0 && (
            <span>
              <b>{cats.length}</b> {cats.length === 1 ? 'category' : 'categories'}
            </span>
          )}
        </span>
        <span className="cp-pages ellipsis" title={doc.pages.map((p) => p.name).join(', ')}>
          {doc.pages
            .map((p) => p.name)
            .slice(0, 4)
            .join(', ')}
          {doc.pages.length > 4 ? ` and ${doc.pages.length - 4} more` : ''}
        </span>
      </div>
      <div className="cp-actions">
        <button className="btn primary" onClick={() => setStage(nObjects ? 'compose' : 'import')}>
          Continue <ArrowRight size={14} />
        </button>
        <button className="btn" onClick={generate} aria-haspopup="menu" title={assets.length ? 'Add generated pages to this project' : 'Import assets first, or build a store set from a pack folder'}>
          <Sparkles size={14} /> Generate pages <ChevronDown size={13} />
        </button>
        <button className="btn ghost" onClick={() => openExport()} disabled={!nObjects}>
          <Download size={14} /> Export
        </button>
        <button className="btn ghost" onClick={() => void closeProject()} title="Save and close this project. It stays in Recent projects.">
          <X size={14} /> Close project
        </button>
      </div>
    </section>
  );
}

/** Recent projects as a compact list or a grid, or collapsed to its header. Thumbnails only load while shown. */
function RecentProjects() {
  const view = usePrefs((s) => s.recentView);
  const collapsed = usePrefs((s) => s.recentCollapsed);
  const set = usePrefs((s) => s.setPrefs);
  const { list } = useProjectList();
  const count = list?.length ?? 0;
  const mode = collapsed ? 'hidden' : view;
  const pick = (m: 'compact' | 'grid' | 'hidden') => (m === 'hidden' ? set({ recentCollapsed: true }) : set({ recentView: m, recentCollapsed: false }));
  return (
    <section className={`home-section recent ${collapsed ? 'collapsed' : ''}`} aria-label="Recent projects">
      <div className="section-title">
        <button className="recent-toggle" aria-expanded={!collapsed} aria-controls="recent-projects-body" onClick={() => set({ recentCollapsed: !collapsed })} title={collapsed ? 'Show recent projects' : 'Hide recent projects'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <h3>Recent projects</h3>
          {list && <span className="section-meta mono">{count}</span>}
        </button>
        <div className="seg recent-modes" role="radiogroup" aria-label="Show recent projects as">
          {(
            [
              ['compact', 'Compact', List],
              ['grid', 'Grid', LayoutGrid],
              ['hidden', 'Hidden', ChevronRight],
            ] as const
          ).map(([m, label, Icon]) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => pick(m)} title={m === 'hidden' ? 'Collapse to this header' : `Show as ${label.toLowerCase()}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      {!collapsed && (
        <div id="recent-projects-body">
          {list && !list.length ? <div className="muted small">Projects you create appear here. Everything is saved automatically on this computer.</div> : <ProjectBrowser limit={view === 'compact' ? 10 : 8} view={view} />}
        </div>
      )}
    </section>
  );
}

/** Quick ways to start: the popular sizes in one compact row, every size and the templates a click away. */
function NewProjectRow() {
  const popular = CANVAS_PRESETS.filter((p) => p.popular);
  return (
    <section className="home-section" aria-label="Start a new project">
      <div className="section-title">
        <h3>Start a new project</h3>
        <span className="row">
          <button className="btn ghost sm" onClick={storeSetFromFolder} title="Pick your pack folder: a hero, square cover, numbered catalog and a page per category are built from it">
            <FolderInput size={14} /> Store set from a folder…
          </button>
          <button className="btn ghost sm" onClick={() => openDialog('newProject', 'blank')} title="Every size by store and platform, or your own">
            All sizes…
          </button>
          <button className="btn sm" onClick={() => openDialog('newProject', 'templates')}>
            <LayoutTemplate size={14} /> Templates…
          </button>
        </span>
      </div>
      <div className="size-row">
        <button className="size-chip" onClick={() => openDialog('newProject', 'blank')} title="Pick from every size, or type your own">
          <span className="size-ratio custom">
            <Plus size={14} />
          </span>
          <span className="size-text">
            <b>Custom size</b>
            <small>Any width and height</small>
          </span>
        </button>
        {popular.map((p) => {
          const k = 24 / Math.max(p.w, p.h);
          return (
            <button key={p.label} className="size-chip" title={`Blank ${p.label}`} onClick={() => openDialog('newProject', `size:${p.label}`)}>
              <span className="size-ratio">
                <span style={{ width: Math.max(4, p.w * k), height: Math.max(4, p.h * k) }} />
              </span>
              <span className="size-text">
                <b>{presetName(p.label)}</b>
                <small className="mono">
                  {p.w} × {p.h}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
