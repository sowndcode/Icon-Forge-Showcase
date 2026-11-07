// Radial layouts: Circle, Arc, Spiral, Fan.

import { DEG, normAngle } from '../core/geometry';
import { apportion, boxForSize, fitPlacements } from './common';
import { bool, num, str, type LayoutAlgorithm, type Placement } from './types';

const rotateOptions = [
  { value: 'none', label: 'Upright' },
  { value: 'tangent', label: 'Follow curve' },
  { value: 'outward', label: 'Point outward' },
];

function itemRotation(mode: string, angleDeg: number): number {
  if (mode === 'tangent') {
    let r = normAngle(angleDeg + 90);
    if (r > 90) r -= 180;
    if (r < -90) r += 180;
    return r;
  }
  if (mode === 'outward') return angleDeg + 90;
  return 0;
}

export const circleLayout: LayoutAlgorithm = {
  id: 'circle',
  label: 'Circle',
  description: 'Concentric rings around the center; optional hero in the middle.',
  group: 'Organize',
  params: [
    { key: 'rings', label: 'Rings', type: 'int', default: 0, min: 0, max: 12, autoZero: true },
    { key: 'radius', label: 'Radius', type: 'range', default: 0.92, min: 0.2, max: 1.2, step: 0.01, scale: 100, unit: '%' },
    { key: 'inner', label: 'Inner radius', type: 'range', default: 0.3, min: 0, max: 0.9, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.8, min: 0.3, max: 1.4, step: 0.01, scale: 100, unit: '%' },
    { key: 'center', label: 'Center item', type: 'bool', default: true },
    { key: 'stretch', label: 'Stretch to canvas', type: 'bool', default: false },
    { key: 'rotate', label: 'Rotation', type: 'select', default: 'none', options: rotateOptions, advanced: true },
    { key: 'start', label: 'Start angle', type: 'range', default: -90, min: -180, max: 180, unit: '°', advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    const R = (Math.min(a.w, a.h) / 2) * num(p, 'radius', 0.92);
    const stretch = bool(p, 'stretch');
    const sx = stretch ? a.w / Math.min(a.w, a.h) : 1;
    const sy = stretch ? a.h / Math.min(a.w, a.h) : 1;
    const fill = num(p, 'fill', 0.8);
    const out: Placement[] = [];
    let list = items;
    const useCenter = bool(p, 'center', true) && n > 4;
    let rings = num(p, 'rings');
    const innerFrac = num(p, 'inner', 0.3);
    if (!rings) rings = Math.max(1, Math.round(Math.sqrt(n / 7)));
    const innerR = rings === 1 ? R * 0.82 : R * Math.max(innerFrac, 0.12);
    const radii = Array.from({ length: rings }, (_, k) => (rings === 1 ? R * 0.82 : innerR + ((R - innerR) * k) / (rings - 1)));
    const ringGap = rings > 1 ? (R - innerR) / (rings - 1) : R * 0.36;
    if (useCenter) {
      const hero = list[0];
      const b = boxForSize(hero, Math.min(innerR * 1.3, R * 0.5) * fill);
      out.push({ id: hero.id, cx, cy, w: b.w, h: b.h, rot: 0, z: 1e6 });
      list = list.slice(1);
    }
    const counts = apportion(list.length, radii, 1);
    let k = 0;
    const start = num(p, 'start', -90);
    const mode = str(p, 'rotate', 'none');
    radii.forEach((r, ri) => {
      const cnt = counts[ri];
      const arc = (2 * Math.PI * r) / Math.max(1, cnt);
      const t = Math.min(arc, ringGap) * fill * 0.92;
      for (let j = 0; j < cnt; j++, k++) {
        const it = list[k];
        const ang = start + (360 * j) / cnt + (ri % 2 ? 180 / cnt : 0);
        const b = boxForSize(it, t);
        out.push({ id: it.id, cx: cx + Math.cos(ang * DEG) * r * sx, cy: cy + Math.sin(ang * DEG) * r * sy, w: b.w, h: b.h, rot: itemRotation(mode, ang) });
      }
    });
    return fitPlacements(out, a);
  },
};

export const arcLayout: LayoutAlgorithm = {
  id: 'arc',
  label: 'Arc',
  description: 'Assets along one or more arcs — great above or below a title.',
  group: 'Organize',
  params: [
    { key: 'span', label: 'Arc angle', type: 'range', default: 150, min: 20, max: 340, unit: '°' },
    { key: 'rows', label: 'Arc rows', type: 'int', default: 0, min: 0, max: 8, autoZero: true },
    { key: 'curve', label: 'Curvature', type: 'range', default: 0.55, min: 0.05, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.82, min: 0.3, max: 1.4, step: 0.01, scale: 100, unit: '%' },
    { key: 'invert', label: 'Smile (curve down)', type: 'bool', default: false },
    { key: 'rotate', label: 'Rotation', type: 'select', default: 'none', options: rotateOptions },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const span = num(p, 'span', 150);
    const invert = bool(p, 'invert');
    let rows = num(p, 'rows');
    if (!rows) rows = Math.max(1, Math.min(6, Math.round(Math.sqrt(n / 10))));
    const curve = num(p, 'curve', 0.55);
    // radius such that the chord spans the area width
    const half = (span / 2) * DEG;
    const chordR = a.w / 2 / Math.max(0.2, Math.sin(Math.min(half, Math.PI / 2)));
    const R = chordR / curve;
    const rowGap = Math.min(a.h / (rows + 0.5), R * 0.4);
    const radii = Array.from({ length: rows }, (_, r) => R - r * rowGap);
    const counts = apportion(n, radii.map((r) => r * span), 1);
    const mode = str(p, 'rotate', 'none');
    const fill = num(p, 'fill', 0.82);
    const cx = a.x + a.w / 2;
    const cy = 0; // absolute position is irrelevant: the result is fitted into the area below
    const out: Placement[] = [];
    let k = 0;
    radii.forEach((r, ri) => {
      const cnt = counts[ri];
      const effSpan = span * Math.min(1, 1.05 - curve * 0.05);
      const arcLen = r * effSpan * DEG;
      const t = Math.min(arcLen / cnt, rowGap) * fill;
      for (let j = 0; j < cnt; j++, k++) {
        const it = items[k];
        const f = cnt === 1 ? 0.5 : j / (cnt - 1);
        const angUp = -90 - effSpan / 2 + effSpan * f; // around top
        const ang = invert ? -angUp : angUp;
        const b = boxForSize(it, t);
        const px = cx + Math.cos(ang * DEG) * r;
        const py = cy + Math.sin(ang * DEG) * r;
        out.push({ id: it.id, cx: px, cy: py, w: b.w, h: b.h, rot: itemRotation(mode, ang) });
      }
    });
    return fitPlacements(out, a, true);
  },
};

export const spiralLayout: LayoutAlgorithm = {
  id: 'spiral',
  label: 'Spiral',
  description: 'Golden-angle (sunflower) or Archimedean spiral from the center out.',
  group: 'Showcase',
  params: [
    {
      key: 'kind',
      label: 'Type',
      type: 'select',
      default: 'golden',
      options: [
        { value: 'golden', label: 'Sunflower' },
        { value: 'arch', label: 'Archimedean' },
      ],
    },
    { key: 'growth', label: 'Size progression', type: 'range', default: 0.35, min: -1, max: 1, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 0.85, min: 0.3, max: 1.4, step: 0.01, scale: 100, unit: '%' },
    { key: 'turns', label: 'Turns', type: 'range', default: 3, min: 1, max: 10, step: 0.1, decimals: 1, when: (p) => p.kind === 'arch' },
    { key: 'stretch', label: 'Stretch to canvas', type: 'bool', default: true },
    { key: 'rotate', label: 'Rotation', type: 'select', default: 'none', options: rotateOptions, advanced: true },
    { key: 'reverse', label: 'Largest in center', type: 'bool', default: false, advanced: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    const cx = a.x + a.w / 2,
      cy = a.y + a.h / 2;
    const R = Math.min(a.w, a.h) / 2;
    const stretch = bool(p, 'stretch', true);
    const sx = stretch ? a.w / (2 * R) : 1;
    const sy = stretch ? a.h / (2 * R) : 1;
    const growth = num(p, 'growth', 0.35) * (bool(p, 'reverse') ? -1 : 1);
    const fill = num(p, 'fill', 0.85);
    const mode = str(p, 'rotate', 'none');
    const out: Placement[] = [];
    if (str(p, 'kind', 'golden') === 'golden') {
      const c = R / Math.sqrt(n + 0.5);
      items.forEach((it, i) => {
        const r = c * Math.sqrt(i + 0.5);
        const ang = i * 137.508;
        const f = n > 1 ? i / (n - 1) : 0.5;
        const g = 1 + growth * (f - 0.5);
        const b = boxForSize(it, c * 1.62 * fill * g * Math.min(sx, sy) ** 0.3);
        out.push({ id: it.id, cx: cx + Math.cos(ang * DEG) * r * sx, cy: cy + Math.sin(ang * DEG) * r * sy, w: b.w, h: b.h, rot: itemRotation(mode, ang) });
      });
    } else {
      const turns = num(p, 'turns', 3);
      const thetaMax = turns * 2 * Math.PI;
      const b0 = R / thetaMax;
      // arc length sampling
      const samples = 2000;
      const L: number[] = [0];
      for (let s = 1; s <= samples; s++) {
        const t0 = ((s - 1) / samples) * thetaMax,
          t1 = (s / samples) * thetaMax;
        const p0 = { x: b0 * t0 * Math.cos(t0), y: b0 * t0 * Math.sin(t0) };
        const p1 = { x: b0 * t1 * Math.cos(t1), y: b0 * t1 * Math.sin(t1) };
        L.push(L[s - 1] + Math.hypot(p1.x - p0.x, p1.y - p0.y));
      }
      const total = L[samples];
      const startL = total * 0.04;
      const step = (total - startL) / Math.max(1, n);
      let si = 0;
      items.forEach((it, i) => {
        const target = startL + step * (i + 0.5);
        while (si < samples && L[si] < target) si++;
        const th = (si / samples) * thetaMax;
        const r = b0 * th;
        const f = n > 1 ? i / (n - 1) : 0.5;
        const g = 1 + growth * (f - 0.5);
        const b = boxForSize(it, Math.min(step, 2 * Math.PI * b0) * fill * g);
        const ang = (th * 180) / Math.PI;
        out.push({ id: it.id, cx: cx + Math.cos(th) * r * sx, cy: cy + Math.sin(th) * r * sy, w: b.w, h: b.h, rot: itemRotation(mode, ang) });
      });
    }
    return fitPlacements(out, a);
  },
};

export const fanLayout: LayoutAlgorithm = {
  id: 'fan',
  label: 'Fan',
  description: 'A hand-of-cards fan: overlapping, rotated outward from a pivot below.',
  group: 'Showcase',
  defaultOverlap: 'showcase',
  params: [
    { key: 'spread', label: 'Spread', type: 'range', default: 70, min: 10, max: 300, unit: '°' },
    { key: 'layers', label: 'Layers', type: 'int', default: 0, min: 0, max: 6, autoZero: true },
    { key: 'radius', label: 'Pivot distance', type: 'range', default: 1.1, min: 0.3, max: 3, step: 0.01, scale: 100, unit: '%' },
    { key: 'fill', label: 'Asset scale', type: 'range', default: 1, min: 0.3, max: 2, step: 0.01, scale: 100, unit: '%' },
    { key: 'centerTop', label: 'Center on top', type: 'bool', default: true },
  ],
  run(items, p, ctx) {
    const n = items.length;
    if (!n) return [];
    const a = ctx.area;
    let layers = num(p, 'layers');
    if (!layers) layers = Math.max(1, Math.min(5, Math.ceil(n / 14)));
    const counts = apportion(n, Array.from({ length: layers }, (_, i) => layers - i * 0.25), 1);
    const spread = num(p, 'spread', 70);
    const baseR = Math.min(a.w, a.h) * num(p, 'radius', 1.1) * 0.5;
    const out: Placement[] = [];
    let k = 0;
    const centerTop = bool(p, 'centerTop', true);
    for (let L = 0; L < layers; L++) {
      const cnt = counts[L];
      const r = baseR * (1 - L * 0.22);
      const arc = r * spread * DEG;
      const t = Math.min((arc / Math.max(1, cnt)) * 1.9, r * 0.9) * num(p, 'fill', 1);
      for (let j = 0; j < cnt; j++, k++) {
        const it = items[k];
        const f = cnt === 1 ? 0.5 : j / (cnt - 1);
        const ang = -spread / 2 + spread * f; // 0 = up
        const b = boxForSize(it, t);
        const px = Math.sin(ang * DEG) * r;
        const py = -Math.cos(ang * DEG) * r;
        const zc = centerTop ? 1000 - Math.abs(f - 0.5) * 1000 : j;
        out.push({ id: it.id, cx: px, cy: py, w: b.w, h: b.h, rot: ang, z: (layers - L) * 10000 + zc });
      }
    }
    return fitPlacements(out, a, true);
  },
};
