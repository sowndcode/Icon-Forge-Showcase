// Marketplace production tools: templates, catalog, category showcase, marketplace set,
// random selection, template slots and Replace Asset Set.

import { guideAction } from './guideProgress';
import { buildCatalogPages, DEFAULT_CATALOG } from '../core/catalog';
import { BACKGROUND_PRESETS, CANVAS_PRESETS, presetName, createPage, createShape, createText, grad, scaleTextStyle, TEXT_PRESETS, withLight, withPattern } from '../core/defaults';
import { naturalWidth, textHeight } from '../render/text';
import { apportion } from '../layout/common';
import { uid } from '../core/ids';
import { createRng } from '../core/rng';
import { currentVisibleBox, placeImageByVisibleBox } from '../core/transform';
import type { AssetRecord, Background, CatalogSettings, ImageFilter, ImageObject, LayoutInstance, LayoutPresetData, Page, ProjectDoc, SceneObject, StoredPreset, TemplateLayout, TemplatePageOptions, TextObject, TextStyle } from '../core/types';
import { safeRect } from '../layout/run';
import { getAlgorithm, withDefaults } from '../layout/registry';
import type { Theme } from '../core/themes';
import { readableForTheme, themedPage } from './themes';
import { runLayout } from '../layout/run';
import { db } from '../services/db';
import { commit, getAsset, getDoc, getPage, withPage } from './doc';
import { instanceFromPreset, newInstance, presetFromInstance } from './layoutActions';
import { newImageObject, select } from './objects';
import { addPages, clonePage } from './pages';
import { fitView, toast, useUI } from './ui';
import { usePrefs } from './prefs';
import { refreshPresets } from './presets';
import { applyContent, carrySig, keyTemplateObjects, mergeTemplateRebuild, optsSig, pageContent, pageTemplateOptions, restyleOnly, textModePixel } from './templateMerge';

// ---------------------------------------------------------------------------
// Random selection
// ---------------------------------------------------------------------------

export type RandomMode = 'any' | 'equal' | 'weighted';

export function pickRandom(assets: AssetRecord[], n: number, mode: RandomMode, seed: number): AssetRecord[] {
  const rng = createRng(seed);
  n = Math.min(n, assets.length);
  if (mode === 'any') return rng.shuffle(assets).slice(0, n);
  const byCat = new Map<string, AssetRecord[]>();
  for (const a of assets) {
    if (!byCat.has(a.category)) byCat.set(a.category, []);
    byCat.get(a.category)!.push(a);
  }
  const cats = [...byCat.keys()];
  const pools = cats.map((c) => rng.shuffle(byCat.get(c)!));
  let quotas: number[];
  if (mode === 'weighted') quotas = apportion(n, pools.map((p) => p.length));
  else {
    quotas = apportion(n, pools.map(() => 1));
  }
  // redistribute quota that a small category can't fill
  let spare = 0;
  quotas = quotas.map((q, i) => {
    const take = Math.min(q, pools[i].length);
    spare += q - take;
    return take;
  });
  while (spare > 0) {
    let progressed = false;
    for (let i = 0; i < pools.length && spare > 0; i++)
      if (quotas[i] < pools[i].length) {
        quotas[i]++;
        spare--;
        progressed = true;
      }
    if (!progressed) break;
  }
  const out: AssetRecord[] = [];
  pools.forEach((p, i) => out.push(...p.slice(0, quotas[i])));
  return rng.shuffle(out);
}

export function libraryAssets(doc = getDoc(), kind: AssetRecord['kind'] = 'asset') {
  return doc.assets.filter((a) => a.kind === kind && a.status !== 'error');
}

/** Selected library assets, else all assets. */
export function workingAssets(): AssetRecord[] {
  const sel = new Set(useUI.getState().librarySel);
  const all = libraryAssets();
  const s = all.filter((a) => sel.has(a.id));
  return s.length ? s : all;
}

// ---------------------------------------------------------------------------
// Building pages with laid-out assets
// ---------------------------------------------------------------------------

function placeAssets(page: Page, assets: AssetRecord[], preset: Partial<LayoutPresetData> & { algorithm: string }, frac = 0.12): Page {
  if (!assets.length) return { ...page, templateLayout: { ...defaultPresetData(preset.algorithm), ...preset } };
  const objs = assets.map((a) => newImageObject(a.id, { x: page.width / 2, y: page.height / 2 }, page, frac));
  const inst: LayoutInstance = { ...newInstance(preset.algorithm, objs.map((o) => o.id), page), ...(preset.params ? instanceFromPreset({ ...defaultPresetData(preset.algorithm), ...preset } as LayoutPresetData, page) : {}) };
  if (!preset.params) Object.assign(inst, { avoidFocal: preset.avoidFocal ?? page.focal.enabled });
  const withObjs: Page = { ...page, objects: [...objs.map((o) => ({ ...o, layoutId: inst.id })), ...page.objects], layouts: [...page.layouts, inst] };
  return runLayout(withObjs, inst, { getAsset });
}

function defaultPresetData(algorithm: string): LayoutPresetData {
  const alg = getAlgorithm(algorithm);
  return { algorithm, params: {}, seed: Math.floor(Math.random() * 1e6), overlap: alg.defaultOverlap ?? 'strict', maxOverlap: 0.3, avoidFocal: true, respectSafe: true };
}

/** Centered title that stays on one line: the font shrinks (down to 55%) until it fits `widthFrac` of the page. */
function titleText(page: Page, text: string, y: number, size: number, extra: Parameters<typeof createText>[3] = {}, widthFrac = 0.86) {
  const t = createText(text, page.width / 2, y, { fontSize: size, ...extra });
  const maxW = page.width * widthFrac;
  const natural = naturalWidth(text, t.style) + t.style.fontSize * 0.2;
  if (natural > maxW) {
    const k = Math.max(0.55, maxW / natural);
    t.style = { ...t.style, fontSize: t.style.fontSize * k, letterSpacing: t.style.letterSpacing * k, stroke: { ...t.style.stroke, width: t.style.stroke.width * k } };
  }
  t.w = maxW;
  t.h = textHeight(t);
  return t;
}

/** Text in the look of a built-in preset ("Count burst", "Free demo"…), sized to its content and scaled by `k`. */
function presetText(name: string, text: string, x: number, y: number, k = 1) {
  const p = TEXT_PRESETS.find((t) => t.name === name)!;
  const t = createText(text, x, y, scaleTextStyle(p.style, k));
  t.w = Math.ceil(naturalWidth(text, t.style) + t.style.fontSize * 0.4);
  t.h = textHeight(t);
  return t;
}

/** "{count}" when the template uses the whole library (stays correct as assets are added), else the number. */
const countToken = (assets: AssetRecord[]) => (assets.length && assets.length === libraryAssets().length ? '{count}' : String(assets.length || 100));

export interface TemplateDef {
  id: string;
  name: string;
  w: number;
  h: number;
  description: string;
  /** Menu the template is listed under (see TEMPLATE_GROUPS). */
  group?: string;
  /** Theme it is designed with: used when the Look is “auto” (older templates have none and use the icons' colours). */
  look?: string;
  build: (assets: AssetRecord[], packName: string, bg: Background) => Page;
}

/** Template menus, in display order. */
export const TEMPLATE_GROUPS: { id: string; desc: string }[] = [
  { id: 'itch.io covers', desc: '630 × 500 store covers' },
  { id: 'Clean & professional', desc: 'Restrained layouts with real facts about the pack — store pages, catalogs, social' },
  { id: 'Wide thumbnails', desc: '1920 × 1080 for galleries, screenshots and store pages' },
  { id: 'Square & social', desc: 'Square posts, stories and portrait promos' },
  { id: 'Banners & headers', desc: 'Wide strips: Steam capsules, YouTube, launch banners' },
  { id: 'Free demos', desc: 'For a free sample of the pack — few icons, a FREE DEMO badge' },
  { id: 'Sales & comparisons', desc: 'Color vs grayscale, free vs full' },
  { id: 'Catalogs', desc: 'Every icon, organised' },
];

const GROUP_OF: Record<string, string> = {
  'itch-cover': 'itch.io covers',
  'floor-cover': 'itch.io covers',
  'wall-cover': 'itch.io covers',
  'frame-cover': 'itch.io covers',
  square: 'Square & social',
  large: 'Square & social',
  portrait: 'Square & social',
  banner: 'Banners & headers',
  compare: 'Sales & comparisons',
  demo: 'Free demos',
  versus: 'Sales & comparisons',
  catalog: 'Catalogs',
  category: 'Catalogs',
};
export const templateGroup = (t: TemplateDef) => t.group ?? GROUP_OF[t.id] ?? 'Wide thumbnails';

// ---------------------------------------------------------------------------
// Template options: text style, icon size and theme, applied after a template is built
// ---------------------------------------------------------------------------

export interface TemplateOptions {
  /** Keep the template's text look, make it smooth, or pixel art (soft = finer blocks). */
  text: 'keep' | 'smooth' | 'pixel-soft' | 'pixel';
  /** Icon size factor (1 = as designed). */
  icons: number;
  /** Restyle with a theme (background, text, panels, badges). */
  theme?: Theme;
  /** What the theme changes: everything, only the background, or only text and shapes. */
  themeParts?: 'all' | 'bg' | 'text';
  /** Build every template at this size instead of its own. */
  size?: { w: number; h: number };
}

/**
 * Rebuild a page for another size: text and shapes keep their relative place and scale with the
 * shorter side, full-width bands stretch, the focal region follows, and layouts re-run.
 */
