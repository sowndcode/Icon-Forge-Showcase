// Tilted Wall Cover and Ribbon Cover must stay exactly as they are. Their full build output (every
// object, style, layout, slot and the background) is compared with a snapshot recorded from the
// original implementation, for several icon counts, with and without a theme and text option.
// Random seeds and ids are fixed so the output is repeatable.

import './helpers/canvasStub';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/core/defaults';
import { THEMES } from '../src/core/themes';
import type { AssetRecord } from '../src/core/types';
import { loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, previewTemplate, type TemplateOptions } from '../src/state/generators';

function asset(i: number): AssetRecord {
  const s = [32, 64, 128, 96][i % 4];
  return {
    id: `as${i}`,
    name: `icon_${i}.png`,
    format: 'png',
    kind: 'asset',
    folder: 'Pack',
    category: ['Potions', 'Weapons', 'Armor'][i % 3],
    width: s,
    height: s + (i % 2) * 8,
    bytes: 1000 + i,
    importIndex: i,
    addedAt: 1,
    status: 'ready',
    alpha: { bounds: { x: 2, y: 3, w: s - 5, h: s - 4 }, occupancy: 0.55, fill: 0.75, hasAlpha: true, empty: false, centroid: { x: s / 2, y: s / 2 + 1 } },
  };
}

/** Ids are random; replace them by their order of appearance so snapshots compare structure. */
function normalize(v: unknown): unknown {
  const ids = new Map<string, string>();
  const json = JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x));
  return JSON.parse(json.replace(/"((?:pg|ob|tx|sh|im|lay|grp|gd)[a-z0-9]{6,})"/g, (_m, id: string) => {
    if (!ids.has(id)) ids.set(id, `id${ids.size}`);
    return `"${ids.get(id)}"`;
  }));
}

let seed = 1;
beforeEach(() => {
  seed = 1;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  });
});
afterEach(() => vi.restoreAllMocks());

const PROTECTED = ['wall-cover', 'cover-ribbon'];
const CASES: { name: string; n: number; opts: TemplateOptions }[] = [
  { name: 'own look, 12 icons', n: 12, opts: { text: 'keep', icons: 1 } },
  { name: 'own look, 3 icons', n: 3, opts: { text: 'keep', icons: 1 } },
  { name: 'own look, 160 icons', n: 160, opts: { text: 'keep', icons: 1 } },
  { name: 'studio dark (default look), 24 icons', n: 24, opts: { text: 'keep', icons: 1, theme: THEMES.find((t) => t.id === 'minimal-dark') } },
  { name: 'fantasy, smooth text, bigger icons', n: 24, opts: { text: 'smooth', icons: 1.35, theme: THEMES.find((t) => t.id === 'fantasy') } },
];

describe('protected templates are unchanged', () => {
  it('both are still listed under itch.io covers with their names and sizes', () => {
    const list = PROTECTED.map((id) => BUILTIN_TEMPLATES.find((t) => t.id === id)!);
    expect(list.map((t) => [t.name, t.w, t.h])).toEqual([
      ['Tilted Wall Cover', 630, 500],
      ['Ribbon Cover', 630, 500],
    ]);
  });

  for (const id of PROTECTED)
    for (const c of CASES)
      it(`${id}: ${c.name}`, () => {
        const doc = createProject('Snapshot');
        doc.assets = Array.from({ length: c.n }, (_, i) => asset(i));
        loadDoc(doc);
        const t = BUILTIN_TEMPLATES.find((x) => x.id === id)!;
        const page = previewTemplate(t, doc.assets, undefined, 9999, c.opts);
        expect(normalize({ ...page, fromTemplate: undefined })).toMatchSnapshot();
      });
});
