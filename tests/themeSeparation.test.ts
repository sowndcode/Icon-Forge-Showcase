// A theme is appearance only. Applying one — built-in, saved, imported from a share code, or chosen
// as a template page's Look — never moves, resizes, reorders, adds or removes anything, never changes
// layouts or the icons a layout uses, the words, or the page size. Only colours, fonts, effects and
// the background change.

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createPage, createProject, createShape, createText } from '../src/core/defaults';
import { THEMES } from '../src/core/themes';
import type { AssetRecord, ImageObject, Page, SceneObject, StoredPreset } from '../src/core/types';
import { setLayoutAssets } from '../src/state/assetSelection';
import { getDoc, getPage, loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, buildTemplatePage, reapplyTemplate } from '../src/state/generators';
import { applyLayout } from '../src/state/layoutActions';
import { newImageObject } from '../src/state/objects';
import { applyTheme, themedPage } from '../src/state/themes';
import { themeFromPreset } from '../src/state/customPresets';
import { decodeShareCode, encodeShareCode, type CustomThemeData } from '../src/core/shareCode';

const icon = (i: number): AssetRecord => ({ id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: ['A', 'B'][i % 2], width: 64, height: 64, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 4, y: 4, w: 56, h: 56 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } } });
const theme = (id: string) => THEMES.find((t) => t.id === id)!;

/** Everything about a page that is not appearance. */
function structure(p: Page) {
  const geo = (o: SceneObject) => ({ id: o.id, type: o.type, x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.rotation, flipX: o.flipX, flipY: o.flipY, layoutId: o.layoutId, pinned: o.pinned, groupId: o.groupId, hidden: o.hidden, locked: o.locked, ...(o.type === 'image' ? { assetId: o.assetId, warp: o.warp } : {}), ...(o.type === 'text' ? { text: o.text, fontSize: o.style.fontSize, align: o.style.align, curve: o.style.curve, badge: !!o.style.badge?.enabled } : {}), ...(o.type === 'shape' ? { shape: o.shape } : {}) });
  return { width: p.width, height: p.height, objects: p.objects.map(geo), layouts: p.layouts, groups: p.groups, guides: p.guides, focal: p.focal, safeZone: p.safeZone };
}

/** A page with a Ground Plane of 12 of 20 icons (one moved by hand), a title, a panel and a badge. */
function composedPage(): Page {
  const d = createProject('Themes');
  d.assets = Array.from({ length: 20 }, (_, i) => icon(i));
  let page = createPage('Cover', 1920, 1080);
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  const objs = d.assets.slice(0, 16).map((a) => newImageObject(a.id, { x: 960, y: 540 }, page, 0.05));
  const panel = createShape('rect', 960, 140, 1200, 200, { fill: '#101014', opacity: 0.9, name: 'Panel' });
  const title = { ...createText('MY PACK', 960, 140), textEdited: true };
  const badge = createText('NEW', 1500, 140);
  badge.style = { ...badge.style, badge: { enabled: true, shape: 'pill', color: '#ff0000', color2: '#ff0000', gradient: false, padX: 10, padY: 4, radius: 8, stroke: { enabled: false, color: '#000', width: 0 }, points: 12 } };
  page = { ...page, objects: [...objs, panel, title, badge] };
  loadDoc({ ...d, pages: [page], activePageId: page.id });
  applyLayout('groundplane', objs.map((o) => o.id));
  // a hand-made choice of icons and a hand-moved, pinned icon
  setLayoutAssets(getPage().id, getPage().layouts[0].id, { mode: 'manual', ids: d.assets.slice(0, 12).map((a) => a.id) });
  const p = getPage();
  const moved = p.objects.find((o) => o.type === 'image')!;
  const objects = p.objects.map((o) => (o.id === moved.id ? { ...o, x: o.x + 37, y: o.y - 11, pinned: true } : o));
  loadDoc({ ...getDoc(), pages: [{ ...p, objects }] });
  return getPage();
}

