// Watermark layout: where each mark of a watermark layer goes on a page. Pure geometry, so it is the
// same in the Watermark workspace, Review, the export preview and the exported files, and testable.
//
// Sizes and offsets are fractions of the page's shorter side, so a watermark designed on a 630 × 500
// cover keeps its proportions on a 3840 × 2160 screenshot.

import { uid } from './ids';
import type { Page, WatermarkLayer, WatermarkSettings, WmAnchor } from './types';

export interface WmMark {
  /** Center in page px. */
  x: number;
  y: number;
  /** Size of the mark in page px (text: measured line; image: logo box). */
  w: number;
  h: number;
  /** Degrees. */
  rot: number;
}

export const WM_TOKENS: { token: string; label: string }[] = [
  { token: '{brand}', label: 'Your brand (Settings ▸ Watermark)' },
  { token: '{project}', label: 'Project name' },
  { token: '{page}', label: 'Page name' },
  { token: '{year}', label: 'Year' },
  { token: '{date}', label: 'Date' },
  { token: '{count}', label: 'Number of icons' },
];

export function wmText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(brand|project|page|year|date|count)\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m);
}

export function defaultLayer(kind: 'text' | 'image' = 'text', patch: Partial<WatermarkLayer> = {}): WatermarkLayer {
  return {
    id: uid('wm'),
    name: kind === 'text' ? 'Text' : 'Logo',
    kind,
    visible: true,
    text: '© {year} {brand}',
    font: 'Geist Variable',
    weight: 600,
    color: '#ffffff',
    spacing: 0,
    outline: { enabled: false, color: '#000000', width: 0.06 },
    shadow: { enabled: true, opacity: 0.35 },
    tint: null,
    size: kind === 'text' ? 0.035 : 0.09,
    opacity: 0.75,
    rotation: 0,
    mode: 'single',
    anchor: 'br',
    dx: 0,
    dy: 0,
    margin: 0.035,
    tile: { gapX: 1.4, gapY: 3, angle: -30, stagger: true },
    iconSize: 0.28,
    ...patch,
  };
}

export const emptyWatermark = (): WatermarkSettings => ({ enabled: false, layers: [], scope: 'all', pageIds: [] });

/** The watermark of a project, filled in for documents saved before watermarks existed or partially. */
export function cleanWatermark(w: Partial<WatermarkSettings> | undefined): WatermarkSettings {
  const base = emptyWatermark();
  if (!w || typeof w !== 'object') return base;
  const layers = Array.isArray(w.layers) ? w.layers.filter((l) => l && typeof l === 'object' && (l.kind === 'text' || l.kind === 'image')).map((l) => ({ ...defaultLayer(l.kind), ...l, outline: { ...defaultLayer().outline, ...l.outline }, shadow: { ...defaultLayer().shadow, ...l.shadow }, tile: { ...defaultLayer().tile, ...l.tile } })) : [];
  return { enabled: !!w.enabled, layers, scope: w.scope === 'only' ? 'only' : 'all', pageIds: Array.isArray(w.pageIds) ? w.pageIds.filter((x) => typeof x === 'string') : [] };
}

/** Whether a page carries the watermark. */
export function wmAppliesTo(w: WatermarkSettings | undefined, pageId: string): boolean {
  if (!w?.enabled || !w.layers.some((l) => l.visible)) return false;
  return w.scope === 'only' ? w.pageIds.includes(pageId) : !w.pageIds.includes(pageId);
}

const ANCHOR: Record<WmAnchor, [number, number]> = { tl: [0, 0], tc: [0.5, 0], tr: [1, 0], ml: [0, 0.5], mc: [0.5, 0.5], mr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] };
export const ANCHORS = Object.keys(ANCHOR) as WmAnchor[];

/**
 * Marks of one layer on a page. `measure(layer, fontPx)` gives the width of the text line at that size;
 * `aspect` is the logo's width / height. `icons` are the visible boxes of the page's icons (per-icon mode).
 */
