// Layout type picker with live previews: every option is run on the real page and assets (off-screen,
// without touching the document) and drawn small, so you see the result before choosing.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, History, Maximize2, Minimize2, Search, Star } from 'lucide-react';
import type { LayoutInstance, Page } from '../../core/types';
import { ALGORITHMS, getAlgorithm } from '../../layout/registry';
import { newParams } from '../../state/layoutActions';
import { runLayout } from '../../layout/run';
import { images } from '../../render/images';
import { renderPage } from '../../render/renderer';
import { inGesture, getAsset } from '../../state/doc';
import { usePrefs } from '../../state/prefs';

const GROUPS = ['Showcase', 'Organize', 'Perspective'] as const;
const PREVIEW_ID = '__preview';
const TW = 280;

/** The page as it would look with `objectIds` arranged by `algId` (pure, nothing is committed). */
export function previewLayoutPage(page: Page, algId: string, objectIds: string[], base?: LayoutInstance | null): Page {
  const alg = getAlgorithm(algId);
  const same = base && base.algorithm === algId;
  const ids = new Set(objectIds);
  const inst: LayoutInstance = {
    id: PREVIEW_ID,
    name: alg.label,
    algorithm: algId,
    // the current layout previews with its own settings; others with their defaults
    params: same ? base.params : { ...newParams(alg), order: base?.params.order ?? 'current', ...(base?.params.orderSeed ? { orderSeed: base.params.orderSeed } : {}) },
    seed: base?.seed ?? 4242,
    objectIds,
    slots: [],
    plane: same ? base.plane : undefined,
    path: same ? base.path : undefined,
    overlap: same ? base.overlap : (alg.defaultOverlap ?? 'strict'),
    maxOverlap: base?.maxOverlap ?? 0.3,
    avoidFocal: base?.avoidFocal ?? page.focal.enabled,
    respectSafe: base?.respectSafe ?? true,
  };
  const objects = page.objects.map((o) => (ids.has(o.id) ? { ...o, layoutId: PREVIEW_ID, pinned: same ? o.pinned : false } : o));
  return runLayout({ ...page, objects, layouts: [...page.layouts, inst] }, inst, { getAsset });
}

// Rendered previews, keyed by what a preview actually depends on (page size, background, the
// arranged objects, focal / safe zone) — moving a text or editing other objects doesn't redo them.
const cache = new Map<string, string>();
const bgIds = new WeakMap<object, number>();
let nextBg = 1;
const objId = (o: object) => {
  let v = bgIds.get(o);
  if (!v) bgIds.set(o, (v = nextBg++));
  return v;
};
function pageSignature(page: Page, objectIds: string[]) {
  return `${page.id}|${page.width}x${page.height}|${objId(page.background)}|${JSON.stringify(page.focal)}|${JSON.stringify(page.safeZone)}|${objectIds.length}|${objectIds[0] ?? ''}|${objectIds[objectIds.length - 1] ?? ''}`;
}

/** The page, updated only once edits pause (previews are expensive with hundreds of icons). */
function useSettledPage(page: Page, ms = 900): Page {
  const [settled, setSettled] = useState(page);
  useEffect(() => {
    if (page === settled) return;
    const t = setTimeout(function check() {
      if (inGesture()) return void setTimeout(check, 400);
      setSettled(page);
    }, ms);
    return () => clearTimeout(t);
  }, [page, settled, ms]);
  return settled;
}

