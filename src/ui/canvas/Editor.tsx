// The composition canvas: one <canvas> rendering the page (via the shared renderer) plus
// editor overlays, and all pointer interaction. Redraws are rAF-scheduled from store
// subscriptions, so React never re-renders on zoom/pan/drag.

import { useEffect, useRef, useState } from 'react';
import { DEG, normAngle, normalizeRect, rectsIntersect, rotate } from '../../core/geometry';
import { buildTargets, resizeGuides, snapAngle, snapRect, snapResizeAxis, type SnapTargets } from '../../core/snap';
import type { SnapGuide } from '../../state/ui';
import { hitObject, scaleAbout, selectionAABB, visibleAABB } from '../../core/transform';
import type { Quad, Rect, SceneObject, Vec } from '../../core/types';
import { images } from '../../render/images';
import { renderPage, type WarpBudget } from '../../render/renderer';
import { getAlgorithm } from '../../layout/registry';
import { layoutGuides, safeRect } from '../../layout/run';
import { beginGesture, endGesture, getAsset, getPage, mutate, useDoc, withPage, cancelGesture } from '../../state/doc';
import { findLayout, rerunFocalLayouts, resortDepth, setPath, setPlane } from '../../state/layoutActions';
import { applyPatches, duplicateSelection, expandGroups, selectedObjects, updateText } from '../../state/objects';
import { addGuide, moveGuide, removeFocal, removeGuide, setBackground, setFocal } from '../../state/pages';
import { addAssetsToCanvas, addShape, addTextAt } from '../../state/placement';
import { usePrefs } from '../../state/prefs';
import { fitView, useUI, useViewport, zoomTo } from '../../state/ui';
import { openMenu, openObjectMenu } from '../menus';
import { focalHandlePoints, drawOverlays, readColors, RULER, type OverlayColors } from './overlays';
import { handleCursor, handlePositions, hitHandle, selectionBox, toPage, toScreen, type HandleId, type SelBox } from './geometry';
import { TextEditor } from './TextEditor';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'marquee'; start: Vec; cur: Vec; base: string[]; additive: boolean }
  | { kind: 'move'; start: Vec; origin: Map<string, SceneObject>; targets: SnapTargets; bbox0: Rect; moved: boolean; narrowTo?: string[] }
  | { kind: 'scale'; handle: HandleId; box: SelBox; origin: Map<string, SceneObject>; single: boolean; targets: SnapTargets | null }
  | { kind: 'rotate'; center: Vec; a0: number; origin: Map<string, SceneObject>; single: boolean }
  | { kind: 'plane'; instId: string; index: number; quad0: Quad; start: Vec }
  | { kind: 'path'; instId: string; index: number; pts0: Vec[]; start: Vec }
  | { kind: 'focal'; mode: 'move' | 'resize'; corner: number; f0: { x: number; y: number; w: number; h: number }; start: Vec }
  | { kind: 'create'; tool: 'rect' | 'ellipse' | 'line' | 'focal'; a: Vec; b: Vec }
  | { kind: 'guide'; id: string | null; axis: 'x' | 'y'; pos: number };

export const ASSET_DRAG_TYPE = 'application/x-showcase-assets';

// A number per page object, so the composition cache knows when the page changed.
const pageVersions = new WeakMap<object, number>();
let nextPageVersion = 1;
function pageVersion(p: object) {
  let v = pageVersions.get(p);
  if (!v) pageVersions.set(p, (v = nextPageVersion++));
  return v;
}

