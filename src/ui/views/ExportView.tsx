// Export workspace. Pages on the left (tick what to export, click to preview), the output in the
// middle exactly as it will be written (size, transparency, matte and watermark), the settings on the
// right in the order people decide them: preset, format, size, names and destination, watermark.
// Every option of the earlier Export panel is here; settings are shared with it and with Settings.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileArchive, FolderDown, Maximize2, Minimize2, MoreHorizontal, RotateCcw, Save, Star, ZoomIn, ZoomOut } from 'lucide-react';
import { BUILTIN_EXPORT_PRESETS, DEFAULT_EXPORT } from '../../core/defaults';
import type { ExportFormat, ExportSettings, Page, StoredPreset } from '../../core/types';
import { wmAppliesTo } from '../../core/watermark';
import { estimateBytes, exportOutputs, exportProblem, exportSize, NAME_TOKENS, zipNameFor } from '../../services/exporter';
import { humanBytes } from '../../services/formats';
import { getAsset, getDoc, inGesture, useDoc } from '../../state/doc';
import { usePrefs } from '../../state/prefs';
import { renameProject } from '../../state/project';
import { deletePreset, savePreset, usePresets } from '../../state/presets';
import { duplicatePreset, renamePreset, updatePresetData } from '../../state/customPresets';
import { getWatermark, wmVars } from '../../state/watermark';
import { leaveExport, setStage, useUI } from '../../state/ui';
import { ColorField, NumberField, PropRow, Section, Seg, Slider, Toggle } from '../components/controls';
import { askConfirm, askText } from '../components/ask';
import { openMenu } from '../menus';
import { usePageRender } from '../components/usePageRender';
import { drawWatermark, type WatermarkRender } from '../../render/renderer';
import { images } from '../../render/images';
import { exportPages } from '../right/ExportPanel';

