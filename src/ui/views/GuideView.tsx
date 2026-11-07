// Guide: four long, scrollable pages (Getting started · Make it look great · Store sets & projects ·
// Reference & help). Sections carry an animated demo clip drawn live by the app (with your own icons
// when the project has some), a few plain steps, tips and buttons that take you to the feature.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, Circle, Copy, Pause, Play, RotateCcw } from 'lucide-react';
import { ALGORITHMS } from '../../layout/registry';
import { getDoc, useDoc } from '../../state/doc';
import { images } from '../../render/images';
import { armTheOne, runTheOne } from '../../state/theOne';
import { openDialog, openExport, setStage, toast, useUI, type Stage } from '../../state/ui';
import { openFolderPicker } from '../App';
import { SHORTCUTS } from '../shortcuts';
import { startTour, TOURS } from '../tour';
import { usePrefs } from '../../state/prefs';
import { completeLesson, unmarkRead } from '../../state/guideProgress';
import { buildClipEnv, CLIP_H, CLIP_W, CLIPS } from './guideClips';

interface Action {
  label: string;
  run: () => void;
  icon?: ReactNode;
}

interface Section {
  id: string;
  /** Interactive tutorial that shows this on the real interface. */
  tour?: string;
  title: string;
  summary: ReactNode;
  clip?: keyof typeof CLIPS;
  steps?: ReactNode[];
  tip?: ReactNode;
  actions?: Action[];
  extra?: ReactNode;
}

interface GuidePage {
  id: string;
  title: string;
  intro: string;
  sections: Section[];
}

const go = (stage: Stage, extra?: () => void): (() => void) => () => {
  setStage(stage);
  extra?.();
};
const K = ({ children }: { children: ReactNode }) => <span className="kbd">{children}</span>;
const leftTab = (tab: 'assets' | 'backgrounds' | 'elements' | 'templates') => go('compose', () => (usePrefs.getState().setPrefs({ leftCollapsed: false }), useUI.setState({ leftTab: tab, ...(tab === 'backgrounds' ? { bgView: 'backgrounds' as const } : {}) })));

export const RENAME_PROMPT = `You are organizing a folder of game-asset images for "Icon Forge Showcase". Showcase reads categories, labels and order ONLY from folder and file names.

TARGET STRUCTURE (one pack = one root folder, ONE level of category folders):
  <Pack_Name>/
      01_<Category_Name>/
          01_<asset_name>.png
          02_<asset_name>.png
      02_<Category_Name>/
          01_<asset_name>.png

RULES
- Pack folder: 1–3 plain words ("Halloween", "Fantasy_Weapons"). Do NOT include "Pack", "Asset Pack", "Icons" or "Set" — the templates add those words.
- Category = the folder directly containing the file. A leading "01_" is removed and "_" becomes a space, capitalisation is kept → name folders in Title_Case ("02_Cute_Monsters" → "Cute Monsters").
- Exactly one level of category folders. Files in the pack root get no category; deeper folders make the deepest folder the category.
- File names: NN_descriptive_name.ext — lowercase words joined by "_", describing what the object is (1–4 words). "03_evil_pumpkin.png" shows as "Evil Pumpkin". No filler words (icon, final, copy, v2, png, 1024).
- Only a–z, 0–9 and "_". Keep the original extension (lowercase). Never change pixels or formats.
- Number items from 01 inside each category (two digits; three if more than 99). Names unique across the whole pack.
- Reuse common category names across packs (Characters, Weapons, Potions, Currency, UI, Props, Rewards…) so "Replace Asset Set" can match them.
- Aim for 4–15 categories of about 5–30 assets; merge tiny ones, split huge ones.
- Keep OUT of the pack folder (put them in sibling folders): backgrounds ("<Pack>_backgrounds"), decorative overlays ("<Pack>_elements"), fonts, previews, PSDs and other sources, text/license files.

PROCESS
1. Back up the folder (or write a rename log first). Never overwrite a file; on a name clash change the new name.
2. Propose the full mapping (old path → new path, category, display label) before applying.
3. Apply, then write rename_log.csv next to (not inside) the pack folder: old_path,new_path,category,display_label.
4. Report counts per category, excluded files and anything uncertain.`;

