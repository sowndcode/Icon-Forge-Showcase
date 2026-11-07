import { describe, expect, it } from 'vitest';
import { analyzeAlpha } from '../src/core/alpha';

function img(w: number, h: number, fn: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = fn(x, y);
  return d;
}

describe('alpha bounds', () => {
  it('ignores a stray speck and faint haze', () => {
    const d = img(100, 100, (x, y) => (x >= 20 && x < 70 && y >= 30 && y < 80 ? 255 : (x === 97 && y === 3) || (x === 2 && y === 96) ? 255 : 14));
    const a = analyzeAlpha(d, 100, 100);
    expect(a.bounds).toEqual({ x: 20, y: 30, w: 50, h: 50 });
  });

  it('keeps a real separate part (a sparkle next to the icon)', () => {
    const d = img(100, 100, (x, y) => ((x >= 20 && x < 60 && y >= 20 && y < 60) || (x >= 70 && x < 80 && y >= 10 && y < 20) ? 255 : 0));
    const a = analyzeAlpha(d, 100, 100);
    expect(a.bounds).toEqual({ x: 20, y: 10, w: 60, h: 50 });
  });
});
