// Large asset preview: one image at a time at full resolution, on a checkerboard, with zoom,
// fit / actual size, its file details and arrow-key navigation through the list it was opened from.
// Only the image on screen is decoded (from its original file); the URL is released on leave.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minus, Plus, Scan, Trash2 } from 'lucide-react';
import type { AssetRecord } from '../../core/types';
import { images } from '../../render/images';
import { deleteAssets, setAssetCategory } from '../../state/assets';
import { useDoc } from '../../state/doc';
import { humanBytes } from '../../services/formats';
import { openDialog, useUI } from '../../state/ui';
import { Modal, Seg } from '../components/controls';
import { askText } from '../components/ask';

/** Open the viewer on `id`; arrows move through `ids` (the list as it is shown). */
export function openAssetPreview(id: string, ids: string[]) {
  openDialog('assetPreview', { id, ids: ids.includes(id) ? ids : [id, ...ids] });
}

const ZOOMS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16];
type Backdrop = 'checker' | 'dark' | 'light';

export function AssetPreviewDialog({ onClose }: { onClose: () => void }) {
  const arg = useUI((s) => s.dialogArg) as { id: string; ids: string[] } | null;
  const all = useDoc((s) => s.doc.assets);
  const byId = useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const ids = useMemo(() => (arg?.ids ?? []).filter((id) => byId.has(id)), [arg, byId]);
  const [cur, setCur] = useState(arg?.id ?? '');
  const a = byId.get(cur);
  const idx = ids.indexOf(cur);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [bg, setBg] = useState<Backdrop>('checker');
  const [url, setUrl] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });

  // the original file of the shown image only
  useEffect(() => {
    if (!a) return;
    const blob = images.blobs.get(a.id);
    if (!blob) return setUrl(images.thumbs.get(a.id) ?? null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitK = a && a.width && a.height ? Math.min((box.w - 64) / a.width, (box.h - 64) / a.height, 8) : 1;
  const k = zoom === 'fit' ? fitK : zoom;
  const go = (d: number) => {
    if (!ids.length) return;
    const n = ids[(idx + d + ids.length) % ids.length];
    setCur(n);
  };
  const step = (dir: 1 | -1) => {
    const z = dir > 0 ? ZOOMS.find((v) => v > k + 1e-6) : [...ZOOMS].reverse().find((v) => v < k - 1e-6);
    setZoom(z ?? k);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
      else if (e.key === '+' || e.key === '=') step(1);
      else if (e.key === '-') step(-1);
      else if (e.key === '0') setZoom('fit');
      else if (e.key === '1') setZoom(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!a) return null;
  const alpha = a.alpha;
  const crisp = k >= 2 || (k > 1 && Math.max(a.width, a.height) <= 128);
  const rows: [string, string][] = [
    ['Size', `${a.width} × ${a.height} px`],
    ['Format', a.format.toUpperCase()],
    ['File size', humanBytes(a.bytes)],
    ['Transparency', alpha ? (alpha.empty ? 'Fully transparent' : alpha.hasAlpha ? `Yes · ${Math.round(alpha.occupancy * 100)}% visible` : 'None (opaque)') : a.status === 'pending' ? 'Analyzing…' : '—'],
    ...(alpha && !alpha.empty ? ([['Visible area', `${alpha.bounds.w} × ${alpha.bounds.h} px`]] as [string, string][]) : []),
    ['Category', a.category || 'Uncategorized'],
    ...(a.folder ? ([['Folder', a.folder]] as [string, string][]) : []),
    ['Imported', new Date(a.addedAt).toLocaleDateString()],
  ];
  return (
    <Modal
      title={
        <span className="apv-title">
          <span className="ellipsis">{a.name}</span>
          <small>
            {idx + 1} of {ids.length}
          </small>
        </span>
      }
      onClose={onClose}
      width={1180}
    >
      <div className="apv">
        <div className="apv-main">
          <div
            ref={stage}
            className={`apv-stage ${bg === 'checker' ? 'checker' : `apv-${bg}`}`}
            onWheel={(e) => {
              e.preventDefault();
              step(e.deltaY < 0 ? 1 : -1);
            }}
            onDoubleClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
          >
            {url ? (
              <img
                src={url}
                alt={a.name}
                draggable={false}
                style={{ width: a.width * k, height: a.height * k, imageRendering: crisp ? 'pixelated' : 'auto' }}
              />
            ) : (
              <span className="muted">{a.status === 'missing' ? 'The file is missing — import it again to relink it' : 'Loading…'}</span>
            )}
            {a.status === 'error' && <div className="apv-error">{a.error ?? 'Could not decode this image'}</div>}
          </div>
          <div className="apv-bar">
            <button className="btn ghost icon sm" title="Previous (←)" aria-label="Previous" onClick={() => go(-1)} disabled={ids.length < 2}>
              <ChevronLeft size={16} />
            </button>
            <button className="btn ghost icon sm" title="Next (→)" aria-label="Next" onClick={() => go(1)} disabled={ids.length < 2}>
              <ChevronRight size={16} />
            </button>
            <span className="opt-sep" />
            <button className="btn ghost icon sm" title="Zoom out (−)" aria-label="Zoom out" onClick={() => step(-1)}>
              <Minus size={14} />
            </button>
            <span className="apv-zoom mono">{Math.round(k * 100)}%</span>
            <button className="btn ghost icon sm" title="Zoom in (+)" aria-label="Zoom in" onClick={() => step(1)}>
              <Plus size={14} />
            </button>
            <button className={`btn ghost sm ${zoom === 'fit' ? 'active' : ''}`} title="Fit to window (0)" onClick={() => setZoom('fit')}>
              <Maximize size={13} /> Fit
            </button>
            <button className={`btn ghost sm ${zoom === 1 ? 'active' : ''}`} title="Actual pixels (1)" onClick={() => setZoom(1)}>
              <Scan size={13} /> 100%
            </button>
            <span className="grow" />
            <Seg<Backdrop>
              small
              value={bg}
              onChange={setBg}
              options={[
                { value: 'checker', label: 'Checker', title: 'Transparent areas as a checkerboard' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
        </div>
        <aside className="apv-info">
          <dl>
            {rows.map(([k2, v]) => (
              <div key={k2} className="apv-row">
                <dt>{k2}</dt>
                <dd title={v}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="apv-actions">
            <button
              className="btn sm"
              onClick={() =>
                void askText({ title: 'Category', value: a.category, placeholder: 'e.g. Weapons', okLabel: 'Set' }).then((v) => {
                  if (v !== null) setAssetCategory([a.id], v);
                })
              }
            >
              Set category…
            </button>
            <button
              className="btn sm danger"
              onClick={() => {
                const next = ids.length > 1 ? ids[(idx + 1) % ids.length] : null;
                void deleteAssets([a.id]).then(() => {
                  if (!useDoc.getState().doc.assets.some((x: AssetRecord) => x.id === a.id)) {
                    if (next) setCur(next);
                    else onClose();
                  }
                });
              }}
            >
              <Trash2 size={13} /> Remove from project
            </button>
          </div>
          <div className="hint">← → to browse · + − to zoom · 0 fit · 1 actual size · Esc to close. Removing affects only this project, never the file on disk.</div>
        </aside>
      </div>
    </Modal>
  );
}
