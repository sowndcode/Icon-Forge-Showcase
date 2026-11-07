// Editor-only overlays (screen space). Never used by the exporter.

import type { Collider } from '../../core/collide';
import { DEG, rotate } from '../../core/geometry';
import { PlaneMap, vanishingPoint } from '../../core/homography';
import { samplePath } from '../../core/spline';
import { localVisibleRect, localToPage, type AssetLookup } from '../../core/transform';
import type { Page, Quad, Rect, SceneObject, Vec } from '../../core/types';
import type { Overlays } from '../../state/prefs';
import type { SnapGuide, Tool } from '../../state/ui';
import { boxCorners, handlePositions, toScreen, type SelBox, type View } from './geometry';

export const RULER = 18;

export interface OverlayColors {
  sel: string;
  layout: string;
  pin: string;
  guide: string;
  focal: string;
  safe: string;
  ruler: string;
  rulerText: string;
  rulerLine: string;
}

export function readColors(): OverlayColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    sel: v('--sel', '#3b9bf0'),
    layout: v('--layout', '#a78bfa'),
    pin: v('--pin', '#f59e0b'),
    guide: v('--guide', '#d633ff'),
    focal: v('--focal', '#22d3ee'),
    safe: '#f59e0b',
    ruler: v('--bg-1', '#262626'),
    rulerText: v('--text-3', '#9e9e9e'),
    rulerLine: v('--line-2', '#565b5e'),
  };
}

export interface LayoutGuideInfo {
  area: Rect;
  plane?: Quad;
  planeKind?: 'floor' | 'wall';
  strength: number;
  path?: Vec[];
  zone: Collider | null;
  rows?: number;
}

export interface OverlayState {
  page: Page;
  view: View & { vw: number; vh: number };
  selection: SceneObject[];
  selBox: SelBox | null;
  hover: SceneObject | null;
  getAsset: AssetLookup;
  overlays: Overlays;
  layoutGuide: LayoutGuideInfo | null;
  showPlaneHandles: boolean;
  snapGuides: SnapGuide[];
  marquee: Rect | null;
  createRect: { tool: Tool; a: Vec; b: Vec } | null;
  focalHandles: boolean;
  colors: OverlayColors;
  hideHandles: boolean;
}

function line(ctx: CanvasRenderingContext2D, a: Vec, b: Vec) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function poly(ctx: CanvasRenderingContext2D, pts: Vec[], close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}

function square(ctx: CanvasRenderingContext2D, p: Vec, r: number, fill: string, stroke: string) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
}

function dot(ctx: CanvasRenderingContext2D, p: Vec, r: number, fill: string, stroke = '#fff') {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function objectOutline(o: SceneObject, getAsset: AssetLookup, v: View): Vec[] {
  const r = localVisibleRect(o, o.type === 'image' ? getAsset(o.assetId) : undefined);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ].map((p) => toScreen(v, localToPage(o, p)));
}

