// Themes library: a theme sets the background and recolours the title, subtitle, badges and panels
// of the pages it is applied to. Words, icons and layout never change.

import { useMemo, useState } from 'react';
import { ClipboardPaste, FolderInput, Save, Shuffle } from 'lucide-react';
import { matchedThemes, matchedVariants, rebasePalette } from '../../core/palette';
import { THEMES, themeReadability, themeTone, type Theme } from '../../core/themes';
import { useDoc, usePage } from '../../state/doc';
import { applyTheme, themedPage } from '../../state/themes';
import { copyShareCode, duplicatePreset, renamePreset, saveThemeFromPage, updateThemeFromPage, useCustomThemes, MY_THEME_PREFIX } from '../../state/customPresets';
import { deletePreset } from '../../state/presets';
import { openDialog, useUI } from '../../state/ui';
import type { ContextMenuItem } from '../../state/ui';
import { ThemeThumb } from '../components/ThemeThumb';
import { usePalette } from '../components/usePalette';
import { askConfirm, askText } from '../components/ask';
import { openMenu } from '../menus';
import { Fold, MatchColorPicker } from './LeftPanel';
import { LibraryBar, LibTile, openApplyPreview, pushRecent, ScopeNote, useFavorites, useRecents, useTargetPages } from './libraryKit';

type Filter = 'all' | 'light' | 'dark' | 'fav';

const THEME_GROUPS: { id: string; desc: string }[] = [
  { id: 'Professional', desc: 'Restrained type and calm backgrounds — product shots, UI kits, store pages' },
  { id: 'Palettes', desc: 'Muted, pastel, industrial and deep premium colour schemes' },
  { id: 'Genres', desc: 'Fantasy, sci-fi, horror and other game genres' },
  { id: 'Seasons & events', desc: 'Winter, Halloween, Christmas, spring…' },
  { id: 'Styles', desc: 'Retro, cute, gothic, minimal and more' },
];
const THEME_GROUP_OF: Record<string, string> = {
  winter: 'Seasons & events',
  halloween: 'Seasons & events',
  christmas: 'Seasons & events',
  autumn: 'Seasons & events',
  spring: 'Seasons & events',
  valentine: 'Seasons & events',
  summer: 'Seasons & events',
  candy: 'Styles',
  cyberpunk: 'Styles',
  'minimal-light': 'Styles',
  'minimal-dark': 'Styles',
  mono: 'Styles',
  retro: 'Styles',
  kawaii: 'Styles',
  gothic: 'Styles',
  royal: 'Styles',
};
const groupOf = (t: Theme) => t.group ?? THEME_GROUP_OF[t.id] ?? 'Genres';

/** Readability note under a tile: only shown when the title may be hard to read. */
function ReadNote({ t }: { t: Theme }) {
  const r = themeReadability(t);
  if (r.level === 'good' || r.level === 'unknown') return null;
  return (
    <span className={`read-note ${r.level}`} title={`Title contrast about ${r.ratio}:1 on this theme's own background. Outlines and panels can still make it readable — check the preview.`}>
      {r.level === 'poor' ? 'Low contrast' : 'Check contrast'}
    </span>
  );
}

export function previewTheme(t: Theme, pageIds: string[]) {
  const r = themeReadability(t);
  openApplyPreview({
    title: `Theme: ${t.name}`,
    changes: 'Background, title look, subtitle colour, badges, panels and accent shapes',
    keeps: 'Your words, icons, layout, sizes and positions',
    pageIds,
    build: (p) => themedPage(p, t),
    apply: () => {
      applyTheme(t, pageIds);
      pushRecent('themes', t.id);
    },
    note: r.ratio !== null ? `Title contrast on this theme's background: about ${r.ratio}:1 (${r.level === 'good' ? 'easy to read' : r.level === 'fair' ? 'readable at large sizes' : 'may be hard to read without an outline or panel'}).` : undefined,
  });
}

