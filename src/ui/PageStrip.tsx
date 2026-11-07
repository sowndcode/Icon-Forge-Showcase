// Page navigator: thumbnails of every page (artboard), add/duplicate/rename/delete/reorder.

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, PaintBucket, Plus, Trash2, X } from 'lucide-react';
import type { Page } from '../core/types';
import { images } from '../render/images';
import { renderPage } from '../render/renderer';
import { getAsset, inGesture, useDoc } from '../state/doc';
import { deleteAllPages, deletePage, deletePages, duplicatePage, duplicatePages, invertPageSelection, movePage, renamePage, setActivePage, setBackgroundOn } from '../state/pages';
import { usePrefs } from '../state/prefs';
import { doExport } from './right/ExportPanel';
import { openDialog, toast, useUI } from '../state/ui';
import { openMenu } from './menus';
import { askConfirm } from './components/ask';

const H = 52;

function PageThumb({ page }: { page: Page }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round((H * page.width) / page.height);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const draw = () => {
      t = null;
      const c = ref.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w * dpr);
      c.height = Math.round(H * dpr);
      const ctx = c.getContext('2d')!;
      const k = (H * dpr) / page.height;
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      renderPage(ctx, page, { pxScale: k, getImage: (id) => images.previews.get(id) ?? null, getAsset });
    };
    // thumbnails don't need to follow every drag frame: wait until editing pauses
    const later = () => {
      t = setTimeout(() => (inGesture() ? later() : draw()), 500);
    };
    later();
    const unsub = images.subscribe(() => {
      if (!t) t = setTimeout(draw, 600);
    });
    return () => {
      if (t) clearTimeout(t);
      unsub();
    };
  }, [page, w]);
  return <canvas ref={ref} style={{ width: w, height: H }} />;
}

