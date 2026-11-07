import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createProject, createText, solid } from '../src/core/defaults';
import { contrastRatio, PRO_THEMES, THEMES, themeReadability } from '../src/core/themes';
import { matchedVariants, paletteFromPixels, type Palette } from '../src/core/palette';
import type { AssetRecord, Page, TextObject } from '../src/core/types';
import { getDoc, getPage, loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, builtinForPage, buildTemplatePage, toTemplateOptions } from '../src/state/generators';
import { applyScope } from '../src/state/templateApply';
import { applyTheme } from '../src/state/themes';
import { DEFAULT_PAGE_OPTIONS } from '../src/state/templateMerge';
import { setTemplateOption, themeChoices } from '../src/state/templateOptions';
import { useUI } from '../src/state/ui';
import { findDuplicates } from '../src/state/assets';

const stops = (t: { bg: () => Page['background'] }) => {
  const b = t.bg();
  return b.type === 'solid' ? [b.color] : b.gradient.stops.map((s) => s.color);
};

describe('theme collection', () => {
  it('professional themes read at 4.5:1 or better and have unique ids', () => {
    for (const t of PRO_THEMES) {
      expect(themeReadability(t).level, t.id).toBe('good');
      for (const c of stops(t)) expect(contrastRatio(t.title.fill!, c), t.id).toBeGreaterThanOrEqual(4.5);
    }
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('existing theme ids are all still there', () => {
    for (const id of ['fantasy', 'mining', 'fishing', 'scifi', 'winter', 'halloween', 'minimal-light', 'minimal-dark', 'mono', 'kawaii', 'spring', 'royal']) expect(THEMES.some((t) => t.id === id)).toBe(true);
  });

  const palettes: [string, Palette][] = [
    ['dark icons', { colors: ['#1b1f2a', '#2b2f3a', '#3a2020'], hues: [222, 222, 0] }],
    ['bright icons', { colors: ['#ffd400', '#ff4fa3', '#22d3ee'], hues: [50, 330, 188] }],
    ['muddy icons', { colors: ['#7a6a55', '#6b7a55', '#55607a'], hues: [35, 80, 225] }],
  ];
  for (const [name, p] of palettes)
    it(`"From your icons" gives light and dark variants with readable text (${name})`, () => {
      for (const seed of [0, 1, 2, 5]) {
        const v = matchedVariants(p, seed);
        expect(v.map((t) => t.id)).toEqual(['match-v-light', 'match-v-dark', 'match-v-soft', 'match-v-vivid', 'match-v-minimal', 'match-v-contrast', 'match-v-warm', 'match-v-cool']);
        for (const t of v) {
          for (const c of stops(t)) {
            expect(contrastRatio(t.title.fill!, c), `${t.id} title`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(t.sub, c), `${t.id} sub`).toBeGreaterThanOrEqual(4.5);
          }
          expect(contrastRatio(t.accentText, t.accent), `${t.id} badge`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

  it('a palette from pixels feeds the variants', () => {
    const px = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < 64; i++) px.set([30, 30, 40, 255], i * 4);
    const p = paletteFromPixels(px);
    if (p) expect(matchedVariants(p).length).toBe(8);
  });
});

function icon(i: number): AssetRecord {
  return { id: `as${i}`, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: '', width: 64, height: 64, bytes: 100, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 0, y: 0, w: 64, h: 64 }, occupancy: 0.5, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } } };
}

function templatePage(id: string): Page {
  const d = createProject('T');
  d.assets = Array.from({ length: 16 }, (_, i) => icon(i));
  loadDoc(d);
  const t = BUILTIN_TEMPLATES.find((x) => x.id === id)!;
  const page = buildTemplatePage(t, d.assets, 'Pack', toTemplateOptions({ ...DEFAULT_PAGE_OPTIONS, themeId: 'none' }, undefined), undefined, { ...DEFAULT_PAGE_OPTIONS, themeId: 'none' });
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  return page;
}

describe('templates applied with a scope', () => {
  const texts = (p: Page) => p.objects.filter((o): o is TextObject => o.type === 'text');
  it('background only changes nothing else', () => {
    const page = templatePage('itch-cover');
    const src = builtinForPage(BUILTIN_TEMPLATES.find((t) => t.id === 'cover-grid')!, page);
    const out = applyScope(page, src, 'background');
    expect(out.background).toEqual(src.background);
    expect(out.objects).toEqual(page.objects);
    expect(out.layouts).toEqual(page.layouts);
  });
  it('text style only keeps words, sizes and positions', () => {
    const page = templatePage('itch-cover');
    const src = builtinForPage(BUILTIN_TEMPLATES.find((t) => t.id === 'wall-cover')!, page);
    const out = applyScope(page, src, 'text');
    expect(texts(out).map((t) => [t.text, t.x, t.y, t.style.fontSize])).toEqual(texts(page).map((t) => [t.text, t.x, t.y, t.style.fontSize]));
    expect(out.background).toEqual(page.background);
    expect(texts(out)[0].style.fontFamily).not.toBe(undefined);
  });
  it('layout only moves icons and leaves text and background', () => {
    const page = templatePage('itch-cover');
    const src = builtinForPage(BUILTIN_TEMPLATES.find((t) => t.id === 'cover-grid')!, page);
    const out = applyScope(page, src, 'layout');
    expect(texts(out)).toEqual(texts(page));
    expect(out.background).toEqual(page.background);
    expect(out.layouts[0].algorithm).toBe(src.layouts[0].algorithm);
    expect(out.objects.filter((o) => o.type === 'image').length).toBe(page.objects.filter((o) => o.type === 'image').length);
  });
});

describe('compatibility: theme definitions can change without touching saved pages', () => {
  it('a themed page keeps its look when the theme definition changes later', () => {
    templatePage('itch-cover');
    useUI.setState({ templateUi: { ...DEFAULT_PAGE_OPTIONS } });
    const t = THEMES.find((x) => x.id === 'spring')!;
    applyTheme(t);
    const before = JSON.stringify(texts(getPage()).map((x) => x.style));
    // a later release changes the theme…
    const old = t.title.stroke;
    t.title.stroke = { enabled: true, color: '#000000', width: 2 };
    try {
      // …and the user changes an unrelated option: the page keeps the look it had
      setTemplateOption(getPage(), { icons: 1.35 }, themeChoices(null, []));
      setTemplateOption(getPage(), { text: 'smooth' }, themeChoices(null, []));
      const after = texts(getPage()).map((x) => ({ ...x.style, pixel: undefined }));
      expect(after.map((s) => s.stroke)).toEqual(JSON.parse(before).map((s: TextObject['style']) => s.stroke));
    } finally {
      t.title.stroke = old;
    }
    expect(getDoc().pages.length).toBe(1);
  });
  function texts(p: Page) {
    return p.objects.filter((o): o is TextObject => o.type === 'text');
  }
});

describe('duplicate detection', () => {
  const file = (name: string, bytes: number[]) => ({ file: new File([new Uint8Array(bytes)], name) });
  it('finds exact copies by content, not by name', async () => {
    const existingBlob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const existing = [{ ...icon(0), name: 'sword.png', bytes: 4 }];
    const r = await findDuplicates([file('renamed.png', [1, 2, 3, 4]), file('sword.png', [9, 9, 9, 9]), file('a.png', [5, 5]), file('b.png', [5, 5])], existing, () => existingBlob);
    expect([...r.copies].sort()).toEqual([0, 3]); // same bytes as the library icon; repeat of a.png
    expect(r.inProject).toBe(1);
    expect(r.sameName).toBe(1); // sword.png differs: not a duplicate, both kept
  });
});

// keep the unused helper referenced for type-checking of the canvas stub import order
void createText;
void solid;
