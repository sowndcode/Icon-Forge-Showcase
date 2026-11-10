// Settings (Preferences): categories on the left, options on the right — General, Appearance,
// Canvas & guides, Layouts, Export defaults, Storage, Shortcuts and About.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check as CheckIcon, Copy, Download, FolderOpen, Gauge, Info, Keyboard, LayoutGrid, Magnet, Palette, RotateCcw, Save, Search, Settings2, HardDrive, Stamp, X } from 'lucide-react';
import { CANVAS_PRESETS, FONT_FAMILIES } from '../../core/defaults';
import type { ExportFormat } from '../../core/types';
import { WATERMARK_PRESETS } from '../../core/watermark';
import { native, type TrashedProject } from '../../services/native';
import { humanBytes } from '../../services/formats';
import { ACCENTS, GUIDE_COLORS, resetPrefs, usePrefs, type AccentId, type Prefs } from '../../state/prefs';
import { deleteManyNote, deleteLabel, deletedToast, deleteStoredProjects, listProjects } from '../../state/project';
import { openDialog, setStage, toast } from '../../state/ui';
import { Modal, NumberField, Seg, Slider, Toggle } from '../components/controls';
import { SHORTCUTS } from '../shortcuts';
import { askConfirm } from '../components/ask';
import { AppIcon } from '../Shell';
import { Keys } from '../components/Keys';
import { middleTruncate } from '../components/paths';
import { APP_VERSION } from '../../version';

type Cat = 'general' | 'projects' | 'appearance' | 'canvas' | 'layouts' | 'watermark' | 'export' | 'performance' | 'storage' | 'shortcuts' | 'about';