export function PageStrip() {
  const pages = useDoc((s) => s.doc.pages);
  const active = useDoc((s) => s.doc.activePageId);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragId = useRef<string | null>(null);
  const picked = useUI((s) => s.pageSel).filter((id) => pages.some((p) => p.id === id));
  const multi = picked.length > 1;
  const setPicked = (pageSel: string[]) => useUI.setState({ pageSel });
  // where a Shift-click range starts: the last page clicked without Shift
  const anchor = useRef<string | null>(null);
  // Ctrl-click adds / removes a page, Shift-click picks a range; a plain click opens one page.
  // The page you edit (outlined) and the picked pages (tinted) are separate: actions in the bar below
  // apply to the picked pages, editing always happens on the open one.
  const click = (e: React.MouseEvent, id: string, i: number) => {
    const base = picked.length ? picked : [active];
    if (e.ctrlKey || e.metaKey) {
      anchor.current = id;
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      setPicked(next.length > 1 ? next : []);
      if (next.length === 1) setActivePage(next[0]);
      else if (!next.includes(active) && next.length) setActivePage(next[next.length - 1]);
      return;
    }
    if (e.shiftKey) {
      const from = Math.max(0, pages.findIndex((p) => p.id === (anchor.current && pages.some((x) => x.id === anchor.current) ? anchor.current : active)));
      const range = pages.slice(Math.min(from, i), Math.max(from, i) + 1).map((p) => p.id);
      setPicked(e.ctrlKey || e.metaKey ? [...new Set([...base, ...range])] : range);
      return;
    }
    anchor.current = id;
    setPicked([]);
    setActivePage(id);
  };
  const bgToPicked = () => {
    const src = pages.find((p) => p.id === active);
    if (!src) return;
    const others = picked.filter((id) => id !== active);
    setBackgroundOn(others, (b) => ({ ...structuredClone(src.background), image: src.background.image.assetId ? { ...src.background.image } : b.image }), 'Background from page');
    toast(`“${src.name}” background applied to ${others.length} page${others.length === 1 ? '' : 's'} — Ctrl+Z to undo`, 'success');
  };
  const delPicked = () =>
    void askConfirm({ title: `Delete ${picked.length} pages?`, message: 'You can undo with Ctrl+Z.', danger: true }).then((ok) => {
      if (ok) {
        deletePages(picked);
        setPicked([]);
      }
    });
  const exportPicked = () => void doExport(picked, { ...usePrefs.getState().exportSettings, saveAs: usePrefs.getState().exportSettings.saveAs ?? 'zip' });
  return (
    <div className="pagestrip" data-tour="pagestrip">
      <span className="label">
        Pages<small>{pages.length}</small>
      </span>
      {multi && (
        <div className="page-selbar">
          <b>{picked.length} of {pages.length} pages</b>
          <button className="btn ghost sm" title="Pick every page" disabled={picked.length === pages.length} onClick={() => setPicked(pages.map((x) => x.id))}>
            All
          </button>
          <button className="btn ghost sm" title="Pick the pages that are not picked" onClick={invertPageSelection}>
            Invert
          </button>
          <span className="opt-sep" />
          <button className="btn ghost sm" title="Duplicate the selected pages" onClick={() => duplicatePages(picked)}>
            <Copy size={13} /> Duplicate
          </button>
          <button className="btn ghost sm" title="Give the selected pages the background of the page you are on (outlined)" disabled={!picked.some((id) => id !== active)} onClick={bgToPicked}>
            <PaintBucket size={13} /> Use this background
          </button>
          <button className="btn ghost sm" title="Export the selected pages (folder or ZIP, as set in Export)" onClick={exportPicked}>
            <Download size={13} /> Export
          </button>
          <button className="btn ghost sm danger" title="Delete the selected pages" onClick={delPicked}>
            <Trash2 size={13} /> Delete
          </button>
          <button className="btn ghost icon sm" title="Clear the page selection (Esc)" onClick={() => setPicked([])}>
            <X size={13} />
          </button>
          <span className="muted small page-selbar-note">Themes and backgrounds from the library apply to all {picked.length}</span>
        </div>
      )}
      <div className="pages">
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={`pagecard ${p.id === active ? 'on' : ''} ${multi && picked.includes(p.id) ? 'picked' : ''} ${dropIdx === i ? 'drop-before' : ''}`}
            onClick={(e) => click(e, p.id, i)}
            onDoubleClick={() => setEditing(p.id)}
            title={`${p.name} — ${p.width}×${p.height} · ${p.objects.length} objects\nCtrl-click / Shift-click to select several · double-click to rename · drag to reorder`}
            draggable={editing !== p.id}
            onDragStart={(e) => {
              dragId.current = p.id;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/x-page', p.id);
            }}
            onDragOver={(e) => {
              if (!dragId.current) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setDropIdx(e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
            onDragLeave={() => setDropIdx(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragId.current;
              dragId.current = null;
              if (id && dropIdx !== null) {
                const from = pages.findIndex((x) => x.id === id);
                movePage(id, dropIdx > from ? dropIdx - 1 : dropIdx);
              }
              setDropIdx(null);
            }}
            onDragEnd={() => {
              dragId.current = null;
              setDropIdx(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (multi && picked.includes(p.id)) {
                openMenu(e.clientX, e.clientY, [
                  { label: `Duplicate ${picked.length} pages`, onClick: () => duplicatePages(picked) },
                  { label: `Export ${picked.length} pages…`, onClick: exportPicked },
                  { label: 'Use the open page’s background', disabled: !picked.some((id) => id !== active), onClick: bgToPicked },
                  { separator: true },
                  { label: 'Select all pages', disabled: picked.length === pages.length, onClick: () => setPicked(pages.map((x) => x.id)) },
                  { label: 'Invert selection', onClick: invertPageSelection },
                  { label: 'Clear selection', shortcut: 'Esc', onClick: () => setPicked([]) },
                  { separator: true },
                  { label: `Delete ${picked.length} pages`, danger: true, onClick: delPicked },
                ]);
                return;
              }
              openMenu(e.clientX, e.clientY, [
                { label: 'Rename', onClick: () => setEditing(p.id) },
                { label: 'Duplicate page', onClick: () => duplicatePage(p.id) },
                { label: 'Export this page…', onClick: () => void doExport([p.id], usePrefs.getState().exportSettings) },
                { separator: true },
                { label: 'Select all pages', shortcut: 'Shift-click', disabled: pages.length < 2, onClick: () => setPicked(pages.map((x) => x.id)) },
                { label: 'Select other pages', disabled: pages.length < 3, onClick: () => setPicked(pages.filter((x) => x.id !== p.id).map((x) => x.id)) },
                { separator: true },
                { label: 'Move left', disabled: i === 0, onClick: () => movePage(p.id, i - 1) },
                { label: 'Move right', disabled: i === pages.length - 1, onClick: () => movePage(p.id, i + 1) },
                { separator: true },
                { label: 'Delete page', danger: true, onClick: () => void askConfirm({ title: `Delete page “${p.name}”?`, message: 'You can undo with Ctrl+Z.', danger: true }).then((ok) => {
            if (ok) void deletePage(p.id);
          }) },
                { label: 'Delete other pages', danger: true, disabled: pages.length < 2, onClick: () => void askConfirm({ title: `Delete all pages except “${p.name}”?`, message: 'You can undo with Ctrl+Z.', danger: true }).then((ok) => ok && deletePages(pages.filter((x) => x.id !== p.id).map((x) => x.id))) },
                { label: 'Delete all pages', danger: true, onClick: () => void askConfirm({ title: `Delete all ${pages.length} pages?`, message: 'A blank page remains. You can undo with Ctrl+Z.', danger: true }).then((ok) => {
            if (ok) void deleteAllPages();
          }) },
              ]);
            }}
          >
            <PageThumb page={p} />
            <div className="pname">
              {editing === p.id ? (
                <input
                  autoFocus
                  defaultValue={p.name}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.name) renamePage(p.id, v);
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <span>{p.name}</span>
                  <small>
                    {p.width}×{p.height}
                  </small>
                </>
              )}
            </div>
          </div>
        ))}
        <button className="addpage" title="Add page" aria-label="Add page" onClick={() => openDialog('newPage')}>
          <Plus size={16} />
        </button>
      </div>
      <button className="icon-btn" title="Delete all pages (right-click a page for more options)" aria-label="Delete all pages" onClick={() => void askConfirm({ title: `Delete all ${pages.length} page${pages.length > 1 ? 's' : ''}?`, message: 'A blank page remains. You can undo with Ctrl+Z.', danger: true }).then((ok) => {
            if (ok) void deleteAllPages();
          })}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}
