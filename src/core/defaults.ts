// Factories and presets for documents, pages, objects and styles.

import { uid } from './ids';
import type { Background, ExportSettings, FocalRegion, ImageObject, Page, ProjectDoc, SafeZone, ShapeObject, ShadowStyle, TextBadge, TextObject, TextStyle } from './types';

/** Blank page sizes. `popular` ones are shown on Home; labels end with the size. */
export const CANVAS_PRESETS: { label: string; w: number; h: number; group: string; popular?: boolean }[] = [
  // itch.io
  { label: 'itch.io cover 630×500', w: 630, h: 500, group: 'itch.io', popular: true },
  { label: 'itch.io cover 2× 1260×1000', w: 1260, h: 1000, group: 'itch.io' },
  { label: 'itch.io screenshot 1280×720', w: 1280, h: 720, group: 'itch.io', popular: true },
  { label: 'itch.io screenshot HD 1920×1080', w: 1920, h: 1080, group: 'itch.io' },
  { label: 'itch.io page banner 960×300', w: 960, h: 300, group: 'itch.io' },
  { label: 'itch.io wide banner 1920×640', w: 1920, h: 640, group: 'itch.io' },
  // Steam
  { label: 'Steam header capsule 920×430', w: 920, h: 430, group: 'Steam', popular: true },
  { label: 'Steam small capsule 462×174', w: 462, h: 174, group: 'Steam' },
  { label: 'Steam main capsule 1232×706', w: 1232, h: 706, group: 'Steam' },
  { label: 'Steam vertical capsule 748×896', w: 748, h: 896, group: 'Steam' },
  { label: 'Steam library capsule 600×900', w: 600, h: 900, group: 'Steam' },
  { label: 'Steam library hero 3840×1240', w: 3840, h: 1240, group: 'Steam' },
  { label: 'Steam screenshot 1920×1080', w: 1920, h: 1080, group: 'Steam' },
  { label: 'Steam page background 1438×810', w: 1438, h: 810, group: 'Steam' },
  // Asset stores
  { label: 'Unity Asset Store cover 1950×1300', w: 1950, h: 1300, group: 'Asset stores', popular: true },
  { label: 'Unity Asset Store card 420×280', w: 420, h: 280, group: 'Asset stores' },
  { label: 'Unity social image 1200×630', w: 1200, h: 630, group: 'Asset stores' },
  { label: 'Fab / Unreal gallery 1920×1080', w: 1920, h: 1080, group: 'Asset stores' },
  { label: 'Gumroad cover 1280×720', w: 1280, h: 720, group: 'Asset stores', popular: true },
  { label: 'Gumroad thumbnail 600×600', w: 600, h: 600, group: 'Asset stores' },
  { label: 'Etsy listing 2000×1500', w: 2000, h: 1500, group: 'Asset stores' },
  { label: 'Marketplace hero 1920×1080', w: 1920, h: 1080, group: 'Asset stores' },
  { label: 'Full catalog 3000×3000', w: 3000, h: 3000, group: 'Asset stores' },
  // Social media
  { label: 'Instagram post 1080×1080', w: 1080, h: 1080, group: 'Social media', popular: true },
  { label: 'Instagram portrait 1080×1350', w: 1080, h: 1350, group: 'Social media' },
  { label: 'Instagram story / Reel 1080×1920', w: 1080, h: 1920, group: 'Social media', popular: true },
  { label: 'TikTok 1080×1920', w: 1080, h: 1920, group: 'Social media' },
  { label: 'X / Twitter post 1600×900', w: 1600, h: 900, group: 'Social media', popular: true },
  { label: 'X / Twitter header 1500×500', w: 1500, h: 500, group: 'Social media' },
  { label: 'Facebook post 1200×630', w: 1200, h: 630, group: 'Social media' },
  { label: 'Facebook cover 1640×624', w: 1640, h: 624, group: 'Social media' },
  { label: 'Pinterest pin 1000×1500', w: 1000, h: 1500, group: 'Social media' },
  { label: 'LinkedIn post 1200×627', w: 1200, h: 627, group: 'Social media' },
  { label: 'LinkedIn banner 1584×396', w: 1584, h: 396, group: 'Social media' },
  { label: 'Reddit post 1200×900', w: 1200, h: 900, group: 'Social media' },
  { label: 'Bluesky post 1200×675', w: 1200, h: 675, group: 'Social media' },
  { label: 'Discord server banner 960×540', w: 960, h: 540, group: 'Social media' },
  { label: 'Discord / avatar icon 512×512', w: 512, h: 512, group: 'Social media' },
  { label: 'Patreon banner 1600×400', w: 1600, h: 400, group: 'Social media' },
  { label: 'Link preview (Open Graph) 1200×630', w: 1200, h: 630, group: 'Social media' },
  // Video & streaming
  { label: 'YouTube thumbnail 1280×720', w: 1280, h: 720, group: 'Video & streaming', popular: true },
  { label: 'YouTube channel banner 2560×1440', w: 2560, h: 1440, group: 'Video & streaming' },
  { label: 'Twitch offline banner 1920×1080', w: 1920, h: 1080, group: 'Video & streaming' },
  { label: 'Twitch panel 320×160', w: 320, h: 160, group: 'Video & streaming' },
  // Standard
  { label: 'Full HD 1920×1080', w: 1920, h: 1080, group: 'Standard', popular: true },
  { label: 'Square 1080×1080', w: 1080, h: 1080, group: 'Standard' },
  { label: 'Square 2048×2048', w: 2048, h: 2048, group: 'Standard' },
  { label: 'QHD 2560×1440', w: 2560, h: 1440, group: 'Standard' },
  { label: '4K 3840×2160', w: 3840, h: 2160, group: 'Standard' },
  { label: 'Story / phone 1080×1920', w: 1080, h: 1920, group: 'Standard' },
  { label: 'A4 print (300 dpi) 2480×3508', w: 2480, h: 3508, group: 'Standard' },
  // Aspect ratio
  { label: '16:9 · 1600×900', w: 1600, h: 900, group: 'Aspect ratio' },
  { label: '4:3 · 1600×1200', w: 1600, h: 1200, group: 'Aspect ratio' },
  { label: '3:2 · 1800×1200', w: 1800, h: 1200, group: 'Aspect ratio' },
  { label: '1:1 · 1500×1500', w: 1500, h: 1500, group: 'Aspect ratio' },
  { label: '4:5 · 1200×1500', w: 1200, h: 1500, group: 'Aspect ratio' },
  { label: '9:16 · 1080×1920', w: 1080, h: 1920, group: 'Aspect ratio' },
  { label: '21:9 · 2520×1080', w: 2520, h: 1080, group: 'Aspect ratio' },
  { label: '3:1 banner · 1800×600', w: 1800, h: 600, group: 'Aspect ratio' },
];

export const CANVAS_GROUPS = [...new Set(CANVAS_PRESETS.map((p) => p.group))];

/** "Steam header capsule 920×430" → "Steam header capsule". */
export const presetName = (label: string) => label.replace(/\s*[·]?\s*\d+×\d+$/, '').trim();

export const FONT_FAMILIES = [
  // bundled with the app (work on every computer, offline)
  'Geist Variable',
  'Geist Mono Variable',
  'Segoe UI',
  'Segoe UI Black',
  'Arial',
  'Arial Black',
  'Impact',
  'Bahnschrift',
  'Trebuchet MS',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Times New Roman',
  'Palatino Linotype',
  'Book Antiqua',
  'Courier New',
  'Consolas',
  'Lucida Console',
  'Comic Sans MS',
  'Franklin Gothic Medium',
  'Gabriola',
  'Candara',
  'Constantia',
  'Corbel',
  'system-ui',
  'serif',
  'sans-serif',
  'monospace',
];

export const shadowDefault = (): ShadowStyle => ({ enabled: false, color: '#000000', blur: 12, dx: 0, dy: 6, opacity: 0.5 });

export function defaultBackground(): Background {
  return {
    type: 'radial',
    color: '#1b1d24',
    gradient: {
      stops: [
        { offset: 0, color: '#3b3f47' },
        { offset: 1, color: '#15171b' },
      ],
      angle: 90,
      cx: 0.5,
      cy: 0.45,
      radius: 0.85,
    },
    image: { fit: 'fill', scale: 1, offsetX: 0, offsetY: 0, rotation: 0, blur: 0, brightness: 0, contrast: 0, saturation: 0, opacity: 1 },
    overlay: { enabled: false, color: '#378ef0', opacity: 0.25, blend: 'source-over' },
    pattern: { enabled: false, kind: 'dots', color: '#ffffff', color2: '#ffffff', color3: '#f5c542', opacity: 0.08, scale: 1, angle: 0, cx: 0.5, cy: 0.5, seed: 1 },
    light: { enabled: false, color: '#ffffff', x: 0.5, y: 0.45, size: 0.7, strength: 0.35 },
    vignette: { enabled: false, strength: 0.45, color: '#000000' },
  };
}

export const defaultSafeZone = (): SafeZone => ({ enabled: false, top: 5, right: 5, bottom: 5, left: 5 });

export function defaultFocal(w: number, h: number): FocalRegion {
  return { enabled: false, shape: 'ellipse', x: w / 2, y: h / 2, w: w * 0.42, h: h * 0.32 };
}

export function createPage(name: string, width: number, height: number, bg?: Background): Page {
  return {
    id: uid('pg'),
    name,
    width,
    height,
    background: bg ?? defaultBackground(),
    objects: [],
    groups: [],
    layouts: [],
    guides: [],
    safeZone: defaultSafeZone(),
    focal: defaultFocal(width, height),
  };
}

