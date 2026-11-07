// Text layout + drawing. The same code measures text boxes in the editor and renders them
// on export, so the exported result always matches what the editor shows.
//
// A text object's box (w × h) includes its badge padding: lines wrap at w − 2·padX and the
// box height is the text block plus 2·padY (plus the sag of curved text).

import type { TextBadge, TextObject, TextStyle } from '../core/types';
import { rgba } from './patterns';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);

export function fontString(s: TextStyle, size = s.fontSize): string {
  const fam = GENERIC.has(s.fontFamily) ? s.fontFamily : `"${s.fontFamily.replace(/"/g, '')}", "Segoe UI", sans-serif`;
  return `${s.italic ? 'italic ' : ''}${s.fontWeight} ${Math.max(0.5, size)}px ${fam}`;
}

// ---------------------------------------------------------------------------
// Style defaults for effects added after the first release (older documents lack them)
// ---------------------------------------------------------------------------

export const defaultBadge = (): TextBadge => ({
  enabled: false,
  shape: 'pill',
  color: '#e11d48',
  color2: '#9f1239',
  gradient: false,
  padX: 36,
  padY: 16,
  radius: 18,
  stroke: { enabled: false, color: '#ffffff', width: 4 },
  points: 14,
});

export function withTextDefaults(s: TextStyle): Required<TextStyle> {
  return {
    ...s,
    fillMode: s.fillMode ?? 'solid',
    fill2: s.fill2 ?? '#f5c542',
    gradientAngle: s.gradientAngle ?? 180,
    stroke2: s.stroke2 ?? { enabled: false, color: '#000000', width: 6 },
    glow: s.glow ?? { enabled: false, color: '#ffd166', blur: 24, opacity: 0.8 },
    extrude: s.extrude ?? { enabled: false, color: '#5b1a0e', depth: 10, angle: 90 },
    curve: s.curve ?? 0,
    pixel: s.pixel ?? 0,
    badge: { ...defaultBadge(), ...s.badge, stroke: { ...defaultBadge().stroke, ...s.badge?.stroke } },
  };
}

