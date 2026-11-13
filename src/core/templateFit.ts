// Smart template recommendations: how well a built-in template suits the pack in front of you.
//
// Deliberately small and local: each rated template names the range of icon counts it is at its
// best with, and a few need categories. Nothing here hides or disables a template — the result
// only orders the browser and adds a quiet label. Templates without an entry are never labelled.

export type FitLevel = 'great' | 'good' | 'adjust';

export interface TemplateFit {
  level: FitLevel;
  /** Why, in one short sentence (tooltip). */
  reason: string;
}

export interface FitContext {
  /** Icons a template would be built with. */
  count: number;
  /** Distinct categories among them. */
  categories: number;
  /** The Format chosen in the Templates tab, when every template is built at one size. */
  size?: { w: number; h: number };
}

const ALL = Infinity;
/** [fewest icons that fill it, most icons before they get small]. ALL: it shows a sample, so any larger pack works. */
const RANGE: Record<string, [number, number]> = {
  // these place every icon, so very large packs shrink them
  'itch-cover': [8, 70],
  'itch-wide': [16, 120],
  hero: [16, 110],
  perspective: [10, 160],
  large: [24, 320],
  portrait: [10, 120],
  category: [6, 140],
  versus: [12, 120],
  banner: [10, 70],
  'split-left': [12, 90],
  diagonal: [16, 90],
  dual: [16, 140],
  honeycomb: [30, 220],
  'steam-header': [10, 70],
  // catalogs are made for many
  catalog: [12, 600],
  'catalog-wide': [12, 300],
  'catalog-compact': [24, 500],
  'catalog-cards': [12, 250],
  'catalog-4k': [24, 800],
  'catalog-portrait': [12, 300],
  'catalog-cover': [12, 120],
  // these show a fixed sample
  square: [10, ALL],
  'frame-cover': [14, ALL],
  'square-pixel': [14, ALL],
  'yt-thumb': [14, ALL],
  'cover-count': [12, ALL],
  'cover-stickers': [14, ALL],
  'stickers-wide': [14, ALL],
  'cover-cards': [8, ALL],
  'cards-wide': [12, ALL],
  'cover-shelves': [10, ALL],
  'cover-split': [20, ALL],
  'cover-split-grid': [12, ALL],
  'cover-honey': [24, ALL],
  'cover-ring': [18, ALL],
  ring: [24, ALL],
  'cover-grid': [16, ALL],
  'insta-post': [20, ALL],
  feature: [5, ALL],
  compare: [12, ALL],
  demo: [6, ALL],
  'demo-split': [9, ALL],
  'demo-cards': [6, ALL],
  'demo-shelf': [8, ALL],
  'demo-stickers': [8, ALL],
  'demo-split-wide': [12, ALL],
  'demo-cards-wide': [8, ALL],
  'pro-minimal-cover': [10, ALL],
  'pro-editorial': [12, ALL],
  'pro-catalog': [40, ALL],
  'pro-feature-grid': [9, ALL],
  'pro-hero': [20, ALL],
  'pro-type-cover': [6, ALL],
  'pro-square-grid': [16, ALL],
  'pro-light-studio': [18, ALL],
  'pro-dark-studio': [15, ALL],
  'pro-detail': [5, ALL],
  'pro-category': [12, ALL],
  'pro-free-demo': [6, ALL],
  'pro-banner': [12, ALL],
  'pro-contents': [18, ALL],
  'pro-spotlight-cover': [9, ALL],
  'pro-story': [9, ALL],
};
/** Templates built around categories. */
const NEEDS_CATEGORIES = new Set(['pro-category', 'pro-contents']);

export const FIT_LABEL: Record<FitLevel, string> = { great: 'Great fit', good: 'Good fit', adjust: 'May need adjustments' };

/** How well a template suits the pack, or null when there is nothing reliable to say. */
export function templateFit(t: { id: string; w: number; h: number }, c: FitContext): TemplateFit | null {
  const range = RANGE[t.id];
  if (!range || c.count <= 0) return null;
  const [min, max] = range;
  const n = c.count;
  let fit: TemplateFit;
  if (n < min * 0.6) fit = { level: 'adjust', reason: `Looks best with at least ${min} icons — you have ${n}.` };
  else if (n > max * 1.6) fit = { level: 'adjust', reason: `Shows all ${n} icons, which makes them small. Works best up to about ${max}.` };
  else if (n < min) fit = { level: 'good', reason: `Works with ${n} icons; a little fuller from ${min}.` };
  else if (n > max) fit = { level: 'good', reason: `Works with ${n} icons; they are larger up to about ${max}.` };
  else fit = { level: 'great', reason: max === ALL ? `Shows a selection of your ${n} icons.` : `Sized for packs of ${min}–${max} icons.` };
  if (NEEDS_CATEGORIES.has(t.id) && c.categories < 2 && fit.level === 'great') fit = { level: 'good', reason: 'Built around categories; this pack has only one.' };
  // a Format far from the template's own shape squeezes the composition
  if (c.size) {
    const own = t.w / t.h,
      chosen = c.size.w / c.size.h;
    if (Math.max(own, chosen) / Math.min(own, chosen) > 1.9) fit = { level: fit.level === 'great' ? 'good' : 'adjust', reason: `Designed for ${t.w} × ${t.h}; the chosen format has a very different shape.` };
  }
  return fit;
}

const ORDER: Record<FitLevel, number> = { great: 0, good: 1, adjust: 2 };
/** Best fits first; templates keep their usual order within a level, and unrated ones sit with the good fits. */
export function sortByFit<T extends { id: string; w: number; h: number }>(list: T[], c: FitContext): T[] {
  if (c.count <= 0) return list;
  const rank = (t: T) => ORDER[templateFit(t, c)?.level ?? 'good'];
  return list
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t);
}