export function reflowPage(p: Page, W: number, H: number): Page {
  if (p.width === W && p.height === H) return p;
  const kx = W / p.width,
    ky = H / p.height,
    k = Math.min(kx, ky);
  const objects = p.objects.map((o): SceneObject => {
    if (o.type === 'image') return { ...o, x: o.x * kx, y: o.y * ky, w: o.w * k, h: o.h * k };
    const wide = o.w > p.width * 0.6,
      tall = o.h > p.height * 0.6;
    const geo = { x: o.x * kx, y: o.y * ky, w: o.w * (wide ? kx : k), h: o.h * (tall ? ky : k) };
    if (o.type === 'text') {
      const base = { ...o, ...geo };
      let style = scaleTextStyle(o.style, k) as TextStyle;
      let w = o.w * k,
        h = o.h * k;
      // titles never run off the new page
      const maxW = W * 0.94;
      if (w > maxW) {
        const f = maxW / w;
        style = scaleTextStyle(style, f) as TextStyle;
        w *= f;
        h *= f;
      }
      return { ...base, style, w, h };
    }
    return { ...o, ...geo, strokeWidth: o.strokeWidth * k, radius: o.radius * k, blur: o.blur ? o.blur * k : o.blur };
  });
  const f = p.focal;
  const fw = f.w > p.width * 0.6 ? f.w * kx : f.w * k,
    fh = f.h > p.height * 0.6 ? f.h * ky : f.h * k;
  let out: Page = {
    ...p,
    width: W,
    height: H,
    objects,
    focal: { ...f, x: f.x * kx, y: f.y * ky, w: fw, h: fh },
    guides: [],
    layouts: p.layouts.map((l) => ({ ...l, plane: undefined, path: undefined, slots: l.slots.map((sl) => ({ ...sl, cx: sl.cx * kx, cy: sl.cy * ky, w: sl.w * k, h: sl.h * k })) })),
  };
  for (const l of out.layouts) out = runLayout(out, out.layouts.find((x) => x.id === l.id)!, { getAsset });
  return out;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = { text: 'keep', icons: 1 };

/** Sizes every template can be rebuilt at (Templates tab ▸ Format). */
export const TEMPLATE_FORMATS = CANVAS_PRESETS.filter((c) => c.popular || ['itch.io', 'Steam'].includes(c.group) || /Square 1080|Story|Instagram portrait|wide banner|YouTube/.test(c.label)).map((c) => ({ ...c, label: `${presetName(c.label)} · ${c.w}×${c.h}` }));
export const templateFormat = (label: string) => {
  const f = label ? TEMPLATE_FORMATS.find((c) => c.label === label) : undefined;
  return f ? { w: f.w, h: f.h } : undefined;
};
/** "1080x1080" (a build signature) → the matching format label. */
export const formatLabelOfSig = (sig: string) => TEMPLATE_FORMATS.find((c) => `${c.w}x${c.h}` === sig)?.label ?? '';

/** Page options + the theme they resolve to → what a build needs. */
export function toTemplateOptions(ui: TemplatePageOptions, theme: Theme | undefined): TemplateOptions {
  return { text: ui.text, icons: ui.icons, theme: ui.themeId === 'none' ? undefined : theme, themeParts: ui.themeParts, size: templateFormat(ui.size) };
}

const SIZE_KEYS = ['size', 'fill', 'density', 'scale', 'supportScale', 'heroScale', 'hero', 'sizeMin', 'sizeMax'];

/**
 * A theme can make a title wider (another font, letter spacing) than the box the template gave it,
 * which made words wrap onto a second line over the count badge. Text that no longer fits its box on
 * one line per line is scaled down until it does. Text that fits is left exactly as it is.
 */
function fitTextsToBoxes(p: Page): Page {
  let changed = false;
  const objects = p.objects.map((o): SceneObject => {
    if (o.type !== 'text' || o.style.curve) return o;
    const lines = o.text.replace(/\{count\}/g, '000').split('\n');
    const pad = o.style.badge?.enabled ? 0 : o.style.fontSize * 0.1;
    const natural = Math.max(...lines.map((l) => naturalWidth(l, o.style))) + pad;
    if (natural <= o.w + 0.5) return o;
    const k = Math.max(0.5, o.w / natural);
    changed = true;
    const style = scaleTextStyle(o.style, k) as TextStyle;
    return { ...o, style, h: textHeight({ ...o, style }) };
  });
  return changed ? { ...p, objects } : p;
}

/**
 * A long pack name can make a title wider than the page (or than the panel it sits on), so it runs
 * off the cover. Such text is scaled down to fit — the panel's width less a margin, or the page's.
 * Text that fits is left exactly as it is.
 */
export function fitTextsToPage(p: Page): Page {
  let changed = false;
  const objects = p.objects.map((o, i): SceneObject => {
    if (o.type !== 'text' || o.style.curve || o.rotation) return o;
    const panel = p.objects
      .slice(0, i)
      .reverse()
      .find((s) => s.type === 'shape' && s.fillEnabled && s.shape !== 'line' && !s.rotation && Math.abs(s.x - o.x) < s.w / 2 && Math.abs(s.y - o.y) < s.h / 2 && s.w < p.width);
    const room = panel ? panel.w * 0.9 : p.width * 0.94;
    // the drawn width: the widest line, which a stored box can understate
    const wide = Math.max(o.w, ...o.text.replace(/\{count\}/g, '000').split('\n').map((l) => naturalWidth(l, o.style)));
    if (wide <= room + 0.5) return o;
    const k = Math.max(0.2, room / wide);
    changed = true;
    const style = scaleTextStyle(o.style, k) as TextStyle;
    return { ...o, style, w: o.w * k, h: textHeight({ ...o, style }) };
  });
  return changed ? { ...p, objects } : p;
}

export function applyTemplateOptions(page: Page, o: TemplateOptions): Page {
  let p = fitTextsToPage(page);
  if (o.size) p = reflowPage(p, o.size.w, o.size.h);
  if (o.theme) {
    const themed = themedPage(p, o.theme);
    const parts = o.themeParts ?? 'all';
    // text from the theme on the template's own background: check it reads there too
    p = parts === 'all' ? themed : parts === 'bg' ? { ...p, background: themed.background } : readableForTheme({ ...themed, background: p.background }, o.theme);
    if (parts !== 'bg') p = fitTextsToBoxes(p);
  }
  if (o.text !== 'keep')
    p = {
      ...p,
      objects: p.objects.map((ob) => {
        if (ob.type !== 'text') return ob;
        return { ...ob, style: { ...ob.style, pixel: textModePixel(o.text, ob.style.fontSize, ob.style.pixel ?? 0) } };
      }),
    };
  if (Math.abs(o.icons - 1) > 0.01)
    for (const inst of p.layouts) {
      const alg = getAlgorithm(inst.algorithm);
      const cur = withDefaults(alg, inst.params);
      const params = { ...cur };
      let changed = false;
      for (const d of alg.params) {
        if (!SIZE_KEYS.includes(d.key) || typeof cur[d.key] !== 'number') continue;
        const v = Math.min(d.max ?? Infinity, Math.max(d.min ?? 0, (cur[d.key] as number) * o.icons));
        if (v !== cur[d.key]) {
          params[d.key] = v;
          changed = true;
        }
      }
      if (changed) {
        const next = { ...inst, params };
        p = runLayout({ ...p, layouts: p.layouts.map((l) => (l.id === inst.id ? next : l)) }, next, { getAsset });
      } else {
        // no size setting: scale each icon about its own centre
        const ids = new Set(inst.objectIds);
        p = { ...p, objects: p.objects.map((ob) => (ids.has(ob.id) ? { ...ob, w: ob.w * o.icons, h: ob.h * o.icons } : ob)) };
      }
    }
  return p;
}

const plural = (n: number) => (n >= 20 ? `${Math.floor(n / 10) * 10}+` : String(n));
/** "Halloween" → "HALLOWEEN ASSET PACK"; never doubles words already in the name. */
const packTitle = (pack: string) => (/\b(pack|set|collection|bundle|kit|icons?|assets?|sprites?)\b/i.test(pack) ? pack : `${pack} asset pack`).toUpperCase();
/** "Halloween Icon Pack" → "Halloween" (falls back to "GAME"). */
const packWord = (pack: string) => pack.replace(/\b(asset|assets|pack|icons?)\b/gi, '').replace(/\s+/g, ' ').trim() || 'GAME';
const iconsTitle = (pack: string, n: number) => `${plural(n || 120)} ${packWord(pack)} ICONS`.toUpperCase();

// Full-bleed perspective covers (fixed looks: they bring their own background)
const floorBg = () => grad('linear', ['#fde047', '#4ade80'], 0.5, 0.5, 180);
const wallBg = () => grad('radial', ['#3b2a6b', '#140f2b'], 0.5, 0.5);
const frameBg = () => withPattern(grad('linear', ['#b07cc6', '#7e4f9a'], 0.5, 0.5, 180), { kind: 'diagonal', color: '#ffffff', opacity: 0.08, scale: 1.4 });

function floorCover(assets: AssetRecord[], pack: string, w: number, h: number): Page {
  let p = createPage('Endless floor', w, h, floorBg());
  const k = Math.min(w, h) / 1080;
  const word = packWord(pack).toUpperCase();
  const t1 = presetText('Pixel harvest', `${word} ICONS`, w / 2, h * 0.1, k * 1.15);
  const t2 = presetText('Pixel count', `${countToken(assets)}+ ICONS!`, w / 2, h * 0.215, k * 1.25);
  const fit = (t: SceneObject) => (t.w > w * 0.92 ? ({ ...t, style: scaleTextStyle((t as TextObject).style, (w * 0.92) / t.w), w: w * 0.92, h: t.h * ((w * 0.92) / t.w) } as SceneObject) : t);
  p.objects = [fit(t1), t2];
  // the title band stays clear; a dense, gently tilted field of icons fills the rest and runs off the edges
  p.focal = { enabled: true, shape: 'rect', x: w / 2, y: h * 0.13, w: w * 1.1, h: h * 0.27 };
  p = placeAssets(p, assets, { algorithm: 'tiltwall', params: { angle: -10, turn: false, size: 1, gap: 0.06, bleed: 0.08, persp: 0.3 }, avoidFocal: true }, 0.1);
  return p;
}

function wallCover(assets: AssetRecord[], pack: string, w: number, h: number): Page {
  let p = createPage('Tilted wall', w, h, wallBg());
  const k = Math.min(w, h) / 1080;
  const word = packWord(pack).toUpperCase();
  const title = presetText('Pixel cyber', `${word}
ICON PACK`, w / 2, h * 0.3, k * 1.15);
  const pw = Math.min(w * 0.86, title.w + 120 * k),
    ph = title.h + 150 * k;
  const panel = createShape('rect', w / 2, h * 0.3 + 25 * k, pw, ph, { fill: '#120d24', opacity: 0.92, radius: 18 * k, stroke: '#7c3aed', strokeWidth: 5 * k, name: 'Title panel' });
  const count = presetText('Pixel count', `${countToken(assets)}+ ICONS!`, w / 2, h * 0.3 + title.h / 2 + 58 * k, k * 1.3);
  p.objects = [panel, title, count];
  p = placeAssets(p, assets, { algorithm: 'tiltwall', params: { angle: -14, gap: 0.22 }, avoidFocal: false }, 0.1);
  return p;
}

function frameCover(assets: AssetRecord[], pack: string, w: number, h: number): Page {
  let p = createPage('Pixel frame', w, h, frameBg());
  const k = Math.min(w, h) / 1080;
  const word = packWord(pack).toUpperCase();
  const title = presetText('Pixel RPG', `${word}
ICON
PACK`, w / 2, h / 2, k * 1.55);
  p.objects = [{ ...title, style: { ...title.style, lineHeight: 0.95 } }];
  p = placeAssets(p, assets.slice(0, 22), { algorithm: 'cropframe', params: { size: 0.19, crop: 0.18, rotation: 6 } }, 0.14);
  return p;
}

/** Rounded cards behind each laid-out icon (app-icon look). Cards go to the back of the page. */
function withCards(p: Page, k: number): Page {
  const inst = p.layouts[0];
  if (!inst) return p;
  const cards = inst.slots.map((sl, i) => {
    const s = Math.max(sl.w, sl.h) * 1.32;
    return createShape('rect', sl.cx, sl.cy, s, s, { fill: '#000000', opacity: 0.3, radius: s * 0.2, stroke: '#ffffff', strokeWidth: 2.5 * k, name: `Card ${i + 1}` });
  });
  return { ...p, objects: [...cards, ...p.objects] };
}

/** White sticker outlines around every icon. */
function asStickers(p: Page, width: number): Page {
  return { ...p, objects: p.objects.map((o) => (o.type === 'image' ? { ...o, outline: { enabled: true, color: '#ffffff', width }, shadow: { enabled: true, color: '#000000', blur: width * 2, dx: 0, dy: width * 0.8, opacity: 0.35 } } : o)) };
}

/** Count pill — or, for a free demo, "N FREE ICONS" in the green demo style. */
function countPill(assets: AssetRecord[], demo: number | undefined, x: number, y: number, k: number) {
  return demo ? presetText('Free demo', `${Math.min(demo, assets.length || demo)} FREE ICONS`, x, y, k * 0.85) : presetText('Count pill', `${countToken(assets)}+ ICONS`, x, y, k);
}

/** FREE DEMO seal in the top-right corner and "full pack" line, for demo templates. */
function demoExtras(p: Page, assets: AssetRecord[], k: number, fullLine: { x: number; y: number } | null = null, withSeal = true): Page {
  const seal = withSeal ? [presetText('Demo seal', 'FREE\nDEMO', p.width - 100 * k, 100 * k, k)] : [];
  const full = fullLine ? [titleText(p, `FULL PACK: ${countToken(assets)}+ ICONS`, fullLine.y, 30 * k, { fontFamily: 'Bahnschrift', fontWeight: 600, letterSpacing: 3 * k, fill: '#e5e7eb' })].map((t) => ({ ...t, x: fullLine.x })) : [];
  return { ...p, objects: [...p.objects, ...full, ...seal] };
}

function cardCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number, cols: number, rows: number, demo?: number): Page {
  let p = createPage('Card grid', w, h, bg);
  const k = Math.min(w, h) / 1080;
  p.safeZone = { enabled: true, top: 30, right: 6, bottom: 7, left: 6 };
  p.objects = [titleText(p, packTitle(pack), h * 0.11, 120 * k, { stroke: { enabled: true, color: '#111318', width: 9 * k } }, demo ? 0.6 : 0.86), countPill(assets, demo, w / 2, h * 0.215, k * 1.05)];
  p = placeAssets(p, assets.slice(0, cols * rows), { algorithm: 'grid', params: { columns: cols, rows, gapX: 46 * k, gapY: 46 * k, fill: 0.7, padding: 10 * k } }, 0.14);
  const out = withCards(p, k);
  return demo ? demoExtras(out, assets, k) : out;
}

function stickerCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number, demo?: number): Page {
  let p = createPage('Stickers', w, h, bg);
  const k = Math.min(w, h) / 1080;
  const title = presetText('Bubble', packTitle(pack), w / 2, h / 2 - 20 * k, k * 0.95);
  const fitT = title.w > w * 0.8 ? { ...title, style: scaleTextStyle(title.style, (w * 0.8) / title.w) as TextStyle, w: w * 0.8, h: title.h * ((w * 0.8) / title.w) } : title;
  const count = countPill(assets, demo, w / 2, h / 2 + fitT.h / 2 + 30 * k, k * 1.1);
  p.objects = [fitT, count];
  // the title stays readable: stickers scatter around it
  p.focal = { enabled: true, shape: 'ellipse', x: w / 2, y: h / 2, w: Math.max(fitT.w * 1.1, w * 0.55), h: fitT.h + count.h + 120 * k };
  p = placeAssets(p, assets.slice(0, demo ?? 26), { algorithm: 'scatter', params: { density: demo ? 0.42 : 0.5, rotation: 22, sizeMin: 0.85, sizeMax: 1.25, spacing: 14 * k }, avoidFocal: true }, 0.14);
  const out = asStickers(p, 7 * k);
  return demo ? demoExtras(out, assets, k) : out;
}

/** Icons standing on shelves: rows of big icons, each row on a rounded bar. */
function shelfCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number, demo?: number): Page {
  let p = createPage('Shelves', w, h, bg);
  const k = Math.min(w, h) / 1080;
  p.safeZone = { enabled: true, top: 25, right: 5, bottom: 4, left: 5 };
  p.objects = [titleText(p, packTitle(pack), h * 0.1, 118 * k, { stroke: { enabled: true, color: '#111318', width: 9 * k } }, demo ? 0.6 : 0.86), countPill(assets, demo, w / 2, h * 0.2, k)];
  const cols = demo ? 4 : 5,
    rowsN = demo ? 2 : 3;
  p = placeAssets(p, assets.slice(0, cols * rowsN), { algorithm: 'grid', params: { columns: cols, rows: rowsN, gapX: 30 * k, gapY: 60 * k, fill: 0.86 } }, 0.14);
  const inst = p.layouts[0];
  if (!inst) return p;
  // one shelf under each row, at the feet of its icons
  const rows = new Map<number, { y: number; h: number }>();
  for (const sl of inst.slots) {
    const key = Math.round(sl.cy / 10);
    const r = rows.get(key);
    rows.set(key, { y: sl.cy, h: Math.max(r?.h ?? 0, sl.h) });
  }
  const shelves = [...rows.values()].map((r, i) => createShape('rect', w / 2, r.y + r.h / 2 + 12 * k, w * 0.86, 22 * k, { fill: '#000000', opacity: 0.4, radius: 11 * k, name: `Shelf ${i + 1}` }));
  const out = { ...p, objects: [...shelves, ...p.objects] };
  return demo ? demoExtras(out, assets, k) : out;
}

