// Catmull-Rom path through control points, sampled to a polyline with arc-length lookup.
// Used by Custom Path distribution.

import type { Vec } from './types';

export interface SampledPath {
  points: Vec[];
  lengths: number[]; // cumulative
  total: number;
}

export function samplePath(ctrl: Vec[], perSegment = 24): SampledPath {
  const pts: Vec[] = [];
  if (ctrl.length < 2) {
    const p = ctrl[0] ?? { x: 0, y: 0 };
    return { points: [p, p], lengths: [0, 0], total: 0 };
  }
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1),
      p1 = P(i),
      p2 = P(i + 1),
      p3 = P(i + 2);
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment,
        t2 = t * t,
        t3 = t2 * t;
      pts.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { points: pts, lengths, total: lengths[lengths.length - 1] };
}

/** Point and tangent angle (deg) at arc-length fraction t ∈ [0,1]. */
export function pointAt(path: SampledPath, t: number): { p: Vec; angle: number } {
  const target = Math.max(0, Math.min(1, t)) * path.total;
  let lo = 0,
    hi = path.lengths.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.lengths[mid] < target) lo = mid;
    else hi = mid;
  }
  const a = path.points[lo],
    b = path.points[hi];
  const seg = path.lengths[hi] - path.lengths[lo] || 1;
  const k = (target - path.lengths[lo]) / seg;
  return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}
