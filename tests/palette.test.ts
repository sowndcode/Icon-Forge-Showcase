import { describe, expect, it } from 'vitest';
import { hsl, matchedBackgrounds, matchedThemes, paletteFromPixels, rgbToHsl } from '../src/core/palette';

function pixels(colors: [number, number, number, number][]) {
  const d = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((c, i) => d.set(c, i * 4));
  return d;
}

describe('palette from icons', () => {
  it('finds the main colours, most common first, ignoring outlines and transparency', () => {
    const px = [
      ...Array(60).fill([220, 40, 40, 255]), // red
      ...Array(30).fill([40, 90, 220, 255]), // blue
      ...Array(80).fill([10, 10, 10, 255]), // black outline
      ...Array(80).fill([0, 255, 0, 0]), // transparent
    ] as [number, number, number, number][];
    const p = paletteFromPixels(pixels(px))!;
    expect(p.colors[0]).toBe('#dc2828');
    expect(p.colors[1]).toBe('#285adc');
    expect(p.colors).toHaveLength(2);
  });
  it('returns null for gray-only art', () => {
    expect(paletteFromPixels(pixels(Array(20).fill([128, 128, 128, 255])))).toBeNull();
  });
  it('builds valid backgrounds and themes', () => {
    const p = { colors: ['#dc2828', '#285adc'], hues: [0, 225] };
    for (const b of matchedBackgrounds(p)) expect(b.bg().type).toBeTruthy();
    expect(matchedThemes(p)).toHaveLength(10);
    expect(new Set(matchedThemes(p).map((t) => t.id)).size).toBe(10);
    expect(rgbToHsl(255, 0, 0)[0]).toBe(0);
    expect(hsl(0, 1, 0.5)).toBe('#ff0000');
  });
});