/** Tilted icon wall with a diagonal ribbon carrying the title. */
function ribbonCover(assets: AssetRecord[], pack: string, w: number, h: number): Page {
  let p = createPage('Ribbon', w, h, wallBg());
  const k = Math.min(w, h) / 1080;
  const band = createShape('rect', w / 2, h / 2, Math.hypot(w, h) * 1.1, 250 * k, { fill: '#0d0a1c', opacity: 0.9, rotation: -8, name: 'Ribbon' });
  const title = presetText('Pixel title', packTitle(pack), w / 2, h / 2 - 20 * k, k * 1.05);
  const fitT = title.w > w * 0.86 ? { ...title, style: scaleTextStyle(title.style, (w * 0.86) / title.w) as TextStyle, w: w * 0.86, h: title.h * ((w * 0.86) / title.w) } : title;
  const sub = presetText('Pixel label', `${countToken(assets)}+ ICONS`, w / 2, h / 2 + fitT.h / 2 + 20 * k, k * 1.25);
  p.objects = [band, { ...fitT, rotation: -8 }, { ...sub, rotation: -8 }];
  p = placeAssets(p, assets, { algorithm: 'tiltwall', params: { angle: 14, gap: 0.22 }, avoidFocal: false }, 0.1);
  return p;
}

/** The icon count as a huge pixel number, big icons cut off around the border. */
function countCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number): Page {
  let p = createPage('Big count', w, h, bg);
  const k = Math.min(w, h) / 1080;
  const num = presetText('Pixel title', `${countToken(assets)}+`, w / 2, h / 2 - 70 * k, k * 2.6);
  const fitN = num.w > w * 0.7 ? { ...num, style: scaleTextStyle(num.style, (w * 0.7) / num.w) as TextStyle, w: w * 0.7, h: num.h * ((w * 0.7) / num.w) } : num;
  const label = presetText('Pixel cyber', `${packWord(pack).toUpperCase()} ICONS`, w / 2, h / 2 + fitN.h / 2 + 30 * k, k * 0.95);
  p.objects = [fitN, label];
  p = placeAssets(p, assets.slice(0, 20), { algorithm: 'cropframe', params: { size: 0.19, crop: 0.25, rotation: 10 } }, 0.14);
  return p;
}

/** Title stacked on the left, an organic cluster on the right. */
function splitCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number, style: 'cluster' | 'grid' = 'cluster', demo?: number): Page {
  let p = createPage('Split cover', w, h, bg);
  const k = Math.min(w, h) / 1080;
  const word = packWord(pack).toUpperCase();
  const t = titleText(p, demo ? `${word}\nFREE\nDEMO` : `${word}\nICON\nPACK`, h * 0.42, 150 * k, { lineHeight: 0.95, stroke: { enabled: true, color: '#111318', width: 10 * k } }, 0.42);
  p.objects = [{ ...t, x: w * 0.25 }, { ...countPill(assets, demo, w * 0.25, h * 0.74, k * 1.05) }];
  const scale = Math.sqrt((w * h) / (630 * 500));
  const n = demo ?? Math.round((style === 'grid' ? 20 : 40) * scale);
  p = placeAssets(p, assets.slice(0, n), { algorithm: 'split', params: { side: 'right', share: 0.52, style, gap: 28 * k, fill: 0.84 } }, 0.12);
  // the title already says FREE DEMO, so no seal (it would sit on the icon grid)
  return demo ? demoExtras(p, assets, k, { x: w * 0.25, y: h * 0.84 }, false) : p;
}

/** A full honeycomb of icons with an oval window for the title. */
function honeyCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number): Page {
  let p = createPage('Honeycomb cover', w, h, bg);
  const k = Math.min(w, h) / 1080;
  const t = titleText(p, iconsTitle(pack, assets.length), h / 2 - 10 * k, 120 * k, { stroke: { enabled: true, color: '#111318', width: 10 * k } }, 0.7);
  p.focal = { enabled: true, shape: 'ellipse', x: w / 2, y: h / 2, w: Math.min(w * 0.95, t.w * 1.25), h: t.h + 200 * k };
  p.objects = [t];
  p = placeAssets(p, assets.slice(0, Math.round(40 * Math.sqrt((w * h) / (630 * 500)))), { algorithm: 'honeycomb' }, 0.1);
  return p;
}