describe('themes change appearance only', () => {
  for (const id of ['minimal-light', 'horror', 'pro-high-contrast', 'fantasy']) {
    it(`built-in theme ${id}: geometry, layouts, icon choice, words and size are unchanged`, () => {
      const before = composedPage();
      applyTheme(theme(id), [before.id]);
      const after = getPage();
      expect(structure(after)).toEqual(structure(before));
      // the icon choice of the layout is still the hand-made one
      expect(after.layouts[0].assetSelection).toEqual(before.layouts[0].assetSelection);
      // and the look did change
      expect(after.background).not.toEqual(before.background);
      const t = (p: Page) => p.objects.find((o) => o.type === 'text' && o.text === 'MY PACK') as SceneObject & { style: { fill: string; fontFamily: string } };
      expect(`${t(after).style.fill}|${t(after).style.fontFamily}`).not.toBe(`${t(before).style.fill}|${t(before).style.fontFamily}`);
    });
  }

  it('a saved or imported theme that carries structural text settings cannot apply them', () => {
    const data: CustomThemeData = {
      blurb: 'Imported',
      bg: { ...createPage('x', 10, 10).background, type: 'solid', color: '#224466' },
      title: { fill: '#ffcc00', fontFamily: 'Impact', curve: 0.8, align: 'left', lineHeight: 3, badge: { enabled: true, shape: 'burst', color: '#00ff00', color2: '#00ff00', gradient: false, padX: 40, padY: 40, radius: 0, stroke: { enabled: false, color: '#000', width: 0 }, points: 9 } },
      sub: '#ffffff',
      accent: '#ff00ff',
      accent2: '#ff00ff',
      accentText: '#000000',
    };
    // through a share code, as a user would paste it
    const code = encodeShareCode('theme', 'Imported', data);
    const decoded = decodeShareCode(code, new Set());
    const preset: StoredPreset<CustomThemeData> = { id: 'p1', kind: 'theme', name: 'Imported', createdAt: 1, data: decoded.kind === 'theme' ? (decoded.data as CustomThemeData) : data };
    const t = themeFromPreset(preset)!;
    const before = composedPage();
    const after = themedPage(before, t);
    expect(structure(after)).toEqual(structure(before));
    const title = after.objects.find((o) => o.type === 'text' && o.text === 'MY PACK') as Extract<SceneObject, { type: 'text' }>;
    expect(title.style.badge?.enabled ?? false).toBe(false);
    expect(title.style.fontFamily).toBe('Impact');
  });

  it('saved themes from earlier versions still load', () => {
    const old = { blurb: 'Old', bg: { type: 'solid', color: '#123456' }, title: { fill: '#ffffff' }, sub: '#eeeeee', accent: '#ff0000', accent2: '#ff0000', accentText: '#ffffff' } as unknown as CustomThemeData;
    const t = themeFromPreset({ id: 'old', kind: 'theme', name: 'Old theme', createdAt: 1, data: old });
    expect(t).not.toBeNull();
    const before = composedPage();
    expect(structure(themedPage(before, t!))).toEqual(structure(before));
  });
});

describe("a template page's Look", () => {
  function templatePage(legacy = false): Page {
    const d = createProject('Tpl');
    d.assets = Array.from({ length: 24 }, (_, i) => icon(i));
    loadDoc(d);
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'wall-cover')!;
    let p = buildTemplatePage(t, d.assets, 'Pack', { text: 'keep', icons: 1 });
    if (legacy) p = { ...p, objects: p.objects.map(({ tplKey: _k, ...o }) => o as SceneObject), fromTemplate: { ...p.fromTemplate!, keys: undefined as never } };
    // the user nudged an icon and typed a title
    const img = p.objects.find((o): o is ImageObject => o.type === 'image')!;
    p = { ...p, objects: p.objects.map((o) => (o.id === img.id ? { ...o, x: o.x + 20, pinned: true } : o.type === 'text' && o.style.fontSize === Math.max(...p.objects.filter((x) => x.type === 'text').map((x) => (x as { style: { fontSize: number } }).style.fontSize)) ? { ...o, text: 'TYPED BY ME', textEdited: true } : o)) };
    loadDoc({ ...d, pages: [p], activePageId: p.id });
    return getPage();
  }

  for (const legacy of [false, true]) {
    it(`choosing another Look restyles without laying the icons out again${legacy ? ' (page from an earlier version)' : ''}`, () => {
      const before = templatePage(legacy);
      const ui = { ...before.fromTemplate!.ui!, themeId: 'minimal-light' };
      reapplyTemplate(before.id, ui, theme('minimal-light'));
      const after = getPage();
      expect(structure(after)).toEqual(structure(before));
      expect(after.background).not.toEqual(before.background);
      expect(after.fromTemplate?.ui?.themeId).toBe('minimal-light');
    });
  }

  it('changing the format is a template action and may lay out again (not a theme)', () => {
    const before = templatePage();
    reapplyTemplate(before.id, { ...before.fromTemplate!.ui!, size: 'YouTube thumbnail · 1280×720' }, undefined);
    expect(getPage().width).not.toBe(before.width);
  });
});
