// Non-destructive template rebuilds.
//
// A page made from a built-in template follows the Templates-tab options live (format, look, text
// style, icon size). Rebuilding used to replace the whole page with a fresh build, so a title the user
// had typed, objects they had moved, added or deleted, and a background they had picked were lost on
// every option change. This module merges a fresh build into the page instead.
//
// Precedence (lowest → highest): template defaults → template options → the user's own edits.
//   - Words in text objects are content and are never replaced by a rebuild.
//   - An aspect controlled by an option is taken from the fresh build only when that option changed:
//       format  → geometry of text, shapes and icons, guides, safe zone, focal region
//       icons   → icon layout and the shapes that follow it (cards, shelves)
//       theme   → text style and shape colours (theme parts for text)
//       text    → only the pixel-art setting of template text (Smooth / Pixel / Pixel ++)
//       bg      → background (theme parts for the background)
//     The text option is deliberately narrow: switching Pixel → Pixel ++ changes the pixel block size
//     and nothing else, so a theme applied from the Themes tab or colours the user picked stay.
//     Otherwise the page's current value — the default or the user's change — is kept.
//   - Objects the user added stay; template objects the user deleted stay deleted.
//
// Pure functions only (no stores), so they can be tested without the app.

import type { Page, SceneObject, TemplateOptsSig, TemplatePageOptions, TextObject } from '../core/types';
import type { Theme } from '../core/themes';
import type { TemplateOptions } from './generators';

export const themeSigOf = (t: Theme | undefined) => (t ? [t.id, t.accent, t.accent2, t.sub, t.accentText, t.title.fill ?? ''].join(':') : '');
const themeSig = (o: TemplateOptions) => themeSigOf(o.theme);

/** Pixel block size for a text rendering mode. `designed` is what the template itself uses at `designedSize`. */
export function textModePixel(mode: TemplateOptions['text'], fontSize: number, designed = 0, designedSize = fontSize): number {
  if (mode === 'smooth') return 0;
  if (mode === 'pixel') return Math.max(2, fontSize / 13);
  if (mode === 'pixel-soft') return Math.max(1.5, fontSize / 22);
  return designed > 0 ? designed * (fontSize / Math.max(1, designedSize)) : 0;
}

/** Split a stored look signature into its theme part and its text-mode part. */
export function splitLook(look: string): { theme: string; text: string } {
  const i = look.lastIndexOf('|');
  return i < 0 ? { theme: look, text: 'keep' } : { theme: look.slice(0, i), text: look.slice(i + 1) || 'keep' };
}

export const DEFAULT_PAGE_OPTIONS: TemplatePageOptions = { size: '', themeId: 'auto', themeParts: 'all', text: 'keep', icons: 1 };

/**
 * The options a template page was built with. Pages saved before options were stored per page
 * derive them from the build signature, so opening an old project shows what it was made with.
 * `sizeLabel` maps a "W x H" signature back to a Templates-tab format label.
 */
export function pageTemplateOptions(page: Page, sizeLabel: (sig: string) => string = () => ''): TemplatePageOptions {
  const ft = page.fromTemplate;
  if (!ft) return DEFAULT_PAGE_OPTIONS;
  if (ft.ui) return { ...DEFAULT_PAGE_OPTIONS, ...ft.ui };
  const sig = ft.opts;
  if (!sig) return { ...DEFAULT_PAGE_OPTIONS, themeId: 'none' };
  const look = splitLook(sig.look);
  const lookTheme = look.theme.split(':')[0];
  const bgTheme = sig.bg.split(':')[0];
  const themeId = lookTheme || bgTheme || 'none';
  const themeParts: TemplatePageOptions['themeParts'] = lookTheme && bgTheme ? 'all' : bgTheme ? 'bg' : lookTheme ? 'text' : 'all';
  const text = (['keep', 'smooth', 'pixel-soft', 'pixel'] as const).find((t) => t === look.text) ?? 'keep';
  return { size: sig.size ? sizeLabel(sig.size) : '', themeId, themeParts, text, icons: sig.icons || 1 };
}

