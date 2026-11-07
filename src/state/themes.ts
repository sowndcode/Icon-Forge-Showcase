// Applying a game theme: background + title / subtitle / badge colours on a page.

import { scaleTextStyle } from '../core/defaults';
import type { Theme } from '../core/themes';
import type { Page, SceneObject, ShapeObject, TextObject, TextStyle } from '../core/types';
import { completeBackground } from '../ui/components/BgThumb';
import { commit, withPage } from './doc';
import { splitLook, themeSigOf } from './templateMerge';
import { ensureReadableText } from '../core/readability';

/** Restyle one page with a theme. Text keeps its words, size and position. */
export function themedPage(p: Page, t: Theme): Page {
  const texts = p.objects.filter((o): o is TextObject => o.type === 'text');
  const plain = texts.filter((o) => !o.style.badge?.enabled);
  const biggest = Math.max(0, ...plain.map((o) => o.style.fontSize));
  // dark tone of the theme for panels behind text: its title outline colour
  const dark = t.title.stroke?.enabled ? t.title.stroke.color : '#0b0b10';
  const objects = p.objects.map((o): SceneObject => {
    if (o.type === 'shape') return themedShape(o, t, dark);
    if (o.type !== 'text') return o;
    const s = o.style;
    if (s.badge?.enabled) {
      const style: TextStyle = { ...s, fill: t.accentText, fillMode: 'solid', badge: { ...s.badge, color: t.accent, color2: t.accent2 } };
      return { ...o, style };
    }
    if (s.fontSize >= biggest * 0.6) {
      // title look, scaled to this text's size; size, spacing and alignment stay the user's. A look
      // never turns a title into a badge or bends it (saved or imported themes may carry those).
      const { badge: _badge, curve: _curve, align: _align, lineHeight: _lh, ...appearance } = t.title;
      const look = scaleTextStyle(appearance, s.fontSize / 120);
      const style: TextStyle = { ...s, ...look, fontSize: s.fontSize, align: s.align, lineHeight: s.lineHeight, curve: s.curve, letterSpacing: t.title.letterSpacing !== undefined ? look.letterSpacing ?? s.letterSpacing : s.letterSpacing } as TextStyle;
      return { ...o, style };
    }
    return { ...o, style: { ...s, fill: t.sub, fillMode: 'solid' } };
  });
  const themed: Page = { ...p, background: { ...completeBackground(t.bg()), image: p.background.image }, objects };
  return readableForTheme(themed, t);
}

/**
 * The theme's text colours where they land: a text whose colour clashes with a panel or band below
 * it (dark type on a dark title panel) takes the theme's most readable colour instead. Texts that
 * read as the theme intends are unchanged. `page` may carry another background than the theme's
 * (a theme applied to text only).
 */
export function readableForTheme(page: Page, t: Theme): Page {
  const candidates = [...new Set([t.accentText, t.sub, t.title.fill ?? '#ffffff', '#ffffff', '#111318'].filter(Boolean))];
  return ensureReadableText(page, { candidates, designedFor: completeBackground(t.bg()) });
}

const luminance = (hex: string) => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/** Panels, frames, dividers and decorative shapes take the theme's colours too. */
function themedShape(o: ShapeObject, t: Theme, dark: string): ShapeObject {
  if (o.effect?.enabled) return o; // effect zones restyle what is below them, not themselves
  if (o.shape === 'line') return { ...o, stroke: t.sub };
  // soft shadows stay dark; soft glows take the accent
  if (o.blur && o.blur > 0) return luminance(o.fill) < 0.2 ? o : { ...o, fill: t.accent, fill2: undefined };
  const isPanel = o.shape === 'rect' && o.fillEnabled && luminance(o.fill) < 0.3;
  if (isPanel) return { ...o, fill: dark, fill2: undefined, stroke: o.strokeWidth > 0 ? t.accent : o.stroke };
  // outline-only frames
  if (!o.fillEnabled) return { ...o, stroke: o.strokeWidth > 0 ? t.accent : o.stroke };
  // colour bands, stars, bursts, hearts…
  return { ...o, fill: t.accent, fill2: o.fill2 ? t.accent2 : undefined, stroke: o.strokeWidth > 0 ? t.accentText : o.stroke };
}

/**
 * A theme applied from the Themes tab becomes the page's Look: a template page remembers it, so the
 * Templates tab shows it and later option changes (text, icon size, format) keep it.
 */
export function recordTheme(p0: Page, t: Theme): Page {
  const p = { ...p0, lookId: t.id };
  const ft = p.fromTemplate;
  if (!ft) return p;
  const sig = themeSigOf(t);
  const text = ft.opts ? splitLook(ft.opts.look).text : ft.ui?.text ?? 'keep';
  const opts = { size: ft.opts?.size ?? '', icons: ft.opts?.icons ?? 1, bg: sig, look: `${sig}|${text}` };
  const ui = ft.ui ? { ...ft.ui, themeId: t.id, themeParts: 'all' as const } : undefined;
  return { ...p, fromTemplate: { ...ft, opts, ...(ui ? { ui } : {}) } };
}

export function applyTheme(t: Theme, pageIds?: string[]) {
  commit(`Theme: ${t.name}`, (d) => {
    let out = d;
    for (const id of pageIds ?? [d.activePageId]) out = withPage(out, (p) => recordTheme(themedPage(p, t), t), id);
    return out;
  });
}
