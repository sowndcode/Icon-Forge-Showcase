// Damaged or hand-edited project files: they open with whatever is usable, and nothing in them can
// make drawing throw. Well-formed projects pass through unchanged.

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { sanitizeDoc } from '../src/state/project';
import { createProject, createText } from '../src/core/defaults';
import { renderPage } from '../src/render/renderer';
import type { ProjectDoc } from '../src/core/types';

const base = createProject('x');
const page0 = base.pages[0];
const draw = (d: ProjectDoc) => {
  for (const p of d.pages) {
    const c = new OffscreenCanvas(100, 100);
    renderPage(c.getContext('2d') as never, p, { pxScale: 0.1, getAsset: () => undefined, getImage: () => null });
  }
};

const damaged: Record<string, unknown> = {
  'pages is not a list': { ...base, pages: 'x' },
  'a page is null': { ...base, pages: [null, page0] },
  'objects is null': { ...base, pages: [{ ...page0, objects: null }] },
  'junk objects': { ...base, pages: [{ ...page0, objects: [null, 5, 'a', { type: 'image', id: 'i' }, { type: 'text', id: 't' }, { type: 'shape', id: 's' }, { type: 'zzz', id: 'z' }, { type: 'text' }] }] },
  'non-numeric geometry': { ...base, pages: [{ ...page0, objects: [{ ...createText('Hi', 10, 10), x: 'a', w: null, rotation: NaN }] }] },
  'junk assets and fonts': { ...base, assets: [null, 'a', { id: 3 }, { id: 'ok', name: 'a.png' }], fonts: 'x' },
  'background is null': { ...base, pages: [{ ...page0, background: null }] },
  'junk layouts': { ...base, pages: [{ ...page0, layouts: [null, { algorithm: 7 }, { algorithm: 'grid', objectIds: 'x' }] }] },
  'bad page size': { ...base, pages: [{ ...page0, width: 'a', height: -5 }] },
  'junk watermark': { ...base, watermark: { layers: [null, { kind: 'image' }] } },
};

describe('damaged project files', () => {
  for (const [name, doc] of Object.entries(damaged))
    it(`${name}: opens and draws`, () => {
      const d = sanitizeDoc(doc as ProjectDoc);
      expect(d.pages.length).toBeGreaterThan(0);
      expect(() => draw(d)).not.toThrow();
    });

  it('keeps usable entries and drops the rest', () => {
    const d = sanitizeDoc(damaged['junk objects'] as ProjectDoc);
    expect(d.pages[0].objects.map((o) => o.id)).toEqual(['i', 't', 's']);
    expect(sanitizeDoc(damaged['junk assets and fonts'] as ProjectDoc).assets.map((a) => a.id)).toEqual(['ok']);
    const g = sanitizeDoc(damaged['bad page size'] as ProjectDoc).pages[0];
    expect([g.width, g.height]).toEqual([1920, 1080]);
  });

  it('a well-formed project passes through unchanged', () => {
    const t = createText('Title', 100, 80);
    const doc: ProjectDoc = { ...base, pages: [{ ...page0, objects: [t] }] };
    const d = sanitizeDoc(doc);
    expect(d.pages[0].objects[0]).toEqual(t);
    expect(d.pages[0].width).toBe(page0.width);
  });
});

describe('preview memory for large packs', () => {
  it('keeps full previews for normal packs and shrinks them as packs grow', async () => {
    const { previewMaxFor, PREVIEW_MAX, THUMB_MAX } = await import('../src/render/images');
    expect(previewMaxFor(50)).toBe(PREVIEW_MAX);
    expect(previewMaxFor(500)).toBe(PREVIEW_MAX);
    const sizes = [501, 1500, 1501, 3000, 3001, 10000].map(previewMaxFor);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    // never below the library thumbnail size, and 5,000 icons stay well under 1 GB of bitmaps
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(THUMB_MAX - 32);
    expect((5000 * previewMaxFor(5000) ** 2 * 4) / 2 ** 30).toBeLessThan(1);
  });
});
