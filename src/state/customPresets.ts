// Custom themes, plus the actions My themes and My templates share: rename, duplicate, delete,
// copy a Share Code and import one. Built-in themes and templates are never written to.

import { useMemo } from 'react';
import { scaleTextStyle } from '../core/defaults';
import { uid } from '../core/ids';
import { cleanThemeData, decodeShareCode, encodeShareCode, uniqueName, type CustomThemeData, type ShareKind, type SharedItem } from '../core/shareCode';
import type { Theme } from '../core/themes';
import type { Page, PresetKind, StoredPreset, TextObject, TextStyle } from '../core/types';
import { ALGORITHMS } from '../layout/registry';
import { db } from '../services/db';
import { getPage } from './doc';
import type { TemplateData } from './generators';
import { refreshPresets, usePresets, usePresetStore } from './presets';
import { toast } from './ui';

/** Custom themes are listed with this id prefix so they never collide with built-in ones. */
export const MY_THEME_PREFIX = 'my:';

export function themeFromPreset(p: StoredPreset<CustomThemeData>): Theme | null {
  const d = cleanThemeData(p.data);
  if (!d) return null; // damaged entry in presets.json: skipped, never applied
  return { id: MY_THEME_PREFIX + p.id, name: p.name, blurb: d.blurb || 'Your saved theme', bg: () => structuredClone(d.bg), title: d.title, sub: d.sub, accent: d.accent, accent2: d.accent2, accentText: d.accentText };
}

/** Saved themes as Theme objects (damaged entries left out). */
export function useCustomThemes(): { theme: Theme; preset: StoredPreset<CustomThemeData> }[] {
  const list = usePresets<CustomThemeData>('theme');
  return useMemo(() => list.map((preset) => ({ preset, theme: themeFromPreset(preset) })).filter((x): x is { preset: StoredPreset<CustomThemeData>; theme: Theme } => !!x.theme), [list]);
}

/** Text effects that make up a title "look" (size, position and alignment stay the page's). */
const LOOK_KEYS: (keyof TextStyle)[] = ['fontFamily', 'fontWeight', 'italic', 'letterSpacing', 'uppercase', 'fill', 'fillMode', 'fill2', 'gradientAngle', 'stroke', 'stroke2', 'shadow', 'glow', 'extrude', 'pixel'];

/**
 * The page's current look as a theme: its background, the biggest text's style as the title look
 * (scaled to the 120 px size themes are designed for), the next text's colour and the first badge's colours.
 */
export function themeDataFromPage(page: Page): CustomThemeData {
  const texts = page.objects.filter((o): o is TextObject => o.type === 'text' && !o.hidden);
  const plain = texts.filter((t) => !t.style.badge?.enabled).sort((a, b) => b.style.fontSize - a.style.fontSize);
  const badge = texts.find((t) => t.style.badge?.enabled);
  const title = plain[0];
  let look: Partial<TextStyle> = { fontFamily: 'Segoe UI Black', fontWeight: 900, fill: '#ffffff' };
  if (title) {
    const picked: Partial<TextStyle> = {};
    for (const k of LOOK_KEYS) if (title.style[k] !== undefined) (picked as Record<string, unknown>)[k] = structuredClone(title.style[k]);
    look = scaleTextStyle({ ...picked, fontSize: title.style.fontSize }, 120 / Math.max(1, title.style.fontSize));
    delete look.fontSize;
  }
  const bg = structuredClone(page.background);
  // an imported background image belongs to this project; the theme keeps its colour instead
  const background = bg.type === 'image' ? { ...bg, type: 'solid' as const, image: { ...bg.image, assetId: undefined } } : { ...bg, image: { ...bg.image, assetId: undefined } };
  const accent = badge?.style.badge?.color ?? title?.style.fill ?? '#ffffff';
  return {
    blurb: 'Saved from a page',
    bg: background,
    title: look,
    sub: plain[1]?.style.fill ?? '#e5e7eb',
    accent,
    accent2: badge?.style.badge?.color2 ?? accent,
    accentText: badge?.style.fill ?? '#111111',
  };
}

