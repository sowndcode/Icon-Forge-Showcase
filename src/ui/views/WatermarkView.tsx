// Watermark workspace. The page is shown exactly as it will be exported, with the project watermark
// drawn over it. Single marks can be dragged; everything else is edited in the panel on the right.
// The watermark never becomes part of the page: it is stored with the project and drawn on top.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { markBox, wmAppliesTo } from '../../core/watermark';
import { images } from '../../render/images';
import { drawWatermark, watermarkMarks } from '../../render/renderer';
import { beginGesture, endGesture, getAsset, mutate, useDoc, usePage } from '../../state/doc';
import { getWatermark, wmVars } from '../../state/watermark';
import { useUI } from '../../state/ui';
import { usePrefs } from '../../state/prefs';
import { Seg } from '../components/controls';
import { usePageRender } from '../components/usePageRender';

export function WatermarkView() {
  const page = usePage();
  const doc = useDoc((s) => s.doc);
  const brand = usePrefs((s) => s.brandName);
  const wm = useMemo(() => getWatermark(doc), [doc]);
  const sel = useUI((s) => s.wmSel);
  const show = useUI((s) => s.showWatermark);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [bgMode, setBgMode] = useState<'page' | 'light' | 'dark'>('page');
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth - 48, h: el.clientHeight - 48 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = Math.max(0.02, Math.min(size.w / page.width, size.h / page.height));
  const dpr = window.devicePixelRatio || 1;
  const bmp = usePageRender(page, k * dpr);
  const vars = useMemo(() => wmVars(doc), [doc, brand]); // eslint-disable-line react-hooks/exhaustive-deps
  const applies = wmAppliesTo(wm, page.id);

  // draw the page bitmap and the watermark over it
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!bmp) {
      // this page's render is on the way: show nothing rather than the previous page
      c.width = 1;
      c.height = 1;
      return;
    }
    c.width = Math.round(page.width * k * dpr);
    c.height = Math.round(page.height * k * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, c.width, c.height);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    const opts = { pxScale: k * dpr, getAsset, getImage: (id: string) => images.previews.get(id) ?? null };
    if (show) drawWatermark(ctx, page, { watermark: wm, vars }, opts);
    // the selected layer's marks are outlined (single marks only; patterns would be noise)
    const selected = show && applies ? watermarkMarks(ctx, page, { watermark: wm, vars }, getAsset, opts.getImage).find((x) => x.layer.id === sel) : undefined;
    if (selected && selected.layer.mode !== 'tile') {
      ctx.save();
      ctx.lineWidth = 1.5 / (k * dpr);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#378ef0';
      ctx.setLineDash([4 / (k * dpr), 3 / (k * dpr)]);
      for (const m of selected.marks.slice(0, 60)) {
        const b = markBox(m);
        ctx.strokeRect(b.x - 2 / k, b.y - 2 / k, b.w + 4 / k, b.h + 4 / k);
      }
      ctx.restore();
    }
  }, [bmp, wm, vars, sel, show, k, dpr, page, applies]);

  // drag a single mark: moves its offset; one undo step per drag
  const onDown = (e: React.PointerEvent) => {
    if (!show || !applies) return;
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const pt = (ev: { clientX: number; clientY: number }) => ({ x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k });
    const p0 = pt(e);
    const ctx = c.getContext('2d')!;
    const all = watermarkMarks(ctx, page, { watermark: wm, vars }, getAsset, (id) => images.previews.get(id) ?? null);
    // topmost layer first; the selected one wins when marks overlap
    const hits = all
      .slice()
      .reverse()
      .filter((x) => x.layer.mode === 'single' && !x.layer.locked && x.marks.some((m) => {
        const b = markBox(m);
        return p0.x >= b.x - 4 / k && p0.x <= b.x + b.w + 4 / k && p0.y >= b.y - 4 / k && p0.y <= b.y + b.h + 4 / k;
      }));
    const hit = hits.find((x) => x.layer.id === sel) ?? hits[0];
    if (!hit) {
      const any = all.find((x) => x.layer.id !== sel && x.marks.length);
      if (any && any.layer.mode !== 'single') useUI.setState({ wmSel: any.layer.id });
      return;
    }
    useUI.setState({ wmSel: hit.layer.id });
    const S = Math.min(page.width, page.height);
    const { dx, dy, id } = hit.layer;
    beginGesture('Move watermark');
    c.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = pt(ev);
      const ndx = dx + (p.x - p0.x) / S,
        ndy = dy + (p.y - p0.y) / S;
      mutate((d) => {
        const w = getWatermark(d);
        return { ...d, watermark: { ...w, layers: w.layers.map((l) => (l.id === id ? { ...l, dx: ndx, dy: ndy } : l)) } };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const bg = bgMode === 'light' ? '#e9e9eb' : bgMode === 'dark' ? '#101011' : undefined;
  return (
    <div className="wm-view">
      <div className="review-bar">
        <b>Watermark</b>
        <span className="muted small">
          {page.name} · {page.width}×{page.height}
          {!wm.enabled ? ' · off' : applies ? '' : ' · not on this page'}
        </span>
        <span className="sep" />
        <button className={`btn ghost sm ${show ? '' : 'active'}`} onClick={() => useUI.setState({ showWatermark: !show })} title="Compare the page with and without the watermark (also in Review)">
          {show ? <Eye size={14} /> : <EyeOff size={14} />} {show ? 'Watermark shown' : 'Clean page'}
        </button>
        <span className="grow" />
        <Seg
          small
          value={bgMode}
          onChange={setBgMode}
          options={[
            { value: 'page', label: 'Page', title: 'The page as exported' },
            { value: 'light', label: 'Light', title: 'Transparent areas on light grey' },
            { value: 'dark', label: 'Dark', title: 'Transparent areas on near-black' },
          ]}
        />
      </div>
      <div className="wm-stage" ref={box} style={bg ? { background: bg } : undefined}>
        <canvas
          ref={canvas}
          className={bg ? '' : 'checker'}
          style={{ width: page.width * k, height: page.height * k, cursor: show && applies ? 'grab' : 'default' }}
          onPointerDown={onDown}
          aria-label="Page with watermark — drag a mark to move it"
        />
        {!wm.layers.length && (
          <div className="wm-empty">
            <b>No watermark yet</b>
            <span>Pick a preset or add text or a logo on the right. It is drawn over your pages in Review and exports, never into them.</span>
          </div>
        )}
      </div>
    </div>
  );
}
