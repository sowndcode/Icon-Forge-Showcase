// Interactive tutorials. Each step opens the right place in the app, outlines the control to use and
// waits: it moves on by itself once the user has done the step (or with Next). The outline never
// blocks the interface, so the project can be edited normally while a tutorial runs; Esc or Exit ends
// it at any time and the step reached is remembered on this computer. Everything is local and offline.

import { useEffect, useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getDoc, useDoc } from '../state/doc';
import { usePresetStore } from '../state/presets';
import { usePrefs } from '../state/prefs';
import { openDialog, setStage, useUI, type LeftTab } from '../state/ui';
import { create } from 'zustand';

export interface TourStep {
  /** data-tour anchor to outline (an empty marker outlines the element after it). */
  target?: string;
  title: string;
  body: string;
  /** Opens the right place before the step is shown. */
  prepare?: () => void;
  /** True once the user has done what the step asks; the tour then moves on by itself. */
  done?: () => boolean;
}

export interface Tour {
  id: string;
  title: string;
  /** One line for the list in the Guide. */
  blurb: string;
  steps: TourStep[];
}

const compose = (tab?: LeftTab, extra?: () => void) => () => {
  setStage('compose');
  usePrefs.getState().setPrefs({ leftCollapsed: false });
  if (tab) useUI.setState({ leftTab: tab });
  extra?.();
};
const assets = () => getDoc().assets.filter((a) => a.kind === 'asset').length;
const presets = (kind: string) => usePresetStore.getState().list.filter((p) => p.kind === kind).length;
const activePage = () => getDoc().pages.find((p) => p.id === getDoc().activePageId)!;

/** Remembers values at the moment a step starts, so "done" can mean "changed since". */
const at: Record<string, unknown> = {};
const mark = (k: string, get: () => unknown) => () => (at[k] = get());

