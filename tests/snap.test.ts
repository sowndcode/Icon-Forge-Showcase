import { describe, expect, it } from 'vitest';
import { buildTargets, snapAngle, snapRect, snapResizeAxis, type SnapSettings } from '../src/core/snap';

const S: SnapSettings = { enabled: true, canvas: true, objects: true, guides: true, grid: false, gridSize: 20, strength: 6 };
const page = { width: 1000, height: 600 };

describe('smart guides', () => {
  it('snaps to the page center and marks it as a center guide', () => {
    const t = buildTargets(page, [], [], null, S);
    const r = snapRect({ x: 453, y: 100, w: 100, h: 100 }, t, S, 1);
    expect(r.dx).toBe(-3); // center 503 → 500
    expect(r.guides.some((g) => g.axis === 'x' && g.kind === 'center' && g.pos === 500)).toBe(true);
  });

  it('snaps to equal spacing between left and right neighbours with distance labels', () => {
    const others = [
      { x: 100, y: 200, w: 100, h: 100 },
      { x: 500, y: 200, w: 100, h: 100 },
    ];
    const t = buildTargets(page, others, [], null, { ...S, canvas: false });
    // gaps 98 / 102 → shifts 2px right to make both 100
    const r = snapRect({ x: 298, y: 210, w: 100, h: 80 }, t, { ...S, canvas: false }, 1);
    expect(r.dx).toBe(2);
    const gaps = r.guides.filter((g) => g.kind === 'gap');
    expect(gaps).toHaveLength(2);
    expect(gaps.every((g) => g.label === '100')).toBe(true);
  });

  it('ignores far-away objects so big packs do not snap everywhere', () => {
    const t = buildTargets(page, [{ x: 900, y: 550, w: 20, h: 20 }], [], null, { ...S, canvas: false });
    const r = snapRect({ x: 897, y: 10, w: 20, h: 20 }, t, { ...S, canvas: false }, 4);
    expect(r.dx).toBe(0);
  });

  it('marks the object an alignment line belongs to, and ranks the page center above edges', () => {
    const other = { x: 100, y: 400, w: 80, h: 80 };
    const t = buildTargets(page, [other], [], null, S);
    const r = snapRect({ x: 103, y: 250, w: 80, h: 80 }, t, S, 1);
    expect(r.dx).toBe(-3);
    expect(r.guides.find((g) => g.kind === 'target')?.rect).toEqual(other);
    const c = snapRect({ x: 453, y: 100, w: 100, h: 100 }, buildTargets(page, [], [], null, S), S, 1);
    expect(c.guides.some((g) => g.kind === 'center')).toBe(true);
    const e = snapRect({ x: 3, y: 100, w: 100, h: 100 }, buildTargets(page, [], [], null, S), S, 1);
    expect(e.guides.some((g) => g.kind === 'edge')).toBe(true);
  });

  it('rotation gently locks to 0/45/90', () => {
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(30)).toBe(30);
  });
});

describe('resize snapping', () => {
  const s = { enabled: true, canvas: true, objects: true, guides: true, grid: false, gridSize: 20, strength: 10, spacing: true };
  const targets = buildTargets({ width: 1000, height: 800 }, [{ x: 600, y: 100, w: 100, h: 100 }], [], null, s);
  it('snaps the dragged right edge to another object', () => {
    const r = snapResizeAxis({ x: 200, y: 120, w: 395, h: 80 }, 'x', 1, targets, s, 1);
    expect(r?.d).toBeCloseTo(5);
    expect(r?.side).toBe(1);
  });
  it('snaps the dragged left edge to the page center', () => {
    const r = snapResizeAxis({ x: 503, y: 300, w: 200, h: 80 }, 'x', -1, targets, s, 1);
    expect(r?.d).toBeCloseTo(-3);
  });
  it('ignores edges that are not being dragged', () => {
    expect(snapResizeAxis({ x: 503, y: 300, w: 170, h: 80 }, 'x', 1, targets, s, 1)).toBeNull();
  });
});
