// Templates library. Clicking a template adds it as a new page or rebuilds the open page (Options).
// Right-click any template for an explicit scope: new page, replace page, or only its layout,
// background or text style — the parts not named stay exactly as they are.

import { useMemo, useState, type ReactNode } from 'react';
import { Contrast, Copy, Download, FolderInput, Layers3, LayoutGrid, MoreHorizontal, Replace, Save, Shuffle, Star, Store, Wand2 } from 'lucide-react';
import type { Page } from '../../core/types';
import { useDoc, usePage, getDoc } from '../../state/doc';
import { BUILTIN_TEMPLATES, builtinForPage, createFromTemplate, createFromUserTemplate, previewTemplate, previewUserTemplate, saveCurrentAsTemplate, templateDataFromPage, TEMPLATE_FORMATS, TEMPLATE_GROUPS, templateGroup, toTemplateOptions, userTemplateForPage, workingAssets, type TemplateData, type TemplateDef } from '../../state/generators';
import { isLiveTemplate, resolveTheme, setTemplateOption, shownTemplateOptions, themeChoices } from '../../state/templateOptions';
import { applyScope, applyTemplateScope, SCOPE_LABEL, type TemplateScope } from '../../state/templateApply';
import { copyShareCode, duplicatePreset, renamePreset, updatePresetData, useCustomThemes } from '../../state/customPresets';
import { deletePreset, usePresets } from '../../state/presets';
import { usePrefs } from '../../state/prefs';
import { rebasePalette } from '../../core/palette';
import { exportTemplateFile, importTemplateFile } from '../../state/templateFiles';
import { openDialog, useUI, type ContextMenuItem } from '../../state/ui';
import type { StoredPreset } from '../../core/types';
import { PagePreview } from '../components/PagePreview';
import { Seg, Select } from '../components/controls';
import { usePalette } from '../components/usePalette';
import { askConfirm, askText } from '../components/ask';
import { openMenu } from '../menus';
import { Fold } from './LeftPanel';
import { LibraryBar, openApplyPreview, pushRecent, useFavorites, useRecents, useTargetPages } from './libraryKit';

type Filter = 'all' | 'fav' | 'mine';