/** Icons in an oval ring around the title. */
function ringCover(assets: AssetRecord[], pack: string, bg: Background, w: number, h: number): Page {
  let p = createPage('Ring cover', w, h, bg);
  const k = Math.min(w, h) / 1080;
  p.objects = [titleText(p, iconsTitle(pack, assets.length), h / 2 - 20 * k, 110 * k, { stroke: { enabled: true, color: '#111318', width: 9 * k } }, 0.5), presetText('Count pill', `${countToken(assets)}+ ICONS`, w / 2, h / 2 + 70 * k, k)];
  p = placeAssets(p, assets.slice(0, 30), { algorithm: 'ring', params: { shape: 'oval', rings: 1, inset: 0.03, fill: 0.85 } }, 0.12);
  return p;
}

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'itch-cover',
    name: 'itch.io Cover',
    w: 630,
    h: 500,
    description: 'Store cover image: title on top, cluster of assets, count badge.',
    build(assets, pack, bg) {
      let p = createPage('itch.io cover', 630, 500, bg);
      p.safeZone = { enabled: true, top: 24, right: 4, bottom: 4, left: 4 };
      const title = titleText(p, packTitle(pack), 62, 46, { stroke: { enabled: true, color: '#111318', width: 5 }, shadow: { enabled: true, color: '#000000', blur: 10, dx: 0, dy: 4, opacity: 0.5 } });
      p.objects = [title, presetText('Count burst', `${countToken(assets)}\nICONS`, 560, 430, 0.42)];
      p = placeAssets(p, assets, { algorithm: 'cluster', params: { density: 0.55, gap: 4 } }, 0.16);
      // keep the badge above the assets
      const isBadge = (o: SceneObject) => o.type === 'text' && !!o.style.badge?.enabled;
      return { ...p, objects: [...p.objects.filter((o) => !isBadge(o)), ...p.objects.filter(isBadge)] };
    },
  },
  {
    id: 'itch-wide',
    name: 'itch.io Thumbnail (wide)',
    w: 1920,
    h: 1080,
    description: 'Assets in side bands, big title and a label in the middle.',
    build(assets, pack, bg) {
      let p = createPage('Thumbnail', 1920, 1080, bg);
      p.objects = [
        titleText(p, `${countToken(assets)}\n${packWord(pack).toUpperCase()} ICONS`, 450, 120, { lineHeight: 0.98, stroke: { enabled: true, color: '#111318', width: 9 } }, 0.42),

      ];
      p = placeAssets(p, assets, { algorithm: 'bands', params: { sides: 'lr', band: 0.27 } }, 0.12);
      return p;
    },
  },
  {
    id: 'hero',
    name: 'Marketplace Hero',
    w: 1920,
    h: 1080,
    description: 'Edge-framed assets around a central title.',
    build(assets, pack, bg) {
      let p = createPage('Hero', 1920, 1080, bg);
      p.focal = { enabled: true, shape: 'ellipse', x: 960, y: 520, w: 980, h: 420 };
      p.safeZone = { enabled: true, top: 4, right: 3, bottom: 4, left: 3 };
      p.objects = [
        titleText(p, iconsTitle(pack, assets.length), 500, 104, { stroke: { enabled: true, color: '#111318', width: 10 } }),
        presetText('Count pill', `${countToken(assets)}+ ICONS`, 960, 610, 1),
      ];
      p = placeAssets(p, assets, { algorithm: 'edgeframe' }, 0.14);
      return p;
    },
  },
  {
    id: 'perspective',
    name: 'Perspective Showcase',
    w: 1920,
    h: 1080,
    description: 'Assets on a receding floor, title on top.',
    build(assets, pack, bg) {
      let p = createPage('Perspective', 1920, 1080, bg);
      p.safeZone = { enabled: true, top: 26, right: 2, bottom: 2, left: 2 };
      p.objects = [titleText(p, packTitle(pack), 120, 96, { stroke: { enabled: true, color: '#111318', width: 8 } }), titleText(p, `${assets.length || 120} game-ready icons`, 205, 38, { fontFamily: 'Bahnschrift', fontWeight: 500 })];
      p = placeAssets(p, assets, { algorithm: 'floor' }, 0.1);
      return p;
    },
  },
  {
    id: 'square',
    name: 'Square Cover',
    w: 1080,
    h: 1080,
    description: 'A round cluster of icons above a title band.',
    build(assets, pack, bg) {
      let p = createPage('Square cover', 1080, 1080, bg);
      p.safeZone = { enabled: true, top: 4, right: 4, bottom: 22, left: 4 };
      const band = createShape('rect', 540, 960, 940, 170, { fill: '#000000', opacity: 0.45, radius: 28, name: 'Title band' });
      p.objects = [band, titleText(p, pack.toUpperCase(), 935, 92, { stroke: { enabled: true, color: '#111318', width: 8 } }), titleText(p, `${assets.length || 120} ICONS`, 1005, 34, { fontFamily: 'Bahnschrift', fontWeight: 600, letterSpacing: 6, fill: '#f5c542' })];
      p = placeAssets(p, assets.slice(0, 60), { algorithm: 'roundcluster', params: { density: 0.62 } }, 0.14);
      return p;
    },
  },
  {
    id: 'large',
    name: 'Large Square Showcase',
    w: 2048,
    h: 2048,
    description: 'Dense packed grid with a header.',
    build(assets, pack, bg) {
      let p = createPage('Showcase', 2048, 2048, bg);
      p.safeZone = { enabled: true, top: 12, right: 4, bottom: 4, left: 4 };
      p.objects = [titleText(p, pack.toUpperCase(), 140, 120, { stroke: { enabled: true, color: '#111318', width: 10 } })];
      p = placeAssets(p, assets, { algorithm: 'packed' }, 0.1);
      return p;
    },
  },
  {
    id: 'catalog-wide',
    name: 'Catalog 1920×1080',
    group: 'Catalogs',
    w: 1920,
    h: 1080,
    description: 'Every icon on one wide page, grouped by category; names when they fit.',
    build: (assets, pack, bg) => buildCatalogPages(assets, { ...DEFAULT_CATALOG, margin: 60, labels: assets.length <= 150, numbers: assets.length <= 150, title: `${pack} — Full catalog` }, { w: 1920, h: 1080 }, bg)[0],
  },
  {
    id: 'catalog-compact',
    name: 'Compact Sheet 1920×1080',
    group: 'Catalogs',
    w: 1920,
    h: 1080,
    description: 'Dense sheet of every icon — no names, no boxes, as big as they fit.',
    build: (assets, pack, bg) => buildCatalogPages(assets, { ...DEFAULT_CATALOG, margin: 50, spacing: 8, fill: 0.9, labels: false, numbers: false, headers: false, cellStyle: 'none', cellBackground: false, title: `${pack} — ${assets.length} icons` }, { w: 1920, h: 1080 }, bg)[0],
  },
  {
    id: 'catalog-cards',
    name: 'Card Catalog 1920×1080',
    group: 'Catalogs',
    w: 1920,
    h: 1080,
    description: 'Each icon on its own card, category headers, no names.',
    build: (assets, pack, bg) => buildCatalogPages(assets, { ...DEFAULT_CATALOG, margin: 60, spacing: 14, labels: false, numbers: false, cellStyle: 'card', title: `${pack} — Full catalog` }, { w: 1920, h: 1080 }, bg)[0],
  },
  {
    id: 'catalog-4k',
    name: 'Catalog 4K',
    group: 'Catalogs',
    w: 3840,
    h: 2160,
    description: 'Every icon, numbered and named, on a 3840×2160 page.',
    build: (assets, pack, bg) => buildCatalogPages(assets, { ...DEFAULT_CATALOG, title: `${pack} — Full catalog` }, { w: 3840, h: 2160 }, bg)[0],
  },
  {
    id: 'catalog-portrait',
    name: 'Catalog Portrait',
    group: 'Catalogs',
    w: 1080,
    h: 1350,
    description: 'Tall catalog page for social posts — every icon, grouped by category.',
    build: (assets, pack, bg) => buildCatalogPages(assets, { ...DEFAULT_CATALOG, margin: 50, labels: false, numbers: false, title: `${pack} — ${assets.length} icons` }, { w: 1080, h: 1350 }, bg)[0],
  },
  {
    id: 'catalog-cover',
    name: 'Catalog Cover 630×500',
    group: 'Catalogs',
    w: 630,
    h: 500,
    description: 'Every icon in a tidy sheet at itch.io cover size.',
    build: (assets, pack, bg) => buildCatalogPages(assets, { ...DEFAULT_CATALOG, margin: 22, spacing: 4, fill: 0.9, labels: false, numbers: false, headers: false, cellStyle: 'none', cellBackground: false, title: packTitle(pack) }, { w: 630, h: 500 }, bg)[0],
  },
  {
    id: 'catalog',
    name: 'Full Asset Catalog',
    w: 3000,
    h: 3000,
    description: 'Every asset, numbered and labelled.',
    build(assets, pack, bg) {
      const pages = buildCatalogPages(assets, { ...DEFAULT_CATALOG, title: `${pack} — Full catalog` }, { w: 3000, h: 3000 }, bg);
      return pages[0];
    },
  },
  {
    id: 'category',
    name: 'Category Preview',
    w: 1920,
    h: 1080,
    description: 'Category title with a clean row layout.',
    build(assets, pack, bg) {
      let p = createPage('Category', 1920, 1080, bg);
      p.safeZone = { enabled: true, top: 20, right: 4, bottom: 5, left: 4 };
      const cat = assets[0]?.category || 'Category';
      p.objects = [titleText(p, cat.toUpperCase(), 110, 88, { stroke: { enabled: true, color: '#111318', width: 8 } }), titleText(p, `${pack} · ${assets.length} assets`, 180, 32, { fontFamily: 'Bahnschrift', fontWeight: 500, fill: '#cbd5e1' })];
      p = placeAssets(p, assets, { algorithm: 'grid' }, 0.12);
      return p;
    },
  },
  {
    id: 'portrait',
    name: 'Portrait Promotional',
    w: 1080,
    h: 1350,
    description: 'Tall promo: title on top, perspective floor below.',
    build(assets, pack, bg) {
      let p = createPage('Portrait promo', 1080, 1350, bg);
      p.safeZone = { enabled: true, top: 24, right: 3, bottom: 3, left: 3 };
      p.objects = [titleText(p, pack.toUpperCase(), 150, 96, { stroke: { enabled: true, color: '#111318', width: 8 } }), titleText(p, `${assets.length || 120} GAME ICONS`, 245, 40, { fontFamily: 'Bahnschrift', fontWeight: 600, letterSpacing: 5, fill: '#f5c542' })];
      p = placeAssets(p, assets, { algorithm: 'floor' }, 0.1);
      return p;
    },
  },
  {
    id: 'feature',
    name: 'Feature Highlights',
    w: 1920,
    h: 1080,
    description: 'A few hand-picked icons, big, with the title above.',
    build(assets, pack, bg) {
      let p = createPage('Feature highlights', 1920, 1080, bg);
      p.safeZone = { enabled: true, top: 4, right: 4, bottom: 5, left: 4 };
      p.objects = [titleText(p, packTitle(pack), 130, 100, { stroke: { enabled: true, color: '#111318', width: 9 } }), presetText('Spec chip', `${countToken(assets)} ICONS IN THE FULL PACK`, 960, 228, 0.8)];
      p = placeAssets(p, assets.slice(0, 9), { algorithm: 'heroshowcase', params: { title: 'top', titleSize: 0.26 } }, 0.16);
      return p;
    },
  },
  {
    id: 'compare',
    name: 'Color & Grayscale Preview',
    w: 1920,
    h: 1080,
    description: 'The same icons in colour and in grayscale, side by side.',
    build(assets, _pack, bg) {
      return buildComparePage(assets.slice(0, 40), { w: 1920, h: 1080, axis: 'side', look: 'gray', labels: ['COLOR', 'GRAYSCALE'] }, bg);
    },
  },
  {
    id: 'demo',
    name: 'Free Demo Preview',
    w: 1920,
    h: 1080,
    description: 'What is in the free sample, with a FREE DEMO badge.',
    build(assets, pack, bg) {
      let p = createPage('Free demo', 1920, 1080, bg);
      p.safeZone = { enabled: true, top: 22, right: 6, bottom: 6, left: 6 };
      const sample = assets.slice(0, 12);
      p.objects = [titleText(p, `${packWord(pack).toUpperCase()} ICONS — DEMO`, 120, 92, { stroke: { enabled: true, color: '#111318', width: 8 } }), titleText(p, `${sample.length || 12} free icons · get all ${countToken(assets)} in the full pack`, 205, 36, { fontFamily: 'Segoe UI', fontWeight: 600, fill: '#d9dde4' })];
      p = placeAssets(p, sample, { algorithm: 'grid', params: { gap: 36 } }, 0.12);
      return { ...p, objects: [...p.objects, presetText('Demo seal', 'FREE\nDEMO', 1775, 130, 1.05)] };
    },
  },
  {
    id: 'versus',
    name: 'Product Comparison',
    w: 1920,
    h: 1080,
    description: 'Two groups either side of a central label — free vs full, set A vs set B.',
    build(assets, _pack, bg) {
      let p = createPage('Comparison', 1920, 1080, bg);
      p.safeZone = { enabled: true, top: 16, right: 3, bottom: 5, left: 3 };
      const half = Math.ceil(assets.length / 2);
      p.objects = [
        titleText(p, 'FREE', 110, 64, { fontFamily: 'Segoe UI Black' }, 0.4),
        titleText(p, 'FULL PACK', 110, 64, { fontFamily: 'Segoe UI Black', fill: '#ffd23f' }, 0.4),
        presetText('Count burst', 'VS', 960, 560, 0.9),
      ];
      // put the two headings over their halves
      p.objects[0] = { ...p.objects[0], x: 1920 * 0.2 };
      p.objects[1] = { ...p.objects[1], x: 1920 * 0.8 };
      p = placeAssets(p, assets, { algorithm: 'dualcluster', params: { split: 'halves', balance: half / Math.max(1, assets.length), center: 0.22 } }, 0.12);
      return p;
    },
  },
  {
    id: 'banner',
    name: 'Promotional Banner',
    w: 1920,
    h: 640,
    description: 'Wide launch / sale banner: title on the left, icons flowing right.',
    build(assets, pack, bg) {
      let p = createPage('Banner', 1920, 640, bg);
      p.safeZone = { enabled: true, top: 6, right: 3, bottom: 6, left: 3 };
      const t = titleText(p, packTitle(pack), 280, 84, { stroke: { enabled: true, color: '#111318', width: 8 } }, 0.42);
      p.objects = [{ ...t, x: 1920 * 0.25 }, { ...presetText('Sale', 'LAUNCH SALE −30%', 1920 * 0.25, 420, 0.8) }];
      p = placeAssets(p, assets, { algorithm: 'split', params: { side: 'right', share: 0.55, style: 'stagger' } }, 0.1);
      return p;
    },
  },
  {
    id: 'cards-wide',
    name: 'Card Grid Showcase',
    w: 1920,
    h: 1080,
    description: 'Twelve icons on rounded cards in two rows, title on top.',
    build: (assets, pack, bg) => cardCover(assets, pack, bg, 1920, 1080, 6, 2),
  },
  {
    id: 'stickers-wide',
    name: 'Sticker Showcase',
    w: 1920,
    h: 1080,
    description: 'Tilted sticker icons scattered around a bubbly title.',
    build: (assets, pack, bg) => stickerCover(assets, pack, bg, 1920, 1080),
  },
  {
    id: 'floor-cover',
    name: 'Endless Floor Cover',
    w: 630,
    h: 500,
    description: 'Pixel title over a field of icons that runs off the edges.',
    build: (assets, pack) => floorCover(assets, pack, 630, 500),
  },
  {
    id: 'wall-cover',
    name: 'Tilted Wall Cover',
    w: 630,
    h: 500,
    description: 'Tilted wall of icons filling the cover, title on a panel.',
    build: (assets, pack) => wallCover(assets, pack, 630, 500),
  },
  {
    id: 'frame-cover',
    name: 'Pixel Frame Cover',
    w: 630,
    h: 500,
    description: 'Big pixel title, large icons cut off around the border.',
    build: (assets, pack) => frameCover(assets, pack, 630, 500),
  },
  {
    id: 'floor-wide',
    name: 'Endless Floor (wide)',
    w: 1920,
    h: 1080,
    description: 'Wide version: icons recede to a horizon under the title.',
    build: (assets, pack) => floorCover(assets, pack, 1920, 1080),
  },
  {
    id: 'wall-wide',
    name: 'Tilted Wall (wide)',
    w: 1920,
    h: 1080,
    description: 'Wide version: tilted icon wall behind a title panel.',
    build: (assets, pack) => wallCover(assets, pack, 1920, 1080),
  },
  {
    id: 'cover-band',
    name: 'Title Band Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Tilted icon wall with a bold band across the middle for the title.',
    build(assets, pack) {
      let p = createPage('Title band', 630, 500, wallBg());
      const k = 500 / 1080;
      const band = createShape('rect', 315, 250, 630, 150, { fill: '#0d0a1c', opacity: 0.88, name: 'Title band' });
      const title = presetText('Pixel title', `${packWord(pack).toUpperCase()} ICONS`, 315, 235, k * 1.05);
      const fit = title.w > 600 ? { ...title, style: scaleTextStyle(title.style, 600 / title.w) as TextStyle, w: 600, h: title.h * (600 / title.w) } : title;
      const sub = presetText('Pixel label', `${countToken(assets)}+ ICONS`, 315, 295, k * 1.2);
      p.objects = [band, fit, sub];
      p = placeAssets(p, assets, { algorithm: 'tiltwall', params: { angle: -10, gap: 0.25 }, avoidFocal: false }, 0.1);
      return p;
    },
  },
  {
    id: 'cover-stickers',
    name: 'Sticker Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Icons as tilted stickers scattered around a bubbly title.',
    build: (assets, pack, bg) => stickerCover(assets, pack, bg, 630, 500),
  },
  {
    id: 'cover-grid',
    name: 'Clean Grid Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Neat grid of icons under a header panel — tidy and readable.',
    build(assets, pack, bg) {
      let p = createPage('Grid cover', 630, 500, bg);
      p.safeZone = { enabled: true, top: 24, right: 4, bottom: 4, left: 4 };
      const panel = createShape('rect', 315, 60, 590, 92, { fill: '#000000', opacity: 0.45, radius: 14, name: 'Header panel' });
      p.objects = [panel, titleText(p, packTitle(pack), 50, 40, { stroke: { enabled: true, color: '#111318', width: 4 } }, 0.9), titleText(p, `${countToken(assets)}+ ICONS`, 88, 18, { fontFamily: 'Bahnschrift', fontWeight: 600, letterSpacing: 3, fill: '#f5c542' })];
      p = placeAssets(p, assets.slice(0, 30), { algorithm: 'grid', params: { gap: 10 } }, 0.1);
      return p;
    },
  },
  {
    id: 'cover-cards',
    name: 'Card Grid Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Eight standout icons on rounded cards under the title.',
    build: (assets, pack, bg) => cardCover(assets, pack, bg, 630, 500, 4, 2),
  },
  {
    id: 'cover-shelves',
    name: 'Shelf Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Big icons standing on three shelves under the title.',
    build: (assets, pack, bg) => shelfCover(assets, pack, bg, 630, 500),
  },
  {
    id: 'cover-ribbon',
    name: 'Ribbon Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Tilted icon wall crossed by a diagonal ribbon with the title.',
    build: (assets, pack) => ribbonCover(assets, pack, 630, 500),
  },
  {
    id: 'cover-count',
    name: 'Big Count Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'The icon count as a huge pixel number, icons around the border.',
    build: (assets, pack, bg) => countCover(assets, pack, bg, 630, 500),
  },
  {
    id: 'cover-split',
    name: 'Split Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Stacked title on the left, a cluster of icons on the right.',
    build: (assets, pack, bg) => splitCover(assets, pack, bg, 630, 500),
  },
  {
    id: 'cover-honey',
    name: 'Honeycomb Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'A full honeycomb of icons with a window for the title.',
    build: (assets, pack, bg) => honeyCover(assets, pack, bg, 630, 500),
  },
  {
    id: 'cover-ring',
    name: 'Ring Cover (small)',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'An oval ring of icons around the title.',
    build: (assets, pack, bg) => ringCover(assets, pack, bg, 630, 500),
  },
  {
    id: 'cover-split-grid',
    name: 'Split Grid Cover',
    group: 'itch.io covers',
    w: 630,
    h: 500,
    description: 'Stacked title on the left, a neat grid of icons on the right.',
    build: (assets, pack, bg) => splitCover(assets, pack, bg, 630, 500, 'grid'),
  },
  {
    id: 'demo-split',
    name: 'Demo · Split Grid',
    group: 'Free demos',
    w: 630,
    h: 500,
    description: '“FREE DEMO” title on the left, nine icons in a grid on the right.',
    build: (assets, pack, bg) => splitCover(assets, pack, bg, 630, 500, 'grid', 9),
  },
  {
    id: 'demo-cards',
    name: 'Demo · Cards',
    group: 'Free demos',
    w: 630,
    h: 500,
    description: 'Six demo icons on rounded cards, FREE DEMO seal.',
    build: (assets, pack, bg) => cardCover(assets, pack, bg, 630, 500, 3, 2, 6),
  },
  {
    id: 'demo-shelf',
    name: 'Demo · Shelves',
    group: 'Free demos',
    w: 630,
    h: 500,
    description: 'Eight demo icons on two shelves, FREE DEMO seal.',
    build: (assets, pack, bg) => shelfCover(assets, pack, bg, 630, 500, 8),
  },
  {
    id: 'demo-stickers',
    name: 'Demo · Stickers',
    group: 'Free demos',
    w: 630,
    h: 500,
    description: 'Ten demo icons as stickers around the title.',
    build: (assets, pack, bg) => stickerCover(assets, pack, bg, 630, 500, 10),
  },
  {
    id: 'demo-split-wide',
    name: 'Demo · Split Grid (wide)',
    group: 'Free demos',
    w: 1920,
    h: 1080,
    description: 'Wide demo: title left, twelve icons in a grid on the right.',
    build: (assets, pack, bg) => splitCover(assets, pack, bg, 1920, 1080, 'grid', 12),
  },
  {
    id: 'demo-cards-wide',
    name: 'Demo · Cards (wide)',
    group: 'Free demos',
    w: 1920,
    h: 1080,
    description: 'Wide demo: eight icons on cards in two rows.',
    build: (assets, pack, bg) => cardCover(assets, pack, bg, 1920, 1080, 4, 2, 8),
  },
  {
    id: 'split-left',
    name: 'Title Left, Icons Right',
    w: 1920,
    h: 1080,
    description: 'Big stacked title on the left, a staggered icon grid on the right.',
    build(assets, pack, bg) {
      let p = createPage('Split', 1920, 1080, bg);
      const t = titleText(p, `${packWord(pack).toUpperCase()}\nICON\nPACK`, 470, 140, { lineHeight: 0.95, stroke: { enabled: true, color: '#111318', width: 10 } }, 0.42);
      p.objects = [{ ...t, x: 1920 * 0.24 }, { ...presetText('Count pill', `${countToken(assets)}+ ICONS`, 1920 * 0.24, 790, 1), x: 1920 * 0.24 }];
      p = placeAssets(p, assets, { algorithm: 'split', params: { side: 'right', share: 0.55, style: 'stagger' } }, 0.1);
      return p;
    },
  },
  {
    id: 'diagonal',
    name: 'Diagonal Flow',
    w: 1920,
    h: 1080,
    description: 'Icons stream diagonally across the page, title in the top-left.',
    build(assets, pack, bg) {
      let p = createPage('Diagonal', 1920, 1080, bg);
      // title across the top, the flow fills the rest
      p.safeZone = { enabled: true, top: 26, right: 2, bottom: 2, left: 2 };
      p.objects = [titleText(p, packTitle(pack), 120, 100, { stroke: { enabled: true, color: '#111318', width: 9 } }, 0.8), presetText('Count pill', `${countToken(assets)}+ ICONS`, 960, 215, 0.95)];
      p = placeAssets(p, assets, { algorithm: 'diagonal', params: { growth: 0.6, angle: 18 } }, 0.1);
      return p;
    },
  },
  {
    id: 'dual',
    name: 'Two Groups',
    w: 1920,
    h: 1080,
    description: 'Two organic groups left and right, title in the middle.',
    build(assets, pack, bg) {
      let p = createPage('Two groups', 1920, 1080, bg);
      p.objects = [titleText(p, `${countToken(assets)}\n${packWord(pack).toUpperCase()}\nICONS`, 520, 104, { lineHeight: 0.98, stroke: { enabled: true, color: '#111318', width: 9 } }, 0.3)];
      p = placeAssets(p, assets, { algorithm: 'dualcluster', params: { center: 0.34 } }, 0.1);
      return p;
    },
  },
  {
    id: 'honeycomb',
    name: 'Honeycomb Wall',
    w: 1920,
    h: 1080,
    description: 'A full honeycomb of icons with a clear window for the title.',
    build(assets, pack, bg) {
      let p = createPage('Honeycomb', 1920, 1080, bg);
      p.focal = { enabled: true, shape: 'ellipse', x: 960, y: 540, w: 1080, h: 380 };
      p.objects = [titleText(p, iconsTitle(pack, assets.length), 520, 104, { stroke: { enabled: true, color: '#111318', width: 10 } }, 0.55), presetText('Count pill', `${countToken(assets)}+ ICONS`, 960, 630, 1)];
      p = placeAssets(p, assets, { algorithm: 'honeycomb' }, 0.1);
      return p;
    },
  },
  {
    id: 'insta-post',
    name: 'Instagram Post',
    group: 'Square & social',
    w: 1080,
    h: 1080,
    description: 'Square post: title on top, tidy grid, count sticker.',
    build(assets, pack, bg) {
      let p = createPage('Instagram post', 1080, 1080, bg);
      p.safeZone = { enabled: true, top: 20, right: 5, bottom: 5, left: 5 };
      p.objects = [titleText(p, packTitle(pack), 110, 84, { stroke: { enabled: true, color: '#111318', width: 8 } }), presetText('Pixel count', `${countToken(assets)}+ ICONS!`, 540, 190, 1.2)];
      p = placeAssets(p, assets.slice(0, 36), { algorithm: 'grid', params: { gap: 20 } }, 0.1);
      return p;
    },
  },
  {
    id: 'story',
    name: 'Story / Reel',
    group: 'Square & social',
    w: 1080,
    h: 1920,
    description: 'Tall story: title in the top third, a field of icons below.',
    build(assets, pack) {
      let p = createPage('Story', 1080, 1920, floorBg());
      const t = presetText('Pixel harvest', `${packWord(pack).toUpperCase()}\nICONS`, 540, 330, 1.7);
      const fit = t.w > 1000 ? { ...t, style: scaleTextStyle(t.style, 1000 / t.w) as TextStyle, w: 1000, h: t.h * (1000 / t.w) } : t;
      p.objects = [fit, { ...presetText('Pixel count', `${countToken(assets)}+ ICONS`, 540, 600, 1.8) }];
      p.focal = { enabled: true, shape: 'rect', x: 540, y: 400, w: 1200, h: 620 };
      p = placeAssets(p, assets, { algorithm: 'tiltwall', params: { angle: -10, turn: false, size: 1, gap: 0.06, bleed: 0.08, persp: 0.3 }, avoidFocal: true }, 0.1);
      return p;
    },
  },
  {
    id: 'square-pixel',
    name: 'Pixel Frame Square',
    group: 'Square & social',
    w: 1080,
    h: 1080,
    description: 'Big pixel title, large icons cut off around the border.',
    build: (assets, pack) => frameCover(assets, pack, 1080, 1080),
  },
  {
    id: 'steam-header',
    name: 'Steam Header Capsule',
    group: 'Banners & headers',
    w: 920,
    h: 430,
    description: 'Title on the left, icons on the right — the Steam header size.',
    build(assets, pack, bg) {
      let p = createPage('Steam header', 920, 430, bg);
      const t = titleText(p, `${packWord(pack).toUpperCase()}\nICONS`, 200, 64, { lineHeight: 0.95, stroke: { enabled: true, color: '#111318', width: 6 } }, 0.42);
      p.objects = [{ ...t, x: 920 * 0.24 }];
      p = placeAssets(p, assets, { algorithm: 'split', params: { side: 'right', share: 0.56, style: 'cluster' } }, 0.12);
      return p;
    },
  },
  {
    id: 'yt-thumb',
    name: 'YouTube Thumbnail',
    group: 'Banners & headers',
    w: 1280,
    h: 720,
    description: 'Huge readable title with big icons around the edge.',
    build: (assets, pack) => frameCover(assets, pack, 1280, 720),
  },
  {
    id: 'wide-band',
    name: 'Launch Banner Strip',
    group: 'Banners & headers',
    w: 1920,
    h: 640,
    description: 'Tilted icon wall behind a centred band with the title.',
    build(assets, pack) {
      let p = createPage('Banner strip', 1920, 640, wallBg());
      const band = createShape('rect', 960, 320, 1920, 220, { fill: '#0d0a1c', opacity: 0.88, name: 'Title band' });
      const t = presetText('Pixel title', packTitle(pack), 960, 300, 0.95);
      const fit = t.w > 1700 ? { ...t, style: scaleTextStyle(t.style, 1700 / t.w) as TextStyle, w: 1700, h: t.h * (1700 / t.w) } : t;
      p.objects = [band, fit, presetText('Pixel label', `${countToken(assets)}+ ICONS · OUT NOW`, 960, 385, 1.3)];
      p = placeAssets(p, assets, { algorithm: 'tiltwall', params: { angle: -12, gap: 0.25 }, avoidFocal: false }, 0.1);
      return p;
    },
  },
  {
    id: 'ring',
    name: 'Ring Cover',
    w: 1920,
    h: 1080,
    description: 'Icons ring the canvas; the title sits in the free center.',
    build(assets, pack, bg) {
      let p = createPage('Ring', 1920, 1080, bg);
      p.objects = [titleText(p, iconsTitle(pack, assets.length), 515, 96, { stroke: { enabled: true, color: '#111318', width: 8 } }, 0.44), presetText('Count pill', `${countToken(assets)}+ ICONS`, 960, 610, 1)];
      p = placeAssets(p, assets.slice(0, 48), { algorithm: 'ring', params: { shape: 'oval', rings: assets.length > 40 ? 2 : 1, inset: 0.03, fill: 0.8 } }, 0.12);
      return p;
    },
  },
];