export const TOURS: Tour[] = [
  {
    id: 'first-project',
    title: 'Create your first project',
    blurb: 'Start an empty project at the right size',
    steps: [
      { target: 'home-new', title: 'New project', body: 'Click New project. Pick a size or a template on the left — itch.io covers are 630 × 500.', prepare: () => setStage('home'), done: () => useUI.getState().dialog === 'newProject' },
      { title: 'Start empty', body: 'New projects start with no assets. To reuse icons you already imported elsewhere, choose “Reuse assets from a project”. Then press Create.', prepare: mark('doc', () => getDoc().id), done: () => getDoc().id !== at.doc && useUI.getState().dialog !== 'newProject' },
    ],
  },
  {
    id: 'import',
    title: 'Import assets',
    blurb: 'Bring in a folder of icons; sub-folders become categories',
    steps: [
      { target: 'import-folder', title: 'Import a folder', body: 'Pick the folder with your icons, or drag it onto the window. Nothing leaves your computer.', prepare: () => (setStage('import'), (at.assets = assets())), done: () => assets() > (at.assets as number) },
      { target: 'import-grid', title: 'Check them', body: 'Double-click any icon to see it large with its size, format and transparency. Use ← → to browse.', done: () => useUI.getState().dialog === 'assetPreview' },
    ],
  },
  {
    id: 'organize',
    title: 'Organize assets',
    blurb: 'Categories, filters and selection',
    steps: [
      { target: 'import-categories', title: 'Categories', body: 'Click a category to show it, drag selected icons onto one to move them, double-click to rename.', prepare: () => setStage('import') },
      { target: 'import-filter', title: 'Filter', body: 'Show only one format, transparent or opaque icons, a size range, or files with problems.' },
      { target: 'import-grid', title: 'Select several', body: 'Ctrl-click or Shift-click icons, or drag a box across empty space. Right-click for categories and removal.', done: () => useUI.getState().librarySel.length > 1 },
    ],
  },
  {
    id: 'add-icons',
    title: 'Add icons to a page',
    blurb: 'Put the whole pack on the canvas in one click',
    steps: [
      { target: 'add-all', title: 'Add all', body: 'Add every icon to the page with a grid layout. Select some first to add only those.', prepare: compose('assets', mark('objs', () => activePage()?.objects.length ?? 0)), done: () => (activePage()?.objects.length ?? 0) > (at.objs as number) },
      { target: 'nav-arrange', title: 'Change the arrangement', body: 'Arrange lists every layout, previewed with your icons. Click one to try it — nothing is lost.' },
    ],
  },
  {
    id: 'template',
    title: 'Choose a template',
    blurb: 'A finished cover in one click, then make it yours',
    steps: [
      { target: 'tpl-grid', title: 'Pick a template', body: 'Click one to add it as a new page. Right-click for “layout only”, “background only” or “text style only”.', prepare: compose('templates', mark('pages', () => getDoc().pages.length)), done: () => getDoc().pages.length > (at.pages as number) },
      { target: 'tpl-options', title: 'Its options', body: 'Format, look, text style and icon size apply live to this page only. Changing the text style never resets the theme.' },
    ],
  },
  {
    id: 'theme',
    title: 'Apply a theme',
    blurb: 'Background and matching title colours together',
    steps: [
      { target: 'theme-pro', title: 'Pick a theme', body: 'A theme sets the background and recolours the title, subtitle and badges. Your words stay. Right-click to preview first.', prepare: compose('backgrounds', () => (useUI.setState({ bgView: 'themes' }), mark('look', () => activePage()?.lookId)())), done: () => activePage()?.lookId !== at.look },
      { target: 'pagestrip', title: 'Several pages', body: 'Ctrl-click pages here to pick several; the next theme or background applies to all of them in one undo step.' },
    ],
  },
  {
    id: 'backgrounds',
    title: 'Customize backgrounds',
    blurb: 'Presets, search, your icons’ colours and fine-tuning',
    steps: [
      { target: 'bg-search', title: 'Find one', body: 'Search, or filter light and dark backgrounds. Star the ones you like; recently used appear at the top.', prepare: compose('backgrounds', () => (useUI.setState({ bgView: 'backgrounds' }), mark('bg', () => activePage()?.background)())), done: () => activePage()?.background !== at.bg },
      { target: 'bg-customize', title: 'Fine-tune', body: 'Change colours, add a pattern, a spotlight or a vignette. Save it to reuse in any project.' },
    ],
  },
  {
    id: 'text',
    title: 'Edit text',
    blurb: 'Words, looks, suggestions and readability',
    steps: [
      { target: 'nav-elements', title: 'Add a title', body: 'Elements has titles, labels and badges. Click one, then double-click it on the page to type.', prepare: compose('elements'), done: () => useUI.getState().selection.some((id) => activePage()?.objects.find((o) => o.id === id)?.type === 'text') },
      { target: 'text-style', title: 'Style it', body: 'Simple shows ready looks and suggestions that read on your background; Advanced shows every control. Improve contrast fixes colours in one click.', prepare: () => useUI.setState({ inspectorTab: 'design' }) },
    ],
  },
  {
    id: 'save-theme',
    title: 'Save a custom theme',
    blurb: 'Reuse a look in every project',
    steps: [{ target: 'theme-save', title: 'Save this look', body: 'Save → Save as new theme keeps the background, title look and badge colours on this computer. It appears in My themes in every project.', prepare: compose('backgrounds', () => (useUI.setState({ bgView: 'themes' }), mark('themes', () => presets('theme'))())), done: () => presets('theme') > (at.themes as number) }],
  },
  {
    id: 'save-template',
    title: 'Save a custom template',
    blurb: 'Reuse a page’s layout, text and look',
    steps: [{ target: 'tpl-save', title: 'Save as template', body: 'Save keeps this page’s layout, text and background — not its icons. Use it in any project; it fills with that project’s icons.', prepare: compose('templates', mark('tpls', () => presets('template'))), done: () => presets('template') > (at.tpls as number) }],
  },
  {
    id: 'share',
    title: 'Use Share Codes',
    blurb: 'Send a theme or template as a line of text',
    steps: [
      { target: 'theme-save', title: 'Copy a code', body: 'Right-click one of My themes or templates → Copy share code. The code holds the design only — never images or files.', prepare: compose('backgrounds', () => useUI.setState({ bgView: 'themes' })) },
      { target: 'theme-code', title: 'Import a code', body: 'Paste a code here: it is checked and previewed, and added only when you confirm.' },
    ],
  },
  {
    id: 'export',
    title: 'Export a showcase',
    blurb: 'Full-quality PNG, JPG or WebP; one page or many',
    steps: [{ target: 'export', title: 'Export', body: 'Choose format and scale, then export this page or tick several. Existing files are never overwritten unless you choose to.', prepare: () => setStage('compose'), done: () => useUI.getState().stage === 'export' }],
  },
];

// ---------------------------------------------------------------------------
// Running a tour
// ---------------------------------------------------------------------------

const useTour = create<{ id: string | null; step: number }>(() => ({ id: null, step: 0 }));