/** Padding the badge adds around the text block (0 without a badge). */
export function textInset(s: TextStyle): { x: number; y: number } {
  return s.badge?.enabled ? { x: Math.max(0, s.badge.padX), y: Math.max(0, s.badge.padY) } : { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// Tokens: {count} etc. are filled in from the project when drawing
// ---------------------------------------------------------------------------

let textVars: Record<string, string> = {};
export function setTextVars(v: Record<string, string>) {
  textVars = v;
}
export const TEXT_TOKENS: { token: string; label: string }[] = [
  { token: '{count}', label: 'Number of assets in the project' },
  { token: '{categories}', label: 'Number of categories' },
  { token: '{project}', label: 'Project name' },
];
export function resolveText(text: string): string {
  // case-insensitive so upper-cased titles ("{COUNT} ICONS") still resolve
  return text.replace(/\{(count|categories|project)\}/gi, (m, k: string) => textVars[k.toLowerCase()] ?? m);
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
function mctx() {
  if (!measureCtx) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
    measureCtx = c.getContext('2d') as CanvasRenderingContext2D;
  }
  return measureCtx;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function setSpacing(ctx: Ctx2D, px: number) {
  const c = ctx as Ctx2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

const displayText = (text: string, s: TextStyle) => {
  const r = resolveText(text);
  return s.uppercase ? r.toUpperCase() : r;
};

/** Wrap text into lines that fit `maxW`. Explicit newlines are preserved. */
const lineCache = new WeakMap<TextStyle, Map<string, string[]>>();

export function layoutLines(text: string, s: TextStyle, maxW: number): string[] {
  const key = `${resolveText(text)}|${Math.round(maxW * 10)}`;
  let m = lineCache.get(s);
  const hit = m?.get(key);
  if (hit) return hit;
  const lines = layoutLinesUncached(text, s, maxW);
  if (!m) lineCache.set(s, (m = new Map()));
  if (m.size > 20) m.clear();
  m.set(key, lines);
  return lines;
}

function layoutLinesUncached(text: string, s: TextStyle, maxW: number): string[] {
  const ctx = mctx();
  ctx.font = fontString(s);
  setSpacing(ctx, s.letterSpacing);
  const out: string[] = [];
  for (const para of displayText(text, s).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const test = line + w;
      if (line && ctx.measureText(test.trimEnd()).width > maxW + 0.5 && w.trim()) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line = test;
    }
    out.push(line.trimEnd());
  }
  setSpacing(ctx, 0);
  return out;
}

function lineWidth(line: string, s: TextStyle): number {
  const ctx = mctx();
  ctx.font = fontString(s);
  setSpacing(ctx, s.letterSpacing);
  const w = ctx.measureText(line).width;
  setSpacing(ctx, 0);
  return w;
}

/** Vertical sag of a curved line of width L (how far its ends drop below/above the middle). */
function curveSag(L: number, curve: number): number {
  const c = Math.min(1, Math.abs(curve));
  if (c < 0.01) return 0;
  const R = L / (c * Math.PI);
  return R * (1 - Math.cos((c * Math.PI) / 2));
}

export function textHeight(t: Pick<TextObject, 'text' | 'style' | 'w'>): number {
  const ins = textInset(t.style);
  const lines = layoutLines(t.text, t.style, Math.max(1, t.w - ins.x * 2));
  const block = Math.max(1, lines.length) * t.style.fontSize * t.style.lineHeight;
  const sag = t.style.curve ? Math.max(0, ...lines.map((l) => curveSag(lineWidth(l, t.style), t.style.curve!))) : 0;
  return block + sag + ins.y * 2;
}

/** Natural single-line width of the longest paragraph plus badge padding (used when creating text). */
export function naturalWidth(text: string, s: TextStyle): number {
  const ctx = mctx();
  ctx.font = fontString(s);
  setSpacing(ctx, s.letterSpacing);
  const w = Math.max(...displayText(text, s).split('\n').map((l) => ctx.measureText(l).width), 10);
  setSpacing(ctx, 0);
  return w + textInset(s).x * 2;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function badgePath(ctx: Ctx2D, b: TextBadge, w: number, h: number) {
  const x = -w / 2,
    y = -h / 2;
  ctx.beginPath();
  switch (b.shape) {
    case 'rect': {
      const r = Math.max(0, Math.min(b.radius, w / 2, h / 2));
      if (r > 0 && 'roundRect' in ctx) (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      break;
    }
    case 'pill':
      (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, Math.min(w, h) / 2);
      break;
    case 'circle':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'burst': {
      const n = Math.max(5, Math.round(b.points || 14));
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const k = i % 2 ? 0.82 : 1;
        const px = Math.cos(a) * (w / 2) * k,
          py = Math.sin(a) * (h / 2) * k;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'ribbon': {
      // banner with V-notched tails
      const notch = h * 0.35;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - notch, 0);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + notch, 0);
      ctx.closePath();
      break;
    }
    case 'slant': {
      const k = h * 0.3;
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - k, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'tag': {
      const tip = h * 0.45;
      ctx.moveTo(x + tip, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + tip, y + h);
      ctx.lineTo(x, 0);
      ctx.closePath();
      break;
    }
  }
}

function clearShadow(ctx: Ctx2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Pixel-art text: every layer (shadow, depth, outlines, fill, badge) is drawn at one canvas pixel
// per "block" as a hard-edged mask, stacked, then scaled up without smoothing — so edges between
// colours stay crisp like hand-made pixel lettering. Cached, because the editor redraws every frame.
const pixelCache = new Map<string, { c: OffscreenCanvas | HTMLCanvasElement; w: number; h: number }>();
const CLEAR = '#00000000';

function makeCanvas(W: number, H: number) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
}

function pixelText(t: TextObject, block: number) {
  const key = JSON.stringify([resolveText(t.text), t.style, t.w, t.h, block]);
  const hit = pixelCache.get(key);
  if (hit) return hit;
  const s = withTextDefaults(t.style);
  // room for outlines, depth, glow and shadow around the box
  const pad = s.fontSize * 0.5 + (s.extrude.enabled ? s.extrude.depth : 0) + (s.glow.enabled ? s.glow.blur : 0) + (s.shadow.enabled ? Math.abs(s.shadow.dx) + Math.abs(s.shadow.dy) : 0);
  const k = 1 / block;
  const W = Math.max(1, Math.ceil((t.w + pad * 2) * k)),
    H = Math.max(1, Math.ceil((t.h + pad * 2) * k));
  const out = makeCanvas(W, H);
  const octx = out.getContext('2d') as Ctx2D;
  const layer = makeCanvas(W, H);
  const lctx = layer.getContext('2d', { willReadFrequently: true }) as Ctx2D;
  const none = { enabled: false, color: '#000000', blur: 0, dx: 0, dy: 0, opacity: 0 };
  // a style that draws only one part; outlines stay "enabled" but invisible so widths match
  const base: TextStyle = {
    ...s,
    fill: CLEAR,
    fillMode: 'solid',
    shadow: none,
    glow: { ...s.glow, enabled: false },
    extrude: { ...s.extrude, enabled: false },
    stroke: { ...s.stroke, color: CLEAR },
    stroke2: { ...s.stroke2, color: CLEAR },
    badge: { ...s.badge, enabled: false },
    pixel: 0,
  };
  const paint = (style: TextStyle, opts: { dx?: number; dy?: number; cut?: number; alpha?: number } = {}) => {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, W, H);
    lctx.setTransform(k, 0, 0, k, W / 2 + (opts.dx ?? 0) * k, H / 2 + (opts.dy ?? 0) * k);
    drawTextSmooth(lctx, { ...t, style }, k);
    const img = lctx.getImageData(0, 0, W, H);
    const d = img.data;
    const cut = opts.cut ?? 128,
      a = Math.round((opts.alpha ?? 1) * 255);
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] < cut ? 0 : a;
    lctx.putImageData(img, 0, 0);
    octx.drawImage(layer, 0, 0);
  };
  const solid = (c: string): TextStyle => ({ ...base, fill: c, stroke: { ...s.stroke, color: c }, stroke2: { ...s.stroke2, color: c } });
  // bottom → top
  if (s.badge.enabled) paint({ ...base, badge: s.badge });
  if (s.shadow.enabled && s.shadow.opacity > 0) {
    const sh = solid(s.shadow.color);
    paint({ ...sh, extrude: s.extrude.enabled ? { ...s.extrude, color: s.shadow.color } : sh.extrude }, { dx: s.shadow.dx, dy: s.shadow.dy, alpha: Math.min(1, s.shadow.opacity * 1.2) });
  }
  if (s.glow.enabled && s.glow.opacity > 0) paint({ ...base, glow: s.glow }, { cut: 40, alpha: Math.min(1, s.glow.opacity * 0.7) });
  if (s.extrude.enabled) paint({ ...base, extrude: s.extrude });
  if (s.stroke2.enabled) paint({ ...base, stroke2: s.stroke2 });
  if (s.stroke.enabled) paint({ ...base, stroke: s.stroke, stroke2: { ...s.stroke2, color: CLEAR } });
  paint({ ...base, fill: s.fill, fillMode: s.fillMode, fill2: s.fill2, gradientAngle: s.gradientAngle });
  const res = { c: out, w: W * block, h: H * block };
  if (pixelCache.size > 60) pixelCache.clear();
  pixelCache.set(key, res);
  return res;
}

// Pixel text enlarged with nearest-neighbour by an integer factor, cached per source canvas.
const upscaled = new WeakMap<object, Map<number, OffscreenCanvas | HTMLCanvasElement>>();

function sharpUpscale(c: OffscreenCanvas | HTMLCanvasElement, f: number) {
  let m = upscaled.get(c);
  if (!m) upscaled.set(c, (m = new Map()));
  const hit = m.get(f);
  if (hit) return hit;
  const out = makeCanvas(c.width * f, c.height * f);
  const x = out.getContext('2d') as Ctx2D;
  x.imageSmoothingEnabled = false;
  x.drawImage(c, 0, 0, c.width * f, c.height * f);
  if (m.size > 4) m.clear();
  m.set(f, out);
  return out;
}

/** Draw text centered at the origin (caller sets translate/rotate). `pxScale` = device px per page px. */
export function drawText(ctx: Ctx2D, t: TextObject, pxScale: number) {
  const block = t.style.pixel ?? 0;
  if (block > 0) {
    const p = pixelText(t, block);
    // Enlarge the blocks with hard edges to about their on-screen size first, then draw that with
    // smoothing: blocks stay crisp at any zoom (no blur when small, no skipped pixels when tiny).
    const f = Math.max(1, Math.min(12, Math.ceil(block * pxScale)));
    const src = f > 1 ? sharpUpscale(p.c, f) : p.c;
    const smooth = ctx.imageSmoothingEnabled,
      quality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = quality;
    return;
  }
  drawTextSmooth(ctx, t, pxScale);
}

function drawTextSmooth(ctx: Ctx2D, t: TextObject, pxScale: number) {
  const s = withTextDefaults(t.style);
  const ins = textInset(s);
  const innerW = Math.max(1, t.w - ins.x * 2);
  const lines = layoutLines(t.text, s, innerW);
  const lh = s.fontSize * s.lineHeight;
  const blockH = lines.length * lh;
  const boxH = t.h || blockH + ins.y * 2;

  const shadowOn = s.shadow.enabled && s.shadow.opacity > 0;
  const applyShadow = () => {
    ctx.shadowColor = rgba(s.shadow.color, s.shadow.opacity);
    ctx.shadowBlur = s.shadow.blur * pxScale;
    ctx.shadowOffsetX = s.shadow.dx * pxScale;
    ctx.shadowOffsetY = s.shadow.dy * pxScale;
  };

  // badge behind the text (it takes the drop shadow when present)
  if (s.badge.enabled) {
    const b = s.badge;
    badgePath(ctx, b, t.w, boxH);
    if (b.gradient) {
      const g = ctx.createLinearGradient(0, -boxH / 2, 0, boxH / 2);
      g.addColorStop(0, b.color);
      g.addColorStop(1, b.color2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = b.color;
    if (shadowOn) applyShadow();
    ctx.fill();
    clearShadow(ctx);
    if (b.stroke.enabled && b.stroke.width > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = b.stroke.width;
      ctx.strokeStyle = b.stroke.color;
      ctx.stroke();
    }
  }

  ctx.font = fontString(s);
  ctx.textBaseline = 'middle';
  const curved = Math.abs(s.curve) >= 0.01;
  const x = curved ? 0 : s.align === 'left' ? -innerW / 2 : s.align === 'right' ? innerW / 2 : 0;
  ctx.textAlign = curved ? 'center' : s.align;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const sags = curved ? lines.map((l) => curveSag(lineWidth(l, s), s.curve)) : lines.map(() => 0);
  const maxSag = Math.max(0, ...sags);
  // Text block (lines + arc sag) is vertically centered in the box. An upward arch lifts the middle
  // of each line by its sag, so it needs that room above the first line; a downward arch below.
  const top = -(blockH + maxSag) / 2 + (s.curve > 0 ? maxSag : 0);

  // render one line with `op` (fillText or strokeText), straight or along an arc
  const emit = (line: string, y: number, op: (txt: string, px: number, py: number) => void) => {
    if (!curved) {
      setSpacing(ctx, s.letterSpacing);
      op(line, x, y);
      return;
    }
    setSpacing(ctx, 0);
    const chars = [...line];
    const widths = chars.map((c) => ctx.measureText(c).width + s.letterSpacing);
    const L = widths.reduce((a, b) => a + b, 0) - s.letterSpacing;
    const c = Math.max(-1, Math.min(1, s.curve));
    const R = L / (Math.abs(c) * Math.PI);
    const dir = c > 0 ? 1 : -1; // > 0 arches upward
    // ends sit at the line's y; the middle bulges by the sag
    const sag = curveSag(L, c);
    const cy = dir > 0 ? y + R - sag : y - R + sag;
    let pos = -L / 2;
    chars.forEach((ch, i) => {
      const mid = pos + (widths[i] - s.letterSpacing) / 2;
      const a = mid / R;
      ctx.save();
      ctx.translate(Math.sin(a) * R, cy - dir * Math.cos(a) * R);
      ctx.rotate(dir * a);
      op(ch, 0, 0);
      ctx.restore();
      pos += widths[i];
    });
  };

  const lineY = (i: number) => top + lh * (i + 0.5);
  let shadowUsed = s.badge.enabled; // the badge already carries the shadow
  const withFirstShadow = () => {
    if (!shadowUsed && shadowOn) {
      applyShadow();
      shadowUsed = true;
      return true;
    }
    return false;
  };

  // 1. 3D extrusion: stacked copies offset along the light direction
  if (s.extrude.enabled && s.extrude.depth > 0) {
    const a = (s.extrude.angle * Math.PI) / 180;
    const dx = Math.cos(a),
      dy = Math.sin(a);
    const steps = Math.ceil(s.extrude.depth);
    const outline = (s.stroke.enabled ? s.stroke.width : 0) + (s.stroke2.enabled ? s.stroke2.width : 0);
    ctx.fillStyle = s.extrude.color;
    ctx.strokeStyle = s.extrude.color;
    ctx.lineWidth = outline * 2;
    for (let k = steps; k >= 1; k--) {
      const shadowHere = k === steps && withFirstShadow();
      ctx.save();
      ctx.translate(dx * k, dy * k);
      lines.forEach((line, i) => {
        if (outline > 0) emit(line, lineY(i), (txt, px, py) => ctx.strokeText(txt, px, py));
        emit(line, lineY(i), (txt, px, py) => ctx.fillText(txt, px, py));
      });
      ctx.restore();
      if (shadowHere) clearShadow(ctx);
    }
  }

  // 2. glow
  if (s.glow.enabled && s.glow.opacity > 0) {
    ctx.save();
    ctx.shadowColor = rgba(s.glow.color, Math.min(1, s.glow.opacity));
    ctx.shadowBlur = s.glow.blur * pxScale;
    ctx.fillStyle = s.glow.color;
    ctx.strokeStyle = s.glow.color;
    ctx.lineWidth = Math.max(2, s.fontSize * 0.04);
    for (let pass = 0; pass < 2; pass++) lines.forEach((line, i) => emit(line, lineY(i), (txt, px, py) => ctx.strokeText(txt, px, py)));
    ctx.restore();
  }

  // 3. outer outline, 4. outline
  const strokes: { color: string; width: number }[] = [];
  if (s.stroke2.enabled && s.stroke2.width > 0) strokes.push({ color: s.stroke2.color, width: (s.stroke.enabled ? s.stroke.width : 0) + s.stroke2.width });
  if (s.stroke.enabled && s.stroke.width > 0) strokes.push({ color: s.stroke.color, width: s.stroke.width });
  for (const st of strokes) {
    const sh = withFirstShadow();
    ctx.lineWidth = st.width * 2;
    ctx.strokeStyle = st.color;
    lines.forEach((line, i) => emit(line, lineY(i), (txt, px, py) => ctx.strokeText(txt, px, py)));
    if (sh) clearShadow(ctx);
  }

  // 5. fill (solid or gradient across the text block)
  if (s.fillMode === 'gradient') {
    const a = ((s.gradientAngle - 90) * Math.PI) / 180;
    const half = Math.abs(Math.cos(a)) * (innerW / 2) + Math.abs(Math.sin(a)) * ((blockH + maxSag) / 2);
    const g = ctx.createLinearGradient(-Math.cos(a) * half, -Math.sin(a) * half, Math.cos(a) * half, Math.sin(a) * half);
    g.addColorStop(0, s.fill);
    g.addColorStop(1, s.fill2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = s.fill;
  const sh = withFirstShadow();
  lines.forEach((line, i) => emit(line, lineY(i), (txt, px, py) => ctx.fillText(txt, px, py)));
  if (sh) clearShadow(ctx);
  setSpacing(ctx, 0);
}
