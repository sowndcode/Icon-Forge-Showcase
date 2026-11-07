// Colours of the imported icons → matching backgrounds and themes ("From your icons").
// Pure: the caller supplies RGBA samples (see ui/components/usePalette.ts).

import { grad, mesh, solid, withLight, withPattern } from './defaults';
import type { Theme } from './themes';
import type { Background, TextStyle } from './types';

export interface Palette {
  /** Main colours, most prominent first (hex). */
  colors: string[];
  /** Hues of `colors`, degrees. */
  hues: number[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

/** CSS-style hsl → #rrggbb (h in degrees, s/l 0…1). */
export function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp01(s);
  l = clamp01(l);
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Main colours of RGBA pixel data (any number of images concatenated). */
export function paletteFromPixels(data: Uint8ClampedArray | Uint8Array, max = 5): Palette | null {
  const B = 24;
  const weight = new Float64Array(B),
    sr = new Float64Array(B),
    sg = new Float64Array(B),
    sb = new Float64Array(B);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    // ignore near-black outlines, white highlights and grays
    if (l < 0.12 || l > 0.92 || s < 0.2) continue;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    const k = Math.floor(h / (360 / B)) % B;
    weight[k] += w;
    sr[k] += r * w;
    sg[k] += g * w;
    sb[k] += b * w;
  }
  const order = [...weight.keys()].filter((k) => weight[k] > 0).sort((a, b) => weight[b] - weight[a]);
  if (!order.length) return null;
  const picked: number[] = [];
  for (const k of order) {
    if (picked.length >= max) break;
    // skip buckets right next to one already picked (same colour family)
    if (picked.some((p) => Math.min(Math.abs(p - k), B - Math.abs(p - k)) < 2)) continue;
    if (weight[k] < weight[order[0]] * 0.04) break;
    picked.push(k);
  }
  const colors = picked.map((k) => {
    const w = weight[k];
    const toHex = (v: number) => Math.round(v / w).toString(16).padStart(2, '0');
    return `#${toHex(sr[k])}${toHex(sg[k])}${toHex(sb[k])}`;
  });
  const hues = colors.map((c) => rgbToHsl(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16))[0]);
  return { colors, hues };
}

const hexHue = (c: string) => rgbToHsl(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16))[0];

/** The palette with `color` as its main colour; the icons' other colours stay as accents. */
export function rebasePalette(p: Palette | null, color: string): Palette {
  const rest = (p?.colors ?? []).filter((c) => Math.abs(((hexHue(c) - hexHue(color) + 540) % 360) - 180) > 20);
  const colors = [color, ...rest].slice(0, 5);
  // without other colours, accents come from the colour wheel
  if (colors.length < 3) colors.push(hsl(hexHue(color) + 150, 0.7, 0.55), hsl(hexHue(color) + 210, 0.7, 0.55));
  return { colors, hues: colors.map(hexHue) };
}

/** Colours that go with the icons' main colour: complement, split complements, triad, neighbours. */
export function harmonyColors(p: Palette): string[] {
  const h = p.hues[0];
  return [180, 150, 210, 120, 240, 30, -30].map((d) => hsl(h + d, 0.65, 0.52));
}

/** A full colour wheel, so any hue (blue, green, gold…) can be the base. */
export const WHEEL_COLORS = [0, 25, 45, 60, 90, 140, 170, 195, 215, 235, 260, 285, 315, 340].map((h) => hsl(h, 0.68, 0.52));

/** Hue of palette entry i, falling back to a neighbour of the first. */
const hue = (p: Palette, i: number) => p.hues[i] ?? (p.hues[0] + 40 * i) % 360;