export function Editor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const colors = useRef<OverlayColors | null>(null);
  const frame = useRef(0);
  // the drawn composition, reused while only overlays (hover, selection, guides) change
  const comp = useRef<{ canvas: HTMLCanvasElement; key: string; whole: boolean; zoom: number; page: object } | null>(null);
  // the wheel is turning until then (ms); zoom frames reuse the last render meanwhile
  const zoomingUntil = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const imgVer = useRef(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const tool = useUI((s) => s.tool);
  const spaceDown = useUI((s) => s.spaceDown);
  // colours are read from CSS variables, so re-read them when any colour setting changes
  const theme = usePrefs((s) => `${s.theme}|${s.accent}|${s.guideColor}|${s.pasteboard}`);

  // ---------------------------------------------------------------- drawing
  const draw = () => {
    frame.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = useViewport.getState();
    const ui = useUI.getState();
    const prefs = usePrefs.getState();
    const page = getPage();
    if (!colors.current) colors.current = readColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const view = { zoom: vp.zoom, panX: vp.panX, panY: vp.panY, vw: vp.vw, vh: vp.vh };
    const tl = toScreen(view, { x: 0, y: 0 });
    const pw = page.width * vp.zoom,
      ph = page.height * vp.zoom;
    // page shadow + checkerboard for transparency
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#808080';
    ctx.fillRect(tl.x, tl.y, pw, ph);
    ctx.restore();
    ctx.fillStyle = checker(ctx);
    ctx.fillRect(tl.x, tl.y, pw, ph);
    // composition — rendered again only when the page, the zoom or the loaded images change.
    // When the whole page fits in a bitmap of reasonable size it is rendered once per zoom and panning
    // only moves it; zoomed in further, only the visible part is rendered (icons off screen skipped).
    const skip = ui.editingTextId ? new Set([ui.editingTextId]) : undefined;
    const k = vp.zoom * dpr;
    const pageDev = { w: Math.ceil(page.width * k), h: Math.ceil(page.height * k) };
    const whole = pageDev.w <= 8192 && pageDev.h <= 8192 && pageDev.w * pageDev.h <= Math.max(canvas.width * canvas.height * 2.5, 4_000_000);
    const base = `${pageVersion(page)}|${vp.zoom}|${dpr}|${ui.editingTextId ?? ''}|${imgVer.current}`;
    const key = whole ? `${base}|page` : `${base}|${vp.panX}|${vp.panY}|${canvas.width}x${canvas.height}`;
    const c0 = comp.current;
    const zooming = performance.now() < zoomingUntil.current;
    // while the wheel turns, the last whole-page render is scaled into place (same composition,
    // briefly softer); the sharp render follows when the wheel stops
    const scaleOld = zooming && c0?.whole && c0.page === page && c0.zoom !== vp.zoom && c0.key.startsWith(`${pageVersion(page)}|`);
    if (!scaleOld && (!c0 || c0.key !== key)) {
      const c = c0?.canvas ?? document.createElement('canvas');
      const W = whole ? pageDev.w : canvas.width,
        H = whole ? pageDev.h : canvas.height;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const cx = c.getContext('2d')!;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, c.width, c.height);
      if (whole) cx.setTransform(k, 0, 0, k, 0, 0);
      else cx.setTransform(k, 0, 0, k, dpr * vp.panX, dpr * vp.panY);
      // exact Ground Plane warps for ~20 ms per frame; the rest are drawn quickly and refined next frame
      const warpBudget: WarpBudget = { ms: 20, min: 6, incomplete: false };
      const visible = whole ? undefined : { x0: -vp.panX / vp.zoom, y0: -vp.panY / vp.zoom, x1: (vp.vw - vp.panX) / vp.zoom, y1: (vp.vh - vp.panY) / vp.zoom };
      renderPage(cx, page, { pxScale: k, getImage: (id, px) => images.get(id, px), getAsset, placeholders: true, skip, warpBudget, visible });
      comp.current = { canvas: c, key: warpBudget.incomplete ? key + '|partial' : key, whole, zoom: vp.zoom, page };
      if (warpBudget.incomplete) schedule();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cc = comp.current!;
    if (cc.whole) {
      const s = vp.zoom / cc.zoom;
      if (s === 1) ctx.drawImage(cc.canvas, Math.round(dpr * vp.panX), Math.round(dpr * vp.panY));
      else ctx.drawImage(cc.canvas, dpr * vp.panX, dpr * vp.panY, cc.canvas.width * s, cc.canvas.height * s);
    } else ctx.drawImage(cc.canvas, 0, 0);
    if (scaleOld) {
      clearTimeout(settle.current);
      settle.current = setTimeout(schedule, Math.max(0, zoomingUntil.current - performance.now()) + 10);
    }
    // overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ui.stage === 'review') return;
    const sel = selectedObjects(page);
    const d = drag.current;
    const inst = findLayout(page, ui.activeLayoutId) ?? null;
    const guide = inst ? layoutGuides(page, inst) : null;
    drawOverlays(ctx, {
      page,
      view,
      selection: sel,
      selBox: selectionBox(sel, getAsset),
      hover: ui.hoverId && !d ? page.objects.find((o) => o.id === ui.hoverId) ?? null : null,
      getAsset,
      overlays: prefs.overlays,
      layoutGuide: guide,
      showPlaneHandles: true,
      snapGuides: ui.snapGuides,
      marquee: d?.kind === 'marquee' ? normalizeRect(d.start, d.cur) : null,
      createRect: d?.kind === 'create' ? { tool: d.tool, a: d.a, b: d.b } : null,
      focalHandles: page.focal.enabled && (ui.tool === 'focal' || ui.stage === 'arrange'),
      colors: colors.current!,
      hideHandles: !!(d && (d.kind === 'move' || d.kind === 'rotate')) || sel.some((o) => o.locked),
    });
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    colors.current = null;
    schedule();
  }, [theme]);

  useEffect(() => {
    const onImages = () => {
      imgVer.current++;
      schedule();
    };
    const unsubs = [useDoc.subscribe(schedule), useUI.subscribe(schedule), useViewport.subscribe(schedule), usePrefs.subscribe(schedule), images.subscribe(onImages)];
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      colors.current = null;
      schedule();
    };
    mq.addEventListener('change', onScheme);
    return () => {
      unsubs.forEach((u) => u());
      mq.removeEventListener('change', onScheme);
      if (frame.current) cancelAnimationFrame(frame.current);
      clearTimeout(settle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // size tracking
  useEffect(() => {
    const el = wrapRef.current!;
    let first = true;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const c = canvasRef.current!;
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      const prev = useViewport.getState();
      useViewport.setState({ vw: r.width, vh: r.height });
      if (first || prev.vw < 10 || prev.fitted) {
        first = false;
        const p = getPage();
        fitView(p.width, p.height);
      }
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wheel zoom (non-passive)
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const vp = useViewport.getState();
      if (e.shiftKey && !e.ctrlKey) {
        useViewport.setState({ panX: vp.panX - (e.deltaY || e.deltaX), fitted: false });
        return;
      }
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomingUntil.current = performance.now() + 140;
      zoomTo(vp.zoom * k, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---------------------------------------------------------------- helpers
  const local = (e: { clientX: number; clientY: number }): Vec => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const view = () => useViewport.getState();

  const hitTest = (p: Vec, opts: { includeLocked?: boolean } = {}): SceneObject | null => {
    const page = getPage();
    const tol = 3 / view().zoom;
    for (let i = page.objects.length - 1; i >= 0; i--) {
      const o = page.objects[i];
      if (o.hidden || (o.locked && !opts.includeLocked)) continue;
      if (hitObject(o, p, o.type === 'image' ? getAsset(o.assetId) : undefined, tol)) return o;
    }
    return null;
  };

  const overlayHit = (sp: Vec): Drag | null => {
    const ui = useUI.getState();
    const page = getPage();
    const v = view();
    const pp = toPage(v, sp);
    // layout handles (plane corners, path points)
    const inst = findLayout(page, ui.activeLayoutId);
    if (inst && usePrefs.getState().overlays.perspective) {
      const g = layoutGuides(page, inst);
      if (g.plane) {
        const i = g.plane.findIndex((q) => {
          const s = toScreen(v, q);
          return Math.abs(s.x - sp.x) <= 8 && Math.abs(s.y - sp.y) <= 8;
        });
        if (i >= 0) return { kind: 'plane', instId: inst.id, index: i, quad0: g.plane, start: pp };
      }
      if (g.path) {
        const i = g.path.findIndex((q) => {
          const s = toScreen(v, q);
          return Math.hypot(s.x - sp.x, s.y - sp.y) <= 8;
        });
        if (i >= 0) return { kind: 'path', instId: inst.id, index: i, pts0: g.path, start: pp };
      }
    }
    // focal handles
    if (page.focal.enabled && (ui.tool === 'focal' || ui.stage === 'arrange')) {
      const hs = focalHandlePoints(page, v);
      const i = hs.findIndex((h) => Math.abs(h.x - sp.x) <= 7 && Math.abs(h.y - sp.y) <= 7);
      if (i >= 0) return { kind: 'focal', mode: 'resize', corner: i, f0: { ...page.focal }, start: pp };
      if (ui.tool === 'focal') {
        const f = page.focal;
        const inside = f.shape === 'ellipse' ? ((pp.x - f.x) / (f.w / 2)) ** 2 + ((pp.y - f.y) / (f.h / 2)) ** 2 <= 1 : Math.abs(pp.x - f.x) <= f.w / 2 && Math.abs(pp.y - f.y) <= f.h / 2;
        if (inside) return { kind: 'focal', mode: 'move', corner: -1, f0: { ...f }, start: pp };
      }
    }
    // guides (grab within 4px) when rulers are on
    if (usePrefs.getState().overlays.rulers) {
      for (const g of page.guides) {
        const s = g.axis === 'x' ? g.pos * v.zoom + v.panX : g.pos * v.zoom + v.panY;
        if (Math.abs((g.axis === 'x' ? sp.x : sp.y) - s) <= 4) return { kind: 'guide', id: g.id, axis: g.axis, pos: g.pos };
      }
    }
    return null;
  };

  const selectionHandles = () => {
    const sel = selectedObjects();
    if (!sel.length || sel.some((o) => o.locked)) return null;
    const box = selectionBox(sel, getAsset);
    if (!box) return null;
    return { sel, box, handles: handlePositions(box, view(), sel.length === 1) };
  };

  // ---------------------------------------------------------------- pointer
  const onPointerDown = (e: React.PointerEvent) => {
    if (useUI.getState().editingTextId) return;
    wrapRef.current!.focus();
    const sp = local(e);
    const v = view();
    const pp = toPage(v, sp);
    const ui = useUI.getState();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    useUI.setState({ menu: null });

    if (e.button === 1 || ui.spaceDown || ui.tool === 'hand') {
      drag.current = { kind: 'pan', sx: sp.x, sy: sp.y, panX: v.panX, panY: v.panY };
      setCursor('grabbing');
      return;
    }
    if (e.button === 2) return;

    // rulers → new guide
    if (usePrefs.getState().overlays.rulers && (sp.y < RULER || sp.x < RULER) && !(sp.x < RULER && sp.y < RULER)) {
      const axis = sp.y < RULER ? 'y' : 'x';
      drag.current = { kind: 'guide', id: null, axis, pos: axis === 'x' ? pp.x : pp.y };
      return;
    }

    // creation tools
    if (ui.tool === 'text') {
      const t = addTextAt(pp);
      useUI.setState({ tool: 'select', editingTextId: t.id });
      return;
    }
    if (ui.tool === 'rect' || ui.tool === 'ellipse' || ui.tool === 'line') {
      drag.current = { kind: 'create', tool: ui.tool, a: pp, b: pp };
      return;
    }

    // transform handles of the current selection
    const sh = selectionHandles();
    if (sh) {
      const h = hitHandle(sh.handles, sp);
      if (h) {
        beginGesture(h === 'rot' ? 'Rotate' : 'Scale');
        const origin = new Map(sh.sel.map((o) => [o.id, o]));
        if (h === 'rot') drag.current = { kind: 'rotate', center: { x: sh.box.cx, y: sh.box.cy }, a0: Math.atan2(pp.y - sh.box.cy, pp.x - sh.box.cx), origin, single: sh.sel.length === 1 };
        else {
          // resizing snaps the dragged edges to the page, guides and other objects (unrotated selections)
          const page = getPage();
          const prefs = usePrefs.getState();
          const others =
            prefs.snap.objects && page.objects.length < 1500
              ? page.objects.filter((o) => !origin.has(o.id) && !o.hidden).map((o) => visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined))
              : [];
          const targets = Math.abs(normAngle(sh.box.rot)) < 0.01 ? buildTargets(page, others, page.guides, page.safeZone.enabled ? safeRect(page) : null, prefs.snap) : null;
          drag.current = { kind: 'scale', handle: h, box: sh.box, origin, single: sh.sel.length === 1, targets };
        }
        return;
      }
    }
    const oh = overlayHit(sp);
    if (oh) {
      if (oh.kind !== 'guide') beginGesture(oh.kind === 'focal' ? 'Focal region' : oh.kind === 'plane' ? 'Perspective plane' : 'Edit path');
      drag.current = oh;
      return;
    }
    if (ui.tool === 'focal') {
      drag.current = { kind: 'create', tool: 'focal', a: pp, b: pp };
      return;
    }

    // objects
    const hit = hitTest(pp);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (hit) {
      const ids = e.ctrlKey || e.metaKey ? [hit.id] : expandGroups([hit.id]);
      let next = ui.selection;
      // Clicking an item that is already part of a bigger selection (after Add all, a layout, or a
      // group) keeps the selection for dragging, but a plain click without dragging narrows it to
      // that item — so single icons can always be picked out and moved with their own guides.
      const narrowTo = !e.shiftKey && ids.every((id) => next.includes(id)) && next.length > 1 ? (ids.length < next.length ? ids : [hit.id]) : undefined;
      if (e.shiftKey) {
        const has = ids.every((id) => next.includes(id));
        next = has ? next.filter((id) => !ids.includes(id)) : [...next, ...ids.filter((id) => !next.includes(id))];
      } else if (!ids.every((id) => next.includes(id))) next = ids;
      useUI.getState().setSelection(next);
      if (hit.layoutId) useUI.setState({ activeLayoutId: hit.layoutId });
      if (!next.includes(hit.id)) return;
      if (e.altKey) duplicateSelection(0);
      const sel = selectedObjects().filter((o) => !o.locked);
      if (!sel.length) return;
      beginGesture(e.altKey ? 'Duplicate & move' : 'Move');
      const page = getPage();
      const moving = new Set(sel.map((o) => o.id));
      const prefs = usePrefs.getState();
      const others =
        prefs.snap.objects && page.objects.length < 1500
          ? page.objects.filter((o) => !moving.has(o.id) && !o.hidden).map((o) => visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined))
          : [];
      const targets = buildTargets(page, others, page.guides, page.safeZone.enabled ? safeRect(page) : null, prefs.snap);
      drag.current = { kind: 'move', start: pp, origin: new Map(sel.map((o) => [o.id, o])), targets, bbox0: selectionAABB(sel, getAsset)!, moved: false, narrowTo };
      return;
    }
    if (!additive) useUI.getState().setSelection([]);
    drag.current = { kind: 'marquee', start: pp, cur: pp, base: additive ? ui.selection : [], additive };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const sp = local(e);
    const v = view();
    const pp = toPage(v, sp);
    const d = drag.current;
    if (!d) {
      // hover + cursor feedback
      if (useUI.getState().editingTextId) return;
      const sh = selectionHandles();
      const h = sh ? hitHandle(sh.handles, sp) : null;
      if (h) setCursor(handleCursor(h, sh!.box.rot));
      else {
        const oh = overlayHit(sp);
        if (oh?.kind === 'guide') setCursor(oh.axis === 'x' ? 'ew-resize' : 'ns-resize');
        else if (oh?.kind === 'focal') setCursor(oh.mode === 'move' ? 'move' : 'nwse-resize');
        else if (oh) setCursor('pointer');
        else setCursor(undefined);
      }
      const hit = useUI.getState().tool === 'select' && !useUI.getState().spaceDown ? hitTest(pp) : null;
      const id = hit?.id ?? null;
      if (id !== useUI.getState().hoverId) useUI.setState({ hoverId: id });
      return;
    }
    switch (d.kind) {
      case 'pan':
        useViewport.setState({ panX: d.panX + sp.x - d.sx, panY: d.panY + sp.y - d.sy, fitted: false });
        break;
      case 'marquee': {
        d.cur = pp;
        const r = normalizeRect(d.start, d.cur);
        const page = getPage();
        const inside = page.objects.filter((o) => !o.hidden && !o.locked && rectsIntersect(r, visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined))).map((o) => o.id);
        const ids = expandGroups(inside);
        useUI.getState().setSelection(d.additive ? [...new Set([...d.base, ...ids])] : ids);
        break;
      }
      case 'move': {
        let dx = pp.x - d.start.x,
          dy = pp.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * v.zoom < 3) return;
        d.moved = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const prefs = usePrefs.getState();
        let guides: SnapGuide[] = [];
        if (prefs.snap.enabled && !e.ctrlKey) {
          const moved = { ...d.bbox0, x: d.bbox0.x + dx, y: d.bbox0.y + dy };
          const s = snapRect(moved, d.targets, prefs.snap, v.zoom);
          dx += s.dx;
          dy += s.dy;
          guides = s.guides;
        }
        const patches = new Map<string, Partial<SceneObject>>();
        for (const [id, o] of d.origin) patches.set(id, { x: o.x + dx, y: o.y + dy });
        mutate((doc) => withPage(doc, (p) => applyPatches(p, patches)));
        useUI.setState({ snapGuides: guides });
        break;
      }
      case 'scale':
        doScale(d, pp, e.shiftKey, e.altKey, e.ctrlKey);
        break;
      case 'rotate': {
        let delta = (Math.atan2(pp.y - d.center.y, pp.x - d.center.x) - d.a0) / DEG;
        if (e.shiftKey) {
          if (d.single) {
            const o = [...d.origin.values()][0];
            delta = Math.round((o.rotation + delta) / 15) * 15 - o.rotation;
          } else delta = Math.round(delta / 15) * 15;
        } else if (d.single && usePrefs.getState().snap.enabled && !e.ctrlKey) {
          // gently lock to upright / 45° / 90° like other design tools
          const o = [...d.origin.values()][0];
          delta = snapAngle(o.rotation + delta) - o.rotation;
        }
        const patches = new Map<string, Partial<SceneObject>>();
        for (const [id, o] of d.origin) {
          const r = rotate({ x: o.x - d.center.x, y: o.y - d.center.y }, delta);
          patches.set(id, { x: d.center.x + r.x, y: d.center.y + r.y, rotation: normAngle(o.rotation + delta) });
        }
        mutate((doc) => withPage(doc, (p) => applyPatches(p, patches)));
        break;
      }
      case 'plane': {
        const q = d.quad0.map((p, i) => (i === d.index ? { x: p.x + pp.x - d.start.x, y: p.y + pp.y - d.start.y } : p)) as Quad;
        setPlane(d.instId, q, true);
        break;
      }
      case 'path': {
        const pts = d.pts0.map((p, i) => (i === d.index ? { x: p.x + pp.x - d.start.x, y: p.y + pp.y - d.start.y } : p));
        setPath(d.instId, pts, true);
        break;
      }
      case 'focal': {
        const dx = pp.x - d.start.x,
          dy = pp.y - d.start.y;
        if (d.mode === 'move') setFocal({ x: d.f0.x + dx, y: d.f0.y + dy }, { silent: true });
        else {
          const sx = d.corner === 0 || d.corner === 3 ? -1 : 1;
          const sy = d.corner < 2 ? -1 : 1;
          const x0 = d.f0.x - (sx * d.f0.w) / 2,
            y0 = d.f0.y - (sy * d.f0.h) / 2; // opposite corner
          const x1 = d.f0.x + (sx * d.f0.w) / 2 + dx,
            y1 = d.f0.y + (sy * d.f0.h) / 2 + dy;
          if (e.altKey) setFocal({ w: Math.max(10, Math.abs(x1 - d.f0.x) * 2), h: Math.max(10, Math.abs(y1 - d.f0.y) * 2) }, { silent: true });
          else setFocal({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.max(10, Math.abs(x1 - x0)), h: Math.max(10, Math.abs(y1 - y0)) }, { silent: true });
        }
        break;
      }
      case 'create': {
        let b = pp;
        if (e.shiftKey && d.tool !== 'line') {
          const s = Math.max(Math.abs(pp.x - d.a.x), Math.abs(pp.y - d.a.y));
          b = { x: d.a.x + Math.sign(pp.x - d.a.x || 1) * s, y: d.a.y + Math.sign(pp.y - d.a.y || 1) * s };
        }
        d.b = b;
        schedule();
        break;
      }
      case 'guide': {
        d.pos = d.axis === 'x' ? pp.x : pp.y;
        if (d.id) moveGuide(d.id, Math.round(d.pos));
        else schedule();
        break;
      }
    }
  };

  const doScale = (d: Extract<Drag, { kind: 'scale' }>, pp: Vec, shift: boolean, alt: boolean, ctrl = false) => {
    const b = d.box;
    const [sx, sy] = handleDirs[d.handle];
    const anchorLocal = alt ? { x: 0, y: 0 } : { x: (-sx * b.w) / 2, y: (-sy * b.h) / 2 };
    const handleLocal = { x: (sx * b.w) / 2, y: (sy * b.h) / 2 };
    const l = rotate({ x: pp.x - b.cx, y: pp.y - b.cy }, -b.rot);
    const corner = sx !== 0 && sy !== 0;
    let kx = 1,
      ky = 1;
    if (corner && !(shift && d.single)) {
      const hx = handleLocal.x - anchorLocal.x,
        hy = handleLocal.y - anchorLocal.y;
      const k = ((l.x - anchorLocal.x) * hx + (l.y - anchorLocal.y) * hy) / (hx * hx + hy * hy);
      kx = ky = Math.max(0.01, k);
    } else {
      if (sx) kx = Math.max(0.01, (l.x - anchorLocal.x) / (handleLocal.x - anchorLocal.x));
      if (sy) ky = Math.max(0.01, (l.y - anchorLocal.y) / (handleLocal.y - anchorLocal.y));
    }
    const ar = rotate(anchorLocal, b.rot);
    const A = { x: b.cx + ar.x, y: b.cy + ar.y };
    // smart guides: snap the edges being dragged
    const snap = usePrefs.getState().snap;
    let guides: ReturnType<typeof resizeGuides> = [];
    if (d.targets && snap.enabled && !ctrl) {
      const zoom = view().zoom;
      const span = (k: number, w: number, dir: number, c: number) => (alt ? [c - (w * k) / 2, (w * k)] : dir > 0 ? [c, w * k] : dir < 0 ? [c - w * k, w * k] : [b.cx - b.w / 2, b.w]);
      const rectFor = (kx2: number, ky2: number) => {
        const [x, w] = sx ? span(kx2, b.w, sx, A.x) : [b.cx - b.w / 2, b.w];
        const [y, h] = sy ? span(ky2, b.h, sy, A.y) : [b.cy - b.h / 2, b.h];
        return { x, y, w, h };
      };
      const mv = (dir: number): -1 | 0 | 1 | 2 => (!dir ? 0 : alt ? 2 : (dir as -1 | 1));
      const r0 = rectFor(kx, ky);
      const gx = snapResizeAxis(r0, 'x', mv(sx), d.targets, snap, zoom);
      const gy = snapResizeAxis(r0, 'y', mv(sy), d.targets, snap, zoom);
      // new scale factor that puts the snapped edge on its line
      const kFrom = (g: NonNullable<typeof gx>, size: number, cur: number, dir: number) => Math.max(0.01, (cur + g.d * (alt ? 2 * g.side : dir)) / size);
      const proportional = corner && !(shift && d.single);
      let ux = gx,
        uy = gy;
      if (proportional) {
        // one factor for both axes: take the closer snap
        if (gx && (!gy || Math.abs(gx.d) <= Math.abs(gy.d))) {
          kx = ky = kFrom(gx, b.w, b.w * kx, sx);
          uy = null;
        } else if (gy) {
          kx = ky = kFrom(gy, b.h, b.h * ky, sy);
          ux = null;
        }
      } else {
        if (gx) kx = kFrom(gx, b.w, b.w * kx, sx);
        if (gy) ky = kFrom(gy, b.h, b.h * ky, sy);
      }
      guides = resizeGuides(rectFor(kx, ky), ux, uy);
    }
    useUI.setState({ snapGuides: guides });
    const patches = new Map<string, Partial<SceneObject>>();
    for (const [id, o] of d.origin) {
      if (kx === ky) {
        patches.set(id, scaleAbout(o, A, kx));
        continue;
      }
      const rel = rotate({ x: o.x - A.x, y: o.y - A.y }, -b.rot);
      const np = rotate({ x: rel.x * kx, y: rel.y * ky }, b.rot);
      if (o.type === 'text') patches.set(id, { x: A.x + np.x, y: A.y + np.y, w: Math.max(10, o.w * kx) });
      else patches.set(id, { x: A.x + np.x, y: A.y + np.y, w: Math.max(0.5, o.w * kx), h: o.type === 'shape' && o.shape === 'line' ? 0 : Math.max(0.5, o.h * ky) });
    }
    mutate((doc) => withPage(doc, (p) => applyPatches(p, patches)));
  };

  const finishMoveLike = (ids: string[]) => {
    // auto-pin layout objects that were edited by hand, then re-sort perspective depth
    if (usePrefs.getState().autoPin) {
      const page = getPage();
      const toPin = page.objects.filter((o) => ids.includes(o.id) && o.layoutId && !o.pinned).map((o) => o.id);
      if (toPin.length) mutate((doc) => withPage(doc, (p) => applyPatches(p, new Map(toPin.map((id) => [id, { pinned: true }])))));
    }
    resortDepth(ids);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setCursor(undefined);
    if (!d) return;
    const pp = toPage(view(), local(e));
    switch (d.kind) {
      case 'move':
        if (d.moved) finishMoveLike([...d.origin.keys()]);
        endGesture();
        useUI.setState({ snapGuides: [] });
        if (!d.moved && d.narrowTo) useUI.getState().setSelection(d.narrowTo);
        break;
      case 'scale':
      case 'rotate':
        useUI.setState({ snapGuides: [] });
        finishMoveLike([...d.origin.keys()]);
        endGesture();
        break;
      case 'plane':
      case 'path':
        endGesture();
        break;
      case 'focal':
        rerunFocalLayouts(true);
        endGesture();
        break;
      case 'marquee':
        schedule();
        break;
      case 'create': {
        const r = normalizeRect(d.a, d.b);
        const tiny = r.w < 4 / view().zoom && r.h < 4 / view().zoom;
        if (d.tool === 'focal') {
          if (!tiny) setFocal({ enabled: true, x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h });
          else setFocal({ enabled: true, x: d.a.x, y: d.a.y });
          rerunFocalLayouts(true);
        } else if (d.tool === 'line') {
          const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
          const s = addShape('line', { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }, tiny ? undefined : { w: Math.max(4, len), h: 0 });
          if (!tiny) mutate((doc) => withPage(doc, (p) => applyPatches(p, { [s.id]: { rotation: (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI } })));
        } else addShape(d.tool, tiny ? d.a : { x: r.x + r.w / 2, y: r.y + r.h / 2 }, tiny ? undefined : { w: r.w, h: r.h });
        if (d.tool !== 'focal') useUI.setState({ tool: 'select' });
        break;
      }
      case 'guide': {
        const v = view();
        const sp = local(e);
        const outside = d.axis === 'x' ? sp.x < RULER : sp.y < RULER;
        if (d.id) {
          if (outside) removeGuide(d.id);
          else moveGuide(d.id, Math.round(d.pos), false);
        } else if (!outside) addGuide(d.axis, Math.round(d.axis === 'x' ? pp.x : pp.y));
        void v;
        schedule();
        break;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const pp = toPage(view(), local(e));
    const hit = hitTest(pp);
    if (!hit) return;
    if (hit.type === 'text') {
      useUI.getState().setSelection([hit.id]);
      useUI.setState({ editingTextId: hit.id });
    } else if (hit.groupId) useUI.getState().setSelection([hit.id]);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const pp = toPage(view(), local(e));
    const hit = hitTest(pp, { includeLocked: true });
    const ui = useUI.getState();
    const f = getPage().focal;
    const inFocal = f.enabled && (f.shape === 'ellipse' ? ((pp.x - f.x) / (f.w / 2)) ** 2 + ((pp.y - f.y) / (f.h / 2)) ** 2 <= 1 : Math.abs(pp.x - f.x) <= f.w / 2 && Math.abs(pp.y - f.y) <= f.h / 2);
    if (inFocal && (!hit || ui.tool === 'focal')) {
      openMenu(e.clientX, e.clientY, [
        { label: 'Edit focal region', onClick: () => useUI.setState({ tool: 'focal' }) },
        { label: 'Center focal region', onClick: () => setFocal({ x: getPage().width / 2, y: getPage().height / 2 }) },
        { separator: true },
        { label: 'Remove focal region', shortcut: 'Del', danger: true, onClick: removeFocal },
      ]);
      return;
    }
    if (hit && !ui.selection.includes(hit.id)) ui.setSelection(expandGroups([hit.id]));
    if (!hit && ui.selection.length) ui.setSelection([]);
    openObjectMenu(e.clientX, e.clientY, pp);
  };

  // drag & drop from the library
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    const ids = JSON.parse(raw) as string[];
    const pp = toPage(view(), local(e));
    const page = getPage();
    // dropping a background asset onto the canvas sets it as the page background
    const asset = getAsset(ids[0]);
    if (ids.length === 1 && asset?.kind === 'background') {
      setBackground((b) => ({ ...b, type: 'image', image: { ...b.image, assetId: asset.id } }));
      return;
    }
    addAssetsToCanvas(ids, { x: Math.max(0, Math.min(page.width, pp.x)), y: Math.max(0, Math.min(page.height, pp.y)) });
  };

  const editing = useUI((s) => s.editingTextId);
  return (
    <div
      ref={wrapRef}
      className={`editor tool-${tool} ${spaceDown ? 'panning' : ''}`}
      tabIndex={0}
      style={cursor ? { cursor } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (drag.current && drag.current.kind !== 'pan' && drag.current.kind !== 'marquee') cancelGesture();
        drag.current = null;
      }}
      onPointerLeave={() => useUI.getState().hoverId && useUI.setState({ hoverId: null })}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} className="main-canvas" />
      {editing && <TextEditor id={editing} onDone={() => useUI.setState({ editingTextId: null })} commitText={(t) => updateText(editing, { text: t, name: t.split('\n')[0].slice(0, 32) || 'Text' })} />}
    </div>
  );
}

const handleDirs: Record<HandleId, [number, number]> = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], rot: [0, -1] };

let checkerCache: { ctx: CanvasRenderingContext2D; pat: CanvasPattern } | null = null;
function checker(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (checkerCache?.ctx === ctx) return checkerCache.pat;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const dark = document.documentElement.getAttribute('data-theme') !== 'light' && !(document.documentElement.getAttribute('data-theme') === null && window.matchMedia('(prefers-color-scheme: light)').matches);
  g.fillStyle = dark ? '#3a3c40' : '#ffffff';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = dark ? '#2f3134' : '#e2e4e8';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  const pat = ctx.createPattern(c, 'repeat');
  if (!pat) return '#888';
  checkerCache = { ctx, pat };
  return pat;
}

export function getAlgorithmLabel(id: string) {
  return getAlgorithm(id).label;
}