function save(id: string, step: number, done = false) {
  const p = usePrefs.getState();
  p.setPrefs({ tours: { ...p.tours, [id]: { step, done: done || !!p.tours[id]?.done } } });
}

export function startTour(id: string, from: 'start' | 'resume' = 'resume') {
  const t = TOURS.find((x) => x.id === id);
  if (!t) return;
  const saved = usePrefs.getState().tours[id];
  const step = from === 'resume' && saved && !saved.done ? Math.min(saved.step, t.steps.length - 1) : 0;
  useUI.setState({ dialog: null });
  useTour.setState({ id, step });
  t.steps[step].prepare?.();
}

export function endTour() {
  useTour.setState({ id: null, step: 0 });
}

function go(step: number) {
  const { id } = useTour.getState();
  const t = TOURS.find((x) => x.id === id);
  if (!t) return;
  if (step >= t.steps.length) {
    save(t.id, t.steps.length, true);
    endTour();
    return;
  }
  save(t.id, step);
  useTour.setState({ step });
  t.steps[step].prepare?.();
}

/** The element a step points at (a zero-size marker stands for the element after it). */
function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  let el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (el && !el.offsetWidth && !el.offsetHeight) el = el.nextElementSibling as HTMLElement | null;
  return el && el.getClientRects().length ? el : null;
}

export function TourHost() {
  const { id, step } = useTour();
  const tour = TOURS.find((t) => t.id === id);
  const s = tour?.steps[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rev = useDoc((d) => d.rev);
  const ui = useUI((u) => `${u.dialog}|${u.librarySel.length}|${u.selection.join(',')}`);
  const presetsN = usePresetStore((p) => p.list.length);

  // follow the target while the window resizes, panels open or the page scrolls
  useLayoutEffect(() => {
    if (!s) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = findTarget(s.target);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${r.x}|${r.y}|${r.width}|${r.height}` : '';
      if (key !== last) {
        last = key;
        setRect(r);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [s]);

  // move on by itself once the step is done
  useEffect(() => {
    if (!s?.done) return;
    const t = setTimeout(() => {
      if (s.done?.()) go(step + 1);
    }, 450);
    return () => clearTimeout(t);
  }, [s, step, rev, ui, presetsN]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-back')) endTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!tour || !s) return null;
  const vw = window.innerWidth,
    vh = window.innerHeight;
  // the card sits beside the target where there is room, else at the bottom right
  const W = 320;
  let pos: React.CSSProperties = { right: 24, bottom: 48 };
  if (rect) {
    const right = rect.right + 16 + W < vw - 8;
    const left = rect.left - 16 - W > 8;
    const top = Math.max(16, Math.min(vh - 220, rect.top));
    pos = right ? { left: rect.right + 16, top } : left ? { left: rect.left - 16 - W, top } : { left: Math.max(16, Math.min(vw - W - 16, rect.left)), top: rect.bottom + 16 < vh - 200 ? rect.bottom + 16 : Math.max(16, rect.top - 216) };
  }
  return (
    <>
      {rect && <div className="tour-ring" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} aria-hidden />}
      <div className="tour-card" style={{ ...pos, width: W }} role="dialog" aria-label={`Tutorial: ${tour.title}`}>
        <div className="tour-head">
          <span className="tour-kicker">
            {tour.title} · {step + 1} of {tour.steps.length}
          </span>
          <button className="icon-btn" title="Exit the tutorial (Esc) — your place is remembered" aria-label="Exit tutorial" onClick={endTour}>
            <X size={14} />
          </button>
        </div>
        <b className="tour-title">{s.title}</b>
        <p className="tour-body">{s.body}</p>
        {s.target && !rect && <p className="tour-missing">The control is hidden right now — widen the window or open the panel, or press Show again.</p>}
        <div className="tour-foot">
          <button className="btn ghost sm" disabled={step === 0} onClick={() => go(step - 1)}>
            Back
          </button>
          {s.target && !rect && (
            <button className="btn ghost sm" onClick={() => s.prepare?.()}>
              Show again
            </button>
          )}
          <span className="grow" />
          {s.done && <span className="tour-wait">Waiting for you</span>}
          <button className="btn primary sm" onClick={() => go(step + 1)}>
            {step === tour.steps.length - 1 ? 'Finish' : s.done ? 'Skip step' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}

/** For the Guide: open the New project dialog from a tutorial step without starting the tour. */
export const openNewProject = () => openDialog('newProject');
