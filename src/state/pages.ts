// Page (artboard) actions: add/duplicate/delete/reorder, size, background, safe zone, focal, guides.

import { createPage } from '../core/defaults';
import { uid } from '../core/ids';
import type { Background, FocalRegion, Guide, Page, SafeZone } from '../core/types';
import { commit, getDoc, getPage, mutate, withPage } from './doc';
import { fitView, toast, useUI } from './ui';

// The layout each page was last showing, so switching pages and coming back keeps it open.
const lastLayout = new Map<string, string>();

/** The layout to show for a page: the one last used there, else its most recent one. */
export function pageLayoutId(page: Page): string | null {
  const remembered = lastLayout.get(page.id);
  return page.layouts.find((l) => l.id === remembered)?.id ?? page.layouts[page.layouts.length - 1]?.id ?? null;
}

export function setActivePage(id: string) {
  const d0 = getDoc();
  if (d0.activePageId === id) return;
  const cur = useUI.getState().activeLayoutId;
  if (cur) lastLayout.set(d0.activePageId, cur);
  mutate((d) => ({ ...d, activePageId: id }));
  const p = getPage();
  useUI.setState({ selection: [], activeLayoutId: pageLayoutId(p), editingTextId: null });
  requestAnimationFrame(() => fitView(p.width, p.height));
}

export function addPage(page?: Page, opts: { activate?: boolean; label?: string } = {}): Page {
  const cur = getPage();
  const p = page ?? createPage(`Page ${getDoc().pages.length + 1}`, cur.width, cur.height, structuredClone(cur.background));
  commit(opts.label ?? 'Add page', (d) => {
    const idx = d.pages.findIndex((x) => x.id === d.activePageId);
    const pages = d.pages.slice();
    pages.splice(idx + 1, 0, p);
    return { ...d, pages, activePageId: opts.activate === false ? d.activePageId : p.id };
  });
  if (opts.activate !== false) {
    useUI.setState({ selection: [], activeLayoutId: null });
    requestAnimationFrame(() => fitView(p.width, p.height));
  }
  return p;
}

export function addPages(pages: Page[], label: string) {
  if (!pages.length) return;
  commit(label, (d) => ({ ...d, pages: [...d.pages, ...pages], activePageId: pages[0].id }));
  useUI.setState({ selection: [], activeLayoutId: null });
  requestAnimationFrame(() => fitView(pages[0].width, pages[0].height));
}

/** Deep copy with fresh ids (objects, groups, layouts, guides). */
export function clonePage(src: Page, name?: string): Page {
  const idMap = new Map<string, string>();
  const nid = (old: string, prefix: string) => {
    if (!idMap.has(old)) idMap.set(old, uid(prefix));
    return idMap.get(old)!;
  };
  const c: Page = structuredClone(src);
  c.id = uid('pg');
  c.name = name ?? `${src.name} copy`;
  c.groups = c.groups.map((g) => ({ ...g, id: nid(g.id, 'grp') }));
  c.layouts = c.layouts.map((l) => ({ ...l, id: nid(l.id, 'lay'), objectIds: l.objectIds.map((id) => nid(id, 'ob')) }));
  c.objects = c.objects.map((o) => ({ ...o, id: nid(o.id, 'ob'), groupId: o.groupId ? nid(o.groupId, 'grp') : undefined, layoutId: o.layoutId ? nid(o.layoutId, 'lay') : undefined }));
  c.guides = c.guides.map((g) => ({ ...g, id: uid('gd') }));
  return c;
}

export function duplicatePage(id: string) {
  const src = getDoc().pages.find((p) => p.id === id);
  if (!src) return;
  commit('Duplicate page', (d) => {
    const idx = d.pages.findIndex((p) => p.id === id);
    const pages = d.pages.slice();
    const c = clonePage(src);
    pages.splice(idx + 1, 0, c);
    return { ...d, pages, activePageId: c.id };
  });
  useUI.setState({ selection: [] });
}

/** Duplicate several pages at once (copies go right after the last one). */
export function duplicatePages(ids: string[]) {
  const set = new Set(ids);
  commit(`Duplicate ${ids.length} pages`, (d) => {
    const copies = d.pages.filter((p) => set.has(p.id)).map((p) => clonePage(p));
    const last = Math.max(...d.pages.map((p, i) => (set.has(p.id) ? i : -1)));
    const pages = d.pages.slice();
    pages.splice(last + 1, 0, ...copies);
    return { ...d, pages };
  });
}

