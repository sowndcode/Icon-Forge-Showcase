// Left sidebar: Assets / Backgrounds / Elements / Templates.

import { useState, type ReactNode } from 'react';
import { PanelLeftClose, ChevronRight, Images } from 'lucide-react';
import { elementStyle, pageTextScale, scaleTextStyle, TEXT_PRESET_GROUPS, TEXT_PRESETS, type SavedElement } from '../../core/defaults';
import { harmonyColors, WHEEL_COLORS, type Palette } from '../../core/palette';
import type { Page } from '../../core/types';
import { openMenu } from '../menus';
import { askText } from '../components/ask';
import { duplicatePreset, renamePreset } from '../../state/customPresets';
import { useDoc, usePage } from '../../state/doc';
import { BUILTIN_TEMPLATES } from '../../state/generators';
import { addElementPreset, addShape, addTextAt, ELEMENT_PRESETS } from '../../state/placement';
import { usePrefs } from '../../state/prefs';
import { deletePreset, usePresets } from '../../state/presets';
import { Seg } from '../components/controls';
import { useUI } from '../../state/ui';
import { openFilePicker } from '../App';
import { AssetLibrary } from './AssetLibrary';
import { TextThumb } from '../components/TextThumb';
import { askConfirm } from '../components/ask';
import { SHAPE_BUTTONS } from '../shapeIcons';
import { ThemesTab } from './ThemesTab';
import { BackgroundsTab } from './BackgroundsTab';
import { TemplatesTab } from './TemplatesTab';

