// Putting library assets onto the canvas.

import { createShape, createText } from '../core/defaults';
import type { ShapeObject, Vec } from '../core/types';
import { naturalWidth, textHeight } from '../render/text';
import { getDoc, getPage } from './doc';
import { fillActiveTemplate, libraryAssets, pickRandom } from './generators';
import { applyLayout } from './layoutActions';
import { addObjects, newImageObject, reorderSelection } from './objects';
import { usePrefs } from './prefs';
import { toast, useUI } from './ui';

export function addAssetsToCanvas(ids: string[], at?: Vec) {
  const page = getPage();
  const doc = getDoc();
  const valid = ids.filter((id) => doc.assets.some((a) => a.id === id && a.status !== 'error'));
  if (!valid.length) return;
  if (page.templateLayout && valid.length > 1) {
    fillActiveTemplate(doc.assets.filter((a) => valid.includes(a.id)));
    return;
  }
  const n = valid.length;
  const c = at ?? { x: page.width / 2, y: page.height / 2 };
  if (n === 1) {
    addObjects([newImageObject(valid[0], c, page, 0.3)], 'Add asset');
    return;
  }
  const frac = Math.max(0.05, Math.min(0.2, 0.75 / Math.sqrt(n)));
  const cols = Math.ceil(Math.sqrt(n * (page.width / page.height)));
  const step = Math.min(page.width, page.height) * frac * 1.1;
  const rows = Math.ceil(n / cols);
  const objs = valid.map((id, i) => {
    const r = Math.floor(i / cols),
      col = i % cols;
    return newImageObject(id, { x: c.x + (col - (cols - 1) / 2) * step, y: c.y + (r - (rows - 1) / 2) * step }, page, frac);
  });
  addObjects(objs, `Add ${n} assets`);
  if (!at && usePrefs.getState().addWithLayout) applyLayout('grid', objs.map((o) => o.id));
}

export function addSelectedAssets() {
  const sel = useUI.getState().librarySel;
  if (!sel.length) return toast('Select assets in the library first', 'warning');
  addAssetsToCanvas(sel);
}

export function addAllAssets() {
  const ids = libraryAssets().map((a) => a.id);
  if (!ids.length) return toast('Import assets first', 'warning');
  addAssetsToCanvas(ids);
}

export function addRandomAssets(n: number, mode: 'any' | 'equal' | 'weighted' = 'any', seed = Math.floor(Math.random() * 1e6)) {
  const pool = libraryAssets();
  const pick = pickRandom(pool, n, mode, seed);
  addAssetsToCanvas(pick.map((a) => a.id));
}

export function addTextAt(p: Vec, text = 'Your text', style?: Parameters<typeof createText>[3]) {
  const t = createText(text, p.x, p.y, style);
  t.w = Math.ceil(naturalWidth(text, t.style) + t.style.fontSize * 0.4);
  t.h = textHeight(t);
  addObjects([t], 'Add text');
  return t;
}

export type AddShapeKind = 'rect' | 'rounded' | 'circle' | 'ellipse' | 'line' | 'star' | 'triangle' | 'arrow' | 'burst' | 'heart' | 'diamond' | 'pentagon' | 'hexagon' | 'octagon' | 'ring' | 'plus' | 'bubble' | 'shield' | 'ribbon' | 'semicircle' | 'parallelogram' | 'bolt' | 'moon' | 'chevron';

export function addShape(kind: AddShapeKind, at?: Vec, size?: { w: number; h: number }) {
  const page = getPage();
  const c = at ?? { x: page.width / 2, y: page.height / 2 };
  const s = Math.min(page.width, page.height) * 0.25;
  const w = size?.w ?? (kind === 'line' ? s * 1.6 : kind === 'ellipse' ? s * 1.4 : s);
  const h = size?.h ?? s;
  let shape: ShapeObject;
  if (kind === 'rounded') shape = createShape('rect', c.x, c.y, w, h, { radius: Math.min(w, h) * 0.18 });
  else if (kind === 'circle') shape = createShape('ellipse', c.x, c.y, Math.min(w, h), Math.min(w, h));
  else if (kind === 'star' || kind === 'burst' || kind === 'heart') shape = createShape(kind, c.x, c.y, s, s, { fill: kind === 'heart' ? '#ef4444' : '#facc15' });
  else if (kind === 'arrow') shape = createShape('arrow', c.x, c.y, s * 1.4, s * 0.7, { fill: '#ffffff' });
  else if (kind === 'triangle') shape = createShape('triangle', c.x, c.y, s, s * 0.87);
  else if (kind === 'ribbon' || kind === 'parallelogram' || kind === 'chevron') shape = createShape(kind, c.x, c.y, s * 1.8, s * 0.5, { fill: kind === 'ribbon' ? '#e11d48' : '#378ef0' });
  else if (kind === 'semicircle') shape = createShape(kind, c.x, c.y, s * 1.4, s * 0.7);
  else if (kind === 'bubble') shape = createShape(kind, c.x, c.y, s * 1.3, s, { fill: '#ffffff' });
  else if (kind === 'bolt') shape = createShape(kind, c.x, c.y, s * 0.7, s, { fill: '#facc15' });
  else if (kind === 'moon') shape = createShape(kind, c.x, c.y, s, s, { fill: '#fde68a' });
  else if (kind === 'shield') shape = createShape(kind, c.x, c.y, s * 0.85, s, { fill: '#64748b' });
  else if (kind === 'diamond' || kind === 'pentagon' || kind === 'hexagon' || kind === 'octagon' || kind === 'ring' || kind === 'plus') shape = createShape(kind, c.x, c.y, s, s);
  else shape = createShape(kind, c.x, c.y, w, h);
  addObjects([shape], 'Add shape');
  return shape;
}

