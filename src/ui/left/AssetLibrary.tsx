// Asset library: virtualised thumbnail grid with search, sort, category filter, multi-select,
// drag-to-canvas and bulk actions. Only visible rows are rendered (500+ assets stay fast).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, FolderOpen, Images, Plus, Search, CheckSquare, XSquare } from 'lucide-react';
import type { AssetKind, AssetRecord } from '../../core/types';
import { images } from '../../render/images';
import { assetUsage, categoriesOf, deleteAssets, setAssetCategory, setAssetKind } from '../../state/assets';
import { useDoc } from '../../state/doc';
import { addAllAssets, addAssetsToCanvas, addSelectedAssets } from '../../state/placement';
import { usePrefs } from '../../state/prefs';
import { openDialog, useUI } from '../../state/ui';
import { openFilePicker, openFolderPicker } from '../App';
import { ASSET_DRAG_TYPE } from '../canvas/Editor';
import { Select } from '../components/controls';
import { openMenu } from '../menus';
import { openAssetPreview } from '../dialogs/AssetPreview';
import { askText } from '../components/ask';
import { categoryColor } from '../components/categoryColors';

/** Re-renders when decoded images arrive; returns a counter that changes each time. */
import { useImageVersion } from '../components/useImageVersion';
export { useImageVersion };

export function sortAssets(list: AssetRecord[], sort: string): AssetRecord[] {
  const s = list.slice();
  switch (sort) {
    case 'name':
      return s.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    case 'size':
      return s.sort((a, b) => b.width * b.height - a.width * a.height);
    case 'aspect':
      return s.sort((a, b) => a.width / (a.height || 1) - b.width / (b.height || 1));
    case 'category':
      return s.sort((a, b) => a.category.localeCompare(b.category, undefined, { numeric: true }) || a.importIndex - b.importIndex);
    default:
      return s.sort((a, b) => a.importIndex - b.importIndex);
  }
}

