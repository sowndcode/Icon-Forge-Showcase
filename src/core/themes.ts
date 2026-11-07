// Game themes: a background plus a matching title look, subtitle colour and badge colour.
// Applying one restyles the page in one step (see state/themes.ts).

import { defaultBackground, grad, mesh, solid, withLight, withPattern } from './defaults';
import type { Background, TextStyle } from './types';

export interface Theme {
  id: string;
  name: string;
  /** One line: what it suits. */
  blurb: string;
  bg: () => Background;
  /** Title look, designed for a 120 px title (outlines etc. are scaled to the real size). */
  title: Partial<TextStyle>;
  /** Subtitle / label text colour. */
  sub: string;
  /** Badge colours and the text colour on badges. */
  accent: string;
  accent2: string;
  accentText: string;
  /** Library section ('Professional', 'Genres'…); built-ins without one are listed by id. */
  group?: string;
}

const SHADOW = { enabled: true, color: '#000000', blur: 22, dx: 0, dy: 8, opacity: 0.45 };
const NO_SHADOW = { enabled: false, color: '#000000', blur: 12, dx: 0, dy: 6, opacity: 0.5 };
const off = { enabled: false, color: '#000000', width: 4 };
const noGlow = { enabled: false, color: '#ffffff', blur: 20, opacity: 0.8 };
const noExtrude = { enabled: false, color: '#000000', depth: 10, angle: 90 };

/** Title look: every effect is spelled out so switching themes never leaves an old glow behind. */
function title(t: Partial<TextStyle>): Partial<TextStyle> {
  return { fontFamily: 'Segoe UI Black', fontWeight: 900, fillMode: 'solid', stroke: off, stroke2: off, glow: noGlow, extrude: noExtrude, shadow: SHADOW, ...t };
}
const stroke = (color: string, width = 7) => ({ enabled: true, color, width });