// Set from the user's preferences (Settings ▸ General).
let newProjectSize = { w: 1920, h: 1080 };
let baseFont = 'Segoe UI Black';
export function setNewProjectSize(w: number, h: number) {
  if (w >= 16 && h >= 16) newProjectSize = { w, h };
}
export function setDefaultFont(f: string) {
  if (f) baseFont = f;
}

export function createProject(name = 'Untitled showcase'): ProjectDoc {
  const page = createPage('Hero', newProjectSize.w, newProjectSize.h);
  const now = Date.now();
  return { version: 1, id: uid('prj'), name, createdAt: now, updatedAt: now, assets: [], pages: [page], activePageId: page.id, fonts: [] };
}

export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: baseFont,
    fontSize: 96,
    fontWeight: 900,
    italic: false,
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.05,
    uppercase: false,
    fill: '#ffffff',
    stroke: { enabled: false, color: '#1a1030', width: 6 },
    shadow: { enabled: true, color: '#000000', blur: 18, dx: 0, dy: 6, opacity: 0.55 },
  };
}

const NO_SHADOW = { ...shadowDefault(), enabled: false };
const SOFT_SHADOW = { enabled: true, color: '#000000', blur: 24, dx: 0, dy: 10, opacity: 0.45 };
const TIGHT_SHADOW = { enabled: true, color: '#000000', blur: 8, dx: 0, dy: 4, opacity: 0.4 };
const badge = (b: Partial<TextBadge>): TextBadge => ({
  enabled: true,
  shape: 'pill',
  color: '#e11d48',
  color2: '#9f1239',
  gradient: false,
  padX: 40,
  padY: 16,
  radius: 16,
  stroke: { enabled: false, color: '#ffffff', width: 4 },
  points: 14,
  ...b,
});