export function deletePage(id: string) {
  const d0 = getDoc();
  if (d0.pages.length <= 1) {
    // deleting the last page leaves a fresh blank one of the same size
    const old = d0.pages[0];
    const blank = createPage('Page 1', old.width, old.height);
    commit('Delete page', (d) => ({ ...d, pages: [blank], activePageId: blank.id }));
    useUI.setState({ selection: [], activeLayoutId: null });
    return;
  }
  commit('Delete page', (d) => {
    const idx = d.pages.findIndex((p) => p.id === id);
    const pages = d.pages.filter((p) => p.id !== id);
    const active = d.activePageId === id ? pages[Math.max(0, idx - 1)].id : d.activePageId;
    return { ...d, pages, activePageId: active };
  });
  useUI.setState({ selection: [], activeLayoutId: null });
}

/** Remove every page (undoable). One blank page remains so there is somewhere to work. */
export function deleteAllPages() {
  const cur = getPage();
  const blank = createPage('Page 1', cur.width, cur.height);
  commit('Delete all pages', (d) => ({ ...d, pages: [blank], activePageId: blank.id }));
  useUI.setState({ selection: [], activeLayoutId: null });
  requestAnimationFrame(() => fitView(blank.width, blank.height));
  toast('All pages deleted — Ctrl+Z to undo', 'info');
}

export function deletePages(ids: string[]) {
  const d0 = getDoc();
  if (ids.length >= d0.pages.length) return deleteAllPages();
  const set = new Set(ids);
  commit(`Delete ${ids.length} pages`, (d) => {
    const pages = d.pages.filter((p) => !set.has(p.id));
    return { ...d, pages, activePageId: set.has(d.activePageId) ? pages[0].id : d.activePageId };
  });
  useUI.setState({ selection: [], activeLayoutId: null });
}

export function renamePage(id: string, name: string) {
  commit('Rename page', (d) => ({ ...d, pages: d.pages.map((p) => (p.id === id ? { ...p, name } : p)) }));
}

export function movePage(id: string, toIndex: number) {
  commit('Reorder pages', (d) => {
    const pages = d.pages.slice();
    const from = pages.findIndex((p) => p.id === id);
    if (from < 0) return d;
    const [p] = pages.splice(from, 1);
    pages.splice(Math.max(0, Math.min(pages.length, toIndex)), 0, p);
    return { ...d, pages };
  });
}

/** Resize the page. `mode` = keep content centered, or scale content proportionally. */
export function setPageSize(width: number, height: number, mode: 'center' | 'scale' = 'scale') {
  const page = getPage();
  if (width === page.width && height === page.height) return;
  const kx = width / page.width,
    ky = height / page.height;
  const k = Math.min(kx, ky);
  const dx = (width - page.width * (mode === 'scale' ? k : 1)) / 2;
  const dy = (height - page.height * (mode === 'scale' ? k : 1)) / 2;
  const m = mode === 'scale' ? k : 1;
  commit('Canvas size', (d) =>
    withPage(d, (p) => ({
      ...p,
      width,
      height,
      objects: p.objects.map((o) => {
        const base = { ...o, x: o.x * m + dx, y: o.y * m + dy, w: o.w * m, h: o.h * m };
        if (o.type === 'text' && m !== 1) return { ...base, style: { ...o.style, fontSize: o.style.fontSize * m, letterSpacing: o.style.letterSpacing * m, stroke: { ...o.style.stroke, width: o.style.stroke.width * m } } };
        return base;
      }),
      layouts: p.layouts.map((l) => ({
        ...l,
        plane: l.plane ? (l.plane.map((q) => ({ x: q.x * m + dx, y: q.y * m + dy })) as typeof l.plane) : undefined,
        path: l.path?.map((q) => ({ x: q.x * m + dx, y: q.y * m + dy })),
        slots: l.slots.map((s) => ({ ...s, cx: s.cx * m + dx, cy: s.cy * m + dy, w: s.w * m, h: s.h * m })),
      })),
      focal: { ...p.focal, x: p.focal.x * m + dx, y: p.focal.y * m + dy, w: p.focal.w * m, h: p.focal.h * m },
      guides: p.guides.map((g) => ({ ...g, pos: g.pos * m + (g.axis === 'x' ? dx : dy) })),
    })),
  );
  requestAnimationFrame(() => fitView(width, height));
}

