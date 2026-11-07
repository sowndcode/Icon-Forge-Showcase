// State consistency: changing one setting must not change or reset unrelated settings.
// These tests drive the real stores and actions (document, templates, themes, backgrounds, pages,
// undo/redo, Share Codes) the way the interface does.

import './helpers/canvasStub';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTextLook, createProject, createText, defaultTextStyle, TEXT_PRESETS } from '../src/core/defaults';
import { THEMES } from '../src/core/themes';
import type { AssetRecord, Page, ProjectDoc, TextObject } from '../src/core/types';
import { getDoc, getPage, loadDoc, redo, undo, useDoc } from '../src/state/doc';
import { buildTemplatePage, BUILTIN_TEMPLATES, createFromTemplate, toTemplateOptions } from '../src/state/generators';
import { applyTheme } from '../src/state/themes';
import { setBackground, setActivePage, addPages } from '../src/state/pages';
import { DEFAULT_PAGE_OPTIONS, pageTemplateOptions } from '../src/state/templateMerge';
import { resolveTheme, setTemplateOption, shownTemplateOptions, themeChoices } from '../src/state/templateOptions';
import { updateText, updateTextStyle } from '../src/state/objects';
import { useUI } from '../src/state/ui';
import { usePrefs } from '../src/state/prefs';
import { themeDataFromPage, themeFromPreset } from '../src/state/customPresets';
import { cleanThemeData, decodeShareCode, encodeShareCode } from '../src/core/shareCode';
import { sanitizeDoc } from '../src/state/project';
import { completeBackground } from '../src/ui/components/BgThumb';

const ALL = themeChoices(null, []);
const theme = (id: string) => THEMES.find((t) => t.id === id)!;

function asset(i: number): AssetRecord {
  const s = 64 + (i % 3) * 16;
  return {
    id: `as${i}`,
    name: `icon_${i}.png`,
    format: 'png',
    kind: 'asset',
    folder: 'Pack',
    category: i % 2 ? 'Weapons' : 'Potions',
    width: s,
    height: s,
    bytes: 1000 + i,
    importIndex: i,
    addedAt: 1,
    status: 'ready',
    alpha: { bounds: { x: 4, y: 4, w: s - 8, h: s - 8 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: s / 2, y: s / 2 } },
  };
}

function freshDoc(n = 12): ProjectDoc {
  const d = createProject('Test project');
  d.assets = Array.from({ length: n }, (_, i) => asset(i));
  return d;
}

/** A project whose only page was made from a built-in template, as the Templates tab makes it. */
function templateDoc(id = 'itch-cover', ui = { ...DEFAULT_PAGE_OPTIONS, themeId: 'minimal-dark' }) {
  const d = freshDoc();
  loadDoc(d);
  const t = BUILTIN_TEMPLATES.find((x) => x.id === id)!;
  const page = buildTemplatePage(t, d.assets, 'Halloween', toTemplateOptions(ui, resolveTheme(ui.themeId, ALL)), undefined, ui);
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  return page;
}

const texts = (p: Page = getPage()) => p.objects.filter((o): o is TextObject => o.type === 'text');
const title = (p: Page = getPage()) => texts(p).sort((a, b) => b.style.fontSize - a.style.fontSize)[0];
const colorsOf = (p: Page) => texts(p).map((t) => ({ fill: t.style.fill, fill2: t.style.fill2, font: t.style.fontFamily, stroke: t.style.stroke, badge: t.style.badge?.color }));
const shapesOf = (p: Page) => p.objects.filter((o) => o.type === 'shape').map((o) => (o.type === 'shape' ? [o.fill, o.stroke] : []));
const opt = (patch: Parameters<typeof setTemplateOption>[1]) => setTemplateOption(getPage(), patch, ALL);

beforeEach(() => {
  useUI.setState({ templateUi: { ...DEFAULT_PAGE_OPTIONS }, selection: [], pageSel: [] });
  usePrefs.setState({ templateTarget: 'new' });
});