/**
 * The signature to store after a rebuild. When the theme choice did not change, the theme parts of the
 * previous signature are kept as they were: the page keeps the look it has (a palette that changed since,
 * or a theme applied from the Themes tab, is never re-applied behind the user's back).
 */
export function carrySig(prev: TemplateOptsSig | undefined, next: TemplateOptsSig, themeChanged: boolean): TemplateOptsSig {
  if (themeChanged || !prev) return next;
  return { ...next, bg: prev.bg, look: `${splitLook(prev.look).theme}|${splitLook(next.look).text}` };
}

/** What the options control, as a plain comparable value. */
export function optsSig(o: TemplateOptions): TemplateOptsSig {
  const parts = o.themeParts ?? 'all';
  const t = themeSig(o);
  return {
    size: o.size ? `${Math.round(o.size.w)}x${Math.round(o.size.h)}` : '',
    icons: Math.round(o.icons * 1000) / 1000,
    bg: t && parts !== 'text' ? t : '',
    look: `${t && parts !== 'bg' ? t : ''}|${o.text}`,
  };
}

/** Give every object a template build created outside its layouts a stable key ("t0", "t1"…). */
export function keyTemplateObjects(page: Page): { page: Page; keys: string[] } {
  const keys: string[] = [];
  let i = 0;
  const objects = page.objects.map((o): SceneObject => {
    if (o.layoutId) return o;
    const tplKey = `t${i++}`;
    keys.push(tplKey);
    return { ...o, tplKey };
  });
  return { page: { ...page, objects }, keys };
}

const GEOMETRY = ['x', 'y', 'w', 'h', 'rotation', 'flipX', 'flipY'] as const;
function withGeometry<T extends SceneObject>(o: T, from: SceneObject): T {
  const g: Record<string, unknown> = {};
  for (const k of GEOMETRY) g[k] = from[k];
  return { ...o, ...g } as T;
}

/** Scale a user-added object to a new page size (positions follow the page, sizes the shorter side). */
function reflowLoose(o: SceneObject, kx: number, ky: number): SceneObject {
  const k = Math.min(kx, ky);
  if (o.type === 'text') return { ...o, x: o.x * kx, y: o.y * ky, w: o.w * k, h: o.h * k, style: { ...o.style, fontSize: o.style.fontSize * k } };
  return { ...o, x: o.x * kx, y: o.y * ky, w: o.w * k, h: o.h * k };
}

/**
 * Merge a fresh template build into the page it replaces.
 * `built` must already carry tplKeys (keyTemplateObjects); `next` is optsSig of the new options.
 */
