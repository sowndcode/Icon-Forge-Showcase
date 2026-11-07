// Custom Path distribution: assets along an editable curve (Catmull-Rom through control points).

import { pointAt, samplePath } from '../core/spline';
import type { Rect, Vec } from '../core/types';
import { boxForSize } from './common';
import { bool, num, type LayoutAlgorithm, type Placement } from './types';

export type PathPreset = 'arc' | 'wave' | 'diagonal' | 'scurve' | 'smile' | 'line';

export function presetPath(kind: PathPreset, a: Rect): Vec[] {
  const P = (x: number, y: number) => ({ x: a.x + x * a.w, y: a.y + y * a.h });
  switch (kind) {
    case 'wave':
      return [P(0.04, 0.5), P(0.27, 0.25), P(0.5, 0.5), P(0.73, 0.75), P(0.96, 0.5)];
    case 'diagonal':
      return [P(0.08, 0.85), P(0.5, 0.5), P(0.92, 0.15)];
    case 'scurve':
      return [P(0.1, 0.12), P(0.75, 0.25), P(0.3, 0.6), P(0.9, 0.88)];
    case 'smile':
      return [P(0.06, 0.3), P(0.5, 0.82), P(0.94, 0.3)];
    case 'line':
      return [P(0.05, 0.5), P(0.95, 0.5)];
    case 'arc':
    default:
      return [P(0.06, 0.78), P(0.28, 0.32), P(0.5, 0.2), P(0.72, 0.32), P(0.94, 0.78)];
  }
}

export const pathLayout: LayoutAlgorithm = {
  id: 'path',
  label: 'Custom Path',
  description: 'Distribute assets along a curve. Drag the path points on the canvas.',
  group: 'Showcase',
  usesPath: true,
  params: [
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.9, min: 0.2, max: 2, step: 0.01, scale: 100, unit: '%' },
    { key: 'spacing', label: 'Spacing', type: 'range', default: 0, min: -0.5, max: 2, step: 0.01, scale: 100, unit: '%', hint: '0 = fit the path exactly' },
    { key: 'scaleStart', label: 'Scale at start', type: 'range', default: 1, min: 0.1, max: 3, step: 0.01, scale: 100, unit: '%' },
    { key: 'scaleEnd', label: 'Scale at end', type: 'range', default: 1, min: 0.1, max: 3, step: 0.01, scale: 100, unit: '%' },
    { key: 'follow', label: 'Rotation follows path', type: 'bool', default: false },
    { key: 'reverse', label: 'Reverse', type: 'bool', default: false },
    { key: 'startOff', label: 'Start offset', type: 'range', default: 0, min: 0, max: 0.45, step: 0.01, scale: 100, unit: '%', advanced: true },
    { key: 'endOff', label: 'End offset', type: 'range', default: 0, min: 0, max: 0.45, step: 0.01, scale: 100, unit: '%', advanced: true },
    { key: 'maxSize', label: 'Max asset size', type: 'range', default: 0.28, min: 0.03, max: 1, step: 0.01, scale: 100, unit: '%', advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const ctrl = ctx.path && ctx.path.length >= 2 ? ctx.path : presetPath('arc', ctx.area);
    const path = samplePath(ctrl);
    const s0 = num(p, 'startOff'),
      s1 = 1 - num(p, 'endOff');
    const span = Math.max(0.01, s1 - s0);
    const len = path.total * span;
    const sStart = num(p, 'scaleStart', 1),
      sEnd = num(p, 'scaleEnd', 1);
    const avgScale = (sStart + sEnd) / 2;
    const spacing = num(p, 'spacing');
    const pitch = len / n;
    const base = Math.min((pitch / (1 + Math.max(-0.5, spacing))) * num(p, 'fill', 0.9) / avgScale, Math.min(ctx.page.w, ctx.page.h) * num(p, 'maxSize', 0.28));
    const reverse = bool(p, 'reverse');
    const follow = bool(p, 'follow');
    const out: Placement[] = [];
    items.forEach((it, i) => {
      const f = n === 1 ? 0.5 : (i + 0.5) / n;
      const t = s0 + span * (reverse ? 1 - f : f);
      const { p: pt, angle } = pointAt(path, t);
      const k = sStart + (sEnd - sStart) * f;
      const b = boxForSize(it, base * k);
      let rot = 0;
      if (follow) {
        rot = angle;
        if (rot > 90) rot -= 180;
        if (rot < -90) rot += 180;
      }
      out.push({ id: it.id, cx: pt.x, cy: pt.y, w: b.w, h: b.h, rot, z: i });
    });
    return out;
  },
};
