// Composition renderer. Draws a Page in PAGE coordinates — the caller sets the transform:
//   editor:  ctx.setTransform(zoom·dpr, 0, 0, zoom·dpr, panX·dpr, panY·dpr)  (preview bitmaps)
//   export:  ctx.setTransform(scale, 0, 0, scale, 0, 0)                     (full-resolution bitmaps)
// Editor overlays are drawn separately (overlays.ts) and never by this module.

import { DEG } from '../core/geometry';
import { visibleAABB, type AssetLookup } from '../core/transform';
import { layoutLayer, wmAppliesTo, wmText } from '../core/watermark';
import type { Background, ImageObject, Page, Quad, SceneObject, ShapeEffect, ShapeObject, WatermarkLayer, WatermarkSettings } from '../core/types';
import { invertMat, squareToQuad } from '../core/homography';
import { drawLight, drawMesh, drawPattern, rgba } from './patterns';
import { drawText } from './text';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderOptions {
  /** Device pixels per page pixel (shadow/blur sizes are device-space in canvas). */
  pxScale: number;
  /** Best available decoded image for an asset at the given on-screen size (device px). */
  getImage: (assetId: string, devicePx: number) => CanvasImageSource | null;
  getAsset: AssetLookup;
  /** Draw a placeholder for images that are missing/not yet decoded (editor). */
  placeholders?: boolean;
  /** Object ids not to draw (e.g. text being edited in place). */
  skip?: Set<string>;
  /** Editor only: time allowed for exact Ground Plane warps this frame (see warpedImage). */
  warpBudget?: WarpBudget;
  /** Editor only: page area on screen; images entirely outside it are not drawn. */
  visible?: { x0: number; y0: number; x1: number; y1: number };
}