export function mergeTemplateRebuild(old: Page, built: Page, builtKeys: string[], next: TemplateOptsSig): Page {
  const prev = old.fromTemplate?.opts;
  const legacy = !old.fromTemplate?.keys;
  const sizeSame = !!prev && prev.size === next.size && old.width === built.width && old.height === built.height;
  const layoutSame = sizeSame && prev!.icons === next.icons;
  const prevLook = prev ? splitLook(prev.look) : null;
  const nextLook = splitLook(next.look);
  const themeSame = !!prevLook && prevLook.theme === nextLook.theme;
  const textSame = !!prevLook && prevLook.text === nextLook.text;
  const lookSame = themeSame && textSame;
  const bgSame = !!prev && prev.bg === next.bg;
  const prevKeys = new Set(old.fromTemplate?.keys ?? []);

  // pair each built template object with the page's object of the same key
  const oldByKey = new Map<string, SceneObject>();
  if (legacy) {
    // pages made before keys existed: pair text objects in paint order, so at least the words survive
    const oldTexts = old.objects.filter((o): o is TextObject => o.type === 'text' && !o.layoutId);
    const builtTexts = built.objects.filter((o): o is TextObject => o.type === 'text' && !o.layoutId);
    builtTexts.forEach((b, i) => oldTexts[i] && b.tplKey && oldByKey.set(b.tplKey, oldTexts[i]));
  } else for (const o of old.objects) if (o.tplKey) oldByKey.set(o.tplKey, o);

  const merge = (b: SceneObject): SceneObject | null => {
    const o = b.tplKey ? oldByKey.get(b.tplKey) : undefined;
    if (!o) return !legacy && b.tplKey && prevKeys.has(b.tplKey) ? null : b; // deleted by the user
    if (legacy) return b.type === 'text' && o.type === 'text' ? { ...b, text: o.text, textEdited: o.textEdited } : b;
    // start from the page's object (keeps id, name, opacity, lock, hide, group and the words)
    let m: SceneObject = { ...o, tplKey: b.tplKey };
    if (themeSame && !textSame && m.type === 'text' && b.type === 'text' && o.type === 'text') {
      // only the text rendering changed: the pixel size follows, colours, fonts and effects stay
      const mode = (nextLook.text as TemplateOptions['text']) || 'keep';
      m = { ...m, style: { ...m.style, pixel: textModePixel(mode, o.style.fontSize, b.style.pixel ?? 0, b.style.fontSize) } };
    } else if (!lookSame) {
      if (m.type === 'text' && b.type === 'text') {
        const keep = sizeSame ? { fontSize: o.type === 'text' ? o.style.fontSize : b.style.fontSize, align: (o as TextObject).style.align, lineHeight: (o as TextObject).style.lineHeight } : {};
        m = { ...m, style: { ...b.style, ...keep } };
      } else if (m.type === 'shape' && b.type === 'shape') m = { ...m, fill: b.fill, fill2: b.fill2, stroke: b.stroke };
      else if (m.type === 'image' && b.type === 'image') m = { ...m, filter: b.filter, outline: b.outline, shadow: b.shadow, glow: b.glow };
    }
    // text sits where the format puts it; shapes such as cards follow the icon layout too
    const geometryKept = o.type === 'text' ? sizeSame : layoutSame;
    if (!geometryKept) {
      m = withGeometry(m, b);
      if (m.type === 'text' && b.type === 'text' && !sizeSame) m = { ...m, style: { ...m.style, fontSize: b.style.fontSize } };
      if (m.type === 'shape' && b.type === 'shape') m = { ...m, strokeWidth: b.strokeWidth, radius: b.radius, blur: b.blur };
    }
    return m;
  };

  // objects the user added: not from the template and not managed by its layouts
  const kx = built.width / old.width,
    ky = built.height / old.height;
  const loose = legacy ? [] : old.objects.filter((o) => !o.tplKey && !o.layoutId).map((o) => (sizeSame ? o : reflowLoose(o, kx, ky)));

  let objects: SceneObject[];
  let layouts = built.layouts;
  if (layoutSame && !legacy) {
    // icons and layouts stay exactly as they are (pins, hand moves, layout tweaks); restyle in place
    const builtByKey = new Map(built.objects.filter((b) => b.tplKey).map((b) => [b.tplKey!, b]));
    objects = old.objects.map((o) => {
      const b = o.tplKey ? builtByKey.get(o.tplKey) : undefined;
      return b ? merge(b) ?? o : o;
    });
    const present = new Set(old.objects.map((o) => o.tplKey).filter(Boolean));
    for (const b of built.objects) if (b.tplKey && !present.has(b.tplKey) && !prevKeys.has(b.tplKey)) objects.push(b);
    layouts = old.layouts;
  } else {
    objects = [...built.objects.map((b) => (b.layoutId ? b : merge(b))).filter((o): o is SceneObject => !!o), ...loose];
  }

  const groupIds = new Set(objects.map((o) => o.groupId).filter(Boolean));
  return {
    ...built,
    id: old.id,
    name: old.name,
    exportName: old.exportName,
    content: old.content,
    objects,
    layouts,
    groups: old.groups.filter((g) => groupIds.has(g.id)),
    background: bgSame ? old.background : built.background,
    guides: sizeSame ? old.guides : built.guides,
    safeZone: sizeSame ? old.safeZone : built.safeZone,
    focal: sizeSame ? old.focal : built.focal,
    fromTemplate: old.fromTemplate ? { ...old.fromTemplate, keys: builtKeys, opts: next } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Text roles: carrying the user's words to a page rebuilt from another template
// ---------------------------------------------------------------------------

/** Role of each text object: "title", "subtitle", "text3"… by size (badges: "badge1", "badge2"…). */
export function textRoles(page: Page): Map<string, TextObject> {
  const texts = page.objects.filter((o): o is TextObject => o.type === 'text' && !o.hidden);
  const plain = texts.filter((t) => !t.style.badge?.enabled).sort((a, b) => b.style.fontSize - a.style.fontSize);
  const badges = texts.filter((t) => t.style.badge?.enabled);
  const out = new Map<string, TextObject>();
  plain.forEach((t, i) => out.set(i === 0 ? 'title' : i === 1 ? 'subtitle' : `text${i + 1}`, t));
  badges.forEach((t, i) => out.set(`badge${i + 1}`, t));
  return out;
}

/** The words the user typed on a page, by role, on top of what the page already remembered. */
export function pageContent(page: Page): Record<string, string> {
  const content = { ...page.content };
  for (const [role, t] of textRoles(page)) if (t.textEdited) content[role] = t.text;
  return content;
}

/** Put remembered words into a freshly built page's matching roles; the rest stay remembered. */
export function applyContent(page: Page, content: Record<string, string>): Page {
  if (!Object.keys(content).length) return page;
  const byId = new Map<string, string>();
  for (const [role, t] of textRoles(page)) if (content[role] !== undefined) byId.set(t.id, content[role]);
  return {
    ...page,
    content,
    objects: page.objects.map((o) => (o.type === 'text' && byId.has(o.id) ? { ...o, text: byId.get(o.id)!, name: byId.get(o.id)!.split('\n')[0].slice(0, 32) || 'Text', textEdited: true } : o)),
  };
}

// ---------------------------------------------------------------------------
// A new look (theme) on a page: appearance only, the composition stays exactly as it is
// ---------------------------------------------------------------------------

/**
 * `old` with only the appearance of `restyled` (a rebuild of the same page with another theme):
 * the background, text colours, fonts and effects, shape colours and icon effects. Every object keeps
 * its place, size, rotation, words and layout membership; icons, layouts, the icon choice, groups,
 * guides and the page size are `old`'s. Objects the rebuild has but the page doesn't are not added,
 * and nothing is removed.
 */
export function restyleOnly(old: Page, restyled: Page): Page {
  const byId = new Map(restyled.objects.map((o) => [o.id, o]));
  const byKey = new Map(restyled.objects.filter((o) => o.tplKey).map((o) => [o.tplKey!, o]));
  const objects = old.objects.map((o): SceneObject => {
    const m = byId.get(o.id) ?? (o.tplKey ? byKey.get(o.tplKey) : undefined);
    if (!m || m.type !== o.type) return o;
    if (o.type === 'text' && m.type === 'text') {
      const { badge: _b, ...look } = m.style;
      return { ...o, style: { ...o.style, ...look, fontSize: o.style.fontSize, align: o.style.align, lineHeight: o.style.lineHeight, curve: o.style.curve, badge: o.style.badge ? { ...o.style.badge, color: m.style.badge?.color ?? o.style.badge.color, color2: m.style.badge?.color2 ?? o.style.badge.color2 } : undefined } };
    }
    if (o.type === 'shape' && m.type === 'shape') return { ...o, fill: m.fill, fill2: m.fill2, stroke: m.stroke };
    if (o.type === 'image' && m.type === 'image') return { ...o, filter: m.filter, outline: m.outline, shadow: m.shadow, glow: m.glow };
    return o;
  });
  return { ...old, objects, background: restyled.background, lookId: restyled.lookId ?? old.lookId, fromTemplate: restyled.fromTemplate ?? old.fromTemplate };
}
