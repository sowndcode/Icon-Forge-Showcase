// Projective mapping between the unit square (u, v) and an arbitrary quad.
// Used by the perspective plane: u = across, v = depth (0 = far edge, 1 = near edge for floors).

import type { Quad, Vec } from './types';
import { lerp } from './geometry';

export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Matrix mapping the unit square (0,0)(1,0)(1,1)(0,1) onto quad corners q0..q3 (Heckbert). */
export function squareToQuad(q: Quad): Mat3 {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // affine
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1];
  }
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

export function applyMat(m: Mat3, u: number, v: number): Vec {
  const w = m[6] * u + m[7] * v + m[8];
  return { x: (m[0] * u + m[1] * v + m[2]) / w, y: (m[3] * u + m[4] * v + m[5]) / w };
}

export function invertMat(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function bilinear(q: Quad, u: number, v: number): Vec {
  const top = { x: lerp(q[0].x, q[1].x, u), y: lerp(q[0].y, q[1].y, u) };
  const bot = { x: lerp(q[3].x, q[2].x, u), y: lerp(q[3].y, q[2].y, u) };
  return { x: lerp(top.x, bot.x, v), y: lerp(top.y, bot.y, v) };
}

/** Plane mapper: blends bilinear (strength 0) and true projective mapping (strength 1). */
export class PlaneMap {
  private m: Mat3;
  private inv: Mat3;
  constructor(public quad: Quad, public strength = 1) {
    this.m = squareToQuad(quad);
    this.inv = invertMat(this.m);
  }
  map(u: number, v: number): Vec {
    const p = applyMat(this.m, u, v);
    if (this.strength >= 1) return p;
    const b = bilinear(this.quad, u, v);
    return { x: lerp(b.x, p.x, this.strength), y: lerp(b.y, p.y, this.strength) };
  }
  /** Inverse of the projective mapping (good enough for depth estimation in blended modes). */
  unmap(p: Vec): Vec {
    return applyMat(this.inv, p.x, p.y);
  }
  /** Screen-space width of the plane at depth v. */
  widthAt(v: number): number {
    const a = this.map(0, v),
      b = this.map(1, v);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
  heightAt(u: number): number {
    const a = this.map(u, 0),
      b = this.map(u, 1);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
}

/** Approximate vanishing point of the left/right edges (null when parallel). */
export function vanishingPoint(q: Quad): Vec | null {
  const [a, b, c, d] = q; // left edge d→a, right edge c→b
  const x1 = d.x,
    y1 = d.y,
    x2 = a.x,
    y2 = a.y,
    x3 = c.x,
    y3 = c.y,
    x4 = b.x,
    y4 = b.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-6) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}
