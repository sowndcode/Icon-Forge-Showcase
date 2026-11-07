// Generate Variations: many different compositions of the same icons from the current page,
// keeping its size, text and background (or trying game themes), with the title kept clear.

import { THEMES } from '../core/themes';
import { createRng } from '../core/rng';
import type { AssetRecord, FocalRegion, ImageObject, Page, SceneObject } from '../core/types';
import { defaultParams, getAlgorithm } from '../layout/registry';
import { runLayout } from '../layout/run';
import { currentVisibleBox } from '../core/transform';
import { getAsset, getPage } from './doc';
import { newInstance } from './layoutActions';
import { newImageObject } from './objects';
import { clonePage } from './pages';
import { themedPage } from './themes';

/** Layouts that make good marketplace images on their own (in the order they are tried). */
export const VARIATION_LAYOUTS = ['cluster', 'roundcluster', 'heroshowcase', 'hero', 'dualcluster', 'split', 'orbit', 'ring', 'scatter', 'bands', 'edgeframe', 'shapefill', 'spiral', 'diagonal', 'honeycomb', 'grid', 'packed', 'floor'];

export interface VariationOptions {
  count: number;
  /** Layout ids to pick from; empty = keep the page's layout type. */
  layouts: string[];
  /** Icons per variation: 0 = all. */
  iconCount: number;
  /** 0 … 1: how much scale / rotation / position randomness to add. */
  randomness: number;
  /** Keep the page's background and text colours, or try a different game theme per variation. */
  look: 'keep' | 'themes';
  /** Keep text readable by reserving its area. */
  protectText: boolean;
  seed: number;
}

/** Area covered by the page's text (+ margin), used as a keep-out region so titles stay readable. */
function textFocal(p: Page): FocalRegion | null {
  const texts = p.objects.filter((o) => o.type === 'text' && !o.hidden);
  if (!texts.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const t of texts) {
    const b = currentVisibleBox(t);
    x0 = Math.min(x0, b.cx - b.w / 2);
    y0 = Math.min(y0, b.cy - b.h / 2);
    x1 = Math.max(x1, b.cx + b.w / 2);
    y1 = Math.max(y1, b.cy + b.h / 2);
  }
  const m = Math.min(p.width, p.height) * 0.03;
  return { enabled: true, shape: 'rect', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + m * 2, h: y1 - y0 + m * 2 };
}

/** Pages are built but not added — the dialog shows them and adds the ones you pick. */
export function generateVariations(o: VariationOptions, pool: AssetRecord[], base: Page = getPage()): Page[] {
  const rng = createRng(o.seed);
  const baseInst = base.layouts[0];
  // assets currently on the page, else the library pool
  const onPage = [...new Set(base.objects.filter((x): x is ImageObject => x.type === 'image' && (!baseInst || x.layoutId === baseInst.id)).map((x) => x.assetId))]
    .map((id) => getAsset(id))
    .filter((a): a is AssetRecord => !!a && a.kind === 'asset');
  const source = onPage.length ? onPage : pool;
  const layouts = o.layouts.length ? o.layouts : [baseInst?.algorithm ?? 'cluster'];
  // the base page without its layout-managed icons: text, shapes and loose images stay
  const managed = new Set(baseInst?.objectIds ?? []);
  // a variation has its own layout: it no longer follows the template it came from (a live
  // template rebuild would otherwise turn it back into the template's composition)
  const shell: Page = { ...base, objects: base.objects.filter((x) => !managed.has(x.id)), layouts: [], fromTemplate: undefined };
  const focal = o.protectText && !base.focal.enabled ? textFocal(base) : null;
  const out: Page[] = [];
  // shuffle the layout order so a small count still shows different kinds
  const order = rng.fork('order').shuffle(layouts.slice());
  const themes = rng.fork('themes').shuffle(THEMES.slice());
  for (let i = 0; i < o.count; i++) {
    const r = rng.fork('v' + i);
    const algorithm = order[i % order.length];
    const n = o.iconCount > 0 ? Math.min(o.iconCount, source.length) : source.length;
    const picked = n < source.length ? r.fork('pick').shuffle(source.slice()).slice(0, n) : r.fork('pick').shuffle(source.slice());
    let p = clonePage(shell, `Variation ${i + 1}`);
    if (focal) p = { ...p, focal };
    if (o.look === 'themes') p = themedPage(p, themes[i % themes.length]);
    const objs = picked.map((a) => newImageObject(a.id, { x: p.width / 2, y: p.height / 2 }, p, 0.12));
    const alg = getAlgorithm(algorithm);
    const same = baseInst && baseInst.algorithm === algorithm;
    const inst = newInstance(algorithm, objs.map((x) => x.id), p, {
      seed: Math.floor(r() * 1e9),
      params: { ...defaultParams(alg), ...(same ? baseInst.params : {}), jScale: 0.25 * o.randomness, jRot: alg.noCommon ? 0 : 10 * o.randomness, jPos: 0.2 * o.randomness, order: 'random', orderSeed: Math.floor(r() * 1e9) },
      avoidFocal: true,
      respectSafe: true,
    });
    if (same) Object.assign(inst, { overlap: baseInst.overlap, maxOverlap: baseInst.maxOverlap });
    // icons go below text and shapes so titles stay on top
    const withObjs: Page = { ...p, objects: [...objs.map((x): SceneObject => ({ ...x, layoutId: inst.id })), ...p.objects], layouts: [inst] };
    out.push(runLayout(withObjs, inst, { getAsset }));
  }
  return out;
}
