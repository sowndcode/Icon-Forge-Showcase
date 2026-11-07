// Global keyboard shortcuts (ignored while typing in inputs).

import { useEffect } from 'react';
import { selectionAABB } from '../core/transform';
import { getAsset, getPage, isProjectOpen, redo, undo } from '../state/doc';
import { randomizeLayout } from '../state/layoutActions';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  nudge,
  paste,
  reorderSelection,
  selectAllObjects,
  selectedObjects,
  setObjectsFlag,
  setPinned,
  ungroupSelection,
} from '../state/objects';
import { removeFocal } from '../state/pages';
import { usePrefs } from '../state/prefs';
import { saveProjectFile } from '../state/project';
import { fitView, openDialog, setStage, useUI, useViewport, zoomTo, zoomToRect, type Tool } from '../state/ui';

export const SHORTCUTS: [string, string][] = [
  ['Ctrl+N', 'New project'],
  ['Ctrl+O', 'Projects'],
  ['V', 'Select / move tool'],
  ['H', 'Hand (pan) tool'],
  ['T', 'Text tool'],
  ['R / E / L', 'Rectangle / ellipse / line tool'],
  ['F', 'Focal region tool'],
  ['Space + drag', 'Pan'],
  ['Mouse wheel', 'Zoom at cursor (Shift+wheel pans)'],
  ['0', 'Fit canvas'],
  ['1', 'Zoom 100%'],
  ['2', 'Zoom to selection'],
  ['Ctrl+A', 'Select all objects'],
  ['Esc', 'Deselect / cancel'],
  ['Shift+click', 'Add / remove from selection'],
  ['Ctrl+click', 'Select inside a group'],
  ['Alt+drag', 'Duplicate while moving'],
  ['Shift+drag', 'Constrain axis / 15° rotation / free corner scale'],
  ['Alt+handle', 'Scale around center'],
  ['Ctrl (while dragging)', 'Disable snapping'],
  ['Arrows / Shift+Arrows', 'Nudge 1px / 10px'],
  ['Delete', 'Delete selection'],
  ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copy / paste / duplicate'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
  ['Ctrl+] / Ctrl+[', 'Bring forward / send backward (Shift = front/back)'],
  ['P', 'Pin / unpin (layout objects)'],
  ['Ctrl+R', 'Randomize the active layout (new seed)'],
  ['Shift+H / Shift+V', 'Flip horizontal / vertical'],
  ['Ctrl+L / Ctrl+H', 'Lock / hide selection'],
  ['Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+S / Ctrl+Shift+S', 'Save / save as'],
  ['Ctrl+E', 'Export'],
  ['Tab', 'Hide panels (distraction-free)'],
  ['Alt+0…6', 'Home / Import / Compose / Arrange / Watermark / Review / Export'],
  ['Esc (twice)', 'Deselect, then leave the active layout'],
  ['?', 'Shortcut list'],
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export function useShortcuts() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const ui = useUI.getState();
      if (ui.dialog || ui.editingTextId) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const lower = k.toLowerCase();
      // no project open: only the shortcuts that don't act on a project (new, projects, help)
      if (!isProjectOpen()) {
        const global = (ctrl && (lower === 'n' || lower === 'o')) || k === '?' || k === 'F1' || (e.altKey && k === '0');
        if (!global) return;
      }
      if (k === ' ') {
        if (!ui.spaceDown) useUI.setState({ spaceDown: true });
        e.preventDefault();
        return;
      }
      if (e.altKey && /^[0-6]$/.test(k)) {
        setStage((['home', 'import', 'compose', 'arrange', 'watermark', 'review', 'export'] as const)[+k]);
        e.preventDefault();
        return;
      }
      if (ctrl) {
        switch (lower) {
          case 'z':
            e.shiftKey ? redo() : undo();
            break;
          case 'y':
            redo();
            break;
          case 'a':
            selectAllObjects();
            break;
          case 'c':
            copySelection();
            break;
          case 'v':
            paste();
            break;
          case 'd':
            duplicateSelection();
            break;
          case 'g':
            e.shiftKey ? ungroupSelection() : groupSelection();
            break;
          case 's':
            void saveProjectFile(e.shiftKey);
            break;
          case 'e':
            openDialog('export');
            break;
          case 'r': {
            const id = ui.activeLayoutId;
            if (id) randomizeLayout(id);
            break;
          }
          case 'l': {
            const sel = selectedObjects();
            if (sel.length) setObjectsFlag(sel.map((o) => o.id), { locked: !sel.every((o) => o.locked) }, 'Lock');
            break;
          }
          case 'h': {
            const sel = selectedObjects();
            if (sel.length) setObjectsFlag(sel.map((o) => o.id), { hidden: true }, 'Hide');
            break;
          }
          case ']':
            reorderSelection(e.shiftKey ? 'front' : 'forward');
            break;
          case '[':
            reorderSelection(e.shiftKey ? 'back' : 'backward');
            break;
          case 'o':
            openDialog('projects');
            break;
          case 'n':
            openDialog('newProject');
            break;
          default:
            return;
        }
        e.preventDefault();
        return;
      }
      const tools: Record<string, Tool> = { v: 'select', h: 'hand', t: 'text', r: 'rect', e: 'ellipse', l: 'line', f: 'focal' };
      if (e.shiftKey && lower === 'h') return void flipSelection('x');
      if (e.shiftKey && lower === 'v') return void flipSelection('y');
      if (!e.shiftKey && !e.altKey && tools[lower]) {
        // pressing an active tool's key again goes back to Select / move
        useUI.setState({ tool: ui.tool === tools[lower] ? 'select' : tools[lower] });
        return;
      }
      switch (k) {
        case 'Delete':
        case 'Backspace':
          if (ui.tool === 'focal' && getPage().focal.enabled && !ui.selection.length) removeFocal();
          else deleteSelection();
          break;
        case 'Escape':
          if (ui.menu) useUI.setState({ menu: null });
          else if (ui.pageSel.length > 1) useUI.setState({ pageSel: [] });
          else if (ui.tool !== 'select') useUI.setState({ tool: 'select' });
          else if (ui.selection.length) useUI.getState().setSelection([]);
          else if (ui.activeLayoutId) useUI.setState({ activeLayoutId: null });
          break;
        case 'Tab':
          useUI.setState({ focusMode: !ui.focusMode });
          break;
        case '0': {
          const p = getPage();
          fitView(p.width, p.height);
          break;
        }
        case '1':
          zoomTo(1);
          break;
        case '2': {
          const b = selectionAABB(selectedObjects(), getAsset);
          if (b) zoomToRect(b);
          break;
        }
        case '+':
        case '=':
          zoomTo(useViewport.getState().zoom * 1.25);
          break;
        case '-':
          zoomTo(useViewport.getState().zoom / 1.25);
          break;
        case 'p':
        case 'P': {
          const sel = selectedObjects().filter((o) => o.layoutId);
          if (sel.length) setPinned(sel.map((o) => o.id), !sel.every((o) => o.pinned));
          break;
        }
        case '?':
          openDialog('shortcuts');
          break;
        case 'F1':
          setStage('guide');
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          const n = (e.shiftKey ? 10 : 1) * usePrefs.getState().nudge;
          nudge(k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0, k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') useUI.setState({ spaceDown: false });
    };
    const onBlur = () => useUI.setState({ spaceDown: false });
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
