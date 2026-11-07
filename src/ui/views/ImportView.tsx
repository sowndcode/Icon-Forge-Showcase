// Import stage: full-width asset manager — categories, alpha analysis, errors, bulk actions.
// Selection works like a file manager: click, Ctrl/Shift-click, tick boxes, drag a box, Ctrl+A,
// Esc or a click on empty space to clear. Selected icons can be dragged onto a category.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check as CheckIcon, Dices, Filter, FolderOpen, FolderPlus, Images, Library, Search, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { colorFamily, keywordCategory, sharedWordCategories } from '../../core/autoCategory';
import { paletteFromPixels, rgbToHsl } from '../../core/palette';
import type { AssetKind, AssetRecord } from '../../core/types';
import { images } from '../../render/images';
import { categoriesOf, deleteAssets, setAssetCategory, setAssetKind } from '../../state/assets';
import { useDoc } from '../../state/doc';
import { usePrefs } from '../../state/prefs';
import { openDialog, setStage, useUI } from '../../state/ui';
import { humanBytes } from '../../services/formats';
import { openFilePicker, openFolderPicker } from '../App';
import { Modal, Seg, Select } from '../components/controls';
import { sortAssets, useImageVersion } from '../left/AssetLibrary';
import { askConfirm, askText } from '../components/ask';
import { categoryColor } from '../components/categoryColors';
import { openMenu } from '../menus';
import { openAssetPreview } from '../dialogs/AssetPreview';
import { Slider } from '../components/controls';

type AlphaFilter = 'any' | 'yes' | 'no';
type SizeFilter = 'any' | 'small' | 'medium' | 'large';
const SIZE_LABEL: Record<SizeFilter, string> = { any: 'Any size', small: 'Up to 64 px', medium: '65–256 px', large: 'Over 256 px' };
const sizeOk = (a: AssetRecord, f: SizeFilter) => {
  const m = Math.max(a.width, a.height);
  return f === 'any' || (f === 'small' ? m <= 64 : f === 'medium' ? m > 64 && m <= 256 : m > 256);
};

const DRAG_TYPE = 'application/x-showcase-assets';

