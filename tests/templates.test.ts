// Every built-in template, with few, many or no icons, a long pack name and several themes: it builds,
// keeps its text inside the page and on the lines it was designed with (no word wrapping into badges).

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/defaults';
import { THEMES } from '../src/core/themes';
import type { AssetRecord, TextObject } from '../src/core/types';
import { loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, PRO_TEMPLATES, previewTemplate } from '../src/state/generators';
import { naturalWidth } from '../src/render/text';
import { resolveTheme, themeChoices } from '../src/state/templateOptions';

function icon(i: number): AssetRecord {
  const s = [32, 64, 128, 256][i % 4];
  return { id: `as${i}`, name: `i${i}.png`, format: i % 5 ? 'png' : 'webp', kind: 'asset', folder: 'Pack', category: ['Potions', 'Weapons', 'Gems'][i % 3], width: s, height: s, bytes: 100 + i, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 0, y: 0, w: s, h: s }, occupancy: 0.5, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: s / 2, y: s / 2 } } };
}

const fits = (t: TextObject) => {
  const lines = t.text.replace(/\{count\}/g, '000').split('\n');
  const pad = t.style.badge?.enabled ? 0 : t.style.fontSize * 0.1;
  return Math.max(...lines.map((l) => naturalWidth(l, t.style))) + pad <= t.w + 1;
};

describe('template robustness', () => {
  const themes = [undefined, THEMES.find((t) => t.id === 'minimal-dark'), THEMES.find((t) => t.id === 'fantasy'), THEMES.find((t) => t.id === 'pro-monochrome')];
  for (const n of [0, 3, 40, 300])
    it(`every template builds with ${n} icons and keeps text inside the page`, { timeout: 120_000 }, () => {
      const d = createProject('Robust');
      d.assets = Array.from({ length: n }, (_, i) => icon(i));
      loadDoc(d);
      for (const t of BUILTIN_TEMPLATES)
        for (const theme of themes) {
          const p = previewTemplate(t, d.assets, undefined, 400, { text: 'keep', icons: 1, theme });
          for (const o of p.objects) {
            expect(Number.isFinite(o.x) && Number.isFinite(o.y), `${t.id} ${o.name}`).toBe(true);
            if (o.type !== 'text' || o.rotation) continue;
            expect(o.x, `${t.id} ${o.name} x`).toBeGreaterThan(0);
            expect(o.x, `${t.id} ${o.name} x`).toBeLessThan(p.width);
            expect(o.y, `${t.id} ${o.name} y`).toBeGreaterThan(0);
            expect(o.y, `${t.id} ${o.name} y`).toBeLessThan(p.height);
          }
          if (theme) for (const o of p.objects) if (o.type === 'text' && !o.style.curve) expect(fits(o), `${t.id} with ${theme.id}: “${o.text}” wraps`).toBe(true);
        }
    });

  it('clean templates fit a long pack name on the page', () => {
    const d = createProject('Robust');
    d.assets = Array.from({ length: 24 }, (_, i) => icon(i));
    loadDoc(d);
    for (const t of PRO_TEMPLATES) {
      const p = t.build(d.assets, 'Extraordinarily Detailed Medieval Fantasy Weapons and Armour', d.pages[0].background);
      for (const o of p.objects)
        if (o.type === 'text') {
          expect(o.x - o.w / 2, `${t.id} “${o.text}” left`).toBeGreaterThanOrEqual(-1);
          expect(o.x + o.w / 2, `${t.id} “${o.text}” right`).toBeLessThanOrEqual(p.width + 1);
          expect(fits(o), `${t.id} “${o.text}” fits`).toBe(true);
        }
    }
  });

  it('clean templates use their own look when the Look is auto; older ones keep the icons’ colours', () => {
    const all = themeChoices(null, []);
    expect(resolveTheme('auto', all, 'pro-editorial')?.id).toBe('pro-editorial');
    expect(resolveTheme('auto', all, 'wall-cover')?.id).toBe('minimal-dark');
    expect(resolveTheme('auto', all, 'cover-ribbon')?.id).toBe('minimal-dark');
    for (const t of PRO_TEMPLATES) expect(THEMES.some((x) => x.id === t.look), t.id).toBe(true);
  });

  it('facts on clean templates come from the files', () => {
    const d = createProject('Facts');
    d.assets = Array.from({ length: 10 }, (_, i) => icon(i));
    loadDoc(d);
    const p = PRO_TEMPLATES.find((t) => t.id === 'pro-minimal-cover')!.build(d.assets, 'Loot', d.pages[0].background);
    const texts = p.objects.filter((o): o is TextObject => o.type === 'text').map((t) => t.text);
    expect(texts.some((t) => t.includes('PNG') && t.includes('WEBP') && t.includes('32–256 px') && t.includes('transparent'))).toBe(true);
  });
});