export function LeftPanel() {
  const tab = useUI((s) => s.leftTab);
  const bgView = useUI((s) => s.bgView);
  const counts = useDoc((s) => {
    const c = { asset: 0, background: 0, element: 0, watermark: 0 };
    for (const a of s.doc.assets) c[a.kind]++;
    return `${c.asset}|${c.background}|${c.element}`;
  });
  const [na, nb, ne] = counts.split('|');
  const nTpl = BUILTIN_TEMPLATES.length + usePresets('template').length;
  const head =
    tab === 'assets'
      ? { title: 'Assets', count: na }
      : tab === 'templates'
        ? { title: 'Templates', count: String(nTpl) }
        : tab === 'elements'
          ? { title: 'Elements', count: +ne ? ne : '' }
          : bgView === 'themes'
            ? { title: 'Themes', count: '' }
            : { title: 'Backgrounds', count: +nb ? nb : '' };
  return (
    <>
      <div className="panel-title">
        <h2>{head.title}</h2>
        {head.count && <span className="panel-count">{head.count}</span>}
        <span className="grow" />
        <button className="icon-btn" title="Hide library" aria-label="Hide library" onClick={() => usePrefs.getState().setPrefs({ leftCollapsed: true })}>
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="panel-content">
        {tab === 'assets' && <AssetLibrary kind="asset" />}
        {tab === 'backgrounds' && <BackgroundsAndThemes />}
        {tab === 'elements' && <ElementsTab />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </>
  );
}


/** Base-colour chooser for the “From your icons” sets: icon colours, harmonies, a colour wheel, any colour. */
export function MatchColorPicker({ palette, value }: { palette: Palette | null; value: string | null }) {
  const set = (c: string | null) => useUI.setState({ matchColor: c });
  const cur = (value ?? palette?.colors[0] ?? '').toLowerCase();
  const chip = (c: string, title: string) => (
    <button key={c + title} className={`mc-chip ${c.toLowerCase() === cur ? 'on' : ''}`} style={{ background: c }} title={title} aria-label={title} onClick={() => set(palette && c.toLowerCase() === palette.colors[0].toLowerCase() ? null : c)} />
  );
  return (
    <div className="mc">
      {palette && (
        <>
          <div className="mc-label">Your icons</div>
          <div className="mc-row">{palette.colors.map((c, i) => chip(c, i === 0 ? `Main colour ${c}` : `Icon colour ${c}`))}</div>
          <div className="mc-label">Goes well with them</div>
          <div className="mc-row">{harmonyColors(palette).map((c) => chip(c, `Matching colour ${c}`))}</div>
        </>
      )}
      <div className="mc-label">Any colour</div>
      <div className="mc-row">
        {WHEEL_COLORS.map((c) => chip(c, c))}
        <label className="mc-chip mc-custom" title="Pick any colour…">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#3b82f6'} onChange={(e) => set(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

// Which sections are open; remembered per computer.
const FOLD_KEY = 'asset-forge-showcase:folds';
function readFolds(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Collapsible panel section with a count and a short description. */
export function Fold({ id, title, count, desc, defaultOpen = false, right, children }: { id: string; title: string; count?: number; desc?: string; defaultOpen?: boolean; right?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(() => readFolds()[id] ?? defaultOpen);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify({ ...readFolds(), [id]: !open }));
    } catch {
      /* storage unavailable — the section still toggles */
    }
  };
  return (
    <div className={`fold ${open ? 'open' : ''}`}>
      <div className="fold-head">
        <button className="fold-btn" onClick={toggle} aria-expanded={open}>
          <ChevronRight size={13} className="fold-chev" />
          <span className="fold-title">{title}</span>
          {count !== undefined && <span className="fold-count">{count}</span>}
        </button>
        {right}
      </div>
      {open && desc && <div className="fold-desc">{desc}</div>}
      {open && children}
    </div>
  );
}

function BackgroundsAndThemes() {
  const view = useUI((s) => s.bgView);
  // Backgrounds and Themes are separate entries in the navigation; this small switch keeps both one click apart
  const switcher = (
    <div className="bg-switch">
      <Seg
        small
        value={view}
        onChange={(bgView) => useUI.setState({ bgView })}
        options={[
          { value: 'backgrounds', label: 'Backgrounds', title: 'Backgrounds only — your text stays as it is' },
          { value: 'themes', label: 'Themes', title: 'Background plus matching title and badge colours' },
        ]}
      />
    </div>
  );
  if (view === 'themes')
    return (
      <>
        <div className="panel-body-head">{switcher}</div>
        <ThemesTab />
      </>
    );
  return <BackgroundsTab switcher={switcher} />;
}

const TEXT_GROUP_DESC: Record<string, string> = {
  Clean: 'Restrained titles, labels and callouts that suit any theme',
  Titles: 'Headline looks for the pack name or icon count',
  'Styled titles': 'Themed effects: fire, ice, neon, wood, comic…',
  Badges: 'Stickers for FREE DEMO, NEW, sale and counts',
  Labels: 'Small chips and lines for sizes, formats and licences',
};

function ElementsTab() {
  const page = usePage();
  const center = { x: page.width / 2, y: page.height / 2 };
  const k = pageTextScale(page.width, page.height);
  const textStyles = usePresets<SavedElement>('text');
  return (
    <div className="panel-body" style={{ display: 'flex', flexDirection: 'column' }}>
      {TEXT_PRESET_GROUPS.map((g, i) => {
        const list = TEXT_PRESETS.filter((t) => t.group === g);
        return (
          <Fold key={g} id={`tx-${g}`} title={g} count={list.length} desc={TEXT_GROUP_DESC[g]} defaultOpen={i === 0}>
            <div className="text-grid">
              {list.map((t) => (
                <button key={t.name} className="texttile checker" title={`Add “${t.name}” — click, then double-click the text to edit it`} onClick={() => addTextAt({ x: center.x, y: center.y }, t.text, scaleTextStyle(t.style, k))}>
                  <TextThumb text={t.text} style={t.style} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </Fold>
        );
      })}
      <Fold id="tx-mine" title="My elements" count={textStyles.length} desc="Saved on this computer — available in every project. Select a text and use Save as element" defaultOpen={textStyles.length > 0}>
        {textStyles.length ? (
          <div className="text-grid">
            {textStyles.map((t) => {
              const words = t.data.sampleText ?? t.name;
              const menu = (x: number, y: number) =>
                openMenu(x, y, [
                  { label: 'Add to page', onClick: () => addTextAt(center, words, elementStyle(t.data)) },
                  { label: 'Rename…', onClick: () => void askText({ title: 'Rename element', value: t.name, okLabel: 'Rename' }).then((n) => n && void renamePreset(t, n)) },
                  { label: 'Duplicate', onClick: () => void duplicatePreset(t) },
                  { separator: true },
                  { label: 'Delete…', danger: true, onClick: () => void askConfirm({ title: `Delete element “${t.name}”?`, message: 'Text already on your pages stays as it is.', danger: true }).then((ok) => ok && void deletePreset(t.id)) },
                ]);
              return (
                <button
                  key={t.id}
                  className="texttile checker"
                  title={`Add “${t.name}” (right-click to rename, duplicate or delete)`}
                  onClick={() => addTextAt(center, words, elementStyle(t.data))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    menu(e.clientX, e.clientY);
                  }}
                >
                  <TextThumb text={words} style={elementStyle(t.data)} />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="muted small fold-empty">None yet. Select a text, then Style ▸ Advanced ▸ Text styles ▸ Save as element.</div>
        )}
      </Fold>
      <div className="muted small" style={{ padding: '2px 12px 6px' }}>
        <code>{'{count}'}</code> in any text shows your current number of assets.
      </div>
      <div className="group-label">Shapes</div>
      <div className="shape-grid">
        {SHAPE_BUTTONS.map((b) => (
          <button key={b.kind} className="shape-btn" title={b.label} aria-label={b.label} onClick={() => addShape(b.kind)}>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d={b.icon} fillRule="evenodd" fill={b.stroke ? 'none' : 'currentColor'} stroke={b.stroke ? 'currentColor' : 'none'} strokeWidth={2} strokeLinecap="round" />
            </svg>
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      <div className="group-label">Ready-made</div>
      <div className="preset-list">
        {ELEMENT_PRESETS.map((e) => (
          <button key={e.id} className="list-btn" title={e.hint} onClick={() => addElementPreset(e.id)}>
            <span className={`ico el-ico el-${e.id}`} />
            <span className="grow">
              {e.name}
              <small className="el-hint">{e.hint}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="group-label">
        <span className="grow">Decorative elements</span>
        <button className="btn ghost sm" onClick={() => openFilePicker('element')} title="Import fog, sparkles, glows, light rays… as PNGs">
          <Images size={13} /> Import
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 220 }}>
        <AssetLibrary kind="element" />
      </div>
    </div>
  );
}

export type { Page };