/** Backgrounds built from the icons' colours. */
export function matchedBackgrounds(p: Palette): { name: string; desc: string; bg: () => Background }[] {
  const h1 = hue(p, 0),
    h2 = hue(p, 1),
    h3 = hue(p, 2),
    hc = h1 + 180;
  return [
    { name: 'Deep main colour', desc: 'Dark version of your icons’ main colour — calm and on-brand', bg: () => grad('radial', [hsl(h1, 0.42, 0.24), hsl(h1, 0.5, 0.06)], 0.5, 0.45) },
    { name: 'Contrast', desc: 'Opposite hue of your icons, so they stand out', bg: () => grad('radial', [hsl(hc, 0.4, 0.24), hsl(hc, 0.5, 0.06)], 0.5, 0.45) },
    { name: 'Duotone', desc: 'Your two main colours, deepened', bg: () => grad('linear', [hsl(h1, 0.55, 0.3), hsl(h2, 0.55, 0.12)], 0.5, 0.5, 135) },
    { name: 'Icon mesh', desc: 'Soft blend of your icons’ colours on dark', bg: () => mesh(hsl(h1, 0.5, 0.06), [hsl(h1, 0.6, 0.32), hsl(h2, 0.6, 0.28), hsl(h3, 0.6, 0.3), hsl(h1 + 20, 0.5, 0.18)]) },
    { name: 'Colour glow', desc: 'A pool of your main colour behind the content', bg: () => withLight(solid(hsl(h1, 0.3, 0.05)), hsl(h1, 0.85, 0.6), 0.45) },
    { name: 'Soft light', desc: 'Pale tint of your main colour — clean and bright', bg: () => grad('linear', [hsl(h1, 0.6, 0.96), hsl(h1, 0.45, 0.82)], 0.5, 0.5, 180) },
    { name: 'Starry', desc: 'Night sky in your colours, stars in your accent', bg: () => withPattern(grad('linear', [hsl(h1, 0.5, 0.18), hsl(h1, 0.6, 0.04)], 0.5, 0.5, 180), { kind: 'stars', color: hsl(h2, 0.9, 0.82), opacity: 0.9, scale: 1 }) },
    { name: 'Accent rays', desc: 'Sunburst in your second colour', bg: () => withPattern(grad('radial', [hsl(h2, 0.6, 0.42), hsl(h2, 0.6, 0.13)], 0.5, 0.5), { kind: 'rays', color: hsl(h2, 0.8, 0.82), opacity: 0.13, scale: 1 }) },
    { name: 'Colour bokeh', desc: 'Soft lights in your accent colour', bg: () => withPattern(grad('radial', [hsl(h1, 0.45, 0.2), hsl(h1, 0.5, 0.05)], 0.5, 0.5), { kind: 'bokeh', color: hsl(h2, 0.8, 0.7), opacity: 0.4, scale: 1 }) },
    { name: 'Dotted', desc: 'Tidy dot grid tinted with your main colour', bg: () => withPattern(grad('radial', [hsl(h1, 0.35, 0.18), hsl(h1, 0.4, 0.06)], 0.5, 0.45), { kind: 'dots', color: hsl(h1, 0.7, 0.75), opacity: 0.12, scale: 0.8 }) },
  ];
}

const off = { enabled: false, color: '#000000', width: 4 };
const noGlow = { enabled: false, color: '#ffffff', blur: 20, opacity: 0.8 };
const noExtrude = { enabled: false, color: '#000000', depth: 10, angle: 90 };
const shadow = { enabled: true, color: '#000000', blur: 22, dx: 0, dy: 8, opacity: 0.45 };
const noShadow = { ...shadow, enabled: false };

