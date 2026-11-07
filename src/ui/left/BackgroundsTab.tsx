// Backgrounds library: only the background changes — text, icons and layout stay as they are.
// Search, light/dark/favourite filters, recently used, presets by mood, the icons' own colours,
// saved backgrounds (rename, duplicate, delete) and imported images. Applies to the picked pages.

import { useMemo, useState } from 'react';
import { FolderInput, FolderOpen, Images, Save } from 'lucide-react';
import { BACKGROUND_PRESETS } from '../../core/defaults';
import { backgroundTone, hexLuminance } from '../../core/themes';
import { matchedBackgrounds, rebasePalette } from '../../core/palette';
import type { Background } from '../../core/types';
import { images } from '../../render/images';
import { getAsset, useDoc, usePage } from '../../state/doc';
import { fixTexts, pageReadability } from '../../state/objects';
import { sampleBehind } from '../../render/sample';
import { setBackground, setBackgroundOn } from '../../state/pages';
import { deletePreset, savePreset, usePresets } from '../../state/presets';
import { duplicatePreset, renamePreset, updatePresetData } from '../../state/customPresets';
import { openDialog, useUI } from '../../state/ui';
import type { ContextMenuItem } from '../../state/ui';
import { BgThumb, completeBackground } from '../components/BgThumb';
import { usePalette } from '../components/usePalette';
import { askConfirm, askText } from '../components/ask';
import { openMenu } from '../menus';
import { openFilePicker, openFolderPicker } from '../App';
import { useImageVersion } from './AssetLibrary';
import { BackgroundEditor } from '../right/BackgroundEditor';
import { Fold, MatchColorPicker } from './LeftPanel';
import { LibraryBar, LibTile, openApplyPreview, pushRecent, ScopeNote, useFavorites, useRecents, useTargetPages } from './libraryKit';

type Filter = 'all' | 'light' | 'dark' | 'fav';
interface Item {
  /** Stable key for favourites and recents: "p:<preset name>", "m:<name>", "u:<saved id>". */
  key: string;
  name: string;
  desc?: string;
  bg: Background;
}

// a few older presets share a name across groups, so the group is part of the key
const PRESETS: Item[] = BACKGROUND_PRESETS.map((p) => ({ key: `p:${p.group}/${p.name}`, name: p.name, desc: p.desc, bg: p.bg() }));
const GROUP_OF = new Map(BACKGROUND_PRESETS.map((p) => [`p:${p.group}/${p.name}`, p.group]));
/** Display order, label and one-line description of each background group. */
const BG_GROUPS: { id: string; label: string; desc: string }[] = [
  { id: 'Studio & editorial', label: 'Studio & editorial', desc: 'Neutral sweeps, paper and ink — let the icons carry the colour' },
  { id: 'Simple gradients', label: 'Simple gradients', desc: 'Calm two-colour fades — safe for any pack' },
  { id: 'Light & clean', label: 'Light & clean', desc: 'Bright, airy backdrops for clean product shots' },
  { id: 'Dark studio', label: 'Dark studio', desc: 'Dark neutrals that make colourful icons pop' },
  { id: 'Soft & pastel', label: 'Soft & pastel', desc: 'Gentle tints for cute, cozy and casual packs' },
  { id: 'Geometric & texture', label: 'Geometric & texture', desc: 'Quiet grids, dots and lines' },
  { id: 'High contrast', label: 'High contrast', desc: 'Pure black, pure white and loud solids' },
  { id: 'Gradients', label: 'Bold gradients', desc: 'Rich colour with a glow behind the content' },
  { id: 'Vivid', label: 'Vivid', desc: 'Saturated duotones for banners and sales' },
  { id: 'Mesh', label: 'Mesh', desc: 'Soft multi-colour blends' },
  { id: 'Patterns', label: 'Patterns', desc: 'Rays, dots, grids, stars and more over a gradient' },
  { id: 'Spotlight', label: 'Spotlight', desc: 'A light pool behind your hero icons' },
  { id: 'Night & sky', label: 'Night & sky', desc: 'Starry nights, dawn, aurora and moonlight' },
  { id: 'Nature & places', label: 'Nature & places', desc: 'Grass, ocean, sand, caves, dungeons and forests' },
];