export function drawOverlays(ctx: CanvasRenderingContext2D, s: OverlayState) {
  const { page, view: v, colors: c, overlays: ov } = s;
  const W = page.width,
    H = page.height;
  const P = (x: number, y: number) => toScreen(v, { x, y });
  const tl = P(0, 0),
    br = P(W, H);

  // page border
  ctx.strokeStyle = 'rgba(128,128,128,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(tl.x) - 0.5, Math.round(tl.y) - 0.5, Math.round(br.x - tl.x) + 1, Math.round(br.y - tl.y) + 1);

  // pixel grid when zoomed in a lot
  if (ov.pixelGrid && v.zoom >= 8) {
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.max(0, Math.floor(-v.panX / v.zoom)),
      x1 = Math.min(W, Math.ceil((v.vw - v.panX) / v.zoom));
    const y0 = Math.max(0, Math.floor(-v.panY / v.zoom)),
      y1 = Math.min(H, Math.ceil((v.vh - v.panY) / v.zoom));
    for (let x = x0; x <= x1; x++) {
      const sx = Math.round(x * v.zoom + v.panX) + 0.5;
      ctx.moveTo(sx, Math.max(tl.y, 0));
      ctx.lineTo(sx, Math.min(br.y, v.vh));
    }
    for (let y = y0; y <= y1; y++) {
      const sy = Math.round(y * v.zoom + v.panY) + 0.5;
      ctx.moveTo(Math.max(tl.x, 0), sy);
      ctx.lineTo(Math.min(br.x, v.vw), sy);
    }
    ctx.stroke();
  }

  ctx.save();
  ctx.setLineDash([]);
  if (ov.compGrid && ov.compDivs > 1) {
    ctx.strokeStyle = 'rgba(56,189,248,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < ov.compDivs; i++) {
      line(ctx, P((W * i) / ov.compDivs, 0), P((W * i) / ov.compDivs, H));
      line(ctx, P(0, (H * i) / ov.compDivs), P(W, (H * i) / ov.compDivs));
    }
  }
  if (ov.thirds) {
    ctx.strokeStyle = 'rgba(250,204,21,0.55)';
    ctx.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3]) {
      line(ctx, P(W * f, 0), P(W * f, H));
      line(ctx, P(0, H * f), P(W, H * f));
    }
  }
  if (ov.center) {
    ctx.strokeStyle = 'rgba(244,114,182,0.6)';
    ctx.setLineDash([6, 4]);
    line(ctx, P(W / 2, 0), P(W / 2, H));
    line(ctx, P(0, H / 2), P(W, H / 2));
    ctx.setLineDash([]);
  }
  // safe zone
  if (ov.safe && page.safeZone.enabled) {
    const sz = page.safeZone;
    const a = P((W * sz.left) / 100, (H * sz.top) / 100),
      b = P(W - (W * sz.right) / 100, H - (H * sz.bottom) / 100);
    ctx.fillStyle = 'rgba(245,158,11,0.07)';
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.rect(a.x, b.y, b.x - a.x, a.y - b.y);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(245,158,11,0.75)';
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
  }
  // guides
  if (page.guides.length) {
    ctx.strokeStyle = c.guide;
    ctx.lineWidth = 1;
    for (const g of page.guides) {
      if (g.axis === 'x') {
        const x = Math.round(g.pos * v.zoom + v.panX) + 0.5;
        line(ctx, { x, y: 0 }, { x, y: v.vh });
      } else {
        const y = Math.round(g.pos * v.zoom + v.panY) + 0.5;
        line(ctx, { x: 0, y }, { x: v.vw, y });
      }
    }
  }
  // focal region
  if (ov.focal && page.focal.enabled) {
    const f = page.focal;
    const a = P(f.x - f.w / 2, f.y - f.h / 2),
      b = P(f.x + f.w / 2, f.y + f.h / 2);
    ctx.strokeStyle = c.focal;
    ctx.fillStyle = 'rgba(34,211,238,0.07)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    if (f.shape === 'ellipse') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    else ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 10px Segoe UI, sans-serif';
    ctx.fillStyle = c.focal;
    ctx.fillText(s.focalHandles ? 'FOCAL REGION  ·  DEL TO REMOVE' : 'FOCAL REGION', a.x + 4, a.y - 5);
    if (s.focalHandles) for (const p of focalHandlePoints(page, v)) square(ctx, p, 4.5, '#0b1220', c.focal);
  }
  // layout guides
  if (s.layoutGuide && ov.perspective) drawLayoutGuide(ctx, s.layoutGuide, v, c, s.showPlaneHandles);
  ctx.restore();

  // hover outline
  if (s.hover && !s.selection.includes(s.hover)) {
    ctx.strokeStyle = c.sel;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    poly(ctx, objectOutline(s.hover, s.getAsset, v));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // selection
  if (s.selection.length) {
    ctx.lineWidth = 1;
    if (s.selection.length > 1 && s.selection.length <= 400) {
      ctx.strokeStyle = c.sel;
      ctx.globalAlpha = 0.55;
      for (const o of s.selection) {
        poly(ctx, objectOutline(o, s.getAsset, v));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // status markers: pinned (amber) / layout-controlled (violet)
    if (s.selection.length <= 400)
      for (const o of s.selection) {
        if (!o.layoutId) continue;
        const pts = objectOutline(o, s.getAsset, v);
        dot(ctx, pts[0], o.pinned ? 4 : 3, o.pinned ? c.pin : c.layout, '#111');
      }
    if (s.selBox && !s.hideHandles) {
      ctx.strokeStyle = c.sel;
      ctx.lineWidth = 1.25;
      poly(ctx, boxCorners(s.selBox).map((p) => toScreen(v, p)));
      ctx.stroke();
      const hs = handlePositions(s.selBox, v, s.selection.length === 1);
      const top = toScreen(v, { x: s.selBox.cx + rotate({ x: 0, y: -s.selBox.h / 2 }, s.selBox.rot).x, y: s.selBox.cy + rotate({ x: 0, y: -s.selBox.h / 2 }, s.selBox.rot).y });
      const rh = hs.find((h) => h.id === 'rot')!;
      line(ctx, top, rh);
      for (const h of hs) {
        if (h.id === 'rot') dot(ctx, h, 4.5, '#fff', c.sel);
        else square(ctx, h, h.id.length === 1 ? 3.5 : 4.5, '#fff', c.sel);
      }
    }
  }

  // smart guides: alignment lines, page-center lines and spacing measurements
  if (s.snapGuides.length) {
    ctx.lineWidth = 1.25;
    for (const g of s.snapGuides) {
      ctx.strokeStyle = c.guide;
      if (g.kind === 'target' && g.rect) {
        // the object this guide is linked to: soft fill + dashed outline
        const a = P(g.rect.x, g.rect.y),
          b = P(g.rect.x + g.rect.w, g.rect.y + g.rect.h);
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = c.guide;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
        ctx.restore();
        continue;
      }
      if (g.kind === 'box' && g.rect) {
        // the snapped selection gets a guide-coloured frame
        const a = P(g.rect.x, g.rect.y),
          b = P(g.rect.x + g.rect.w, g.rect.y + g.rect.h);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
        ctx.lineWidth = 1.25;
        continue;
      }
      if (g.kind === 'gap') {
        // spacing: a measured segment with end ticks and a distance pill
        const a = g.axis === 'x' ? P(g.from, g.pos) : P(g.pos, g.from);
        const b = g.axis === 'x' ? P(g.to, g.pos) : P(g.pos, g.to);
        line(ctx, a, b);
        const t = 4;
        if (g.axis === 'x') {
          line(ctx, { x: a.x, y: a.y - t }, { x: a.x, y: a.y + t });
          line(ctx, { x: b.x, y: b.y - t }, { x: b.x, y: b.y + t });
        } else {
          line(ctx, { x: a.x - t, y: a.y }, { x: a.x + t, y: a.y });
          line(ctx, { x: b.x - t, y: b.y }, { x: b.x + t, y: b.y });
        }
        if (g.label) pill(ctx, g.label, (a.x + b.x) / 2, (a.y + b.y) / 2, c.guide);
        continue;
      }
      // hierarchy: page center = bold with a label, page edges = medium, object lines = light
      ctx.save();
      if (g.kind === 'center') ctx.lineWidth = 2.5;
      else if (g.kind === 'edge') ctx.lineWidth = 1.75;
      else {
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.75;
      }
      const a = g.axis === 'x' ? P(g.pos, g.from) : P(g.from, g.pos);
      const b = g.axis === 'x' ? P(g.pos, g.to) : P(g.to, g.pos);
      line(ctx, a, b);
      ctx.restore();
      if (g.kind === 'center') {
        const at = g.axis === 'x' ? { x: a.x, y: a.y + 14 } : { x: a.x + 30, y: a.y };
        pill(ctx, g.axis === 'x' ? 'Center' : 'Middle', at.x, at.y, c.guide);
      }
    }
  }
  // marquee
  if (s.marquee) {
    const a = P(s.marquee.x, s.marquee.y),
      b = P(s.marquee.x + s.marquee.w, s.marquee.y + s.marquee.h);
    ctx.fillStyle = 'rgba(59,155,240,0.12)';
    ctx.strokeStyle = c.sel;
    ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
  }
  if (s.createRect) {
    const a = P(s.createRect.a.x, s.createRect.a.y),
      b = P(s.createRect.b.x, s.createRect.b.y);
    ctx.strokeStyle = s.createRect.tool === 'focal' ? c.focal : c.sel;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (s.createRect.tool === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else if (s.createRect.tool === 'ellipse') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    else ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (ov.rulers) drawRulers(ctx, v, c, page);
}

export function focalHandlePoints(page: Page, v: View): Vec[] {
  const f = page.focal;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => toScreen(v, { x: f.x + (sx * f.w) / 2, y: f.y + (sy * f.h) / 2 }));
}

function drawLayoutGuide(ctx: CanvasRenderingContext2D, g: LayoutGuideInfo, v: View, c: OverlayColors, handles: boolean) {
  const P = (p: Vec) => toScreen(v, p);
  ctx.strokeStyle = c.layout;
  ctx.lineWidth = 1;
  if (g.zone) {
    ctx.fillStyle = 'rgba(167,139,250,0.08)';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    if (g.zone.kind === 'ellipse') {
      const a = P({ x: g.zone.cx, y: g.zone.cy });
      ctx.ellipse(a.x, a.y, g.zone.rx * v.zoom, g.zone.ry * v.zoom, 0, 0, Math.PI * 2);
    } else {
      const a = P({ x: g.zone.cx - g.zone.hw, y: g.zone.cy - g.zone.hh });
      ctx.rect(a.x, a.y, g.zone.hw * 2 * v.zoom, g.zone.hh * 2 * v.zoom);
    }
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 10px Segoe UI, sans-serif';
    ctx.fillStyle = c.layout;
    const zb = g.zone.kind === 'ellipse' ? { x: g.zone.cx - g.zone.rx * 0.7, y: g.zone.cy - g.zone.ry * 0.75 } : { x: g.zone.cx - g.zone.hw, y: g.zone.cy - g.zone.hh };
    const zp = P(zb);
    ctx.fillText('SAFE ZONE', zp.x + 4, zp.y + 12);
  }
  if (g.plane) {
    const q = g.plane;
    const pm = new PlaneMap(q, g.strength);
    const wallFarLeft = g.planeKind === 'wall' && Math.hypot(q[0].x - q[3].x, q[0].y - q[3].y) < Math.hypot(q[1].x - q[2].x, q[1].y - q[2].y);
    ctx.fillStyle = 'rgba(167,139,250,0.06)';
    poly(ctx, q.map(P));
    ctx.fill();
    ctx.globalAlpha = 0.45;
    // depth lines + across lines
    const N = 8;
    for (let i = 1; i < N; i++) {
      const t = i / N;
      if (g.planeKind === 'wall') {
        line(ctx, P(pm.map(t, 0)), P(pm.map(t, 1)));
        line(ctx, P(pm.map(0, t)), P(pm.map(1, t)));
      } else {
        line(ctx, P(pm.map(0, t)), P(pm.map(1, t)));
        line(ctx, P(pm.map(t, 0)), P(pm.map(t, 1)));
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    poly(ctx, q.map(P));
    ctx.stroke();
    // vanishing point
    const vpQuad: Quad = g.planeKind === 'wall' ? [q[3], q[0], q[1], q[2]] : q;
    const vp = vanishingPoint(vpQuad);
    if (vp && Math.abs(vp.x) < 1e5 && Math.abs(vp.y) < 1e5) {
      const sv = P(vp);
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 4]);
      if (g.planeKind === 'wall') {
        const far = wallFarLeft ? [q[0], q[3]] : [q[1], q[2]];
        for (const p of far) line(ctx, P(p), sv);
      } else for (const p of [q[0], q[1]]) line(ctx, P(p), sv);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      dot(ctx, sv, 4, c.layout, '#111');
      ctx.font = '600 10px Segoe UI, sans-serif';
      ctx.fillStyle = c.layout;
      ctx.fillText('VP', sv.x + 7, sv.y - 6);
    }
    if (handles) for (const p of q) square(ctx, P(p), 5.5, '#1a1530', c.layout);
  }
  if (g.path && g.path.length >= 2) {
    const sp = samplePath(g.path);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    poly(ctx, sp.points.map(P), false);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (handles) g.path.forEach((p, i) => dot(ctx, P(p), i === 0 ? 6 : 5, i === 0 ? c.layout : '#1a1530', c.layout));
  }
}

function drawRulers(ctx: CanvasRenderingContext2D, v: View & { vw: number; vh: number }, c: OverlayColors, page: Page) {
  ctx.fillStyle = c.ruler;
  ctx.fillRect(0, 0, v.vw, RULER);
  ctx.fillRect(0, 0, RULER, v.vh);
  ctx.strokeStyle = c.rulerLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER + 0.5);
  ctx.lineTo(v.vw, RULER + 0.5);
  ctx.moveTo(RULER + 0.5, 0);
  ctx.lineTo(RULER + 0.5, v.vh);
  ctx.stroke();
  // tick spacing: ≥ 60px between labels
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = steps.find((s) => s * v.zoom >= 60) ?? 10000;
  ctx.fillStyle = c.rulerText;
  ctx.font = "10px 'Geist Mono Variable', Consolas, monospace";
  ctx.textBaseline = 'top';
  ctx.beginPath();
  const x0 = Math.floor(-v.panX / v.zoom / step) * step;
  for (let x = x0; x * v.zoom + v.panX < v.vw; x += step / 5) {
    const sx = Math.round(x * v.zoom + v.panX) + 0.5;
    if (sx < RULER) continue;
    const major = Math.abs(x / step - Math.round(x / step)) < 1e-6;
    ctx.moveTo(sx, major ? 4 : 12);
    ctx.lineTo(sx, RULER);
    if (major) ctx.fillText(String(Math.round(x)), sx + 3, 2);
  }
  const y0 = Math.floor(-v.panY / v.zoom / step) * step;
  ctx.save();
  for (let y = y0; y * v.zoom + v.panY < v.vh; y += step / 5) {
    const sy = Math.round(y * v.zoom + v.panY) + 0.5;
    if (sy < RULER) continue;
    const major = Math.abs(y / step - Math.round(y / step)) < 1e-6;
    ctx.moveTo(major ? 4 : 12, sy);
    ctx.lineTo(RULER, sy);
  }
  ctx.stroke();
  for (let y = y0; y * v.zoom + v.panY < v.vh; y += step) {
    const sy = Math.round(y * v.zoom + v.panY);
    if (sy < RULER) continue;
    ctx.save();
    ctx.translate(2, sy + 3);
    ctx.rotate(90 * DEG);
    ctx.fillText(String(Math.round(y)), 0, -9);
    ctx.restore();
  }
  ctx.restore();
  // page extent markers
  ctx.fillStyle = 'rgba(59,155,240,0.35)';
  ctx.fillRect(v.panX, RULER - 3, page.width * v.zoom, 3);
  ctx.fillRect(RULER - 3, v.panY, 3, page.height * v.zoom);
  ctx.fillStyle = c.ruler;
  ctx.fillRect(0, 0, RULER, RULER);
}

/** Small rounded label (spacing distances on smart guides). */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = '600 10.5px "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 8, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}