export const THEMES: Theme[] = [
  {
    id: 'fantasy',
    name: 'Fantasy',
    blurb: 'Gold serif title on twilight purple — RPG, magic, loot',
    bg: () => withPattern(grad('radial', ['#3b2a6e', '#0e0a1f'], 0.5, 0.42), { kind: 'bokeh', color: '#facc15', opacity: 0.18, scale: 1.1 }),
    title: title({ fontFamily: 'Georgia', fontWeight: 700, fill: '#fff4cf', fillMode: 'gradient', fill2: '#d99b2b', gradientAngle: 180, stroke: stroke('#2a1606', 6), stroke2: { enabled: true, color: '#f5d48a', width: 2 } }),
    sub: '#e9d8a6',
    accent: '#d99b2b',
    accent2: '#9a6412',
    accentText: '#1d1004',
  },
  {
    id: 'mining',
    name: 'Mining',
    blurb: 'Amber metal title on dark stone — ores, tools, crafting',
    bg: () => withPattern(grad('radial', ['#4a4038', '#151210'], 0.5, 0.45), { kind: 'noise', color: '#ffffff', opacity: 0.1, scale: 1 }),
    title: title({ fill: '#ffe08a', fillMode: 'gradient', fill2: '#e0861e', gradientAngle: 180, stroke: stroke('#1d120a', 7), extrude: { enabled: true, color: '#3a240f', depth: 10, angle: 90 } }),
    sub: '#d6c7b4',
    accent: '#f59e0b',
    accent2: '#b45309',
    accentText: '#1d120a',
  },
  {
    id: 'fishing',
    name: 'Fishing',
    blurb: 'White title with a deep-sea outline on ocean blue — fish, bait, boats',
    bg: () => withPattern(grad('linear', ['#38bdf8', '#0c4a6e'], 0.5, 0.5, 180), { kind: 'waves', color: '#ffffff', opacity: 0.1, scale: 1 }),
    title: title({ fill: '#ffffff', stroke: stroke('#0c3557', 8), extrude: { enabled: true, color: '#082540', depth: 8, angle: 90 } }),
    sub: '#e0f2fe',
    accent: '#f97316',
    accent2: '#c2410c',
    accentText: '#ffffff',
  },
  {
    id: 'scifi',
    name: 'Sci-Fi',
    blurb: 'Glowing cyan title on a dark tech grid — space, weapons, tech',
    bg: () => withLight(withPattern(grad('radial', ['#0b1a3a', '#03060f'], 0.5, 0.45), { kind: 'grid', color: '#22d3ee', opacity: 0.1, scale: 1 }), '#22d3ee', 0.25),
    title: title({ fontFamily: 'Bahnschrift', fontWeight: 700, letterSpacing: 8, fill: '#e6fdff', glow: { enabled: true, color: '#22d3ee', blur: 26, opacity: 0.85 }, shadow: NO_SHADOW }),
    sub: '#67e8f9',
    accent: '#22d3ee',
    accent2: '#0891b2',
    accentText: '#03141c',
  },
  {
    id: 'winter',
    name: 'Winter',
    blurb: 'Frosty title on snowy blue — holidays, ice, snow',
    bg: () => withPattern(grad('linear', ['#2563eb', '#0b1d4d'], 0.5, 0.5, 180), { kind: 'stars', color: '#ffffff', opacity: 0.8, scale: 1.3 }),
    title: title({ fill: '#ffffff', fillMode: 'gradient', fill2: '#bfe6ff', gradientAngle: 180, stroke: stroke('#123a73', 7), stroke2: { enabled: true, color: '#e0f2fe', width: 3 } }),
    sub: '#dbeafe',
    accent: '#e0f2fe',
    accent2: '#93c5fd',
    accentText: '#0b2a5b',
  },
  {
    id: 'halloween',
    name: 'Halloween',
    blurb: 'Pumpkin-orange title on a dark ember glow — spooky, autumn',
    bg: () => withLight(grad('radial', ['#5a210a', '#0f0505'], 0.5, 0.6), '#f97316', 0.3),
    title: title({ fill: '#ffc061', fillMode: 'gradient', fill2: '#f25c05', gradientAngle: 180, stroke: stroke('#1a0b02', 7), extrude: { enabled: true, color: '#2d0f02', depth: 10, angle: 90 } }),
    sub: '#fdba74',
    accent: '#7c3aed',
    accent2: '#4c1d95',
    accentText: '#ffffff',
  },
  {
    id: 'forest',
    name: 'Nature',
    blurb: 'Fresh light title on deep forest green — plants, farming, survival',
    bg: () => withPattern(grad('radial', ['#2f6b3a', '#0b1f10'], 0.5, 0.45), { kind: 'bokeh', color: '#bef264', opacity: 0.22, scale: 1 }),
    title: title({ fill: '#f7fee7', stroke: stroke('#0f2e16', 7), extrude: { enabled: true, color: '#0a2010', depth: 8, angle: 90 } }),
    sub: '#d9f99d',
    accent: '#84cc16',
    accent2: '#4d7c0f',
    accentText: '#132a05',
  },
  {
    id: 'desert',
    name: 'Desert',
    blurb: 'Sun-bleached title on warm sand — western, adventure, ruins',
    bg: () => grad('linear', ['#fcd9a0', '#c2702b'], 0.5, 0.5, 180),
    title: title({ fill: '#fff7ed', stroke: stroke('#6b2f0a', 7), extrude: { enabled: true, color: '#6b2f0a', depth: 10, angle: 90 } }),
    sub: '#7c2d12',
    accent: '#b45309',
    accent2: '#78350f',
    accentText: '#fff7ed',
  },
  {
    id: 'volcano',
    name: 'Volcano',
    blurb: 'Molten title with a fiery glow — lava, fire, forge',
    bg: () => withPattern(grad('radial', ['#c2410c', '#1f0404'], 0.5, 0.62), { kind: 'noise', color: '#000000', opacity: 0.15, scale: 1 }),
    title: title({ fill: '#fff3b0', fillMode: 'gradient', fill2: '#ff6a00', gradientAngle: 180, stroke: stroke('#2a0505', 6), glow: { enabled: true, color: '#ff4d00', blur: 24, opacity: 0.6 } }),
    sub: '#fed7aa',
    accent: '#dc2626',
    accent2: '#7f1d1d',
    accentText: '#ffffff',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    blurb: 'White neon title on magenta and cyan — synthwave, city, hacking',
    bg: () => mesh('#0a0418', ['#db2777', '#0891b2', '#7e22ce', '#1e1b4b']),
    title: title({ fontFamily: 'Bahnschrift', fontWeight: 700, letterSpacing: 6, fill: '#ffffff', glow: { enabled: true, color: '#ff2bd6', blur: 28, opacity: 0.9 }, shadow: NO_SHADOW }),
    sub: '#a5f3fc',
    accent: '#ff2bd6',
    accent2: '#9d174d',
    accentText: '#ffffff',
  },
  {
    id: 'medieval',
    name: 'Medieval',
    blurb: 'Parchment serif title on dark wood — castles, weapons, armour',
    bg: () => withPattern(grad('radial', ['#6b4f2a', '#1e140a'], 0.5, 0.45), { kind: 'noise', color: '#000000', opacity: 0.18, scale: 1 }),
    title: title({ fontFamily: 'Book Antiqua', fontWeight: 700, letterSpacing: 3, fill: '#f8ecd0', fillMode: 'gradient', fill2: '#c9a46a', gradientAngle: 180, stroke: stroke('#2a1a08', 6) }),
    sub: '#e7d3a8',
    accent: '#7f1d1d',
    accent2: '#450a0a',
    accentText: '#f8ecd0',
  },
  {
    id: 'pirate',
    name: 'Pirate',
    blurb: 'Treasure-gold title on deep sea teal — ships, loot, islands',
    bg: () => withPattern(grad('linear', ['#155e75', '#082f49'], 0.5, 0.5, 180), { kind: 'waves', color: '#ffffff', opacity: 0.07, scale: 1.2 }),
    title: title({ fill: '#ffe7a3', fillMode: 'gradient', fill2: '#e5a823', gradientAngle: 180, stroke: stroke('#1a1206', 7), extrude: { enabled: true, color: '#3b2a0a', depth: 10, angle: 90 } }),
    sub: '#fde68a',
    accent: '#b91c1c',
    accent2: '#7f1d1d',
    accentText: '#ffffff',
  },
  {
    id: 'candy',
    name: 'Candy',
    blurb: 'Bubbly sticker title on pastel pink — sweets, cute, casual',
    bg: () => withPattern(grad('linear', ['#fbcfe8', '#c4b5fd'], 0.5, 0.5, 160), { kind: 'confetti', color: '#ffffff', color2: '#f472b6', color3: '#38bdf8', opacity: 0.5, scale: 1 }),
    title: title({ fill: '#ffffff', stroke: stroke('#db2777', 9), stroke2: { enabled: true, color: '#ffffff', width: 6 }, extrude: { enabled: true, color: '#9d174d', depth: 8, angle: 90 }, shadow: { ...SHADOW, opacity: 0.25 } }),
    sub: '#831843',
    accent: '#ec4899',
    accent2: '#be185d',
    accentText: '#ffffff',
  },
  {
    id: 'space',
    name: 'Space',
    blurb: 'Starlight title on a deep starfield — planets, ships, aliens',
    bg: () => withPattern(grad('linear', ['#1e1b4b', '#020617'], 0.5, 0.5, 180), { kind: 'stars', color: '#ffffff', opacity: 0.9, scale: 1 }),
    title: title({ fill: '#ffffff', fillMode: 'gradient', fill2: '#a5b4fc', gradientAngle: 180, glow: { enabled: true, color: '#818cf8', blur: 22, opacity: 0.7 }, shadow: NO_SHADOW }),
    sub: '#c7d2fe',
    accent: '#6366f1',
    accent2: '#3730a3',
    accentText: '#ffffff',
  },
  {
    id: 'farming',
    name: 'Farming',
    blurb: 'Cream title with a wood outline on spring green — crops, animals',
    bg: () => withLight(grad('linear', ['#a3e635', '#3f7f2a'], 0.5, 0.5, 180), '#fef9c3', 0.3),
    title: title({ fill: '#fffbea', stroke: stroke('#4a2f12', 8), extrude: { enabled: true, color: '#4a2f12', depth: 10, angle: 90 } }),
    sub: '#fefce8',
    accent: '#f59e0b',
    accent2: '#b45309',
    accentText: '#2b1a05',
  },
  {
    id: 'horror',
    name: 'Horror',
    blurb: 'Blood-red title on black — zombies, survival, gore',
    bg: () => ({ ...grad('radial', ['#3f0d0d', '#050101'], 0.5, 0.45), vignette: { enabled: true, strength: 0.6, color: '#000000' } }),
    title: title({ fontFamily: 'Impact', fontWeight: 400, letterSpacing: 3, fill: '#e11d1d', stroke: stroke('#0a0000', 5), glow: { enabled: true, color: '#7f0000', blur: 26, opacity: 0.8 } }),
    sub: '#fca5a5',
    accent: '#991b1b',
    accent2: '#450a0a',
    accentText: '#ffffff',
  },
  {
    id: 'steampunk',
    name: 'Steampunk',
    blurb: 'Brass title on warm bronze — gears, gadgets, airships',
    bg: () => withPattern(grad('radial', ['#7a4f25', '#1a1009'], 0.5, 0.45), { kind: 'grid', color: '#fbbf24', opacity: 0.06, scale: 1.4 }),
    title: title({ fontFamily: 'Book Antiqua', fontWeight: 700, fill: '#ffe0a3', fillMode: 'gradient', fill2: '#b87333', gradientAngle: 180, stroke: stroke('#241507', 6), extrude: { enabled: true, color: '#3d240c', depth: 8, angle: 90 } }),
    sub: '#f5d0a0',
    accent: '#b87333',
    accent2: '#7c4a1e',
    accentText: '#1a1009',
  },
  {
    id: 'minimal-light',
    name: 'Minimal light',
    blurb: 'Clean dark type on soft white — UI kits, line icons',
    bg: () => grad('radial', ['#ffffff', '#e9ecf1'], 0.5, 0.45),
    title: title({ fontFamily: 'Segoe UI', fontWeight: 700, letterSpacing: 6, fill: '#111318', shadow: NO_SHADOW }),
    sub: '#4b5563',
    accent: '#111318',
    accent2: '#111318',
    accentText: '#ffffff',
  },
  {
    id: 'minimal-dark',
    name: 'Minimal dark',
    blurb: 'Crisp white type on graphite — works with any icon style',
    bg: () => ({ ...defaultBackground() }),
    title: title({ fontFamily: 'Segoe UI', fontWeight: 700, letterSpacing: 6, fill: '#ffffff', shadow: NO_SHADOW }),
    sub: '#a1a1aa',
    accent: '#ffffff',
    accent2: '#d4d4d8',
    accentText: '#111318',
  },
  {
    id: 'mono',
    name: 'Ink',
    blurb: 'Bold white type on solid black — maximum contrast',
    bg: () => solid('#0a0a0b'),
    title: title({ fill: '#ffffff', shadow: NO_SHADOW }),
    sub: '#d4d4d8',
    accent: '#facc15',
    accent2: '#eab308',
    accentText: '#111111',
  },
  {
    id: 'underwater',
    name: 'Underwater',
    blurb: 'Aqua title with bubbles of light on deep sea blue — fish, coral, treasure',
    bg: () => withPattern(grad('linear', ['#0e7490', '#082f49'], 0.5, 0.5, 180), { kind: 'bokeh', color: '#a5f3fc', opacity: 0.3, scale: 0.8 }),
    title: title({ fill: '#ecfeff', fillMode: 'gradient', fill2: '#67e8f9', gradientAngle: 180, stroke: stroke('#083344', 7), shadow: SHADOW }),
    sub: '#cffafe',
    accent: '#f97316',
    accent2: '#c2410c',
    accentText: '#ffffff',
  },
  {
    id: 'jungle',
    name: 'Jungle',
    blurb: 'Leafy greens with a golden title — explorers, temples, wildlife',
    bg: () => mesh('#052e16', ['#15803d', '#166534', '#65a30d', '#14532d']),
    title: title({ fill: '#fef3c7', fillMode: 'gradient', fill2: '#f59e0b', gradientAngle: 180, stroke: stroke('#1a2e05', 7), extrude: { enabled: true, color: '#1a2e05', depth: 9, angle: 90 } }),
    sub: '#d9f99d',
    accent: '#f59e0b',
    accent2: '#b45309',
    accentText: '#1a2e05',
  },
  {
    id: 'western',
    name: 'Western',
    blurb: 'Sunset desert and a wanted-poster title — cowboys, saloons, gold',
    bg: () => grad('linear', ['#fdba74', '#9a3412'], 0.5, 0.5, 180),
    title: title({ fontFamily: 'Georgia', fontWeight: 700, letterSpacing: 4, fill: '#fff7ed', stroke: stroke('#431407', 8), extrude: { enabled: true, color: '#431407', depth: 10, angle: 90 } }),
    sub: '#ffedd5',
    accent: '#78350f',
    accent2: '#451a03',
    accentText: '#fde68a',
  },
  {
    id: 'wasteland',
    name: 'Wasteland',
    blurb: 'Dusty olive haze with a rusty title — post-apocalypse, survival',
    bg: () => withPattern(grad('radial', ['#57534e', '#1c1917'], 0.5, 0.5), { kind: 'noise', color: '#d6d3d1', opacity: 0.16, scale: 1 }),
    title: title({ fontFamily: 'Impact', fontWeight: 400, letterSpacing: 4, fill: '#fde68a', fillMode: 'gradient', fill2: '#b45309', gradientAngle: 180, stroke: stroke('#1c1917', 6) }),
    sub: '#e7e5e4',
    accent: '#65a30d',
    accent2: '#3f6212',
    accentText: '#ffffff',
  },
  {
    id: 'lab',
    name: 'Toxic lab',
    blurb: 'Acid green glow on dark teal — chemistry, mutants, slime',
    bg: () => withLight(grad('radial', ['#134e4a', '#021412'], 0.5, 0.5), '#a3e635', 0.35),
    title: title({ fill: '#ecfccb', fillMode: 'gradient', fill2: '#84cc16', gradientAngle: 180, stroke: stroke('#052e16', 7), glow: { enabled: true, color: '#84cc16', blur: 22, opacity: 0.6 } }),
    sub: '#bef264',
    accent: '#a3e635',
    accent2: '#4d7c0f',
    accentText: '#052e16',
  },
  {
    id: 'christmas',
    name: 'Christmas',
    blurb: 'Festive red and gold on pine green with snow — holiday packs',
    bg: () => withPattern(grad('radial', ['#166534', '#052e16'], 0.5, 0.45), { kind: 'stars', color: '#ffffff', opacity: 0.75, scale: 1.2 }),
    title: title({ fill: '#ffffff', stroke: stroke('#991b1b', 9), stroke2: { enabled: true, color: '#fde68a', width: 4 }, shadow: SHADOW }),
    sub: '#fef3c7',
    accent: '#dc2626',
    accent2: '#991b1b',
    accentText: '#ffffff',
  },
  {
    id: 'autumn',
    name: 'Autumn',
    blurb: 'Warm orange and brown — harvest, forests, cozy',
    bg: () => withPattern(grad('linear', ['#ea580c', '#7c2d12'], 0.5, 0.5, 160), { kind: 'bokeh', color: '#fde68a', opacity: 0.25, scale: 1.2 }),
    title: title({ fill: '#fff7ed', stroke: stroke('#431407', 8), extrude: { enabled: true, color: '#431407', depth: 9, angle: 90 } }),
    sub: '#ffedd5',
    accent: '#facc15',
    accent2: '#ca8a04',
    accentText: '#431407',
  },
  {
    id: 'spring',
    name: 'Spring',
    blurb: 'Fresh mint and blossom pink — flowers, gardens, Easter',
    bg: () => grad('linear', ['#fbcfe8', '#bbf7d0'], 0.5, 0.5, 160),
    // outline darkened in this release (was #16a34a, 3.3:1 against the white fill); pages themed earlier keep theirs
    title: title({ fill: '#ffffff', stroke: stroke('#15803d', 9), stroke2: { enabled: true, color: '#ffffff', width: 6 }, shadow: { ...SHADOW, opacity: 0.2 } }),
    sub: '#14532d',
    accent: '#ec4899',
    accent2: '#be185d',
    accentText: '#ffffff',
  },
  {
    id: 'valentine',
    name: 'Valentine',
    blurb: 'Hearts-and-roses reds and pinks — love, gifts, cute',
    bg: () => withPattern(grad('radial', ['#f472b6', '#9f1239'], 0.5, 0.45), { kind: 'bokeh', color: '#fecdd3', opacity: 0.4, scale: 1 }),
    title: title({ fill: '#ffffff', stroke: stroke('#881337', 9), extrude: { enabled: true, color: '#4c0519', depth: 8, angle: 90 } }),
    sub: '#ffe4e6',
    accent: '#ffffff',
    accent2: '#fecdd3',
    accentText: '#be123c',
  },
  {
    id: 'summer',
    name: 'Summer',
    blurb: 'Sunny yellow to sea blue — beach, holidays, tropical',
    bg: () => withPattern(grad('linear', ['#fde047', '#38bdf8'], 0.5, 0.5, 180), { kind: 'rays', color: '#ffffff', opacity: 0.14, scale: 1, cy: 0.1 }),
    title: title({ fill: '#ffffff', stroke: stroke('#0c4a6e', 9), extrude: { enabled: true, color: '#0c4a6e', depth: 9, angle: 90 } }),
    sub: '#0c4a6e',
    accent: '#f97316',
    accent2: '#c2410c',
    accentText: '#ffffff',
  },
  {
    id: 'retro',
    name: 'Retro arcade',
    blurb: 'Synth sunset with a chrome-gradient title — 80s, arcade, pixel',
    bg: () => withPattern(grad('linear', ['#7e22ce', '#0f0326'], 0.5, 0.5, 180), { kind: 'grid', color: '#f472b6', opacity: 0.16, scale: 1.2 }),
    title: title({ fontFamily: 'Impact', fontWeight: 400, letterSpacing: 6, fill: '#fef08a', fillMode: 'gradient', fill2: '#f472b6', gradientAngle: 180, stroke: stroke('#1e0b3a', 6), extrude: { enabled: true, color: '#1e0b3a', depth: 12, angle: 90 } }),
    sub: '#f9a8d4',
    accent: '#22d3ee',
    accent2: '#0891b2',
    accentText: '#0f0326',
  },
  {
    id: 'kawaii',
    name: 'Kawaii',
    blurb: 'Pastel sky with a soft rounded title — cute, chibi, cozy',
    bg: () => mesh('#fdf2f8', ['#fbcfe8', '#c7d2fe', '#fef3c7', '#bbf7d0']),
    // outline darkened in this release (was #f472b6, 2.9:1 against the white fill); pages themed earlier keep theirs
    title: title({ fill: '#ffffff', stroke: stroke('#db2777', 10), stroke2: { enabled: true, color: '#ffffff', width: 6 }, shadow: { ...SHADOW, opacity: 0.15 } }),
    sub: '#9d174d',
    accent: '#a78bfa',
    accent2: '#7c3aed',
    accentText: '#ffffff',
  },
  {
    id: 'gothic',
    name: 'Gothic',
    blurb: 'Deep violet and silver serif — vampires, castles, dark fantasy',
    bg: () => ({ ...grad('radial', ['#3b0764', '#0a0212'], 0.5, 0.45), vignette: { enabled: true, strength: 0.5, color: '#000000' } }),
    title: title({ fontFamily: 'Palatino Linotype', fontWeight: 700, letterSpacing: 6, fill: '#f5f5f5', fillMode: 'gradient', fill2: '#a1a1aa', gradientAngle: 180, stroke: stroke('#1e0533', 5), glow: { enabled: true, color: '#a855f7', blur: 20, opacity: 0.5 } }),
    sub: '#d8b4fe',
    accent: '#7e22ce',
    accent2: '#4c1d95',
    accentText: '#f5f5f5',
  },
  {
    id: 'royal',
    name: 'Royal gold',
    blurb: 'Gold on deep purple — premium, kingdoms, rare loot',
    bg: () => withLight(grad('radial', ['#4c1d95', '#12052b'], 0.5, 0.45), '#facc15', 0.25),
    title: title({ fontFamily: 'Book Antiqua', fontWeight: 700, letterSpacing: 4, fill: '#fff7cc', fillMode: 'gradient', fill2: '#d4a017', gradientAngle: 180, stroke: stroke('#2e1065', 6), stroke2: { enabled: true, color: '#fde68a', width: 2 } }),
    sub: '#fde68a',
    accent: '#d4a017',
    accent2: '#a16207',
    accentText: '#2e1065',
  },
];