export function packNameGuess(): string {
  const doc = getDoc();
  const roots = new Set(doc.assets.map((a) => a.folder.split('/')[0]).filter(Boolean));
  if (roots.size === 1) return [...roots][0].replace(/[_-]+/g, ' ').replace(/^\d+\s*/, '').split(' ').slice(0, 3).join(' ');
  const named = doc.name.replace(/\b(cover|thumbnail|banner|hero|page|promo|copy|\d+)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (named && !/^untitled/i.test(named)) return named;
  // several dropped folders (e.g. one per category): use the most common first word
  const words = new Map<string, number>();
  for (const r of roots) {
    const w = r.replace(/^\d+[\s._-]*/, '').split(/[\s_-]+/)[0];
    if (w && w.length > 2) words.set(w, (words.get(w) ?? 0) + 1);
  }
  const top = [...words].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 1 ? top[0] : 'Game';
}

/** Background templates start from: the current page's, unless it is transparent. */
function templateBackground(bg?: Background): Background {
  // a neutral studio backdrop; themes (on by default in the Templates tab) restyle it
  const b = bg ?? BACKGROUND_PRESETS[4].bg();
  return b.type === 'transparent' ? BACKGROUND_PRESETS[4].bg() : b;
}

/** Build a template page without adding it (previews). Uses up to `limit` assets to stay fast. */
export function previewTemplate(t: TemplateDef, assets: AssetRecord[], bg?: Background, limit = 120, opts: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS): Page {
  return applyTemplateOptions(t.build(assets.slice(0, limit), packNameGuess(), templateBackground(bg)), opts);
}

/** Build a page from a built-in template, remembering what it was made from (so options can re-apply live). */
export function buildTemplatePage(t: TemplateDef, assets: AssetRecord[], pack: string, opts: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS, bg: Background = templateBackground(), ui?: TemplatePageOptions): Page {
  const { page, keys } = keyTemplateObjects(applyTemplateOptions(t.build(assets, pack, bg), opts));
  const choices: TemplatePageOptions = ui ?? { size: '', themeId: opts.theme?.id ?? 'none', themeParts: opts.themeParts ?? 'all', text: opts.text, icons: opts.icons };
  return { ...page, fromTemplate: { id: t.id, assetIds: assets.map((a) => a.id), keys, opts: optsSig(opts), ui: choices } };
}

/**
 * Rebuild a page made from a built-in template with new options (format, look, text, icon size).
 * The fresh build is merged into the page (state/templateMerge.ts): typed text, added objects,
 * deletions and anything an unchanged option controls stay as the user left them.
 * Rapid changes merge into one undo step.
 */
export function reapplyTemplate(pageId: string, ui: TemplatePageOptions, theme: Theme | undefined) {
  const cur = getDoc().pages.find((p) => p.id === pageId);
  const t = cur?.fromTemplate && BUILTIN_TEMPLATES.find((x) => x.id === cur.fromTemplate!.id);
  if (!cur || !t) return;
  const prevUi = pageTemplateOptions(cur, formatLabelOfSig);
  const same = (Object.keys(ui) as (keyof TemplatePageOptions)[]).every((k) => ui[k] === prevUi[k]);
  if (same) return;
  // only a new Look or theme scope restyles colours; every other option leaves them as they are
  const themeChanged = ui.themeId !== prevUi.themeId || ui.themeParts !== prevUi.themeParts;
  const opts = toTemplateOptions(ui, theme);
  const assets = cur.fromTemplate!.assetIds.map((id) => getAsset(id)).filter((a): a is AssetRecord => !!a);
  const { page: built, keys } = keyTemplateObjects(applyTemplateOptions(t.build(assets, packNameGuess(), templateBackground()), opts));
  const sig = carrySig(cur.fromTemplate!.opts, optsSig(opts), themeChanged);
  const m = mergeTemplateRebuild(cur, built, keys, sig);
  // only the Look changed: a theme restyles, it never rearranges. Icons, layouts, the icon choice,
  // text and the page stay exactly as they are (pages from older versions, which a rebuild would
  // lay out again, included).
  const lookOnly = themeChanged && ui.size === prevUi.size && ui.icons === prevUi.icons && ui.text === prevUi.text;
  const restyled = lookOnly ? restyleOnly(cur, { ...m, fromTemplate: m.fromTemplate ?? cur.fromTemplate }) : m;
  const merged: Page = { ...restyled, fromTemplate: restyled.fromTemplate ? { ...restyled.fromTemplate, ...(lookOnly ? { opts: m.fromTemplate?.opts ?? restyled.fromTemplate.opts } : {}), ui } : restyled.fromTemplate };
  commit('Template options', (d) => withPage(d, () => merged, pageId), { key: 'tpl-live:' + pageId });
  // drop selected objects that the rebuild replaced
  const ids = new Set(merged.objects.map((o) => o.id));
  const sel = useUI.getState().selection;
  if (sel.some((id) => !ids.has(id))) select(sel.filter((id) => ids.has(id)));
  if (built.width !== cur.width || built.height !== cur.height) requestAnimationFrame(() => fitView(built.width, built.height));
}

/** Put a template page into the project: as a new page, or in place of the page you are on (Settings ▸ General). */
function placeTemplatePage(page: Page, label: string, target: 'new' | 'replace' | 'pref' = 'pref') {
  if (target === 'replace' || (target === 'pref' && usePrefs.getState().templateTarget === 'replace')) {
    const cur = getPage();
    // the words the user typed (title, subtitle…) move to the new template's matching text
    const next = applyContent(page, pageContent(cur));
    // same page (id and name), new content — one undo step brings the old one back
    commit(`Apply ${label}`, (d) => withPage(d, () => ({ ...next, id: cur.id, name: cur.name, exportName: cur.exportName })), { key: 'tpl-apply:' + Date.now() });
    requestAnimationFrame(() => fitView(page.width, page.height));
  } else addPages([page], `New ${label}`);
}

/** `target`: 'pref' follows Settings (Templates tab clicks); the New page dialog always adds a page. */
export function createFromTemplate(t: TemplateDef, assets: AssetRecord[], pack = packNameGuess(), opts: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS, target: 'new' | 'replace' | 'pref' = 'pref', ui?: TemplatePageOptions) {
  placeTemplatePage(buildTemplatePage(t, assets, pack, opts, undefined, ui), t.name, target);
  guideAction('template');
  if (assets.length) select([]);
}

// ---------------------------------------------------------------------------
// User templates
// ---------------------------------------------------------------------------

export interface TemplateData {
  page: Page;
}

/** A page as template data: layout (normalised, with slots), text and look; no images, no project references. */
export function templateDataFromPage(page: Page): TemplateData {
  const tl: TemplateLayout | undefined = page.layouts[0]
    ? { ...presetFromInstance(page.layouts[0], page), slots: page.layouts[0].slots.map((s) => ({ ...s, cx: s.cx / page.width, cy: s.cy / page.height, w: s.w / page.width, h: s.h / page.height })) }
    : page.templateLayout;
  const stripped: Page = {
    ...structuredClone(page),
    objects: page.objects.filter((o) => o.type !== 'image').map((o) => ({ ...o, layoutId: undefined, pinned: undefined })),
    layouts: [],
    background: page.background.type === 'image' ? { ...page.background, type: 'solid', image: { ...page.background.image, assetId: undefined } } : { ...page.background, image: { ...page.background.image, assetId: undefined } },
    templateLayout: tl,
    catalog: undefined,
    fromTemplate: undefined,
    userTemplateId: undefined,
    content: undefined,
  };
  return { page: stripped };
}

/** Save a page (the open one by default) as a reusable template. */
export async function saveCurrentAsTemplate(name: string, page: Page = getPage(), quiet = false) {
  const preset: StoredPreset<TemplateData> = { id: uid('tpl'), kind: 'template', name, createdAt: Date.now(), data: templateDataFromPage(page) };
  await db.putPreset(preset);
  await refreshPresets();
  if (!quiet) toast(`Saved template “${name}”`, 'success');
  return preset;
}

export function createFromUserTemplate(data: TemplateData, assets: AssetRecord[], target: 'new' | 'replace' | 'pref' = 'pref', id?: string) {
  let page = clonePage(data.page, data.page.name);
  if (assets.length && page.templateLayout) page = fillTemplateLayout(page, assets, 'regenerate');
  placeTemplatePage({ ...page, userTemplateId: id }, 'template', target);
  guideAction('template');
}

/** Build a page from a saved template without adding it (previews). */
export function previewUserTemplate(data: TemplateData, assets: AssetRecord[], limit = 120): Page {
  const page = clonePage(data.page, data.page.name);
  return assets.length && page.templateLayout ? fillTemplateLayout(page, assets.slice(0, limit), 'regenerate') : page;
}

/** Fill a page's pending template layout with assets (slot-preserving when slots exist). */
export function fillTemplateLayout(page: Page, assets: AssetRecord[], extras: 'ignore' | 'regenerate' | 'add'): Page {
  const tl = page.templateLayout;
  if (!tl) return page;
  const objs = assets.map((a) => newImageObject(a.id, { x: page.width / 2, y: page.height / 2 }, page, 0.12));
  const inst: LayoutInstance = { ...newInstance(tl.algorithm, objs.map((o) => o.id), page), ...instanceFromPreset(tl, page) };
  let p: Page = { ...page, templateLayout: undefined, objects: [...objs.map((o) => ({ ...o, layoutId: inst.id })), ...page.objects], layouts: [...page.layouts, inst] };
  const slots = (tl.slots ?? []).map((s) => ({ ...s, cx: s.cx * page.width, cy: s.cy * page.height, w: s.w * page.width, h: s.h * page.height }));
  if (!slots.length || (extras === 'regenerate' && objs.length > slots.length)) return runLayout(p, inst, { getAsset });
  return fillSlots(p, inst, slots, extras);
}

/** Put objects of `inst` into stored slots; extras: ignore (drop), add (place around), regenerate. */
function fillSlots(p: Page, inst: LayoutInstance, slots: LayoutInstance['slots'], extras: 'ignore' | 'regenerate' | 'add'): Page {
  const members = inst.objectIds.map((id) => p.objects.find((o) => o.id === id)).filter((o): o is ImageObject => !!o && o.type === 'image');
  const patches = new Map<string, Partial<SceneObject>>();
  members.slice(0, slots.length).forEach((o, i) => {
    const s = slots[i];
    const a = getAsset(o.assetId);
    patches.set(o.id, placeImageByVisibleBox(o, a, s.cx, s.cy, s.w, s.h, s.rot));
  });
  const extra = members.slice(slots.length);
  let objects = p.objects.map((o) => (patches.has(o.id) ? ({ ...o, ...patches.get(o.id) } as SceneObject) : o));
  if (extra.length && extras === 'ignore') {
    const drop = new Set(extra.map((o) => o.id));
    objects = objects.filter((o) => !drop.has(o.id));
    inst = { ...inst, objectIds: inst.objectIds.filter((id) => !drop.has(id)) };
    return { ...p, objects, layouts: p.layouts.map((l) => (l.id === inst.id ? { ...inst, slots } : l)) };
  }
  if (extra.length && extras === 'add') {
    // temporarily pin slot-filled objects so the algorithm places the extras around them
    const filled = new Set(members.slice(0, slots.length).map((o) => o.id));
    objects = objects.map((o) => (filled.has(o.id) ? { ...o, pinned: true } : o));
    let np = runLayout({ ...p, objects }, inst, { getAsset });
    np = { ...np, objects: np.objects.map((o) => (filled.has(o.id) ? { ...o, pinned: false } : o)) };
    return np;
  }
  return { ...p, objects, layouts: p.layouts.map((l) => (l.id === inst.id ? { ...inst, slots } : l)) };
}

/** "Fill template" on the active page with selected (or all) library assets. */
export function fillActiveTemplate(assets = workingAssets()) {
  const page = getPage();
  if (!page.templateLayout) return;
  commit('Fill template', (d) => withPage(d, (p) => fillTemplateLayout(p, assets, 'regenerate')));
}

// ---------------------------------------------------------------------------
// Catalog / category / marketplace set
// ---------------------------------------------------------------------------

/** Background for catalog pages: a named preset, else the current page's (a busy image would hurt readability). */
export function catalogBackground(name?: string): Background {
  const preset = name ? BACKGROUND_PRESETS.find((p) => p.name === name) : undefined;
  if (preset) return preset.bg();
  const bg = structuredClone(getPage().background);
  return bg.type === 'transparent' || bg.type === 'image' ? BACKGROUND_PRESETS[4].bg() : bg;
}

export function generateCatalog(assets: AssetRecord[], s: CatalogSettings, size: { w: number; h: number }, background?: string) {
  if (!assets.length) return toast('No assets to catalog', 'warning');
  const pages = buildCatalogPages(sortForCatalog(assets), s, size, catalogBackground(background));
  addPages(pages, 'Generate catalog');
  guideAction('catalog');
  toast(`Catalog: ${assets.length} assets on ${pages.length} page${pages.length > 1 ? 's' : ''}`, 'success');
}

export function sortForCatalog(a: AssetRecord[]) {
  return a.slice().sort((x, y) => x.category.localeCompare(y.category, undefined, { numeric: true }) || x.folder.localeCompare(y.folder) || x.name.localeCompare(y.name, undefined, { numeric: true }));
}

export function generateCategoryShowcase(categories: string[], algorithm: string, size: { w: number; h: number }, pack = packNameGuess()) {
  const assets = libraryAssets();
  const bg0 = structuredClone(getPage().background);
  const bg = bg0.type === 'transparent' ? BACKGROUND_PRESETS[4].bg() : bg0;
  const pages: Page[] = [];
  for (const cat of categories) {
    const list = assets.filter((a) => a.category === cat);
    if (!list.length) continue;
    let p = createPage(cat || 'Uncategorized', size.w, size.h, structuredClone(bg));
    p.safeZone = { enabled: true, top: 20, right: 4, bottom: 5, left: 4 };
    const s = Math.min(size.w, size.h);
    p.objects = [titleText(p, (cat || 'Uncategorized').toUpperCase(), size.h * 0.09, s * 0.085, { stroke: { enabled: true, color: '#111318', width: s * 0.008 } }), titleText(p, `${pack} · ${list.length} assets`, size.h * 0.165, s * 0.032, { fontFamily: 'Bahnschrift', fontWeight: 500, fill: '#cbd5e1' })];
    p = placeAssets(p, list, { algorithm }, 0.12);
    pages.push(p);
  }
  if (!pages.length) return toast('No assets in the chosen categories', 'warning');
  addPages(pages, 'Category showcase');
  toast(`Created ${pages.length} category page${pages.length > 1 ? 's' : ''}`, 'success');
}

export interface MarketplaceOptions {
  pack: string;
  hero: boolean;
  heroLayout: string;
  heroCount: number;
  cover: boolean;
  catalog: boolean;
  categories: boolean;
  balanced: boolean;
}

export function createMarketplaceSet(o: MarketplaceOptions) {
  const all = libraryAssets();
  if (!all.length) return toast('Import assets first', 'warning');
  const bg0 = structuredClone(getPage().background);
  const bg = bg0.type === 'transparent' ? BACKGROUND_PRESETS[4].bg() : bg0;
  const seed = Math.floor(Math.random() * 1e6);
  const heroSet = pickRandom(all, Math.min(o.heroCount, all.length), o.balanced ? 'equal' : 'any', seed);
  const pages: Page[] = [];
  if (o.hero) {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === (o.heroLayout === 'floor' ? 'perspective' : 'hero'))!;
    const p = t.build(heroSet, o.pack, structuredClone(bg));
    p.name = 'Hero';
    p.exportName = 'hero';
    pages.push(p);
  }
  if (o.cover) {
    const p = BUILTIN_TEMPLATES.find((x) => x.id === 'square')!.build(pickRandom(all, Math.min(24, all.length), 'equal', seed + 1), o.pack, structuredClone(bg));
    p.name = 'Cover';
    p.exportName = 'cover';
    pages.push(p);
  }
  if (o.catalog) {
    const cps = buildCatalogPages(sortForCatalog(all), { ...DEFAULT_CATALOG, title: `${o.pack} — ${all.length} assets` }, { w: 3000, h: 3000 }, BACKGROUND_PRESETS[4].bg());
    cps.forEach((p, i) => (p.exportName = cps.length > 1 ? `catalog_${i + 1}` : 'catalog'));
    pages.push(...cps);
  }
  if (o.categories) {
    const cats = [...new Set(all.map((a) => a.category))].filter(Boolean);
    for (const cat of cats) {
      const list = all.filter((a) => a.category === cat);
      const p = BUILTIN_TEMPLATES.find((x) => x.id === 'category')!.build(list, o.pack, structuredClone(bg));
      p.name = cat;
      p.exportName = cat.toLowerCase().replace(/\s+/g, '_');
      pages.push(p);
    }
  }
  addPages(pages, 'Create marketplace set');
  guideAction('storeset');
  toast(`Created ${pages.length} pages`, 'success');
}