export function AssetLibrary({ kind = 'asset' }: { kind?: AssetKind }) {
  const all = useDoc((s) => s.doc.assets);
  const pages = useDoc((s) => s.doc.pages);
  const assets = useMemo(() => all.filter((a) => a.kind === kind), [all, kind]);
  const sel = useUI((s) => s.librarySel);
  const anchor = useUI((s) => s.libraryAnchor);
  const thumb = usePrefs((s) => s.thumbSize);
  const sort = usePrefs((s) => s.librarySort);
  const setPrefs = usePrefs((s) => s.setPrefs);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [unused, setUnused] = useState(false);
  useImageVersion();

  const usedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pages) for (const o of p.objects) if (o.type === 'image') m.set(o.assetId, (m.get(o.assetId) ?? 0) + 1);
    return m;
  }, [pages]);
  const cats = useMemo(() => categoriesOf(assets), [assets]);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let l = assets;
    if (ql) l = l.filter((a) => a.name.toLowerCase().includes(ql) || a.category.toLowerCase().includes(ql) || a.folder.toLowerCase().includes(ql));
    if (cat !== null) l = l.filter((a) => a.category === cat);
    if (unused) l = l.filter((a) => !usedCount.get(a.id));
    return sortAssets(l, sort);
  }, [assets, q, cat, unused, sort, usedCount]);

  const selSet = useMemo(() => new Set(sel), [sel]);
  const visibleSel = list.filter((a) => selSet.has(a.id)).length;

  const click = (e: React.MouseEvent, a: AssetRecord) => {
    const ui = useUI.getState();
    if (e.shiftKey && anchor) {
      const i0 = list.findIndex((x) => x.id === anchor),
        i1 = list.findIndex((x) => x.id === a.id);
      if (i0 >= 0 && i1 >= 0) {
        const range = list.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((x) => x.id);
        useUI.setState({ librarySel: [...new Set([...(e.ctrlKey ? ui.librarySel : []), ...range])] });
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) useUI.setState({ librarySel: selSet.has(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id], libraryAnchor: a.id });
    // clicking the only selected asset again deselects it (not the 2nd click of a double-click, which adds it)
    else if (e.detail < 2 && ui.librarySel.length === 1 && ui.librarySel[0] === a.id) useUI.setState({ librarySel: [] });
    else useUI.setState({ librarySel: [a.id], libraryAnchor: a.id });
  };

  const menu = (e: React.MouseEvent, a: AssetRecord) => {
    e.preventDefault();
    const ids = selSet.has(a.id) ? sel : [a.id];
    if (!selSet.has(a.id)) useUI.setState({ librarySel: [a.id], libraryAnchor: a.id });
    const n = ids.length;
    openMenu(e.clientX, e.clientY, [
      { label: 'Preview', onClick: () => openAssetPreview(a.id, list.map((x) => x.id)) },
      { label: `Add ${n > 1 ? n + ' assets' : 'to canvas'}`, onClick: () => addAssetsToCanvas(ids) },
      { label: 'Set category…', onClick: () => void askText({ title: `Category for ${n} asset${n > 1 ? 's' : ''}`, value: a.category, placeholder: 'e.g. Weapons', okLabel: 'Set category' }).then((v) => {
            if (v) void setAssetCategory(ids, v);
          }) },
      { separator: true },
      { label: 'Move to Assets', disabled: kind === 'asset', onClick: () => setAssetKind(ids, 'asset') },
      { label: 'Move to Backgrounds', disabled: kind === 'background', onClick: () => setAssetKind(ids, 'background') },
      { label: 'Move to Elements', disabled: kind === 'element', onClick: () => setAssetKind(ids, 'element') },
      { separator: true },
      { label: `Delete from library${assetUsage(useDoc.getState().doc, new Set(ids)) ? ' (used!)' : ''}`, danger: true, onClick: () => void deleteAssets(ids) },
    ]);
  };

  return (
    <>
      <div className="lib-tools">
        <div className="row">
          <div className="search">
            <Search size={14} />
            <input className="input sm" placeholder={`Search ${assets.length} ${kind === 'asset' ? 'assets' : kind + 's'}`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <Select
            value={sort}
            title="Sort"
            onChange={(v) => setPrefs({ librarySort: v })}
            options={[
              { value: 'import', label: 'Import order' },
              { value: 'name', label: 'Name' },
              { value: 'category', label: 'Category' },
              { value: 'size', label: 'Dimensions' },
              { value: 'aspect', label: 'Aspect ratio' },
            ]}
            className="sort-select"
          />
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => openFilePicker(kind)} title="Import image files (PNG, WebP, JPG)">
            <Images size={14} /> Files
          </button>
          <button className="btn sm" onClick={() => openFolderPicker(kind)} title="Import a folder — subfolders become categories">
            <FolderOpen size={14} /> Folder
          </button>
          <span className="grow" />
          <input type="range" min={56} max={160} value={thumb} onChange={(e) => setPrefs({ thumbSize: +e.target.value })} title="Thumbnail size" aria-label="Thumbnail size" style={{ width: 72, flex: 'none' }} />
        </div>
      </div>
      {cats.length > 1 && (
        <div className="cats">
          <button className={`chip ${cat === null && !unused ? 'on' : ''}`} onClick={() => { setCat(null); setUnused(false); }}>
            All <small>{assets.length}</small>
          </button>
          {cats.map((c, i) => (
            <button key={c.name} className={`chip ${cat === c.name ? 'on' : ''}`} onClick={() => setCat(cat === c.name ? null : c.name)} title={c.name || 'Uncategorized'}>
              <span className="cat-dot" style={{ background: c.name ? categoryColor(i) : 'var(--text-3)' }} />
              {c.name || 'Uncategorized'} <small>{c.count}</small>
            </button>
          ))}
          <button className={`chip ${unused ? 'on' : ''}`} onClick={() => setUnused(!unused)} title="Assets not used on any page">
            Unused
          </button>
        </div>
      )}
      <VirtualTiles list={list} size={thumb} selSet={selSet} usedCount={usedCount} onClick={click} onMenu={menu} />
      <div className="lib-foot">
        <div className="info row">
          <span className="grow">
            <b>{list.length}</b> shown · <b>{sel.length}</b> selected
          </span>
          <button className="btn ghost icon sm" title="Select all shown (Ctrl+A in library)" onClick={() => useUI.setState({ librarySel: [...new Set([...sel, ...list.map((a) => a.id)])] })}>
            <CheckSquare size={14} />
          </button>
          <button className="btn ghost icon sm" title="Deselect all" disabled={!sel.length} onClick={() => useUI.setState({ librarySel: [] })}>
            <XSquare size={14} />
          </button>
        </div>
        {kind === 'asset' ? (
          <>
            <button className="btn sm primary" disabled={!visibleSel} onClick={addSelectedAssets} title="Add selected assets to the canvas">
              <Plus size={14} /> Add selected
            </button>
            <button className="btn sm" disabled={!assets.length} onClick={addAllAssets} title="Add every asset to the canvas (applies a grid layout)" data-tour="add-all">
              Add all
            </button>
            <button className="btn sm" disabled={!assets.length} onClick={() => openDialog('randomSelect')} title="Add or select a random subset, balanced by category">
              <Dices size={14} /> Random…
            </button>
          </>
        ) : (
          <button className="btn sm primary" disabled={!visibleSel} onClick={addSelectedAssets}>
            <Plus size={14} /> Add to canvas
          </button>
        )}
      </div>
    </>
  );
}