const toneOf = (b: Background): 'light' | 'dark' | null => {
  const t = backgroundTone(b);
  return t ? (hexLuminance(t) > 0.4 ? 'light' : 'dark') : null;
};

/** A background preset applied to a page: the image settings the page already has stay. */
const applied = (b: Background, cur: Background): Background => {
  const next = completeBackground(structuredClone(b));
  return { ...next, image: next.type === 'image' ? next.image : cur.image };
};

/** After a background change: which texts on the open page became hard to read, and a one-click fix. */
function TextCheck() {
  const page = usePage();
  const v = useImageVersion();
  const bad = useMemo(() => pageReadability(page, (p, id) => sampleBehind(p, id, getAsset)), [page, v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bad.length) return null;
  return (
    <div className="text-check">
      <span className="read-dot poor" />
      <span className="grow">
        {bad.length} text{bad.length === 1 ? ' is' : 's are'} hard to read on this background
      </span>
      <button className="btn sm" onClick={() => fixTexts(bad)} title="Change only their colours (outline on busy areas). Ctrl+Z to undo">
        Improve
      </button>
    </div>
  );
}

export function BackgroundsTab({ switcher }: { switcher: React.ReactNode }) {
  const page = usePage();
  const targets = useTargetPages();
  const all = useDoc((s) => s.doc.assets);
  const imgs = useMemo(() => all.filter((a) => a.kind === 'background'), [all]);
  const saved = usePresets<Background>('background');
  useImageVersion();
  const palette = usePalette();
  const matchColor = useUI((s) => s.matchColor);
  const base = useMemo(() => (palette ? (matchColor ? rebasePalette(palette, matchColor) : palette) : matchColor ? rebasePalette(null, matchColor) : null), [palette, matchColor]);
  const matched: Item[] = useMemo(() => (base ? matchedBackgrounds(base).map((m) => ({ key: `m:${m.name}`, name: m.name, desc: m.desc, bg: m.bg() })) : []), [base]);
  const mine: Item[] = useMemo(() => saved.map((p) => ({ key: `u:${p.id}`, name: p.name, bg: completeBackground(p.data) })), [saved]);
  const favs = useFavorites('backgrounds');
  const recents = useRecents('backgrounds');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const nPages = useDoc((s) => s.doc.pages.length);

  const everything = useMemo(() => [...mine, ...matched, ...PRESETS], [mine, matched]);
  const byKey = useMemo(() => new Map(everything.map((i) => [i.key, i])), [everything]);
  const needle = q.trim().toLowerCase();
  const show = (i: Item) => (!needle || `${i.name} ${i.desc ?? ''}`.toLowerCase().includes(needle)) && (filter === 'all' || (filter === 'fav' ? favs.has(i.key) : toneOf(i.bg) === filter));

  const apply = (i: Item, ids = targets) => {
    setBackgroundOn(ids, (cur) => applied(i.bg, cur), 'Background');
    pushRecent('backgrounds', i.key);
  };
  const preview = (i: Item, ids = targets) =>
    openApplyPreview({
      title: `Background: ${i.name}`,
      changes: 'The background only',
      keeps: 'Titles, text styles, badges, icons and layout',
      pageIds: ids,
      build: (p) => ({ ...p, background: applied(i.bg, p.background) }),
      apply: () => apply(i, ids),
    });
  const menuFor = (i: Item, extra: ContextMenuItem[] = []) => (x: number, y: number) =>
    openMenu(x, y, [
      { label: targets.length > 1 ? `Apply to ${targets.length} selected pages` : 'Apply to this page', onClick: () => apply(i) },
      { label: 'Preview before applying…', onClick: () => preview(i) },
      ...(nPages > 1 && targets.length < nPages ? [{ label: `Apply to all ${nPages} pages…`, onClick: () => preview(i, useDoc.getState().doc.pages.map((p) => p.id)) }] : []),
      { separator: true },
      { label: favs.has(i.key) ? 'Remove from favourites' : 'Add to favourites', onClick: () => favs.toggle(i.key) },
      { label: 'Save a copy to My backgrounds', onClick: () => void savePreset('background', i.name, i.bg) },
      ...extra,
    ]);
  const tile = (i: Item, extra?: ContextMenuItem[]) => (
    <LibTile key={i.key} className="checker-tile" title={`${i.name}${i.desc ? ` — ${i.desc}` : ''}\nClick to apply · right-click to preview or for more`} label={i.name} onClick={() => apply(i)} onMenu={menuFor(i, extra)} fav={favs.has(i.key)} onFav={() => favs.toggle(i.key)}>
      <BgThumb bg={i.bg} />
    </LibTile>
  );
  const grid = (list: Item[], extra?: (i: Item) => ContextMenuItem[]) => <div className="tile-grid">{list.map((i) => tile(i, extra?.(i)))}</div>;

  const solid = PRESETS.filter((p) => GROUP_OF.get(p.key) === 'Solid');
  const cur = page.background;
  const mineShown = mine.filter(show);
  const favShown = everything.filter((i) => favs.has(i.key) && show(i));
  const recentShown = recents.map((k) => byKey.get(k)).filter((i): i is Item => !!i && show(i)).slice(0, 6);

  return (
    <>
      <div className="panel-body-head">{switcher}</div>
      <div className="panel-body">
        <ScopeNote what="Backgrounds" />
        <TextCheck />
        <div data-tour="bg-search" />
        <LibraryBar<Filter>
          q={q}
          onQ={setQ}
          placeholder="Search backgrounds"
          value={filter}
          onChange={setFilter}
          chips={[
            { value: 'all', label: 'All' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'fav', label: 'Favourites', count: favs.list.length },
          ]}
        />
        <div data-tour="bg-customize" />
        <Fold id="bg-customize" title="Customize this background" desc="Colours, gradient, pattern, glow and vignette of the page you are on">
          <div className="bg-custom insp">
            <BackgroundEditor />
          </div>
        </Fold>
        <Fold
          id="bg-mine"
          title="My backgrounds"
          count={mine.length}
          desc="Saved on this computer — available in every project"
          defaultOpen={mine.length > 0}
          right={
            <span className="row" style={{ gap: 2 }}>
              <button className="btn ghost sm" title="Save this page's background" onClick={() => void askText({ title: 'Save background', value: 'My background', okLabel: 'Save' }).then((n) => n && void savePreset('background', n, { ...page.background, image: { ...page.background.image } }))}>
                <Save size={13} /> Save
              </button>
              <button className="btn ghost icon sm" title="Import backgrounds from another project" aria-label="Import backgrounds from another project" onClick={() => openDialog('importLooks', 'background')}>
                <FolderInput size={13} />
              </button>
            </span>
          }
        >
          {mineShown.length ? (
            grid(mineShown, (i) => {
              const p = saved.find((x) => `u:${x.id}` === i.key)!;
              return [
                { separator: true },
                { label: 'Rename…', onClick: () => void askText({ title: 'Rename background', value: p.name, okLabel: 'Rename' }).then((n) => n && void renamePreset(p, n)) },
                { label: 'Duplicate', onClick: () => void duplicatePreset(p) },
                { label: 'Update with this page’s background', onClick: () => void updatePresetData(p, page.background) },
                { separator: true },
                { label: 'Delete…', danger: true, onClick: () => void askConfirm({ title: `Delete background “${p.name}”?`, message: 'Pages already using it keep their background.', danger: true }).then((ok) => ok && void deletePreset(p.id)) },
              ];
            })
          ) : (
            <div className="muted small fold-empty">{mine.length ? 'No saved background matches.' : 'Customize a background, then Save to reuse it in any project.'}</div>
          )}
        </Fold>
        {filter !== 'fav' && favShown.length > 0 && (
          <Fold id="bg-favs" title="Favourites" count={favShown.length} defaultOpen>
            {grid(favShown)}
          </Fold>
        )}
        {!needle && filter === 'all' && recentShown.length > 0 && (
          <Fold id="bg-recent" title="Recently used" count={recentShown.length}>
            {grid(recentShown)}
          </Fold>
        )}
        {matched.some(show) && (
          <Fold id="bg-matched" title="From your icons" count={matched.length} desc="Pick a base colour — from your icons, a matching colour or any hue" defaultOpen>
            <MatchColorPicker palette={palette} value={matchColor} />
            {grid(matched.filter(show))}
          </Fold>
        )}
        {!needle && filter === 'all' && (
          <>
            <div className="group-label">Solid colour</div>
            <div className="swatch-grid">
              {solid.map((p) => (
                <button key={p.key} className={`swatch ${cur.type === 'solid' && cur.color.toLowerCase() === p.bg.color.toLowerCase() ? 'on' : ''}`} title={`${p.name} ${p.bg.color}`} aria-label={p.name} style={{ background: p.bg.color }} onClick={() => apply(p)} />
              ))}
              <label className="swatch custom" title="Any colour…">
                <input
                  type="color"
                  value={cur.type === 'solid' ? cur.color : '#808080'}
                  onChange={(e) => setBackground((b) => ({ ...completeBackground(b), type: 'solid', color: e.target.value, pattern: { ...completeBackground(b).pattern, enabled: false }, light: { ...completeBackground(b).light, enabled: false } }), 'solid-pick')}
                />
              </label>
            </div>
          </>
        )}
        {BG_GROUPS.map((g, i) => {
          const list = PRESETS.filter((p) => GROUP_OF.get(p.key) === g.id && show(p));
          return list.length ? (
            <Fold key={g.id} id={`bg-${g.id}`} title={g.label} count={list.length} desc={g.desc} defaultOpen={i === 0 || !!needle}>
              {grid(list)}
            </Fold>
          ) : null;
        })}
        {needle && !everything.some(show) && <div className="muted small fold-empty">No background matches “{q}”.</div>}
        <div className="group-label">
          <span className="grow">Your images</span>
          <button className="btn ghost sm" onClick={() => openFilePicker('background')} title="Import background images (kept separate from assets)">
            <Images size={13} /> Import
          </button>
          <button className="btn ghost icon sm" onClick={() => openFolderPicker('background')} title="Import a folder of backgrounds" aria-label="Import a folder of backgrounds">
            <FolderOpen size={13} />
          </button>
        </div>
        {imgs.length ? (
          <div className="tile-grid">
            {imgs.map((a) => {
              const url = images.thumbs.get(a.id);
              const on = cur.type === 'image' && cur.image.assetId === a.id;
              return (
                <div
                  key={a.id}
                  className={`bgtile ${on ? 'on' : ''}`}
                  title={`${a.name} — click to set as background (or drag onto the canvas)`}
                  onClick={() => setBackgroundOn(targets, (b) => ({ ...b, type: 'image', image: { ...b.image, assetId: a.id } }), 'Background image')}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-showcase-assets', JSON.stringify([a.id]))}
                >
                  {url ? <img src={url} alt="" /> : <span className="spinner" />}
                  <span>{a.name}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted small" style={{ padding: '2px 12px 8px' }}>
            Use your own artwork or a screenshot as the backdrop. Imported images stay separate from your assets.
          </div>
        )}
      </div>
    </>
  );
}