// ---------------------------------------------------------------------------
// Replace asset set
// ---------------------------------------------------------------------------

export interface ReplaceOptions {
  scope: 'page' | 'all';
  extras: 'ignore' | 'regenerate' | 'add';
  matchCategory: boolean;
  removeOld: boolean;
}

/**
 * Swap the images on pages for a new asset set while keeping layout, slots, perspective, text
 * and background. Each page draws from the new set in order (category-matched when possible).
 */
export function replaceAssetSet(newAssets: AssetRecord[], opts: ReplaceOptions): { replaced: number; oldIds: string[] } {
  const doc = getDoc();
  const scope = opts.scope === 'page' ? [doc.activePageId] : doc.pages.map((p) => p.id);
  const newIds = new Set(newAssets.map((a) => a.id));
  const oldIds = new Set<string>();
  let replaced = 0;
  const transform = (p: Page): Page => {
    if (p.catalog) {
      // catalogs are regenerated for the new set
      const pages = buildCatalogPages(sortForCatalog(newAssets), p.catalog, { w: p.width, h: p.height }, p.background, p.name);
      for (const o of p.objects) if (o.type === 'image') oldIds.add(o.assetId);
      replaced += newAssets.length;
      return { ...pages[0], id: p.id, name: p.name, exportName: p.exportName };
    }
    const pool = newAssets.slice();
    const take = (cat: string): AssetRecord | undefined => {
      if (opts.matchCategory) {
        const i = pool.findIndex((a) => a.category === cat);
        if (i >= 0) return pool.splice(i, 1)[0];
      }
      return pool.shift();
    };
    const patches = new Map<string, Partial<ImageObject>>();
    const remove = new Set<string>();
    const swap = (o: ImageObject) => {
      if (newIds.has(o.assetId)) return;
      const oldA = getAsset(o.assetId);
      oldIds.add(o.assetId);
      const na = take(oldA?.category ?? '');
      if (!na) {
        remove.add(o.id);
        return;
      }
      const vb = currentVisibleBox(o, oldA);
      const tmp = { ...o, assetId: na.id, flipX: o.flipX, flipY: o.flipY };
      patches.set(o.id, { assetId: na.id, name: na.name.replace(/\.[^.]+$/, ''), ...placeImageByVisibleBox(tmp, na, vb.cx, vb.cy, vb.w, vb.h, vb.rot) });
      replaced++;
    };
    // manual images first (often hand-placed heroes), then layouts in slot order
    for (const o of p.objects) if (o.type === 'image' && !o.layoutId) swap(o);
    for (const l of p.layouts) for (const id of l.objectIds) {
      const o = p.objects.find((x) => x.id === id);
      if (o && o.type === 'image') swap(o);
    }
    let np: Page = {
      ...p,
      objects: p.objects.filter((o) => !remove.has(o.id)).map((o) => (patches.has(o.id) ? ({ ...o, ...patches.get(o.id) } as SceneObject) : o)),
      layouts: p.layouts.map((l) => ({ ...l, objectIds: l.objectIds.filter((id) => !remove.has(id)) })).filter((l) => l.objectIds.length),
    };
    // extras → biggest layout on the page
    if (pool.length && opts.extras !== 'ignore' && np.layouts.length) {
      const target = np.layouts.reduce((a, b) => (b.objectIds.length > a.objectIds.length ? b : a));
      const objs = pool.map((a) => ({ ...newImageObject(a.id, { x: np.width / 2, y: np.height / 2 }, np, 0.1), layoutId: target.id }));
      const inst = { ...target, objectIds: [...target.objectIds, ...objs.map((o) => o.id)] };
      np = { ...np, objects: [...np.objects, ...objs], layouts: np.layouts.map((l) => (l.id === inst.id ? inst : l)) };
      replaced += objs.length;
      if (opts.extras === 'regenerate') np = runLayout(np, inst, { getAsset });
      else {
        // keep existing slots: pin them temporarily so only the extras are placed
        const wasFree = new Set(np.objects.filter((o) => target.objectIds.includes(o.id) && !o.pinned).map((o) => o.id));
        np = { ...np, objects: np.objects.map((o) => (wasFree.has(o.id) ? { ...o, pinned: true } : o)) };
        np = runLayout(np, inst, { getAsset });
        np = { ...np, objects: np.objects.map((o) => (wasFree.has(o.id) ? { ...o, pinned: false } : o)) };
      }
    } else if (!np.layouts.length && pool.length && p.templateLayout) np = fillTemplateLayout(np, pool, opts.extras);
    return np;
  };
  commit('Replace asset set', (d: ProjectDoc) => ({ ...d, pages: d.pages.map((p) => (scope.includes(p.id) ? transform(p) : p)) }));
  return { replaced, oldIds: [...oldIds].filter((id) => !newIds.has(id)) };
}

