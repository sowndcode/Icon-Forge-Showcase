// Context menus (canvas objects, layers, library) + the menu renderer.

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { Vec } from '../core/types';
import { getPage } from '../state/doc';
import { applyLayout, detachObjects, findLayout, reapplyLayout } from '../state/layoutActions';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  hasClipboard,
  normalizeSelection,
  paste,
  reorderSelection,
  resetTransform,
  selectAllObjects,
  selectedObjects,
  setHero,
  setObjectsFlag,
  setPinned,
  ungroupSelection,
} from '../state/objects';
import { addTextAt } from '../state/placement';
import { setFocal } from '../state/pages';
import { useUI, type ContextMenuItem } from '../state/ui';
import { setBackground } from '../state/pages';

export function openMenu(x: number, y: number, items: ContextMenuItem[]) {
  useUI.setState({ menu: { x, y, items } });
}

export function openObjectMenu(x: number, y: number, at?: Vec) {
  const sel = selectedObjects();
  const page = getPage();
  if (!sel.length) {
    openMenu(x, y, [
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !hasClipboard(), onClick: paste },
      { label: 'Select all', shortcut: 'Ctrl+A', onClick: selectAllObjects },
      { separator: true },
      { label: 'Add text here', shortcut: 'T', onClick: () => at && addTextAt(at) },
      { label: page.focal.enabled ? 'Move focal region here' : 'Add focal region here', onClick: () => at && setFocal({ enabled: true, x: at.x, y: at.y }) },
      { separator: true },
      { label: 'Canvas & background settings…', onClick: () => useUI.setState({ inspectorTab: 'design' }) },
    ]);
    return;
  }
  const ids = sel.map((o) => o.id);
  const images = sel.filter((o) => o.type === 'image');
  const inLayout = sel.filter((o) => o.layoutId);
  const allPinned = inLayout.length > 0 && inLayout.every((o) => o.pinned);
  const inst = inLayout[0] ? findLayout(page, inLayout[0].layoutId) : undefined;
  const grouped = sel.some((o) => o.groupId);
  const items: ContextMenuItem[] = [
    { label: 'Copy', shortcut: 'Ctrl+C', onClick: copySelection },
    { label: 'Paste', shortcut: 'Ctrl+V', disabled: !hasClipboard(), onClick: paste },
    { label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => duplicateSelection() },
    { label: 'Delete', shortcut: 'Del', danger: true, onClick: deleteSelection },
    { separator: true },
    { label: 'Bring to front', shortcut: 'Ctrl+Shift+]', onClick: () => reorderSelection('front') },
    { label: 'Bring forward', shortcut: 'Ctrl+]', onClick: () => reorderSelection('forward') },
    { label: 'Send backward', shortcut: 'Ctrl+[', onClick: () => reorderSelection('backward') },
    { label: 'Send to back', shortcut: 'Ctrl+Shift+[', onClick: () => reorderSelection('back') },
    { separator: true },
    sel.length > 1 && !grouped ? { label: 'Group', shortcut: 'Ctrl+G', onClick: groupSelection } : { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', disabled: !grouped, onClick: ungroupSelection },
    { label: 'Flip horizontal', shortcut: 'Shift+H', onClick: () => flipSelection('x') },
    { label: 'Flip vertical', shortcut: 'Shift+V', onClick: () => flipSelection('y') },
    { label: 'Reset transform', onClick: resetTransform },
    { separator: true },
  ];
  if (inLayout.length) {
    items.push(
      { label: allPinned ? 'Unpin (follow layout again)' : 'Pin (keep position on re-layout)', shortcut: 'P', onClick: () => setPinned(inLayout.map((o) => o.id), !allPinned) },
      { label: 'Detach from layout', onClick: () => detachObjects(ids) },
      { label: `Reapply ${inst?.name ?? 'layout'}`, disabled: !inst, onClick: () => inst && reapplyLayout(inst.id) },
    );
  } else if (images.length > 1) {
    items.push({ label: 'Smart Layout: Grid', onClick: () => applyLayout('grid', images.map((o) => o.id)) }, { label: 'Smart Layout: Perspective Floor', onClick: () => applyLayout('floor', images.map((o) => o.id)) });
  }
  if (images.length) {
    const allHero = images.every((o) => o.hero);
    items.push({ label: allHero ? 'Unmark as hero' : 'Mark as hero', onClick: () => setHero(images.map((o) => o.id), !allHero) });
  }
  if (images.length > 1) {
    const ref = images[images.length - 1];
    items.push({ label: 'Match visual size to last selected', onClick: () => normalizeSelection('reference', { refId: ref.id }) });
  }
  if (images.length === 1) {
    const a = images[0];
    items.push({
      label: 'Use as page background',
      onClick: () => a.type === 'image' && setBackground((b) => ({ ...b, type: 'image', image: { ...b.image, assetId: a.assetId } })),
    });
  }
  items.push(
    { separator: true },
    { label: sel.every((o) => o.locked) ? 'Unlock' : 'Lock', shortcut: 'Ctrl+L', onClick: () => setObjectsFlag(ids, { locked: !sel.every((o) => o.locked) }, 'Lock') },
    { label: 'Hide', shortcut: 'Ctrl+H', onClick: () => setObjectsFlag(ids, { hidden: true }, 'Hide') },
  );
  openMenu(x, y, items);
}

export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      useUI.setState({ menu: null });
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useUI.setState({ menu: null });
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [menu]);
  useEffect(() => {
    // keep inside the window
    const el = ref.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight) el.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
    if (r.right > window.innerWidth) el.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
  }, [menu]);
  if (!menu) return null;
  return (
    <div ref={ref} className={`menu ${menu.items.some((it) => it.checked !== undefined) ? 'with-checks' : ''}`} style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) =>
        it.separator ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            className={it.danger ? 'danger' : ''}
            disabled={it.disabled}
            onClick={() => {
              useUI.setState({ menu: null });
              it.onClick?.();
            }}
          >
            {it.checked !== undefined && <span className="mcheck">{it.checked ? <Check size={14} /> : null}</span>}
            {it.label}
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