function VirtualTiles({
  list,
  size,
  selSet,
  usedCount,
  onClick,
  onMenu,
}: {
  list: AssetRecord[];
  size: number;
  selSet: Set<string>;
  usedCount: Map<string, number>;
  onClick: (e: React.MouseEvent, a: AssetRecord) => void;
  onMenu: (e: React.MouseEvent, a: AssetRecord) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 280, h: 400, top: 0 });
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setBox((b) => ({ ...b, w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gap = 8;
  const tileH = size + 22;
  const cols = Math.max(1, Math.floor((box.w - 4 + gap) / (size + gap)));
  const tileW = (box.w - 4 - gap * (cols - 1)) / cols;
  const rows = Math.ceil(list.length / cols);
  const first = Math.max(0, Math.floor(box.top / (tileH + gap)) - 2);
  const last = Math.min(rows, Math.ceil((box.top + box.h) / (tileH + gap)) + 2);
  const tiles = [];
  for (let r = first; r < last; r++)
    for (let c = 0; c < cols; c++) {
      const a = list[r * cols + c];
      if (!a) break;
      tiles.push(
        <Tile key={a.id} a={a} x={2 + c * (tileW + gap)} y={r * (tileH + gap)} w={tileW} h={tileH} sel={selSet.has(a.id)} used={usedCount.get(a.id) ?? 0} onClick={onClick} onMenu={onMenu} selSet={selSet} />,
      );
    }
  return (
    <div
      ref={ref}
      className="libgrid"
      tabIndex={0}
      onScroll={(e) => setBox((b) => ({ ...b, top: (e.target as HTMLElement).scrollTop }))}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          e.stopPropagation();
          useUI.setState({ librarySel: list.map((a) => a.id) });
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          useUI.setState({ librarySel: [] });
        }
      }}
    >
      <div style={{ height: rows * (tileH + gap), position: 'relative' }}>{tiles}</div>
      {!list.length && <div className="empty">No assets here yet.<br />Drop images or a folder anywhere on the window.</div>}
    </div>
  );
}

function Tile({ a, x, y, w, h, sel, used, onClick, onMenu, selSet }: { a: AssetRecord; x: number; y: number; w: number; h: number; sel: boolean; used: number; onClick: (e: React.MouseEvent, a: AssetRecord) => void; onMenu: (e: React.MouseEvent, a: AssetRecord) => void; selSet: Set<string> }) {
  const url = images.thumbs.get(a.id);
  const alpha = a.alpha?.hasAlpha;
  return (
    <div
      className={`libtile ${sel ? 'sel' : ''}`}
      style={{ left: x, top: y, width: w, height: h }}
      onClick={(e) => onClick(e, a)}
      onDoubleClick={() => addAssetsToCanvas([a.id])}
      onContextMenu={(e) => onMenu(e, a)}
      draggable={a.status === 'ready'}
      onDragStart={(e) => {
        const ids = sel ? [...selSet] : [a.id];
        e.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'copy';
        const img = (e.currentTarget as HTMLElement).querySelector('img');
        if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
      }}
      title={`${a.name}\n${a.width}×${a.height} · ${a.format.toUpperCase()}${a.alpha ? ` · visible ${a.alpha.bounds.w}×${a.alpha.bounds.h} (${Math.round(a.alpha.occupancy * 100)}% occupancy)` : ''}${a.category ? `\nCategory: ${a.category}` : ''}${a.error ? `\nError: ${a.error}` : ''}`}
    >
      <div className="img checker">
        {url ? <img src={url} alt="" loading="lazy" /> : a.status === 'pending' ? <span className="spinner" /> : null}
        {(a.status === 'error' || a.status === 'missing') && <div className="err">{a.status === 'missing' ? 'Missing file' : a.error ?? 'Error'}</div>}
        {used > 0 && <span className="used" title={`Used ${used} time${used > 1 ? 's' : ''} on your pages`}>{used}×</span>}
        <span className="badges">
          {alpha && <span className="mini-badge alpha">α</span>}
          {a.alpha?.empty && <span className="mini-badge" style={{ color: 'var(--warn)' }}>empty</span>}
        </span>
      </div>
      <div className="nm">{a.name.replace(/\.[^.]+$/, '')}</div>
    </div>
  );
}