export function layoutLayer(layer: WatermarkLayer, page: { width: number; height: number }, measure: (fontPx: number) => number, aspect: number, icons: { x: number; y: number; w: number; h: number }[] = []): WmMark[] {
  const W = page.width,
    H = page.height,
    S = Math.min(W, H);
  const itemH = Math.max(1, layer.size * S);
  const itemW = layer.kind === 'text' ? Math.max(1, measure(itemH)) : itemH * (aspect > 0 ? aspect : 1);
  if (layer.mode === 'icon') {
    return icons.map((b) => {
      const h = Math.max(1, Math.min(b.w, b.h) * layer.iconSize);
      const w = layer.kind === 'text' ? Math.max(1, measure(h)) : h * (aspect > 0 ? aspect : 1);
      const [ax, ay] = ANCHOR[layer.anchor];
      const pad = Math.min(b.w, b.h) * 0.04;
      return { x: b.x + pad + w / 2 + (b.w - 2 * pad - w) * ax, y: b.y + pad + h / 2 + (b.h - 2 * pad - h) * ay, w, h, rot: layer.rotation };
    });
  }
  if (layer.mode === 'tile') {
    const stepX = itemW * (1 + Math.max(0.1, layer.tile.gapX)),
      stepY = itemH * (1 + Math.max(0.1, layer.tile.gapY));
    const a = (layer.tile.angle * Math.PI) / 180;
    const cos = Math.cos(a),
      sin = Math.sin(a);
    // cover the page's diagonal in the rotated pattern's own coordinates
    const R = Math.hypot(W, H) / 2 + Math.max(stepX, stepY);
    const cols = Math.ceil(R / stepX),
      rows = Math.ceil(R / stepY);
    // keep repeated patterns light: never more than ~900 marks
    const thin = Math.max(1, Math.ceil(((2 * cols + 1) * (2 * rows + 1)) / 900));
    const out: WmMark[] = [];
    const ox = layer.dx * S,
      oy = layer.dy * S;
    for (let r = -rows; r <= rows; r += thin)
      for (let c = -cols; c <= cols; c++) {
        const u = c * stepX + (layer.tile.stagger && r % 2 ? stepX / 2 : 0) + ox;
        const v = r * stepY + oy;
        const x = W / 2 + u * cos - v * sin,
          y = H / 2 + u * sin + v * cos;
        // marks entirely off the page are skipped
        const ext = Math.max(itemW, itemH);
        if (x < -ext || y < -ext || x > W + ext || y > H + ext) continue;
        out.push({ x, y, w: itemW, h: itemH, rot: layer.tile.angle + layer.rotation });
      }
    return out;
  }
  const [ax, ay] = ANCHOR[layer.anchor];
  const m = layer.margin * S;
  const x = m + itemW / 2 + (W - 2 * m - itemW) * ax + layer.dx * S;
  const y = m + itemH / 2 + (H - 2 * m - itemH) * ay + layer.dy * S;
  return [{ x, y, w: itemW, h: itemH, rot: layer.rotation }];
}

/** Bounding box of a single mark (for hit-testing, smart placement and Review checks). */
export function markBox(m: WmMark): { x: number; y: number; w: number; h: number } {
  const r = (m.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)),
    s = Math.abs(Math.sin(r));
  const w = m.w * c + m.h * s,
    h = m.w * s + m.h * c;
  return { x: m.x - w / 2, y: m.y - h / 2, w, h };
}

// ---------------------------------------------------------------------------
// Smart placement: a corner or edge that does not cover the title, the focal region or icons
// ---------------------------------------------------------------------------

/**
 * Best of the nine anchor positions for a single mark: least overlap with text (heaviest), the focal
 * region, then icons; ties go to the bottom-right, the usual place for a signature. Deterministic.
 */
