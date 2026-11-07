// Text readability against what is really behind it.
//
// A theme chooses its text colours for its own background. Templates add their own local
// backgrounds — title panels, bands, ribbons, translucent cards — so a theme's dark type can land on
// a dark panel (Minimal light on Tilted Wall or Ribbon covers), or light type on a light one.
// This module works out the colour behind a text (the page background at the text's position, with
// every panel below the text composited over it at its opacity) and, when the theme's colour reads
// clearly worse there than on the theme's own background, picks the theme's most readable
// alternative. Texts that read as the theme intended (even a deliberately moody red on black) are
// left alone, and so are texts whose outline already separates them from the backdrop.

import { DEG } from './geometry';
import type { Background, Page, ShapeObject, TextObject } from './types';

type RGB = [number, number, number];

const parse = (hex: string | undefined): RGB | null => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const contrast = (a: RGB, b: RGB) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function stopsAt(stops: { offset: number; color: string }[], t: number): RGB | null {
  const s = stops.map((x) => ({ o: x.offset, c: parse(x.color) })).filter((x): x is { o: number; c: RGB } => !!x.c).sort((a, b) => a.o - b.o);
  if (!s.length) return null;
  if (t <= s[0].o) return s[0].c;
  for (let i = 1; i < s.length; i++) if (t <= s[i].o) return mix(s[i - 1].c, s[i].c, (t - s[i - 1].o) / Math.max(1e-6, s[i].o - s[i - 1].o));
  return s[s.length - 1].c;
}

/** Colour of a page background at (x, y); null when it cannot be known (images, transparency). */
export function backgroundAt(b: Background, W: number, H: number, x: number, y: number): RGB | null {
  let c: RGB | null = null;
  switch (b.type) {
    case 'solid':
      c = parse(b.color);
      break;
    case 'linear': {
      const a = b.gradient.angle * DEG;
      const dx = Math.sin(a),
        dy = -Math.cos(a);
      const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2 || 1;
      c = stopsAt(b.gradient.stops, ((x - W / 2) * dx + (y - H / 2) * dy) / (2 * half) + 0.5);
      break;
    }
    case 'radial': {
      const r = Math.max(1, (b.gradient.radius * Math.hypot(W, H)) / 2);
      c = stopsAt(b.gradient.stops, Math.hypot(x - b.gradient.cx * W, y - b.gradient.cy * H) / r);
      break;
    }
    case 'mesh': {
      const cols = b.gradient.stops.map((s) => parse(s.color)).filter((v): v is RGB => !!v);
      c = cols.length ? ([0, 1, 2].map((i) => cols.reduce((s, v) => s + v[i], 0) / cols.length) as RGB) : null;
      break;
    }
    default:
      return null;
  }
  if (c && b.overlay?.enabled && b.overlay.opacity > 0 && (!b.overlay.blend || b.overlay.blend === 'source-over')) {
    const o = parse(b.overlay.color);
    if (o) c = mix(c, o, Math.min(1, b.overlay.opacity));
  }
  return c;
}

/** Whether page point (x, y) is inside shape `s` (its rotation counted; unusual shapes by their box). */
function covers(s: ShapeObject, x: number, y: number): boolean {
  const a = -s.rotation * DEG;
  const dx = x - s.x,
    dy = y - s.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a),
    ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (s.shape === 'ellipse' || s.shape === 'ring') return (lx / (s.w / 2)) ** 2 + (ly / (s.h / 2)) ** 2 <= 1;
  return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
}

/** Fill colour of a shape at local height `ly` (its two-colour fill runs top to bottom). */
function shapeFillAt(s: ShapeObject, y: number): RGB | null {
  const a = parse(s.fill);
  if (!a || !s.fill2) return a;
  const b = parse(s.fill2);
  if (!b) return a;
  return mix(a, b, Math.max(0, Math.min(1, (y - (s.y - s.h / 2)) / Math.max(1, s.h))));
}

/** Points inside a text's box where its backdrop is measured. */
function samplePoints(t: TextObject): [number, number][] {
  const a = t.rotation * DEG;
  return [
    [0, 0],
    [-0.3, -0.25],
    [0.3, -0.25],
    [-0.3, 0.25],
    [0.3, 0.25],
  ].map(([u, v]) => {
    const lx = u * t.w,
      ly = v * t.h;
    return [t.x + lx * Math.cos(a) - ly * Math.sin(a), t.y + lx * Math.sin(a) + ly * Math.cos(a)];
  });
}

/**
 * The colours behind text `index` on `page`, at a few points of its box. `background` replaces the
 * page's own (to ask how the text would read on another background). Null entries are unknown.
 */