export function setBackground(patch: Partial<Background> | ((b: Background) => Background), key?: string, pageId?: string) {
  commit(
    'Background',
    (d) => withPage(d, (p) => ({ ...p, background: typeof patch === 'function' ? patch(p.background) : { ...p.background, ...patch } }), pageId ?? d.activePageId),
    { key: key ? 'bg:' + key : undefined },
  );
}

/** Pages a library action applies to: the pages picked in the page strip (two or more), else the open one. */
export function targetPages(): string[] {
  const d = getDoc();
  const sel = useUI.getState().pageSel.filter((id) => d.pages.some((p) => p.id === id));
  return sel.length > 1 ? sel : [d.activePageId];
}

/** Change the background of several pages in one undo step (only the background changes). */
export function setBackgroundOn(pageIds: string[], fn: (b: Background, p: Page) => Background, label = 'Background') {
  const ids = new Set(pageIds);
  commit(pageIds.length > 1 ? `${label} on ${pageIds.length} pages` : label, (d) => ({ ...d, pages: d.pages.map((p) => (ids.has(p.id) ? { ...p, background: fn(p.background, p) } : p)) }));
}

/** Page-strip selection helpers. */
export function selectPages(ids: string[]) {
  useUI.setState({ pageSel: ids });
}
export function invertPageSelection() {
  const d = getDoc();
  const cur = new Set(useUI.getState().pageSel.length ? useUI.getState().pageSel : [d.activePageId]);
  const next = d.pages.filter((p) => !cur.has(p.id)).map((p) => p.id);
  // a single page is simply the page you are on
  if (next.length === 1) {
    useUI.setState({ pageSel: [] });
    setActivePage(next[0]);
  } else useUI.setState({ pageSel: next });
}

export function setSafeZone(patch: Partial<SafeZone>, key?: string) {
  commit('Safe zone', (d) => withPage(d, (p) => ({ ...p, safeZone: { ...p.safeZone, ...patch } })), { key: key ? 'sz:' + key : undefined });
}

export function setFocal(patch: Partial<FocalRegion>, opts: { key?: string; silent?: boolean } = {}) {
  const fn = (d: ReturnType<typeof getDoc>) => withPage(d, (p) => ({ ...p, focal: { ...p.focal, ...patch } }));
  if (opts.silent) mutate(fn);
  else commit('Focal region', fn, { key: opts.key ? 'focal:' + opts.key : undefined });
}

/** Remove the focal region (layouts that avoided it re-run). */
export function removeFocal() {
  setFocal({ enabled: false });
  if (useUI.getState().tool === 'focal') useUI.setState({ tool: 'select' });
  toast('Focal region removed — Ctrl+Z to undo', 'info');
}

export function setPageProp(patch: Partial<Pick<Page, 'name' | 'exportName'>>) {
  commit('Page settings', (d) => withPage(d, (p) => ({ ...p, ...patch })), { key: 'pageprop' });
}

export function addGuide(axis: 'x' | 'y', pos: number): Guide {
  const g = { id: uid('gd'), axis, pos };
  commit('Add guide', (d) => withPage(d, (p) => ({ ...p, guides: [...p.guides, g] })));
  return g;
}

export function moveGuide(id: string, pos: number, silent = true) {
  const fn = (d: ReturnType<typeof getDoc>) => withPage(d, (p) => ({ ...p, guides: p.guides.map((g) => (g.id === id ? { ...g, pos } : g)) }));
  if (silent) mutate(fn);
  else commit('Move guide', fn);
}

export function removeGuide(id: string) {
  commit('Remove guide', (d) => withPage(d, (p) => ({ ...p, guides: p.guides.filter((g) => g.id !== id) })));
}

export function clearGuides() {
  commit('Clear guides', (d) => withPage(d, (p) => ({ ...p, guides: [] })));
}