const namesOf = (kind: PresetKind) => usePresetStore.getState().list.filter((p) => p.kind === kind).map((p) => p.name);

async function put<T>(kind: PresetKind, name: string, data: T, prefix: string): Promise<StoredPreset<T>> {
  const preset: StoredPreset<T> = { id: uid(prefix), kind, name: uniqueName(name, namesOf(kind)), createdAt: Date.now(), data };
  await db.putPreset(preset);
  await refreshPresets();
  return preset;
}

export async function saveThemeFromPage(name: string, page: Page = getPage()) {
  try {
    const p = await put('theme', name, themeDataFromPage(page), 'thm');
    toast(`Saved theme “${p.name}”`, 'success');
  } catch (e) {
    toast('Could not save the theme: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

/** Overwrite a saved theme with the page's current look (keeps its name and id). */
export async function updateThemeFromPage(p: StoredPreset<CustomThemeData>, page: Page = getPage()) {
  try {
    await db.putPreset({ ...p, data: themeDataFromPage(page) });
    await refreshPresets();
    toast(`Updated theme “${p.name}”`, 'success');
  } catch (e) {
    toast('Could not update the theme: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

/** Replace a saved preset's contents, keeping its id and name (favourites stay attached). */
export async function updatePresetData<T>(p: StoredPreset<T>, data: T) {
  try {
    await db.putPreset({ ...p, data: structuredClone(data) });
    await refreshPresets();
    toast(`Updated “${p.name}”`, 'success');
  } catch (e) {
    toast('Could not update: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

export async function renamePreset(p: StoredPreset, name: string) {
  const clean = name.trim();
  if (!clean || clean === p.name) return;
  try {
    const others = namesOf(p.kind).filter((n) => n !== p.name);
    await db.putPreset({ ...p, name: uniqueName(clean, others) });
    await refreshPresets();
  } catch (e) {
    toast('Could not rename: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

export async function duplicatePreset(p: StoredPreset) {
  try {
    await put(p.kind, `${p.name} copy`, structuredClone(p.data), p.kind === 'theme' ? 'thm' : 'tpl');
  } catch (e) {
    toast('Could not duplicate: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
}

// ---------------------------------------------------------------------------
// Share Codes
// ---------------------------------------------------------------------------

export const KNOWN_ALGORITHMS: ReadonlySet<string> = new Set(ALGORITHMS.map((a) => a.id));

export function shareCodeOf(p: StoredPreset): string {
  return encodeShareCode(p.kind as ShareKind, p.name, p.data as CustomThemeData | TemplateData);
}

/** Put the code on the clipboard; if the clipboard is unavailable, show it so it can be copied by hand. */
export async function copyShareCode(p: StoredPreset, showCode: (code: string) => void) {
  let code: string;
  try {
    code = shareCodeOf(p);
  } catch (e) {
    return toast('Could not make a share code: ' + (e instanceof Error ? e.message : String(e)), 'error');
  }
  try {
    await navigator.clipboard.writeText(code);
    toast(`Share code for “${p.name}” copied (${code.length.toLocaleString()} characters)`, 'success');
  } catch {
    showCode(code);
  }
}

export function readShareCode(text: string): SharedItem {
  return decodeShareCode(text, KNOWN_ALGORITHMS);
}

/** Add a checked share code to My themes / My templates. Returns the saved preset. */
export async function importSharedItem(item: SharedItem, name: string): Promise<StoredPreset> {
  const p = await put(item.kind, name || item.name, structuredClone(item.data), item.kind === 'theme' ? 'thm' : 'tpl');
  toast(`Added “${p.name}” to ${item.kind === 'theme' ? 'My themes' : 'My templates'}`, 'success');
  return p;
}