export function ThemesTab() {
  const page = usePage();
  const targets = useTargetPages();
  const palette = usePalette();
  const matchColor = useUI((s) => s.matchColor);
  const seed = useUI((s) => s.matchSeed);
  const base = useMemo(() => (palette ? (matchColor ? rebasePalette(palette, matchColor) : palette) : matchColor ? rebasePalette(null, matchColor) : null), [palette, matchColor]);
  const variants = useMemo(() => (base ? matchedVariants(base, seed) : []), [base, seed]);
  const bold = useMemo(() => (base ? matchedThemes(base) : []), [base]);
  const mine = useCustomThemes();
  const favs = useFavorites('themes');
  const recents = useRecents('themes');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const nPages = useDoc((s) => s.doc.pages.length);

  const all = useMemo(() => [...mine.map((m) => m.theme), ...variants, ...bold, ...THEMES], [mine, variants, bold]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const tones = useMemo(() => new Map(all.map((t) => [t.id, themeTone(t)])), [all]);
  const needle = q.trim().toLowerCase();
  const show = (t: Theme) => (!needle || `${t.name} ${t.blurb}`.toLowerCase().includes(needle)) && (filter === 'all' || (filter === 'fav' ? favs.has(t.id) : tones.get(t.id) === filter));
  const apply = (t: Theme) => {
    applyTheme(t, targets);
    pushRecent('themes', t.id);
  };
  const current = page.lookId;

  const menuFor = (t: Theme, extra: ContextMenuItem[] = []): ((x: number, y: number) => void) => (x, y) =>
    openMenu(x, y, [
      { label: targets.length > 1 ? `Apply to ${targets.length} selected pages` : 'Apply to this page', onClick: () => apply(t) },
      { label: 'Preview before applying…', onClick: () => previewTheme(t, targets) },
      ...(nPages > 1 && targets.length < nPages ? [{ label: `Apply to all ${nPages} pages…`, onClick: () => previewTheme(t, useDoc.getState().doc.pages.map((p) => p.id)) }] : []),
      { separator: true },
      { label: favs.has(t.id) ? 'Remove from favourites' : 'Add to favourites', onClick: () => favs.toggle(t.id) },
      ...extra,
    ]);

  const tile = (t: Theme, extra?: ContextMenuItem[]) => (
    <LibTile
      key={t.id}
      className="theme-tile"
      title={`${t.name} — ${t.blurb}\nClick to apply · right-click to preview or for more`}
      label={t.name}
      on={current === t.id}
      onClick={() => apply(t)}
      onMenu={menuFor(t, extra)}
      fav={favs.has(t.id)}
      onFav={() => favs.toggle(t.id)}
      note={<ReadNote t={t} />}
    >
      <ThemeThumb theme={t} />
    </LibTile>
  );
  const grid = (list: Theme[], extra?: (t: Theme) => ContextMenuItem[]) => <div className="theme-grid">{list.map((t) => tile(t, extra?.(t)))}</div>;

  const mineShown = mine.filter((m) => show(m.theme));
  const recentShown = recents.map((id) => byId.get(id)).filter((t): t is Theme => !!t && show(t)).slice(0, 6);
  const favShown = all.filter((t) => favs.has(t.id) && show(t));
  const curPreset = current?.startsWith(MY_THEME_PREFIX) ? mine.find((m) => m.theme.id === current)?.preset : undefined;

  const saveMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: 'Save as new theme…', onClick: () => void askText({ title: 'Save theme', message: "The page's background, its biggest text's look, the next text's colour and the first badge's colours. Words and icons are not saved.", value: 'My theme', okLabel: 'Save' }).then((n) => n && void saveThemeFromPage(n)) },
      ...(curPreset ? [{ label: `Update “${curPreset.name}” with this page`, onClick: () => void updateThemeFromPage(curPreset) }] : []),
      { separator: true },
      { label: 'Import from a project…', onClick: () => openDialog('importLooks') },
      { label: 'Import share code…', onClick: () => openDialog('shareCode', { mode: 'import', kind: 'theme' }) },
    ]);
  };

  return (
    <div className="panel-body">
      <ScopeNote what="Themes" />
      <LibraryBar<Filter>
        q={q}
        onQ={setQ}
        placeholder="Search themes"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'all', label: 'All' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'fav', label: 'Favourites', count: favs.list.length },
        ]}
      />
      <Fold
        id="th-mine"
        title="My themes"
        count={mine.length}
        desc="Saved on this computer — available in every project"
        defaultOpen
        right={
          <span className="row" style={{ gap: 2 }}>
            <button className="btn ghost sm" title="Save this page's look as a theme, update one, or import" onClick={saveMenu} data-tour="theme-save">
              <Save size={13} /> Save
            </button>
            <button className="btn ghost icon sm" title="Import looks from another project" aria-label="Import looks from another project" onClick={() => openDialog('importLooks')}>
              <FolderInput size={13} />
            </button>
            <button className="btn ghost icon sm" title="Import a share code" aria-label="Import a share code" onClick={() => openDialog('shareCode', { mode: 'import', kind: 'theme' })} data-tour="theme-code">
              <ClipboardPaste size={13} />
            </button>
          </span>
        }
      >
        {mineShown.length ? (
          grid(
            mineShown.map((m) => m.theme),
            (t) => {
              const preset = mine.find((m) => m.theme.id === t.id)!.preset;
              return [
                { separator: true },
                { label: 'Update with this page’s look', onClick: () => void updateThemeFromPage(preset) },
                { label: 'Rename…', onClick: () => void askText({ title: 'Rename theme', value: preset.name, okLabel: 'Rename' }).then((n) => n && void renamePreset(preset, n)) },
                { label: 'Duplicate', onClick: () => void duplicatePreset(preset) },
                { label: 'Copy share code', onClick: () => void copyShareCode(preset, (code) => openDialog('shareCode', { mode: 'show', code, name: preset.name })) },
                { separator: true },
                {
                  label: 'Delete…',
                  danger: true,
                  onClick: () =>
                    void askConfirm({ title: `Delete theme “${preset.name}”?`, message: 'Pages already styled with it keep their look.', danger: true }).then((ok) => {
                      if (ok) void deletePreset(preset.id);
                    }),
                },
              ];
            },
          )
        ) : (
          <div className="muted small fold-empty">{mine.length ? 'No saved theme matches.' : 'None yet. Style a page the way you like, then Save.'}</div>
        )}
      </Fold>
      {filter !== 'fav' && favShown.length > 0 && (
        <Fold id="th-favs" title="Favourites" count={favShown.length} defaultOpen>
          {grid(favShown)}
        </Fold>
      )}
      {!needle && filter === 'all' && recentShown.length > 0 && (
        <Fold id="th-recent" title="Recently used" count={recentShown.length}>
          {grid(recentShown)}
        </Fold>
      )}
      {base && (variants.some(show) || bold.some(show)) && (
        <Fold
          id="th-matched"
          title="From your icons"
          count={variants.length + bold.length}
          desc="Built from your icons' colours. Pick the main colour, or shuffle the accents"
          defaultOpen
          right={
            <button className="btn ghost sm" title="Other accent colours for the clean variants" onClick={() => useUI.setState({ matchSeed: seed + 1 })}>
              <Shuffle size={13} /> Shuffle
            </button>
          }
        >
          <MatchColorPicker palette={palette} value={matchColor} />
          {variants.some(show) && (
            <>
              <div className="sub-label">Clean</div>
              {grid(variants.filter(show))}
            </>
          )}
          {bold.some(show) && (
            <>
              <div className="sub-label">Bold</div>
              {grid(bold.filter(show))}
            </>
          )}
        </Fold>
      )}
      <div data-tour="theme-pro" />
      {THEME_GROUPS.map((g, i) => {
        const list = THEMES.filter((t) => groupOf(t) === g.id && show(t));
        return list.length ? (
          <Fold key={g.id} id={`th-${g.id}`} title={g.id} count={list.length} desc={g.desc} defaultOpen={i === 0 || !!needle}>
            {grid(list)}
          </Fold>
        ) : null;
      })}
      {needle && !all.some(show) && <div className="muted small fold-empty">No theme matches “{q}”.</div>}
    </div>
  );
}
