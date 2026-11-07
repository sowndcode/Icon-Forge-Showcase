// Coordinated text looks and readability helpers.
//
// A look is a complete set of type, colour and effects designed at 120 px; applying it keeps the text's
// words, size, alignment and position (defaults.ts applyTextLook). Suggestions and fixes only change
// colours and effects, so the font the user picked stays.

import { ensureContrast } from './palette';
import { contrastRatio } from './themes';
import type { TextStyle } from './types';

const OFF = { enabled: false, color: '#000000', width: 4 };
const NO_GLOW = { enabled: false, color: '#ffffff', blur: 20, opacity: 0.8 };
const NO_DEPTH = { enabled: false, color: '#000000', depth: 10, angle: 90 };
const NO_SHADOW = { enabled: false, color: '#000000', blur: 12, dx: 0, dy: 6, opacity: 0.5 };
const SOFT = { enabled: true, color: '#000000', blur: 18, dx: 0, dy: 6, opacity: 0.28 };
const base: Partial<TextStyle> = { fontSize: 120, fillMode: 'solid', stroke: OFF, stroke2: OFF, glow: NO_GLOW, extrude: NO_DEPTH, shadow: NO_SHADOW, pixel: 0, italic: false, uppercase: false, letterSpacing: 0 };

export interface TextLook {
  id: string;
  name: string;
  /** Designed for light or dark backgrounds. */
  on: 'light' | 'dark';
  style: Partial<TextStyle>;
}