describe('text rendering mode never resets the theme', () => {
  it('Pixel → Pixel ++ keeps a theme applied from the Themes tab', () => {
    templateDoc();
    applyTheme(theme('fantasy'));
    const themed = getPage();
    opt({ text: 'pixel-soft' });
    const soft = getPage();
    opt({ text: 'pixel' });
    const chunky = getPage();
    // colours, fonts, outlines, badges, shapes and background are exactly the theme's
    expect(colorsOf(soft)).toEqual(colorsOf(themed));
    expect(colorsOf(chunky)).toEqual(colorsOf(themed));
    expect(shapesOf(chunky)).toEqual(shapesOf(themed));
    expect(chunky.background).toEqual(themed.background);
    // only the pixel blocks changed
    expect(title(soft).style.pixel).toBeGreaterThan(0);
    expect(title(chunky).style.pixel).toBeGreaterThan(title(soft).style.pixel!);
    // and the Templates tab now shows the theme that was applied
    expect(pageTemplateOptions(chunky).themeId).toBe('fantasy');
    expect(pageTemplateOptions(chunky).text).toBe('pixel');
  });

  it('keeps colours the user picked by hand when the text mode changes', () => {
    templateDoc();
    const t = title();
    updateTextStyle(t.id, { fill: '#ff3366', stroke: { enabled: true, color: '#101010', width: 3 } });
    opt({ text: 'pixel' });
    opt({ text: 'smooth' });
    opt({ text: 'keep' });
    const after = getPage().objects.find((o) => o.id === t.id) as TextObject;
    expect(after.style.fill).toBe('#ff3366');
    expect(after.style.stroke).toEqual({ enabled: true, color: '#101010', width: 3 });
  });

  it('Smooth → As designed restores the designed pixel size', () => {
    templateDoc('wall-cover');
    const designed = title().style.pixel;
    opt({ text: 'smooth' });
    expect(title().style.pixel).toBe(0);
    opt({ text: 'keep' });
    expect(title().style.pixel).toBeCloseTo(designed ?? 0, 6);
  });
});

describe('user content survives appearance changes', () => {
  it('switching backgrounds keeps every text', () => {
    templateDoc();
    updateText(title().id, { text: 'My Premium Pack' });
    const before = texts();
    setBackground((b) => ({ ...completeBackground(b), type: 'solid', color: '#ffffff' }));
    setBackground((b) => ({ ...b, type: 'linear' }));
    expect(texts()).toEqual(before);
  });

  it('switching themes keeps the words', () => {
    templateDoc();
    updateText(title().id, { text: 'My Premium Pack' });
    const words = texts().map((t) => t.text);
    for (const id of ['fantasy', 'scifi', 'minimal-light', 'mining']) applyTheme(theme(id));
    opt({ themeId: 'fishing' });
    opt({ themeId: 'none' });
    expect(texts().map((t) => t.text)).toEqual(words);
  });

  it('changing icon size keeps typography and background', () => {
    templateDoc();
    applyTheme(theme('scifi'));
    const before = getPage();
    opt({ icons: 1.35 });
    const after = getPage();
    expect(texts(after).map((t) => t.style)).toEqual(texts(before).map((t) => t.style));
    expect(after.background).toEqual(before.background);
    expect(pageTemplateOptions(after).icons).toBe(1.35);
  });

  it('a template applied in place carries the typed title over (scoped change)', () => {
    templateDoc();
    updateText(title().id, { text: 'Dungeon Loot' });
    usePrefs.setState({ templateTarget: 'replace' });
    const id = getPage().id;
    createFromTemplate(BUILTIN_TEMPLATES.find((t) => t.id === 'cover-grid')!, getDoc().assets, 'Halloween');
    expect(getPage().id).toBe(id);
    expect(texts().some((t) => t.text === 'Dungeon Loot')).toBe(true);
  });

  it('applying a text preset keeps the size, alignment and words', () => {
    const cur = { ...defaultTextStyle(), fontSize: 37, align: 'left' as const };
    const look = applyTextLook(cur, TEXT_PRESETS[0].style);
    expect(look.fontSize).toBe(37);
    expect(look.align).toBe('left');
    expect(look.fontFamily).toBe({ ...defaultTextStyle(), ...TEXT_PRESETS[0].style }.fontFamily);
  });
});

