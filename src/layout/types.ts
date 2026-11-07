// Smart Layout plug-in contract. A layout algorithm is a pure function from items (visible-box
// sizes) + parameters + context to placements (visible boxes on the page). To add a layout:
// create a file exporting a LayoutAlgorithm and register it in registry.ts.

import type { Collider, OverlapRules } from '../core/collide';
import type { Rng } from '../core/rng';
import type { ParamValue, Quad, Rect, Vec } from '../core/types';

export interface ParamDef {
  key: string;
  label: string;
  type: 'range' | 'int' | 'bool' | 'select';
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** Display multiplier (0.75 → 75 with scale 100). */
  scale?: number;
  unit?: string;
  decimals?: number;
  options?: { value: string; label: string }[];
  advanced?: boolean;
  hint?: string;
  /** Show only when predicate holds. */
  when?: (p: Record<string, ParamValue>) => boolean;
  /** Integer field where 0 means "Auto". */
  autoZero?: boolean;
  /** Range where 0 switches the setting off; the button shows this label (e.g. "No limit"). */
  zeroLabel?: string;
}

export interface LayoutItem {
  id: string;
  index: number;
  /** Visible box in source px. */
  vw: number;
  vh: number;
  aspect: number; // vw / vh
  category: string;
  name: string;
  /** Relative visual size (sqrt of visible area / median) — for "preserve relative size". */
  rel: number;
  hero: boolean;
}

export interface LayoutContext {
  page: { w: number; h: number };
  /** Usable region (page minus safe zone if respected). */
  area: Rect;
  /** Pinned objects — placed items must respect overlap rules against them. */
  obstacles: Collider[];
  /** Hard keep-out shapes (focal region) — never overlapped. */
  keepOut: Collider[];
  /** The focal region if one exists (some layouts frame it). */
  focal: Collider | null;
  rules: OverlapRules;
  rng: Rng;
  seed: number;
  plane?: Quad;
  path?: Vec[];
}

export interface Placement {
  id: string;
  cx: number;
  cy: number;
  /** Visible box size in page px. */
  w: number;
  h: number;
  rot: number;
  /** 0 = far/back, 1 = near/front — drives paint order when present. */
  depth?: number;
  /** Explicit paint order (higher = on top). */
  z?: number;
  /**
   * The visible box as a rectangle on the perspective plane (u across, v depth, 0..1). When set, the
   * image is projected onto the plane (it lies on the floor) instead of standing upright.
   */
  uv?: { u0: number; v0: number; u1: number; v1: number };
}

export interface LayoutAlgorithm {
  id: string;
  label: string;
  description: string;
  group: 'Organize' | 'Showcase' | 'Perspective';
  params: ParamDef[];
  /** Algorithm needs a perspective plane; value is the default orientation. */
  plane?: 'floor' | 'wall';
  usesPath?: boolean;
  /** Algorithm is random; seed controls the result. */
  random?: boolean;
  /** Default overlap rules for new instances. */
  defaultOverlap?: 'strict' | 'relaxed' | 'showcase';
  /** Shows a central safe zone (Edge Frame). */
  safeZoneParams?: boolean;
  /** Skip the shared jitter/order post-processing params. */
  noCommon?: boolean;
  /** One-click starting points shown above the settings; each sets only the listed params. */
  styles?: { label: string; hint?: string; params: Params }[];
  run(items: LayoutItem[], params: Record<string, ParamValue>, ctx: LayoutContext): Placement[];
}

export type Params = Record<string, ParamValue>;

export const num = (p: Params, k: string, d = 0): number => {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
};
export const bool = (p: Params, k: string, d = false): boolean => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);
export const str = (p: Params, k: string, d = ''): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
