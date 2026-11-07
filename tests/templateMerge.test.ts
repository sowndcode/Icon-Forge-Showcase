import { describe, expect, it } from 'vitest';
import { createImage, createPage, createShape, createText } from '../src/core/defaults';
import type { Page, SceneObject, TextObject } from '../src/core/types';
import { applyContent, keyTemplateObjects, mergeTemplateRebuild, optsSig, pageContent } from '../src/state/templateMerge';
import type { TemplateOptions } from '../src/state/generators';
import type { Theme } from '../src/core/themes';

// A stand-in for a built-in template: a panel, a title, a subtitle and laid-out icons. Like the real
// templates it always creates the same objects in the same order; options change their look and size.
function build(opts: TemplateOptions): Page {
  const W = opts.size?.w ?? 1920,
    H = opts.size?.h ?? 1080;
  const p = createPage('Tpl', W, H);
  const k = Math.min(W, H) / 1080;
  const fill = opts.theme?.accent ?? '#ffffff';
  const panel = createShape('rect', W / 2, H * 0.2, 800 * k, 200 * k, { fill: '#111111' });
  const title = createText('HALLOWEEN ASSET PACK', W / 2, H * 0.15, { fontSize: 120 * k, fill, pixel: opts.text === 'pixel' ? 9 : 0 });
  const sub = createText('120+ ICONS', W / 2, H * 0.25, { fontSize: 40 * k, fill });
  const icons = [0, 1, 2].map((i) => ({ ...createImage('as' + i, 'icon', 300 + i * 200 * opts.icons, H * 0.7, 100 * opts.icons, 100 * opts.icons), layoutId: 'lay1' }));
  p.objects = [...icons, panel, title, sub];
  p.layouts = [{ id: 'lay1', name: 'Grid', algorithm: 'grid', params: {}, seed: 1, objectIds: icons.map((o) => o.id), slots: [], overlap: 'strict', maxOverlap: 0.3, avoidFocal: true, respectSafe: true }];
  p.background = { ...p.background, color: opts.theme?.accent2 ?? '#222222' };
  return p;
}

const theme = (id: string, accent: string): Theme => ({ id, name: id, blurb: '', bg: () => createPage('x', 1, 1).background, title: { fill: accent }, sub: accent, accent, accent2: accent + '', accentText: '#000000' });
const DEFAULT: TemplateOptions = { text: 'keep', icons: 1 };

/** First build, as createFromTemplate makes it. */
function first(opts = DEFAULT): Page {
  const { page, keys } = keyTemplateObjects(build(opts));
  return { ...page, fromTemplate: { id: 'tpl', assetIds: ['as0', 'as1', 'as2'], keys, opts: optsSig(opts) } };
}

/** What reapplyTemplate does when an option changes. */
function rebuild(cur: Page, opts: TemplateOptions): Page {
  const { page, keys } = keyTemplateObjects(build(opts));
  return mergeTemplateRebuild(cur, page, keys, optsSig(opts));
}

const texts = (p: Page) => p.objects.filter((o): o is TextObject => o.type === 'text');
const edit = (p: Page, i: number, patch: Partial<TextObject>): Page => {
  const id = texts(p)[i].id;
  return { ...p, objects: p.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SceneObject) : o)) };
};