export function backdropOf(page: Page, index: number, background: Background = page.background, withPanels = true): (RGB | null)[] {
  const t = page.objects[index] as TextObject;
  const below = withPanels
    ? page.objects.slice(0, index).filter((o): o is ShapeObject => o.type === 'shape' && !o.hidden && o.opacity > 0.02 && o.fillEnabled && o.shape !== 'line' && !o.effect?.enabled)
    : [];
  return samplePoints(t).map(([x, y]) => {
    let c = backgroundAt(background, page.width, page.height, x, y);
    for (const s of below) {
      if (!covers(s, x, y)) continue;
      const f = shapeFillAt(s, y);
      if (!f) continue;
      // a blurred shape is a soft shadow or glow: it tints less than a solid panel
      const alpha = Math.min(1, s.opacity) * (s.blur && s.blur > 0 ? 0.6 : 1);
      c = c ? mix(c, f, alpha) : alpha >= 0.95 ? f : null;
    }
    return c;
  });
}

const fills = (t: TextObject): RGB[] => [parse(t.style.fill), t.style.fillMode === 'gradient' ? parse(t.style.fill2) : null].filter((v): v is RGB => !!v);

/** Worst contrast of the text's fill against the known points of a backdrop (null when none is known). */
function worst(t: TextObject, backdrop: (RGB | null)[]): number | null {
  const known = backdrop.filter((v): v is RGB => !!v);
  const f = fills(t);
  if (!known.length || !f.length) return null;
  return Math.min(...known.flatMap((b) => f.map((c) => contrast(c, b))));
}

/** An outline thick enough to read as the letter edge, standing out from every known backdrop point. */
function outlineCarries(t: TextObject, backdrop: (RGB | null)[]): boolean {
  const st = t.style.stroke;
  if (!st?.enabled || st.width < t.style.fontSize * 0.035) return false;
  const c = parse(st.color);
  if (!c) return false;
  return backdrop.every((b) => !b || contrast(c, b) >= 3);
}

export interface ReadablePalette {
  /** Colours the fix may use, in order of preference (the theme's own colours first). */
  candidates: string[];
  /** The background the theme's colours were chosen for. */
  designedFor: Background;
}

/** Below this a text is hard to read; covers use large display text, so the large-text level applies. */
export const MIN_CONTRAST = 3;
/** A replacement colour should be clearly readable, not just past the line. */
const GOOD = 4.5;

/**
 * Texts that read clearly worse where they are than on the background their colours were chosen
 * for, and fall below MIN_CONTRAST there, get the first candidate colour that reads well (or the best
 * one). Badges carry their own background and are skipped; so are texts over unknown backdrops.
 * Returns the same page when nothing needs to change.
 */
export function ensureReadableText(page: Page, palette: ReadablePalette, only?: Set<string>): Page {
  let changed = false;
  const objects = page.objects.map((o0, i) => {
    if (o0.type !== 'text' || o0.hidden || o0.style.badge?.enabled || (only && !only.has(o0.id))) return o0;
    // letters whose fill matches their own thick outline merge into blobs: the outline changes
    const o = separateOutline(o0, palette.candidates);
    if (o !== o0) changed = true;
    const here = backdropOf(page, i);
    const actual = worst(o, here);
    if (actual === null || actual >= MIN_CONTRAST || outlineCarries(o, here)) return o;
    const designed = worst(o, backdropOf(page, i, palette.designedFor, false));
    // the theme's own pairing (e.g. a dark red title on black) is a choice, not a clash
    if (designed !== null && designed <= actual * 1.15) return o;
    const known = here.filter((v): v is RGB => !!v);
    let best: { c: string; r: number } | null = null;
    for (const c of palette.candidates) {
      const rgb = parse(c);
      if (!rgb) continue;
      const r = Math.min(...known.map((b) => contrast(rgb, b)));
      if (r >= GOOD) {
        best = { c, r };
        break;
      }
      if (!best || r > best.r) best = { c, r };
    }
    if (!best || best.r <= actual) return o;
    changed = true;
    const out: TextObject = { ...o, style: { ...o.style, fill: best.c, fillMode: 'solid' } };
    return out;
  });
  return changed ? { ...page, objects } : page;
}

/** A visible outline whose colour the fill cannot be told apart from gets the most distinct candidate. */
export function separateOutline(t: TextObject, candidates: string[]): TextObject {
  const st = t.style.stroke;
  if (!st?.enabled || st.width < t.style.fontSize * 0.02) return t;
  const sc = parse(st.color);
  const f = fills(t);
  if (!sc || !f.length || Math.min(...f.map((c) => contrast(c, sc))) >= 1.8) return t;
  let best: { c: string; r: number } | null = null;
  for (const c of candidates) {
    const rgb = parse(c);
    if (!rgb) continue;
    const r = Math.min(...f.map((x) => contrast(x, rgb)));
    if (!best || r > best.r) best = { c, r };
  }
  if (!best || best.r < 3) return t;
  return { ...t, style: { ...t.style, stroke: { ...st, color: best.c } } };
}
