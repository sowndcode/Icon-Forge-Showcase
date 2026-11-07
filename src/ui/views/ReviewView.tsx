// Review mode: clean preview without editor UI — fit, 100%, thumbnail and marketplace mock-ups, the
// watermark as it will be exported (or the clean page, or both side by side), and page navigation.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Page } from '../../core/types';
import { wmAppliesTo } from '../../core/watermark';
import { drawPreview, isCancelled, requestPreview } from '../components/previewRender';
import { useImageVersion } from '../components/useImageVersion';
import { useDoc, usePage } from '../../state/doc';
import { setActivePage } from '../../state/pages';
import { getWatermark, wmVars } from '../../state/watermark';
import { setStage, useUI } from '../../state/ui';
import { usePrefs } from '../../state/prefs';
import { Seg } from '../components/controls';
import type { WatermarkRender } from '../../render/renderer';

type Zoom = 'fit' | '100' | 'thumb';
type Preview = 'desktop' | 'square' | 'card' | 'crops';
type WmView = 'on' | 'off' | 'compare';

/**
 * One rendered view of `page`, `width` CSS pixels wide (optionally a centred crop of aspect `crop`).
 * The canvas belongs to one page and one shape: when either changes it starts empty and shows a
 * spinner until that page's render is ready, so a previous page is never shown stretched into this
 * frame. Renders are shared (see previewRender.ts): Thumbnail and Crops render the page once.
 */
