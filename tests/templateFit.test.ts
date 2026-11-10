// Smart template recommendations: fit levels, ordering, and that nothing is ever dropped.
import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { sortByFit, templateFit } from '../src/core/templateFit';
import { BUILTIN_TEMPLATES } from '../src/state/generators';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

describe('template fit', () => {
  it('rates a template by the icons it would be built with', () => {
    expect(templateFit(tpl('itch-cover'), { count: 30, categories: 3 })?.level).toBe('great');
    expect(templateFit(tpl('itch-cover'), { count: 6, categories: 1 })?.level).toBe('good');
    expect(templateFit(tpl('itch-cover'), { count: 2, categories: 1 })?.level).toBe('adjust');
    expect(templateFit(tpl('itch-cover'), { count: 900, categories: 1 })?.level).toBe('adjust');
    // templates that show a sample suit any larger pack
    expect(templateFit(tpl('pro-minimal-cover'), { count: 900, categories: 1 })?.level).toBe('great');
  });

  it('says nothing without assets or for templates it has no data on', () => {
    expect(templateFit(tpl('itch-cover'), { count: 0, categories: 0 })).toBeNull();
    expect(templateFit(tpl('wall-cover'), { count: 40, categories: 2 })).toBeNull();
    expect(templateFit(tpl('cover-ribbon'), { count: 40, categories: 2 })).toBeNull();
  });

  it('lowers category templates for packs without categories and odd formats', () => {
    expect(templateFit(tpl('pro-category'), { count: 60, categories: 1 })?.level).toBe('good');
    expect(templateFit(tpl('pro-category'), { count: 60, categories: 4 })?.level).toBe('great');
    expect(templateFit(tpl('itch-cover'), { count: 30, categories: 3, size: { w: 1080, h: 1920 } })?.level).toBe('good');
  });

  it('only rates templates that exist', () => {
    // a rated id that is not a template would be a typo in the table
    const ids = new Set(BUILTIN_TEMPLATES.map((t) => t.id));
    for (const id of ['itch-cover', 'pro-contents', 'pro-spotlight-cover', 'pro-story', 'catalog-4k', 'demo-cards-wide']) expect(ids.has(id)).toBe(true);
  });

  it('orders best fits first and keeps every template', () => {
    const ctx = { count: 400, categories: 5 };
    const sorted = sortByFit(BUILTIN_TEMPLATES, ctx);
    expect(sorted).toHaveLength(BUILTIN_TEMPLATES.length);
    expect(new Set(sorted)).toEqual(new Set(BUILTIN_TEMPLATES));
    const rank = { great: 0, good: 1, adjust: 2 } as const;
    const ranks = sorted.map((t) => rank[templateFit(t, ctx)?.level ?? 'good']);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // without assets the order is untouched
    expect(sortByFit(BUILTIN_TEMPLATES, { count: 0, categories: 0 })).toBe(BUILTIN_TEMPLATES);
  });
});