const STAGE_NAME: Record<string, string> = { compose: 'Compose', arrange: 'Arrange', watermark: 'Watermark', review: 'Review', import: 'Import' };
const INVALID = /[\\/:*?"<>|]/g;

/** Settings a preset leaves alone keep their current value (a preset never resets unrelated options). */
const applyPreset = (s: ExportSettings, p: Partial<ExportSettings>): ExportSettings => ({ ...s, customWidth: undefined, ...p });
const presetMatches = (s: ExportSettings, q: Partial<ExportSettings>) => (Object.keys(q) as (keyof ExportSettings)[]).every((k) => (k === 'transparent' ? !!s[k] === !!q[k] : (s[k] ?? undefined) === (q[k] ?? undefined)));

type View = { fit: true } | { fit: false; z: number; cx: number; cy: number };
const MAX_Z = 16;

/**
 * The output exactly as it will be written (size, transparency, matte, watermark), in a viewport you
 * can inspect: wheel to zoom at the pointer, drag to pan, Fit, 100% (one output pixel per screen
 * pixel) and Reset. Zoom and pan change only this view, never the file. The page is rendered at the
 * resolution the view needs (in powers of two, never above the output's) once the view settles;
 * moving the view only redraws that render.
 */
function OutputPreview({ page, s, wm, view, setView, expanded, onExpand }: { page: Page; s: ExportSettings; wm: WatermarkRender | undefined; view: View; setView: (v: View) => void; expanded: boolean; onExpand: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const out = exportSize(page, s);
  const dpr = window.devicePixelRatio || 1;
  // z: CSS pixels per output pixel
  const fitZ = Math.max(0.01, Math.min((size.w - 48) / out.w, (size.h - 48) / out.h));
  const z = view.fit ? fitZ : view.z;
  const cx = view.fit ? page.width / 2 : view.cx,
    cy = view.fit ? page.height / 2 : view.cy;
  // device pixels per page pixel on screen, and the render resolution it needs
  const k = z * dpr * out.scale;
  const need = Math.min(out.scale, 2 ** Math.ceil(Math.log2(Math.max(0.02, k))));
  const transparent = !!s.transparent && s.format !== 'jpeg';
  const bmp = usePageRender(page, need, { transparent, matte: s.format === 'jpeg' ? s.matte : undefined });
  const hasAlpha = s.format !== 'jpeg' && (transparent || page.background.type === 'transparent' || (page.background.type === 'image' && page.background.image.opacity < 1));
  const pct = Math.round(z * dpr * 100);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const W = Math.max(1, Math.round(size.w * dpr)),
      H = Math.max(1, Math.round(size.h * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // page → device pixels
    const ox = W / 2 - cx * k,
      oy = H / 2 - cy * k;
    const pw = page.width * k,
      ph = page.height * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, pw, ph);
    ctx.clip();
    if (hasAlpha) {
      const t = 8 * dpr;
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(ox, oy, pw, ph);
      ctx.fillStyle = '#f2f2f2';
      const x0 = Math.max(ox, 0), y0 = Math.max(oy, 0), x1 = Math.min(ox + pw, W), y1 = Math.min(oy + ph, H);
      for (let y = Math.floor((y0 - oy) / t); oy + y * t < y1; y++) for (let x = Math.floor((x0 - ox) / t) + ((y + Math.floor((x0 - ox) / t)) % 2 ? 1 : 0); ox + x * t < x1; x += 2) ctx.fillRect(ox + x * t, oy + y * t, t, t);
    }
    if (bmp) {
      const b = bmp as CanvasImageSource & { width: number };
      // magnified past the render's own pixels: show them crisp, as the file has them
      ctx.imageSmoothingEnabled = pw / b.width < 1.01;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(b, ox, oy, pw, ph);
      if (wm) {
        ctx.setTransform(k, 0, 0, k, ox, oy);
        drawWatermark(ctx, page, wm, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
      }
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(pw) + 1, Math.round(ph) + 1);
  }, [bmp, wm, k, cx, cy, size, dpr, page, hasAlpha]);

  /** Zoom to `nz` keeping the page point under (px, py) — CSS px in the stage — where it is. */
  const zoomAt = (nz: number, px = size.w / 2, py = size.h / 2) => {
    const zz = Math.max(Math.min(fitZ, 0.05), Math.min(MAX_Z, nz));
    const kk = out.scale;
    // page point under the pointer before
    const wx = cx + (px - size.w / 2) / (z * kk),
      wy = cy + (py - size.h / 2) / (z * kk);
    if (Math.abs(zz - fitZ) < 1e-4) return setView({ fit: true });
    setView({ fit: false, z: zz, cx: wx - (px - size.w / 2) / (zz * kk), cy: wy - (py - size.h / 2) / (zz * kk) });
  };
  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const canPan = !view.fit || out.w * z > size.w || out.h * z > size.h;
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx, cy };
    setGrabbing(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const kk = z * out.scale;
    setView({ fit: false, z, cx: d.cx - (e.clientX - d.x) / kk, cy: d.cy - (e.clientY - d.y) / kk });
  };
  const onUp = () => {
    drag.current = null;
    setGrabbing(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === '0') setView({ fit: true });
    else if (e.key === '1') zoomAt(1 / dpr);
    else if (e.key === '+' || e.key === '=') zoomAt(z * 1.25);
    else if (e.key === '-') zoomAt(z / 1.25);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <>
      <div
        className={`exv-stage ${grabbing ? 'grabbing' : canPan ? 'grab' : ''}`}
        ref={box}
        tabIndex={0}
        aria-label={`Output preview at ${pct}%. Wheel or + and − to zoom, drag to pan, 0 to fit, 1 for 100%.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => (view.fit ? zoomAt(1 / dpr) : setView({ fit: true }))}
        onKeyDown={onKey}
      >
        <canvas ref={canvas} style={{ width: size.w, height: size.h }} />
        {!bmp && <span className="spinner exv-spin" aria-label="Rendering" />}
      </div>
      <div className="exv-zoom" role="toolbar" aria-label="Preview zoom">
        <button className="btn ghost icon sm" title="Zoom out (−)" aria-label="Zoom out" onClick={() => zoomAt(z / 1.25)}>
          <ZoomOut size={14} />
        </button>
        <span className="mono exv-pct" title="One output pixel per screen pixel is 100%">
          {pct}%
        </span>
        <button className="btn ghost icon sm" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomAt(z * 1.25)}>
          <ZoomIn size={14} />
        </button>
        <Seg small value={view.fit ? 'fit' : Math.abs(z - 1 / dpr) < 1e-4 ? '100' : ''} onChange={(v) => (v === 'fit' ? setView({ fit: true }) : zoomAt(1 / dpr))} options={[{ value: 'fit', label: 'Fit', title: 'The whole output in view (0)' }, { value: '100', label: '100%', title: 'One output pixel per screen pixel (1)' }]} />
        <button className="btn ghost icon sm" title="Reset the view" aria-label="Reset the view" disabled={view.fit} onClick={() => setView({ fit: true })}>
          <RotateCcw size={13} />
        </button>
        <button className="btn ghost icon sm" title={expanded ? 'Show the pages and settings again' : 'Larger preview: hide the pages and settings'} aria-label={expanded ? 'Smaller preview' : 'Larger preview'} aria-pressed={expanded} onClick={onExpand}>
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </>
  );
}

function useEstimate(page: Page, s: ExportSettings) {
  const [v, setV] = useState<number | null>(null);
  const key = `${page.id}|${page.objects.length}|${s.format}|${s.quality}|${s.scale}|${s.customWidth ?? ''}|${s.transparent ? 1 : 0}`;
  useEffect(() => {
    setV(null);
    let cancelled = false;
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      if (cancelled) return;
      if (inGesture()) return void (t = setTimeout(run, 500));
      if (exportProblem(page, s)) return;
      void estimateBytes(page, getAsset, s).then((b) => !cancelled && setV(b), () => undefined);
    };
    t = setTimeout(run, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);
  return v;
}

export function ExportView() {
  const doc = useDoc((d) => d.doc);
  const pages = doc.pages;
  const active = doc.activePageId;
  const s = usePrefs((p) => p.exportSettings);
  const brand = usePrefs((p) => p.brandName);
  const favs = usePrefs((p) => p.favExports);
  const set = (patch: Partial<ExportSettings>) => usePrefs.getState().setPrefs({ exportSettings: { ...usePrefs.getState().exportSettings, ...patch } });
  const picked = useUI((u) => u.pageSel);
  const returnTo = useUI((u) => u.exportReturn ?? 'compose');
  const [checked, setChecked] = useState<string[]>(() => (picked.length > 1 ? picked : pages.map((p) => p.id)));
  useEffect(() => setChecked((c) => c.filter((id) => pages.some((p) => p.id === id))), [pages]);
  const [previewId, setPreviewId] = useState(active);
  const page = pages.find((p) => p.id === previewId) ?? pages.find((p) => p.id === active) ?? pages[0];
  const [view, setView] = useState<View>({ fit: true });
  const [expanded, setExpanded] = useState(false);
  // another page or output size starts fitted
  const outKey = `${page.id}|${exportSize(page, s).w}x${exportSize(page, s).h}`;
  useEffect(() => setView({ fit: true }), [outKey]);
  const [showTokens, setShowTokens] = useState(false);
  const saved = usePresets<ExportSettings>('export');
  const watermark = useMemo(() => getWatermark(doc), [doc]);
  const wmr = useMemo<WatermarkRender>(() => ({ watermark, vars: wmVars(doc) }), [watermark, doc, brand]); // eslint-disable-line react-hooks/exhaustive-deps
  const mode = s.watermark ?? 'project';
  const anyWm = pages.some((p) => wmAppliesTo(watermark, p.id));
  const batch = useMemo(() => pages.filter((p) => checked.includes(p.id)), [pages, checked]);
  const outs = useMemo(() => exportOutputs(getDoc(), batch, s, wmr), [batch, s, wmr]);
  const previewOuts = useMemo(() => exportOutputs(getDoc(), [page], s, wmr), [page, s, wmr]);
  const [variant, setVariant] = useState(0);
  const shown = previewOuts[Math.min(variant, previewOuts.length - 1)];
  const out = exportSize(page, s);
  const problem = exportProblem(page, s);
  const estimate = useEstimate(page, s);
  const badPattern = (s.pattern.match(INVALID) ?? []).filter((c, i, a) => a.indexOf(c) === i);
  const problems = batch.map((p) => ({ p, e: exportProblem(p, s) })).filter((x) => x.e);
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const go = () => void exportPages(batch, s);
  const where = outs.length === 1 ? 'with a save dialog' : s.saveAs === 'zip' ? `as ${zipNameFor(doc)}` : 'to a folder you choose';
  const fav = (k: string) => favs.includes(k);
  const toggleFav = (k: string) => usePrefs.getState().setPrefs({ favExports: fav(k) ? favs.filter((x) => x !== k) : [k, ...favs] });
  const builtins = [...BUILTIN_EXPORT_PRESETS].sort((a, b) => Number(fav('b:' + b.name)) - Number(fav('b:' + a.name)));

  return (
    <div className="exv">
      <div className="review-bar">
        <button className="btn ghost sm" onClick={leaveExport} title={`Back to ${STAGE_NAME[returnTo] ?? 'Compose'}`}>
          <ArrowLeft size={14} /> {STAGE_NAME[returnTo] ?? 'Compose'}
        </button>
        <b>Export</b>
        <span className="muted small exv-summary">
          {outs.length} file{outs.length === 1 ? '' : 's'} · {s.format === 'jpeg' ? 'JPG' : s.format.toUpperCase()}
          {s.format !== 'png' ? ` ${Math.round(s.quality * 100)}%` : ''} · {s.customWidth ? `${s.customWidth} px wide` : `${s.scale}×`} · {where}
          {anyWm ? ` · watermark: ${mode === 'none' ? 'off' : mode === 'both' ? 'clean + preview' : 'on'}` : ''}
        </span>
        <span className="grow" />
        <button className="btn ghost sm" onClick={() => setStage('review')}>
          Review first
        </button>
        <button className="btn primary" disabled={!outs.length || problems.length > 0} onClick={go} title={problems.length ? problems[0].e! : undefined}>
          {outs.length > 1 ? s.saveAs === 'zip' ? <FileArchive size={15} /> : <FolderDown size={15} /> : <Download size={15} />}
          Export {outs.length} file{outs.length === 1 ? '' : 's'}
        </button>
      </div>
      <div className={`exv-body ${expanded ? 'expanded' : ''}`}>
        <aside className="exv-pages" aria-label="Pages to export">
          <div className="exv-head">
            <b>Pages</b>
            <span className="muted small">
              {checked.length} of {pages.length}
            </span>
          </div>
          <div className="exv-sel">
            <button className="btn ghost sm" onClick={() => setChecked(pages.map((p) => p.id))}>
              All
            </button>
            <button className="btn ghost sm" onClick={() => setChecked([])}>
              None
            </button>
            <button className="btn ghost sm" onClick={() => setChecked(pages.filter((p) => !checked.includes(p.id)).map((p) => p.id))}>
              Invert
            </button>
            <button className="btn ghost sm" onClick={() => setChecked([active])} title="Only the page open in the editor">
              Current
            </button>
          </div>
          <div className="exv-list">
            {pages.map((p) => {
              const sz = exportSize(p, s);
              const err = exportProblem(p, s);
              const n = outs.filter((o) => o.page.id === p.id);
              return (
                <div key={p.id} className={`exv-row ${p.id === page.id ? 'on' : ''}`} onClick={() => (setPreviewId(p.id), setVariant(0))}>
                  <input type="checkbox" checked={checked.includes(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(p.id)} aria-label={`Export ${p.name}`} />
                  <span className="grow">
                    <span className="ellipsis">{p.name}</span>
                    <small className={err ? 'warn-text' : ''}>{err ? 'Too large at this scale' : n.length ? n.map((o) => o.name).join(' · ') : `${sz.w} × ${sz.h}`}</small>
                  </span>
                  {wmAppliesTo(watermark, p.id) && mode !== 'none' && <span className="exv-wm" title="Carries the watermark">WM</span>}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="exv-preview" aria-label="Output preview">
          <OutputPreview page={page} s={s} wm={shown?.watermarked ? wmr : undefined} view={view} setView={setView} expanded={expanded} onExpand={() => setExpanded((x) => !x)} />
          <div className="exv-meta">
            <span className="ellipsis exv-name mono" title={shown?.name}>
              {shown?.name}
            </span>
            {previewOuts.length > 1 && <Seg small value={variant} onChange={setVariant} options={previewOuts.map((o, i) => ({ value: i, label: o.watermarked ? 'Preview' : 'Clean' }))} />}
            <span className="mono">
              {out.w} × {out.h}
            </span>
            <span>{problem ? <span className="warn-text">{problem}</span> : estimate === null ? 'Estimating size…' : `≈ ${humanBytes(Math.round(estimate))}`}</span>
          </div>
        </section>

        <aside className="exv-settings insp" aria-label="Export settings">
          <Section title="Preset" id="exv-presets">
            <div className="exv-presets">
              {builtins.map((p) => (
                <div key={p.name} className={`exv-preset ${presetMatches(s, p.settings) ? 'on' : ''}`}>
                  <button className="grow" onClick={() => usePrefs.getState().setPrefs({ exportSettings: applyPreset(usePrefs.getState().exportSettings, p.settings) })}>
                    {p.name}
                  </button>
                  <button className={`icon-btn sm ${fav('b:' + p.name) ? 'fav-on' : ''}`} title={fav('b:' + p.name) ? 'Unstar' : 'Star — starred presets come first'} aria-label="Favourite" aria-pressed={fav('b:' + p.name)} onClick={() => toggleFav('b:' + p.name)}>
                    <Star size={12} />
                  </button>
                </div>
              ))}
              {saved.map((p) => (
                <div key={p.id} className={`exv-preset mine ${presetMatches(s, p.data) ? 'on' : ''}`}>
                  <button className="grow" onClick={() => usePrefs.getState().setPrefs({ exportSettings: { ...usePrefs.getState().exportSettings, ...p.data } })}>
                    {p.name}
                  </button>
                  <button
                    className="icon-btn sm"
                    title="Rename, duplicate, update or delete"
                    aria-label={`More for ${p.name}`}
                    onClick={(e) =>
                      openMenu(e.clientX - 180, e.clientY + 10, [
                        { label: 'Update with current settings', onClick: () => void updatePresetData(p as StoredPreset<ExportSettings>, s) },
                        { label: 'Rename…', onClick: () => void askText({ title: 'Rename export preset', value: p.name, okLabel: 'Rename' }).then((n) => n && void renamePreset(p as StoredPreset, n)) },
                        { label: 'Duplicate', onClick: () => void duplicatePreset(p as StoredPreset) },
                        { separator: true },
                        { label: 'Delete…', danger: true, onClick: () => void askConfirm({ title: `Delete export preset “${p.name}”?`, danger: true }).then((ok) => ok && void deletePreset(p.id)) },
                      ])
                    }
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => void askText({ title: 'Save export preset', message: 'Format, size, names, watermark and destination options — available in every project.', value: 'My export', okLabel: 'Save' }).then((n) => n && void savePreset('export', n, s))}>
                <Save size={12} /> Save current
              </button>
              <button className="btn ghost sm" title="Back to the default export settings (your saved presets stay)" onClick={() => usePrefs.getState().setPrefs({ exportSettings: { ...DEFAULT_EXPORT } })}>
                <RotateCcw size={12} /> Defaults
              </button>
            </div>
          </Section>

          <Section title="Format and quality" id="exv-format">
            <Seg<ExportFormat>
              value={s.format}
              onChange={(format) => set({ format })}
              options={[
                { value: 'png', label: 'PNG', title: 'Lossless, keeps transparency' },
                { value: 'webp', label: 'WebP', title: 'Small, keeps transparency' },
                { value: 'jpeg', label: 'JPG', title: 'Smallest, no transparency' },
              ]}
            />
            {s.format !== 'png' && (
              <PropRow label="Quality">
                <Slider value={s.quality} min={0.4} max={1} step={0.01} scale={100} unit="%" onChange={(quality) => set({ quality })} />
              </PropRow>
            )}
            {s.format === 'jpeg' ? (
              <PropRow label="Matte" title="JPG has no transparency — transparent areas become this colour">
                <ColorField value={s.matte} onChange={(matte) => set({ matte })} />
              </PropRow>
            ) : (
              <PropRow label="No background" title="Leave the background out: only icons, text and shapes, on transparency">
                <Toggle checked={!!s.transparent} onChange={(transparent) => set({ transparent })} />
              </PropRow>
            )}
          </Section>

          <Section title="Size" id="exv-size">
            <Seg
              value={s.customWidth ? 'custom' : String(s.scale)}
              onChange={(v) => (v === 'custom' ? set({ customWidth: page.width }) : set({ scale: +v, customWidth: undefined }))}
              options={[
                { value: '1', label: '1×' },
                { value: '2', label: '2×' },
                { value: '4', label: '4×' },
                { value: 'custom', label: 'Width…' },
              ]}
            />
            {s.customWidth !== undefined && (
              <PropRow label="Width" title="Every page is scaled to this width; heights keep each page's proportions">
                <NumberField value={s.customWidth} min={16} max={16384} unit="px" onChange={(customWidth) => set({ customWidth })} />
              </PropRow>
            )}
            <div className="hint">
              {batch.length > 1 && new Set(batch.map((p) => `${p.width}x${p.height}`)).size > 1 ? 'Pages of different sizes keep their own proportions.' : `${out.w} × ${out.h} px for this page.`}
            </div>
          </Section>

          <Section title="Names and destination" id="exv-names">
            <PropRow label="Project" title="Used as {project} in file names">
              <input className="input sm" value={doc.name} onChange={(e) => renameProject(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </PropRow>
            <PropRow label="Pattern" title="Text and tokens. Type anything you like, e.g. my_icons_cover">
              <input className="input sm mono" value={s.pattern} placeholder="{project}_{page}" onChange={(e) => set({ pattern: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
            </PropRow>
            <div className="exp-tokens">
              {(showTokens ? NAME_TOKENS : NAME_TOKENS.slice(0, 4)).map((t) => (
                <button key={t.token} className="chip mono" title={`${t.label} — click to add`} onClick={() => set({ pattern: s.pattern + (s.pattern && !/[_\-\s]$/.test(s.pattern) ? '_' : '') + t.token })}>
                  {t.token}
                </button>
              ))}
              {!showTokens && (
                <button className="btn ghost sm" onClick={() => setShowTokens(true)}>
                  +{NAME_TOKENS.length - 4} more
                </button>
              )}
            </div>
            {badPattern.length > 0 && <div className="hint warn">{badPattern.join(' ')} cannot be used in file names and become “_”.</div>}
            <div className="exv-names" aria-label="File names">
              {outs.slice(0, 6).map((o) => (
                <span key={o.name} className="mono ellipsis" title={o.name}>
                  {o.name}
                </span>
              ))}
              {outs.length > 6 && <span className="muted small">and {outs.length - 6} more</span>}
            </div>
            <PropRow label="Several files" title="With more than one file">
              <Seg
                small
                value={s.saveAs ?? 'folder'}
                onChange={(saveAs) => set({ saveAs })}
                options={[
                  { value: 'folder', label: 'Folder', title: 'One image file per page, in a folder you choose' },
                  { value: 'zip', label: 'ZIP', title: 'All images packed into one .zip' },
                ]}
              />
            </PropRow>
            <PropRow label="If a file exists">
              <Seg
                small
                value={s.onConflict ?? 'number'}
                onChange={(onConflict) => set({ onConflict })}
                options={[
                  { value: 'number', label: 'Keep both', title: 'Add a number: name_2.png' },
                  { value: 'overwrite', label: 'Replace', title: 'Overwrite the existing file' },
                ]}
              />
            </PropRow>
            <PropRow label="Open folder after">
              <Toggle checked={s.revealFolder !== false} onChange={(revealFolder) => set({ revealFolder })} />
            </PropRow>
          </Section>

          <Section title="Watermark" id="exv-wm">
            {anyWm ? (
              <>
                <Seg
                  small
                  value={mode}
                  onChange={(watermark) => set({ watermark })}
                  options={[
                    { value: 'project', label: 'With', title: 'The project watermark on the pages it applies to' },
                    { value: 'none', label: 'Without', title: 'Clean files; the project watermark stays as it is' },
                    { value: 'both', label: 'Both', title: 'A clean file and a watermarked one for each page' },
                  ]}
                />
                {mode === 'both' && (
                  <PropRow label="Preview suffix" title="Added to the watermarked file's name">
                    <input className="input sm mono" value={s.previewSuffix ?? '_preview'} onChange={(e) => set({ previewSuffix: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
                  </PropRow>
                )}
                <button className="btn ghost sm" onClick={() => setStage('watermark')}>
                  Edit the watermark…
                </button>
              </>
            ) : (
              <>
                <div className="hint">No watermark on these pages. Add text or a logo in the Watermark workspace; exports then carry it, with or without a clean copy.</div>
                <button className="btn ghost sm" onClick={() => setStage('watermark')}>
                  Open Watermark
                </button>
              </>
            )}
          </Section>
          <div className="exv-go">
            <button className="btn primary block lg" disabled={!outs.length || problems.length > 0} onClick={go}>
              <Download size={15} /> Export {outs.length} file{outs.length === 1 ? '' : 's'}
            </button>
            {problems.length > 0 && <div className="hint warn">{problems[0].p.name}: {problems[0].e}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

