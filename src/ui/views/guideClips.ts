// Animated demo clips for the Guide. Each clip is a short looping "video" drawn live on a canvas
// with the app's real renderer, layouts and text styles, using the user's own icons when the
// project has some (procedural icons otherwise).

import { createText, defaultBackground, scaleTextStyle, TEXT_PRESETS, BACKGROUND_PRESETS } from '../../core/defaults';
import { createRng } from '../../core/rng';
import type { Background, Page } from '../../core/types';
import type { Collider } from '../../core/collide';
import { getAlgorithm, withDefaults } from '../../layout/registry';
import type { LayoutItem, Placement } from '../../layout/types';
import { drawBackground } from '../../render/renderer';
import { drawText } from '../../render/text';
import { getAsset } from '../../state/doc';

export const CLIP_W = 640,
  CLIP_H = 360;
const N = 24;

type Ctx = CanvasRenderingContext2D;
export interface Sprite {
  draw(ctx: Ctx, cx: number, cy: number, w: number, h: number): void;
  aspect: number;
}

export interface ClipEnv {
  sprites: Sprite[];
  layouts: Record<string, Placement[]>;
  bgs: Background[];
  count: number;
}

export interface Clip {
  duration: number; // seconds
  draw(ctx: Ctx, t: number, env: ClipEnv): void;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const back = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
/** Progress 0..1 of t within [a, b], eased. */
const seg = (t: number, a: number, b: number, fn = ease) => fn(clamp01((t - a) / (b - a)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const PAGE = { width: CLIP_W, height: CLIP_H } as Page;

function bg(ctx: Ctx, b: Background, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawBackground(ctx, PAGE, b, { pxScale: 1, getAsset, getImage: () => null });
  ctx.restore();
}

function caption(ctx: Ctx, text: string, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 15px "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.beginPath();
  ctx.roundRect(CLIP_W / 2 - w / 2, CLIP_H - 46, w, 30, 15);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CLIP_W / 2, CLIP_H - 31);
  ctx.restore();
}

function chip(ctx: Ctx, text: string, x: number, y: number, alpha = 1, accent = false) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 12px "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = accent ? '#378ef0' : 'rgba(30,30,30,0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 9, y + 12);
  ctx.restore();
}

function cursor(ctx: Ctx, x: number, y: number, pressed = false) {
  ctx.save();
  ctx.translate(x, y);
  if (pressed) {
    ctx.fillStyle = 'rgba(55,142,240,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineTo(5, 13.5);
  ctx.lineTo(9, 21);
  ctx.lineTo(12, 19.5);
  ctx.lineTo(8, 12.5);
  ctx.lineTo(14, 12.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Draw the icons at placements `a` → `b` (k = 0..1), each scaled by `scale(i)`. */
function icons(ctx: Ctx, env: ClipEnv, a: Placement[], b: Placement[] | null, k: number, scale: (i: number) => number = () => 1, alpha: (i: number) => number = () => 1) {
  env.sprites.forEach((sp, i) => {
    const p = a[i],
      q = b ? b[i] : p;
    if (!p || !q) return;
    const s = scale(i),
      al = alpha(i);
    if (s <= 0 || al <= 0) return;
    ctx.save();
    ctx.globalAlpha = al;
    sp.draw(ctx, lerp(p.cx, q.cx, k), lerp(p.cy, q.cy, k), lerp(p.w, q.w, k) * s, lerp(p.h, q.h, k) * s);
    ctx.restore();
  });
}

function title(ctx: Ctx, text: string, preset: string, x: number, y: number, k: number, size = 0.5, alpha = 1) {
  if (k <= 0 || alpha <= 0) return;
  const p = TEXT_PRESETS.find((t) => t.name === preset)!;
  const t = createText(text, 0, 0, scaleTextStyle(p.style, size));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(k, k);
  // a wide box keeps the title on one line; drawText centers it on the origin
  drawText(ctx, { ...t, w: CLIP_W * 1.6, h: 0 }, 1);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// environment: sprites + precomputed layouts
// ---------------------------------------------------------------------------

const COLORS = ['#ef4444', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];

function proceduralSprite(i: number): Sprite {
  const color = COLORS[i % COLORS.length];
  const kind = i % 4;
  return {
    aspect: 1,
    draw(ctx, cx, cy, w, h) {
      const r = Math.min(w, h) / 2;
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      if (kind === 0) ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      else if (kind === 1) {
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy + r * 0.85);
        ctx.lineTo(cx - r, cy + r * 0.85);
        ctx.closePath();
      } else if (kind === 2) ctx.roundRect(cx - r, cy - r * 0.62, r * 2, r * 1.24, r * 0.3);
      else {
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.75, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r * 0.75, cy);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    },
  };
}

function imageSprite(img: CanvasImageSource & { width: number; height: number }): Sprite {
  const aspect = img.width / Math.max(1, img.height);
  return {
    aspect,
    draw(ctx, cx, cy, w, h) {
      const k = Math.min(w / img.width, h / img.height);
      const dw = img.width * k,
        dh = img.height * k;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    },
  };
}

function runLayout(alg: string, params: Record<string, number | string | boolean>, sprites: Sprite[], keepOut: Collider[] = [], area = { x: 30, y: 30, w: CLIP_W - 60, h: CLIP_H - 90 }, seed = 7): Placement[] {
  const a = getAlgorithm(alg);
  const items: LayoutItem[] = sprites.map((s, i) => ({ id: String(i), index: i, vw: 100 * Math.sqrt(s.aspect), vh: 100 / Math.sqrt(s.aspect), aspect: s.aspect, category: '', name: String(i), rel: 1, hero: i === 0 }));
  const out = a.run(items, withDefaults(a, params), {
    page: { w: CLIP_W, h: CLIP_H },
    area,
    obstacles: [],
    keepOut,
    focal: keepOut[0] ?? null,
    rules: { mode: 'strict', maxOverlap: 0, spacing: 0 },
    rng: createRng(seed),
    seed,
  });
  const byId = new Map(out.map((p) => [p.id, p]));
  return items.map((it) => byId.get(it.id)!);
}

/** Icons from the project (first N previews) or procedural stand-ins. */
export function buildClipEnv(previews: (CanvasImageSource & { width: number; height: number })[], count: number): ClipEnv {
  const sprites = previews.length >= 8 ? previews.slice(0, N).map(imageSprite) : Array.from({ length: N }, (_, i) => proceduralSprite(i));
  const oval: Collider = { kind: 'ellipse', cx: CLIP_W / 2, cy: CLIP_H / 2 - 18, rx: 150, ry: 62 };
  const layouts = {
    grid: runLayout('grid', { gapX: 10, gapY: 10, padding: 10 }, sprites),
    cluster: runLayout('cluster', { density: 0.5, gap: 4 }, sprites),
    round: runLayout('roundcluster', { gap: 4 }, sprites),
    heart: runLayout('shapefill', { shape: 'heart', size: 1 }, sprites),
    framed: runLayout('cluster', { density: 0.42, gap: 4 }, sprites, [oval], { x: 20, y: 20, w: CLIP_W - 40, h: CLIP_H - 80 }),
    scatterA: runLayout('scatter', { density: 0.4, rotation: 10 }, sprites, [], undefined, 11),
    scatterB: runLayout('scatter', { density: 0.4, rotation: 10 }, sprites, [], undefined, 4242),
    catalog: runLayout('grid', { gapX: 14, gapY: 26, padding: 8, fill: 0.72 }, sprites, [], { x: 40, y: 64, w: CLIP_W - 80, h: CLIP_H - 120 }),
    library: sprites.map((_, i) => ({ id: String(i), cx: 70 + (i % 6) * 100, cy: 70 + Math.floor(i / 6) * 62, w: 48, h: 48, rot: 0 })),
  };
  const named = (n: string) => BACKGROUND_PRESETS.find((p) => p.name === n)?.bg() ?? defaultBackground();
  return { sprites, layouts, bgs: [named('Charcoal'), named('Ocean fade'), named('Retro rays'), named('Night sky'), named('Sunrise')], count: count || N };
}

// ---------------------------------------------------------------------------
// clips
// ---------------------------------------------------------------------------

/** The same slots with the icons swapped around (Reorganize). */
function permuted(ps: Placement[]): Placement[] {
  const rng = createRng(99);
  const order = rng.shuffle(ps.map((_, i) => i));
  return ps.map((_, i) => ps[order[i]]);
}

export const CLIPS: Record<string, Clip> = {
  shuffle: {
    duration: 9,
    draw(ctx, t, env) {
      bg(ctx, env.bgs[0]);
      const L = env.layouts;
      const re = permuted(L.scatterB);
      // 0–3.5 s: Shuffle (new seed → new positions); 4.5–8 s: Reorganize (same spots, icons swap)
      if (t < 4) icons(ctx, env, L.scatterA, L.scatterB, seg(t, 1.2, 2.4));
      else icons(ctx, env, L.scatterB, re, seg(t, 5.2, 6.4));
      chip(ctx, 'Shuffle', 14, 12, 1, t > 0.8 && t < 4);
      chip(ctx, 'Reorganize', 92, 12, 1, t >= 4.8);
      chip(ctx, t < 2.4 ? 'Seed 11' : 'Seed 4242', CLIP_W - 92, 12, 1);
      if (t > 0.6 && t < 1.4) cursor(ctx, 40, 30, t > 0.8);
      if (t > 4.4 && t < 5.4) cursor(ctx, 128, 30, t > 4.8);
      caption(ctx, t < 4 ? 'Shuffle = new seed → new random positions' : 'Reorganize = same spots, icons swap places', seg(t, 0.2, 0.6) * (1 - seg(t, 8.5, 8.9)));
    },
  },
  textfx: {
    duration: 11,
    draw(ctx, t, env) {
      bg(ctx, env.bgs[0]);
      icons(ctx, env, env.layouts.framed, null, 0, () => 1, () => 0.35);
      const styles = ['Icon count', 'Gold', 'Chrome', 'Sticker', '3D block', 'Neon', 'Arched'];
      const per = 11 / styles.length;
      const i = Math.min(styles.length - 1, Math.floor(t / per));
      const local = t - i * per;
      const inK = seg(local, 0, 0.35, back);
      const outA = 1 - seg(local, per - 0.25, per);
      title(ctx, `${env.count} ICONS`, styles[i], CLIP_W / 2, CLIP_H / 2 - 10, inK, 0.46, outA);
      chip(ctx, styles[i], 14, 12, 1, true);
      caption(ctx, 'Elements tab → click a title, then fine-tune outline, gradient, 3D, glow, curve', seg(t, 0.2, 0.6) * (1 - seg(t, 10.5, 10.9)));
    },
  },
  catalog: {
    duration: 8,
    draw(ctx, t, env) {
      bg(ctx, env.bgs[0]);
      title(ctx, 'Full catalog', 'Clean headline', CLIP_W / 2, 32, seg(t, 0.2, 0.8), 0.26);
      const L = env.layouts.catalog;
      env.sprites.forEach((sp, i) => {
        const p = L[i];
        const a = seg(t, 1 + i * 0.09, 1.4 + i * 0.09);
        if (!p || a <= 0) return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(p.cx - 34, p.cy - 30, 68, 74, 6);
        ctx.fill();
        sp.draw(ctx, p.cx, p.cy, p.w, p.h);
        ctx.fillStyle = '#d6d9de';
        ctx.font = '600 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1).padStart(2, '0'), p.cx, p.cy + 38);
        ctx.restore();
      });
      caption(ctx, 'Catalog… → numbered, labelled, grouped by category', seg(t, 0.2, 0.6) * (1 - seg(t, 7.5, 7.9)));
    },
  },

  import: {
    duration: 7,
    draw(ctx, t, env) {
      bg(ctx, env.bgs[0]);
      // drop zone
      const zone = 1 - seg(t, 2.6, 3.2);
      if (zone > 0) {
        ctx.save();
        ctx.globalAlpha = zone;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(150, 90, 340, 150);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '600 18px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Drop your icon folder here', CLIP_W / 2, 172);
        ctx.restore();
      }
      // folder being dragged in
      const f = seg(t, 0.3, 2.2);
      const fx = lerp(560, CLIP_W / 2, f),
        fy = lerp(330, 170, f);
      if (t < 2.8) {
        ctx.save();
        ctx.globalAlpha = 1 - seg(t, 2.3, 2.8);
        ctx.fillStyle = '#f5b82e';
        ctx.beginPath();
        ctx.roundRect(fx - 34, fy - 22, 68, 48, 6);
        ctx.fill();
        ctx.fillStyle = '#ffd36b';
        ctx.beginPath();
        ctx.roundRect(fx - 34, fy - 30, 30, 14, 4);
        ctx.fill();
        ctx.restore();
        cursor(ctx, fx + 22, fy + 16, t > 0.3 && t < 2.3);
      }
      // icons pop into the library grid one by one
      icons(ctx, env, env.layouts.library, null, 0, (i) => back(clamp01((t - 2.8 - i * 0.07) / 0.35)));
      caption(ctx, t < 2.8 ? 'Drag a folder onto the window (or File → Import folder)' : `${env.count} icons imported — sub-folders become categories`, seg(t, 0.1, 0.5) * (1 - seg(t, 6.5, 6.9)));
    },
  },
  arrange: {
    duration: 10,
    draw(ctx, t, env) {
      bg(ctx, env.bgs[1]);
      const L = env.layouts;
      const steps: [string, Placement[]][] = [
        ['Grid', L.grid],
        ['Cluster', L.cluster],
        ['Round Cluster', L.round],
        ['Shape Fill · heart', L.heart],
      ];
      const stepT = 2.4;
      const i = Math.min(steps.length - 1, Math.floor(t / stepT));
      const local = t - i * stepT;
      const from = steps[i][1],
        to = steps[Math.min(steps.length - 1, i + 1)][1];
      const k = i < steps.length - 1 ? seg(local, 1.2, 2.2) : 0;
      icons(ctx, env, from, to, k);
      steps.forEach(([name], j) => chip(ctx, name, 14 + j * 128, 12, 1, j === (k > 0.5 ? i + 1 : i)));
      caption(ctx, 'Layout tab → pick a layout. Previews show your own icons.', seg(t, 0.2, 0.6) * (1 - seg(t, 9.5, 9.9)));
    },
  },
  title: {
    duration: 9,
    draw(ctx, t, env) {
      bg(ctx, env.bgs[3]);
      const L = env.layouts;
      // focal oval appears, icons move out of it, then the title and a badge pop in
      const oval = seg(t, 1, 1.8) * (1 - seg(t, 5.2, 6));
      if (oval > 0) {
        ctx.save();
        ctx.globalAlpha = oval;
        ctx.strokeStyle = '#22d3ee';
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(CLIP_W / 2, CLIP_H / 2 - 18, 150, 62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        chip(ctx, 'Focal region', CLIP_W / 2 - 46, CLIP_H / 2 - 92, oval, true);
      }
      icons(ctx, env, L.cluster, L.framed, seg(t, 2, 3.4));
      title(ctx, `${env.count} ICONS`, 'Icon count', CLIP_W / 2, CLIP_H / 2 - 18, seg(t, 3.8, 4.5, back), 0.42);
      title(ctx, 'FREE\nDEMO', 'Count burst', CLIP_W - 70, CLIP_H - 92, seg(t, 5.2, 5.8, back), 0.22);
      caption(ctx, t < 3.6 ? 'Mark the title area — layouts keep it free' : 'Elements tab → add a title and a badge', seg(t, 0.2, 0.6) * (1 - seg(t, 8.5, 8.9)));
    },
  },
  background: {
    duration: 8,
    draw(ctx, t, env) {
      const n = env.bgs.length;
      const per = 8 / n;
      const i = Math.floor(t / per) % n;
      const k = seg(t - i * per, per - 0.6, per);
      bg(ctx, env.bgs[i]);
      if (k > 0) bg(ctx, env.bgs[(i + 1) % n], k);
      icons(ctx, env, env.layouts.round, null, 0);
      const names = ['Charcoal', 'Ocean fade', 'Retro rays', 'Night sky', 'Sunrise'];
      chip(ctx, names[k > 0.5 ? (i + 1) % n : i], 14, 12, 1, true);
      caption(ctx, 'Backgrounds tab → one click: colours, gradients, patterns', seg(t, 0.2, 0.6) * (1 - seg(t, 7.5, 7.9)));
    },
  },
  export: {
    duration: 8,
    draw(ctx, t, env) {
      ctx.fillStyle = '#1f1f1f';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
      // the page shrinks to the left
      const s = lerp(1, 0.5, seg(t, 0.6, 1.6));
      ctx.save();
      ctx.translate(lerp(0, 24, seg(t, 0.6, 1.6)), lerp(0, 50, seg(t, 0.6, 1.6)));
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.rect(0, 0, CLIP_W, CLIP_H);
      ctx.clip();
      bg(ctx, env.bgs[1]);
      icons(ctx, env, env.layouts.round, null, 0);
      title(ctx, `${env.count} ICONS`, 'Icon count', CLIP_W / 2, CLIP_H / 2, 1, 0.42, 0.95);
      ctx.restore();
      // export panel with files appearing
      const x0 = 360;
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.roundRect(x0, 50, 256, 190, 8);
      ctx.fill();
      ctx.fillStyle = '#e8e8e8';
      ctx.font = '600 13px "Segoe UI", sans-serif';
      ctx.fillText('Export folder', x0 + 14, 74);
      const files = ['fantasy_icons_cover.png', 'fantasy_icons_cover_2.png', 'fantasy_icons_catalog.png'];
      files.forEach((f, i) => {
        const a = seg(t, 2 + i * 1.2, 2.5 + i * 1.2);
        if (a <= 0) return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.roundRect(x0 + 12, 88 + i * 46, 232, 38, 5);
        ctx.fill();
        ctx.fillStyle = '#2d9d78';
        ctx.font = '700 14px "Segoe UI", sans-serif';
        ctx.fillText('✓', x0 + 22, 112 + i * 46);
        ctx.fillStyle = '#e8e8e8';
        ctx.font = '12px "Cascadia Mono", Consolas, monospace';
        ctx.fillText(f, x0 + 42, 106 + i * 46);
        ctx.fillStyle = '#8f8f8f';
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillText(i === 1 ? 'name was taken → _2 added' : 'full resolution PNG', x0 + 42, 120 + i * 46);
        ctx.restore();
      });
      caption(ctx, 'Export → choose a name pattern. Existing files are never overwritten.', seg(t, 0.2, 0.6) * (1 - seg(t, 7.5, 7.9)));
    },
  },
  storeset: {
    duration: 8,
    draw(ctx, t, env) {
      ctx.fillStyle = '#1f1f1f';
      ctx.fillRect(0, 0, CLIP_W, CLIP_H);
      const pages: [string, number, number, Placement[], number][] = [
        ['Hero 1920×1080', 160, 90, env.layouts.cluster, 1],
        ['Cover 1080×1080', 104, 104, env.layouts.round, 2],
        ['Catalog', 104, 104, env.layouts.grid, 0],
        ['Category page', 160, 90, env.layouts.grid, 4],
      ];
      let x = 28;
      pages.forEach(([name, w, h, pl, bi], i) => {
        const a = seg(t, 0.8 + i * 0.9, 1.5 + i * 0.9, back);
        if (a > 0) {
          const y = 120 + (1 - a) * 80;
          ctx.save();
          ctx.globalAlpha = clamp01(a);
          ctx.translate(x, y);
          const k = w / CLIP_W;
          const kh = h / CLIP_H;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.clip();
          ctx.scale(k, kh);
          bg(ctx, env.bgs[bi]);
          icons(ctx, env, pl, null, 0);
          ctx.restore();
          ctx.strokeStyle = '#4a4a4a';
          ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
          ctx.fillStyle = '#bdbdbd';
          ctx.font = '600 11px "Segoe UI", sans-serif';
          ctx.fillText(name, 0, h + 16);
          ctx.restore();
        }
        x += w + 18;
      });
      chip(ctx, 'Complete store set', 28, 40, seg(t, 0.1, 0.5), true);
      caption(ctx, 'Home → Complete store set: all marketplace pages in one click', seg(t, 0.2, 0.6) * (1 - seg(t, 7.5, 7.9)));
    },
  },
};
