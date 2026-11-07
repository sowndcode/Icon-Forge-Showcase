// Layout registry. Add a new algorithm by importing it and appending it to ALGORITHMS.

import { cascadeLayout, columnsLayoutAlg, gridLayout, packedLayout, rowsLayoutAlg } from './organize';
import { bandsLayout, honeycombLayout, pyramidLayout } from './extra';
import { pathLayout } from './path';
import { perspectiveFloor, perspectiveWall } from './perspective';
import { groundPlaneLayout } from './ground';
import { arcLayout, circleLayout, fanLayout, spiralLayout } from './radial';
import { categoryBlocksLayout, featureGridLayout, masonryLayout, shapeFillLayout } from './more';
import { clusterLayout, edgeFrameLayout, heroLayout, roundClusterLayout, scatterLayout } from './scatter';
import { compareLayout, diagonalLayout, dualClusterLayout, heroShowcaseLayout, orbitLayout, ringLayout, splitLayout } from './showcase';
import { croppedFrameLayout, endlessFloorLayout, tiltedWallLayout } from './bleed';
import type { LayoutAlgorithm, ParamDef, Params } from './types';

/** Best / most used first within each group — the picker shows them in this order. */
export const ALGORITHMS: LayoutAlgorithm[] = [
  // Showcase
  clusterLayout,
  roundClusterLayout,
  heroShowcaseLayout,
  heroLayout,
  dualClusterLayout,
  splitLayout,
  orbitLayout,
  ringLayout,
  scatterLayout,
  bandsLayout,
  edgeFrameLayout,
  croppedFrameLayout,
  diagonalLayout,
  shapeFillLayout,
  spiralLayout,
  fanLayout,
  pyramidLayout,
  cascadeLayout,
  pathLayout,
  // Organize
  gridLayout,
  packedLayout,
  featureGridLayout,
  categoryBlocksLayout,
  compareLayout,
  masonryLayout,
  honeycombLayout,
  rowsLayoutAlg,
  columnsLayoutAlg,
  circleLayout,
  arcLayout,
  // Perspective
  endlessFloorLayout,
  tiltedWallLayout,
  perspectiveFloor,
  groundPlaneLayout,
  perspectiveWall,
];

const byId = new Map(ALGORITHMS.map((a) => [a.id, a]));

export function getAlgorithm(id: string): LayoutAlgorithm {
  return byId.get(id) ?? gridLayout;
}

/** Ordering applied before the algorithm runs (all layouts). */
export const ORDER_PARAM: ParamDef = {
  key: 'order',
  label: 'Asset order',
  type: 'select',
  default: 'current',
  options: [
    { value: 'current', label: 'Selection order' },
    { value: 'name', label: 'File name' },
    { value: 'category', label: 'Category' },
    { value: 'size', label: 'Visual size' },
    { value: 'aspect', label: 'Aspect ratio' },
    { value: 'random', label: 'Random (seed)' },
  ],
};

/** Post-placement variation (organised but not sterile). Skipped by algorithms with noCommon. */
export const JITTER_PARAMS: ParamDef[] = [
  { key: 'jPos', label: 'Position variation', type: 'range', default: 0, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%' },
  { key: 'jScale', label: 'Scale variation', type: 'range', default: 0, min: 0, max: 0.6, step: 0.01, scale: 100, unit: '%' },
  { key: 'jRot', label: 'Rotation variation', type: 'range', default: 0, min: 0, max: 45, unit: '°' },
];

export function allParams(alg: LayoutAlgorithm): ParamDef[] {
  return [...alg.params, ORDER_PARAM, ...(alg.noCommon ? [] : JITTER_PARAMS)];
}

export function defaultParams(alg: LayoutAlgorithm): Params {
  const out: Params = {};
  for (const d of allParams(alg)) out[d.key] = d.default;
  return out;
}

/** Fill missing keys with defaults (params from presets/older projects). */
export function withDefaults(alg: LayoutAlgorithm, p: Params): Params {
  return { ...defaultParams(alg), ...p };
}
