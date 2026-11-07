// Deterministic random numbers. Every random layout takes a seed so the same seed always
// reproduces the same arrangement, and a new seed gives a new one.

export interface Rng {
  (): number; // [0, 1)
  range(a: number, b: number): number;
  int(a: number, bInclusive: number): number;
  /** Symmetric noise in [-1, 1]. */
  sym(): number;
  /** Approximately normal (mean 0, sd ~0.4, clipped to [-1, 1]). */
  gauss(): number;
  pick<T>(arr: T[]): T;
  shuffle<T>(arr: T[]): T[];
  fork(salt: number | string): Rng;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = (seed >>> 0) ^ 0x9e3779b9;
  const next = (() => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.sym = () => next() * 2 - 1;
  next.gauss = () => Math.max(-1, Math.min(1, (next() + next() + next() - 1.5) / 1.5 * 1.2));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  next.fork = (salt) => createRng(((seed >>> 0) ^ (typeof salt === 'number' ? Math.imul(salt + 1, 2654435761) : hashString(salt))) >>> 0);
  return next;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 999999) + 1;
}