/** Categories; `keys` are the settings a section reset restores (favourites and the like are kept). */
const CATS: { id: Cat; label: string; icon: typeof Palette; keys?: (keyof Prefs)[] }[] = [
  { id: 'general', label: 'General', icon: Settings2, keys: ['newProjectSize', 'templateTarget', 'smartTemplates', 'defaultFont', 'quickStartDismissed'] },
  { id: 'projects', label: 'Projects & autosave', icon: Save, keys: ['startScreen', 'autosaveDelay'] },
  { id: 'appearance', label: 'Appearance', icon: Palette, keys: ['theme', 'accent', 'pasteboard', 'uiScale', 'thumbSize'] },
  { id: 'canvas', label: 'Canvas & guides', icon: Magnet, keys: ['snap', 'guideColor', 'nudge', 'overlays', 'pixelIcons'] },
  { id: 'layouts', label: 'Layouts', icon: LayoutGrid, keys: ['autoPin', 'addWithLayout', 'alignVisible', 'floorAdaptive', 'gridMaxCell'] },
  { id: 'watermark', label: 'Watermark defaults', icon: Stamp, keys: ['wmDefaults'] },
  { id: 'export', label: 'Export defaults', icon: Download, keys: ['exportSettings'] },
  { id: 'performance', label: 'Performance', icon: Gauge, keys: ['historyLimit', 'reduceMotion'] },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

/** The search text (lower case); empty when not searching or when the enclosing group matched. */
const SearchCtx = createContext('');
const hits = (text: string, q: string) => q.split(/\s+/).every((w) => text.toLowerCase().includes(w));

/** One setting: label + description on the left, control on the right. */
function Row({ label, hint, keywords = '', children }: { label: string; hint?: ReactNode; keywords?: string; children: ReactNode }) {
  const q = useContext(SearchCtx);
  if (q && !hits(`${label} ${typeof hint === 'string' ? hint : ''} ${keywords}`, q)) return null;
  return (
    <div className="set-row">
      <div className="set-label">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const q = useContext(SearchCtx);
  const match = !!q && hits(title, q);
  return (
    <div className={`set-group ${match ? 'match' : ''}`}>
      <div className="set-group-title">{title}</div>
      <SearchCtx.Provider value={match ? '' : q}>{children}</SearchCtx.Provider>
    </div>
  );
}

function CatBody({ id, onClose }: { id: Cat; onClose: () => void }) {
  switch (id) {
    case 'general':
      return <General />;
    case 'projects':
      return <ProjectSettings />;
    case 'appearance':
      return <Appearance />;
    case 'canvas':
      return <CanvasSettings />;
    case 'layouts':
      return <LayoutSettings />;
    case 'watermark':
      return <WatermarkDefaults onClose={onClose} />;
    case 'export':
      return <ExportDefaults />;
    case 'performance':
      return <Performance />;
    case 'storage':
      return <Storage onClose={onClose} />;
    case 'shortcuts':
      return <Shortcuts />;
    case 'about':
      return <About />;
  }
}

/** "Reset this section": restores only the settings listed for the category. */
function SectionReset({ cat }: { cat: (typeof CATS)[number] }) {
  if (!cat.keys) return null;
  return (
    <div className="set-section-reset">
      <button
        className="btn ghost sm"
        onClick={async () => {
          if (!(await askConfirm({ title: `Reset ${cat.label}?`, message: 'Only the settings in this section go back to their defaults. Projects, presets and favourites are not touched.', okLabel: 'Reset section' }))) return;
          resetPrefs(cat.keys);
          toast(`${cat.label} reset`, 'success');
        }}
      >
        <RotateCcw size={13} /> Reset this section
      </button>
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState<Cat>('general');
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  // Ctrl+F searches the settings while the dialog is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopImmediatePropagation();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const current = CATS.find((c) => c.id === cat)!;
  return (
    <Modal title="Settings" onClose={onClose} width={900}>
      <div className={`settings ${q ? 'searching' : ''}`}>
        <nav className="set-nav">
          <span className="search set-search">
            <Search size={13} />
            <input
              ref={search}
              className="input sm"
              value={query}
              placeholder="Search settings"
              aria-label="Search settings (Ctrl+F)"
              title="Search settings (Ctrl+F)"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape' && query) {
                  e.preventDefault();
                  setQuery('');
                }
              }}
            />
            {query && (
              <button className="search-x" aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={12} />
              </button>
            )}
          </span>
          {CATS.map((c) => (
            <button
              key={c.id}
              className={!q && cat === c.id ? 'on' : ''}
              onClick={() => {
                setQuery('');
                setCat(c.id);
              }}
            >
              <c.icon size={15} /> {c.label}
            </button>
          ))}
        </nav>
        <div className="set-body">
          {q ? (
            <SearchCtx.Provider value={q}>
              {CATS.filter((c) => c.id !== 'about').map((c) => (
                <section key={c.id} className="set-cat">
                  <button className="set-cat-title" onClick={() => (setQuery(''), setCat(c.id))} title={`Open ${c.label}`}>
                    <c.icon size={13} /> {c.label}
                  </button>
                  <CatBody id={c.id} onClose={onClose} />
                </section>
              ))}
              <div className="set-empty muted">No setting matches “{query.trim()}”.</div>
            </SearchCtx.Provider>
          ) : (
            <>
              <CatBody id={cat} onClose={onClose} />
              <SectionReset cat={current} />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function General() {
  const p = usePrefs();
  return (
    <>
      <Group title="New work">
        <Row label="New project size" hint="Page size of blank projects (templates bring their own).">
          <select className="input sm" style={{ width: 220 }} value={p.newProjectSize} onChange={(e) => p.setPrefs({ newProjectSize: e.target.value })}>
            {[...new Map(CANVAS_PRESETS.map((c) => [`${c.w}x${c.h}`, c])).values()].map((c) => (
              <option key={`${c.w}x${c.h}`} value={`${c.w}x${c.h}`}>
                {c.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Clicking a template" hint="Add it as a new page, or rebuild the page you are on (Ctrl+Z undoes it).">
          <Seg small value={p.templateTarget} onChange={(templateTarget) => p.setPrefs({ templateTarget })} options={[{ value: 'new', label: 'New page' }, { value: 'replace', label: 'Replace this page' }]} />
        </Row>
        <Row label="Smart template recommendations" hint="Lists the templates that suit your pack first and labels how well each fits. Every template stays available; turn this off for the plain order." keywords="recommend fit suggest sort order compatibility">
          <Toggle checked={p.smartTemplates} onChange={(smartTemplates) => p.setPrefs({ smartTemplates })} />
        </Row>
        <Row label="Font for new text" hint="Used when you add plain text with the T tool. Styled presets keep their own font.">
          <select className="input sm" style={{ width: 220 }} value={p.defaultFont} onChange={(e) => p.setPrefs({ defaultFont: e.target.value })}>
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <Group title="Help">
        <Row label="Quick start tips" hint="The small checklist in the corner of an empty page in the editor.">
          <Toggle checked={!p.quickStartDismissed} onChange={(on) => p.setPrefs({ quickStartDismissed: !on })} />
        </Row>
        <Row label="Guide" hint="Short clips that show every feature." keywords="tutorial help tour">
          <button className="btn sm" onClick={() => setStage('guide')}>
            Open Guide
          </button>
        </Row>
      </Group>
      <Group title="Reset">
        <Row label="Restore all default settings" hint="Every section goes back to its defaults. Projects, assets, themes, templates, presets, favourites and the brand name are kept." keywords="reset defaults">
          <button
            className="btn sm"
            onClick={async () => {
              if (!(await askConfirm({ title: 'Restore all default settings?', message: 'Projects, assets, saved presets, favourites and the brand name are kept.', okLabel: 'Restore' }))) return;
              resetPrefs();
              toast('Settings restored to defaults', 'success');
            }}
          >
            <RotateCcw size={13} /> Restore defaults
          </button>
        </Row>
      </Group>
    </>
  );
}

function ProjectSettings() {
  const p = usePrefs();
  return (
    <>
      <Group title="Start-up">
        <Row label="Open on" hint="Home, or the project and workspace you had open last." keywords="startup launch reopen last workspace">
          <Seg small value={p.startScreen} onChange={(startScreen) => p.setPrefs({ startScreen })} options={[{ value: 'home', label: 'Home' }, { value: 'last', label: 'Last project' }]} />
        </Row>
      </Group>
      <Group title="Autosave">
        <Row label="Save after" hint="Projects save by themselves once you pause this long. Shorter is safer; longer saves less often on big projects." keywords="autosave delay">
          <div className="set-slider">
            <Slider value={p.autosaveDelay} min={0.3} max={5} step={0.1} decimals={1} unit="s" onChange={(autosaveDelay) => p.setPrefs({ autosaveDelay })} />
          </div>
        </Row>
        <Row label="Projects" hint="Open, rename, duplicate or delete saved projects." keywords="manage">
          <button className="btn sm" onClick={() => openDialog('projects')}>
            Manage projects…
          </button>
        </Row>
      </Group>
    </>
  );
}

function WatermarkDefaults({ onClose }: { onClose: () => void }) {
  const p = usePrefs();
  const d = p.wmDefaults;
  const textPresets = WATERMARK_PRESETS.filter((w) => w.layers.some((l) => l.kind === 'text'));
  return (
    <>
      <Group title="Brand">
        <Row label="Brand name" hint="Fills {brand} in watermark text. Empty: the project name is used." keywords="watermark studio author">
          <input className="input sm" style={{ width: 220 }} value={p.brandName} placeholder="Project name" onChange={(e) => p.setPrefs({ brandName: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </Row>
      </Group>
      <Group title="New projects">
        <Row label="Watermark new projects" hint="Off by default. Existing projects keep their own watermark either way." keywords="watermark default">
          <Toggle checked={d.newProjects} onChange={(newProjects) => p.setPrefs({ wmDefaults: { ...d, newProjects } })} />
        </Row>
        {d.newProjects && (
          <Row label="Starting watermark" hint="Text presets only; add a logo in the Watermark workspace." keywords="watermark preset">
            <select className="input sm" style={{ width: 220 }} value={d.preset} onChange={(e) => p.setPrefs({ wmDefaults: { ...d, preset: e.target.value } })}>
              {textPresets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Row>
        )}
        <Row label="This project" hint="Each project's watermark is edited in its Watermark workspace." keywords="watermark workspace">
          <button className="btn sm" onClick={() => (onClose(), setStage('watermark'))}>
            <Stamp size={13} /> Open Watermark
          </button>
        </Row>
      </Group>
    </>
  );
}

function Performance() {
  const p = usePrefs();
  return (
    <>
      <Group title="Memory">
        <Row label="Undo steps" hint="How many steps each project keeps. Fewer steps use less memory with large packs." keywords="history undo memory">
          <NumberField value={p.historyLimit} min={20} max={1000} width={110} onChange={(historyLimit) => p.setPrefs({ historyLimit: Math.round(historyLimit) })} />
        </Row>
      </Group>
      <Group title="Motion">
        <Row label="Reduce motion" hint="Turns off interface animations and transitions." keywords="animation">
          <Toggle checked={p.reduceMotion} onChange={(reduceMotion) => p.setPrefs({ reduceMotion })} />
        </Row>
      </Group>
    </>
  );
}

function Appearance() {
  const p = usePrefs();
  const desktop = !!native()?.setZoom;
  return (
    <>
      <Group title="Theme">
        <div className="theme-cards">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button key={t} className={`theme-card ${p.theme === t ? 'on' : ''}`} onClick={() => p.setPrefs({ theme: t })}>
              <span className={`theme-swatch ${t}`}>
                <i />
                <i />
                <i />
              </span>
              <span>{t === 'system' ? 'Match Windows' : t[0].toUpperCase() + t.slice(1)}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Colours">
        <Row label="Accent colour" hint="Buttons, selections and highlights.">
          <div className="swatch-row">
            {(Object.keys(ACCENTS) as AccentId[]).map((a) => (
              <button key={a} className={`color-dot ${p.accent === a ? 'on' : ''}`} title={ACCENTS[a].label} aria-label={ACCENTS[a].label} style={{ background: ACCENTS[a].main }} onClick={() => p.setPrefs({ accent: a })}>
                {p.accent === a && <CheckIcon size={13} />}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Pasteboard" hint="The area around the page in the editor.">
          <Seg small value={p.pasteboard} onChange={(pasteboard) => p.setPrefs({ pasteboard })} options={[{ value: 'dark', label: 'Dark' }, { value: 'mid', label: 'Medium' }, { value: 'light', label: 'Light' }]} />
        </Row>
      </Group>
      <Group title="Size">
        <Row label="Interface size" hint={desktop ? 'Makes all text and controls larger or smaller.' : 'Available in the desktop app (use the browser zoom here).'}>
          <Seg
            small
            value={String(p.uiScale)}
            onChange={(v) => p.setPrefs({ uiScale: Number(v) })}
            options={[
              { value: '0.9', label: '90%' },
              { value: '1', label: '100%' },
              { value: '1.1', label: '110%' },
              { value: '1.25', label: '125%' },
            ]}
          />
        </Row>
        <Row label="Library thumbnails" hint="Size of the asset tiles on the left.">
          <div className="set-slider">
            <Slider value={p.thumbSize} min={56} max={160} unit="px" onChange={(thumbSize) => p.setPrefs({ thumbSize })} />
          </div>
        </Row>
      </Group>
    </>
  );
}

function CanvasSettings() {
  const p = usePrefs();
  const s = p.snap;
  return (
    <>
      <Group title="Smart guides & snapping">
        <Row label="Snapping" hint="Icons click into place while you drag. Hold Ctrl to move freely.">
          <Toggle checked={s.enabled} onChange={(enabled) => p.setSnap({ enabled })} />
        </Row>
        <Row label="Snap to the page" hint="Edges and center of the page.">
          <Toggle checked={s.canvas} onChange={(canvas) => p.setSnap({ canvas })} />
        </Row>
        <Row label="Snap to other objects" hint="Line up edges and centers with nearby icons and text.">
          <Toggle checked={s.objects} onChange={(objects) => p.setSnap({ objects })} />
        </Row>
        <Row label="Equal spacing" hint="Snap to the same gap on both sides and show the distance.">
          <Toggle checked={s.spacing !== false} onChange={(spacing) => p.setSnap({ spacing })} />
        </Row>
        <Row label="Snap to ruler guides">
          <Toggle checked={s.guides} onChange={(guides) => p.setSnap({ guides })} />
        </Row>
        <Row label="Snap strength" hint="How close you need to be before it snaps.">
          <div className="set-slider">
            <Slider value={s.strength} min={2} max={24} unit="px" onChange={(strength) => p.setSnap({ strength })} />
          </div>
        </Row>
        <Row label="Guide colour">
          <div className="swatch-row">
            {GUIDE_COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot ${p.guideColor === c ? 'on' : ''}`}
                style={{ background: c === 'accent' ? ACCENTS[p.accent].main : c }}
                title={c === 'accent' ? 'Same as the accent colour' : c}
                aria-label={c === 'accent' ? 'Accent colour' : c}
                onClick={() => p.setPrefs({ guideColor: c })}
              >
                {p.guideColor === c && <CheckIcon size={13} />}
              </button>
            ))}
          </div>
        </Row>
      </Group>
      <Group title="Grid & nudging">
        <Row label="Snap to grid">
          <Toggle checked={s.grid} onChange={(grid) => p.setSnap({ grid })} />
        </Row>
        <Row label="Grid size">
          <NumberField value={s.gridSize} min={2} max={500} unit="px" width={110} onChange={(gridSize) => p.setSnap({ gridSize })} />
        </Row>
        <Row label="Arrow-key step" hint="Shift + arrow moves 10× as far.">
          <NumberField value={p.nudge} min={0.1} max={100} decimals={1} step={0.5} unit="px" width={110} onChange={(nudge) => p.setPrefs({ nudge })} />
        </Row>
      </Group>
      <Group title="Show on the canvas">
        <Row label="Rulers">
          <Toggle checked={p.overlays.rulers} onChange={(rulers) => p.setOverlay({ rulers })} />
        </Row>
        <Row label="Safe zone">
          <Toggle checked={p.overlays.safe} onChange={(safe) => p.setOverlay({ safe })} />
        </Row>
        <Row label="Focal region">
          <Toggle checked={p.overlays.focal} onChange={(focal) => p.setOverlay({ focal })} />
        </Row>
        <Row label="Pixel grid when zoomed in" hint="From 800% zoom.">
          <Toggle checked={p.overlays.pixelGrid} onChange={(pixelGrid) => p.setOverlay({ pixelGrid })} />
        </Row>
      </Group>
      <Group title="Image quality">
        <Row label="Pixel-art icons" hint="Small icons (16×16, 32×32…) drawn bigger: Auto keeps their pixels crisp, Smooth blends them. Applies to the canvas and to exports.">
          <Seg
            small
            value={p.pixelIcons}
            onChange={(pixelIcons) => p.setPrefs({ pixelIcons })}
            options={[
              { value: 'auto', label: 'Auto', title: 'Crisp pixels for images up to 128 px, smooth for larger art' },
              { value: 'sharp', label: 'Always crisp', title: 'Every enlarged image keeps hard pixel edges' },
              { value: 'smooth', label: 'Smooth', title: 'Always blend pixels when enlarging' },
            ]}
          />
        </Row>
      </Group>
    </>
  );
}

function LayoutSettings() {
  const p = usePrefs();
  return (
    <Group title="Layouts">
      <Row label="Keep my hand-made changes" hint="Moving an icon that belongs to a layout pins it, so Shuffle and setting changes leave it where you put it.">
        <Toggle checked={p.autoPin} onChange={(autoPin) => p.setPrefs({ autoPin })} />
      </Row>
      <Row label="Arrange when adding many" hint="“Add all” puts the icons in a grid layout right away.">
        <Toggle checked={p.addWithLayout} onChange={(addWithLayout) => p.setPrefs({ addWithLayout })} />
      </Row>
      <Row label="Align by visible pixels" hint="Align and distribute ignore the transparent padding around icons.">
        <Toggle checked={p.alignVisible} onChange={(alignVisible) => p.setPrefs({ alignVisible })} />
      </Row>
      <Row label="Perspective Floor: adapt to small packs" hint="New floors with fewer than ~40 icons get fewer, deeper rows. Saved floors keep their look." keywords="floor perspective small">
        <Toggle checked={p.floorAdaptive} onChange={(floorAdaptive) => p.setPrefs({ floorAdaptive })} />
      </Row>
      <Row label="Grid: largest cell" hint="New grids cap each cell at this share of the shorter page side, so a few icons don't fill the page. Saved grids keep their setting." keywords="grid size cap small">
        <span className="row">
          <button className={`btn sm ${p.gridMaxCell ? '' : 'active'}`} onClick={() => p.setPrefs({ gridMaxCell: p.gridMaxCell ? 0 : 0.36 })}>
            No limit
          </button>
          <div className="set-slider">
            <Slider value={p.gridMaxCell || 0.1} min={0.1} max={0.8} step={0.01} scale={100} unit="%" onChange={(gridMaxCell) => p.setPrefs({ gridMaxCell })} />
          </div>
        </span>
      </Row>
      <Row label="Favourite layouts" hint={`${p.favLayouts.length} starred in the layout picker.`}>
        <button className="btn sm" onClick={() => p.setPrefs({ favLayouts: ['cluster', 'roundcluster', 'grid'] })}>
          Reset favourites
        </button>
      </Row>
    </Group>
  );
}

function ExportDefaults() {
  const p = usePrefs();
  const s = p.exportSettings;
  const set = (patch: Partial<typeof s>) => p.setPrefs({ exportSettings: { ...s, ...patch } });
  return (
    <>
      <Group title="Image">
        <Row label="Format">
          <Seg<ExportFormat> small value={s.format} onChange={(format) => set({ format })} options={[{ value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }, { value: 'jpeg', label: 'JPG' }]} />
        </Row>
        {s.format !== 'png' && (
          <Row label="Quality">
            <div className="set-slider">
              <Slider value={s.quality} min={0.4} max={1} step={0.01} scale={100} unit="%" onChange={(quality) => set({ quality })} />
            </div>
          </Row>
        )}
        <Row label="Size">
          <Seg small value={String(s.customWidth ? 'custom' : s.scale)} onChange={(v) => (v === 'custom' ? undefined : set({ scale: Number(v), customWidth: undefined }))} options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />
        </Row>
      </Group>
      <Group title="Files">
        <Row label="File name pattern" hint="Tokens: {project} {page} {index} {w} {h} {date} {time}">
          <input className="input sm mono" style={{ width: 220 }} value={s.pattern} onChange={(e) => set({ pattern: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </Row>
        <Row label="If a file exists">
          <Seg small value={s.onConflict ?? 'number'} onChange={(onConflict) => set({ onConflict })} options={[{ value: 'number', label: 'Keep both' }, { value: 'overwrite', label: 'Replace' }]} />
        </Row>
        <Row label="Several pages as" hint="Loose images in a folder, or one .zip file.">
          <Seg small value={s.saveAs ?? 'folder'} onChange={(saveAs) => set({ saveAs })} options={[{ value: 'folder', label: 'Folder' }, { value: 'zip', label: 'ZIP file' }]} />
        </Row>
        <Row label="Open the folder afterwards" hint="Shows the exported images when several pages are saved to a folder.">
          <Toggle checked={s.revealFolder !== false} onChange={(revealFolder) => set({ revealFolder })} />
        </Row>
        <Row label="Leave out the background" hint="PNG / WebP: export icons and text on transparency.">
          <Toggle checked={!!s.transparent} onChange={(transparent) => set({ transparent })} />
        </Row>
      </Group>
      <Group title="Watermark">
        <Row label="Watermark in exports" hint="Applies when the project has a watermark. “Both” saves a clean image and a watermarked copy." keywords="watermark clean preview">
          <Seg
            small
            value={s.watermark ?? 'project'}
            onChange={(watermark) => set({ watermark })}
            options={[
              { value: 'project', label: 'With' },
              { value: 'none', label: 'Without' },
              { value: 'both', label: 'Both' },
            ]}
          />
        </Row>
        {s.watermark === 'both' && (
          <Row label="Watermarked copy suffix" hint="Added to the file name: cover.png and cover_preview.png." keywords="watermark suffix">
            <input className="input sm mono" style={{ width: 140 }} value={s.previewSuffix ?? '_preview'} onChange={(e) => set({ previewSuffix: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </Row>
        )}
      </Group>
    </>
  );
}

function Storage({ onClose }: { onClose: () => void }) {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [where, setWhere] = useState<{ dataPath: string; exportsPath?: string } | null>(null);
  const [detail, setDetail] = useState<Record<string, number> | null>(null);
  const files = native()?.store;
  const refresh = () => {
    // desktop app: real size of the data folder (there is no quota); browser: the site storage estimate
    if (files) void files.usage().then((usage) => setEst({ usage, quota: 0 })).catch(() => undefined);
    if (files?.usageDetail) void files.usageDetail().then(setDetail).catch(() => undefined);
    else void navigator.storage?.estimate?.().then((e) => setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
    if (!files) void navigator.storage?.persisted?.().then(setPersisted);
    void native()?.appInfo?.().then(setWhere).catch(() => undefined);
    void listProjects().then((l) => setCount(l.length));
  };
  useEffect(refresh, []);
  const pct = est && est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
  return (
    <>
      <Group title="On this computer">
        <Row label="Space used" hint="Projects, imported images and fonts.">
          <div className="storage-meter">
            {!files && (
              <div className="storage-bar">
                <div style={{ width: `${Math.max(1, pct)}%` }} />
              </div>
            )}
            <span className="muted small">{est ? (files ? humanBytes(est.usage) : `${humanBytes(est.usage)} of ${humanBytes(est.quota)}`) : '…'}</span>
          </div>
        </Row>
        {detail && (
          <Row label="Breakdown" hint="Imported images are stored once per project that uses them. Unused files are moved to the Trash a week after an interrupted import, and erased 30 days later." keywords="disk size images autosaves cache">
            <div className="kv small">
              {(
                [
                  ['Imported images and fonts', detail.files],
                  ['Project files', detail.projects],
                  ['Autosaves (last 10 per project)', detail.autosaves],
                  ['Trash', detail.trash],
                  ['Settings and presets', detail.settings],
                  ['App cache (not counted above)', detail.cache],
                ] as const
              ).map(([k, v]) => (
                <span key={k} style={{ display: 'contents' }}>
                  <span>{k}</span>
                  <span className="mono">{humanBytes(v)}</span>
                </span>
              ))}
            </div>
          </Row>
        )}
        <Row label="Projects" hint="Saved automatically; open them from File → Projects.">
          <span className="row">
            <b>{count ?? '…'}</b>
            <button className="btn sm" onClick={() => (onClose(), openDialog('projects'))}>
              Manage projects…
            </button>
          </span>
        </Row>
        {!files && (
          <Row label="Protected storage" hint="Asks the system never to clear your projects to free space.">
            <span className="row">
              <span className={`badge ${persisted ? 'pass' : 'neutral'}`}>{persisted === null ? '…' : persisted ? 'On' : 'Not granted'}</span>
              {!persisted && (
                <button className="btn sm" onClick={() => void navigator.storage?.persist?.().then(() => refresh())}>
                  Request
                </button>
              )}
            </span>
          </Row>
        )}
        {native()?.openDataFolder && (
          <Row label="App data folder" hint="Projects, settings, autosaves and logs" keywords="path location">
            {where ? (
              <PathRow path={where.dataPath} onOpen={() => void native()!.openDataFolder!()} />
            ) : (
              <button className="btn sm" onClick={() => void native()!.openDataFolder!()}>
                <FolderOpen size={13} /> Open folder
              </button>
            )}
          </Row>
        )}
        {where?.exportsPath && (
          <Row label="Default export folder" hint="Save dialogs start here until you pick another folder">
            <PathRow path={where.exportsPath} />
          </Row>
        )}
      </Group>
      {files && <Trash onChange={refresh} />}
      <Group title="Danger zone">
        <Row label="Delete all projects" hint={files ? "Moves every project, with its images, to the Trash above. Exported images and .showcase files are not affected." : "Removes every project and its stored images from this computer. Exported images and .showcase files are not affected."}>
          <button
            className="btn sm solid-danger"
            disabled={!count}
            onClick={async () => {
              const all = await listProjects();
              if (!all.length || !(await askConfirm({ title: `Delete all ${all.length} projects?`, message: deleteManyNote(), okLabel: deleteLabel(), danger: true }))) return;
              await deleteStoredProjects(all.map((x) => x.id));
              toast(deletedToast(all.length), 'success');
              refresh();
            }}
          >
            Delete all…
          </button>
        </Row>
      </Group>
    </>
  );
}

/** Deleted projects (desktop app): restore, or erase for good after a confirmation. */
function Trash({ onChange }: { onChange: () => void }) {
  const store = native()?.store;
  const [items, setItems] = useState<TrashedProject[] | null>(null);
  const load = () => void store?.listTrash().then(setItems).catch(() => setItems([]));
  useEffect(load, []);
  const done = () => {
    load();
    onChange();
  };
  const restore = async (t: TrashedProject) => {
    try {
      await store!.restoreTrash(t.trashId);
      toast(`Restored “${t.name}” — open it from File → Projects`, 'success');
    } catch (e) {
      toast('Could not restore: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
    done();
  };
  const purge = async (t: TrashedProject) => {
    const n = t.files.length;
    if (!(await askConfirm({ title: `Delete “${t.name}” permanently?`, message: `The project${n ? ` and its ${n} stored image${n === 1 ? '' : 's'}` : ''} will be erased from this computer. This cannot be undone.`, okLabel: 'Delete permanently', danger: true }))) return;
    await store!.purgeTrash([t.trashId]);
    done();
  };
  const emptyAll = async () => {
    if (!items?.length || !(await askConfirm({ title: `Empty the Trash?`, message: `${items.length} project${items.length === 1 ? '' : 's'} and their stored images will be erased from this computer. This cannot be undone.`, okLabel: 'Empty Trash', danger: true }))) return;
    await store!.purgeTrash('all');
    toast('Trash emptied', 'success');
    done();
  };
  return (
    <Group title="Trash">
      <div className="set-text muted small">Deleted projects stay here with their images until you delete them permanently. Single images removed from a project are kept for 30 days, so Undo can bring them back.</div>
      {items === null ? (
        <div className="muted small">…</div>
      ) : items.length === 0 ? (
        <div className="muted small">The Trash is empty.</div>
      ) : (
        <>
          {items.map((t) => (
            <Row key={t.trashId} label={t.name} hint={`Deleted ${new Date(t.deletedAt).toLocaleString()}${t.assets != null ? ` · ${t.assets} asset${t.assets === 1 ? '' : 's'}` : ''}`}>
              <span className="row">
                <button className="btn sm" onClick={() => void restore(t)}>
                  <RotateCcw size={13} /> Restore
                </button>
                <button className="btn sm ghost danger" onClick={() => void purge(t)}>
                  Delete permanently…
                </button>
              </span>
            </Row>
          ))}
          <Row label="Empty Trash" hint="Erases every project in the Trash, with its images.">
            <button className="btn sm solid-danger" onClick={() => void emptyAll()}>
              Empty Trash…
            </button>
          </Row>
        </>
      )}
    </Group>
  );
}

function Shortcuts() {
  const q = useContext(SearchCtx);
  const [own, setOwn] = useState('');
  const f = (q || own.trim().toLowerCase()).trim();
  const list = f ? SHORTCUTS.filter(([k, v]) => hits(`${k} ${v}`, f)) : SHORTCUTS;
  if (q && !list.length) return null;
  return (
    <Group title="Keyboard shortcuts">
      {!q && (
        <span className="search set-sc-search">
          <Search size={13} />
          <input className="input sm" value={own} placeholder={`Filter ${SHORTCUTS.length} shortcuts`} aria-label="Filter shortcuts" onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </span>
      )}
      {!list.length && <div className="muted small">No shortcut matches.</div>}
      <div className="guide-table">
        {list.map(([k, v]) => (
          <div key={k} className="guide-table-row sc-row">
            <Keys shortcut={k} />
            <span>{v}</span>
          </div>
        ))}
      </div>
    </Group>
  );
}

/** Plain-text system summary for bug reports — deliberately no paths, names or project contents. */
export function diagnostics(info: { version: string; electron: string; chrome: string } | null): string {
  const p = usePrefs.getState();
  const ua = navigator.userAgent;
  const os = /Windows NT [\d.]+|Mac OS X [\d_]+|Linux|CrOS/.exec(ua)?.[0]?.replace(/_/g, '.') ?? 'unknown';
  return [
    'Icon Forge Showcase diagnostics',
    `App ${info?.version ?? 'web'}${info ? ` · Electron ${info.electron} · Chromium ${info.chrome}` : ''}`,
    `OS ${os} · ${navigator.language}`,
    `Screen ${screen.width}×${screen.height} @${window.devicePixelRatio || 1}x · window ${window.innerWidth}×${window.innerHeight}`,
    `Theme ${p.theme} · UI ${Math.round(p.uiScale * 100)}% · reduce motion ${p.reduceMotion ? 'on' : 'off'} · undo steps ${p.historyLimit}`,
    `Cores ${navigator.hardwareConcurrency ?? '?'}`,
  ].join('\n');
}

/** A folder path on one line: shortened in the middle, complete on hover and when copied. */
function PathRow({ path, onOpen }: { path: string; onOpen?: () => void }) {
  return (
    <span className="path-row">
      <span className="mono path-text" title={path}>
        {middleTruncate(path)}
      </span>
      <button className="btn ghost icon sm" title="Copy the full path" aria-label="Copy the full path" onClick={() => void navigator.clipboard?.writeText(path).then(() => toast('Path copied', 'success'), () => toast('Could not copy to the clipboard', 'error'))}>
        <Copy size={13} />
      </button>
      {onOpen && (
        <button className="btn ghost icon sm" title="Open the folder" aria-label="Open the folder" onClick={onOpen}>
          <FolderOpen size={13} />
        </button>
      )}
    </span>
  );
}

function About() {
  const [info, setInfo] = useState<{ version: string; electron: string; chrome: string; dataPath: string } | null>(null);
  useEffect(() => void native()?.appInfo?.().then(setInfo).catch(() => undefined), []);
  const openData = native()?.openDataFolder;
  return (
    <>
      <div className="about-head">
        <AppIcon size={48} />
        <div>
          <b>Icon Forge Showcase</b>
          <span className="muted small">
            Version {info?.version ?? APP_VERSION} · covers, thumbnails and catalogs for icon and sprite packs
          </span>
        </div>
      </div>
      <Group title="Privacy">
        <div className="set-text">Everything runs on this computer. Images are processed and stored locally: no account, no uploads, no tracking. The desktop app makes no network requests.</div>
      </Group>
      <Group title="Support">
        <Row label="Copy diagnostics" hint="Versions, platform, screen and a few display settings, for a bug report. No file paths, project names, images or personal data.">
          <button
            className="btn sm"
            onClick={() => {
              const text = diagnostics(info);
              void navigator.clipboard?.writeText(text).then(
                () => toast('Diagnostics copied', 'success'),
                () => toast('Could not copy to the clipboard', 'error'),
              );
            }}
          >
            <Copy size={13} /> Copy diagnostics
          </button>
        </Row>
      </Group>
      <Group title="System">
        <div className="kv about-kv">
          <span>App version</span>
          <span className="mono">{info?.version ?? APP_VERSION}</span>
          {info && (
            <>
              <span>Electron</span>
              <span className="mono">{info.electron}</span>
              <span>Chromium</span>
              <span className="mono">{info.chrome}</span>
              <span>Data folder</span>
              <PathRow path={info.dataPath} onOpen={openData ? () => void openData() : undefined} />
            </>
          )}
          {!info && (
            <>
              <span>Storage</span>
              <span>This browser's storage for this page</span>
            </>
          )}
        </div>
      </Group>
    </>
  );
}