/** Game themes made from the icons' colours. */
export function matchedThemes(p: Palette): Theme[] {
  const h1 = hue(p, 0),
    h2 = hue(p, 1),
    h3 = hue(p, 2);
  const bgs = matchedBackgrounds(p);
  const base = { fontFamily: 'Segoe UI Black', fontWeight: 900, stroke2: off, glow: noGlow, extrude: noExtrude };
  return [
    {
      id: 'match-deep',
      name: 'Your colours',
      blurb: 'Dark background and a bright title in your icons’ main colour',
      bg: bgs[0].bg,
      title: { ...base, fill: hsl(h1, 0.9, 0.88), fillMode: 'gradient', fill2: hsl(h1, 0.8, 0.58), gradientAngle: 180, stroke: { enabled: true, color: hsl(h1, 0.6, 0.08), width: 7 }, extrude: { enabled: true, color: hsl(h1, 0.6, 0.12), depth: 8, angle: 90 }, shadow },
      sub: hsl(h1, 0.4, 0.85),
      accent: hsl(h2, 0.75, 0.52),
      accent2: hsl(h2, 0.75, 0.36),
      accentText: '#ffffff',
    },
    {
      id: 'match-glow',
      name: 'Your glow',
      blurb: 'Near-black with a glow and a neon title in your main colour',
      bg: bgs[4].bg,
      title: { ...base, fontFamily: 'Bahnschrift', fontWeight: 700, letterSpacing: 6, fill: '#ffffff', stroke: off, glow: { enabled: true, color: hsl(h1, 0.9, 0.6), blur: 26, opacity: 0.85 }, shadow: noShadow },
      sub: hsl(h1, 0.7, 0.8),
      accent: hsl(h1, 0.85, 0.55),
      accent2: hsl(h1, 0.8, 0.38),
      accentText: '#ffffff',
    },
    {
      id: 'match-contrast',
      name: 'Your contrast',
      blurb: 'Opposite-hue background so your icons pop, title in their colour',
      bg: bgs[1].bg,
      title: { ...base, fill: hsl(h1, 0.85, 0.62), stroke: { enabled: true, color: '#0d0d10', width: 7 }, stroke2: { enabled: true, color: '#ffffff', width: 3 }, shadow },
      sub: '#e5e7eb',
      accent: hsl(h1, 0.8, 0.5),
      accent2: hsl(h1, 0.8, 0.35),
      accentText: '#ffffff',
    },
    {
      id: 'match-second',
      name: 'Your second colour',
      blurb: 'Background from your icons’ second colour, title in the first',
      bg: () => grad('radial', [hsl(h2, 0.45, 0.24), hsl(h2, 0.5, 0.06)], 0.5, 0.45),
      title: { ...base, fill: hsl(h1, 0.9, 0.85), fillMode: 'gradient', fill2: hsl(h1, 0.85, 0.55), gradientAngle: 180, stroke: { enabled: true, color: hsl(h2, 0.6, 0.07), width: 7 }, shadow },
      sub: hsl(h2, 0.4, 0.86),
      accent: hsl(h1, 0.8, 0.52),
      accent2: hsl(h1, 0.8, 0.36),
      accentText: '#ffffff',
    },
    {
      id: 'match-duo',
      name: 'Your duotone',
      blurb: 'Your two main colours as a gradient, crisp white title',
      bg: bgs[2].bg,
      title: { ...base, fill: '#ffffff', stroke: { enabled: true, color: hsl(h2, 0.6, 0.1), width: 8 }, extrude: { enabled: true, color: hsl(h2, 0.6, 0.1), depth: 8, angle: 90 }, shadow },
      sub: hsl(h1, 0.5, 0.9),
      accent: hsl(h1, 0.85, 0.55),
      accent2: hsl(h1, 0.85, 0.38),
      accentText: '#ffffff',
    },
    {
      id: 'match-mesh',
      name: 'Your blend',
      blurb: 'Soft blend of all your icons’ colours, gradient title',
      bg: bgs[3].bg,
      title: { ...base, fill: '#ffffff', fillMode: 'gradient', fill2: hsl(h2, 0.8, 0.8), gradientAngle: 180, stroke: { enabled: true, color: hsl(h1, 0.5, 0.08), width: 7 }, shadow },
      sub: '#f1f5f9',
      accent: hsl(h3, 0.8, 0.55),
      accent2: hsl(h3, 0.8, 0.38),
      accentText: '#ffffff',
    },
    {
      id: 'match-pop',
      name: 'Your pop',
      blurb: 'Bright sunburst in your main colour with a comic-style title',
      bg: () => withPattern(grad('radial', [hsl(h1, 0.75, 0.55), hsl(h1, 0.7, 0.28)], 0.5, 0.5), { kind: 'rays', color: hsl(h1, 0.9, 0.85), opacity: 0.18, scale: 1 }),
      title: { ...base, fill: '#ffffff', stroke: { enabled: true, color: '#111111', width: 9 }, extrude: { enabled: true, color: hsl(h2, 0.8, 0.35), depth: 12, angle: 110 }, shadow: noShadow },
      sub: '#ffffff',
      accent: hsl(h2, 0.85, 0.5),
      accent2: hsl(h2, 0.85, 0.35),
      accentText: '#ffffff',
    },
    {
      id: 'match-night',
      name: 'Your night sky',
      blurb: 'Stars in your accent over a deep night in your main colour',
      bg: bgs[6].bg,
      title: { ...base, fill: '#ffffff', fillMode: 'gradient', fill2: hsl(h2, 0.85, 0.75), gradientAngle: 180, glow: { enabled: true, color: hsl(h2, 0.85, 0.6), blur: 20, opacity: 0.6 }, shadow: noShadow },
      sub: hsl(h2, 0.6, 0.85),
      accent: hsl(h2, 0.85, 0.55),
      accent2: hsl(h2, 0.8, 0.38),
      accentText: '#ffffff',
    },
    {
      id: 'match-pastel',
      name: 'Your pastel',
      blurb: 'Soft pastel blend of your colours with a sticker title',
      bg: () => mesh(hsl(h1, 0.6, 0.95), [hsl(h1, 0.7, 0.85), hsl(h2, 0.7, 0.86), hsl(h3, 0.7, 0.88), hsl(h1 + 30, 0.6, 0.9)]),
      title: { ...base, fill: '#ffffff', stroke: { enabled: true, color: hsl(h1, 0.65, 0.4), width: 10 }, stroke2: { enabled: true, color: '#ffffff', width: 6 }, shadow: { ...shadow, opacity: 0.18 } },
      sub: hsl(h1, 0.55, 0.3),
      accent: hsl(h2, 0.7, 0.5),
      accent2: hsl(h2, 0.7, 0.36),
      accentText: '#ffffff',
    },
    {
      id: 'match-light',
      name: 'Your light',
      blurb: 'Pale tinted background with a deep title in your main colour',
      bg: bgs[5].bg,
      title: { ...base, fill: hsl(h1, 0.65, 0.3), stroke: off, shadow: noShadow },
      sub: hsl(h1, 0.35, 0.35),
      accent: hsl(h1, 0.65, 0.35),
      accent2: hsl(h1, 0.65, 0.25),
      accentText: '#ffffff',
    },
  ];
}

