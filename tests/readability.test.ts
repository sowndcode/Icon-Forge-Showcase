// Theme text colours against what is really behind them (regression: Minimal light gave the titles
// of dark-panel templates near-black text on a near-black panel).
import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createPage, createProject, createShape, createText } from '../src/core/defaults';
import { backdropOf, contrast, ensureReadableText, separateOutline } from '../src/core/readability';
import { THEMES } from '../src/core/themes';
import type { AssetRecord, Background, Page, TextObject } from '../src/core/types';
import { loadDoc } from '../src/state/doc';
import { BUILTIN_TEMPLATES, previewTemplate } from '../src/state/generators';
import { themedPage } from '../src/state/themes';

const theme = (id: string) => THEMES.find((t) => t.id === id)!;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const solid = (p: Page, color: string): Background => ({ ...p.background, type: 'solid', color, pattern: { ...p.background.pattern, enabled: false }, light: { ...p.background.light, enabled: false }, overlay: { ...p.background.overlay, enabled: false } });

function page(bg: string, panel?: { fill: string; opacity: number }, textFill = '#111318') {
  const p = createPage('p', 1920, 1080);
  p.background = solid(p, bg);
  const t = createText('TITLE', 960, 300);
  t.style = { ...t.style, fill: textFill, fillMode: 'solid', stroke: { ...t.style.stroke!, enabled: false } };
  p.objects = [...(panel ? [createShape('rect', 960, 300, 1200, 300, { fill: panel.fill, opacity: panel.opacity, name: 'Panel' })] : []), t];
  return p;
}
const textOf = (p: Page) => p.objects.find((o): o is TextObject => o.type === 'text')!;
const palette = (designed: string) => ({ candidates: ['#ffffff', '#4b5563', '#111318'], designedFor: solid(createPage('x', 10, 10), designed) });

describe('text readability against its backdrop', () => {
  it('sees panels, including translucent ones, behind the text', () => {
    const p = page('#ffffff', { fill: '#000000', opacity: 0.5 });
    const b = backdropOf(p, 1)[0]!;
    expect(b[0]).toBeCloseTo(127.5, 0);
    expect(backdropOf(page('#ffffff'), 0)[0]).toEqual([255, 255, 255]);
  });

  it('dark text on a dark panel of a light theme becomes readable', () => {
    const p = ensureReadableText(page('#f4f4f5', { fill: '#0b0b10', opacity: 0.92 }), palette('#f4f4f5'));
    const t = textOf(p);
    expect(t.style.fill).toBe('#ffffff');
    expect(contrast(hex(t.style.fill), backdropOf(p, 1)[0]!)).toBeGreaterThan(4.5);
  });

  it('a theme pairing chosen on purpose is left alone (dark red on black)', () => {
    const p = page('#050101', undefined, '#7f1d1d');
    expect(ensureReadableText(p, palette('#050101'))).toBe(p);
  });

  it('text that already reads, or whose outline carries it, is unchanged', () => {
    const ok = page('#ffffff', { fill: '#ffffff', opacity: 1 });
    expect(ensureReadableText(ok, palette('#ffffff'))).toBe(ok);
    const outlined = page('#f4f4f5', { fill: '#0b0b10', opacity: 0.92 });
    const t = textOf(outlined);
    t.style = { ...t.style, stroke: { enabled: true, color: '#ffffff', width: t.style.fontSize * 0.08 } };
    expect(textOf(ensureReadableText(outlined, palette('#f4f4f5'))).style.fill).toBe('#111318');
  });

  it('backgrounds that cannot be known (images) are not guessed at', () => {
    const p = page('#ffffff');
    p.background = { ...p.background, type: 'image' };
    expect(ensureReadableText(p, palette('#ffffff'))).toBe(p);
  });

  it('an outline the fill cannot be told apart from takes a distinct colour', () => {
    const t = textOf(page('#ffffff'));
    t.style = { ...t.style, fill: '#111318', stroke: { enabled: true, color: '#0a0a0a', width: t.style.fontSize * 0.1 } };
    expect(separateOutline(t, ['#ffffff', '#111318']).style.stroke!.color).toBe('#ffffff');
  });
});

describe('themes on templates with panels', () => {
  const assets: AssetRecord[] = Array.from({ length: 24 }, (_, i) => ({ id: 'as' + i, name: `i${i}.png`, format: 'png', kind: 'asset', folder: '', category: '', width: 64, height: 64, bytes: 1, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 4, y: 4, w: 56, h: 56 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 32, y: 32 } } }));
  loadDoc({ ...createProject('t'), assets });

  for (const id of ['wall-cover', 'cover-ribbon', 'cover-band', 'perspective', 'square', 'wide-band']) {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === id);
    if (!t) continue;
    for (const th of ['minimal-light', 'minimal-dark', 'mono', 'fantasy']) {
      it(`${t.name} with ${th}: every title and subtitle reads on what is behind it`, () => {
        const p = previewTemplate(t, assets, undefined, 120, { text: 'keep', icons: 1, theme: theme(th) });
        p.objects.forEach((o, i) => {
          if (o.type !== 'text' || o.style.badge?.enabled) return;
          const behind = backdropOf(p, i).filter((v): v is [number, number, number] => !!v);
          const outline = o.style.stroke?.enabled && o.style.stroke.width >= o.style.fontSize * 0.035 ? hex(o.style.stroke.color) : null;
          for (const b of behind) expect(Math.max(contrast(hex(o.style.fill), b), outline ? contrast(outline, b) : 0), `${o.text} ${o.style.fill}`).toBeGreaterThanOrEqual(3);
        });
      });
    }
  }

  it('themed pages without panels keep the theme colours exactly', () => {
    const p = page('#ffffff');
    p.objects = p.objects.filter((o) => o.type === 'text');
    const out = themedPage(p, theme('minimal-light'));
    expect(textOf(out).style.fill).toBe(theme('minimal-light').title.fill);
  });
});