export const TEXT_LOOKS: TextLook[] = [
  { id: 'clean-light', name: 'Clean light', on: 'dark', style: { ...base, fontFamily: 'Geist Variable', fontWeight: 650, fill: '#f5f5f6', letterSpacing: -1.5 } },
  { id: 'clean-dark', name: 'Clean dark', on: 'light', style: { ...base, fontFamily: 'Geist Variable', fontWeight: 650, fill: '#17171a', letterSpacing: -1.5 } },
  { id: 'warm-editorial', name: 'Warm editorial', on: 'light', style: { ...base, fontFamily: 'Georgia', fontWeight: 700, fill: '#2a1c10' } },
  { id: 'bold-contrast', name: 'Bold contrast', on: 'dark', style: { ...base, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', stroke: { enabled: true, color: '#0b0b0d', width: 8 }, shadow: SOFT } },
  { id: 'minimal', name: 'Minimal', on: 'dark', style: { ...base, fontFamily: 'Geist Variable', fontWeight: 400, fill: '#e8e8ea', letterSpacing: 12, uppercase: true } },
  { id: 'premium-gold', name: 'Premium gold', on: 'dark', style: { ...base, fontFamily: 'Book Antiqua', fontWeight: 700, fill: '#f6e3b0', fillMode: 'gradient', fill2: '#c9963f', gradientAngle: 180, letterSpacing: 3, shadow: SOFT } },
  { id: 'soft-pastel', name: 'Soft pastel', on: 'light', style: { ...base, fontFamily: 'Geist Variable', fontWeight: 700, fill: '#3a2d4f' } },
  { id: 'modern-gaming', name: 'Modern gaming', on: 'dark', style: { ...base, fontFamily: 'Bahnschrift', fontWeight: 700, fill: '#ffffff', letterSpacing: 5, uppercase: true, shadow: SOFT } },
];

/** The colours a reader sees as the letters: the fill (both gradient ends) and a solid outline if there is one. */
function letterColors(s: TextStyle): { fills: string[]; outline: string | null } {
  const fills = s.fillMode === 'gradient' && s.fill2 ? [s.fill, s.fill2] : [s.fill];
  const outline = s.stroke.enabled && s.stroke.width >= s.fontSize * 0.035 ? s.stroke.color : null;
  return { fills, outline };
}

/**
 * Contrast of the letters against what is behind them (dark and light tones of the area). An outline
 * that separates the letters from the background counts, as long as it also separates from the fill.
 */
export function textContrast(s: TextStyle, behind0: string[]): number {
  const { fills, outline } = letterColors(s);
  // text on a badge or panel is read against the badge
  const behind = s.badge?.enabled ? (s.badge.gradient ? [s.badge.color, s.badge.color2] : [s.badge.color]) : behind0;
  return Math.min(
    ...behind.map((b) => {
      const fill = Math.min(...fills.map((f) => contrastRatio(f, b)));
      let ring = 0;
      if (outline) {
        const ob = contrastRatio(outline, b);
        const fo = Math.min(...fills.map((f) => contrastRatio(f, outline)));
        // a strong ring (letters vs outline 7:1+) that stands off the background at 3:1 (the WCAG level for
        // shapes) reads like well-contrasted text
        ring = fo >= 7 && ob >= 3 ? Math.max(4.5, Math.min(ob, fo)) : Math.min(ob, fo);
      }
      return Math.max(fill, ring);
    }),
  );
}

export const readLevel = (r: number) => (r >= 4.5 ? 'good' : r >= 3 ? 'fair' : 'poor');

/** Colour-only changes that make the text read on `behind` (font, size and words stay). */
export function improveContrast(s: TextStyle, behind: string[]): Partial<TextStyle> {
  if (textContrast(s, behind) >= 4.5) return {};
  const fill = ensureContrast(s.fill, behind);
  const patch: Partial<TextStyle> = { fill };
  if (s.fillMode === 'gradient' && s.fill2) patch.fill2 = ensureContrast(s.fill2, behind);
  const next = { ...s, ...patch };
  if (textContrast(next, behind) >= 4.5) return patch;
  // a busy area: no single colour reads everywhere, so add an outline in the opposite tone
  const lightText = contrastRatio(fill, '#000000') > contrastRatio(fill, '#ffffff');
  return { ...patch, stroke: { enabled: true, color: lightText ? '#0b0b0d' : '#ffffff', width: Math.max(2, s.fontSize * 0.06) } };
}

/** Tone down effects that make titles look heavy: depth, glow, a second outline, thick outlines, weight 800+. */
export function reduceEffects(s: TextStyle): Partial<TextStyle> {
  const thin = Math.max(1, s.fontSize * 0.04);
  return {
    extrude: { ...s.extrude!, enabled: false },
    glow: { ...s.glow!, enabled: false },
    stroke2: { ...s.stroke2!, enabled: false },
    stroke: s.stroke.enabled ? { ...s.stroke, width: Math.min(s.stroke.width, thin) } : s.stroke,
    shadow: s.shadow.enabled ? { ...s.shadow, opacity: Math.min(s.shadow.opacity, 0.3), blur: Math.min(s.shadow.blur, s.fontSize * 0.2) } : s.shadow,
    fontWeight: s.fontWeight > 750 ? 700 : s.fontWeight,
  };
}

export interface Suggestion {
  id: string;
  name: string;
  patch: Partial<TextStyle>;
}

/** Three or four colour treatments that read on this background, keeping the text's font. */
export function suggestStyles(s: TextStyle, behind: { avg: string; dark: string; light: string; busy: number }, accentHint?: string): Suggestion[] {
  const tones = [behind.dark, behind.avg, behind.light];
  const darkBg = contrastRatio('#ffffff', behind.avg) >= contrastRatio('#111111', behind.avg);
  const ink = darkBg ? '#f5f5f6' : '#17171a';
  const out: Suggestion[] = [
    { id: 'plain', name: darkBg ? 'Light' : 'Dark', patch: { fill: ensureContrast(ink, tones), fillMode: 'solid', stroke: { ...s.stroke, enabled: false }, glow: { ...s.glow!, enabled: false }, extrude: { ...s.extrude!, enabled: false } } },
    { id: 'shadow', name: 'With soft shadow', patch: { fill: ensureContrast(ink, tones), fillMode: 'solid', stroke: { ...s.stroke, enabled: false }, shadow: { enabled: true, color: '#000000', blur: s.fontSize * 0.16, dx: 0, dy: s.fontSize * 0.05, opacity: darkBg ? 0.45 : 0.18 } } },
  ];
  // a colour taken from the background (or the accent hint), pushed until it reads
  const tint = ensureContrast(accentHint ?? behind.avg, tones);
  if (tint.toLowerCase() !== out[0].patch.fill?.toLowerCase()) out.push({ id: 'tint', name: 'Matching colour', patch: { fill: tint, fillMode: 'solid', stroke: { ...s.stroke, enabled: false } } });
  out.push({ id: 'outline', name: 'Outlined', patch: { fill: darkBg ? '#ffffff' : '#17171a', fillMode: 'solid', stroke: { enabled: true, color: darkBg ? '#0b0b0d' : '#ffffff', width: Math.max(2, s.fontSize * 0.06) } } });
  if (behind.busy > 0.35 || out.filter((g) => textContrast({ ...s, ...g.patch } as TextStyle, tones) >= 4.5).length < 3) out.push({ id: 'panel', name: 'On a panel', patch: { fill: '#ffffff', fillMode: 'solid', stroke: { ...s.stroke, enabled: false }, badge: { enabled: true, shape: 'rect', color: '#0b0b0d', color2: '#0b0b0d', gradient: false, padX: s.fontSize * 0.4, padY: s.fontSize * 0.18, radius: s.fontSize * 0.12, stroke: { enabled: false, color: '#000000', width: 2 }, points: 12 } } });
  // only what actually reads here
  return out.filter((g) => textContrast({ ...s, ...g.patch } as TextStyle, tones) >= 4.5);
}
