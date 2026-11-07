// Procedural background layers: decorative patterns, a soft spotlight and multi-color mesh
// gradients. Everything is drawn in page coordinates and seeded, so the editor and the export
// produce the same picture at any resolution.

import { createRng } from '../core/rng';
import type { Background, BgPattern } from '../core/types';
import type { Ctx2D } from './renderer';

export const PATTERN_KINDS: { value: BgPattern['kind']; label: string }[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'grid', label: 'Grid lines' },
  { value: 'diagonal', label: 'Diagonal stripes' },
  { value: 'checker', label: 'Checkerboard' },
  { value: 'rays', label: 'Sun rays' },
  { value: 'halftone', label: 'Halftone' },
  { value: 'waves', label: 'Waves' },
  { value: 'stars', label: 'Stars' },
  { value: 'confetti', label: 'Confetti' },
  { value: 'bokeh', label: 'Bokeh' },
  { value: 'noise', label: 'Film grain' },
];

export function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Fixed blob positions for mesh gradients (fractions of the page). */
const MESH_SPOTS = [
  { x: 0.12, y: 0.15, r: 0.75 },
  { x: 0.9, y: 0.2, r: 0.7 },
  { x: 0.78, y: 0.92, r: 0.75 },
  { x: 0.15, y: 0.88, r: 0.7 },
  { x: 0.5, y: 0.5, r: 0.55 },
];

