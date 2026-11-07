import { describe, expect, it } from 'vitest';
import { applyTextLook, defaultTextStyle } from '../src/core/defaults';
import { improveContrast, reduceEffects, suggestStyles, textContrast, TEXT_LOOKS } from '../src/core/textLooks';
import { withTextDefaults } from '../src/render/text';
import type { TextStyle } from '../src/core/types';

const style = (p: Partial<TextStyle> = {}) => withTextDefaults({ ...defaultTextStyle(), ...p });

describe('readability helpers', () => {
  it('improve contrast fixes a light title on a light background with colour only', () => {
    const s = style({ fill: '#f0f0f0', fontFamily: 'Georgia', fontSize: 80 });
    const behind = ['#e8e4dc', '#eeeae2', '#f4f0e8'];
    expect(textContrast(s, behind)).toBeLessThan(2);
    const fix = improveContrast(s, behind);
    const next = { ...s, ...fix };
    expect(textContrast(next, behind)).toBeGreaterThanOrEqual(4.5);
    expect(next.fontFamily).toBe('Georgia');
    expect(next.fontSize).toBe(80);
    expect(fix.stroke).toBeUndefined();
  });

  it('on a busy area it adds an outline in the opposite tone', () => {
    const s = style({ fill: '#ffffff', fontSize: 100 });
    const behind = ['#050505', '#808080', '#fafafa'];
    const next = { ...s, ...improveContrast(s, behind) };
    expect(next.stroke.enabled).toBe(true);
    expect(textContrast(next, behind)).toBeGreaterThanOrEqual(4.5);
  });

  it('readable text is left alone', () => {
    expect(improveContrast(style({ fill: '#ffffff' }), ['#101010'])).toEqual({});
  });

  it('reduce effects removes depth, glow and the second outline and lightens heavy weights', () => {
    const s = style({ fontSize: 100, fontWeight: 900, extrude: { enabled: true, color: '#000', depth: 20, angle: 90 }, glow: { enabled: true, color: '#f0f', blur: 30, opacity: 1 }, stroke: { enabled: true, color: '#000', width: 14 }, stroke2: { enabled: true, color: '#fff', width: 6 } });
    const r = { ...s, ...reduceEffects(s) };
    expect([r.extrude.enabled, r.glow.enabled, r.stroke2.enabled]).toEqual([false, false, false]);
    expect(r.stroke.width).toBeLessThanOrEqual(4);
    expect(r.fontWeight).toBe(700);
  });

  it('suggestions read on the background they were made for', () => {
    for (const bg of [{ avg: '#14161c', dark: '#0e0f13', light: '#20232b', busy: 0.05 }, { avg: '#efe7d8', dark: '#e2d8c6', light: '#f7f1e6', busy: 0.05 }, { avg: '#6a7f5a', dark: '#4e6040', light: '#8aa078', busy: 0.1 }]) {
      const s = style({ fill: '#888888' });
      expect(suggestStyles(s, bg).length).toBeGreaterThanOrEqual(2);
      for (const g of suggestStyles(s, bg)) expect(textContrast({ ...s, ...g.patch }, [bg.dark, bg.avg, bg.light]), g.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('looks keep the text size and alignment', () => {
    for (const l of TEXT_LOOKS) {
      const r = applyTextLook(style({ fontSize: 42, align: 'right' }), l.style);
      expect([r.fontSize, r.align]).toEqual([42, 'right']);
    }
  });
});