// ---------------------------------------------------------------------------
// Color vs Grayscale
// ---------------------------------------------------------------------------

export type CompareLook = 'gray' | 'locked' | 'silhouette';

export const COMPARE_FILTERS: Record<CompareLook, ImageFilter> = {
  gray: { grayscale: 1, brightness: 0 },
  locked: { grayscale: 1, brightness: -0.45 },
  silhouette: { grayscale: 0, brightness: 0, silhouette: true, silhouetteColor: '#0b0c0f' },
};

export interface CompareOptions {
  w: number;
  h: number;
  axis: 'side' | 'stack';
  look: CompareLook;
  /** Heading over each half; empty strings for none. */
  labels: [string, string];
  /** Grayscale strength 0…1 (gray and locked). */
  strength?: number;
}

/** A page with every asset twice: original colours in one half, the grayscale / locked / silhouette look in the other. */
export function buildComparePage(assets: AssetRecord[], o: CompareOptions, bg: Background): Page {
  let p = createPage(o.look === 'gray' ? 'Color vs grayscale' : o.look === 'locked' ? 'Unlocked vs locked' : 'Known vs unknown', o.w, o.h, bg);
  p.safeZone = { enabled: true, top: 4, right: 4, bottom: 4, left: 4 };
  if (!assets.length) return p;
  const filter: ImageFilter = { ...COMPARE_FILTERS[o.look] };
  if (o.look !== 'silhouette' && o.strength !== undefined) filter.grayscale = o.strength;
  const color = assets.map((a) => newImageObject(a.id, { x: o.w / 2, y: o.h / 2 }, p, 0.1));
  const other = assets.map((a): ImageObject => ({ ...newImageObject(a.id, { x: o.w / 2, y: o.h / 2 }, p, 0.1), filter }));
  const hasLabels = !!(o.labels[0] || o.labels[1]);
  const inst: LayoutInstance = newInstance('compare', [...color, ...other].map((x) => x.id), p, { params: { axis: o.axis, divide: 0.06, label: hasLabels ? 0.13 : 0, gap: 12, fill: 0.86 } });
  p = { ...p, objects: [...color, ...other].map((x) => ({ ...x, layoutId: inst.id })), layouts: [inst] };
  p = runLayout(p, inst, { getAsset });
  // headings and divider, matched to the layout's halves
  const a = safeRect(p);
  const side = o.axis === 'side';
  const div = (side ? a.w : a.h) * 0.06;
  const halves = side
    ? [
        { x: a.x, y: a.y, w: (a.w - div) / 2, h: a.h },
        { x: a.x + (a.w + div) / 2, y: a.y, w: (a.w - div) / 2, h: a.h },
      ]
    : [
        { x: a.x, y: a.y, w: a.w, h: (a.h - div) / 2 },
        { x: a.x, y: a.y + (a.h + div) / 2, w: a.w, h: (a.h - div) / 2 },
      ];
  const k = Math.min(o.w, o.h) / 1080;
  const extra: SceneObject[] = [];
  halves.forEach((r, i) => {
    const text = o.labels[i];
    if (!text) return;
    const t = presetText('Spec chip', text, r.x + r.w / 2, r.y + r.h * 0.065, 1.15 * k);
    extra.push(t);
  });
  const line = side ? createShape('line', a.x + a.w / 2, a.y + a.h / 2, a.h * 0.8, 0, { rotation: 90, stroke: '#ffffff', strokeWidth: 3 * k, opacity: 0.25, name: 'Divider' }) : createShape('line', a.x + a.w / 2, a.y + a.h / 2, a.w * 0.8, 0, { stroke: '#ffffff', strokeWidth: 3 * k, opacity: 0.25, name: 'Divider' });
  return { ...p, objects: [line, ...p.objects, ...extra] };
}

export function createComparePage(assets: AssetRecord[], o: CompareOptions) {
  const page = buildComparePage(assets, o, templateBackground());
  addPages([page], 'New comparison page');
  select([]);
}

// ---------------------------------------------------------------------------
// A template made for an existing page (scoped apply and previews)
// ---------------------------------------------------------------------------

/** The page's own icons (in paint order), else the working selection. */
export function pageAssets(p: Page): AssetRecord[] {
  const seen = new Set<string>();
  const out: AssetRecord[] = [];
  for (const o of p.objects)
    if (o.type === 'image' && !seen.has(o.assetId)) {
      seen.add(o.assetId);
      const a = getAsset(o.assetId);
      if (a) out.push(a);
    }
  return out.length ? out : workingAssets();
}

/** A built-in template built at `p`'s size with `p`'s icons. */
export function builtinForPage(t: TemplateDef, p: Page, opts: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS): Page {
  const sized = { ...opts, size: { w: p.width, h: p.height } };
  return applyTemplateOptions(t.build(pageAssets(p).slice(0, 400), packNameGuess(), templateBackground()), sized);
}

/** A saved template scaled to `p`'s size, filled with `p`'s icons. */
export function userTemplateForPage(data: TemplateData, p: Page): Page {
  let page = clonePage(data.page, data.page.name);
  page = reflowPage(page, p.width, p.height);
  if (page.templateLayout) page = fillTemplateLayout(page, pageAssets(p).slice(0, 400), 'regenerate');
  return page;
}

// ---------------------------------------------------------------------------
// Clean & professional templates
//
// Restrained layouts for store pages and catalogs: one clear title, one line of real facts about the
// pack (count, file format, sizes, categories — read from the assets, never invented), generous
// margins and upright icons. Each names the theme it is designed with, used when the Look is “auto”.
// ---------------------------------------------------------------------------

const PRO_SANS = 'Geist Variable';
const PRO_MONO = 'Geist Mono Variable';
const OFF = { enabled: false, color: '#000000', width: 2 };
const NO_SH = { enabled: false, color: '#000000', blur: 12, dx: 0, dy: 4, opacity: 0.3 };
const proStyle = (fill: string, size: number, weight = 650, extra: Partial<TextStyle> = {}): Partial<TextStyle> => ({
  fontFamily: PRO_SANS,
  fontWeight: weight,
  fontSize: size,
  fill,
  fillMode: 'solid',
  letterSpacing: size >= 56 ? -size * 0.015 : 0,
  lineHeight: 1.08,
  uppercase: false,
  stroke: OFF,
  stroke2: OFF,
  shadow: NO_SH,
  glow: { enabled: false, color: '#ffffff', blur: 20, opacity: 0.8 },
  extrude: { enabled: false, color: '#000000', depth: 10, angle: 90 },
  pixel: 0,
  ...extra,
});

/** "halloween" → "Halloween Icon Pack" (keeps names that already say pack, set, icons…). */
const packTitleCase = (pack: string) => {
  const base = /\b(pack|set|collection|bundle|kit|icons?|assets?|sprites?)\b/i.test(pack) ? pack : `${pack} icon pack`;
  return base.replace(/\s+/g, ' ').trim().replace(/\b([a-z])/g, (m) => m.toUpperCase());
};

/** Real facts about the icons: count, formats, size range, transparency. */
function packFacts(assets: AssetRecord[]): { formats: string; sizes: string; alpha: boolean; categories: string[] } {
  const formats = [...new Set(assets.map((a) => (a.format === 'jpeg' ? 'JPG' : a.format.toUpperCase())))].slice(0, 3).join(' · ');
  const dims = assets.map((a) => Math.max(a.width, a.height)).filter((v) => v > 0);
  const lo = dims.length ? Math.min(...dims) : 0,
    hi = dims.length ? Math.max(...dims) : 0;
  const sizes = !dims.length ? '' : lo === hi ? `${lo} px` : `${lo}–${hi} px`;
  const alpha = assets.length > 0 && assets.every((a) => a.alpha?.hasAlpha);
  const categories = [...new Set(assets.map((a) => a.category).filter(Boolean))];
  return { formats, sizes, alpha, categories };
}
const factLine = (assets: AssetRecord[]) => {
  const f = packFacts(assets);
  return [`${countToken(assets)} icons`, f.formats, f.sizes, f.alpha ? 'transparent' : ''].filter(Boolean).join(' · ');
};

/** Text with its left edge at `left`, shrunk to fit `maxW` (titles never run off the page). */
function leftText(text: string, left: number, y: number, style: Partial<TextStyle>, maxW: number) {
  const probe = createText(text, 0, y, { ...style, align: 'left' });
  const widthOf = (s: string) => Math.max(...s.split('\n').map((l) => naturalWidth(l, probe.style))) + probe.style.fontSize * 0.1;
  // a name too long for one line even at a smaller size breaks into two balanced lines
  if (!text.includes('\n') && widthOf(text) * 0.7 > maxW && text.includes(' ')) {
    const words = text.split(' ');
    let best = text,
      bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const two = `${words.slice(0, i).join(' ')}\n${words.slice(i).join(' ')}`;
      const w = widthOf(two);
      if (w < bestW) (best = two), (bestW = w);
    }
    text = best;
  }
  const t = createText(text, 0, y, { ...style, align: 'left' });
  const natural = widthOf(text);
  if (natural > maxW) {
    const k = maxW / natural;
    t.style = { ...t.style, fontSize: t.style.fontSize * k, letterSpacing: t.style.letterSpacing * k };
  }
  t.w = maxW;
  t.h = textHeight(t);
  t.x = left + maxW / 2;
  return t;
}
/** Centred text that fits `maxW`. */
function centerText(text: string, cx: number, y: number, style: Partial<TextStyle>, maxW: number) {
  const t = leftText(text, cx - maxW / 2, y, style, maxW);
  return { ...t, style: { ...t.style, align: 'center' as const } };
}
/** A small pill badge (themes give it their accent colour). */
function proChip(text: string, x: number, y: number, size: number, fill = '#111113', color = '#f4f4f5') {
  const t = createText(text, x, y, {
    ...proStyle(fill, size, 600),
    badge: { enabled: true, shape: 'pill', color, color2: color, gradient: false, padX: size * 0.8, padY: size * 0.42, radius: size, stroke: { enabled: false, color: '#000000', width: 2 }, points: 12 },
  });
  t.w = Math.ceil(naturalWidth(text, t.style) + size * 2);
  t.h = textHeight(t);
  return t;
}
/** Quiet rounded cells behind laid-out icons (catalog look). */
function softCells(p: Page, fill = '#ffffff', opacity = 0.045): Page {
  const inst = p.layouts[0];
  if (!inst) return p;
  const cells = inst.slots.map((sl, i) => {
    const s = Math.max(sl.w, sl.h) * 1.28;
    return createShape('rect', sl.cx, sl.cy, s, s, { fill, opacity, radius: s * 0.16, strokeWidth: 0, name: `Cell ${i + 1}` });
  });
  return { ...p, objects: [...cells, ...p.objects] };
}
const hairline = (x1: number, x2: number, y: number, k: number, color = '#ffffff') => createShape('line', (x1 + x2) / 2, y, x2 - x1, 2 * k, { stroke: color, strokeWidth: 2 * k, opacity: 0.18, fillEnabled: false, name: 'Rule' });