/** Ready-made text styles. `{count}` becomes the number of assets in the project. */
export const TEXT_PRESET_GROUPS = ['Clean', 'Titles', 'Pixel', 'Styled titles', 'Badges', 'Labels'] as const;
export const TEXT_PRESETS: { name: string; group: (typeof TEXT_PRESET_GROUPS)[number]; text: string; style: Partial<TextStyle> }[] = [
  // Titles
  { name: 'Icon count', group: 'Titles', text: '{count} ICONS', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#ffffff', stroke: { enabled: true, color: '#111318', width: 7 }, shadow: SOFT_SHADOW } },
  { name: 'Clean headline', group: 'Titles', text: 'FANTASY ICON PACK', style: { fontSize: 104, fontFamily: 'Segoe UI', fontWeight: 700, letterSpacing: 10, fill: '#ffffff', stroke: { enabled: false, color: '#000000', width: 4 }, shadow: SOFT_SHADOW } },
  { name: 'Gold', group: 'Titles', text: '{count} GAME ICONS', style: { fontSize: 120, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#fff7d6', fillMode: 'gradient', fill2: '#e0a526', gradientAngle: 180, stroke: { enabled: true, color: '#3d2405', width: 6 }, stroke2: { enabled: true, color: '#fff3c4', width: 3 }, shadow: SOFT_SHADOW } },
  { name: 'Chrome', group: 'Titles', text: 'ICON PACK', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 4, fill: '#ffffff', fillMode: 'gradient', fill2: '#8d97a5', gradientAngle: 180, stroke: { enabled: true, color: '#1b1f27', width: 6 }, shadow: SOFT_SHADOW } },
  { name: 'Sticker', group: 'Titles', text: 'GAME ICONS', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', stroke: { enabled: true, color: '#1d4ed8', width: 9 }, stroke2: { enabled: true, color: '#ffffff', width: 7 }, extrude: { enabled: true, color: '#0b1f5c', depth: 10, angle: 90 }, shadow: SOFT_SHADOW } },
  { name: '3D block', group: 'Titles', text: 'ICON PACK', style: { fontSize: 150, fontFamily: 'Impact', fontWeight: 400, letterSpacing: 4, fill: '#ffd23f', stroke: { enabled: true, color: '#2b1600', width: 6 }, extrude: { enabled: true, color: '#2b1600', depth: 16, angle: 90 }, shadow: SOFT_SHADOW } },
  { name: 'Neon', group: 'Titles', text: 'PIXEL ICONS', style: { fontSize: 120, fontFamily: 'Bahnschrift', fontWeight: 700, letterSpacing: 8, fill: '#f0feff', glow: { enabled: true, color: '#22d3ee', blur: 28, opacity: 0.9 }, shadow: NO_SHADOW } },
  { name: 'Arched', group: 'Titles', text: 'FANTASY ICONS', style: { fontSize: 110, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, curve: 0.3, stroke: { enabled: true, color: '#111318', width: 7 }, shadow: SOFT_SHADOW } },
  { name: 'Subtitle', group: 'Titles', text: 'HAND-PAINTED GAME UI', style: { fontSize: 44, fontFamily: 'Segoe UI', fontWeight: 600, letterSpacing: 8, fill: '#d9dde4', shadow: TIGHT_SHADOW } },

  { name: 'Stacked count', group: 'Titles', text: '{count}\nICONS', style: { fontSize: 150, fontFamily: 'Segoe UI Black', fontWeight: 900, lineHeight: 0.88, fill: '#ffffff', stroke: { enabled: true, color: '#111318', width: 8 }, shadow: SOFT_SHADOW } },
  { name: 'Outline', group: 'Titles', text: 'ICON PACK', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 6, fill: '#ffffff00', stroke: { enabled: true, color: '#ffffff', width: 4 }, shadow: NO_SHADOW } },
  { name: 'Minimal', group: 'Titles', text: 'ICON COLLECTION', style: { fontSize: 84, fontFamily: 'Segoe UI', fontWeight: 300, letterSpacing: 18, fill: '#ffffff', shadow: NO_SHADOW } },
  { name: 'Serif', group: 'Titles', text: 'Fantasy Icons', style: { fontSize: 120, fontFamily: 'Georgia', fontWeight: 700, italic: true, fill: '#f8ecd0', shadow: SOFT_SHADOW } },
  { name: 'Two-tone', group: 'Titles', text: 'GAME ICONS', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#ffffff', fillMode: 'gradient', fill2: '#ffd23f', gradientAngle: 180, stroke: { enabled: true, color: '#111318', width: 7 }, shadow: SOFT_SHADOW } },

  { name: 'Pixel title', group: 'Pixel', text: 'ICON PACK', style: { fontSize: 150, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 6, fill: '#fff07a', fillMode: 'gradient', fill2: '#ff9f1c', gradientAngle: 180, stroke: { enabled: true, color: '#2b1d0e', width: 12 }, extrude: { enabled: true, color: '#2b1d0e', depth: 12, angle: 90 }, shadow: NO_SHADOW, pixel: 10 } },
  { name: 'Pixel harvest', group: 'Pixel', text: 'FARMING SEASON', style: { fontSize: 130, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 4, fill: '#d6ff6b', fillMode: 'gradient', fill2: '#2fbf71', gradientAngle: 180, stroke: { enabled: true, color: '#14321c', width: 11 }, stroke2: { enabled: true, color: '#ffffff', width: 6 }, shadow: NO_SHADOW, pixel: 10 } },
  { name: 'Pixel RPG', group: 'Pixel', text: 'RPG ICONS', style: { fontSize: 150, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 8, fill: '#ffc27a', fillMode: 'gradient', fill2: '#c2581a', gradientAngle: 180, stroke: { enabled: true, color: '#3b1a07', width: 9 }, extrude: { enabled: true, color: '#3b1a07', depth: 14, angle: 90 }, shadow: NO_SHADOW, pixel: 10 } },
  { name: 'Pixel arcade', group: 'Pixel', text: 'GAME OVER', style: { fontSize: 120, fontFamily: 'Consolas', fontWeight: 700, letterSpacing: 6, fill: '#ffffff', stroke: { enabled: true, color: '#ff2bd6', width: 10 }, stroke2: { enabled: true, color: '#1b0b3a', width: 8 }, shadow: NO_SHADOW, pixel: 9 } },
  { name: 'Pixel cyber', group: 'Pixel', text: 'CYBER HORROR', style: { fontSize: 120, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 4, fill: '#7dffb0', fillMode: 'gradient', fill2: '#1fc47a', gradientAngle: 180, stroke: { enabled: true, color: '#0d1b24', width: 10 }, shadow: NO_SHADOW, pixel: 10 } },
  { name: 'Pixel classic', group: 'Pixel', text: '16×16 ICONS', style: { fontSize: 120, fontFamily: 'Consolas', fontWeight: 700, letterSpacing: 4, fill: '#ffffff', stroke: { enabled: true, color: '#000000', width: 10 }, extrude: { enabled: true, color: '#000000', depth: 8, angle: 135 }, shadow: NO_SHADOW, pixel: 8 } },
  { name: 'Pixel count', group: 'Pixel', text: '{count}+ ICONS!', style: { fontSize: 64, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#ffffff', stroke: { enabled: true, color: '#1d1d1d', width: 7 }, shadow: NO_SHADOW, pixel: 6 } },
  { name: 'Pixel sticker', group: 'Pixel', text: 'NEW!', style: { fontSize: 64, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#1d1d1d', shadow: NO_SHADOW, pixel: 6, badge: badge({ shape: 'rect', color: '#ffe14d', padX: 34, padY: 14, radius: 0, stroke: { enabled: true, color: '#1d1d1d', width: 6 } }) } },
  { name: 'Pixel label', group: 'Pixel', text: '16×16 · 32×32 · PNG', style: { fontSize: 38, fontFamily: 'Consolas', fontWeight: 700, letterSpacing: 2, fill: '#ffffff', stroke: { enabled: true, color: '#000000', width: 5 }, shadow: NO_SHADOW, pixel: 3.5 } },

  { name: 'Fire', group: 'Styled titles', text: 'FIRE PACK', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#fff3b0', fillMode: 'gradient', fill2: '#ff5a00', gradientAngle: 180, stroke: { enabled: true, color: '#3a0a00', width: 6 }, glow: { enabled: true, color: '#ff6a00', blur: 26, opacity: 0.65 }, shadow: NO_SHADOW } },
  { name: 'Ice', group: 'Styled titles', text: 'FROST', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 6, fill: '#ffffff', fillMode: 'gradient', fill2: '#9bdcff', gradientAngle: 180, stroke: { enabled: true, color: '#0b3a66', width: 7 }, stroke2: { enabled: true, color: '#e0f2fe', width: 3 }, shadow: SOFT_SHADOW } },
  { name: 'Toxic', group: 'Styled titles', text: 'TOXIC', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#e4ff6a', fillMode: 'gradient', fill2: '#4fc61f', gradientAngle: 180, stroke: { enabled: true, color: '#10240a', width: 7 }, extrude: { enabled: true, color: '#10240a', depth: 10, angle: 90 }, shadow: SOFT_SHADOW } },
  { name: 'Royal', group: 'Styled titles', text: 'ROYAL LOOT', style: { fontSize: 128, fontFamily: 'Book Antiqua', fontWeight: 700, letterSpacing: 4, fill: '#fff1c1', fillMode: 'gradient', fill2: '#d4a017', gradientAngle: 180, stroke: { enabled: true, color: '#3b1d5a', width: 7 }, stroke2: { enabled: true, color: '#f5e6c8', width: 2 }, shadow: SOFT_SHADOW } },
  { name: 'Comic', group: 'Styled titles', text: 'POW!', style: { fontSize: 150, fontFamily: 'Segoe UI Black', fontWeight: 900, italic: true, fill: '#ffe14d', stroke: { enabled: true, color: '#111111', width: 8 }, extrude: { enabled: true, color: '#e63946', depth: 12, angle: 120 }, shadow: NO_SHADOW } },
  { name: 'Retro', group: 'Styled titles', text: 'RETRO', style: { fontSize: 150, fontFamily: 'Impact', fontWeight: 400, italic: true, letterSpacing: 4, fill: '#ffde59', fillMode: 'gradient', fill2: '#ff5e7e', gradientAngle: 180, stroke: { enabled: true, color: '#2d1b4e', width: 6 }, extrude: { enabled: true, color: '#2d1b4e', depth: 14, angle: 90 }, shadow: NO_SHADOW } },
  { name: 'Sci-fi', group: 'Styled titles', text: 'SCI-FI', style: { fontSize: 120, fontFamily: 'Bahnschrift', fontWeight: 700, letterSpacing: 14, fill: '#e0fbff', fillMode: 'gradient', fill2: '#5ad8ff', gradientAngle: 180, glow: { enabled: true, color: '#22d3ee', blur: 24, opacity: 0.8 }, shadow: NO_SHADOW } },
  { name: 'Horror', group: 'Styled titles', text: 'HORROR', style: { fontSize: 140, fontFamily: 'Impact', fontWeight: 400, letterSpacing: 4, fill: '#e11d1d', stroke: { enabled: true, color: '#000000', width: 5 }, glow: { enabled: true, color: '#7f0000', blur: 28, opacity: 0.85 }, shadow: NO_SHADOW } },
  { name: 'Wood', group: 'Styled titles', text: 'CRAFTING', style: { fontSize: 136, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#f6cf8f', fillMode: 'gradient', fill2: '#a0612b', gradientAngle: 180, stroke: { enabled: true, color: '#3b2210', width: 7 }, extrude: { enabled: true, color: '#3b2210', depth: 12, angle: 90 }, shadow: SOFT_SHADOW } },
  { name: 'Bubble', group: 'Styled titles', text: 'CUTE ICONS', style: { fontSize: 130, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', stroke: { enabled: true, color: '#7c3aed', width: 10 }, stroke2: { enabled: true, color: '#ffffff', width: 7 }, extrude: { enabled: true, color: '#4c1d95', depth: 9, angle: 90 }, shadow: SOFT_SHADOW } },
  { name: 'Candy pop', group: 'Styled titles', text: 'SWEETS', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', fillMode: 'gradient', fill2: '#ffd1e8', gradientAngle: 180, stroke: { enabled: true, color: '#db2777', width: 9 }, extrude: { enabled: true, color: '#9d174d', depth: 10, angle: 90 }, shadow: SOFT_SHADOW } },
  { name: 'Emerald', group: 'Styled titles', text: 'NATURE', style: { fontSize: 140, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 3, fill: '#d9ffe8', fillMode: 'gradient', fill2: '#22c55e', gradientAngle: 180, stroke: { enabled: true, color: '#052e16', width: 7 }, shadow: SOFT_SHADOW } },
  { name: 'Steel', group: 'Styled titles', text: 'WEAPONS', style: { fontSize: 140, fontFamily: 'Impact', fontWeight: 400, letterSpacing: 6, fill: '#f1f5f9', fillMode: 'gradient', fill2: '#64748b', gradientAngle: 180, stroke: { enabled: true, color: '#0f172a', width: 6 }, stroke2: { enabled: true, color: '#94a3b8', width: 2 }, shadow: SOFT_SHADOW } },
  { name: 'Terminal', group: 'Styled titles', text: 'PIXEL_ICONS', style: { fontSize: 110, fontFamily: 'Consolas', fontWeight: 700, letterSpacing: 4, fill: '#7dff8a', glow: { enabled: true, color: '#22c55e', blur: 18, opacity: 0.8 }, shadow: NO_SHADOW } },
  { name: 'Synthwave', group: 'Styled titles', text: 'NEON CITY', style: { fontSize: 128, fontFamily: 'Bahnschrift', fontWeight: 700, italic: true, letterSpacing: 6, fill: '#ffffff', stroke: { enabled: true, color: '#ff2bd6', width: 3 }, glow: { enabled: true, color: '#ff2bd6', blur: 30, opacity: 0.9 }, shadow: NO_SHADOW } },

  // Badges
  { name: 'Free demo', group: 'Badges', text: 'FREE DEMO', style: { fontSize: 56, fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 3, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'pill', color: '#22b573', color2: '#14804f', gradient: true, padX: 44, padY: 18 }) } },
  { name: 'Count burst', group: 'Badges', text: '{count}\nICONS', style: { fontSize: 62, fontFamily: 'Segoe UI Black', fontWeight: 900, lineHeight: 0.95, fill: '#24160a', shadow: SOFT_SHADOW, badge: badge({ shape: 'burst', color: '#ffd23f', color2: '#f2a516', gradient: true, padX: 72, padY: 72, points: 18, stroke: { enabled: true, color: '#ffffff', width: 4 } }) } },
  { name: 'New', group: 'Badges', text: 'NEW', style: { fontSize: 60, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 4, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'burst', color: '#ef4444', color2: '#b91c1c', gradient: true, padX: 60, padY: 60, points: 14 }) } },
  { name: 'Sale', group: 'Badges', text: '−50%', style: { fontSize: 64, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'slant', color: '#e11d48', padX: 44, padY: 14 }) } },
  { name: 'Ribbon', group: 'Badges', text: 'BEST SELLER', style: { fontSize: 46, fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 4, fill: '#ffffff', shadow: TIGHT_SHADOW, badge: badge({ shape: 'ribbon', color: '#2563eb', color2: '#1e40af', gradient: true, padX: 72, padY: 16 }) } },
  { name: 'Price tag', group: 'Badges', text: '$4.99', style: { fontSize: 60, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#111318', shadow: SOFT_SHADOW, badge: badge({ shape: 'tag', color: '#ffd23f', padX: 40, padY: 14 }) } },
  { name: 'Stamp', group: 'Badges', text: 'HD\nPNG', style: { fontSize: 52, fontFamily: 'Segoe UI Black', fontWeight: 900, lineHeight: 0.95, letterSpacing: 2, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'circle', color: '#1f2937', padX: 46, padY: 46, stroke: { enabled: true, color: '#ffffff', width: 5 } }) } },

  { name: 'Free', group: 'Badges', text: 'FREE', style: { fontSize: 64, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'circle', color: '#22c55e', color2: '#15803d', gradient: true, padX: 54, padY: 54, stroke: { enabled: true, color: '#ffffff', width: 5 } }) } },
  { name: 'Hot', group: 'Badges', text: 'HOT!', style: { fontSize: 60, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'burst', color: '#fb923c', color2: '#dc2626', gradient: true, padX: 58, padY: 58, points: 16 }) } },
  { name: 'Updated', group: 'Badges', text: 'UPDATED', style: { fontSize: 44, fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 4, fill: '#ffffff', shadow: TIGHT_SHADOW, badge: badge({ shape: 'pill', color: '#3b82f6', color2: '#1d4ed8', gradient: true, padX: 40, padY: 14 }) } },
  { name: 'Coming soon', group: 'Badges', text: 'COMING SOON', style: { fontSize: 42, fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 6, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'rect', color: '#111318', padX: 44, padY: 16, radius: 6, stroke: { enabled: true, color: '#ffffff', width: 3 } }) } },
  { name: 'Bundle', group: 'Badges', text: 'BUNDLE', style: { fontSize: 46, fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 5, fill: '#ffffff', shadow: TIGHT_SHADOW, badge: badge({ shape: 'ribbon', color: '#7c3aed', color2: '#5b21b6', gradient: true, padX: 72, padY: 16 }) } },
  { name: 'Limited', group: 'Badges', text: 'LIMITED', style: { fontSize: 52, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 4, fill: '#111318', shadow: SOFT_SHADOW, badge: badge({ shape: 'slant', color: '#facc15', padX: 44, padY: 14 }) } },
  { name: 'Bonus', group: 'Badges', text: '+ BONUS', style: { fontSize: 50, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'tag', color: '#16a34a', padX: 40, padY: 14 }) } },
  { name: 'Count pill', group: 'Badges', text: '{count}+ ICONS', style: { fontSize: 50, fontFamily: 'Segoe UI Black', fontWeight: 900, letterSpacing: 2, fill: '#24160a', shadow: SOFT_SHADOW, badge: badge({ shape: 'pill', color: '#ffe066', color2: '#f5a524', gradient: true, padX: 44, padY: 16, stroke: { enabled: true, color: '#ffffff', width: 3 } }) } },
  { name: 'Demo seal', group: 'Badges', text: 'FREE\nDEMO', style: { fontSize: 50, fontFamily: 'Segoe UI Black', fontWeight: 900, lineHeight: 0.95, fill: '#ffffff', shadow: SOFT_SHADOW, badge: badge({ shape: 'burst', color: '#22c55e', color2: '#15803d', gradient: true, padX: 64, padY: 64, points: 20, stroke: { enabled: true, color: '#ffffff', width: 4 } }) } },

  // Labels
  { name: 'Feature line', group: 'Labels', text: 'PNG  ·  TRANSPARENT  ·  COMMERCIAL USE', style: { fontSize: 32, fontFamily: 'Segoe UI', fontWeight: 600, letterSpacing: 4, fill: '#ffd23f', shadow: TIGHT_SHADOW } },
  { name: 'Spec chip', group: 'Labels', text: '512 × 512 PNG', style: { fontSize: 32, fontFamily: 'Segoe UI', fontWeight: 600, letterSpacing: 2, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#000000', padX: 26, padY: 10, stroke: { enabled: true, color: '#ffffff', width: 2 } }) } },
  { name: 'Dark bar', group: 'Labels', text: 'Commercial use allowed', style: { fontSize: 38, fontFamily: 'Segoe UI', fontWeight: 600, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'rect', color: '#0f1115', padX: 56, padY: 18, radius: 8 }) } },
  { name: 'Glass chip', group: 'Labels', text: 'HAND-PAINTED', style: { fontSize: 34, fontFamily: 'Segoe UI', fontWeight: 700, letterSpacing: 4, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#ffffff26', padX: 30, padY: 12, stroke: { enabled: true, color: '#ffffff59', width: 2 } }) } },
  { name: 'Light chip', group: 'Labels', text: '64 × 64 PX', style: { fontSize: 32, fontFamily: 'Segoe UI', fontWeight: 700, letterSpacing: 2, fill: '#111318', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#ffffff', padX: 26, padY: 10 }) } },
  { name: 'Category tag', group: 'Labels', text: 'WEAPONS', style: { fontSize: 36, fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 6, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'rect', color: '#2563eb', padX: 28, padY: 10, radius: 6 }) } },
  { name: 'Sizes line', group: 'Labels', text: '32 · 64 · 128 · 512 PX', style: { fontSize: 32, fontFamily: 'Bahnschrift', fontWeight: 600, letterSpacing: 4, fill: '#d9dde4', shadow: TIGHT_SHADOW } },
  { name: 'Caption', group: 'Labels', text: 'Includes source PNG files', style: { fontSize: 34, fontFamily: 'Segoe UI', fontWeight: 400, italic: true, fill: '#c7ccd4', shadow: NO_SHADOW } },
  { name: 'Big price', group: 'Labels', text: '$9.99', style: { fontSize: 110, fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff', stroke: { enabled: true, color: '#111318', width: 6 }, shadow: SOFT_SHADOW } },
  { name: 'Body', group: 'Labels', text: 'Your text here', style: { fontSize: 40, fontFamily: 'Segoe UI', fontWeight: 400, shadow: NO_SHADOW } },
  // Clean — restrained titles, labels and callouts (appended: templates refer to the presets above by name)
  { name: 'Minimal title', group: 'Clean', text: 'Icon Pack', style: { fontSize: 104, fontFamily: 'Geist Variable', fontWeight: 650, letterSpacing: -2, fill: '#f5f5f6', stroke: { enabled: false, color: '#000000', width: 4 }, shadow: NO_SHADOW } },
  { name: 'Editorial heading', group: 'Clean', text: 'The Collection', style: { fontSize: 96, fontFamily: 'Georgia', fontWeight: 700, letterSpacing: 0, fill: '#f2ede3', shadow: NO_SHADOW } },
  { name: 'Kicker', group: 'Clean', text: 'New collection', style: { fontSize: 30, fontFamily: 'Geist Mono Variable', fontWeight: 500, letterSpacing: 1, fill: '#a1a1aa', shadow: NO_SHADOW } },
  { name: 'Feature callout', group: 'Clean', text: 'Transparent backgrounds', style: { fontSize: 40, fontFamily: 'Geist Variable', fontWeight: 500, fill: '#f5f5f6', shadow: NO_SHADOW } },
  { name: 'Category header', group: 'Clean', text: 'Weapons', style: { fontSize: 48, fontFamily: 'Geist Variable', fontWeight: 600, fill: '#f5f5f6', shadow: NO_SHADOW } },
  { name: 'Product badge', group: 'Clean', text: 'Premium', style: { fontSize: 32, fontFamily: 'Geist Variable', fontWeight: 600, fill: '#111113', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#f4f4f5', padX: 28, padY: 12 }) } },
  { name: 'Free demo label', group: 'Clean', text: 'Free demo', style: { fontSize: 32, fontFamily: 'Geist Variable', fontWeight: 600, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#15803d', padX: 28, padY: 12 }) } },
  { name: 'New label', group: 'Clean', text: 'New', style: { fontSize: 32, fontFamily: 'Geist Variable', fontWeight: 600, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#2563eb', padX: 28, padY: 12 }) } },
  { name: 'Updated label', group: 'Clean', text: 'Updated', style: { fontSize: 32, fontFamily: 'Geist Variable', fontWeight: 600, fill: '#f4f4f5', shadow: NO_SHADOW, badge: badge({ shape: 'pill', color: '#18181b', padX: 28, padY: 12, stroke: { enabled: true, color: '#52525b', width: 2 } }) } },
  { name: 'Sale label', group: 'Clean', text: '−30%', style: { fontSize: 36, fontFamily: 'Geist Variable', fontWeight: 700, fill: '#ffffff', shadow: NO_SHADOW, badge: badge({ shape: 'rect', color: '#b91c1c', padX: 24, padY: 10, radius: 8 }) } },
  { name: 'Icon count label', group: 'Clean', text: '{count} icons', style: { fontSize: 30, fontFamily: 'Geist Mono Variable', fontWeight: 500, fill: '#f4f4f5', shadow: NO_SHADOW, badge: badge({ shape: 'rect', color: '#232326', padX: 22, padY: 10, radius: 8 }) } },
  { name: 'Format badge', group: 'Clean', text: 'PNG · 64 px', style: { fontSize: 28, fontFamily: 'Geist Mono Variable', fontWeight: 500, fill: '#e4e4e7', shadow: NO_SHADOW, badge: badge({ shape: 'rect', color: '#18181b', padX: 20, padY: 10, radius: 6, stroke: { enabled: true, color: '#3f3f46', width: 2 } }) } },
  { name: 'Comparison label', group: 'Clean', text: 'Free  ·  Full pack', style: { fontSize: 36, fontFamily: 'Geist Variable', fontWeight: 600, letterSpacing: 1, fill: '#f4f4f5', shadow: NO_SHADOW } },
];

/** Scale every size in a text style (font, outlines, depth, badge padding) — presets are designed for ~1080px pages. */
export function scaleTextStyle(style: Partial<TextStyle>, k: number): Partial<TextStyle> {
  if (Math.abs(k - 1) < 0.01) return style;
  const s = structuredClone(style);
  s.fontSize = (s.fontSize ?? defaultTextStyle().fontSize) * k;
  if (s.letterSpacing) s.letterSpacing *= k;
  if (s.stroke) s.stroke.width *= k;
  if (s.stroke2) s.stroke2.width *= k;
  if (s.extrude) s.extrude.depth *= k;
  if (s.glow) s.glow.blur *= k;
  if (s.pixel) s.pixel *= k;
  if (s.shadow) s.shadow = { ...s.shadow, blur: s.shadow.blur * k, dx: s.shadow.dx * k, dy: s.shadow.dy * k };
  if (s.badge) s.badge = { ...s.badge, padX: s.badge.padX * k, padY: s.badge.padY * k, radius: s.badge.radius * k, stroke: { ...s.badge.stroke, width: s.badge.stroke.width * k } };
  return s;
}

/**
 * Put a look (a preset or saved style) on existing text. The look is scaled to the text's current
 * size; size, alignment, line height and curve stay the text's own, so applying a look never makes
 * a title jump in size or position.
 */
export function applyTextLook(cur: TextStyle, look: Partial<TextStyle>): TextStyle {
  const designed = look.fontSize ?? defaultTextStyle().fontSize;
  const scaled = scaleTextStyle({ ...defaultTextStyle(), ...look, fontSize: designed }, cur.fontSize / Math.max(1, designed));
  return { ...cur, ...scaled, fontSize: cur.fontSize, align: cur.align, lineHeight: cur.lineHeight, curve: cur.curve } as TextStyle;
}

/** A saved element: a text style plus the words it was saved with (older saved styles have none). */
export type SavedElement = Partial<TextStyle> & { sampleText?: string };
/** The style part of a saved element (the words are not a style property). */
export function elementStyle(d: SavedElement): Partial<TextStyle> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sampleText, ...style } = d;
  return style;
}

/** Preset scale for a page: 1 on a 1080px page, smaller on store covers, larger on 4K. */
export const pageTextScale = (w: number, h: number) => Math.max(0.35, Math.min(3, Math.min(w, h) / 1080));

export function createText(text: string, x: number, y: number, style?: Partial<TextStyle>): TextObject {
  const s = { ...defaultTextStyle(), ...style };
  return { id: uid('tx'), type: 'text', name: text.replace(/\s*\n\s*/g, ' ').slice(0, 32) || 'Text', x, y, w: Math.max(200, s.fontSize * Math.min(text.length, 24) * 0.62), h: s.fontSize * s.lineHeight, rotation: 0, flipX: false, flipY: false, opacity: 1, text, style: s };
}

export function createShape(shape: ShapeObject['shape'], x: number, y: number, w: number, h: number, extra: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id: uid('sh'),
    type: 'shape',
    name: shape === 'rect' ? (extra.radius ? 'Rounded rectangle' : 'Rectangle') : shape === 'ellipse' ? (w === h ? 'Circle' : 'Ellipse') : shape === 'line' ? 'Line' : shape[0].toUpperCase() + shape.slice(1),
    shape,
    x,
    y,
    w,
    h: shape === 'line' ? 0 : h,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    fill: '#7c3aed',
    fillEnabled: shape !== 'line',
    stroke: '#ffffff',
    strokeWidth: shape === 'line' ? 6 : 0,
    radius: 0,
    ...extra,
  };
}

export function createImage(assetId: string, name: string, x: number, y: number, w: number, h: number): ImageObject {
  return { id: uid('im'), type: 'image', assetId, name, x, y, w, h, rotation: 0, flipX: false, flipY: false, opacity: 1 };
}

export const DEFAULT_EXPORT: ExportSettings = { format: 'png', quality: 0.92, scale: 1, matte: '#000000', pattern: '{project}_{page}', onConflict: 'number' };

export const BUILTIN_EXPORT_PRESETS: { name: string; settings: Partial<ExportSettings> }[] = [
  { name: 'itch.io cover (PNG, 630 wide)', settings: { format: 'png', scale: 1, customWidth: 630, transparent: false } },
  { name: 'itch.io screenshot (JPG 92%, 1280 wide)', settings: { format: 'jpeg', quality: 0.92, scale: 1, customWidth: 1280, transparent: false } },
  { name: 'Marketplace Hero (PNG)', settings: { format: 'png', scale: 1, customWidth: undefined, transparent: false } },
  { name: 'High resolution (PNG 2×)', settings: { format: 'png', scale: 2, customWidth: undefined, transparent: false } },
  { name: 'Transparent icons only (PNG)', settings: { format: 'png', scale: 1, customWidth: undefined, transparent: true } },
  { name: 'Square Cover (JPG 92%)', settings: { format: 'jpeg', quality: 0.92, scale: 1, customWidth: undefined } },
  { name: 'Catalog (WebP 90%)', settings: { format: 'webp', quality: 0.9, scale: 1, customWidth: undefined, transparent: false } },
  { name: 'Social Preview (JPG 2×)', settings: { format: 'jpeg', quality: 0.9, scale: 2, customWidth: undefined } },
  // added later — the names above stay as they were
  { name: 'Store preview + clean copy (PNG)', settings: { format: 'png', scale: 1, customWidth: undefined, transparent: false, watermark: 'both' } },
  { name: 'Screenshot gallery (JPG 92%, 1920 wide)', settings: { format: 'jpeg', quality: 0.92, scale: 1, customWidth: 1920, transparent: false } },
  { name: 'Small web preview (WebP 85%, 960 wide)', settings: { format: 'webp', quality: 0.85, scale: 1, customWidth: 960, transparent: false } },
];

/** Background style presets (procedural — work offline, no files). Index 4 (Charcoal) is the generators' default. */
export const BACKGROUND_PRESETS: { name: string; group: string; bg: () => Background; desc?: string }[] = [
  { name: 'Haunted violet', group: 'Gradients', desc: 'Purple glow into black — magic, spooky, night', bg: () => grad('radial', ['#4c2a7a', '#0d0a16'], 0.5, 0.4) },
  { name: 'Pumpkin dusk', group: 'Gradients', desc: 'Orange glow low on the page — Halloween, autumn', bg: () => grad('radial', ['#c2410c', '#1c0a05'], 0.5, 0.75) },
  { name: 'Deep teal', group: 'Gradients', desc: 'Teal center into dark — underwater, potions', bg: () => grad('radial', ['#0f766e', '#04201d'], 0.5, 0.35) },
  { name: 'Midnight blue', group: 'Gradients', desc: 'Blue fading to black — sci-fi, night sky', bg: () => grad('linear', ['#1e3a8a', '#020617'], 0.5, 0.5, 180) },
  { name: 'Charcoal', group: 'Gradients', desc: 'Neutral dark gray — works with any icon colours', bg: () => grad('radial', ['#3a3d44', '#141518'], 0.5, 0.45) },
  { name: 'Forest', group: 'Gradients', desc: 'Dark greens — nature, survival, farming', bg: () => grad('linear', ['#14532d', '#052e16'], 0.5, 0.5, 160) },
  { name: 'Crimson', group: 'Gradients', desc: 'Deep red — combat, vampires, rare items', bg: () => grad('radial', ['#9f1239', '#1a030a'], 0.5, 0.5) },
  { name: 'Sky', group: 'Gradients', desc: 'Bright day sky — cheerful, casual games', bg: () => grad('linear', ['#7dd3fc', '#1d4ed8'], 0.5, 0.5, 180) },
  { name: 'Gold', group: 'Gradients', desc: 'Gold into brown — treasure, rewards, premium', bg: () => grad('radial', ['#facc15', '#713f12'], 0.5, 0.4) },
  { name: 'Studio white', group: 'Gradients', desc: 'White studio sweep — clean product look', bg: () => grad('radial', ['#ffffff', '#d4d8de'], 0.5, 0.4) },
  { name: 'Sunset', group: 'Gradients', desc: 'Orange to purple — promo banners, summer', bg: () => grad('linear', ['#f97316', '#7c3aed'], 0.5, 0.5, 160) },
  { name: 'Ocean', group: 'Gradients', desc: 'Cyan into deep indigo — water, fishing', bg: () => grad('linear', ['#06b6d4', '#1e1b4b'], 0.5, 0.5, 180) },
  { name: 'Candy', group: 'Gradients', desc: 'Pink to periwinkle — cute, sweets', bg: () => grad('linear', ['#f472b6', '#818cf8'], 0.5, 0.5, 135) },
  { name: 'Mint', group: 'Gradients', desc: 'Mint center into teal — fresh, healing', bg: () => grad('radial', ['#a7f3d0', '#0f766e'], 0.5, 0.4) },
  { name: 'Lava', group: 'Gradients', desc: 'Orange heat into dark red — fire, volcano', bg: () => grad('radial', ['#fb923c', '#450a0a'], 0.5, 0.6) },
  { name: 'Slate', group: 'Gradients', desc: 'Cool blue-gray — UI kits, tech', bg: () => grad('linear', ['#475569', '#0f172a'], 0.5, 0.5, 180) },
  { name: 'Black', group: 'Gradients', desc: 'Pure black — maximum contrast', bg: () => ({ ...defaultBackground(), type: 'solid', color: '#000000' }) },
  { name: 'Transparent', group: 'Gradients', desc: 'No background — export icons on transparency', bg: () => ({ ...defaultBackground(), type: 'transparent' }) },

  { name: 'White', group: 'Solid', bg: () => solid('#ffffff') },
  { name: 'Paper', group: 'Solid', bg: () => solid('#f4f1ea') },
  { name: 'Light gray', group: 'Solid', bg: () => solid('#d9dce1') },
  { name: 'Mid gray', group: 'Solid', bg: () => solid('#6b7079') },
  { name: 'Graphite', group: 'Solid', bg: () => solid('#2b2d31') },
  { name: 'Ink', group: 'Solid', bg: () => solid('#121316') },
  { name: 'Navy', group: 'Solid', bg: () => solid('#14213d') },
  { name: 'Royal blue', group: 'Solid', bg: () => solid('#2449c7') },
  { name: 'Sky blue', group: 'Solid', bg: () => solid('#4ea8ff') },
  { name: 'Teal', group: 'Solid', bg: () => solid('#0f766e') },
  { name: 'Mint', group: 'Solid', bg: () => solid('#7fd8b6') },
  { name: 'Forest green', group: 'Solid', bg: () => solid('#1f6b3a') },
  { name: 'Lime', group: 'Solid', bg: () => solid('#a3e635') },
  { name: 'Sunflower', group: 'Solid', bg: () => solid('#fbbf24') },
  { name: 'Orange', group: 'Solid', bg: () => solid('#f97316') },
  { name: 'Red', group: 'Solid', bg: () => solid('#dc2626') },
  { name: 'Rose', group: 'Solid', bg: () => solid('#f472b6') },
  { name: 'Purple', group: 'Solid', bg: () => solid('#6d28d9') },
  { name: 'Lavender', group: 'Solid', bg: () => solid('#c4b5fd') },
  { name: 'Brown', group: 'Solid', bg: () => solid('#7c4a2a') },
  { name: 'Fog', group: 'Simple gradients', desc: 'Light gray fade — clean and neutral', bg: () => grad('linear', ['#f5f6f8', '#d7dbe2'], 0.5, 0.5, 180) },
  { name: 'Graphite fade', group: 'Simple gradients', desc: 'Dark gray fade — the safest dark backdrop', bg: () => grad('linear', ['#3a3d43', '#18191c'], 0.5, 0.5, 180) },
  { name: 'Ocean fade', group: 'Simple gradients', desc: 'Medium to deep blue', bg: () => grad('linear', ['#3b82f6', '#1e3a8a'], 0.5, 0.5, 160) },
  { name: 'Sky fade', group: 'Simple gradients', desc: 'Light to medium blue', bg: () => grad('linear', ['#bfe3ff', '#5aa9f0'], 0.5, 0.5, 180) },
  { name: 'Teal fade', group: 'Simple gradients', desc: 'Turquoise into dark teal', bg: () => grad('linear', ['#2dd4bf', '#0f5e57'], 0.5, 0.5, 170) },
  { name: 'Meadow', group: 'Simple gradients', desc: 'Spring green fade', bg: () => grad('linear', ['#bef264', '#3f8f2f'], 0.5, 0.5, 170) },
  { name: 'Sunrise', group: 'Simple gradients', desc: 'Pale yellow to amber', bg: () => grad('linear', ['#fde68a', '#f59e0b'], 0.5, 0.5, 180) },
  { name: 'Coral', group: 'Simple gradients', desc: 'Peach into raspberry', bg: () => grad('linear', ['#fdba74', '#e11d48'], 0.5, 0.5, 160) },
  { name: 'Blush', group: 'Simple gradients', desc: 'Very soft pink', bg: () => grad('linear', ['#fce7f3', '#f9a8d4'], 0.5, 0.5, 180) },
  { name: 'Plum', group: 'Simple gradients', desc: 'Lavender into deep purple', bg: () => grad('linear', ['#a78bfa', '#4c1d95'], 0.5, 0.5, 165) },
  { name: 'Soft spot gray', group: 'Simple gradients', desc: 'Gray with a lighter center behind your icons', bg: () => grad('radial', ['#4a4e56', '#1b1c20'], 0.5, 0.42) },
  { name: 'Soft spot blue', group: 'Simple gradients', desc: 'Blue with a lighter center behind your icons', bg: () => grad('radial', ['#3d6fd6', '#0b1735'], 0.5, 0.42) },

  { name: 'Aurora', group: 'Mesh', desc: 'Northern-lights blend on navy', bg: () => mesh('#0b1023', ['#22d3ee', '#8b5cf6', '#10b981', '#1e40af']) },
  { name: 'Peach', group: 'Mesh', desc: 'Warm pastel blend — cozy, food', bg: () => mesh('#fde2cf', ['#fb7185', '#fbbf24', '#f472b6', '#fdba74']) },
  { name: 'Nebula', group: 'Mesh', desc: 'Purple, pink and blue — space, magic', bg: () => mesh('#0a0614', ['#7c3aed', '#db2777', '#2563eb', '#4c1d95']) },
  { name: 'Lagoon', group: 'Mesh', desc: 'Teal, sky and green — tropical water', bg: () => mesh('#042f2e', ['#14b8a6', '#0ea5e9', '#22c55e', '#0369a1']) },
  { name: 'Pastel', group: 'Mesh', desc: 'Soft multi-pastel — cute, kids', bg: () => mesh('#f5f3ff', ['#c4b5fd', '#a5f3fc', '#fbcfe8', '#bbf7d0']) },
  { name: 'Ember', group: 'Mesh', desc: 'Orange and red embers — fire, forge', bg: () => mesh('#1c0a05', ['#ea580c', '#b91c1c', '#f59e0b', '#7c2d12']) },

  { name: 'Retro rays', group: 'Patterns', desc: 'Orange sunburst — retro, arcade, sale', bg: () => withPattern(grad('radial', ['#f59e0b', '#9a3412'], 0.5, 0.5), { kind: 'rays', color: '#fde68a', opacity: 0.22, scale: 1 }) },
  { name: 'Hero rays', group: 'Patterns', desc: 'Subtle indigo rays — hero banners', bg: () => withPattern(grad('radial', ['#4f46e5', '#0b0a2a'], 0.5, 0.5), { kind: 'rays', color: '#a5b4fc', opacity: 0.12, scale: 0.8 }) },
  { name: 'Dot grid', group: 'Patterns', desc: 'Faint dots on dark — tidy catalog look', bg: () => withPattern(grad('radial', ['#1f2937', '#0b0f17'], 0.5, 0.4), { kind: 'dots', color: '#ffffff', opacity: 0.1, scale: 0.8 }) },
  { name: 'Blueprint', group: 'Patterns', desc: 'Grid on blue — crafting, building, tools', bg: () => withPattern(grad('radial', ['#1d4ed8', '#0c1e5a'], 0.5, 0.4), { kind: 'grid', color: '#93c5fd', opacity: 0.18, scale: 1 }) },
  { name: 'Candy stripes', group: 'Patterns', desc: 'Pink diagonal stripes — sweets, party', bg: () => withPattern(grad('linear', ['#ec4899', '#be185d'], 0.5, 0.5, 180), { kind: 'diagonal', color: '#ffffff', opacity: 0.08, scale: 1.4 }) },
  { name: 'Comic halftone', group: 'Patterns', desc: 'Comic-book dots — cartoon, action', bg: () => withPattern(grad('radial', ['#facc15', '#ea580c'], 0.5, 0.5), { kind: 'halftone', color: '#7c2d12', opacity: 0.25, scale: 0.6 }) },
  { name: 'Night sky', group: 'Patterns', desc: 'Stars on deep blue — space, night', bg: () => withPattern(grad('linear', ['#1e1b4b', '#020617'], 0.5, 0.5, 180), { kind: 'stars', color: '#ffffff', opacity: 0.9, scale: 1 }) },
  { name: 'Party', group: 'Patterns', desc: 'Confetti on purple — celebrations, rewards', bg: () => withPattern(grad('radial', ['#7c3aed', '#2e1065'], 0.5, 0.45), { kind: 'confetti', color: '#f472b6', color2: '#38bdf8', color3: '#facc15', opacity: 0.85, scale: 1 }) },
  { name: 'Dreamy bokeh', group: 'Patterns', desc: 'Soft pink lights — romance, magic', bg: () => withPattern(grad('radial', ['#be185d', '#1e0a1e'], 0.5, 0.5), { kind: 'bokeh', color: '#fda4af', opacity: 0.6, scale: 1.2 }) },
  { name: 'Checker', group: 'Patterns', desc: 'Faint checkerboard on slate', bg: () => withPattern(grad('radial', ['#334155', '#0f172a'], 0.5, 0.45), { kind: 'checker', color: '#ffffff', opacity: 0.05, scale: 1.2 }) },
  { name: 'Waves', group: 'Patterns', desc: 'Wave lines on teal — water, fishing', bg: () => withPattern(grad('linear', ['#0891b2', '#164e63'], 0.5, 0.5, 180), { kind: 'waves', color: '#ffffff', opacity: 0.1, scale: 1 }) },
  { name: 'Grain', group: 'Patterns', desc: 'Warm gray with grain — rustic, earthy', bg: () => withPattern(grad('radial', ['#57534e', '#1c1917'], 0.5, 0.45), { kind: 'noise', color: '#ffffff', opacity: 0.18, scale: 1 }) },

  { name: 'Spotlight', group: 'Spotlight', desc: 'White light on black — stage-like hero shot', bg: () => withLight({ ...defaultBackground(), type: 'solid', color: '#0b0b0f' }, '#ffffff', 0.4) },
  { name: 'Violet glow', group: 'Spotlight', desc: 'Purple light on dark — magic, epic', bg: () => withLight(grad('radial', ['#2e1065', '#07030f'], 0.5, 0.5), '#a855f7', 0.55) },
  { name: 'Warm glow', group: 'Spotlight', desc: 'Orange light on dark — fire, cozy', bg: () => withLight(grad('radial', ['#431407', '#0c0503'], 0.5, 0.5), '#fb923c', 0.5) },
  { name: 'Cyan glow', group: 'Spotlight', desc: 'Cyan light on dark — sci-fi, ice', bg: () => withLight(grad('radial', ['#083344', '#020617'], 0.5, 0.5), '#22d3ee', 0.5) },
  { name: 'Gold spotlight', group: 'Spotlight', desc: 'Warm gold light on near-black — premium, treasure, loot', bg: () => withLight(grad('radial', ['#3a2a0a', '#0a0703'], 0.5, 0.5), '#facc15', 0.45) },
  { name: 'Emerald glow', group: 'Spotlight', desc: 'Green light on dark — nature, potions, magic', bg: () => withLight(grad('radial', ['#064e3b', '#020a07'], 0.5, 0.5), '#34d399', 0.5) },
  { name: 'Rose glow', group: 'Spotlight', desc: 'Pink light on dark plum — cute, romance, candy', bg: () => withLight(grad('radial', ['#4a0d2e', '#0d0208'], 0.5, 0.5), '#f472b6', 0.5) },
  { name: 'Ice glow', group: 'Spotlight', desc: 'Pale blue light on navy — winter, crystals', bg: () => withLight(grad('radial', ['#0c2a4a', '#020812'], 0.5, 0.5), '#bae6fd', 0.5) },
  { name: 'Crimson glow', group: 'Spotlight', desc: 'Red light on black — combat, horror, weapons', bg: () => withLight(grad('radial', ['#3f0a0a', '#070101'], 0.5, 0.5), '#ef4444', 0.45) },

  { name: 'Cloud', group: 'Light & clean', desc: 'Near-white with a soft gray edge — clean product shots', bg: () => grad('radial', ['#ffffff', '#e6e9ee'], 0.5, 0.45) },
  { name: 'Paper fade', group: 'Light & clean', desc: 'Warm paper tone — hand-drawn and cozy packs', bg: () => grad('linear', ['#fbf8f1', '#ece4d4'], 0.5, 0.5, 180) },
  { name: 'Pearl', group: 'Light & clean', desc: 'Cool silver-white — UI kits and minimal icons', bg: () => grad('linear', ['#f8fafc', '#cbd5e1'], 0.5, 0.5, 160) },
  { name: 'Ice', group: 'Light & clean', desc: 'Very light blue — winter, water, clean UI', bg: () => grad('linear', ['#f0f9ff', '#bae6fd'], 0.5, 0.5, 180) },
  { name: 'Lilac mist', group: 'Light & clean', desc: 'Soft lavender — magic, pastel, cute', bg: () => grad('linear', ['#faf5ff', '#ddd6fe'], 0.5, 0.5, 170) },
  { name: 'Mint cream', group: 'Light & clean', desc: 'Fresh pale green — nature, farming, health', bg: () => grad('linear', ['#f0fdf4', '#bbf7d0'], 0.5, 0.5, 170) },
  { name: 'Peach cream', group: 'Light & clean', desc: 'Warm pale orange — food, cozy, summer', bg: () => grad('linear', ['#fff7ed', '#fed7aa'], 0.5, 0.5, 170) },
  { name: 'Butter', group: 'Light & clean', desc: 'Pale yellow — sunny, cheerful, kids', bg: () => grad('linear', ['#fefce8', '#fde68a'], 0.5, 0.5, 170) },

  { name: 'Studio black', group: 'Dark studio', desc: 'Black with a faint center lift — makes colourful icons pop', bg: () => grad('radial', ['#26272b', '#050506'], 0.5, 0.45) },
  { name: 'Graphite vignette', group: 'Dark studio', desc: 'Neutral dark gray with darker corners', bg: () => ({ ...grad('radial', ['#40434a', '#1a1b1f'], 0.5, 0.45), vignette: { enabled: true, strength: 0.5, color: '#000000' } }) },
  { name: 'Deep navy', group: 'Dark studio', desc: 'Dark blue studio — sci-fi, tech, water', bg: () => grad('radial', ['#1e2a4a', '#070b16'], 0.5, 0.45) },
  { name: 'Espresso', group: 'Dark studio', desc: 'Dark warm brown — wood, leather, medieval', bg: () => grad('radial', ['#3b2a20', '#110b08'], 0.5, 0.45) },
  { name: 'Obsidian', group: 'Dark studio', desc: 'Blue-black — premium, stone, gems', bg: () => grad('radial', ['#1f2937', '#030712'], 0.5, 0.4) },
  { name: 'Dark moss', group: 'Dark studio', desc: 'Very dark green — forest, poison, survival', bg: () => grad('radial', ['#1f3326', '#070d09'], 0.5, 0.45) },
  { name: 'Dark plum', group: 'Dark studio', desc: 'Very dark purple — magic, fantasy, night', bg: () => grad('radial', ['#33203f', '#0c0710'], 0.5, 0.45) },
  { name: 'Dark wine', group: 'Dark studio', desc: 'Deep red-brown — vampire, potions, luxury', bg: () => grad('radial', ['#3f1a22', '#100508'], 0.5, 0.45) },

  { name: 'Electric', group: 'Vivid', desc: 'Blue to pink — energetic, modern, promo', bg: () => grad('linear', ['#2563eb', '#db2777'], 0.5, 0.5, 135) },
  { name: 'Tropical', group: 'Vivid', desc: 'Teal to yellow-green — beach, summer, jungle', bg: () => grad('linear', ['#06b6d4', '#84cc16'], 0.5, 0.5, 135) },
  { name: 'Flamingo', group: 'Vivid', desc: 'Pink to orange — fun, candy, sale banners', bg: () => grad('linear', ['#ec4899', '#f97316'], 0.5, 0.5, 135) },
  { name: 'Cyber', group: 'Vivid', desc: 'Cyan to magenta — synthwave, neon, tech', bg: () => grad('linear', ['#0891b2', '#a21caf'], 0.5, 0.5, 120) },
  { name: 'Toxic', group: 'Vivid', desc: 'Acid lime into dark teal — poison, slime, mutants', bg: () => grad('radial', ['#a3e635', '#064e3b'], 0.5, 0.45) },
  { name: 'Royal', group: 'Vivid', desc: 'Purple into deep indigo — fantasy, kings, rare loot', bg: () => grad('linear', ['#7e22ce', '#1e1b4b'], 0.5, 0.5, 160) },
  { name: 'Fire', group: 'Vivid', desc: 'Yellow into red — fire, explosions, action', bg: () => grad('radial', ['#fde047', '#b91c1c'], 0.5, 0.6) },
  { name: 'Berry', group: 'Vivid', desc: 'Raspberry to violet — candy, fruit, cute', bg: () => grad('linear', ['#e11d48', '#6d28d9'], 0.5, 0.5, 150) },

  { name: 'Opal', group: 'Mesh', desc: 'Soft iridescent pastel — gems, magic, clean', bg: () => mesh('#eef2ff', ['#a5b4fc', '#f9a8d4', '#99f6e4', '#fde68a']) },
  { name: 'Sunset mesh', group: 'Mesh', desc: 'Orange, pink and purple blend — promo banners', bg: () => mesh('#2a0f2e', ['#f97316', '#ec4899', '#7c3aed', '#facc15']) },
  { name: 'Jungle', group: 'Mesh', desc: 'Greens and teal — nature, survival, adventure', bg: () => mesh('#052e16', ['#16a34a', '#0d9488', '#65a30d', '#14532d']) },
  { name: 'Arctic', group: 'Mesh', desc: 'Icy whites and blues — winter packs', bg: () => mesh('#e0f2fe', ['#7dd3fc', '#ffffff', '#93c5fd', '#a5f3fc']) },
  { name: 'Galaxy', group: 'Mesh', desc: 'Deep blues and purples with stars — space, sci-fi', bg: () => withPattern(mesh('#05030f', ['#4338ca', '#7e22ce', '#0e7490', '#1e1b4b']), { kind: 'stars', color: '#ffffff', opacity: 0.7, scale: 1 }) },
  { name: 'Candy mesh', group: 'Mesh', desc: 'Bubblegum pinks and blues — cute, sweets', bg: () => mesh('#fdf2f8', ['#f9a8d4', '#a5b4fc', '#fbcfe8', '#bae6fd']) },

  { name: 'Fine grid', group: 'Patterns', desc: 'Light paper with a faint grid — UI kits, clean catalogs', bg: () => withPattern(solid('#f6f7f9'), { kind: 'grid', color: '#94a3b8', opacity: 0.18, scale: 0.7 }) },
  { name: 'Paper dots', group: 'Patterns', desc: 'Warm paper with dots — notebook, hand-drawn', bg: () => withPattern(solid('#f7f2e8'), { kind: 'dots', color: '#a8a29e', opacity: 0.35, scale: 0.7 }) },
  { name: 'Sunburst blue', group: 'Patterns', desc: 'Blue rays from the center — headline banners', bg: () => withPattern(grad('radial', ['#38bdf8', '#1e3a8a'], 0.5, 0.5), { kind: 'rays', color: '#ffffff', opacity: 0.12, scale: 1 }) },
  { name: 'Navy stripes', group: 'Patterns', desc: 'Diagonal stripes on navy — sporty, bold', bg: () => withPattern(grad('linear', ['#1e3a8a', '#0f172a'], 0.5, 0.5, 180), { kind: 'diagonal', color: '#ffffff', opacity: 0.05, scale: 1.2 }) },
  { name: 'Pop halftone', group: 'Patterns', desc: 'Pink comic dots — playful, cartoon', bg: () => withPattern(grad('radial', ['#f9a8d4', '#db2777'], 0.5, 0.5), { kind: 'halftone', color: '#831843', opacity: 0.22, scale: 0.6 }) },
  { name: 'Snowfall', group: 'Patterns', desc: 'Light snow on winter blue — holiday, ice', bg: () => withPattern(grad('linear', ['#1e40af', '#0c1a3d'], 0.5, 0.5, 180), { kind: 'stars', color: '#ffffff', opacity: 0.85, scale: 1.3 }) },
  { name: 'Fireflies', group: 'Patterns', desc: 'Warm bokeh on dark green — forest, night, magic', bg: () => withPattern(grad('radial', ['#14532d', '#030a05'], 0.5, 0.5), { kind: 'bokeh', color: '#fde68a', opacity: 0.5, scale: 0.9 }) },
  { name: 'Golden stars', group: 'Night & sky', desc: 'Warm yellow stars on deep navy — treasure, magic, night', bg: () => withPattern(grad('linear', ['#1e2a5a', '#050816'], 0.5, 0.5, 180), { kind: 'stars', color: '#fde047', opacity: 0.95, scale: 1.1 }) },
  { name: 'Purple starfield', group: 'Night & sky', desc: 'Dense white stars on violet — space, sci-fi', bg: () => withPattern(grad('radial', ['#4c1d95', '#0b0420'], 0.5, 0.5), { kind: 'stars', color: '#ffffff', opacity: 0.9, scale: 0.8 }) },
  { name: 'Dawn', group: 'Night & sky', desc: 'Orange horizon into blue sky — adventure, hope', bg: () => grad('linear', ['#1e3a8a', '#fb923c'], 0.5, 0.5, 180) },
  { name: 'Twilight', group: 'Night & sky', desc: 'Purple dusk with first stars', bg: () => withPattern(grad('linear', ['#1e1b4b', '#be185d'], 0.5, 0.5, 180), { kind: 'stars', color: '#fde68a', opacity: 0.7, scale: 1.2 }) },
  { name: 'Northern lights', group: 'Night & sky', desc: 'Green and violet aurora with stars — winter, magic', bg: () => withPattern(mesh('#020617', ['#10b981', '#6d28d9', '#0ea5e9', '#064e3b']), { kind: 'stars', color: '#ffffff', opacity: 0.7, scale: 1 }) },
  { name: 'Moonlight', group: 'Night & sky', desc: 'Pale moon glow on midnight blue', bg: () => withLight(grad('radial', ['#1e293b', '#020617'], 0.5, 0.5), '#e0f2fe', 0.35) },
  { name: 'Clear day', group: 'Night & sky', desc: 'Bright blue sky with a sunny glow — casual, kids', bg: () => withLight(grad('linear', ['#38bdf8', '#e0f2fe'], 0.5, 0.5, 180), '#fef9c3', 0.4) },
  { name: 'Red planet', group: 'Night & sky', desc: 'Dusty red sky with stars — Mars, sci-fi survival', bg: () => withPattern(grad('linear', ['#7f1d1d', '#1c0a05'], 0.5, 0.5, 180), { kind: 'stars', color: '#fed7aa', opacity: 0.6, scale: 1 }) },

  { name: 'Meadow grass', group: 'Nature & places', desc: 'Grass green with texture — farming, outdoors', bg: () => withPattern(grad('linear', ['#84cc16', '#365314'], 0.5, 0.5, 180), { kind: 'noise', color: '#000000', opacity: 0.12, scale: 1 }) },
  { name: 'Deep ocean', group: 'Nature & places', desc: 'Dark sea with wave lines — fishing, pirates', bg: () => withPattern(grad('linear', ['#0369a1', '#082f49'], 0.5, 0.5, 180), { kind: 'waves', color: '#7dd3fc', opacity: 0.12, scale: 1.2 }) },
  { name: 'Sand dunes', group: 'Nature & places', desc: 'Warm sand with grain — desert, ruins', bg: () => withPattern(grad('linear', ['#fde68a', '#d97706'], 0.5, 0.5, 170), { kind: 'noise', color: '#78350f', opacity: 0.12, scale: 1 }) },
  { name: 'Lava cave', group: 'Nature & places', desc: 'Glowing magma under black rock — fire, dungeons', bg: () => withLight(withPattern(grad('linear', ['#1c0a05', '#7c2d12'], 0.5, 0.5, 180), { kind: 'noise', color: '#000000', opacity: 0.2, scale: 1 }), '#f97316', 0.35) },
  { name: 'Ice cave', group: 'Nature & places', desc: 'Frozen cyan glow — winter, crystals', bg: () => withLight(grad('radial', ['#155e75', '#030b14'], 0.5, 0.55), '#a5f3fc', 0.35) },
  { name: 'Dungeon stone', group: 'Nature & places', desc: 'Cold gray stone with a torch glow — RPG, dungeons', bg: () => withLight(withPattern(grad('radial', ['#3f3f46', '#0c0a09'], 0.5, 0.5), { kind: 'checker', color: '#000000', opacity: 0.12, scale: 1.6 }), '#fb923c', 0.22) },
  { name: 'Enchanted forest', group: 'Nature & places', desc: 'Teal forest with floating lights — fairy tale, magic', bg: () => withPattern(mesh('#022c22', ['#047857', '#0f766e', '#4d7c0f', '#064e3b']), { kind: 'bokeh', color: '#fef08a', opacity: 0.4, scale: 0.8 }) },
  { name: 'Workshop', group: 'Nature & places', desc: 'Warm brown blueprint grid — crafting, tools', bg: () => withPattern(grad('radial', ['#78350f', '#1c0f05'], 0.5, 0.5), { kind: 'grid', color: '#fbbf24', opacity: 0.1, scale: 1 }) },
  { name: 'Film grain', group: 'Patterns', desc: 'Dark slate with grain — gritty, cinematic', bg: () => withPattern(grad('radial', ['#334155', '#0b1120'], 0.5, 0.45), { kind: 'noise', color: '#ffffff', opacity: 0.14, scale: 1 }) },
  // Added later — appended so the indexes above stay the same (templates refer to some by index)
  { name: 'Paper grain', group: 'Studio & editorial', desc: 'Warm off-white with a faint grain — editorial, catalogs', bg: () => withPattern(solid('#f2ede3'), { kind: 'noise', color: '#5a4630', opacity: 0.05, scale: 1 }) },
  { name: 'Linen', group: 'Studio & editorial', desc: 'Soft cream fade — calm product shots', bg: () => grad('linear', ['#f6f2eb', '#e5dccd'], 0.5, 0.5, 180) },
  { name: 'Warm studio', group: 'Studio & editorial', desc: 'Light warm-grey sweep with a soft key light', bg: () => withLight(grad('radial', ['#f7f6f3', '#dedcd6'], 0.5, 0.42), '#ffffff', 0.35) },
  { name: 'Cool studio', group: 'Studio & editorial', desc: 'Light blue-grey sweep — clean UI kits', bg: () => grad('radial', ['#f6f8fb', '#d3dae4'], 0.5, 0.42) },
  { name: 'Graphite sweep', group: 'Studio & editorial', desc: 'Dark neutral with a soft light from above', bg: () => withLight(grad('radial', ['#2a2b30', '#0c0c0e'], 0.5, 0.4), '#ffffff', 0.12) },
  { name: 'Ink fade', group: 'Studio & editorial', desc: 'Deep navy fade — tech, sci-fi, night', bg: () => grad('linear', ['#132042', '#060a17'], 0.5, 0.5, 160) },
  { name: 'Slate fade', group: 'Studio & editorial', desc: 'Blue-grey dark — serious, technical', bg: () => grad('linear', ['#334155', '#0f172a'], 0.5, 0.5, 170) },
  { name: 'Espresso glow', group: 'Studio & editorial', desc: 'Dark warm brown — crafting, food, cozy', bg: () => grad('radial', ['#3b2a20', '#120c08'], 0.5, 0.45) },
  { name: 'Blush mist', group: 'Soft & pastel', desc: 'Pink into pale blue — cute, casual', bg: () => grad('linear', ['#fbe3e8', '#dfe9f8'], 0.5, 0.5, 135) },
  { name: 'Mint linen', group: 'Soft & pastel', desc: 'Fresh mint into cream — nature, farming', bg: () => grad('linear', ['#e3f5ea', '#fbf4e2'], 0.5, 0.5, 160) },
  { name: 'Lavender haze', group: 'Soft & pastel', desc: 'Pale lilac into periwinkle — magic, dreamy', bg: () => grad('linear', ['#ece6fb', '#d9e4fb'], 0.5, 0.5, 160) },
  { name: 'Peach rose', group: 'Soft & pastel', desc: 'Peach into rose — warm and friendly', bg: () => grad('linear', ['#ffe7d6', '#ffd3dd'], 0.5, 0.5, 150) },
  { name: 'Faint grid', group: 'Geometric & texture', desc: 'Light grey with a faint grid — UI and line icons', bg: () => withPattern(solid('#f3f4f6'), { kind: 'grid', color: '#0f172a', opacity: 0.05, scale: 1 }) },
  { name: 'Blueprint grid', group: 'Geometric & texture', desc: 'Dark navy with a light grid — tools, tech', bg: () => withPattern(solid('#0b1220'), { kind: 'grid', color: '#60a5fa', opacity: 0.07, scale: 1 }) },
  { name: 'Dot paper', group: 'Geometric & texture', desc: 'Off-white with a quiet dot grid', bg: () => withPattern(solid('#faf8f4'), { kind: 'dots', color: '#000000', opacity: 0.07, scale: 0.7 }) },
  { name: 'Stone lines', group: 'Geometric & texture', desc: 'Light grey with faint diagonals — elegant, minimal', bg: () => withPattern(solid('#e9e9e7'), { kind: 'diagonal', color: '#000000', opacity: 0.04, scale: 1 }) },
  { name: 'Pure black', group: 'High contrast', desc: 'True black — maximum contrast for bright icons', bg: () => solid('#000000') },
  { name: 'Pure white', group: 'High contrast', desc: 'True white — product listings, dark icons', bg: () => solid('#ffffff') },
  { name: 'Signal yellow', group: 'High contrast', desc: 'Loud yellow — sales and launches, pair with black type', bg: () => solid('#ffd400') },
  { name: 'Cobalt', group: 'High contrast', desc: 'Rich blue with a soft light — store banners', bg: () => withLight(grad('radial', ['#2747b8', '#0f1f63'], 0.5, 0.35), '#7aa2ff', 0.18) },
];

export function grad(type: 'linear' | 'radial', colors: [string, string], cx: number, cy: number, angle = 90): Background {
  const b = defaultBackground();
  return { ...b, type, color: colors[1], gradient: { stops: [{ offset: 0, color: colors[0] }, { offset: 1, color: colors[1] }], angle, cx, cy, radius: 0.85 } };
}

export function solid(color: string): Background {
  return { ...defaultBackground(), type: 'solid', color };
}

export function mesh(base: string, colors: string[]): Background {
  const b = defaultBackground();
  return { ...b, type: 'mesh', color: base, gradient: { ...b.gradient, radius: 1, stops: colors.map((color, i) => ({ offset: i / Math.max(1, colors.length - 1), color })) } };
}

export function withPattern(b: Background, p: Partial<Background['pattern']>): Background {
  return { ...b, pattern: { ...b.pattern, ...p, enabled: true } };
}

export function withLight(b: Background, color: string, strength: number): Background {
  return { ...b, light: { ...b.light, enabled: true, color, strength } };
}
