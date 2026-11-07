import { describe, expect, it } from 'vitest';
import { rectangleRows } from '../src/layout/common';

describe('complete rectangle grid', () => {
  it('uses an exact cols × rows split for 216 assets on a 16:9 page', () => {
    const r = rectangleRows(216, 1774, 934, 21, 0, 1);
    expect(r.exact).toBe(true);
    expect(r.cols * r.counts.length).toBe(216);
    expect(new Set(r.counts).size).toBe(1);
    expect(r.cols).toBe(18);
  });
  it('falls back to rows that differ by at most one for a prime count', () => {
    const r = rectangleRows(41, 1774, 934, 16, 16, 1);
    expect(r.counts.reduce((a, b) => a + b, 0)).toBe(41);
    expect(Math.max(...r.counts) - Math.min(...r.counts)).toBeLessThanOrEqual(1);
  });
});
