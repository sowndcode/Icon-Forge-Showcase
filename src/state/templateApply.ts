// Applying a template with an explicit scope. Each scope changes one aspect of a page and leaves the
// rest exactly as it was:
//   layout     → how the page's icons are arranged (text, shapes and background stay)
//   background → the background only
//   text       → the look of the title, subtitle and badges (their words, sizes and places stay)
// Replacing the whole page and adding a new page are handled in generators.ts.

import { applyTextLook } from '../core/defaults';
import type { LayoutInstance, Page, SceneObject, TextObject } from '../core/types';
import { runLayout } from '../layout/run';
import { commit, getAsset } from './doc';
import { instanceFromPreset, newInstance, presetFromInstance } from './layoutActions';
import { textRoles } from './templateMerge';

export type TemplateScope = 'layout' | 'background' | 'text';

export const SCOPE_LABEL: Record<TemplateScope, { label: string; changes: string; keeps: string }> = {
  layout: { label: 'Layout only', changes: 'How the icons on the page are arranged', keeps: 'Text, text styles, shapes and background' },
  background: { label: 'Background only', changes: 'The background', keeps: 'Text, text styles, icons and layout' },
  text: { label: 'Text style only', changes: 'Fonts, colours, outlines and effects of the title, subtitle and badges', keeps: 'Your words, text sizes and positions, icons, layout and background' },
};

/** The template's arrangement on `page`: the page's icons, re-laid out. Pages without icons wait for them. */
function withLayout(page: Page, src: Page): Page {
  const inst = src.layouts[0];
  const preset = inst ? presetFromInstance(inst, src) : src.templateLayout;
  if (!preset) return page;
  const icons = page.objects.filter((o) => o.type === 'image');
  if (!icons.length) return { ...page, templateLayout: { ...preset } };
  const current = page.layouts[0];
  // the page's own icons: those in its first layout, else every icon on the page
  const ids = current ? current.objectIds.filter((id) => icons.some((o) => o.id === id)) : icons.map((o) => o.id);
  const next: LayoutInstance = { ...(current ?? newInstance(preset.algorithm, ids, page)), ...instanceFromPreset(preset, page), objectIds: ids, slots: [] };
  const objects = page.objects.map((o): SceneObject => (ids.includes(o.id) ? { ...o, layoutId: next.id, pinned: false } : o));
  const layouts = current ? page.layouts.map((l) => (l.id === current.id ? next : l)) : [...page.layouts, next];
  return runLayout({ ...page, objects, layouts }, next, { getAsset });
}

/** The template's text looks on the page's texts, matched by role (title, subtitle, badges…). */
function withTextStyle(page: Page, src: Page): Page {
  const from = textRoles(src);
  const to = textRoles(page);
  const looks = new Map<string, TextObject['style']>();
  for (const [role, t] of to) {
    // a badge without a matching badge takes the template's first badge; plain text the closest plain role
    const s = from.get(role) ?? (role.startsWith('badge') ? from.get('badge1') : from.get('subtitle') ?? from.get('title'));
    if (s) looks.set(t.id, applyTextLook(t.style, s.style));
  }
  if (!looks.size) return page;
  return { ...page, objects: page.objects.map((o) => (o.type === 'text' && looks.has(o.id) ? { ...o, style: looks.get(o.id)! } : o)) };
}

/** One page with one aspect of `src` applied (pure). */
export function applyScope(page: Page, src: Page, scope: TemplateScope): Page {
  if (scope === 'background') return { ...page, background: structuredClone(src.background) };
  if (scope === 'text') return withTextStyle(page, src);
  return withLayout(page, src);
}

/**
 * Apply one aspect of a template to several pages in one undo step. `build` makes the template for a
 * page (at that page's size, with that page's icons).
 */
export function applyTemplateScope(pageIds: string[], build: (p: Page) => Page, scope: TemplateScope, name: string) {
  const ids = new Set(pageIds);
  commit(`${name}: ${SCOPE_LABEL[scope].label.toLowerCase()}${pageIds.length > 1 ? ` on ${pageIds.length} pages` : ''}`, (d) => ({
    ...d,
    pages: d.pages.map((p) => (ids.has(p.id) ? applyScope(p, build(p), scope) : p)),
  }));
}