function LayoutTable() {
  const groups = ['Showcase', 'Organize', 'Perspective'] as const;
  return (
    <div className="guide-table">
      {groups.map((g) => (
        <div key={g} className="guide-table-group">
          <div className="guide-table-head">{g}</div>
          {ALGORITHMS.filter((a) => a.group === g).map((a) => (
            <div key={a.id} className="guide-table-row">
              <b>{a.label}</b>
              <span>{a.description}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ShortcutTable() {
  return (
    <div className="guide-table">
      {SHORTCUTS.map(([k, v]) => (
        <div key={k} className="guide-table-row">
          <span className="kbd">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

const FAQ: [string, ReactNode][] = [
  ['I press Shuffle and nothing moves.', <>The random settings (position, scale, rotation…) are all at 0, so a new seed has nothing to change. Raise one of them in the Layout tab, or press <b>Reorganize</b> to swap icons around.</>],
  ['Icons overlap or touch the edges.', <>In the Layout tab set <b>Rules → Overlap</b> to <b>Strict</b>, lower <b>Size</b> or <b>Asset scale</b>, or raise <b>Gap</b> / <b>Outer padding</b>.</>],
  ['The last row of my grid is half empty.', <>Turn on <b>Complete rectangle</b> in the Grid settings — every row gets the same number of icons.</>],
  ['My layout disappeared when I changed page.', <>Each page keeps its own layout; open the <b>Layout</b> tab and it shows that page's layout. The eye button only hides the guides on the canvas.</>],
  ['My exported file got “_2” at the end.', <>A file with that name already existed, and nothing is ever overwritten by default. Choose <b>If file exists → Replace</b> in Export to overwrite instead.</>],
  ['The text shows {count} instead of a number.', <>In the text box you see the token; on the canvas and in the export it becomes your number of icons.</>],
  ['Icons look blurry in the export.', <>Export at <b>2×</b>, check <b>Review</b> for “upscaled” warnings, and use source images at least as large as they appear on the page.</>],
  ['Where are my projects saved?', <>Automatically on this computer. <b>File → Save</b> (<K>Ctrl</K>+<K>S</K>) writes a <code>.showcase</code> file you can back up or move to another PC.</>],
  ['How do I start fresh?', <>File → New project (<K>Ctrl</K>+<K>N</K>), or File → Close project to put the current one away. Your projects stay in Home → Recent projects and File → Projects.</>],
];

const PAGES: GuidePage[] = [
  {
    id: 'tutorials',
    title: 'Interactive tutorials',
    intro: 'Each tutorial opens the right place, outlines the control to use and moves on when you have done the step. Leave at any time with Esc; your place is remembered.',
    sections: [{ id: 'tutorials', title: 'Tutorials', summary: '', extra: <TutorialList /> }],
  },
  {
    id: 'start',
    title: 'Getting started',
    intro: 'From a folder of icons to a finished thumbnail in five steps. Scroll down — each step has a short clip.',
    sections: [
      {
        id: 'import',
        tour: 'import',
        title: 'Bring in your icons',
        summary: 'Point the app at the folder with your icons. Nothing is uploaded — it all stays on your computer.',
        clip: 'import',
        steps: [
          <>
            <b>File → Import folder</b>, or drag the folder onto the window.
          </>,
          <>Sub-folders become categories automatically (“01_Fish” → “Fish”).</>,
          <>
            The <b>Import</b> workspace (in the sidebar) lets you rename categories, move icons between them and spot broken files.
          </>,
          <>With no project open, importing starts a new project for the icons.</>,
        ],
        tip: <>Transparent PNGs work best — empty space around each icon is ignored when arranging.</>,
        actions: [
          { label: 'Import a folder', run: () => (setStage('import'), openFolderPicker()) },
          { label: 'Open Import', run: go('import') },
        ],
      },
      {
        id: 'arrange',
        tour: 'add-icons',
        title: 'Arrange them in one click',
        summary: 'A layout places every icon for you. Switch as often as you like — nothing is lost.',
        clip: 'arrange',
        steps: [
          <>
            In <b>Compose</b>, press <b>Add all</b> (bottom of the left panel) to put every icon on the page.
          </>,
          <>
            Open the <b>Layout</b> tab on the right and click a preview — they already show your icons.
          </>,
          <>Use the sliders to fine-tune size, gaps and padding; the page updates live.</>,
          <>
            <b>Icons ▸ Choose…</b> in the Layout tab picks which icons the layout uses: all, some categories, a hand-picked set or a random subset.
          </>,
        ],
        tip: <>Drag any icon by hand and it stays put (it gets “pinned”) when you change settings.</>,
        actions: [{ label: 'Open the Layout tab', run: go('arrange') }],
      },
      {
        id: 'title',
        tour: 'text',
        title: 'Add a title and a badge',
        summary: 'Ready-made titles and badges look good immediately — just change the words.',
        clip: 'title',
        steps: [
          <>
            Left panel → <b>Elements</b> → click a title or badge.
          </>,
          <>Double-click the text on the page to type your own words.</>,
          <>
            Right panel → <b>Focal safe region → Around text</b>: the icons move out of the way.
          </>,
        ],
        tip: (
          <>
            Type <code>{'{count}'}</code> in any text and it always shows how many icons you have.
          </>
        ),
        actions: [{ label: 'Open Elements', run: leftTab('elements') }],
      },
      {
        id: 'background',
        tour: 'backgrounds',
        title: 'Pick a background',
        summary: 'Plain colours, soft gradients, patterns and glows — one click each.',
        clip: 'background',
        steps: [
          <>
            Left panel → <b>Backgrounds</b> → click a swatch or style.
          </>,
          <>Click an empty spot on the page to adjust colours, pattern, spotlight or vignette on the right.</>,
          <>
            Or pick a <b>Theme</b> (sidebar → Themes): it sets the background and restyles the title, subtitle and badges in one click. Themes never move or change your icons, layout or words.
          </>,
        ],
        actions: [{ label: 'Open Backgrounds', run: leftTab('backgrounds') }],
      },
      {
        id: 'export',
        tour: 'export',
        title: 'Export the image',
        summary: 'Save a full-quality PNG, JPG or WebP. Files are never overwritten by accident.',
        clip: 'export',
        steps: [
          <>
            Press <b>Export</b> (top right) or <K>Ctrl</K>+<K>E</K>. The Export workspace opens with the page you are working on selected.
          </>,
          <>Tick the pages to export on the left. On the right choose a preset or the format, size and file names ({'{project}'}, {'{page}'}, {'{date}'}…).</>,
          <>Check the preview: scroll to zoom, drag to look around, 100% shows real pixels.</>,
          <>
            Press <b>Export</b>. One page asks where to save; several go to a folder or a ZIP. This lesson completes when a file is saved.
          </>,
        ],
        tip: <>For itch.io: the cover is 630×500. Use the “itch.io Cover” template or that canvas size.</>,
        actions: [{ label: 'Open Export', run: () => openExport() }],
      },
    ],
  },
  {
    id: 'look',
    title: 'Make it look great',
    intro: 'Everything about layouts, text, shapes and backgrounds.',
    sections: [
      {
        id: 'layouts',
        title: 'All the layouts',
        summary: 'Showcase layouts are for thumbnails and banners, Organize layouts for tidy grids, Perspective for a 3D floor or wall.',
        steps: [
          <>Click the layout name at the top of the Layout tab to see every layout as a preview.</>,
          <>Hover a preview and click ☆ to favourite it — favourites stay at the top.</>,
          <>To lay out only some icons separately, select them on the canvas first; the page can hold several layouts.</>,
        ],
        extra: <LayoutTable />,
        actions: [{ label: 'Open the Layout tab', run: go('arrange') }],
      },
      {
        id: 'shuffle',
        title: 'Shuffle, Reorganize and seeds',
        summary: 'Random layouts are repeatable: the seed number decides the arrangement.',
        clip: 'shuffle',
        steps: [
          <>
            <b>Shuffle</b> (<K>Ctrl</K>+<K>R</K>) picks a new seed → new positions. ◀ ▶ step through seeds one by one.
          </>,
          <>
            <b>Recent</b> seeds appear under the seed box — click one to go back to an arrangement you liked.
          </>,
          <>
            <b>Reorganize</b> keeps the spots but swaps which icon sits where. <b>Reset</b> restores the layout's default settings.
          </>,
        ],
        tip: <>The random sliders (position, scale, rotation) are at the top of the Layout tab. At 0, icons stay perfectly upright and aligned.</>,
      },
      {
        id: 'grids',
        title: 'Perfect grids',
        summary: 'For catalog-style images where every icon lines up.',
        steps: [
          <>
            Choose <b>Grid</b>, then turn on <b>Complete rectangle</b> — no half-empty last row (216 icons → 18 × 12).
          </>,
          <>Set Columns/Rows yourself, or leave them on Auto. Gaps and Outer padding control the spacing.</>,
          <>
            <b>Feature Grid</b> puts one big icon in the middle; <b>Category Blocks</b> makes one block per folder.
          </>,
        ],
      },
      {
        id: 'text',
        tour: 'text',
        title: 'Text effects and badges',
        summary: 'Titles can have gradients, two outlines, 3D depth, glow, a shadow and a curve.',
        clip: 'textfx',
        steps: [
          <>Select the text → right panel → Fill, Effects and Badge sections.</>,
          <>
            <b>Badge</b> puts the text on a shape: pill, starburst, ribbon, price tag, stamp…
          </>,
          <>
            <b>Curve</b> bends the text into an arch. <b>Save current style</b> reuses a look later.
          </>,
        ],
        tip: <>Presets scale to the page size, so they look right on a 630×500 cover and a 4K banner alike.</>,
        actions: [{ label: 'Open Elements', run: leftTab('elements') }],
      },
      {
        id: 'shapes',
        title: 'Shapes and ready-made pieces',
        summary: 'Panels, glows, frames and simple shapes to frame your icons.',
        steps: [
          <>
            Elements → <b>Shapes</b>: rectangle, circle, star, burst, heart, arrow and more.
          </>,
          <>
            Elements → <b>Ready-made</b>: Title panel, Soft glow, Floor shadow, Frame, Colour band, Divider.
          </>,
          <>Select a shape to change fill, gradient, outline, corner radius and soft edges.</>,
        ],
        actions: [{ label: 'Open Elements', run: leftTab('elements') }],
      },
      {
        id: 'focal',
        title: 'Keep the title area clear',
        summary: 'The focal safe region is an area layouts avoid. It is a guide only — never exported.',
        steps: [
          <>
            Right panel (click empty canvas) → <b>Focal safe region</b> → <b>Around text</b>, Center, Top band…
          </>,
          <>Adjust its size and position with the sliders, or draw it with the focal tool (F).</>,
          <>
            <b>Layouts avoid it</b> switches avoidance on for every layout on the page.
          </>,
        ],
      },
      {
        id: 'bg-more',
        tour: 'backgrounds',
        title: 'Backgrounds in depth',
        summary: 'Solid colours, simple gradients, bold gradients, mesh blends, patterns and spotlights.',
        steps: [
          <>The rainbow swatch picks any colour.</>,
          <>Patterns (rays, dots, stars, confetti, grain…) and the Spotlight can be added on top of any background.</>,
          <>
            <b>Save as style</b> keeps a background for later; your own images go in <b>Your images</b>.
          </>,
        ],
        actions: [{ label: 'Open Backgrounds', run: leftTab('backgrounds') }],
      },
    ],
  },
  {
    id: 'sets',
    title: 'Store sets & projects',
    intro: 'Several images at once, templates, pages and managing your projects.',
    sections: [
      {
        id: 'storeset',
        title: 'A whole store page set',
        summary: 'Hero banner, square cover, numbered catalog and a page per category — together.',
        clip: 'storeset',
        steps: [
          <>
            Home → <b>Generate pages</b> → <b>Complete store set</b>, or <b>Custom store set…</b> to choose pages and sizes.
          </>,
          <>Every result is a normal page: click it in the strip at the bottom to edit.</>,
          <>Export them all: in the Export workspace tick every page and press Export.</>,
        ],
        actions: [
          {
            label: 'Build a store set',
            run: () => {
              if (getDoc().assets.some((a) => a.kind === 'asset')) void runTheOne();
              else {
                armTheOne();
                setStage('import');
                openFolderPicker();
              }
            },
          },
        ],
      },
      {
        id: 'catalog',
        title: 'Catalogs',
        summary: 'Every icon numbered and labelled, grouped by category.',
        clip: 'catalog',
        steps: [
          <>
            Home → <b>Generate pages</b> → <b>Catalog…</b>. The window shows a live preview.
          </>,
          <>Pick a style (Dark, Cards, Clean, Light, Outline), a background and the page size.</>,
          <>“Per page” splits big packs over several pages.</>,
        ],
        actions: [{ label: 'Catalog…', run: () => openDialog('catalog') }],
      },
      {
        id: 'templates',
        tour: 'template',
        title: 'Templates',
        summary: 'Ready layouts with title text, for itch.io covers, banners, square covers and more.',
        steps: [
          <>
            <b>New project</b> → Templates: starts a separate project from a template.
          </>,
          <>
            Home → <b>Generate pages</b> → <b>Preview templates with my assets</b> shows every template filled with your icons.
          </>,
          <>
            Inside a project, left panel → <b>Templates</b> adds a page from a template; <b>Save page as template</b> reuses your own design.
          </>,
        ],
        actions: [{ label: 'New project…', run: () => openDialog('newProject') }],
      },
      {
        id: 'pages',
        title: 'Pages',
        summary: 'A project can hold many pages (images) that share the same icons.',
        steps: [
          <>The strip at the bottom lists pages: click to open, double-click to rename, drag to reorder.</>,
          <>Ctrl-click or Shift-click to pick several: duplicate, export or delete them together, and themes and backgrounds from the library apply to all of them.</>,
          <>Right-click a page to duplicate, export or delete it; File → New page / Duplicate page work too.</>,
          <>Each page keeps its own size, background, text and layout.</>,
        ],
      },
      {
        id: 'projects',
        tour: 'first-project',
        title: 'Projects',
        summary: 'Everything saves automatically. Projects live on this computer.',
        steps: [
          <>
            <b>Home → Recent projects</b> (as a compact list, a grid or hidden) and <b>File → Projects</b> (<K>Ctrl</K>+<K>O</K>): search, sort, open, rename, duplicate or delete.
          </>,
          <>
            <b>File → Close project</b> saves and closes it; it stays in Recent projects. Deleting the open project closes it too, and nothing new is created.
          </>,
          <>
            <b>New project</b> starts with no assets. Choose <b>Reuse assets from a project</b> to copy icons from any saved project; that project does not change.
          </>,
          <>Pin a project to keep it at the top; Ctrl-click cards to select several and delete them together.</>,
          <>
            <b>File → Save</b> writes a portable <code>.showcase</code> file with all images inside.
          </>,
        ],
        actions: [{ label: 'Open Projects', run: () => openDialog('projects') }],
      },
      {
        id: 'replace',
        title: 'Next pack, same design',
        summary: 'Reuse a finished design for a different pack.',
        steps: [<>Left panel → Templates → <b>Replace Asset Set…</b> swaps every icon for the new pack and keeps layout, text and background.</>],
        actions: [{ label: 'Replace asset set…', run: () => openDialog('replaceSet') }],
      },
    ],
  },
  {
    id: 'help',
    title: 'Reference & help',
    intro: 'Answers to common questions, review & export details, folder tips and all shortcuts.',
    sections: [
      {
        id: 'faq',
        title: 'Common questions',
        summary: 'Click a question to see the answer.',
        extra: (
          <div className="guide-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  <ChevronDown size={14} /> {q}
                </summary>
                <div>{a}</div>
              </details>
            ))}
          </div>
        ),
      },
      {
        id: 'review',
        title: 'Review before exporting',
        summary: 'See the page like your buyers will.',
        steps: [
          <>
            The <b>Review</b> workspace shows the page without guides, at real and thumbnail sizes and as a store card.
          </>,
          <>The warnings list finds icons outside the page, hidden or tiny icons and blurry upscales — click one to jump to it.</>,
        ],
        actions: [{ label: 'Open Review', run: go('review') }],
      },
      {
        id: 'export-more',
        title: 'Export options',
        summary: 'Formats, sizes and file names.',
        steps: [
          <>PNG keeps transparency, WebP is small with transparency, JPG is smallest without it.</>,
          <>1× is the page size; 2× and 4× make larger files for crisp results; Custom sets an exact width.</>,
          <>Name tokens: {'{project}'}, {'{page}'}, {'{index}'}, {'{w}'}, {'{h}'}, {'{date}'}, {'{time}'}.</>,
        ],
      },
      {
        id: 'folder',
        title: 'Prepare your folder',
        summary: 'A tidy folder means categories, labels and order are right automatically.',
        steps: [
          <>One folder per pack, with numbered category folders inside.</>,
          <>Name files like “03_evil_pumpkin.png” — it shows as “Evil Pumpkin”.</>,
          <>Keep backgrounds and source files in a separate folder.</>,
        ],
        extra: (
          <pre className="guide-pre">{`Halloween/
    01_Characters/
        01_ghost.png
        02_skeleton.png
    02_Weapons/
        01_scythe.png`}</pre>
        ),
        actions: [
          {
            label: 'Copy AI renaming prompt',
            icon: <Copy size={12} />,
            run: () =>
              void navigator.clipboard
                .writeText(RENAME_PROMPT)
                .then(() => toast('Renaming prompt copied — paste it into an AI file assistant', 'success'))
                .catch(() => toast('Could not access the clipboard', 'error')),
          },
        ],
      },
      {
        id: 'keys',
        title: 'Keyboard shortcuts',
        summary: 'You never need these, but they make things quicker.',
        extra: <ShortcutTable />,
      },
    ],
  },
];

/** Which page holds a section (links from Home point at sections). */
const LINK_TO_PAGE: Record<string, string> = Object.fromEntries(PAGES.flatMap((p) => p.sections.map((s) => [s.id, p.id])));

// ---------------------------------------------------------------------------
// clip player (only animates while on screen)
// ---------------------------------------------------------------------------

function GuideClip({ id }: { id: keyof typeof CLIPS }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const assetIds = useDoc((s) => s.doc.assets.filter((a) => a.kind === 'asset').map((a) => a.id).join('|'));
  const env = useMemo(() => {
    const ids = assetIds ? assetIds.split('|') : [];
    const previews = ids.map((i) => images.previews.get(i)).filter((b): b is ImageBitmap => !!b);
    return buildClipEnv(previews, ids.length);
  }, [assetIds]);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [playing, setPlaying] = useState(!reduced);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const time = useRef(reduced ? CLIPS[id].duration * 0.75 : 0);
  const clip = CLIPS[id];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== CLIP_W * dpr) {
      c.width = CLIP_W * dpr;
      c.height = CLIP_H * dpr;
    }
    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, CLIP_W, CLIP_H);
      try {
        clip.draw(ctx, time.current, env);
      } catch {
        /* a demo frame must never break the guide */
      }
    };
    paint();
    if (!visible) return;
    let raf = 0,
      last = performance.now(),
      lastUi = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing) time.current = (time.current + dt) % clip.duration;
      paint();
      if (now - lastUi > 100) {
        lastUi = now;
        setProgress(time.current / clip.duration);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [clip, env, playing, visible]);
  return (
    <div className="clip" ref={box}>
      <canvas ref={ref} className="clip-canvas" style={{ aspectRatio: `${CLIP_W} / ${CLIP_H}` }} onClick={() => setPlaying(!playing)} />
      <div className="clip-bar">
        <button className="clip-btn" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          className="clip-btn"
          title="Replay"
          aria-label="Replay"
          onClick={() => {
            time.current = 0;
            setPlaying(true);
          }}
        >
          <RotateCcw size={13} />
        </button>
        <div
          className="clip-track"
          role="slider"
          aria-label="Position"
          aria-valuenow={Math.round(progress * 100)}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            time.current = Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)) * clip.duration;
          }}
        >
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="clip-time">
          0:{String(Math.floor(progress * clip.duration)).padStart(2, '0')} / 0:{String(clip.duration).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

function TutorialList() {
  const progress = usePrefs((p) => p.tours);
  return (
    <div className="tut-list">
      {TOURS.map((t) => {
        const p = progress[t.id];
        const state = p?.done ? 'Done' : p && p.step > 0 ? `Step ${p.step + 1} of ${t.steps.length}` : `${t.steps.length} step${t.steps.length === 1 ? '' : 's'}`;
        return (
          <div key={t.id} className="tut-row">
            {p?.done ? <CheckCircle2 size={16} className="tut-done" /> : <span className="tut-dot" />}
            <span className="grow">
              <b>{t.title}</b>
              <small>{t.blurb}</small>
            </span>
            <span className="tut-state mono">{state}</span>
            {p && !p.done && p.step > 0 ? (
              <>
                <button className="btn ghost sm" onClick={() => startTour(t.id, 'start')} title="Start again from the first step">
                  <RotateCcw size={13} />
                </button>
                <button className="btn sm primary" onClick={() => startTour(t.id, 'resume')}>
                  Resume
                </button>
              </>
            ) : (
              <button className={`btn sm ${p?.done ? '' : 'primary'}`} onClick={() => startTour(t.id, 'start')}>
                {p?.done ? 'Again' : 'Start'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Lessons that complete when you do them in the app; every other lesson is read and marked as read. */
const DOES: Record<string, string> = {
  import: 'import icons',
  arrange: 'apply a layout',
  title: 'add a text to a page',
  background: 'change a page background or apply a theme',
  export: 'export an image',
  storeset: 'generate a store set',
  catalog: 'generate a catalog',
  templates: 'create a page from a template',
  pages: 'add a page',
  projects: 'create a project',
};

/** Pages with lessons (the tutorials list is a launcher, not a lesson). */
const LESSON_PAGES = PAGES.filter((p) => p.id !== 'tutorials');
const LESSONS = LESSON_PAGES.flatMap((p) => p.sections.map((s) => ({ page: p.id, s })));

function useProgress() {
  return usePrefs((p) => p.guideProgress);
}

function SectionBlock({ s, n, next, onNext }: { s: Section; n: number; next: string | null; onNext: () => void }) {
  const progress = useProgress();
  const done = progress[s.id];
  const action = DOES[s.id];
  return (
    <section className={`gsec ${done ? 'is-done' : ''}`} id={`g-${s.id}`}>
      <div className="gsec-head">
        <span className={`gsec-n ${done ? 'done' : ''}`} aria-hidden>
          {done ? <CheckCircle2 size={16} /> : n}
        </span>
        <h3>{s.title}</h3>
        {done && <span className="gsec-state">{done.how === 'action' ? 'Done' : 'Read'}</span>}
      </div>
      <p className="guide-summary">{s.summary}</p>
      {s.clip && <GuideClip id={s.clip} />}
      {s.steps && (
        <ol className="guide-howto">
          {s.steps.map((st, i) => (
            <li key={i}>
              <span className="num">{i + 1}</span>
              <span>{st}</span>
            </li>
          ))}
        </ol>
      )}
      {s.extra}
      {s.tip && (
        <div className="guide-tip">
          <b>Tip</b> {s.tip}
        </div>
      )}
      {(s.actions || s.tour) && (
        <div className="row wrap guide-actions">
          {s.tour && (
            <button className="btn primary" onClick={() => startTour(s.tour!, 'start')} title="An interactive tutorial on the real interface">
              <Play size={13} /> Show me how
            </button>
          )}
          {s.actions?.map((a) => (
            <button key={a.label} className="btn" onClick={a.run}>
              {a.icon ?? <ArrowRight size={13} />} {a.label}
            </button>
          ))}
        </div>
      )}
      <div className="gsec-foot">
        {action ? (
          <span className={`gsec-status ${done ? 'done' : ''}`}>
            {done ? (
              <>
                <CheckCircle2 size={14} /> Done: you did this on {new Date(done.at).toLocaleDateString()}.
              </>
            ) : (
              <>
                <Circle size={14} /> Completes when you {action}.
              </>
            )}
          </span>
        ) : done ? (
          <span className="gsec-status done">
            <CheckCircle2 size={14} /> Marked as read.
            <button className="btn ghost sm" onClick={() => unmarkRead(s.id)}>
              Undo
            </button>
          </span>
        ) : (
          <button className="btn sm" onClick={() => completeLesson(s.id, 'read')}>
            <Check size={13} /> Mark as read
          </button>
        )}
        <span className="grow" />
        {next && (
          <button className="btn ghost sm" onClick={onNext}>
            Next: {next} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </section>
  );
}

/** End of the Guide: what is left, or a finished message with somewhere to go next. */
function GuideFinish({ goTo }: { goTo: (pageId: string, sectionId: string) => void }) {
  const progress = useProgress();
  const open = useDoc((s) => s.open);
  const left = LESSONS.filter((l) => !progress[l.s.id]);
  if (left.length)
    return (
      <div className="guide-finish">
        <b>
          {LESSONS.length - left.length} of {LESSONS.length} lessons complete
        </b>
        <span className="muted">
          {left.length} left: {left.slice(0, 3).map((l) => l.s.title).join(', ')}
          {left.length > 3 ? ` and ${left.length - 3} more` : ''}.
        </span>
        <div className="row">
          <button className="btn primary" onClick={() => goTo(left[0].page, left[0].s.id)}>
            Next unfinished lesson <ArrowRight size={13} />
          </button>
          <button className="btn ghost" onClick={() => setStage('home')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  return (
    <div className="guide-finish complete" role="status">
      <CheckCircle2 size={20} />
      <b>You have finished the Guide</b>
      <span className="muted">All {LESSONS.length} lessons are complete. The Guide stays here for reference (F1).</span>
      <div className="row">
        {open ? (
          <button className="btn primary" onClick={() => setStage('compose')}>
            Continue working <ArrowRight size={13} />
          </button>
        ) : (
          <button className="btn primary" onClick={() => openDialog('newProject')}>
            New project <ArrowRight size={13} />
          </button>
        )}
        <button className="btn ghost" onClick={() => setStage('home')}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

export function GuideView() {
  const progress = useProgress();
  const initialLink = useRef(useUI.getState().guideLesson);
  const [pageId, setPageId] = useState(() => LINK_TO_PAGE[initialLink.current ?? ''] ?? PAGES[0].id);
  const [activeSec, setActiveSec] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  // a link into the guide is used once
  useEffect(() => useUI.setState({ guideLesson: null }), []);
  const page = PAGES.find((p) => p.id === pageId)!;
  const idx = PAGES.indexOf(page);
  const nDone = LESSONS.filter((l) => progress[l.s.id]).length;

  const scrollTo = (id: string, behavior: ScrollBehavior = 'smooth') => {
    const root = body.current,
      el = document.getElementById(`g-${id}`);
    if (root && el) root.scrollTo({ top: root.scrollTop + el.getBoundingClientRect().top - root.getBoundingClientRect().top - 12, behavior });
    setActiveSec(id);
  };
  /** Open a lesson: its page, scrolled to it. */
  const goTo = (pid: string, sid: string) => {
    if (pid === pageId) return scrollTo(sid);
    pending.current = sid;
    setPageId(pid);
  };
  // jump to the linked (or requested) section once, otherwise start at the top of the page
  useEffect(() => {
    const target = pending.current ?? initialLink.current;
    pending.current = null;
    initialLink.current = null;
    if (target && page.sections.some((s) => s.id === target)) setTimeout(() => scrollTo(target, 'auto'), 30);
    else body.current?.scrollTo({ top: 0 });
    setActiveSec(target && page.sections.some((s) => s.id === target) ? target : page.sections[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, page]);
  // the lesson list follows the scroll position; at the very bottom the last lesson is the current one
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const onScroll = () => {
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) return setActiveSec(page.sections[page.sections.length - 1].id);
      let cur = page.sections[0].id;
      const top = root.getBoundingClientRect().top;
      for (const s of page.sections) {
        const el = document.getElementById(`g-${s.id}`);
        if (el && el.getBoundingClientRect().top - top < 160) cur = s.id;
      }
      setActiveSec(cur);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [page]);

  /** The lesson after `id` (on this page or the next lesson page). */
  const nextOf = (i: number): { page: string; s: Section } | null => {
    const at = LESSONS.findIndex((l) => l.s.id === page.sections[i].id);
    return at >= 0 && at < LESSONS.length - 1 ? LESSONS[at + 1] : null;
  };

  return (
    <div className="guide">
      <aside className="guide-nav" aria-label="Guide lessons">
        <div className="guide-nav-head">
          <b>Guide</b>
          <span className="muted small" aria-live="polite">
            {nDone} of {LESSONS.length} lessons complete
          </span>
          <div className="guide-progress" aria-hidden>
            <div style={{ width: `${(nDone / LESSONS.length) * 100}%` }} />
          </div>
        </div>
        {PAGES.map((p, i) => {
          const lessons = p.id === 'tutorials' ? [] : p.sections;
          const pd = lessons.filter((x) => progress[x.id]).length;
          return (
            <div key={p.id} className={`guide-page ${p.id === pageId ? 'on' : ''}`}>
              <button className="guide-ch" onClick={() => setPageId(p.id)} aria-current={p.id === pageId ? 'page' : undefined}>
                <span className="n">{lessons.length && pd === lessons.length ? <CheckCircle2 size={12} /> : i + 1}</span>
                <span className="grow">{p.title}</span>
                {lessons.length > 0 && (
                  <span className="guide-ch-count mono">
                    {pd}/{lessons.length}
                  </span>
                )}
              </button>
              {p.id === pageId && (
                <div className="guide-toc">
                  {p.sections.map((x) => {
                    const d = p.id !== 'tutorials' && progress[x.id];
                    return (
                      <button key={x.id} className={`${activeSec === x.id ? 'on' : ''} ${d ? 'done' : ''}`} aria-current={activeSec === x.id ? 'location' : undefined} onClick={() => scrollTo(x.id)} title={d ? (d.how === 'action' ? 'Done' : 'Read') : DOES[x.id] ? `Completes when you ${DOES[x.id]}` : 'Not read yet'}>
                        {p.id === 'tutorials' ? null : d ? <CheckCircle2 size={12} className="toc-done" aria-label="Complete" /> : <Circle size={12} className="toc-todo" aria-label="Not complete" />}
                        {x.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </aside>
      <div className="guide-body" ref={body}>
        <div className="guide-lesson">
          <div className="guide-kicker">
            Page {idx + 1} of {PAGES.length}
          </div>
          <h2>{page.title}</h2>
          <p className="guide-summary">{page.intro}</p>
          {page.id === 'tutorials'
            ? page.sections.map((x) => (
                <section key={x.id} className="gsec" id={`g-${x.id}`}>
                  {x.extra}
                </section>
              ))
            : page.sections.map((x, i) => {
                const nx = nextOf(i);
                return <SectionBlock key={x.id} s={x} n={i + 1} next={nx ? nx.s.title : null} onNext={() => nx && goTo(nx.page, nx.s.id)} />;
              })}
          {idx === PAGES.length - 1 && <GuideFinish goTo={goTo} />}
          <div className="guide-pager">
            {idx > 0 ? (
              <button className="btn ghost" onClick={() => setPageId(PAGES[idx - 1].id)}>
                ← {PAGES[idx - 1].title}
              </button>
            ) : (
              <span />
            )}
            {idx < PAGES.length - 1 ? (
              <button className="btn primary" onClick={() => setPageId(PAGES[idx + 1].id)}>
                Next page: {PAGES[idx + 1].title} →
              </button>
            ) : (
              <button className="btn ghost" onClick={() => setStage('home')}>
                Back to Home
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