// ---------------------------------------------------------------------------
// Professional collection: restrained type (weights 500–700, no outlines or 3D), calm backgrounds and
// text colours with at least 7:1 contrast on their background. They suit UI kits, product shots and
// marketplace pages where the icons should carry the colour.
// ---------------------------------------------------------------------------

const SANS = 'Geist Variable';
const MONO = 'Geist Mono Variable';
const SOFT = { enabled: true, color: '#000000', blur: 18, dx: 0, dy: 6, opacity: 0.22 };
/** A clean title: no outline, glow or depth; an optional soft shadow. */
function clean(t: Partial<TextStyle>): Partial<TextStyle> {
  return { fontFamily: SANS, fontWeight: 600, letterSpacing: 0, fillMode: 'solid', stroke: off, stroke2: off, glow: noGlow, extrude: noExtrude, shadow: NO_SHADOW, ...t };
}

export const PRO_THEMES: Theme[] = [
  {
    id: 'pro-studio-light',
    name: 'Light studio',
    blurb: 'Near-black type on a soft warm-grey sweep — product shots, UI kits',
    group: 'Professional',
    bg: () => withLight(grad('radial', ['#f7f6f3', '#dedcd6'], 0.5, 0.42), '#ffffff', 0.35),
    title: clean({ fill: '#17171a', letterSpacing: -1 }),
    sub: '#4a4a52',
    accent: '#17171a',
    accent2: '#2c2c31',
    accentText: '#ffffff',
  },
  {
    id: 'pro-studio-dark',
    name: 'Dark studio',
    blurb: 'White type on a graphite sweep with a soft key light — any icon style',
    group: 'Professional',
    bg: () => withLight(grad('radial', ['#2a2b30', '#0c0c0e'], 0.5, 0.4), '#ffffff', 0.12),
    title: clean({ fill: '#f5f5f6', letterSpacing: -1, shadow: SOFT }),
    sub: '#a8a8b0',
    accent: '#f5f5f6',
    accent2: '#d4d4d8',
    accentText: '#111113',
  },
  {
    id: 'pro-editorial',
    name: 'Editorial',
    blurb: 'Serif headline on warm paper — catalogs, collections, crafted packs',
    group: 'Professional',
    bg: () => withPattern(solid('#f2ede3'), { kind: 'noise', color: '#5a4630', opacity: 0.05, scale: 1 }),
    title: clean({ fontFamily: 'Georgia', fontWeight: 700, fill: '#1f1a14', letterSpacing: 0 }),
    sub: '#5c5246',
    accent: '#9a3d12',
    accent2: '#7c2d0e',
    accentText: '#fff8ef',
  },
  {
    id: 'pro-midnight',
    name: 'Midnight',
    blurb: 'Cool white type on deep navy, sky-blue badges — tech, sci-fi UI',
    group: 'Professional',
    bg: () => grad('linear', ['#132042', '#060a17'], 0.5, 0.5, 160),
    title: clean({ fill: '#f4f7fc', shadow: SOFT }),
    sub: '#a3b1c9',
    accent: '#38bdf8',
    accent2: '#0ea5e9',
    accentText: '#04253a',
  },
  {
    id: 'pro-warm-neutral',
    name: 'Warm neutral',
    blurb: 'Espresso type on sand — cozy, food, crafting and farming packs',
    group: 'Professional',
    bg: () => grad('linear', ['#efe3d0', '#d9c4a5'], 0.5, 0.5, 170),
    title: clean({ fill: '#2a1c10', fontWeight: 700 }),
    sub: '#5e4630',
    accent: '#9c3c12',
    accent2: '#7a2e0c',
    accentText: '#fff6ec',
  },
  {
    id: 'pro-cool-neutral',
    name: 'Cool neutral',
    blurb: 'Slate type on pale blue-grey, cobalt badges — clean and technical',
    group: 'Professional',
    bg: () => grad('linear', ['#eef2f7', '#d3dce8'], 0.5, 0.5, 170),
    title: clean({ fill: '#0f172a', fontWeight: 700 }),
    sub: '#3f4a5e',
    accent: '#1d4ed8',
    accent2: '#1e40af',
    accentText: '#ffffff',
  },
  {
    id: 'pro-pastel',
    name: 'Soft pastel',
    blurb: 'Plum type on a blush-to-mist fade — cute, cozy and casual packs',
    group: 'Professional',
    bg: () => grad('linear', ['#fbe3e8', '#dfe9f8'], 0.5, 0.5, 135),
    title: clean({ fill: '#3a2d4f', fontWeight: 700 }),
    sub: '#5f5375',
    accent: '#e7849b',
    accent2: '#d4687f',
    accentText: '#3a1220',
  },
  {
    id: 'pro-monochrome',
    name: 'Monochrome',
    blurb: 'Spaced serif capitals on light grey — elegant, premium, minimal',
    group: 'Professional',
    bg: () => withPattern(solid('#e9e9e7'), { kind: 'noise', color: '#000000', opacity: 0.035, scale: 1 }),
    title: clean({ fontFamily: 'Palatino Linotype', fontWeight: 400, letterSpacing: 10, uppercase: true, fill: '#121212' }),
    sub: '#4a4a4a',
    accent: '#121212',
    accent2: '#2a2a2a',
    accentText: '#f2f2f0',
  },
  {
    id: 'pro-bold-type',
    name: 'Bold type',
    blurb: 'Heavy black type on signal yellow — sales, launches, loud covers',
    group: 'Professional',
    bg: () => solid('#ffd400'),
    title: clean({ fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#111111', letterSpacing: -2 }),
    sub: '#2b2b2b',
    accent: '#111111',
    accent2: '#000000',
    accentText: '#ffd400',
  },
  {
    id: 'pro-product-blue',
    name: 'Product blue',
    blurb: 'White type on rich cobalt, amber badges — store pages and banners',
    group: 'Professional',
    bg: () => withLight(grad('radial', ['#2747b8', '#0f1f63'], 0.5, 0.35), '#7aa2ff', 0.18),
    title: clean({ fill: '#ffffff', fontWeight: 700, shadow: SOFT }),
    sub: '#c9d6ff',
    accent: '#fbbf24',
    accent2: '#f59e0b',
    accentText: '#1f1300',
  },
  {
    id: 'pro-modern-gaming',
    name: 'Modern gaming',
    blurb: 'Wide white type on violet-black with lime badges — action, esports',
    group: 'Professional',
    bg: () => withPattern(grad('radial', ['#1f1838', '#07060d'], 0.5, 0.45), { kind: 'grid', color: '#a78bfa', opacity: 0.05, scale: 1.4 }),
    title: clean({ fontFamily: 'Bahnschrift', fontWeight: 700, letterSpacing: 4, uppercase: true, fill: '#ffffff', shadow: SOFT }),
    sub: '#b8b2cc',
    accent: '#a3e635',
    accent2: '#84cc16',
    accentText: '#132205',
  },
  {
    id: 'pro-retro-print',
    name: 'Retro print',
    blurb: 'Rust serif on cream with a faint halftone — vintage without the neon',
    group: 'Professional',
    bg: () => withPattern(solid('#f3e6cc'), { kind: 'halftone', color: '#c2410c', opacity: 0.06, scale: 1.2, cx: 0.85, cy: 0.15 }),
    title: clean({ fontFamily: 'Georgia', fontWeight: 700, fill: '#9a3412' }),
    sub: '#5b3a1e',
    accent: '#0f766e',
    accent2: '#115e59',
    accentText: '#f0fdfa',
  },
  {
    id: 'pro-fantasy',
    name: 'Old tome',
    blurb: 'Parchment serif on dark leather, no gradients — fantasy, made restrained',
    group: 'Professional',
    bg: () => withLight(grad('radial', ['#2e2620', '#100c0a'], 0.5, 0.45), '#e0b46a', 0.1),
    title: clean({ fontFamily: 'Book Antiqua', fontWeight: 700, fill: '#f1e3c2', letterSpacing: 2, shadow: SOFT }),
    sub: '#cdbb98',
    accent: '#c08a3e',
    accent2: '#9c6c2a',
    accentText: '#1b1208',
  },
  {
    id: 'pro-technical',
    name: 'Technical',
    blurb: 'Mono type on a blueprint grid — tools, sci-fi parts, UI icons',
    group: 'Professional',
    bg: () => withPattern(solid('#0b1220'), { kind: 'grid', color: '#60a5fa', opacity: 0.07, scale: 1 }),
    title: clean({ fontFamily: MONO, fontWeight: 600, letterSpacing: 2, fill: '#e6edf7' }),
    sub: '#8fb6e6',
    accent: '#22d3ee',
    accent2: '#06b6d4',
    accentText: '#032a30',
  },
  {
    id: 'pro-high-contrast',
    name: 'High contrast',
    blurb: 'White on pure black, yellow badges — maximum readability at any size',
    group: 'Professional',
    bg: () => solid('#000000'),
    title: clean({ fontWeight: 700, fill: '#ffffff' }),
    sub: '#ffffff',
    accent: '#ffe500',
    accent2: '#ffd000',
    accentText: '#000000',
  },
];

THEMES.unshift(...PRO_THEMES);

export const getTheme = (id: string) => THEMES.find((t) => t.id === id);

// ---------------------------------------------------------------------------
// Readability: contrast of a theme's text against its own background (WCAG formula)
// ---------------------------------------------------------------------------

export function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = hexLuminance(a),
    lb = hexLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Average colour of a background as one hex (gradient stops averaged; images and transparency give null). */
export function backgroundTone(b: Background): string | null {
  if (b.type === 'image' || b.type === 'transparent') return null;
  const cols = b.type === 'solid' ? [b.color] : b.gradient.stops.map((s) => s.color);
  const rgb = cols.map((c) => {
    const n = parseInt((/^#?([0-9a-f]{6})/i.exec(c)?.[1] ?? '808080'), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  const avg = [0, 1, 2].map((i) => Math.round(rgb.reduce((s, x) => s + x[i], 0) / rgb.length));
  return '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Worst-case contrast of a colour against every colour stop of a background (null when unknown). */
export function worstContrast(text: string, b: Background): number | null {
  if (b.type === 'image' || b.type === 'transparent') return null;
  const cols = b.type === 'solid' ? [b.color] : b.gradient.stops.map((s) => s.color);
  return Math.min(...cols.map((c) => contrastRatio(text, c)));
}

export type Readability = 'good' | 'fair' | 'poor' | 'unknown';
/**
 * How readable a theme's title and subtitle are on its own background. Outlines count: a light title
 * with a dark outline reads on a light sky. A heuristic, not a verdict on taste.
 */
export function themeReadability(t: Theme): { level: Readability; ratio: number | null } {
  const bg = t.bg();
  if (bg.type === 'image' || bg.type === 'transparent') return { level: 'unknown', ratio: null };
  const stops = bg.type === 'solid' ? [bg.color] : bg.gradient.stops.map((s) => s.color);
  const fill = t.title.fill ?? '#ffffff';
  const st = t.title.stroke;
  const outline = st?.enabled && st.width >= 4 ? st.color : null;
  // per colour of the background: the fill or a solid outline must stand out, and the outline from the fill
  const title = Math.min(...stops.map((c) => Math.max(contrastRatio(fill, c), outline ? Math.min(contrastRatio(outline, c), contrastRatio(fill, outline)) : 0)));
  const sub = Math.min(...stops.map((c) => contrastRatio(t.sub, c)));
  // subtitles in templates usually sit on panels or carry an outline, so they weigh less than the title
  const r = Math.min(title, Math.max(sub, 3));
  return { level: r >= 4.5 ? 'good' : r >= 3 ? 'fair' : 'poor', ratio: Math.round(r * 10) / 10 };
}

/** Light or dark, from the background's average tone. */
export const themeTone = (t: Theme): 'light' | 'dark' => {
  const tone = backgroundTone(t.bg());
  return tone && hexLuminance(tone) > 0.4 ? 'light' : 'dark';
};