describe('pages keep their own configuration', () => {
  it('switching pages changes nothing and options stay per page', () => {
    templateDoc();
    opt({ text: 'pixel' });
    const a = getPage();
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'cover-grid')!;
    const b = buildTemplatePage(t, getDoc().assets, 'Pack', toTemplateOptions(DEFAULT_PAGE_OPTIONS, undefined), undefined, { ...DEFAULT_PAGE_OPTIONS, themeId: 'none' });
    addPages([b], 'Add');
    const bNow = getPage();
    setActivePage(a.id);
    expect(getPage()).toBe(a);
    // the defaults for new pages do not leak into a template page
    useUI.setState({ templateUi: { ...DEFAULT_PAGE_OPTIONS, text: 'smooth', icons: 0.7 } });
    expect(shownTemplateOptions(getPage(), useUI.getState().templateUi).text).toBe('pixel');
    setActivePage(bNow.id);
    expect(getPage()).toBe(bNow);
    expect(shownTemplateOptions(getPage(), useUI.getState().templateUi).themeId).toBe('none');
  });

  it('choosing the option a page already has does not rebuild it', () => {
    templateDoc();
    const rev = useDoc.getState().rev;
    opt({ text: 'keep', icons: 1 });
    expect(useDoc.getState().rev).toBe(rev);
  });
});

describe('save, reopen, undo and redo', () => {
  it('a saved project reopens with the same visible configuration', () => {
    templateDoc();
    applyTheme(theme('fantasy'));
    opt({ text: 'pixel' });
    updateText(title().id, { text: 'Reopened' });
    const doc = getDoc();
    const reopened = sanitizeDoc(JSON.parse(JSON.stringify(doc)));
    expect(JSON.parse(JSON.stringify(reopened.pages))).toEqual(JSON.parse(JSON.stringify(doc.pages)));
    expect(pageTemplateOptions(reopened.pages[0])).toEqual(pageTemplateOptions(doc.pages[0]));
  });

  it('undo and redo restore complete states across preset changes', () => {
    templateDoc();
    const s0 = getPage();
    applyTheme(theme('fantasy'));
    const s1 = getPage();
    opt({ text: 'pixel' });
    const s2 = getPage();
    setBackground({ color: '#123456', type: 'solid' });
    const s3 = getPage();
    undo();
    expect(getPage()).toEqual(s2);
    undo();
    expect(getPage()).toEqual(s1);
    undo();
    expect(getPage()).toEqual(s0);
    redo();
    redo();
    redo();
    expect(getPage()).toEqual(s3);
  });

  it('pages saved before options were stored per page show what they were built with', () => {
    const page = templateDoc('itch-cover', { ...DEFAULT_PAGE_OPTIONS, themeId: 'scifi', text: 'pixel', icons: 1.35 });
    const legacy: Page = { ...page, fromTemplate: { ...page.fromTemplate!, ui: undefined } };
    const o = pageTemplateOptions(legacy);
    expect(o).toMatchObject({ themeId: 'scifi', text: 'pixel', icons: 1.35, themeParts: 'all' });
  });
});

describe('presets across projects and Share Codes', () => {
  it('a theme saved in project A applies in project B without touching its assets', () => {
    templateDoc();
    applyTheme(theme('fantasy'));
    const data = themeDataFromPage(getPage());
    const saved = themeFromPreset({ id: 'x1', kind: 'theme', name: 'Gold', createdAt: 1, data })!;
    // project B: other assets, a page with text
    const b = freshDoc(5);
    b.assets = b.assets.map((a) => ({ ...a, id: 'b' + a.id }));
    b.pages[0].objects = [createText('Project B', 960, 200, { fontSize: 120 }), createText('subtitle', 960, 400, { fontSize: 40 })];
    loadDoc(b);
    const assetsBefore = getDoc().assets;
    applyTheme(saved);
    expect(getDoc().assets).toBe(assetsBefore);
    expect(texts().map((t) => t.text)).toEqual(['Project B', 'subtitle']);
    expect(title().style.fontFamily).toBe(data.title.fontFamily);
  });

  it('decoding a Share Code changes nothing in the open project', () => {
    templateDoc();
    const data = themeDataFromPage(getPage());
    const before = getDoc();
    const code = encodeShareCode('theme', 'Shared', data);
    const item = decodeShareCode(code, new Set());
    expect(getDoc()).toBe(before);
    expect(item.kind).toBe('theme');
    expect(cleanThemeData(item.data)).not.toBeNull();
    // deterministic and stable: the same theme always gives the same code, and a decoded code re-encodes to itself
    expect(encodeShareCode('theme', 'Shared', data)).toBe(code);
    expect(encodeShareCode('theme', 'Shared', item.data as typeof data)).toBe(code);
  });
});