const DARK = '#f4f4f5',
  DARK_SUB = '#a1a1aa',
  LIGHT = '#17171a',
  LIGHT_SUB = '#52525b';
const studioDark = () => withLight(grad('radial', ['#2a2b30', '#0c0c0e'], 0.5, 0.4), '#ffffff', 0.12);
const studioLight = () => withLight(grad('radial', ['#f7f6f3', '#dedcd6'], 0.5, 0.42), '#ffffff', 0.35);
const paper = () => withPattern({ ...grad('linear', ['#f2ede3', '#f2ede3'], 0.5, 0.5, 180), type: 'solid', color: '#f2ede3' }, { kind: 'noise', color: '#5a4630', opacity: 0.05, scale: 1 });

export const PRO_TEMPLATES: TemplateDef[] = [
  {
    id: 'pro-minimal-cover',
    name: 'Minimal Product Cover',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 630,
    h: 500,
    description: 'Left-aligned title, one line of facts, a tidy grid of icons. Reads well as a small thumbnail.',
    build(assets, pack) {
      let p = createPage('Minimal cover', 630, 500, studioDark());
      p.safeZone = { enabled: true, top: 30, right: 6, bottom: 6, left: 6 };
      p.objects = [leftText(packTitleCase(pack), 38, 66, proStyle(DARK, 42), 554), leftText(factLine(assets), 38, 110, proStyle(DARK_SUB, 16, 450), 554)];
      return placeAssets(p, assets.slice(0, 15), { algorithm: 'grid', params: { complete: true, fill: 0.78, gapX: 14, gapY: 14, padding: 0 } }, 0.12);
    },
  },
  {
    id: 'pro-editorial',
    name: 'Editorial Showcase',
    group: 'Clean & professional',
    look: 'pro-editorial',
    w: 1920,
    h: 1080,
    description: 'Serif headline in a left column on paper, the icons in an even grid on the right.',
    build(assets, pack) {
      let p = createPage('Editorial', 1920, 1080, paper());
      p.safeZone = { enabled: true, top: 10, right: 6, bottom: 10, left: 46 };
      const word = packWord(pack).replace(/\b([a-z])/g, (m) => m.toUpperCase());
      p.objects = [
        leftText('Icon collection', 140, 300, proStyle(LIGHT_SUB, 30, 500, { fontFamily: PRO_MONO }), 640),
        hairline(140, 420, 350, 1, '#000000'),
        leftText(`${word}\nIcon Pack`, 140, 520, proStyle(LIGHT, 124, 700, { fontFamily: 'Georgia', letterSpacing: 0, lineHeight: 1.02 }), 680),
        leftText(factLine(assets), 140, 720, proStyle(LIGHT_SUB, 30, 450), 680),
      ];
      return placeAssets(p, assets.slice(0, 20), { algorithm: 'grid', params: { complete: true, fill: 0.74, gapX: 28, gapY: 28, padding: 0 } }, 0.12);
    },
  },
  {
    id: 'pro-catalog',
    name: 'Premium Icon Catalog',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'Every icon on a quiet cell, with a header line: title on the left, the count on the right.',
    build(assets, pack) {
      let p = createPage('Catalog', 1920, 1080, studioDark());
      p.safeZone = { enabled: true, top: 19, right: 5, bottom: 5, left: 5 };
      const count = createText(`${countToken(assets)} icons`, 0, 112, { ...proStyle(DARK_SUB, 30, 500, { fontFamily: PRO_MONO }), align: 'right' });
      count.w = 520;
      count.h = textHeight(count);
      count.x = 1920 - 96 - 260;
      p.objects = [leftText(packTitleCase(pack), 96, 112, proStyle(DARK, 64), 1100), count, hairline(96, 1824, 172, 1)];
      p = placeAssets(p, assets.slice(0, 120), { algorithm: 'grid', params: { fill: 0.66, gapX: 22, gapY: 22, padding: 0, square: true } }, 0.08);
      return softCells(p);
    },
  },
  {
    id: 'pro-feature-grid',
    name: 'Product Feature Grid',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'Title, one featured icon inside an even grid, and three facts read from your files.',
    build(assets, pack) {
      let p = createPage('Feature grid', 1920, 1080, studioDark());
      p.safeZone = { enabled: true, top: 24, right: 10, bottom: 21, left: 10 };
      const f = packFacts(assets);
      const facts: [string, string][] = [
        ['Icons', `${countToken(assets)}`],
        ['Format', f.formats || 'PNG'],
        ['Sizes', f.sizes || 'Any'],
      ];
      p.objects = [centerText(packTitleCase(pack), 960, 128, proStyle(DARK, 84), 1500), centerText(f.alpha ? `${f.formats || 'PNG'} icons on transparent backgrounds` : `${f.formats || 'PNG'} icons`, 960, 204, proStyle(DARK_SUB, 30, 450), 1400)];
      facts.forEach(([k, v], i) => {
        const x = 960 + (i - 1) * 440;
        p.objects.push(centerText(k, x, 902, proStyle(DARK_SUB, 24, 500, { fontFamily: PRO_MONO }), 380), centerText(v, x, 956, proStyle(DARK, 44, 600), 400));
      });
      return placeAssets(p, assets.slice(0, 14), { algorithm: 'feature', params: { span: '2', gap: 20, padding: 0, fill: 0.8 } }, 0.12);
    },
  },
  {
    id: 'pro-hero',
    name: 'Marketplace Hero',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'Title and facts on the left, a round cluster of icons filling the right half.',
    build(assets, pack) {
      let p = createPage('Marketplace hero', 1920, 1080, studioDark());
      p.safeZone = { enabled: true, top: 6, right: 4, bottom: 6, left: 4 };
      const title = leftText(packTitleCase(pack).replace(/ (Icon|Asset) /, '\n$1 '), 150, 470, proStyle(DARK, 112, 700, { lineHeight: 1.02 }), 720);
      p.objects = [title, leftText(factLine(assets), 150, 470 + title.h / 2 + 50, proStyle(DARK_SUB, 30, 450), 720)];
      return placeAssets(p, assets.slice(0, 40), { algorithm: 'split', params: { side: 'right', share: 0.52, style: 'cluster', gap: 22, fill: 0.86 } }, 0.12);
    },
  },
  {
    id: 'pro-type-cover',
    name: 'Typography Cover',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1080,
    h: 1080,
    description: 'The icon count set huge, the pack name beneath, a single row of icons at the bottom.',
    build(assets, pack) {
      let p = createPage('Typography cover', 1080, 1080, studioDark());
      p.safeZone = { enabled: true, top: 72, right: 8, bottom: 8, left: 8 };
      const num = leftText(`${countToken(assets)}`, 86, 300, proStyle(DARK, 340, 700, { letterSpacing: -12, lineHeight: 0.9 }), 900);
      p.objects = [num, leftText('icons', 92, 300 + num.h / 2 + 46, proStyle(DARK_SUB, 72, 500), 900), leftText(packTitleCase(pack), 92, 300 + num.h / 2 + 128, proStyle(DARK, 44, 600), 900)];
      return placeAssets(p, assets.slice(0, 6), { algorithm: 'grid', params: { rows: 1, columns: Math.min(6, Math.max(1, assets.length || 6)), fill: 0.8, gapX: 20, padding: 0 } }, 0.12);
    },
  },
  {
    id: 'pro-square-grid',
    name: 'Clean Square Grid',
    group: 'Clean & professional',
    look: 'pro-studio-light',
    w: 1080,
    h: 1080,
    description: 'Light studio square: centred title and a four-by-four grid. Good for social posts.',
    build(assets, pack) {
      let p = createPage('Square grid', 1080, 1080, studioLight());
      p.safeZone = { enabled: true, top: 24, right: 8, bottom: 8, left: 8 };
      p.objects = [centerText(packTitleCase(pack), 540, 120, proStyle(LIGHT, 64), 920), centerText(factLine(assets), 540, 186, proStyle(LIGHT_SUB, 24, 450), 920)];
      p = placeAssets(p, assets.slice(0, 16), { algorithm: 'grid', params: { columns: 4, rows: 4, fill: 0.74, gapX: 24, gapY: 24, padding: 0 } }, 0.12);
      return softCells(p, '#000000', 0.04);
    },
  },
  {
    id: 'pro-light-studio',
    name: 'Light Studio Showcase',
    group: 'Clean & professional',
    look: 'pro-studio-light',
    w: 1920,
    h: 1080,
    description: 'Warm light sweep, dark title above a round cluster — product-shot feel.',
    build(assets, pack) {
      let p = createPage('Light studio', 1920, 1080, studioLight());
      p.safeZone = { enabled: true, top: 26, right: 6, bottom: 6, left: 6 };
      p.objects = [centerText(packTitleCase(pack), 960, 140, proStyle(LIGHT, 96), 1500), centerText(factLine(assets), 960, 226, proStyle(LIGHT_SUB, 30, 450), 1400)];
      return placeAssets(p, assets.slice(0, 36), { algorithm: 'roundcluster' }, 0.17);
    },
  },
  {
    id: 'pro-dark-studio',
    name: 'Dark Studio Showcase',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'One hero icon in focus with the rest around it, title along the bottom.',
    build(assets, pack) {
      let p = createPage('Dark studio', 1920, 1080, studioDark());
      p.safeZone = { enabled: true, top: 5, right: 5, bottom: 22, left: 5 };
      p.objects = [centerText(packTitleCase(pack), 960, 928, proStyle(DARK, 80), 1500), centerText(factLine(assets), 960, 1000, proStyle(DARK_SUB, 26, 450), 1400)];
      return placeAssets(p, assets.slice(0, 30), { algorithm: 'hero', params: { heroCount: 1, heroScale: 0.4, density: 0.42, rotation: 0 } }, 0.12);
    },
  },
  {
    id: 'pro-detail',
    name: 'Icon Detail Showcase',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'Six to eight icons shown large, so buyers can see the detail.',
    build(assets, pack) {
      let p = createPage('Icon detail', 1920, 1080, studioDark());
      p.objects = [centerText(packTitleCase(pack), 960, 120, proStyle(DARK, 76), 1500), centerText(`A closer look · ${factLine(assets)}`, 960, 192, proStyle(DARK_SUB, 28, 450), 1400)];
      return placeAssets(p, assets.slice(0, 8), { algorithm: 'heroshowcase', params: { title: 'top', titleSize: 0.22 } }, 0.16);
    },
  },
  {
    id: 'pro-category',
    name: 'Category Collection',
    group: 'Clean & professional',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'A block per category under a left-aligned header listing the categories.',
    build(assets, pack) {
      let p = createPage('Categories', 1920, 1080, studioDark());
      p.safeZone = { enabled: true, top: 21, right: 5, bottom: 5, left: 5 };
      const cats = packFacts(assets).categories;
      p.objects = [leftText(packTitleCase(pack), 96, 104, proStyle(DARK, 64), 1200), leftText(cats.length ? cats.slice(0, 6).join(' · ') + (cats.length > 6 ? ` · ${cats.length - 6} more` : '') : factLine(assets), 96, 168, proStyle(DARK_SUB, 28, 450), 1600), hairline(96, 1824, 210, 1)];
      return placeAssets(p, assets.slice(0, 160), { algorithm: 'catblocks', params: { blockGap: 56, gap: 12, padding: 0, fill: 0.8, equal: true } }, 0.08);
    },
  },
  {
    id: 'pro-free-demo',
    name: 'Free Demo · Clean',
    group: 'Free demos',
    look: 'pro-studio-dark',
    w: 1920,
    h: 1080,
    description: 'What the free sample holds, a quiet FREE DEMO label and the size of the full pack.',
    build(assets, pack) {
      let p = createPage('Free demo', 1920, 1080, studioDark());
      p.safeZone = { enabled: true, top: 30, right: 12, bottom: 14, left: 12 };
      const n = Math.min(12, assets.length || 12);
      p.objects = [centerText(packTitleCase(pack), 960, 140, proStyle(DARK, 84), 1500), proChip('Free demo', 960, 246, 30), centerText(`${n} icons in this demo · full pack: ${countToken(assets)} icons`, 960, 980, proStyle(DARK_SUB, 30, 450), 1500)];
      return placeAssets(p, assets.slice(0, n), { algorithm: 'grid', params: { complete: true, fill: 0.76, gapX: 28, gapY: 28, padding: 0 } }, 0.12);
    },
  },
  {
    id: 'pro-banner',
    name: 'Minimal Banner',
    group: 'Banners & headers',
    look: 'pro-studio-dark',
    w: 1920,
    h: 480,
    description: 'Wide header strip: title and facts on the left, a neat grid of icons on the right.',
    build(assets, pack) {
      let p = createPage('Minimal banner', 1920, 480, studioDark());
      p.safeZone = { enabled: true, top: 12, right: 4, bottom: 12, left: 4 };
      p.objects = [leftText(packTitleCase(pack), 110, 210, proStyle(DARK, 72), 760), leftText(factLine(assets), 110, 286, proStyle(DARK_SUB, 26, 450), 760)];
      return placeAssets(p, assets.slice(0, 24), { algorithm: 'split', params: { side: 'right', share: 0.52, style: 'grid', gap: 16, fill: 0.82 } }, 0.1);
    },
  },
];
BUILTIN_TEMPLATES.push(...PRO_TEMPLATES);