export function TemplatesTab() {
  const user = usePresets<TemplateData>('template');
  const sel = useUI((s) => s.librarySel.length);
  const nAssets = useDoc((s) => s.doc.assets.filter((a) => a.kind === 'asset').length);
  const page = usePage();
  const targets = useTargetPages();
  const bgKey = JSON.stringify([page.background.type, page.background.color, page.background.gradient.stops]);
  const defaults = useUI((s) => s.templateUi);
  const target = usePrefs((s) => s.templateTarget);
  const palette = usePalette();
  const matchColor = useUI((s) => s.matchColor);
  const base = useMemo(() => (matchColor ? rebasePalette(palette, matchColor) : palette), [palette, matchColor]);
  const mine = useCustomThemes();
  const seed = useUI((s) => s.matchSeed);
  const allThemes = useMemo(() => themeChoices(base, mine.map((m) => m.theme), seed), [base, mine, seed]);
  // a page made from a built-in template has its own options; other pages show the defaults for new ones
  const ui = shownTemplateOptions(page, defaults);
  const setUi = (patch: Partial<typeof ui>) => setTemplateOption(page, patch, allThemes);
  const theme = resolveTheme(ui.themeId, allThemes, page.fromTemplate?.id);
  const fmt = TEMPLATE_FORMATS.find((c) => c.label === ui.size);
  const opts = toTemplateOptions(ui, theme);
  const optsKey = `${ui.text}|${ui.icons}|${theme?.id ?? ''}|${ui.themeParts}|${ui.size}|${base?.colors.join('') ?? ''}`;
  const liveTpl = isLiveTemplate(page) ? BUILTIN_TEMPLATES.find((t) => t.id === page.fromTemplate!.id) : undefined;
  const knownLook = ui.themeId === 'auto' || ui.themeId === 'none' || allThemes.some((t) => t.id === ui.themeId);
  const favs = useFavorites('templates');
  const recents = useRecents('templates');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const needle = q.trim().toLowerCase();
  const showB = (t: TemplateDef) => filter !== 'mine' && (!needle || `${t.name} ${t.description} ${templateGroup(t)}`.toLowerCase().includes(needle)) && (filter !== 'fav' || favs.has(t.id));
  const showU = (t: StoredPreset<TemplateData>) => filter !== 'fav' || favs.has('u:' + t.id) ? !needle || t.name.toLowerCase().includes(needle) : false;

  // ---- actions shared by built-in and saved templates ----
  type Src = { key: string; name: string; full: (target: 'new' | 'replace' | 'pref') => void; forPage: (p: Page) => Page };
  // the options for one template: 'auto' resolves to the look the template is designed with, if any
  const optsFor = (t: TemplateDef) => (t.look && ui.themeId === 'auto' ? toTemplateOptions(ui, resolveTheme('auto', allThemes, t.id)) : opts);
  const builtin = (t: TemplateDef): Src => ({
    key: t.id,
    name: t.name,
    full: (where) => createFromTemplate(t, workingAssets(), undefined, optsFor(t), where, ui),
    forPage: (p) => builtinForPage(t, p, optsFor(t)),
  });
  const saved = (t: StoredPreset<TemplateData>): Src => ({
    key: 'u:' + t.id,
    name: t.name,
    full: (where) => createFromUserTemplate(t.data, workingAssets(), where, t.id),
    forPage: (p) => userTemplateForPage(t.data, p),
  });
  const run = (s: Src, where: 'new' | 'replace' | 'pref') => {
    s.full(where);
    pushRecent('templates', s.key);
  };
  const scoped = (s: Src, scope: TemplateScope, ids = targets) => {
    applyTemplateScope(ids, s.forPage, scope, s.name);
    pushRecent('templates', s.key);
  };
  const preview = (s: Src, scope: TemplateScope) =>
    openApplyPreview({
      title: `${s.name} — ${SCOPE_LABEL[scope].label.toLowerCase()}`,
      changes: SCOPE_LABEL[scope].changes,
      keeps: SCOPE_LABEL[scope].keeps,
      pageIds: targets,
      build: (p) => applyScope(p, s.forPage(p), scope),
      apply: () => scoped(s, scope),
    });
  const menuFor = (s: Src, extra: ContextMenuItem[] = []) => (x: number, y: number) => {
    const n = targets.length;
    const on = n > 1 ? ` (${n} pages)` : '';
    openMenu(x, y, [
      { label: 'Add as a new page', onClick: () => run(s, 'new') },
      { label: 'Replace this page', onClick: () => run(s, 'replace') },
      { separator: true },
      ...(['layout', 'background', 'text'] as TemplateScope[]).map((sc) => ({ label: `${SCOPE_LABEL[sc].label}${on}`, onClick: () => scoped(s, sc) })),
      { label: 'Preview a scope…', onClick: () => openMenu(x + 12, y + 12, (['layout', 'background', 'text'] as TemplateScope[]).map((sc) => ({ label: SCOPE_LABEL[sc].label, onClick: () => preview(s, sc) }))) },
      { separator: true },
      { label: favs.has(s.key) ? 'Remove from favourites' : 'Add to favourites', onClick: () => favs.toggle(s.key) },
      ...extra,
    ]);
  };

  const builtTile = (t: TemplateDef, i: number) => {
    const s = builtin(t);
    return (
      <div key={t.id} className={`tpl-mini-wrap ${favs.has(t.id) ? 'is-fav' : ''}`}>
        <button
          className="tpl-mini"
          title={`${t.name} — ${t.description}\nClick: ${target === 'new' ? 'add as a new page' : 'replace this page'} · right-click: layout, background or text style only`}
          onClick={() => run(s, 'pref')}
          onContextMenu={(e) => {
            e.preventDefault();
            menuFor(s)(e.clientX, e.clientY);
          }}
        >
          <div className="tpl-mini-prev">
            {nAssets ? (
              <PagePreview cacheKey={`tpl|${t.id}|${nAssets}|${sel}|${bgKey}|${optsKey}`} width={260} delay={50 * i} build={() => previewTemplate(t, workingAssets(), undefined, 120, optsFor(t))} className="fill" />
            ) : (
              <div className="ratio">
                <div style={{ width: ((fmt?.w ?? t.w) * 44) / Math.max(fmt?.w ?? t.w, fmt?.h ?? t.h), height: ((fmt?.h ?? t.h) * 44) / Math.max(fmt?.w ?? t.w, fmt?.h ?? t.h) }} />
              </div>
            )}
          </div>
          <b>{t.name}</b>
          <small>{fmt ? `${fmt.w} × ${fmt.h}` : `${t.w} × ${t.h}`}</small>
        </button>
        <button className={`tile-star ${favs.has(t.id) ? 'on' : ''}`} title={favs.has(t.id) ? 'Remove from favourites' : 'Add to favourites'} aria-label={favs.has(t.id) ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={favs.has(t.id)} onClick={() => favs.toggle(t.id)}>
          <Star size={12} />
        </button>
        <button className="tile-more" title="Scopes: new page, replace, layout, background or text style only" aria-label={`More for ${t.name}`} onClick={(e) => menuFor(s)(e.clientX - 180, e.clientY + 10)}>
          <MoreHorizontal size={14} />
        </button>
      </div>
    );
  };

  const builtShown = BUILTIN_TEMPLATES.filter(showB);
  const userShown = user.filter(showU);
  const recentBuilt = !needle && filter === 'all' ? recents.map((k) => BUILTIN_TEMPLATES.find((t) => t.id === k)).filter((t): t is TemplateDef => !!t).slice(0, 4) : [];
  const fromUser = page.userTemplateId ? user.find((t) => t.id === page.userTemplateId) : undefined;

  const saveMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const baseName = liveTpl ? `${liveTpl.name} variant` : fromUser ? `${fromUser.name} variant` : page.name;
    openMenu(r.left, r.bottom + 4, [
      { label: 'Save page as template…', onClick: () => openDialog('saveTemplate') },
      { label: 'Save as new variant…', onClick: () => void askText({ title: 'Save as new variant', message: 'A copy of this page’s layout, text and look, saved next to your other templates.', value: baseName, okLabel: 'Save' }).then((n) => n && void saveCurrentAsTemplate(n)) },
      ...(fromUser ? [{ label: `Update “${fromUser.name}” with this page`, onClick: () => void updatePresetData(fromUser, templateDataFromPage(getPageNow())) }] : []),
      { separator: true },
      { label: 'Import from a project…', onClick: () => openDialog('importLooks', 'template') },
      { label: 'Import template file…', onClick: importTemplateFile },
      { label: 'Import share code…', onClick: () => openDialog('shareCode', { mode: 'import', kind: 'template' }) },
    ]);
  };

  return (
    <div className="panel-body">
      <Fold id="tpl-tools" title="Production tools" desc="Whole sets, catalogs, variations and comparisons in one step">
        <div style={{ padding: '0 6px' }}>
          <ToolBtn icon={<Store size={14} />} label="Create Marketplace Set…" note="hero · cover · catalog" onClick={() => openDialog('marketplace')} />
          <ToolBtn icon={<LayoutGrid size={14} />} label="Generate Catalog…" note="numbered grid" onClick={() => openDialog('catalog')} />
          <ToolBtn icon={<Layers3 size={14} />} label="Category Showcase…" note="page per category" onClick={() => openDialog('categoryShowcase')} />
          <ToolBtn icon={<Replace size={14} />} label="Replace Asset Set…" note="reuse a composition" onClick={() => openDialog('replaceSet')} />
          <ToolBtn icon={<Shuffle size={14} />} label="Generate Variations…" note="many compositions" onClick={() => openDialog('variations')} />
          <ToolBtn icon={<Contrast size={14} />} label="Color vs Grayscale…" note="comparison page" onClick={() => openDialog('compare')} />
        </div>
      </Fold>
      <div data-tour="tpl-options" />
      <Fold id="tpl-options" title="Options" right={<span className="fold-summary">{liveTpl ? 'This page' : target === 'new' ? 'New page' : 'Replace page'}{fmt ? ` · ${fmt.w}×${fmt.h}` : ''}</span>}>
        <div className="tpl-opts">
          <div className="tpl-opts-row">
            <label>Click adds</label>
            <Seg
              small
              value={target}
              onChange={(templateTarget) => usePrefs.getState().setPrefs({ templateTarget })}
              options={[
                { value: 'new', label: 'A new page', title: 'Each template you click becomes a new page' },
                { value: 'replace', label: 'Replaces this page', title: 'The template rebuilds the page you are on; your title and subtitle words carry over (Ctrl+Z to undo)' },
              ]}
            />
          </div>
          <div className="tpl-opts-row">
            <label>Format</label>
            <Select value={ui.size} onChange={(size) => setUi({ size })} options={[{ value: '', label: 'Each template’s own size' }, ...TEMPLATE_FORMATS.map((c) => ({ value: c.label, label: c.label, group: c.group }))]} />
          </div>
          <div className="tpl-opts-row">
            <label>Look</label>
            <Select
              value={ui.themeId}
              onChange={(themeId) => setUi({ themeId })}
              options={[
                { value: 'auto', label: palette ? 'Your icons’ colours (auto)' : 'Studio dark (auto)' },
                { value: 'none', label: 'Each template’s own look' },
                ...(knownLook ? [] : [{ value: ui.themeId, label: 'Current look (theme no longer listed)' }]),
                ...allThemes.map((t) => ({ value: t.id, label: t.name, group: t.id.startsWith('match-') ? 'From your icons' : t.id.startsWith('my:') ? 'My themes' : t.group ?? 'Game themes' })),
              ]}
            />
          </div>
          {ui.themeId !== 'none' && (
            <div className="tpl-opts-row">
              <label>Theme</label>
              <Seg
                small
                value={ui.themeParts}
                onChange={(themeParts) => setUi({ themeParts })}
                options={[
                  { value: 'all', label: 'Everything', title: 'Background, title, labels, badges and panels' },
                  { value: 'bg', label: 'Background', title: 'Only the background follows the theme' },
                  { value: 'text', label: 'Text', title: 'Only text, badges and panels follow the theme' },
                ]}
              />
            </div>
          )}
          <div className="tpl-opts-row">
            <label>Text</label>
            <Seg
              small
              value={ui.text}
              onChange={(text) => setUi({ text })}
              options={[
                { value: 'keep', label: 'As designed' },
                { value: 'smooth', label: 'Smooth' },
                { value: 'pixel-soft', label: 'Pixel', title: 'Pixel-art text with fine blocks' },
                { value: 'pixel', label: 'Pixel ++', title: 'Chunky pixel-art text' },
              ]}
            />
          </div>
          <div className="tpl-opts-row">
            <label>Icons</label>
            <Seg
              small
              value={ui.icons}
              onChange={(icons) => setUi({ icons })}
              options={[
                { value: 0.7, label: 'Smaller' },
                { value: 1, label: 'Normal' },
                { value: 1.35, label: 'Bigger' },
              ]}
            />
          </div>
          {liveTpl ? (
            <div className="tpl-live">
              <span className="tpl-live-dot" /> These are “{page.name}”’s own options ({liveTpl.name}). Text changes only the pixel style; Look restyles colours.
            </div>
          ) : (
            <div className="muted small">Options for the next template you add. Pages made from a template keep their own.</div>
          )}
          <div className="muted small">
            {sel ? (
              <>
                Uses the {sel} selected icons ·{' '}
                <button className="link-btn" onClick={() => useUI.setState({ librarySel: [] })}>
                  use all {nAssets}
                </button>
              </>
            ) : nAssets ? (
              `Uses all ${nAssets} icons — select some in Assets to use only those.`
            ) : (
              'Import icons first — templates fill with your icons.'
            )}
          </div>
        </div>
      </Fold>
      <LibraryBar<Filter>
        q={q}
        onQ={setQ}
        placeholder="Search templates"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'all', label: 'All' },
          { value: 'fav', label: 'Favourites', count: favs.list.length },
          { value: 'mine', label: 'Mine', count: user.length },
        ]}
      />
      <Fold
        id="tpl-mine"
        title="My templates"
        count={user.length}
        desc="Saved on this computer — available in every project"
        defaultOpen
        right={
          <span className="row" style={{ gap: 2 }}>
            <button className="btn ghost sm" title="Save this page as a template, a variant, or update the one it came from" onClick={saveMenu} data-tour="tpl-save">
              <Save size={13} /> Save
            </button>
            <button className="btn ghost icon sm" title="Import templates from another project" aria-label="Import templates from another project" onClick={() => openDialog('importLooks', 'template')}>
              <FolderInput size={13} />
            </button>
          </span>
        }
      >
        {userShown.length ? (
          <div className="tpl-list">
            {userShown.map((t) => {
              const s = saved(t);
              const extra: ContextMenuItem[] = [
                { separator: true },
                { label: 'Rename…', onClick: () => void askText({ title: 'Rename template', value: t.name, okLabel: 'Rename' }).then((n) => n && void renamePreset(t, n)) },
                { label: 'Duplicate', onClick: () => void duplicatePreset(t) },
                { label: 'Copy share code', onClick: () => void copyShareCode(t, (code) => openDialog('shareCode', { mode: 'show', code, name: t.name })) },
                { label: 'Export as a file…', onClick: () => void exportTemplateFile(t) },
                { separator: true },
                { label: 'Delete…', danger: true, onClick: () => void askConfirm({ title: `Delete template “${t.name}”?`, message: 'Pages already made from it stay as they are.', danger: true }).then((ok) => ok && void deletePreset(t.id)) },
              ];
              return (
                <TemplateCard
                  key={t.id}
                  name={t.name}
                  fav={favs.has(s.key)}
                  w={t.data.page.width}
                  h={t.data.page.height}
                  desc={t.data.page.templateLayout ? `Layout: ${t.data.page.templateLayout.algorithm}${t.data.page.templateLayout.slots?.length ? ` · ${t.data.page.templateLayout.slots.length} slots` : ''}` : 'No layout'}
                  onClick={() => run(s, 'pref')}
                  onMenu={(x, y) => menuFor(s, extra)(x, y)}
                  preview={<PagePreview cacheKey={`utpl|${t.id}|${nAssets}|${sel}`} width={460} delay={80} build={() => previewUserTemplate(t.data, workingAssets())} />}
                  actions={
                    <>
                      <button className={`btn ghost icon sm ${favs.has(s.key) ? 'fav-on' : ''}`} title={favs.has(s.key) ? 'Remove from favourites' : 'Add to favourites'} aria-label="Favourite" aria-pressed={favs.has(s.key)} onClick={() => favs.toggle(s.key)}>
                        <Star size={12} />
                      </button>
                      <button className="btn ghost icon sm" title="Duplicate template" aria-label={`Duplicate ${t.name}`} onClick={() => void duplicatePreset(t)}>
                        <Copy size={12} />
                      </button>
                      <button className="btn ghost icon sm" title="Export as a file to share or back up" aria-label={`Export ${t.name}`} onClick={() => void exportTemplateFile(t)}>
                        <Download size={12} />
                      </button>
                      <button className="btn ghost icon sm" title="Scopes, rename, share code, delete" aria-label={`More for ${t.name}`} onClick={(e) => menuFor(s, extra)(e.clientX - 200, e.clientY + 10)}>
                        <MoreHorizontal size={12} />
                      </button>
                    </>
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="muted small fold-empty">{user.length ? 'No saved template matches.' : 'Use Save to reuse this page’s layout, text and background in any project.'}</div>
        )}
      </Fold>
      {recentBuilt.length > 0 && (
        <Fold id="tplg-recent" title="Recently used" count={recentBuilt.length}>
          <div className="tpl-grid">{recentBuilt.map((t, i) => builtTile(t, i))}</div>
        </Fold>
      )}
      {TEMPLATE_GROUPS.map((g, gi) => {
        const list = builtShown.filter((t) => templateGroup(t) === g.id);
        if (!list.length) return null;
        return (
          <Fold key={g.id} id={`tplg-${g.id}`} title={g.id} count={list.length} desc={g.desc} defaultOpen={gi === 0 || !!needle || filter === 'fav'}>
            <div className="tpl-grid" data-tour={gi === 0 ? 'tpl-grid' : undefined}>{list.map((t, i) => builtTile(t, i))}</div>
          </Fold>
        );
      })}
      {(needle || filter === 'fav') && !builtShown.length && !userShown.length && <div className="muted small fold-empty">No template matches.</div>}
      {page.templateLayout && (
        <div className="callout layout" style={{ margin: 10 }}>
          <span>
            <Wand2 size={13} /> This page has a template layout waiting for assets.
          </span>
        </div>
      )}
    </div>
  );
}

const getPageNow = (): Page => {
  const d = getDoc();
  return d.pages.find((p) => p.id === d.activePageId) ?? d.pages[0];
};

function ToolBtn({ icon, label, note, onClick }: { icon: ReactNode; label: string; note: string; onClick: () => void }) {
  return (
    <button className="list-btn" onClick={onClick}>
      <span className="ico">{icon}</span>
      {label}
      <small>{note}</small>
    </button>
  );
}

function TemplateCard({ name, w, h, desc, onClick, onMenu, actions, preview, fav }: { name: string; w: number; h: number; desc: string; onClick: () => void; onMenu: (x: number, y: number) => void; actions?: ReactNode; preview?: ReactNode; fav?: boolean }) {
  const k = 40 / Math.max(w, h);
  return (
    <div
      className={`tpl-card ${preview ? 'with-preview' : ''} ${fav ? 'is-fav' : ''}`}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      title="Click to use · right-click for scopes and more"
    >
      {preview ?? (
        <div className="ratio">
          <div style={{ width: w * k, height: h * k }} />
        </div>
      )}
      <div className="grow tpl-meta">
        <span className="grow">
          <b>{name}</b>
          <small>
            {w}×{h} · {desc}
          </small>
        </span>
        {actions && (
          <span className="tpl-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
    </div>
  );
}