export function ImportView() {
  const all = useDoc((s) => s.doc.assets);
  const [kind, setKind] = useState<AssetKind>('asset');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [showBounds, setShowBounds] = useState(true);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [fmt, setFmt] = useState<string | null>(null);
  const [alphaF, setAlphaF] = useState<AlphaFilter>('any');
  const [sizeF, setSizeF] = useState<SizeFilter>('any');
  const tile = usePrefs((s) => s.importTileSize);
  const [autoOpen, setAutoOpen] = useState(false);
  const [dropCat, setDropCat] = useState<string | null>(null);
  const sort = usePrefs((s) => s.librarySort);
  const setPrefs = usePrefs((s) => s.setPrefs);
  const sel = useUI((s) => s.librarySel);
  const selSet = useMemo(() => new Set(sel), [sel]);
  useImageVersion();
  const assets = useMemo(() => all.filter((a) => a.kind === kind), [all, kind]);
  const cats = useMemo(() => categoriesOf(assets), [assets]);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let l = assets;
    if (ql) l = l.filter((a) => (a.name + ' ' + a.category + ' ' + a.folder).toLowerCase().includes(ql));
    if (cat !== null) l = l.filter((a) => a.category === cat);
    if (onlyProblems) l = l.filter((a) => a.status === 'error' || a.status === 'missing' || a.alpha?.empty || (a.alpha && !a.alpha.hasAlpha));
    if (fmt) l = l.filter((a) => a.format === fmt);
    if (alphaF !== 'any') l = l.filter((a) => !!a.alpha && a.alpha.hasAlpha === (alphaF === 'yes'));
    if (sizeF !== 'any') l = l.filter((a) => sizeOk(a, sizeF));
    return sortAssets(l, sort);
  }, [assets, q, cat, onlyProblems, fmt, alphaF, sizeF, sort]);
  const formats = useMemo(() => [...new Set(assets.map((a) => a.format))].sort(), [assets]);
  const nFilters = (onlyProblems ? 1 : 0) + (fmt ? 1 : 0) + (alphaF !== 'any' ? 1 : 0) + (sizeF !== 'any' ? 1 : 0);
  const clearFilters = () => {
    setOnlyProblems(false);
    setFmt(null);
    setAlphaF('any');
    setSizeF('any');
  };
  const filterMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: 'All formats', checked: !fmt, onClick: () => setFmt(null) },
      ...formats.map((f) => ({ label: f.toUpperCase(), checked: fmt === f, onClick: () => setFmt(f) })),
      { separator: true },
      { label: 'Any transparency', checked: alphaF === 'any', onClick: () => setAlphaF('any') },
      { label: 'With transparency', checked: alphaF === 'yes', onClick: () => setAlphaF('yes') },
      { label: 'Opaque only', checked: alphaF === 'no', onClick: () => setAlphaF('no') },
      { separator: true },
      ...(Object.keys(SIZE_LABEL) as SizeFilter[]).map((k) => ({ label: SIZE_LABEL[k], checked: sizeF === k, onClick: () => setSizeF(k) })),
      { separator: true },
      { label: 'Problems only', checked: onlyProblems, onClick: () => setOnlyProblems(!onlyProblems) },
      { label: 'Clear filters', disabled: !nFilters, onClick: clearFilters },
      { separator: true },
      { label: 'Show visible bounds', checked: showBounds, onClick: () => setShowBounds(!showBounds) },
    ]);
  };
  const stats = useMemo(() => {
    const total = assets.reduce((s, a) => s + a.bytes, 0);
    return {
      total,
      alpha: assets.filter((a) => a.alpha?.hasAlpha).length,
      errors: assets.filter((a) => a.status === 'error').length,
      missing: assets.filter((a) => a.status === 'missing').length,
      pending: assets.filter((a) => a.status === 'pending').length,
      empty: assets.filter((a) => a.alpha?.empty).length,
    };
  }, [assets]);
  const selIds = assets.filter((a) => selSet.has(a.id)).map((a) => a.id);
  const setSel = (ids: string[]) => useUI.setState({ librarySel: ids });

  // keyboard: Ctrl+A selects what is shown, Esc clears, Delete removes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.('input, textarea, select') || document.querySelector('.modal-back') || useUI.getState().menu) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSel(list.map((a) => a.id));
      } else if (e.key === 'Escape' && useUI.getState().librarySel.length) {
        e.stopImmediatePropagation();
        setSel([]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void deleteAssets(selIds);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [list, selIds]);

  const newCategory = () =>
    void askText({ title: selIds.length ? `New category for ${selIds.length} selected` : 'New category', message: selIds.length ? undefined : 'Select icons first — a category is created by putting icons in it.', placeholder: 'e.g. Weapons', okLabel: 'Create' }).then((v) => {
      if (v && selIds.length) setAssetCategory(selIds, v);
    });
  const categoryMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      ...cats.filter((c) => c.name).map((c) => ({ label: `${c.name}  (${c.count})`, onClick: () => setAssetCategory(selIds, c.name) })),
      ...(cats.some((c) => c.name) ? [{ separator: true as const }] : []),
      { label: 'New category…', onClick: newCategory },
      { label: 'Remove category', disabled: !selIds.some((id) => assets.find((a) => a.id === id)?.category), onClick: () => setAssetCategory(selIds, '') },
    ]);
  };
  const dropOn = (e: React.DragEvent, name: string) => {
    e.preventDefault();
    setDropCat(null);
    try {
      const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[];
      if (ids.length) setAssetCategory(ids, name);
    } catch {
      /* not icons */
    }
  };
  const catProps = (name: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropCat(name);
    },
    onDragLeave: () => setDropCat((c) => (c === name ? null : c)),
    onDrop: (e: React.DragEvent) => dropOn(e, name),
  });

  const tileMenu = (e: React.MouseEvent, a: AssetRecord) => {
    e.preventDefault();
    const cur = useUI.getState().librarySel;
    const ids = cur.includes(a.id) ? cur : [a.id];
    if (!cur.includes(a.id)) setSel([a.id]);
    const n = ids.length;
    openMenu(e.clientX, e.clientY, [
      { label: 'Preview', shortcut: 'Double-click', onClick: () => openAssetPreview(a.id, list.map((x) => x.id)) },
      { separator: true },
      ...cats.filter((c) => c.name).slice(0, 8).map((c) => ({ label: `Move ${n > 1 ? `${n} ` : ''}to ${c.name}`, onClick: () => setAssetCategory(ids, c.name) })),
      { label: 'New category…', onClick: () => void askText({ title: `New category for ${n} icon${n > 1 ? 's' : ''}`, placeholder: 'e.g. Weapons', okLabel: 'Create' }).then((v) => v && setAssetCategory(ids, v)) },
      { separator: true },
      { label: n > 1 ? `Remove ${n} from project…` : 'Remove from project…', danger: true, onClick: () => void deleteAssets(ids) },
    ]);
  };
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div className="imp-side">
        <div className="imp-side-actions">
          <button className="btn primary" onClick={() => openFilePicker(kind)} data-tour="import-files">
            <Images size={14} /> Import files
          </button>
          <button className="btn" onClick={() => openFolderPicker(kind)} data-tour="import-folder">
            <FolderOpen size={14} /> Import folder
          </button>
          <button className="btn ghost" onClick={() => openDialog('addFromProject')} title="Copy assets from another saved project into this one">
            <Library size={14} /> From a project…
          </button>
        </div>
        <div className="group-label">
          <span className="grow">Categories</span>
          <button className="btn ghost icon sm" title={selIds.length ? `New category from the ${selIds.length} selected` : 'New category (select icons first)'} disabled={!selIds.length} onClick={newCategory}>
            <FolderPlus size={14} />
          </button>
        </div>
        <div style={{ padding: '0 12px 8px' }}>
          <button className="btn sm block" disabled={!assets.length} onClick={() => setAutoOpen(true)} title="Sort icons into categories by name or colour">
            <Sparkles size={14} /> Auto-categorize…
          </button>
        </div>
        <div className="panel-body imp-cats" data-tour="import-categories">
          <button className={`imp-cat ${cat === null ? 'on' : ''}`} onClick={() => setCat(null)}>
            <span className="cat-dot" style={{ background: 'var(--text-2)' }} />
            <span className="grow">All</span>
            <small>{assets.length}</small>
          </button>
          {cats.map((c, ci) => (
            <div
              key={c.name}
              className={`imp-cat ${cat === c.name ? 'on' : ''} ${dropCat === c.name ? 'drop' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setCat(c.name)}
              onDoubleClick={() =>
                c.name &&
                void askText({ title: 'Rename category', value: c.name, okLabel: 'Rename' }).then((v) => {
                  if (v && v !== c.name) setAssetCategory(assets.filter((a) => a.category === c.name).map((a) => a.id), v);
                })
              }
              onContextMenu={(e) => {
                e.preventDefault();
                const ids = assets.filter((a) => a.category === c.name).map((a) => a.id);
                openMenu(e.clientX, e.clientY, [
                  { label: 'Select these icons', onClick: () => setSel(ids) },
                  { label: 'Add to selection', onClick: () => setSel([...new Set([...useUI.getState().librarySel, ...ids])]) },
                  { separator: true },
                  { label: 'Rename…', disabled: !c.name, onClick: () => void askText({ title: 'Rename category', value: c.name, okLabel: 'Rename' }).then((v) => v && setAssetCategory(ids, v)) },
                  { label: 'Remove category (keep icons)', disabled: !c.name, onClick: () => setAssetCategory(ids, '') },
                ]);
              }}
              title={c.name ? 'Click to show · double-click to rename · drop icons here to move them · right-click for more' : 'Icons without a category — drop icons here to clear their category'}
              {...catProps(c.name)}
            >
              <span className="cat-dot" style={{ background: c.name ? categoryColor(ci) : 'var(--text-3)' }} />
              <span className="grow ellipsis">{c.name || 'Uncategorized'}</span>
              <small>{c.count}</small>
              {c.name && (
                <button
                  className="imp-cat-x"
                  title="Remove this category (the icons stay, uncategorized)"
                  onClick={(e) => {
                    e.stopPropagation();
                    void askConfirm({ title: `Remove category “${c.name}”?`, message: `Its ${c.count} icons stay in the project, uncategorized.`, okLabel: 'Remove' }).then((ok) => {
                      if (ok) setAssetCategory(assets.filter((a) => a.category === c.name).map((a) => a.id), '');
                      if (ok && cat === c.name) setCat(null);
                    });
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <div className="hint" style={{ padding: '12px 10px' }}>
            Folders become categories automatically. Drag selected icons onto a category to move them; double-click to rename.
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="imp-toolbar">
          <Seg small value={kind} onChange={(k) => { setKind(k); setCat(null); }} options={[{ value: 'asset', label: `Assets (${all.filter((a) => a.kind === 'asset').length})` }, { value: 'background', label: `Backgrounds (${all.filter((a) => a.kind === 'background').length})` }, { value: 'element', label: `Elements (${all.filter((a) => a.kind === 'element').length})` }]} />
          <div className="search" style={{ width: 220, flex: 'none' }}>
            <Search size={14} />
            <input className="input sm" placeholder="Search name, folder, category" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <Select value={sort} onChange={(v) => setPrefs({ librarySort: v })} options={[{ value: 'import', label: 'Import order' }, { value: 'name', label: 'Name' }, { value: 'category', label: 'Category' }, { value: 'size', label: 'Dimensions' }, { value: 'aspect', label: 'Aspect ratio' }]} className="sort-select" />
          <button data-tour="import-filter" className={`btn sm ${nFilters ? 'active' : ''}`} onClick={filterMenu} title="Filter by format, transparency, size or problems">
            <Filter size={13} /> Filter{nFilters ? <span className="mono"> {nFilters}</span> : ''}
          </button>
          {nFilters > 0 && (
            <button className="btn ghost sm" onClick={clearFilters} title="Show every asset again">
              Clear
            </button>
          )}
          <span className="grow" />
          <button className="btn sm" onClick={() => setSel(list.map((a) => a.id))} title="Select everything shown (Ctrl+A)">
            Select all
          </button>
          <button className="btn sm" disabled={!list.length} onClick={() => setSel(list.filter((a) => !selSet.has(a.id)).map((a) => a.id))} title="Select the ones that are not selected">
            Invert
          </button>
          <button className="btn sm" disabled={!sel.length} onClick={() => setSel([])} title="Clear the selection (Esc)">
            None
          </button>
          <button className="btn sm" onClick={() => openDialog('randomSelect')}>
            <Dices size={14} /> Random…
          </button>
        </div>
        {selIds.length > 0 ? (
          <div className="row wrap imp-selbar">
            <b>{selIds.length} selected</b>
            <button className="btn ghost icon sm" title="Clear the selection (Esc)" onClick={() => setSel([])}>
              <X size={13} />
            </button>
            <span className="opt-sep" />
            <button className="btn sm" onClick={categoryMenu}>
              <Tag size={14} /> Set category
            </button>
            {kind !== 'asset' && <button className="btn sm" onClick={() => setAssetKind(selIds, 'asset')}>Move to Assets</button>}
            {kind !== 'background' && <button className="btn sm" onClick={() => setAssetKind(selIds, 'background')}>Move to Backgrounds</button>}
            {kind !== 'element' && <button className="btn sm" onClick={() => setAssetKind(selIds, 'element')}>Move to Elements</button>}
            <button className="btn sm danger" onClick={() => void deleteAssets(selIds)}>
              <Trash2 size={14} /> Delete
            </button>
            <span className="grow" />
            <span className="muted small">Drag them onto a category to move them</span>
          </div>
        ) : (
          <div className="row imp-selbar empty">
            <span className="muted small">Click to select · Ctrl-click or tick boxes to add · Shift-click for a range · drag a box across empty space · Esc to clear</span>
          </div>
        )}
        <div className="imp-grid-wrap" data-tour="import-grid" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <BigGrid list={list} selSet={selSet} showBounds={showBounds} size={tile} filtered={assets.length > 0 && !list.length} onMenu={(e, a) => tileMenu(e, a)} />
        </div>
        <div className="imp-foot">
          <span><b>{assets.length}</b> files · <b>{humanBytes(stats.total)}</b></span>
          <span><b>{stats.alpha}</b> with transparency</span>
          <span><b>{cats.filter((c) => c.name).length}</b> categories</span>
          {stats.pending > 0 && <span>{stats.pending} analyzing…</span>}
          {stats.empty > 0 && <span style={{ color: 'var(--warn)' }}>{stats.empty} fully transparent</span>}
          {stats.errors > 0 && <span style={{ color: 'var(--fail)' }}>{stats.errors} failed</span>}
          {stats.missing > 0 && <span style={{ color: 'var(--fail)' }}>{stats.missing} missing (re-import to relink)</span>}
          <span className="grow" />
          <label className="imp-size" title="Tile size">
            <span>Tiles</span>
            <Slider value={tile} min={96} max={240} step={8} onChange={(v) => setPrefs({ importTileSize: v })} unit="px" />
          </label>
          <button className="btn primary sm" disabled={!assets.length} onClick={() => setStage('compose')}>
            Continue to Compose <ArrowRight size={14} />
          </button>
        </div>
      </div>
      {autoOpen && <AutoCategoryDialog assets={assets} selected={selIds} onClose={() => setAutoOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid with click / Ctrl / Shift / tick-box / box selection and dragging onto categories
// ---------------------------------------------------------------------------

function BigGrid({ list, selSet, showBounds, size, filtered, onMenu }: { list: AssetRecord[]; selSet: Set<string>; showBounds: boolean; size: number; filtered: boolean; onMenu: (e: React.MouseEvent, a: AssetRecord) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600, top: 0 });
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const anchor = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setBox((b) => ({ ...b, w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = 8,
    tileH = size + 44;
  const cols = Math.max(1, Math.floor((box.w - 16 + gap) / (size + gap)));
  const rows = Math.ceil(list.length / cols);
  const first = Math.max(0, Math.floor(box.top / (tileH + gap)) - 2);
  const last = Math.min(rows, Math.ceil((box.top + box.h) / (tileH + gap)) + 2);
  const setSel = (ids: string[]) => useUI.setState({ librarySel: ids });
  const toggle = (id: string) => {
    const sel = useUI.getState().librarySel;
    setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };
  const click = (e: React.MouseEvent, a: AssetRecord) => {
    const sel = useUI.getState().librarySel;
    if (e.shiftKey && anchor.current) {
      const i0 = list.findIndex((x) => x.id === anchor.current),
        i1 = list.findIndex((x) => x.id === a.id);
      if (i0 >= 0 && i1 >= 0) {
        const range = list.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((x) => x.id);
        return setSel(e.ctrlKey || e.metaKey ? [...new Set([...sel, ...range])] : range);
      }
    }
    anchor.current = a.id;
    if (e.ctrlKey || e.metaKey) toggle(a.id);
    // clicking the only selected icon again deselects it
    else if (sel.length === 1 && sel[0] === a.id) {
      if (e.detail < 2) setSel([]);
    }
    else setSel([a.id]);
  };
  const tileAt = (i: number) => ({ x: 8 + (i % cols) * (size + gap), y: 8 + Math.floor(i / cols) * (tileH + gap) });
  // drag a selection box across empty space
  const startBand = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.libtile')) return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const pt = (ev: { clientX: number; clientY: number }) => ({ x: ev.clientX - r.left + el.scrollLeft, y: ev.clientY - r.top + el.scrollTop });
    const p0 = pt(e);
    const base = e.ctrlKey || e.metaKey || e.shiftKey ? useUI.getState().librarySel : [];
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = pt(ev);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 4) return;
      moved = true;
      const b = { x0: Math.min(p0.x, p.x), y0: Math.min(p0.y, p.y), x1: Math.max(p0.x, p.x), y1: Math.max(p0.y, p.y) };
      setBand(b);
      const hit = list.filter((_, i) => {
        const t = tileAt(i);
        return t.x < b.x1 && t.x + size > b.x0 && t.y < b.y1 && t.y + tileH > b.y0;
      });
      setSel([...new Set([...base, ...hit.map((a) => a.id)])]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBand(null);
      // a plain click on empty space clears the selection
      if (!moved && !base.length) setSel([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const tiles = [];
  for (let r = first; r < last; r++)
    for (let c = 0; c < cols; c++) {
      const a = list[r * cols + c];
      if (!a) break;
      const url = images.thumbs.get(a.id);
      const k = a.width && a.height ? Math.min((size - 10) / a.width, (size - 10) / a.height) : 1;
      const on = selSet.has(a.id);
      tiles.push(
        <div
          key={a.id}
          className={`libtile ${on ? 'sel' : ''}`}
          style={{ left: 8 + c * (size + gap), top: 8 + r * (tileH + gap), width: size, height: tileH }}
          onClick={(e) => click(e, a)}
          onDoubleClick={() => openAssetPreview(a.id, list.map((x) => x.id))}
          onContextMenu={(e) => onMenu(e, a)}
          draggable
          onDragStart={(e) => {
            // drag the whole selection when the icon is part of it
            const sel = useUI.getState().librarySel;
            const ids = sel.includes(a.id) ? sel : [a.id];
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          title={`${a.folder ? `${a.folder}/${a.name}` : a.name}\nDouble-click to preview`}
        >
          <button
            className={`tile-check ${on ? 'on' : ''}`}
            aria-label={on ? 'Deselect' : 'Select'}
            title={on ? 'Deselect' : 'Add to selection'}
            onClick={(e) => {
              e.stopPropagation();
              anchor.current = a.id;
              toggle(a.id);
            }}
          >
            {on && <CheckIcon size={11} strokeWidth={3} />}
          </button>
          <div className="img checker" style={{ flex: 'none', height: size }}>
            {url ? (
              <div style={{ position: 'relative', width: a.width * k, height: a.height * k }}>
                <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none' }} />
                {showBounds && a.alpha && !a.alpha.empty && (
                  <div style={{ position: 'absolute', left: a.alpha.bounds.x * k, top: a.alpha.bounds.y * k, width: a.alpha.bounds.w * k, height: a.alpha.bounds.h * k, border: '1px dashed var(--sel)', pointerEvents: 'none' }} />
                )}
              </div>
            ) : a.status === 'pending' ? (
              <span className="spinner" />
            ) : null}
            {(a.status === 'error' || a.status === 'missing') && <div className="err">{a.status === 'missing' ? 'Missing file — re-import to relink' : a.error}</div>}
          </div>
          <div className="nm" style={{ color: 'var(--text)' }}>{a.name}</div>
          <div className="nm" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span>{a.width}×{a.height}</span>
            {a.alpha?.hasAlpha && <span className="mini-badge alpha">α {Math.round(a.alpha.occupancy * 100)}%</span>}
            {a.alpha?.empty && <span className="mini-badge" style={{ color: 'var(--warn)' }}>empty</span>}
            {a.category && <span className="cat-chip ellipsis">{a.category}</span>}
          </div>
        </div>,
      );
    }
  return (
    <div ref={ref} className="libgrid" style={{ padding: 0 }} onPointerDown={startBand} onScroll={(e) => setBox((b) => ({ ...b, top: (e.target as HTMLElement).scrollTop }))}>
      <div style={{ height: rows * (tileH + gap) + 16, position: 'relative' }}>
        {tiles}
        {band && <div className="sel-band" style={{ left: band.x0, top: band.y0, width: band.x1 - band.x0, height: band.y1 - band.y0 }} />}
      </div>
      {!list.length && (
        <div className="empty" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          {filtered ? (
            <div>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 16 }}>Nothing matches the search or filters</h2>
              Clear the filters to see every asset again
            </div>
          ) : (
            <div>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 16 }}>Drop assets here</h2>
              PNG, WebP, JPEG, AVIF, GIF or BMP — files or whole folders (subfolders become categories)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-categorize
// ---------------------------------------------------------------------------

type AutoMethod = 'keywords' | 'shared' | 'color';

/** Colour family of each icon, from its decoded preview. */
function colorCategories(list: AssetRecord[]): (string | null)[] {
  const S = 20;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return list.map((a) => {
    const bmp = images.previews.get(a.id);
    if (!ctx || !bmp) return null;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(bmp, 0, 0, S, S);
    const data = ctx.getImageData(0, 0, S, S).data;
    const p = paletteFromPixels(data, 1);
    if (p) {
      const hex = p.colors[0];
      const [h, s, l] = rgbToHsl(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
      return colorFamily(h, s, l);
    }
    // no strong colour: decide by average lightness of the visible pixels
    let sum = 0,
      n = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 3] > 200) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 765;
        n++;
      }
    return n ? colorFamily(0, 0, sum / n) : null;
  });
}

function AutoCategoryDialog({ assets, selected, onClose }: { assets: AssetRecord[]; selected: string[]; onClose: () => void }) {
  const [method, setMethod] = useState<AutoMethod>('keywords');
  const [scope, setScope] = useState<'all' | 'uncategorized' | 'selected'>(selected.length ? 'selected' : assets.some((a) => !a.category) ? 'uncategorized' : 'all');
  const [leftover, setLeftover] = useState<'other' | 'keep'>('keep');
  const target = useMemo(() => (scope === 'selected' ? assets.filter((a) => selected.includes(a.id)) : scope === 'uncategorized' ? assets.filter((a) => !a.category) : assets), [assets, scope, selected]);
  const result = useMemo(() => {
    const names = target.map((a) => a.name);
    const cats = method === 'keywords' ? names.map(keywordCategory) : method === 'shared' ? sharedWordCategories(names) : colorCategories(target);
    return target.map((a, i) => ({ a, cat: cats[i] }));
  }, [target, method]);
  const groups = useMemo(() => {
    const m = new Map<string, AssetRecord[]>();
    for (const { a, cat } of result) {
      const k = cat ?? (leftover === 'other' ? 'Other' : '');
      if (!cat && leftover === 'keep') continue;
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m].sort((x, y) => y[1].length - x[1].length);
  }, [result, leftover]);
  const matched = result.filter((r) => r.cat).length;
  const apply = () => {
    for (const [name, list] of groups) setAssetCategory(list.map((a) => a.id), name);
    onClose();
  };
  return (
    <Modal
      title="Auto-categorize"
      onClose={onClose}
      width={760}
      footer={
        <>
          <span className="muted small grow">
            {matched} of {target.length} icons matched{leftover === 'other' && matched < target.length ? `, ${target.length - matched} go to “Other”` : ''}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!groups.length} onClick={apply}>
            <Sparkles size={14} /> Apply {groups.length} categor{groups.length === 1 ? 'y' : 'ies'}
          </button>
        </>
      }
    >
      <div className="auto-cat">
        <div className="var-side">
          <div className="prop-row">
            <label>Sort by</label>
            <div className="ctl">
              <Seg
                small
                value={method}
                onChange={setMethod}
                options={[
                  { value: 'keywords', label: 'Item type', title: 'Weapons, food, tools, gems… from words in the file names' },
                  { value: 'shared', label: 'Shared words', title: 'Groups icons whose names share a word (evidence_bag, evidence_box → Evidence)' },
                  { value: 'color', label: 'Colour', title: 'Red, blue, gold… from each icon’s main colour' },
                ]}
              />
            </div>
          </div>
          <div className="prop-row">
            <label>Icons</label>
            <div className="ctl">
              <Seg
                small
                value={scope}
                onChange={setScope}
                options={[
                  ...(selected.length ? [{ value: 'selected' as const, label: `Selected (${selected.length})` }] : []),
                  { value: 'uncategorized', label: `Uncategorized (${assets.filter((a) => !a.category).length})` },
                  { value: 'all', label: `All (${assets.length})` },
                ]}
              />
            </div>
          </div>
          <div className="prop-row">
            <label>No match</label>
            <div className="ctl">
              <Seg small value={leftover} onChange={setLeftover} options={[{ value: 'keep', label: 'Leave as is' }, { value: 'other', label: 'Put in “Other”' }]} />
            </div>
          </div>
          <div className="var-help">
            {method === 'keywords' && 'Reads words like sword, potion, key, coin, map or hat in each file name and picks a category. Works best with descriptive file names.'}
            {method === 'shared' && 'Finds words that several file names share — great for packs named like “evidence_bag, evidence_box, evidence_tray”.'}
            {method === 'color' && 'Looks at each icon’s main colour — handy for colour-sorted catalogs and palettes.'}
            {' '}You can rename or merge categories afterwards.
          </div>
        </div>
        <div className="auto-cat-list">
          {groups.length ? (
            groups.map(([name, list]) => (
              <div key={name} className="auto-cat-row">
                <div className="auto-cat-head">
                  <b>{name}</b>
                  <small>{list.length}</small>
                </div>
                <div className="auto-cat-thumbs">
                  {list.slice(0, 14).map((a) => {
                    const url = images.thumbs.get(a.id);
                    return url ? <img key={a.id} src={url} alt="" title={a.name} /> : null;
                  })}
                  {list.length > 14 && <span className="muted small">+{list.length - 14}</span>}
                </div>
              </div>
            ))
          ) : (
            <div className="muted">Nothing matched — try another way of sorting.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