// ---------------------------------------------------------------------------
// Clean variants from the icons' colours: light and dark, soft and vivid, warm and cool. Every text
// colour is pushed lighter or darker until it reaches 4.5:1 against each colour of its background, so
// a dark icon set can still get a light theme with readable type. `seed` picks other accent harmonies.
// ---------------------------------------------------------------------------

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
};
const ratio = (a: string, b: string) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** The colour, made lighter or darker (same hue) until it reads on every one of `against`. */
export function ensureContrast(color: string, against: string[], target = 4.5): string {
  const n = parseInt(color.slice(1, 7), 16);
  const [h, s, l0] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  const ok = (c: string) => against.every((b) => ratio(c, b) >= target);
  if (ok(color)) return color;
  const bgDark = against.reduce((m, b) => m + lum(b), 0) / against.length < 0.25;
  for (let i = 1; i <= 20; i++) {
    const l = bgDark ? Math.min(1, l0 + i * 0.05) : Math.max(0, l0 - i * 0.05);
    const c = hsl(h, s, l);
    if (ok(c)) return c;
  }
  return bgDark ? '#ffffff' : '#0a0a0a';
}

/** The most saturated shade of a hue that is still dark enough for white type (luminance ≤ max). */
function deepShade(h: number, s: number, max: number): string {
  for (let l = 0.55; l > 0.05; l -= 0.02) {
    const c = hsl(h, s, l);
    if (lum(c) <= max) return c;
  }
  return hsl(h, s, 0.1);
}

/** A badge colour and its text colour with at least 4.5:1 between them (the badge shifts lighter or darker if needed). */
function badgePair(accent: string): [string, string] {
  const n = parseInt(accent.slice(1, 7), 16);
  const [h, s, l0] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  const dark = hsl(h, 0.5, 0.08);
  for (let i = 0; i <= 12; i++) {
    for (const l of [l0 - i * 0.03, l0 + i * 0.03]) {
      if (l < 0 || l > 1) continue;
      const c = hsl(h, s, l);
      if (ratio('#ffffff', c) >= 4.5) return [c, '#ffffff'];
      if (ratio(dark, c) >= 4.5) return [c, dark];
    }
  }
  return [accent, '#000000'];
}

const stopsOf = (b: Background) => (b.type === 'solid' ? [b.color] : b.gradient.stops.map((s) => s.color));
const SANS = 'Geist Variable';
const clean = (t: Partial<TextStyle>): Partial<TextStyle> => ({ fontFamily: SANS, fontWeight: 650, letterSpacing: 0, fillMode: 'solid', stroke: off, stroke2: off, glow: noGlow, extrude: noExtrude, shadow: noShadow, ...t });
const softShadow = { enabled: true, color: '#000000', blur: 18, dx: 0, dy: 6, opacity: 0.22 };