export function drawBackground(ctx: Ctx2D, page: Page, bg: Background, o: RenderOptions) {
  const W = page.width,
    H = page.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  switch (bg.type) {
    case 'transparent':
      break;
    case 'solid':
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, W, H);
      break;
    case 'linear': {
      const a = bg.gradient.angle * DEG;
      // CSS-like angle: 0 = to top, 90 = to right, 180 = to bottom
      const dx = Math.sin(a),
        dy = -Math.cos(a);
      const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
      const g = ctx.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half);
      for (const s of bg.gradient.stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'radial': {
      const cx = bg.gradient.cx * W,
        cy = bg.gradient.cy * H;
      const r = Math.max(1, (bg.gradient.radius * Math.hypot(W, H)) / 2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      for (const s of bg.gradient.stops) g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'mesh':
      drawMesh(ctx, W, H, bg);
      break;
    case 'image':
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, W, H);
      drawBackgroundImage(ctx, page, bg, o);
      break;
  }
  // older documents may not have these layers yet
  if (bg.pattern?.enabled) drawPattern(ctx, W, H, bg.pattern);
  if (bg.light?.enabled && bg.light.strength > 0) drawLight(ctx, W, H, bg.light);
  if (bg.overlay.enabled && bg.overlay.opacity > 0) {
    ctx.globalCompositeOperation = bg.overlay.blend || 'source-over';
    ctx.fillStyle = rgba(bg.overlay.color, bg.overlay.opacity);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (bg.vignette.enabled && bg.vignette.strength > 0) {
    const r = Math.hypot(W, H) / 2;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * (0.75 - bg.vignette.strength * 0.45), W / 2, H / 2, r);
    g.addColorStop(0, rgba(bg.vignette.color, 0));
    g.addColorStop(1, rgba(bg.vignette.color, Math.min(1, bg.vignette.strength * 1.2)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawBackgroundImage(ctx: Ctx2D, page: Page, bg: Background, o: RenderOptions) {
  const im = bg.image;
  if (!im.assetId) return;
  const asset = o.getAsset(im.assetId);
  if (!asset) return;
  const W = page.width,
    H = page.height;
  const iw = asset.width || 1,
    ih = asset.height || 1;
  const src = o.getImage(im.assetId, Math.max(W, H) * o.pxScale * im.scale);
  if (!src) return;
  let dw = iw,
    dh = ih;
  switch (im.fit) {
    case 'fit': {
      const k = Math.min(W / iw, H / ih);
      dw = iw * k;
      dh = ih * k;
      break;
    }
    case 'fill': {
      const k = Math.max(W / iw, H / ih);
      dw = iw * k;
      dh = ih * k;
      break;
    }
    case 'stretch':
      dw = W;
      dh = H;
      break;
    case 'center':
    case 'tile':
      break;
  }
  dw *= im.scale;
  dh *= im.scale;
  const filters: string[] = [];
  if (im.blur > 0) filters.push(`blur(${im.blur * o.pxScale}px)`);
  if (im.brightness) filters.push(`brightness(${Math.max(0, 1 + im.brightness / 100)})`);
  if (im.contrast) filters.push(`contrast(${Math.max(0, 1 + im.contrast / 100)})`);
  if (im.saturation) filters.push(`saturate(${Math.max(0, 1 + im.saturation / 100)})`);
  ctx.save();
  if (filters.length) ctx.filter = filters.join(' ');
  ctx.globalAlpha = im.opacity;
  ctx.translate(W / 2 + im.offsetX * W, H / 2 + im.offsetY * H);
  ctx.rotate(im.rotation * DEG);
  if (im.fit === 'tile') {
    const pat = ctx.createPattern(src, 'repeat');
    if (pat) {
      const m = new DOMMatrix().translateSelf(-iw * im.scale / 2, -ih * im.scale / 2).scaleSelf(im.scale, im.scale);
      pat.setTransform(m);
      ctx.fillStyle = pat;
      const R = Math.hypot(W, H);
      ctx.fillRect(-R, -R, R * 2, R * 2);
    }
  } else {
    // extend slightly under blur so the edges don't fade to transparent
    const bleed = im.blur > 0 && im.fit !== 'fit' && im.fit !== 'center' ? im.blur * 2.5 : 0;
    ctx.drawImage(src, -dw / 2 - bleed, -dh / 2 - bleed, dw + bleed * 2, dh + bleed * 2);
  }
  ctx.restore();
}

function polyPath(ctx: Ctx2D, pts: [number, number][]) {
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function starPts(n: number, w: number, h: number, inner: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? inner : 1;
    out.push([(Math.cos(a) * w * k) / 2, (Math.sin(a) * h * k) / 2]);
  }
  return out;
}

/** Shapes with holes (ring) fill and clip with the even-odd rule. */
export const shapeFillRule = (s: ShapeObject): CanvasFillRule => (s.shape === 'ring' ? 'evenodd' : 'nonzero');

/** Path of a shape centered at the origin (adds to the current path). */
export function shapePath(ctx: Ctx2D, s: ShapeObject) {
  const w = s.w,
    h = s.h;
  const ngon = (n: number, rot = -Math.PI / 2) => polyPath(ctx, Array.from({ length: n }, (_, i) => [(Math.cos(rot + (i * 2 * Math.PI) / n) * w) / 2, (Math.sin(rot + (i * 2 * Math.PI) / n) * h) / 2] as [number, number]));
  if (s.shape === 'diamond') polyPath(ctx, [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]]);
  else if (s.shape === 'pentagon') ngon(5);
  else if (s.shape === 'hexagon') ngon(6, 0);
  else if (s.shape === 'octagon') ngon(8, Math.PI / 8);
  else if (s.shape === 'ring') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.moveTo(w * 0.3, 0);
    ctx.ellipse(0, 0, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
  } else if (s.shape === 'plus') {
    const t = 0.18;
    polyPath(ctx, [[-w * t, -h / 2], [w * t, -h / 2], [w * t, -h * t], [w / 2, -h * t], [w / 2, h * t], [w * t, h * t], [w * t, h / 2], [-w * t, h / 2], [-w * t, h * t], [-w / 2, h * t], [-w / 2, -h * t], [-w * t, -h * t]]);
  } else if (s.shape === 'bubble') {
    const r = Math.min(w, h) * 0.18,
      bh = h * 0.78;
    const x = -w / 2,
      y = -h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + bh, r);
    ctx.arcTo(x + w, y + bh, x, y + bh, r);
    ctx.lineTo(x + w * 0.38, y + bh);
    ctx.lineTo(x + w * 0.2, y + h);
    ctx.lineTo(x + w * 0.24, y + bh);
    ctx.arcTo(x, y + bh, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  } else if (s.shape === 'shield') {
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, -h * 0.05);
    ctx.quadraticCurveTo(w * 0.45, h * 0.32, 0, h / 2);
    ctx.quadraticCurveTo(-w * 0.45, h * 0.32, -w / 2, -h * 0.05);
    ctx.closePath();
  } else if (s.shape === 'ribbon') polyPath(ctx, [[-w / 2, -h / 2], [w / 2, -h / 2], [w * 0.42, 0], [w / 2, h / 2], [-w / 2, h / 2], [-w * 0.42, 0]]);
  else if (s.shape === 'semicircle') {
    ctx.ellipse(0, h / 2, w / 2, h, 0, Math.PI, 0);
    ctx.closePath();
  } else if (s.shape === 'parallelogram') polyPath(ctx, [[-w / 2 + w * 0.22, -h / 2], [w / 2, -h / 2], [w / 2 - w * 0.22, h / 2], [-w / 2, h / 2]]);
  else if (s.shape === 'bolt') polyPath(ctx, [[w * 0.12, -h / 2], [-w * 0.38, h * 0.06], [-w * 0.02, h * 0.06], [-w * 0.14, h / 2], [w * 0.38, -h * 0.08], [w * 0.02, -h * 0.08]]);
  else if (s.shape === 'moon') {
    // crescent: outer bulge to the left, inner curve back
    ctx.moveTo(w * 0.2, -h / 2);
    ctx.bezierCurveTo(-w * 0.66, -h * 0.46, -w * 0.66, h * 0.46, w * 0.2, h / 2);
    ctx.bezierCurveTo(-w * 0.24, h * 0.3, -w * 0.24, -h * 0.3, w * 0.2, -h / 2);
    ctx.closePath();
  } else if (s.shape === 'chevron') polyPath(ctx, [[-w / 2, -h / 2], [w * 0.1, -h / 2], [w / 2, 0], [w * 0.1, h / 2], [-w / 2, h / 2], [-w * 0.1, 0]]);
  else if (s.shape === 'star') polyPath(ctx, starPts(5, w, h, 0.45));
  else if (s.shape === 'burst') polyPath(ctx, starPts(16, w, h, 0.8));
  else if (s.shape === 'triangle') polyPath(ctx, [[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
  else if (s.shape === 'arrow')
    polyPath(ctx, [[-w / 2, -h * 0.18], [w * 0.12, -h * 0.18], [w * 0.12, -h / 2], [w / 2, 0], [w * 0.12, h / 2], [w * 0.12, h * 0.18], [-w / 2, h * 0.18]]);
  else if (s.shape === 'heart') {
    ctx.moveTo(0, h * 0.35);
    ctx.bezierCurveTo(-w * 0.55, -h * 0.05, -w * 0.4, -h * 0.55, 0, -h * 0.22);
    ctx.bezierCurveTo(w * 0.4, -h * 0.55, w * 0.55, -h * 0.05, 0, h * 0.35);
    ctx.closePath();
  } else if (s.shape === 'rect') {
    const r = Math.max(0, Math.min(s.radius, s.w / 2, s.h / 2));
    if (r > 0 && 'roundRect' in ctx) (ctx as CanvasRenderingContext2D).roundRect(-s.w / 2, -s.h / 2, s.w, s.h, r);
    else ctx.rect(-s.w / 2, -s.h / 2, s.w, s.h);
  } else if (s.shape === 'ellipse') {
    ctx.ellipse(0, 0, Math.max(0.1, s.w / 2), Math.max(0.1, s.h / 2), 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(-s.w / 2, 0);
    ctx.lineTo(s.w / 2, 0);
  }
}

function drawShape(ctx: Ctx2D, s: ShapeObject, pxScale = 1) {
  const h = s.h;
  if (s.blur && s.blur > 0) ctx.filter = `blur(${s.blur * pxScale}px)`;
  ctx.beginPath();
  shapePath(ctx, s);
  if (s.fillEnabled && s.shape !== 'line') {
    if (s.fill2) {
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, s.fill);
      g.addColorStop(1, s.fill2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = s.fill;
    ctx.fill(shapeFillRule(s));
  }
  if (s.strokeWidth > 0) {
    ctx.lineWidth = s.strokeWidth;
    ctx.strokeStyle = s.stroke;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function drawPlaceholder(ctx: Ctx2D, o: SceneObject, label: string) {
  ctx.fillStyle = 'rgba(239,68,68,0.12)';
  ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
  ctx.strokeStyle = 'rgba(239,68,68,0.7)';
  ctx.lineWidth = Math.max(1, o.w / 100);
  ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
  ctx.beginPath();
  ctx.moveTo(-o.w / 2, -o.h / 2);
  ctx.lineTo(o.w / 2, o.h / 2);
  ctx.moveTo(o.w / 2, -o.h / 2);
  ctx.lineTo(-o.w / 2, o.h / 2);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.max(8, o.w / 10)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  }
}

// How enlarged small images are scaled (Settings ▸ Canvas ▸ Pixel-art icons).
let imageScaling: 'auto' | 'sharp' | 'smooth' = 'auto';
export function setImageScaling(mode: 'auto' | 'sharp' | 'smooth') {
  imageScaling = mode;
}

/** Nearest-neighbour scaling for pixel art: on when an image is drawn clearly larger than its pixels. */
function sharpScaling(src: CanvasImageSource, asset: { width: number; height: number } | undefined, devicePx: number): boolean {
  if (imageScaling === 'smooth') return false;
  const s = src as { width: number; height: number };
  const srcMax = Math.max(s.width, s.height) || 1;
  if (devicePx / srcMax < 1.5) return false;
  // "auto": only small sources (pixel-art sizes); "sharp": any image that is being enlarged
  return imageScaling === 'sharp' || Math.max(asset?.width ?? srcMax, asset?.height ?? srcMax) <= 128;
}

// Look applied by an effect shape above the object being drawn (see drawWithEffects).
interface Override {
  filter: string;
  alpha: number;
  silhouette?: string;
}
let override: Override | null = null;

function overrideFor(e: ShapeEffect, pxScale: number): Override {
  const a = Math.max(0, Math.min(1, e.amount));
  switch (e.look) {
    case 'silhouette':
      return { filter: '', alpha: a, silhouette: e.color };
    case 'fade':
      return { filter: '', alpha: 1 - a };
    case 'grayscale':
      return { filter: `grayscale(${a})`, alpha: 1 };
    case 'darken':
      return { filter: `brightness(${1 - a * 0.9})`, alpha: 1 };
    default:
      return { filter: `blur(${a * 18 * pxScale}px)`, alpha: 1 };
  }
}

export function drawObject(ctx: Ctx2D, ob: SceneObject, o: RenderOptions) {
  if (ob.hidden || ob.opacity <= 0) return;
  ctx.save();
  ctx.translate(ob.x, ob.y);
  if (ob.rotation) ctx.rotate(ob.rotation * DEG);
  if (ob.flipX || ob.flipY) ctx.scale(ob.flipX ? -1 : 1, ob.flipY ? -1 : 1);
  ctx.globalAlpha = Math.max(0, Math.min(1, ob.opacity * (override?.alpha ?? 1)));
  if (override && ob.type !== 'image') ctx.filter = [override.silhouette ? 'brightness(0)' : '', override.filter].filter(Boolean).join(' ') || 'none';
  if (ob.type === 'image') drawImageObject(ctx, ob, o);
  else if (ob.type === 'shape') drawShape(ctx, ob, o.pxScale);
  else drawText(ctx, ob, o.pxScale);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Effect shapes: restyle what lies below them, only where covered or whole objects
// ---------------------------------------------------------------------------

const effectCache = new WeakMap<SceneObject[], { i: number; s: ShapeObject; box: { x0: number; y0: number; x1: number; y1: number } }[]>();

function boxOf(o: SceneObject) {
  const c = Math.abs(Math.cos(o.rotation * DEG)),
    s = Math.abs(Math.sin(o.rotation * DEG));
  const hw = (o.w * c + o.h * s) / 2,
    hh = (o.w * s + o.h * c) / 2;
  return { x0: o.x - hw, y0: o.y - hh, x1: o.x + hw, y1: o.y + hh };
}

function effectShapes(objects: SceneObject[]) {
  let list = effectCache.get(objects);
  if (!list) {
    list = [];
    objects.forEach((o, i) => {
      if (o.type === 'shape' && o.effect?.enabled && !o.hidden && o.shape !== 'line') list!.push({ i, s: o, box: boxOf(o) });
    });
    effectCache.set(objects, list);
  }
  return list;
}

/** Path of a shape in page space (its own transform applied), added to the current path. */
function shapePathOnPage(ctx: Ctx2D, s: ShapeObject) {
  const m = ctx.getTransform();
  ctx.translate(s.x, s.y);
  if (s.rotation) ctx.rotate(s.rotation * DEG);
  if (s.flipX || s.flipY) ctx.scale(s.flipX ? -1 : 1, s.flipY ? -1 : 1);
  shapePath(ctx, s);
  ctx.setTransform(m);
}

/** Draw object `index` of `page`, restyled by the topmost effect shape above it that touches it. */
export function drawWithEffects(ctx: Ctx2D, page: Page, index: number, o: RenderOptions) {
  const ob = page.objects[index];
  const fx = page.objects.length > 1 ? effectShapes(page.objects) : [];
  if (!fx.length) return drawObject(ctx, ob, o);
  const b = boxOf(ob);
  let hit: (typeof fx)[number] | null = null;
  for (let k = fx.length - 1; k >= 0; k--) {
    const f = fx[k];
    if (f.i <= index) break;
    const e = f.s.effect!;
    if (e.targets === 'icons' && ob.type !== 'image') continue;
    if (b.x1 > f.box.x0 && b.x0 < f.box.x1 && b.y1 > f.box.y0 && b.y0 < f.box.y1) {
      hit = f;
      break;
    }
  }
  if (!hit) return drawObject(ctx, ob, o);
  const e = hit.s.effect!;
  const look = overrideFor(e, o.pxScale);
  if (e.scope === 'whole') {
    override = look;
    try {
      drawObject(ctx, ob, o);
    } finally {
      override = null;
    }
    return;
  }
  const rule = shapeFillRule(hit.s) === 'evenodd';
  // outside the shape: unchanged
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  shapePathOnPage(ctx, hit.s);
  ctx.clip('evenodd');
  drawObject(ctx, ob, o);
  ctx.restore();
  // inside: restyled
  ctx.save();
  ctx.beginPath();
  shapePathOnPage(ctx, hit.s);
  ctx.clip(rule ? 'evenodd' : 'nonzero');
  override = look;
  try {
    drawObject(ctx, ob, o);
  } finally {
    override = null;
    ctx.restore();
  }
}

function drawImageObject(ctx: Ctx2D, ob: ImageObject, o: RenderOptions) {
  const asset = o.getAsset(ob.assetId);
  const devicePx = Math.max(ob.w, ob.h) * o.pxScale;
  const src0 = asset && asset.status !== 'error' && asset.status !== 'missing' ? o.getImage(ob.assetId, devicePx) : null;
  if (!src0) {
    if (o.placeholders) drawPlaceholder(ctx, ob, asset?.status === 'pending' ? '' : 'missing');
    return;
  }
  const fx = ob.filter;
  const w = ob.w,
    h = ob.h;
  // lying on a Ground Plane: the bitmap is projected into its quad first; effects then apply as usual
  let src: CanvasImageSource = src0;
  if (ob.warp) {
    const warped = warpedImage(src0, ob.warp, w * o.pxScale, h * o.pxScale, sharpScaling(src0, asset, devicePx), o.warpBudget);
    if (!warped) return;
    src = warped;
  }
  // outline: the one-colour shape stamped in a ring around the image
  if (ob.outline?.enabled && ob.outline.width > 0) {
    const sil = tinted(src, ob.outline.color);
    const r = ob.outline.width;
    const steps = Math.min(32, Math.max(12, Math.round(r * o.pxScale * 1.5)));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(sil, -w / 2 + Math.cos(a) * r, -h / 2 + Math.sin(a) * r, w, h);
    }
  }
  if (ob.glow?.enabled && ob.glow.opacity > 0 && ob.glow.blur > 0) {
    ctx.save();
    ctx.shadowColor = rgba(ob.glow.color, Math.min(1, ob.glow.opacity));
    ctx.shadowBlur = ob.glow.blur * o.pxScale;
    const sil = tinted(src, ob.glow.color);
    ctx.drawImage(sil, -w / 2, -h / 2, w, h);
    // a second pass makes strong glows read on busy backgrounds
    if (ob.glow.opacity > 0.6) ctx.drawImage(sil, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  let img: CanvasImageSource = src;
  const f: string[] = [];
  if (override?.silhouette) img = tinted(src, override.silhouette);
  else if (fx?.silhouette) img = tinted(src, fx.silhouetteColor ?? '#000000');
  else {
    if (fx?.grayscale) f.push(`grayscale(${Math.max(0, Math.min(1, fx.grayscale))})`);
    if (fx?.brightness) f.push(`brightness(${Math.max(0, 1 + fx.brightness)})`);
  }
  if (override?.filter) f.push(override.filter);
  if (f.length) ctx.filter = f.join(' ');
  if (ob.shadow?.enabled && ob.shadow.opacity > 0) {
    ctx.shadowColor = rgba(ob.shadow.color, ob.shadow.opacity);
    ctx.shadowBlur = ob.shadow.blur * o.pxScale;
    // offsets are device-space and ignore rotation/flip; that matches a light from above
    ctx.shadowOffsetX = ob.shadow.dx * o.pxScale;
    ctx.shadowOffsetY = ob.shadow.dy * o.pxScale;
  }
  ctx.imageSmoothingEnabled = ob.warp ? true : !sharpScaling(src, asset, devicePx);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

// One-colour copies of images (outline, glow, silhouette), cached per source bitmap.
const tintCache = new WeakMap<object, Map<string, CanvasImageSource>>();

function tinted(src: CanvasImageSource, color: string): CanvasImageSource {
  const key = src as object;
  let m = tintCache.get(key);
  if (!m) tintCache.set(key, (m = new Map()));
  const hit = m.get(color);
  if (hit) return hit;
  const s = src as { width: number; height: number };
  const W = Math.max(1, Math.round(s.width)),
    H = Math.max(1, Math.round(s.height));
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = c.getContext('2d') as Ctx2D;
  x.drawImage(src, 0, 0, W, H);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, W, H);
  if (m.size > 6) m.clear();
  m.set(color, c);
  return c;
}

/** True when an image (with its shadow, glow and outline) lies entirely outside `v`. */
function offscreen(ob: SceneObject, v: NonNullable<RenderOptions['visible']>): boolean {
  if (ob.type !== 'image') return false;
  let m = 2;
  if (ob.shadow?.enabled) m = Math.max(m, ob.shadow.blur * 2 + Math.abs(ob.shadow.dx) + Math.abs(ob.shadow.dy));
  if (ob.glow?.enabled) m = Math.max(m, ob.glow.blur * 2);
  if (ob.outline?.enabled) m = Math.max(m, ob.outline.width + 2);
  // half the diagonal covers any rotation
  const r = Math.hypot(ob.w, ob.h) / 2 + m;
  return ob.x + r < v.x0 || ob.x - r > v.x1 || ob.y + r < v.y0 || ob.y - r > v.y1;
}

export function renderPage(ctx: Ctx2D, page: Page, o: RenderOptions) {
  drawBackground(ctx, page, page.background, o);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  const v = o.visible;
  page.objects.forEach((ob, i) => {
    if (o.skip?.has(ob.id) || (v && offscreen(ob, v))) return;
    drawWithEffects(ctx, page, i, o);
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Watermarks: drawn over the finished page (Review, export preview, exported files), never into it.
// ---------------------------------------------------------------------------

export interface WatermarkRender {
  watermark: WatermarkSettings;
  /** Token values: brand, project, page, year, date, count. */
  vars: Record<string, string>;
}

function wmFont(l: WatermarkLayer, px: number) {
  const fam = /^(serif|sans-serif|monospace)$/.test(l.font) ? l.font : `"${l.font.replace(/"/g, '')}", "Segoe UI", sans-serif`;
  return `${l.weight} ${Math.max(0.5, px)}px ${fam}`;
}

function setLetterSpacing(ctx: Ctx2D, px: number) {
  const c = ctx as Ctx2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

/** Width of a watermark text line at `fontPx` (for layout). */
export function measureWmText(ctx: Ctx2D, l: WatermarkLayer, text: string, fontPx: number): number {
  ctx.save();
  ctx.font = wmFont(l, fontPx);
  setLetterSpacing(ctx, l.spacing * fontPx);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** The marks of every visible layer of a watermark on a page (shared by drawing, hit-testing and checks). */
export function watermarkMarks(ctx: Ctx2D, page: Page, wr: WatermarkRender, getAsset: AssetLookup, getImage: RenderOptions['getImage']) {
  const icons = page.objects.filter((o) => o.type === 'image' && !o.hidden).map((o) => visibleAABB(o, o.type === 'image' ? getAsset(o.assetId) : undefined));
  const vars = { ...wr.vars, page: page.name };
  return wr.watermark.layers
    .filter((l) => l.visible)
    .map((l) => {
      const text = wmText(l.text, vars);
      const asset = l.kind === 'image' && l.assetId ? getAsset(l.assetId) : undefined;
      const img = asset && asset.status !== 'missing' && asset.status !== 'error' ? getImage(asset.id, 512) : null;
      const aspect = asset?.width && asset?.height ? asset.width / asset.height : 1;
      const marks = l.kind === 'image' && !img ? [] : layoutLayer(l, page, (px) => measureWmText(ctx, l, text, px), aspect, icons);
      return { layer: l, text, img, marks };
    });
}

/** Draw a project's watermark over a page already drawn in page coordinates. */
export function drawWatermark(ctx: Ctx2D, page: Page, wr: WatermarkRender, o: RenderOptions) {
  if (!wmAppliesTo(wr.watermark, page.id)) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  for (const { layer: l, text, img, marks } of watermarkMarks(ctx, page, wr, o.getAsset, o.getImage)) {
    if (!marks.length) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity));
    const src = img ? (l.tint ? tinted(img, l.tint) : img) : null;
    for (const m of marks) {
      ctx.save();
      ctx.translate(m.x, m.y);
      if (m.rot) ctx.rotate(m.rot * DEG);
      if (l.shadow.enabled) {
        ctx.shadowColor = `rgba(0,0,0,${Math.max(0, Math.min(1, l.shadow.opacity))})`;
        ctx.shadowBlur = m.h * 0.25 * o.pxScale;
        ctx.shadowOffsetY = m.h * 0.06 * o.pxScale;
      }
      if (src) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, -m.w / 2, -m.h / 2, m.w, m.h);
      } else if (l.kind === 'text') {
        ctx.font = wmFont(l, m.h);
        setLetterSpacing(ctx, l.spacing * m.h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (l.outline.enabled && l.outline.width > 0) {
          ctx.lineJoin = 'round';
          ctx.strokeStyle = l.outline.color;
          ctx.lineWidth = l.outline.width * m.h * 2;
          ctx.strokeText(text, 0, 0);
          ctx.shadowColor = 'transparent';
        }
        ctx.fillStyle = l.color;
        ctx.fillText(text, 0, 0);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Projective warp (Ground Plane): the image drawn into an arbitrary quad
// ---------------------------------------------------------------------------
//
// The exact warp maps every output pixel back into the source (bilinear, premultiplied), so
// semi-transparent edges never show seams. Its cost is mostly fixed per icon, so for packs of
// thousands of icons it is kept low by:
//   - warping at power-of-two sizes and letting the GPU downscale the result (at most 2×) to the
//     drawn size, so zooming re-warps an icon only when it doubles or halves on screen;
//   - never warping larger than the source has pixels (zooming in further only scales the result);
//   - reading the source back at a size matched to the output (a 64 px copy for a 32 px tile, not
//     the whole bitmap), on one shared canvas;
//   - caches bounded by memory, not by count.
// With a frame budget (the editor), icons beyond the budget are drawn through a fast GPU warp into
// the same quad and replaced by the exact warp on the next frames; exports never use a budget.

/**
 * Frame budget for warping (editor only): `ms` of exact warps per frame, counted from the first warp
 * (so a slow background never uses it up), and always at least `min` exact warps, so refining a
 * frame always makes progress. `incomplete` is set when an icon was drawn approximately.
 */
export interface WarpBudget {
  ms: number;
  min: number;
  /** Set on the first warp of the frame. */
  deadline?: number;
  made?: number;
  incomplete: boolean;
}

interface WarpEntry {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  quad: string;
  w: number;
  h: number;
  nearest: boolean;
  approx: boolean;
}

const WARP_BYTES = 192 * 1024 * 1024;
const PIXEL_BYTES = 96 * 1024 * 1024;
/** source → its warped versions (most recently used last) */
const warpCache = new Map<object, Map<string, WarpEntry>>();
let warpBytes = 0;
/** source → its pixels read back at a few sizes */
const pixelCache = new Map<object, Map<number, { data: Uint8ClampedArray; w: number; h: number }>>();
let pixelBytes = 0;
const quadKeys = new WeakMap<Quad, string>();

const quadKey = (q: Quad) => {
  let k = quadKeys.get(q);
  if (!k) quadKeys.set(q, (k = q.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';')));
  return k;
};

/** Power-of-two warp size for something drawn `px` device pixels large (16 … 2048). */
export function warpLevel(px: number, srcMax: number): number {
  const cap = Math.max(16, Math.min(2048, 2 ** Math.ceil(Math.log2(Math.max(16, srcMax)))));
  return Math.min(cap, 2 ** Math.ceil(Math.log2(Math.max(16, px))));
}

function newCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

let scratch: { c: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D } | null = null;

/** The RGBA pixels of `src` scaled to fit `size` (its own size when smaller), cached. */
function sourcePixels(src: CanvasImageSource, sw: number, sh: number, size: number) {
  const k = Math.min(1, size / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)),
    h = Math.max(1, Math.round(sh * k));
  const key = w;
  let m = pixelCache.get(src as object);
  const hit = m?.get(key);
  if (hit) return hit;
  if (!scratch || scratch.c.width < w || scratch.c.height < h) {
    const c = newCanvas(Math.max(w, scratch?.c.width ?? 0, 256), Math.max(h, scratch?.c.height ?? 0, 256));
    const ctx = c.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
    if (!ctx) return null;
    scratch = { c, ctx };
  }
  const ctx = scratch.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'copy';
  ctx.imageSmoothingEnabled = k < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const res = { data: ctx.getImageData(0, 0, w, h).data, w, h };
  if (!m) pixelCache.set(src as object, (m = new Map()));
  m.set(key, res);
  pixelBytes += res.data.byteLength;
  for (const [s, sizes] of pixelCache) {
    if (pixelBytes <= PIXEL_BYTES || s === src) break;
    for (const v of sizes.values()) pixelBytes -= v.data.byteLength;
    pixelCache.delete(s);
  }
  return res;
}

function storeWarp(src: object, key: string, e: WarpEntry) {
  let m = warpCache.get(src);
  if (m) {
    warpCache.delete(src);
    const old = m.get(key);
    if (old) {
      warpBytes -= old.w * old.h * 4;
      m.delete(key);
    }
  } else m = new Map();
  m.set(key, e);
  warpCache.set(src, m);
  warpBytes += e.w * e.h * 4;
  if (m.size > 8) {
    const [k0, v0] = m.entries().next().value as [string, WarpEntry];
    m.delete(k0);
    warpBytes -= v0.w * v0.h * 4;
  }
  for (const [s, entries] of warpCache) {
    if (warpBytes <= WARP_BYTES || s === src) break;
    for (const v of entries.values()) warpBytes -= v.w * v.h * 4;
    warpCache.delete(s);
  }
}

/** The warp of `src` for `quad` that is already made and closest in size to `w` (any accuracy). */
function nearestWarp(m: Map<string, WarpEntry> | undefined, quad: string, w: number, nearest: boolean): WarpEntry | null {
  let best: WarpEntry | null = null;
  if (m)
    for (const e of m.values()) {
      if (e.quad !== quad || e.nearest !== nearest) continue;
      const d = Math.abs(Math.log2(e.w / w)) + (e.approx ? 0.5 : 0);
      if (!best || d < Math.abs(Math.log2(best.w / w)) + (best.approx ? 0.5 : 0)) best = e;
    }
  return best;
}

/**
 * `src` warped into the quad `warp` (box units, -0.5 … 0.5) of a box `bw` × `bh` device pixels.
 * The result may be up to twice as large as the box (or as large as the source allows); callers
 * draw it into the box. With a budget that has run out, a made warp of another size or a fast
 * approximate one is returned instead and `budget.incomplete` is set.
 */
export function warpedImage(src: CanvasImageSource, warp: Quad, bw: number, bh: number, nearest = false, budget?: WarpBudget): CanvasImageSource | null {
  const sw = (src as { width: number }).width,
    sh = (src as { height: number }).height;
  if (!sw || !sh || !(bw > 0) || !(bh > 0)) return null;
  const L = warpLevel(Math.max(bw, bh), Math.max(sw, sh) * 1.25);
  const big = Math.max(bw, bh);
  const cw = Math.max(2, Math.round((L * bw) / big)),
    ch = Math.max(2, Math.round((L * bh) / big));
  const qk = quadKey(warp);
  const key = `${qk}|${cw}x${ch}|${nearest ? 'n' : 'b'}`;
  const m = warpCache.get(src as object);
  const hit = m?.get(key);
  if (hit && !hit.approx) {
    // most recently used last
    m!.delete(key);
    m!.set(key, hit);
    return hit.canvas;
  }
  if (budget) {
    budget.deadline ??= performance.now() + budget.ms;
    budget.made ??= 0;
  }
  if (budget && budget.made! >= budget.min && performance.now() > budget.deadline!) {
    budget.incomplete = true;
    const other = hit ?? nearestWarp(m, qk, cw, nearest);
    if (other) return other.canvas;
    const fast = fastWarp(src, warp, cw, ch);
    if (fast) storeWarp(src as object, key, { canvas: fast, quad: qk, w: cw, h: ch, nearest, approx: true });
    return fast;
  }
  if (budget) budget.made!++;
  const exact = exactWarp(src, sw, sh, warp, cw, ch, nearest);
  if (exact) storeWarp(src as object, key, { canvas: exact, quad: qk, w: cw, h: ch, nearest, approx: false });
  return exact;
}

/** Quick warp on the GPU: the image drawn as two affine triangles that meet every corner exactly. */
function fastWarp(src: CanvasImageSource, warp: Quad, cw: number, ch: number) {
  const c = newCanvas(cw, ch);
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) return null;
  const sw = (src as { width: number }).width,
    sh = (src as { height: number }).height;
  const P = warp.map((p) => ({ x: (p.x + 0.5) * cw, y: (p.y + 0.5) * ch }));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // triangles (0,1,3) and (2,3,1): source corners (0,0)(1,0)(0,1) and (1,1)(0,1)(1,0)
  const tri = (a: number, b: number, d: number, ua: [number, number]) => {
    const [ux, uy] = ua;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(P[a].x, P[a].y);
    ctx.lineTo(P[b].x, P[b].y);
    ctx.lineTo(P[d].x, P[d].y);
    ctx.closePath();
    ctx.clip();
    // affine map sending source (ux,uy) → P[a], one unit along u → P[b], one unit along v → P[d]
    const sx = ux ? -1 : 1,
      sy = uy ? -1 : 1;
    const ax = (P[b].x - P[a].x) * sx,
      ay = (P[b].y - P[a].y) * sx,
      bx = (P[d].x - P[a].x) * sy,
      by = (P[d].y - P[a].y) * sy;
    ctx.setTransform(ax / sw, ay / sw, bx / sh, by / sh, P[a].x - ux * ax - uy * bx, P[a].y - ux * ay - uy * by);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  tri(0, 1, 3, [0, 0]);
  tri(2, 3, 1, [1, 1]);
  return c;
}

function exactWarp(src: CanvasImageSource, sw0: number, sh0: number, warp: Quad, cw: number, ch: number, nearest: boolean) {
  // sample a copy about twice the output size (pixel art: the original pixels)
  const pix = sourcePixels(src, sw0, sh0, nearest ? Math.max(sw0, sh0) : Math.max(cw, ch) * 2);
  if (!pix) return null;
  const sw = pix.w,
    sh = pix.h;
  const c = newCanvas(cw, ch);
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) return null;
  const quad = warp.map((p) => ({ x: (p.x + 0.5) * cw, y: (p.y + 0.5) * ch })) as Quad;
  const inv = invertMat(squareToQuad(quad));
  const out = ctx.createImageData(cw, ch);
  const o = out.data,
    d = pix.data;
  const x0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x)))),
    x1 = Math.min(cw, Math.ceil(Math.max(...quad.map((p) => p.x)))),
    y0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y)))),
    y1 = Math.min(ch, Math.ceil(Math.max(...quad.map((p) => p.y))));
  const [a0, a1, a2, b0, b1, b2, c0, c1, c2] = inv;
  const sw1 = sw - 1,
    sh1 = sh - 1;
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5;
    // the row's homogeneous coordinates, advanced by one pixel per step
    let nu = a0 * (x0 + 0.5) + a1 * py + a2,
      nv = b0 * (x0 + 0.5) + b1 * py + b2,
      nw = c0 * (x0 + 0.5) + c1 * py + c2;
    for (let x = x0; x < x1; x++, nu += a0, nv += b0, nw += c0) {
      const u = nu / nw,
        v = nv / nw;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const j = (y * cw + x) * 4;
      if (nearest) {
        // pixel art: the nearest source pixel, crisp like the rest of the canvas
        const i = (Math.min(sh1, Math.floor(v * sh)) * sw + Math.min(sw1, Math.floor(u * sw))) * 4;
        o[j] = d[i];
        o[j + 1] = d[i + 1];
        o[j + 2] = d[i + 2];
        o[j + 3] = d[i + 3];
        continue;
      }
      const fx = u * sw - 0.5,
        fy = v * sh - 0.5;
      const ix = Math.floor(fx),
        iy = Math.floor(fy);
      const tx = fx - ix,
        ty = fy - iy;
      const xa = ix < 0 ? 0 : ix > sw1 ? sw1 : ix,
        xb = ix + 1 > sw1 ? sw1 : ix + 1 < 0 ? 0 : ix + 1,
        ya = iy < 0 ? 0 : iy > sh1 ? sh1 : iy,
        yb = iy + 1 > sh1 ? sh1 : iy + 1 < 0 ? 0 : iy + 1;
      const i00 = (ya * sw + xa) * 4,
        i10 = (ya * sw + xb) * 4,
        i01 = (yb * sw + xa) * 4,
        i11 = (yb * sw + xb) * 4;
      // premultiplied bilinear: weights times alpha
      const w00 = (1 - tx) * (1 - ty) * d[i00 + 3],
        w10 = tx * (1 - ty) * d[i10 + 3],
        w01 = (1 - tx) * ty * d[i01 + 3],
        w11 = tx * ty * d[i11 + 3];
      const al = w00 + w10 + w01 + w11;
      if (al <= 0) continue;
      o[j] = (d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11) / al;
      o[j + 1] = (d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11) / al;
      o[j + 2] = (d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11) / al;
      o[j + 3] = al;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Forget what was made from a bitmap that is about to be closed (export decodes). */
export function forgetWarpSource(src: object) {
  const m = warpCache.get(src);
  if (m) {
    for (const v of m.values()) warpBytes -= v.w * v.h * 4;
    warpCache.delete(src);
  }
  const p = pixelCache.get(src);
  if (p) {
    for (const v of p.values()) pixelBytes -= v.data.byteLength;
    pixelCache.delete(src);
  }
}

/** Drop every warped and read-back image (memory pressure, project closed). */
export function clearWarpCache() {
  warpCache.clear();
  pixelCache.clear();
  warpBytes = 0;
  pixelBytes = 0;
}