/** Ready-made decorative pieces sized for the current page. */
export const ELEMENT_PRESETS: { id: string; name: string; hint: string }[] = [
  { id: 'panel', name: 'Title panel', hint: 'Dark see-through panel to put behind a title' },
  { id: 'glow', name: 'Soft glow', hint: 'Blurred light behind your hero asset' },
  { id: 'floor', name: 'Floor shadow', hint: 'Soft shadow to stand assets on' },
  { id: 'frame', name: 'Frame', hint: 'Thin border inset from the page edge' },
  { id: 'band', name: 'Color band', hint: 'Full-width strip for a subtitle or call to action' },
  { id: 'divider', name: 'Divider', hint: 'Thin line to separate a title from its subtitle' },
  { id: 'silhouette', name: 'Silhouette zone', hint: 'Icons under it turn into dark silhouettes — move or resize it' },
  { id: 'fade', name: 'Fade zone', hint: 'Icons under it fade out, e.g. behind a title' },
  { id: 'grayzone', name: 'Grayscale zone', hint: 'Icons under it lose their colour' },
];

export function addElementPreset(id: string) {
  const page = getPage();
  const W = page.width,
    H = page.height,
    m = Math.min(W, H);
  let shape: ShapeObject;
  switch (id) {
    case 'panel':
      shape = createShape('rect', W / 2, H / 2, W * 0.62, H * 0.26, { fill: '#000000', opacity: 0.55, radius: m * 0.035, name: 'Title panel' });
      break;
    case 'glow':
      shape = createShape('ellipse', W / 2, H / 2, m * 0.6, m * 0.6, { fill: '#ffffff', opacity: 0.35, blur: m * 0.08, name: 'Soft glow' });
      break;
    case 'floor':
      shape = createShape('ellipse', W / 2, H * 0.82, W * 0.6, H * 0.08, { fill: '#000000', opacity: 0.45, blur: m * 0.025, name: 'Floor shadow' });
      break;
    case 'frame':
      shape = createShape('rect', W / 2, H / 2, W - m * 0.06, H - m * 0.06, { fillEnabled: false, stroke: '#ffffff', strokeWidth: Math.max(2, m * 0.006), opacity: 0.7, radius: m * 0.02, name: 'Frame' });
      break;
    case 'band':
      shape = createShape('rect', W / 2, H * 0.86, W, H * 0.14, { fill: '#378ef0', fill2: '#2563eb', opacity: 0.95, name: 'Color band' });
      break;
    case 'silhouette':
      shape = createShape('rect', W / 2, H * 0.16, W, H * 0.32, { fill: '#ffffff', opacity: 0.12, name: 'Silhouette zone', effect: { enabled: true, look: 'silhouette', amount: 0.75, color: '#16181d', scope: 'area', targets: 'icons' } });
      break;
    case 'fade':
      shape = createShape('rect', W / 2, H / 2, W * 0.6, H * 0.3, { fillEnabled: false, radius: m * 0.03, name: 'Fade zone', effect: { enabled: true, look: 'fade', amount: 0.8, color: '#000000', scope: 'area', targets: 'icons' } });
      break;
    case 'grayzone':
      shape = createShape('rect', W * 0.75, H / 2, W * 0.5, H, { fillEnabled: false, name: 'Grayscale zone', effect: { enabled: true, look: 'grayscale', amount: 1, color: '#000000', scope: 'area', targets: 'icons' } });
      break;
    default:
      shape = createShape('line', W / 2, H / 2, W * 0.3, 0, { stroke: '#ffffff', strokeWidth: Math.max(2, m * 0.004), opacity: 0.6, name: 'Divider' });
  }
  addObjects([shape], `Add ${shape.name.toLowerCase()}`);
  // backdrops sit behind the artwork; frames and dividers stay on top
  // effect zones must sit above the icons they restyle
  if (id === 'silhouette' || id === 'fade' || id === 'grayzone') reorderSelection('front');
  else if (id !== 'frame' && id !== 'divider') reorderSelection('back');
  return shape;
}
