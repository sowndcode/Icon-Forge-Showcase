// Templates-tab options: which look a choice resolves to, and how a change is applied.
//
// Options belong to pages. A page made from a built-in template stores the choices it was built with
// (fromTemplate.ui); the Templates tab shows them while that page is open. Changing an option is an
// explicit action: it rebuilds that one page (non-destructively, see templateMerge.ts) and becomes the
// default for the next template page. Nothing rebuilds a page on its own: switching pages, opening a
// project or the icon palette finishing loading never touch a page.

import { THEMES, type Theme } from '../core/themes';
import { matchedThemes, matchedVariants, type Palette } from '../core/palette';
import type { Page, TemplatePageOptions } from '../core/types';
import { BUILTIN_TEMPLATES, formatLabelOfSig, reapplyTemplate } from './generators';
import { DEFAULT_PAGE_OPTIONS, pageTemplateOptions } from './templateMerge';
import { useUI } from './ui';

/** Every theme a Look can name: from the icons, built-in, then the user's own. */
export function themeChoices(palette: Palette | null, mine: Theme[], seed = 0): Theme[] {
  return [...(palette ? [...matchedVariants(palette, seed), ...matchedThemes(palette)] : []), ...THEMES, ...mine];
}

/**
 * The theme a Look choice stands for. 'auto' is the theme a template is designed with when it names one
 * (the clean templates), else the icons' colours, else a neutral studio look.
 */
export function resolveTheme(themeId: string, all: Theme[], templateId?: string): Theme | undefined {
  if (themeId === 'none') return undefined;
  if (themeId === 'auto') {
    const own = templateId ? BUILTIN_TEMPLATES.find((t) => t.id === templateId)?.look : undefined;
    const designed = own ? all.find((t) => t.id === own) ?? THEMES.find((t) => t.id === own) : undefined;
    return designed ?? all.find((t) => t.id === 'match-deep') ?? THEMES.find((t) => t.id === 'minimal-dark');
  }
  return all.find((t) => t.id === themeId);
}

/** Whether a page follows the Templates-tab options live. */
export const isLiveTemplate = (page: Page) => !!page.fromTemplate && BUILTIN_TEMPLATES.some((t) => t.id === page.fromTemplate!.id);

/** The options the Templates tab shows: the open page's own when it is a template page, else the defaults for new pages. */
export function shownTemplateOptions(page: Page, defaults: TemplatePageOptions): TemplatePageOptions {
  return isLiveTemplate(page) ? pageTemplateOptions(page, formatLabelOfSig) : defaults;
}

/** Change one or more options: the open template page is rebuilt with them, and they become the default for new pages. */
export function setTemplateOption(page: Page, patch: Partial<TemplatePageOptions>, all: Theme[]) {
  const defaults = useUI.getState().templateUi;
  const cur = shownTemplateOptions(page, defaults);
  const next = { ...cur, ...patch };
  useUI.setState({ templateUi: { ...defaults, ...patch } });
  if (isLiveTemplate(page)) reapplyTemplate(page.id, next, resolveTheme(next.themeId, all, page.fromTemplate!.id));
}

export { DEFAULT_PAGE_OPTIONS };