describe('live template rebuilds keep user content', () => {
  it('keeps typed title and subtitle when the theme changes, repeatedly', () => {
    let p = first();
    p = edit(p, 0, { text: 'My Premium Icon Pack', textEdited: true });
    p = edit(p, 1, { text: '100 carefully designed game icons', textEdited: true });
    for (const t of [theme('a', '#ff0000'), theme('b', '#00ff00'), undefined, theme('a', '#ff0000')]) {
      p = rebuild(p, { ...DEFAULT, theme: t });
      expect(texts(p).map((x) => x.text)).toEqual(['My Premium Icon Pack', '100 carefully designed game icons']);
    }
    // the theme still restyled the text
    p = rebuild(p, { ...DEFAULT, theme: theme('c', '#0000ff') });
    expect(texts(p)[0].style.fill).toBe('#0000ff');
  });

  it('keeps text through text-style, icon-size and format changes', () => {
    let p = edit(first(), 0, { text: 'Mine', textEdited: true });
    p = rebuild(p, { ...DEFAULT, text: 'pixel' });
    expect(texts(p)[0].style.pixel).toBeCloseTo(120 / 13); // Pixel ++ block size for a 120 px title
    p = rebuild(p, { ...DEFAULT, text: 'pixel', icons: 1.35 });
    p = rebuild(p, { ...DEFAULT, text: 'pixel', icons: 1.35, size: { w: 1080, h: 1080 } });
    expect(p.width).toBe(1080);
    expect(texts(p)[0].text).toBe('Mine');
    p = rebuild(p, DEFAULT);
    expect(texts(p)[0].text).toBe('Mine');
    expect(p.width).toBe(1920);
  });

  it('keeps object ids, so the selection and layers survive', () => {
    const p0 = first();
    const p1 = rebuild(p0, { ...DEFAULT, theme: theme('a', '#ff0000') });
    expect(texts(p1).map((t) => t.id)).toEqual(texts(p0).map((t) => t.id));
  });

  it('keeps hand moves when the format did not change, and follows a new format', () => {
    let p = first();
    p = edit(p, 0, { x: 123, y: 45 });
    p = rebuild(p, { ...DEFAULT, theme: theme('a', '#ff0000') });
    expect(texts(p)[0]).toMatchObject({ x: 123, y: 45 });
    p = rebuild(p, { ...DEFAULT, icons: 0.7 });
    expect(texts(p)[0]).toMatchObject({ x: 123, y: 45 }); // icon size doesn't move text
    p = rebuild(p, { ...DEFAULT, icons: 0.7, size: { w: 1080, h: 1080 } });
    expect(texts(p)[0].x).toBe(540);
  });

  it('keeps icons and layouts untouched when only the look changes', () => {
    const p0 = first();
    const moved = { ...p0, objects: p0.objects.map((o) => (o.type === 'image' && o.assetId === 'as1' ? { ...o, x: 999, pinned: true } : o)) };
    const p1 = rebuild(moved, { ...DEFAULT, theme: theme('a', '#ff0000') });
    expect(p1.objects.find((o) => o.type === 'image' && o.assetId === 'as1')).toMatchObject({ x: 999, pinned: true });
    expect(p1.layouts).toBe(moved.layouts);
    // a new icon size re-lays them out
    const p2 = rebuild(p1, { ...DEFAULT, theme: theme('a', '#ff0000'), icons: 1.35 });
    expect(p2.objects.filter((o) => o.type === 'image').every((o) => o.w === 135)).toBe(true);
  });

  it('keeps objects the user added, and keeps deleted template objects deleted', () => {
    let p = first();
    const extra = createText('Sale this week', 100, 100);
    const panelId = p.objects.find((o) => o.type === 'shape')!.id;
    p = { ...p, objects: [...p.objects.filter((o) => o.id !== panelId), extra] };
    for (const opts of [{ ...DEFAULT, theme: theme('a', '#ff0000') }, { ...DEFAULT, icons: 1.35 }, { ...DEFAULT, size: { w: 1080, h: 1080 } }]) {
      p = rebuild(p, opts);
      expect(p.objects.some((o) => o.id === extra.id)).toBe(true);
      expect(p.objects.some((o) => o.type === 'shape')).toBe(false);
    }
  });

  it('keeps a background the user picked unless the theme for the background changes', () => {
    let p = first({ ...DEFAULT, theme: theme('a', '#ff0000') });
    p = { ...p, background: { ...p.background, color: '#abcdef' } };
    p = rebuild(p, { ...DEFAULT, theme: theme('a', '#ff0000'), text: 'pixel' });
    expect(p.background.color).toBe('#abcdef');
    p = rebuild(p, { ...DEFAULT, theme: theme('a', '#ff0000'), text: 'pixel', themeParts: 'text' });
    expect(p.background.color).toBe('#ff0000'); // theme parts changed what controls the background
  });

  it('keeps the words on pages made before keys existed', () => {
    const legacy = { ...build(DEFAULT), fromTemplate: { id: 'tpl', assetIds: [] } };
    const typed = edit(legacy, 0, { text: 'Old page title' });
    const p = rebuild(typed, { ...DEFAULT, theme: theme('a', '#ff0000') });
    expect(texts(p)[0].text).toBe('Old page title');
    expect(p.fromTemplate?.keys).toEqual(['t0', 't1', 't2']); // panel, title, subtitle — keyed from now on
  });
});

describe('switching to another template carries typed text by role', () => {
  it('moves title and subtitle, and remembers a role the new template lacks', () => {
    let p = first();
    p = edit(p, 0, { text: 'My Premium Icon Pack', textEdited: true });
    p = edit(p, 1, { text: '100 carefully designed game icons', textEdited: true });
    // a template with only a title
    const onlyTitle = createPage('B', 1080, 1080);
    onlyTitle.objects = [createText('DEFAULT', 540, 200, { fontSize: 100 })];
    const b = applyContent(onlyTitle, pageContent(p));
    expect(texts(b)[0].text).toBe('My Premium Icon Pack');
    expect(b.content?.subtitle).toBe('100 carefully designed game icons');
    // back to a template with a subtitle: it comes back
    const c = applyContent(build(DEFAULT), pageContent(b));
    expect(texts(c).map((t) => t.text)).toEqual(['My Premium Icon Pack', '100 carefully designed game icons']);
  });

  it('leaves generated text alone when the user typed nothing', () => {
    const b = applyContent(build(DEFAULT), pageContent(first()));
    expect(texts(b)[0].text).toBe('HALLOWEEN ASSET PACK');
  });
});