function Rendered({ page, width, crop, wm, label }: { page: Page; width: number; crop?: number; wm?: WatermarkRender; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const aspect = crop ?? page.width / page.height;
  const imgV = useImageVersion();
  // what the canvas currently shows; anything else means "not drawn yet"
  const [shown, setShown] = useState<string>('');
  const want = `${page.id}|${page.width}x${page.height}|${aspect}`;
  // fractional CSS sizes are kept so that 100% maps exactly one page pixel to one device pixel
  const cssW = Math.max(1, width);
  const cssH = Math.max(1, width / aspect);
  useLayoutEffect(() => {
    // a different page or shape: clear at once rather than show the old bitmap distorted
    const c = ref.current;
    if (c && shown && !shown.startsWith(want)) {
      c.width = 1;
      c.height = 1;
      setShown('');
    }
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    // the page area shown: the whole page, or the centred crop
    const srcW = crop ? Math.min(page.width, page.height * crop) : page.width;
    const srcH = srcW / aspect;
    const dw = Math.round(cssW * dpr),
      dh = Math.round(cssH * dpr);
    const scale = dw / srcW;
    // 100%: exactly one page pixel per device pixel
    const exact = Math.abs(scale - 1) < 1e-3;
    const req = requestPreview(page, exact ? 1 : scale, { wm }, exact);
    let alive = true;
    req.promise.then(
      (r) => {
        const c = ref.current;
        if (!alive || !c) return;
        c.width = dw;
        c.height = dh;
        const ctx = c.getContext('2d')!;
        drawPreview(ctx, r, (page.width - srcW) / 2, (page.height - srcH) / 2, srcW, srcH, dw, dh);
        setShown(`${want}|${dw}x${dh}`);
      },
      (e) => !isCancelled(e) && console.warn('review render failed', e),
    );
    return () => {
      alive = false;
      req.release();
    };
  }, [page, cssW, cssH, crop, aspect, wm, imgV, want]);
  const ready = shown.startsWith(want);
  const canvas = (
    <div className={`review-canvas ${ready ? '' : 'loading'}`} style={{ width: cssW, height: cssH }} aria-busy={!ready}>
      <canvas ref={ref} className="checker" style={{ width: cssW, height: cssH, display: 'block', visibility: ready ? 'visible' : 'hidden' }} />
      {!ready && <span className="spinner" aria-label="Rendering" />}
    </div>
  );
  return label ? (
    <figure className="review-fig">
      {canvas}
      <figcaption>{label}</figcaption>
    </figure>
  ) : (
    canvas
  );
}

/** Store and social crops worth checking: square tiles, 16:9 cards, 4:5 posts and wide banners. */
const CROPS: { label: string; ratio: number; w: number }[] = [
  { label: 'Square tile 1:1', ratio: 1, w: 200 },
  { label: 'Card 16:9', ratio: 16 / 9, w: 300 },
  { label: 'Portrait post 4:5', ratio: 4 / 5, w: 180 },
  { label: 'itch.io cover 630:500', ratio: 630 / 500, w: 240 },
  { label: 'Wide banner 3:1', ratio: 3, w: 420 },
];

export function ReviewView() {
  const page = usePage();
  const doc = useDoc((s) => s.doc);
  const pages = doc.pages;
  const name = doc.name;
  const brand = usePrefs((s) => s.brandName);
  const showWm = useUI((s) => s.showWatermark);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [preview, setPreview] = useState<Preview>('desktop');
  const [wmView, setWmView] = useState<WmView>(showWm ? 'on' : 'off');
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const watermark = useMemo(() => getWatermark(doc), [doc]);
  const wm = useMemo<WatermarkRender>(() => ({ watermark, vars: wmVars(doc) }), [watermark, doc, brand]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasWm = wmAppliesTo(watermark, page.id);
  const view: WmView = hasWm ? wmView : 'off';
  const wmFor = view === 'on' ? wm : undefined;
  useEffect(() => useUI.setState({ showWatermark: wmView !== 'off' }), [wmView]);
  useEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth - 40, h: el.clientHeight - 40 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const idx = pages.findIndex((p) => p.id === page.id);
  const go = (d: number) => {
    const p = pages[(idx + d + pages.length) % pages.length];
    if (p) setActivePage(p.id);
  };
  // ← → (and Page Up / Down) move between pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select') || document.querySelector('.modal-back')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const half = view === 'compare' && preview === 'desktop' && zoom === 'fit';
  const fitW = Math.max(100, Math.min(half ? (size.w - 72) / 2 : size.w, ((size.h - (half ? 32 : 0)) * page.width) / page.height));
  return (
    <div className="review">
      <div className="review-bar">
        <b title="Exactly what will be exported — no guides or overlays">Review</b>
        <button className="btn ghost icon sm" title="Previous page (←)" aria-label="Previous page" disabled={pages.length < 2} onClick={() => go(-1)}>
          <ChevronLeft size={15} />
        </button>
        <span className="muted small review-page">
          {page.name} · {page.width}×{page.height} · page {idx + 1} of {pages.length}
        </span>
        <button className="btn ghost icon sm" title="Next page (→)" aria-label="Next page" disabled={pages.length < 2} onClick={() => go(1)}>
          <ChevronRight size={15} />
        </button>
        <span className="sep" />
        <Seg small value={preview} onChange={setPreview} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'crops', label: 'Crops' }, { value: 'square', label: 'Square crop' }, { value: 'card', label: 'Store cards' }]} />
        {preview === 'desktop' && <Seg small value={zoom} onChange={setZoom} options={[{ value: 'fit', label: 'Fit' }, { value: '100', label: '100%' }, { value: 'thumb', label: 'Thumbnail' }]} />}
        {hasWm && (
          <Seg
            small
            value={wmView}
            onChange={setWmView}
            options={[
              { value: 'on', label: 'Watermarked', title: 'As exported with the project watermark' },
              { value: 'off', label: 'Clean', title: 'Without the watermark (Export ▸ No watermark)' },
              { value: 'compare', label: 'Side by side', title: 'Clean and watermarked next to each other' },
            ]}
          />
        )}
        <span className="grow" />
        <button className="btn ghost icon sm" title="Back to editing" aria-label="Back to editing" onClick={() => setStage('compose')}>
          <X size={15} />
        </button>
      </div>
      <div className="review-stage" ref={stage}>
        {preview === 'desktop' && zoom === 'fit' && !half && <Rendered page={page} width={fitW} wm={wmFor} />}
        {half && (
          <div className="mock-grid review-compare">
            <Rendered page={page} width={fitW} label="Clean" />
            <Rendered page={page} width={fitW} wm={wm} label="Watermarked" />
          </div>
        )}
        {preview === 'desktop' && zoom === '100' && (view === 'compare' ? <Rendered page={page} width={page.width / (window.devicePixelRatio || 1)} wm={wm} /> : <Rendered page={page} width={page.width / (window.devicePixelRatio || 1)} wm={wmFor} />)}
        {preview === 'desktop' && zoom === 'thumb' && (
          <div className="mock-grid">
            {[480, 320, 200, 120].map((w) => (
              <Rendered key={w} page={page} width={w} wm={view === 'off' ? undefined : wm} label={`${w}px wide`} />
            ))}
          </div>
        )}
        {preview === 'crops' && (
          <div className="mock-grid">
            {CROPS.map((c) => (
              <Rendered key={c.label} page={page} width={c.w} crop={c.ratio} wm={view === 'off' ? undefined : wm} label={c.label} />
            ))}
          </div>
        )}
        {preview === 'square' && (
          <div className="mock-grid">
            <Rendered page={page} width={Math.min(520, size.h - 60)} crop={1} wm={view === 'off' ? undefined : wm} label="Center square crop (how square marketplace tiles show a wide image)" />
            <Rendered page={page} width={160} crop={1} wm={view === 'off' ? undefined : wm} label="160px" />
          </div>
        )}
        {preview === 'card' && (
          <div className="mock-grid">
            {[300, 220, 160].map((w) => (
              <div key={w} className="mock-card" style={{ width: w }}>
                <Rendered page={page} width={w} wm={view === 'off' ? undefined : wm} />
                <div className="meta">
                  <b style={{ fontSize: w < 200 ? 11 : 13 }}>{name}</b>
                  <span>Game assets · {page.objects.filter((o) => o.type === 'image').length} items</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