export function suggestAnchor(layer: WatermarkLayer, page: Page, measure: (fontPx: number) => number, aspect: number, boxes: { text: { x: number; y: number; w: number; h: number }[]; icons: { x: number; y: number; w: number; h: number }[] }): WmAnchor {
  const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const focal = page.focal?.enabled ? [{ x: page.focal.x - page.focal.w / 2, y: page.focal.y - page.focal.h / 2, w: page.focal.w, h: page.focal.h }] : [];
  const pref: WmAnchor[] = ['br', 'bl', 'bc', 'tr', 'tl', 'tc', 'mr', 'ml', 'mc'];
  let best: WmAnchor = 'br',
    bestCost = Infinity;
  pref.forEach((anchor, i) => {
    const mk = layoutLayer({ ...layer, mode: 'single', anchor, dx: 0, dy: 0 }, page, measure, aspect)[0];
    const b = markBox(mk);
    const area = Math.max(1, b.w * b.h);
    let cost = 0;
    for (const t of boxes.text) cost += (inter(b, t) / area) * 10;
    for (const f of focal) cost += (inter(b, f) / area) * 4;
    for (const ic of boxes.icons) cost += inter(b, ic) / area;
    cost += i * 0.001; // preference order breaks ties
    if (cost < bestCost) {
      bestCost = cost;
      best = anchor;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

export interface WatermarkPreset {
  id: string;
  name: string;
  desc: string;
  /** Layers without ids (fresh ids are given when applied). */
  layers: Partial<WatermarkLayer>[];
}

export const WATERMARK_PRESETS: WatermarkPreset[] = [
  { id: 'corner-signature', name: 'Corner signature', desc: 'Small © line in the bottom-right corner', layers: [{ kind: 'text', name: 'Signature', text: '© {year} {brand}', size: 0.03, opacity: 0.8, anchor: 'br' }] },
  { id: 'small-logo', name: 'Small corner logo', desc: 'Your logo, small, bottom-right', layers: [{ kind: 'image', name: 'Logo', size: 0.08, opacity: 0.85, anchor: 'br', shadow: { enabled: false, opacity: 0.3 } }] },
  { id: 'centered-logo', name: 'Centered logo', desc: 'Large faint logo in the middle', layers: [{ kind: 'image', name: 'Logo', size: 0.32, opacity: 0.22, anchor: 'mc', shadow: { enabled: false, opacity: 0.3 } }] },
  { id: 'diagonal-repeat', name: 'Diagonal repeat', desc: 'Your brand repeated across the page at an angle', layers: [{ kind: 'text', name: 'Repeat', text: '{brand}', size: 0.03, opacity: 0.16, mode: 'tile', tile: { gapX: 1.6, gapY: 3.2, angle: -30, stagger: true }, shadow: { enabled: false, opacity: 0.3 } }] },
  { id: 'demo-footer', name: 'Demo footer', desc: 'A “Preview — {brand}” line along the bottom', layers: [{ kind: 'text', name: 'Footer', text: 'Preview · {brand}', size: 0.032, opacity: 0.85, anchor: 'bc', spacing: 0.04 }] },
  { id: 'subtle-brand', name: 'Subtle brand', desc: 'Faint name in the top-left, easy to ignore', layers: [{ kind: 'text', name: 'Brand', text: '{brand}', size: 0.026, opacity: 0.45, anchor: 'tl', shadow: { enabled: false, opacity: 0.3 } }] },
  { id: 'copyright', name: 'Copyright notice', desc: '© year, brand and project, bottom-left', layers: [{ kind: 'text', name: 'Copyright', text: '© {year} {brand} · {project}', size: 0.026, opacity: 0.75, anchor: 'bl' }] },
  {
    id: 'protection-grid',
    name: 'Full protection grid',
    desc: 'Dense repeated text plus a corner logo — for previews of paid packs',
    layers: [
      { kind: 'text', name: 'Grid', text: 'PREVIEW', weight: 700, spacing: 0.15, size: 0.045, opacity: 0.18, mode: 'tile', tile: { gapX: 0.8, gapY: 2, angle: -30, stagger: true }, shadow: { enabled: false, opacity: 0.3 }, outline: { enabled: true, color: '#000000', width: 0.05 } },
      { kind: 'text', name: 'Signature', text: '© {brand}', size: 0.03, opacity: 0.85, anchor: 'br' },
    ],
  },
  { id: 'store-preview', name: 'Store preview', desc: '“Preview” mark on every icon, bottom-right', layers: [{ kind: 'text', name: 'Per icon', text: '{brand}', size: 0.03, opacity: 0.6, mode: 'icon', iconSize: 0.16, anchor: 'br', shadow: { enabled: true, opacity: 0.5 } }] },
  { id: 'transparent-overlay', name: 'Transparent overlay', desc: 'Very faint large logo repeated in a loose grid', layers: [{ kind: 'image', name: 'Logo pattern', size: 0.14, opacity: 0.08, mode: 'tile', tile: { gapX: 1.2, gapY: 1.2, angle: 0, stagger: true }, shadow: { enabled: false, opacity: 0.3 } }] },
];

/** Layers of a preset, ready to add (fresh ids; logos use `logoId` when given). */
export function presetLayers(p: { layers: Partial<WatermarkLayer>[] }, logoId?: string): WatermarkLayer[] {
  return p.layers.map((l) => defaultLayer(l.kind ?? 'text', { ...structuredClone(l), id: uid('wm'), ...(l.kind === 'image' ? { assetId: logoId ?? l.assetId } : {}) }));
}