export function drawMesh(ctx: Ctx2D, W: number, H: number, bg: Background) {
  const stops = bg.gradient.stops;
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, W, H);
  const D = Math.hypot(W, H);
  stops.slice(0, MESH_SPOTS.length).forEach((s, i) => {
    const p = MESH_SPOTS[i];
    const r = p.r * D * 0.5 * (bg.gradient.radius || 1);
    const g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, r);
    g.addColorStop(0, rgba(s.color, 0.95));
    g.addColorStop(1, rgba(s.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

export function drawLight(ctx: Ctx2D, W: number, H: number, l: Background['light']) {
  const cx = l.x * W,
    cy = l.y * H;
  const r = Math.max(1, (l.size * Math.hypot(W, H)) / 2);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(l.color, Math.min(1, l.strength)));
  g.addColorStop(0.35, rgba(l.color, Math.min(1, l.strength) * 0.45));
  g.addColorStop(1, rgba(l.color, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

let grainTile: { canvas: OffscreenCanvas | HTMLCanvasElement } | null = null;
function grain() {
  if (grainTile) return grainTile.canvas;
  const S = 160;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d') as Ctx2D;
  const img = g.createImageData(S, S);
  const rng = createRng(7);
  for (let i = 0; i < S * S; i++) {
    const v = rng() * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = { canvas: c };
  return c;
}

/** Draw a pattern layer over the whole page. `scale` 1 ≈ a 48px cell on a 1080px page. */
export function drawPattern(ctx: Ctx2D, W: number, H: number, p: BgPattern) {
  if (p.opacity <= 0) return;
  const base = Math.min(W, H) / 22.5;
  const s = Math.max(4, base * p.scale);
  const color = p.color;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.globalAlpha = Math.min(1, p.opacity);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const D = Math.hypot(W, H);
  // rotate the pattern about the page center
  const rotated = (draw: () => void) => {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((p.angle * Math.PI) / 180);
    ctx.translate(-D / 2, -D / 2);
    draw();
    ctx.restore();
  };
  const rng = createRng(p.seed ?? 1);
  switch (p.kind) {
    case 'dots':
      rotated(() => {
        ctx.beginPath();
        for (let y = 0; y < D + s; y += s) for (let x = (Math.round(y / s) % 2) * (s / 2); x < D + s; x += s) {
          ctx.moveTo(x + s * 0.12, y);
          ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
        }
        ctx.fill();
      });
      break;
    case 'grid':
      rotated(() => {
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        for (let x = 0; x < D + s; x += s) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, D);
        }
        for (let y = 0; y < D + s; y += s) {
          ctx.moveTo(0, y);
          ctx.lineTo(D, y);
        }
        ctx.stroke();
      });
      break;
    case 'diagonal':
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(((p.angle + 45) * Math.PI) / 180);
      for (let x = -D / 2; x < D / 2; x += s) ctx.fillRect(x, -D / 2, s * 0.35, D);
      ctx.restore();
      break;
    case 'checker':
      rotated(() => {
        ctx.beginPath();
        for (let y = 0, r = 0; y < D; y += s, r++) for (let x = (r % 2) * s; x < D; x += s * 2) ctx.rect(x, y, s, s);
        ctx.fill();
      });
      break;
    case 'rays': {
      const n = Math.max(6, Math.round(24 / Math.max(0.3, p.scale)));
      const cx = W * (p.cx ?? 0.5),
        cy = H * (p.cy ?? 0.5);
      ctx.translate(cx, cy);
      ctx.rotate((p.angle * Math.PI) / 180);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2,
          a1 = a0 + (Math.PI / n) * 0.9;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * D, Math.sin(a0) * D);
        ctx.lineTo(Math.cos(a1) * D, Math.sin(a1) * D);
        ctx.closePath();
      }
      // fade the rays out toward the edges
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, D * 0.6);
      g.addColorStop(0, rgba(color, 1));
      g.addColorStop(1, rgba(color, 0.15));
      ctx.fillStyle = g;
      ctx.fill();
      break;
    }
    case 'halftone': {
      const cx = W * (p.cx ?? 0.5),
        cy = H * (p.cy ?? 0.5);
      ctx.beginPath();
      for (let y = s / 2; y < H + s; y += s)
        for (let x = s / 2; x < W + s; x += s) {
          const d = Math.min(1, Math.hypot((x - cx) / W, (y - cy) / H) * 1.6);
          const r = s * 0.48 * d;
          if (r < 0.4) continue;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      ctx.fill();
      break;
    }
    case 'waves':
      rotated(() => {
        ctx.lineWidth = Math.max(1, s * 0.08);
        ctx.beginPath();
        for (let y = 0; y < D + s; y += s * 0.75) {
          ctx.moveTo(0, y);
          for (let x = 0; x <= D; x += s / 4) ctx.lineTo(x, y + Math.sin((x / s) * Math.PI) * s * 0.18);
        }
        ctx.stroke();
      });
      break;
    case 'stars': {
      const n = Math.round(((W * H) / (s * s)) * 0.35);
      for (let i = 0; i < n; i++) {
        const x = rng() * W,
          y = rng() * H;
        const r = s * (0.03 + rng() ** 3 * 0.12);
        ctx.globalAlpha = Math.min(1, p.opacity) * (0.35 + rng() * 0.65);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (r > s * 0.09) {
          // a few bigger stars get a sparkle cross
          ctx.lineWidth = r * 0.35;
          ctx.beginPath();
          ctx.moveTo(x - r * 4, y);
          ctx.lineTo(x + r * 4, y);
          ctx.moveTo(x, y - r * 4);
          ctx.lineTo(x, y + r * 4);
          ctx.stroke();
        }
      }
      break;
    }
    case 'confetti': {
      const n = Math.round(((W * H) / (s * s)) * 0.12);
      const palette = [color, p.color2 ?? '#ffffff', p.color3 ?? '#f5c542'];
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(rng() * W, rng() * H);
        ctx.rotate(rng() * Math.PI);
        ctx.fillStyle = palette[i % palette.length];
        const w = s * (0.12 + rng() * 0.18);
        if (rng() < 0.5) ctx.fillRect(-w / 2, -w * 0.2, w, w * 0.4);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, w * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case 'bokeh': {
      const n = Math.max(6, Math.round(((W * H) / (s * s)) * 0.02));
      for (let i = 0; i < n; i++) {
        const x = rng() * W,
          y = rng() * H,
          r = s * (0.6 + rng() * 2.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const a = 0.25 + rng() * 0.5;
        g.addColorStop(0, rgba(color, a));
        g.addColorStop(0.7, rgba(color, a * 0.6));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'noise': {
      const tile = grain();
      const pat = ctx.createPattern(tile, 'repeat');
      if (pat) {
        const k = Math.max(0.5, (p.scale * Math.min(W, H)) / 1080);
        pat.setTransform(new DOMMatrix().scaleSelf(k, k));
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
  }
  ctx.restore();
}