/** Readable clean themes from the icons' colours. */
export function matchedVariants(p: Palette, seed = 0): Theme[] {
  const h1 = hue(p, 0);
  // the accent hue: the icons' second colour, then harmonies, cycled by the seed
  const accents = [hue(p, 1), h1 + 180, h1 + 150, h1 + 210, hue(p, 2), h1 + 120];
  const ha = accents[((seed % accents.length) + accents.length) % accents.length];
  const sat = 0.6 + ((seed * 7) % 3) * 0.08;
  const warm = 30 + ((seed * 11) % 3) * 8,
    cool = 212 + ((seed * 13) % 3) * 8;
  const make = (id: string, name: string, blurb: string, bg: Background, title: Partial<TextStyle>, sub: string, accent: string, strong = false): Theme => {
    const stops = stopsOf(bg);
    const fill = ensureContrast(title.fill ?? '#ffffff', stops, strong ? 7 : 4.5);
    const [a, aText] = badgePair(accent);
    return { id, name, blurb, group: 'From your icons', bg: () => structuredClone(bg), title: { ...title, fill }, sub: ensureContrast(sub, stops, strong ? 7 : 4.5), accent: a, accent2: hsl(hexHue(a), 0.7, 0.3), accentText: aText };
  };
  return [
    make('match-v-light', 'Light', 'Pale wash of your main colour, deep readable title', grad('linear', [hsl(h1, 0.55, 0.97), hsl(h1, 0.4, 0.86)], 0.5, 0.5, 180), clean({ fill: hsl(h1, 0.7, 0.25) }), hsl(h1, 0.3, 0.35), hsl(ha, sat, 0.42)),
    make('match-v-dark', 'Dark', 'Deep tone of your main colour, clean white title', grad('radial', [hsl(h1, 0.35, 0.18), hsl(h1, 0.4, 0.05)], 0.5, 0.42), clean({ fill: '#ffffff', shadow: softShadow }), hsl(h1, 0.35, 0.82), hsl(ha, sat + 0.1, 0.55)),
    make('match-v-soft', 'Soft', 'Muted pastel of your colours, gentle plum-dark type', mesh(hsl(h1, 0.4, 0.93), [hsl(h1, 0.45, 0.88), hsl(ha, 0.4, 0.89), hsl(h1 + 30, 0.35, 0.92)]), clean({ fill: hsl(h1, 0.35, 0.28), fontWeight: 600 }), hsl(h1, 0.25, 0.38), hsl(ha, 0.45, 0.6)),
    make('match-v-vivid', 'Vibrant', 'Saturated sweep of your main colour, bold white type', withLight(grad('linear', [deepShade(h1, 0.85, 0.16), deepShade(ha, 0.8, 0.08)], 0.5, 0.5, 135), '#ffffff', 0.15), clean({ fill: '#ffffff', fontWeight: 800, shadow: { ...softShadow, opacity: 0.35 } }), '#ffffff', hsl(ha + 180, 0.9, 0.6)),
    make('match-v-minimal', 'Minimal', 'Off-white, near-black type, your colour only in the badges', solid('#f6f6f4'), clean({ fill: '#151517', fontWeight: 600, letterSpacing: -1 }), '#4b4b52', hsl(h1, sat + 0.1, 0.45)),
    make('match-v-contrast', 'High contrast', 'Black background, white type, your colour as a bright accent', solid('#050505'), clean({ fill: '#ffffff', fontWeight: 700 }), '#ffffff', hsl(h1, 0.95, 0.6), true),
    make('match-v-warm', 'Warm', 'Your colours shifted warm — amber light, cream type', grad('radial', [hsl((h1 + warm) / 2, 0.45, 0.22), hsl(warm, 0.45, 0.06)], 0.5, 0.42), clean({ fill: hsl(warm + 10, 0.6, 0.92) }), hsl(warm, 0.35, 0.78), hsl(warm, 0.85, 0.55)),
    make('match-v-cool', 'Cool', 'Your colours shifted cool — slate blue, crisp light type', grad('linear', [hsl((h1 + cool) / 2, 0.3, 0.2), hsl(cool, 0.4, 0.07)], 0.5, 0.5, 160), clean({ fill: hsl(cool, 0.3, 0.95) }), hsl(cool, 0.25, 0.78), hsl(cool - 20, 0.75, 0.58)),
  ];
}
