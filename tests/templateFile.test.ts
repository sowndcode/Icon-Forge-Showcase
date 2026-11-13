// Template files are untrusted input: real exports must round-trip, anything malformed is refused.
import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { BACKGROUND_PRESETS, createProject } from '../src/core/defaults';
import { readTemplateFile, ShareCodeError } from '../src/core/shareCode';
import type { AssetRecord } from '../src/core/types';
import { KNOWN_ALGORITHMS } from '../src/state/customPresets';
import { loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, templateDataFromPage } from '../src/state/generators';

const FORMAT = 'asset-forge-showcase-template';
const asset = (i: number): AssetRecord => ({ id: `as${i}`, name: `i${i}.png`, format: 'png', kind: 'asset', folder: 'P', category: 'A', width: 64, height: 64, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 2, y: 2, w: 60, h: 60 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } } });

function exported(id: string) {
  const doc = createProject('T');
  doc.assets = Array.from({ length: 20 }, (_, i) => asset(i));
  loadDoc(doc);
  const page = BUILTIN_TEMPLATES.find((t) => t.id === id)!.build(doc.assets, 'Pack', BACKGROUND_PRESETS[4].bg());
  // what Export as a file writes, as it comes back from disk
  return JSON.parse(JSON.stringify({ format: FORMAT, version: 1, name: 'Mine', data: templateDataFromPage(page) }));
}

describe('template file import', () => {
  it('reads files the app exported, keeping text, shapes, size and layout', () => {
    for (const id of ['itch-cover', 'square', 'cover-shelves', 'pro-contents']) {
      const file = exported(id);
      const got = readTemplateFile(file, FORMAT, KNOWN_ALGORITHMS);
      expect(got.name).toBe('Mine');
      expect([got.data.page.width, got.data.page.height]).toEqual([file.data.page.width, file.data.page.height]);
      expect(got.data.page.objects.map((o) => o.type)).toEqual(file.data.page.objects.map((o: { type: string }) => o.type));
      expect(got.data.page.templateLayout?.algorithm).toBe(file.data.page.templateLayout.algorithm);
      expect(got.data.page.templateLayout?.slots?.length).toBe(file.data.page.templateLayout.slots.length);
    }
  });

  it('refuses files that are not templates or carry bad values', () => {
    const bad: unknown[] = [null, 'x', [], {}, { format: 'other', name: 'a', data: { page: {} } }, { format: FORMAT, name: 'a', data: {} }, { format: FORMAT, name: 'a', data: { page: { width: 1e9, height: 500, objects: [] } } }, { format: FORMAT, name: 'a', data: { page: { width: 630, height: 500, objects: 'no' } } }];
    for (const v of bad) expect(() => readTemplateFile(v, FORMAT, KNOWN_ALGORITHMS)).toThrow(ShareCodeError);
    const tooMany = exported('itch-cover');
    tooMany.data.page.objects = Array.from({ length: 5000 }, () => tooMany.data.page.objects[0]);
    expect(() => readTemplateFile(tooMany, FORMAT, KNOWN_ALGORITHMS)).toThrow(ShareCodeError);
    const unknownLayout = exported('itch-cover');
    unknownLayout.data.page.templateLayout.algorithm = 'not-a-layout';
    expect(() => readTemplateFile(unknownLayout, FORMAT, KNOWN_ALGORITHMS)).toThrow(ShareCodeError);
  });

  it('drops fields it does not know instead of storing them', () => {
    const file = exported('square');
    file.data.page.__proto_hack = { a: 1 };
    file.data.page.objects[0].onload = 'alert(1)';
    const got = readTemplateFile(file, FORMAT, KNOWN_ALGORITHMS);
    expect(JSON.stringify(got)).not.toContain('alert(1)');
    expect(JSON.stringify(got)).not.toContain('__proto_hack');
  });
});