export function LayoutThumb({ page: livePage, algId, objectIds, base, delay = 0 }: { page: Page; algId: string; objectIds: string[]; base?: LayoutInstance | null; delay?: number }) {
  const page = useSettledPage(livePage);
  const key = `${pageSignature(page, objectIds)}|${algId}|${base?.seed ?? ''}|${base?.algorithm === algId ? JSON.stringify(base.params) : ''}`;
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? null);
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) return setUrl(hit);
    setUrl(null);
    if (!objectIds.length) return;
    // stagger the work so the menu opens immediately and fills in
    const t = setTimeout(() => {
      try {
        const p = previewLayoutPage(page, algId, objectIds, base);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const k = (TW * 1.6 * dpr) / Math.max(p.width, p.height * 1.6);
        const c = document.createElement('canvas');
        c.width = Math.round(p.width * k);
        c.height = Math.round(p.height * k);
        const ctx = c.getContext('2d')!;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        renderPage(ctx, p, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
        const u = c.toDataURL('image/jpeg', 0.9);
        if (cache.size > 400) cache.clear();
        cache.set(key, u);
        setUrl(u);
      } catch {
        /* a preview is a nicety; the layout itself still works */
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <div className="lthumb">{url ? <img src={url} alt="" /> : <span className="spinner" />}</div>;
}

/** Remember a layout choice for the picker's "Recent" row (newest first, a handful kept). */
export function noteRecentLayout(id: string) {
  const { recentLayouts, setPrefs } = usePrefs.getState();
  setPrefs({ recentLayouts: [id, ...(recentLayouts ?? []).filter((r) => r !== id)].slice(0, 6) });
}

type Alg = (typeof ALGORITHMS)[number];
const matches = (a: Alg, q: string) => !q || `${a.label} ${a.description} ${a.group} ${a.id}`.toLowerCase().includes(q);

/** Grid of layout cards with previews, with search, a type filter, favourites and recent picks. */
export function LayoutGallery({ page, objectIds, base, current, onPick, disabled }: { page: Page; objectIds: string[]; base?: LayoutInstance | null; current?: string; onPick: (id: string) => void; disabled?: boolean }) {
  const favs = usePrefs((s) => s.favLayouts);
  const recent = usePrefs((s) => s.recentLayouts);
  const setPrefs = usePrefs((s) => s.setPrefs);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | (typeof GROUPS)[number]>('all');
  const [large, setLarge] = useState(false);
  const toggleFav = (id: string) => setPrefs({ favLayouts: favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id] });
  const q = query.trim().toLowerCase();
  const byId = (ids: string[]) => ids.map((id) => ALGORITHMS.find((a) => a.id === id)).filter((a): a is Alg => !!a);
  const inGroup = (a: Alg) => group === 'all' || a.group === group;
  const filtering = !!q || group !== 'all';
  const sections = filtering
    ? [{ title: q ? 'Matches' : group, algs: ALGORITHMS.filter((a) => inGroup(a) && matches(a, q)) }]
    : [
        { title: 'Favourites', algs: byId(favs) },
        { title: 'Recent', algs: byId(recent ?? []).filter((a) => !favs.includes(a.id)).slice(0, 4) },
        ...GROUPS.map((g) => ({ title: g as string, algs: ALGORITHMS.filter((a) => a.group === g) })),
      ];
  const shown = sections.filter((s) => s.algs.length);
  const pick = (id: string) => {
    if (disabled) return;
    noteRecentLayout(id);
    onPick(id);
  };
  let i = 0;
  return (
    <div className={`lgallery ${large ? 'large' : ''}`}>
      <div className="lgallery-bar">
        <span className="search">
          <Search size={13} />
          <input
            className="input"
            value={query}
            placeholder={`Search ${ALGORITHMS.length} layouts`}
            aria-label="Search layouts"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' && query) setQuery('');
              if (e.key === 'Enter' && shown[0]?.algs[0]) pick(shown[0].algs[0].id);
            }}
          />
        </span>
        <button className={`btn ghost icon sm ${large ? 'active' : ''}`} title={large ? 'Smaller previews' : 'Larger previews'} aria-label="Toggle preview size" aria-pressed={large} onClick={() => setLarge(!large)}>
          {large ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
      <div className="lgallery-filter">
        {(['all', ...GROUPS] as const).map((g) => (
          <button key={g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
            {g === 'all' ? 'All' : g}
          </button>
        ))}
      </div>
      {!shown.length && <div className="muted small lgallery-empty">No layout matches “{query}”.</div>}
      {shown.map((sec) => (
        <div key={sec.title}>
          <div className="alg-group">
            {sec.title === 'Favourites' && <Star size={11} className="fav-ico" />}
            {sec.title === 'Recent' && <History size={11} className="fav-ico" />} {sec.title}
          </div>
          <div className="lgrid">
            {sec.algs.map((a) => {
              const fav = favs.includes(a.id);
              return (
                <div key={a.id} className={`lcard ${current === a.id ? 'on' : ''} ${disabled ? 'disabled' : ''}`} title={a.description} role="button" tabIndex={0} onClick={() => pick(a.id)} onKeyDown={(e) => e.key === 'Enter' && pick(a.id)}>
                  <LayoutThumb page={page} algId={a.id} objectIds={objectIds} base={base} delay={30 * i++} />
                  <div className="lcard-foot">
                    <span className="grow">{a.label}</span>
                    {current === a.id && <span className="lcard-tag">Current</span>}
                    <button
                      className={`fav-btn ${fav ? 'on' : ''}`}
                      title={fav ? 'Remove from favourites' : 'Add to favourites'}
                      aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                      aria-pressed={fav}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFav(a.id);
                      }}
                    >
                      <Star size={13} fill={fav ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {large && <div className="lcard-desc">{a.description}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dropdown button showing the current layout; opens the preview gallery. */
export function LayoutPickerButton({ page, inst, onPick }: { page: Page; inst: LayoutInstance; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <div className="lpicker" ref={ref}>
      <button className={`lpicker-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} title="Change the layout type — previews use your assets">
        <span className="grow">{getAlgorithm(inst.algorithm).label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="lpopover">
          <LayoutGallery
            page={page}
            objectIds={inst.objectIds}
            base={inst}
            current={inst.algorithm}
            onPick={(id) => {
              setOpen(false);
              if (id !== inst.algorithm) onPick(id);
            }}
          />
        </div>
      )}
    </div>
  );
}
