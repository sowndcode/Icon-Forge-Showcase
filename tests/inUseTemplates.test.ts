// In-use templates (inventory, hotbar, size ladder, bento): slot frames sit on the icons' cells,
// also after a Format change; labels are read from the files; the size ladder uses honest sizes.

import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/defaults';
import type { AssetRecord, ShapeObject, TextObject } from '../src/core/types';
import { loadDoc } from '../src/state/doc';
import { IN_USE_TEMPLATES, ladderSizes, previewTemplate, TEMPLATE_GROUPS, templateGroup, wrapLines } from '../src/state/generators';

function icon(i: number, s = 64): AssetRecord {
  return { id: `as${i}`, name: `0${i}_fire_sword.png`, format: 'png', kind: 'asset', folder: 'Pack', category: 'Weapons', width: s, height: s, bytes: 100, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 0, y: 0, w: s, h: s }, occupancy: 0.5, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: s / 2, y: s / 2 } } };
}
const tpl = (id: string) => IN_USE_TEMPLATES.find((t) => t.id === id)!;
const texts = (p: { objects: { type: string }[] }) => p.objects.filter((o): o is TextObject => o.type === 'text').map((t) => t.text);

describe('in-use templates', () => {
  it('are listed in existing or new menus', () => {
    for (const t of IN_USE_TEMPLATES) expect(TEMPLATE_GROUPS.some((g) => g.id === templateGroup(t)), t.id).toBe(true);
  });

  for (const id of ['ui-inventory', 'ui-inventory-cover', 'ui-hotbar'])
    for (const size of [undefined, { w: 1080, h: 1080 }, { w: 630, h: 500 }])
      it(`${id}: every icon sits centred in a slot frame${size ? ` at ${size.w}×${size.h}` : ''}`, () => {
        const d = createProject('Slots');
        d.assets = Array.from({ length: 13 }, (_, i) => icon(i));
        loadDoc(d);
        const p = previewTemplate(tpl(id), d.assets, undefined, 400, { text: 'keep', icons: 1, size });
        const slots = p.objects.filter((o): o is ShapeObject => o.type === 'shape' && /^Slot \d+$/.test(o.name));
        const icons = p.objects.filter((o) => o.type === 'image' && !o.name.startsWith('Featured'));
        expect(icons.length).toBeGreaterThan(0);
        // more slots than icons: empty slots stay visible
        expect(slots.length).toBeGreaterThanOrEqual(icons.length);
        for (const im of icons) {
          const hit = slots.find((s) => Math.abs(s.x - im.x) < 1 && Math.abs(s.y - im.y) < 1);
          expect(hit, `${id} icon at ${im.x.toFixed(0)},${im.y.toFixed(0)}`).toBeTruthy();
          expect(Math.max(im.w, im.h)).toBeLessThanOrEqual(hit!.w);
        }
        // the selected frame is on the first slot
        const sel = p.objects.find((o) => o.name === 'Selected slot')!;
        expect(Math.hypot(sel.x - slots[0].x, sel.y - slots[0].y)).toBeLessThan(1);
      });

  it('the tooltip shows the selected icon’s real name, category and size', () => {
    const d = createProject('Facts');
    d.assets = [icon(3, 32), icon(4)];
    loadDoc(d);
    const p = tpl('ui-inventory').build(d.assets, 'Loot', d.pages[0].background);
    expect(texts(p)).toEqual(expect.arrayContaining(['Fire Sword', 'Weapons', '32×32 px · PNG']));
  });

  it('size ladder: whole-number steps for pixel art, UI sizes for larger art, never above twice the source', () => {
    expect(ladderSizes(16, 400)).toEqual([16, 32, 64, 128, 256].map((px, i) => ({ px, mult: 2 ** i })));
    expect(ladderSizes(32, 400).map((s) => s.px)).toEqual([32, 64, 128, 256]);
    expect(ladderSizes(128, 400)).toEqual([
      { px: 32, mult: 0 },
      { px: 64, mult: 0 },
      { px: 128, mult: 1 },
      { px: 256, mult: 2 },
    ]);
    expect(ladderSizes(512, 400).map((s) => s.px)).toEqual([32, 64, 128, 256]);
    expect(ladderSizes(0, 400).map((s) => s.px)).toEqual([32, 64, 128, 256]);
    expect(ladderSizes(48, 400).map((s) => s.px)).toEqual([48, 96, 192, 384]);
  });

  it('size ladder labels match the drawn sizes', () => {
    const d = createProject('Ladder');
    d.assets = Array.from({ length: 6 }, (_, i) => icon(i, 32));
    loadDoc(d);
    const p = tpl('size-ladder').build(d.assets, 'Pixel', d.pages[0].background);
    for (const px of [32, 64, 128, 256]) {
      const im = p.objects.find((o) => o.type === 'image' && o.name.endsWith(` ${px} px`));
      expect(im?.w, `${px} px`).toBeCloseTo(px);
      expect(texts(p)).toContain(`${px} px`);
    }
  });

  it('wraps titles into the fewest balanced lines that fit', () => {
    const style = { fontSize: 96, fontFamily: 'Geist Variable', fontWeight: 700 };
    expect(wrapLines('Cozy Farm', style, 2000, 3)).toBe('Cozy Farm');
    const two = wrapLines('Fantasy RPG Icon Pack', style, 700, 3);
    expect(two.split('\n')).toHaveLength(2);
    expect(wrapLines('A B C D E F G H', style, 1, 3).split('\n')).toHaveLength(3);
  });
});
