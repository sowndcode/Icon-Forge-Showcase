// Application menu bar (File · Edit · Object · View · Window · Help), laid out the way desktop
// design tools usually are so commands are where people expect them. Menus render through the
// shared context-menu component; moving the pointer across the bar switches between open menus.

import { useEffect, useRef, useState } from 'react';
import { selectionAABB } from '../core/transform';
import { getAsset, getPage, redo, redoLabel, undo, undoLabel, useDoc } from '../state/doc';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  hasClipboard,
  paste,
  reorderSelection,
  resetTransform,
  selectAllObjects,
  selectedObjects,
  setObjectsFlag,
  ungroupSelection,
} from '../state/objects';
import { duplicatePage } from '../state/pages';
import { addShape, addTextAt } from '../state/placement';
import { usePrefs } from '../state/prefs';
import { closeProject, deletedToast, deleteLabel, deleteManyNote, deleteStoredProjects, listProjects, openProjectViaDialog, saveProjectFile } from '../state/project';
import { isProjectOpen } from '../state/doc';
import { fitView, openDialog, setStage, toast, useUI, useViewport, zoomTo, zoomToRect, type ContextMenuItem } from '../state/ui';
import { openFilePicker, openFolderPicker, openProjectPicker } from './App';
import { openMenu } from './menus';
import { askConfirm } from './components/ask';


/** Menu items that act on the open project are unavailable while none is open. */
const needsProject = (items: ContextMenuItem[]): ContextMenuItem[] => (isProjectOpen() ? items : items.map((i) => (i.separator ? i : { ...i, disabled: true })));

function fileMenu(): ContextMenuItem[] {
  const open = isProjectOpen();
  return [
    { label: 'New project…', shortcut: 'Ctrl+N', onClick: () => openDialog('newProject') },
    { label: 'Projects…', shortcut: 'Ctrl+O', onClick: () => openDialog('projects') },
    {
      label: 'Open .showcase file…',
      onClick: async () => {
        if (!(await openProjectViaDialog())) openProjectPicker();
      },
    },
    { label: 'Close project', disabled: !open, onClick: () => void closeProject() },
    { separator: true },
    ...needsProject([
      { label: 'Save', shortcut: 'Ctrl+S', onClick: () => void saveProjectFile(false) },
      { label: 'Save as…', shortcut: 'Ctrl+Shift+S', onClick: () => void saveProjectFile(true) },
      { separator: true },
      { label: 'Import files…', onClick: () => openFilePicker() },
      { label: 'Import folder…', onClick: () => openFolderPicker() },
      { separator: true },
      { label: 'New page…', onClick: () => openDialog('newPage') },
      { label: 'Duplicate page', onClick: () => duplicatePage(getPage().id) },
      { separator: true },
      { label: 'Export…', shortcut: 'Ctrl+E', onClick: () => openDialog('export') },
    ]),
    { separator: true },
    {
      label: 'Delete all projects…',
      danger: true,
      onClick: async () => {
        const all = await listProjects();
        if (!all.length) return;
        if (!(await askConfirm({ title: `Delete all ${all.length} project${all.length > 1 ? 's' : ''}?`, message: deleteManyNote(), okLabel: deleteLabel(), danger: true }))) return;
        await deleteStoredProjects(all.map((p) => p.id));
        toast(deletedToast(all.length), 'success');
      },
    },
  ];
}

function editMenu(): ContextMenuItem[] {
  const d = useDoc.getState();
  const sel = useUI.getState().selection.length > 0;
  const u = undoLabel(),
    r = redoLabel();
  return [
    { label: u ? `Undo ${u}` : 'Undo', shortcut: 'Ctrl+Z', disabled: !d.past.length, onClick: undo },
    { label: r ? `Redo ${r}` : 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !d.future.length, onClick: redo },
    { separator: true },
    { label: 'Copy', shortcut: 'Ctrl+C', disabled: !sel, onClick: copySelection },
    { label: 'Paste', shortcut: 'Ctrl+V', disabled: !hasClipboard(), onClick: paste },
    { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !sel, onClick: () => duplicateSelection() },
    { label: 'Delete', shortcut: 'Del', disabled: !sel, onClick: deleteSelection },
    { separator: true },
    { label: 'Select all', shortcut: 'Ctrl+A', onClick: selectAllObjects },
    { label: 'Deselect', shortcut: 'Esc', disabled: !sel, onClick: () => useUI.getState().setSelection([]) },
    { separator: true },
    { label: 'Settings…', onClick: () => openDialog('settings') },
  ];
}

function objectMenu(): ContextMenuItem[] {
  const sel = selectedObjects();
  const none = !sel.length;
  const ids = sel.map((o) => o.id);
  const p = getPage();
  const center = { x: p.width / 2, y: p.height / 2 };
  return [
    { label: 'Add text', shortcut: 'T', onClick: () => addTextAt(center) },
    { label: 'Add rectangle', shortcut: 'R', onClick: () => addShape('rect') },
    { label: 'Add rounded rectangle', onClick: () => addShape('rounded') },
    { label: 'Add ellipse', shortcut: 'E', onClick: () => addShape('ellipse') },
    { separator: true },
    { label: 'Group', shortcut: 'Ctrl+G', disabled: sel.length < 2, onClick: groupSelection },
    { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', disabled: !sel.some((o) => o.groupId), onClick: ungroupSelection },
    { separator: true },
    { label: 'Bring to front', shortcut: 'Ctrl+Shift+]', disabled: none, onClick: () => reorderSelection('front') },
    { label: 'Bring forward', shortcut: 'Ctrl+]', disabled: none, onClick: () => reorderSelection('forward') },
    { label: 'Send backward', shortcut: 'Ctrl+[', disabled: none, onClick: () => reorderSelection('backward') },
    { label: 'Send to back', shortcut: 'Ctrl+Shift+[', disabled: none, onClick: () => reorderSelection('back') },
    { separator: true },
    { label: 'Flip horizontal', shortcut: 'Shift+H', disabled: none, onClick: () => flipSelection('x') },
    { label: 'Flip vertical', shortcut: 'Shift+V', disabled: none, onClick: () => flipSelection('y') },
    { label: 'Reset transform', disabled: none, onClick: resetTransform },
    { separator: true },
    { label: sel.length && sel.every((o) => o.locked) ? 'Unlock' : 'Lock', shortcut: 'Ctrl+L', disabled: none, onClick: () => setObjectsFlag(ids, { locked: !sel.every((o) => o.locked) }, 'Lock') },
    { label: 'Hide', shortcut: 'Ctrl+H', disabled: none, onClick: () => setObjectsFlag(ids, { hidden: true }, 'Hide') },
  ];
}

function viewMenu(): ContextMenuItem[] {
  const { overlays: ov, snap, setOverlay, setSnap } = usePrefs.getState();
  const focus = useUI.getState().focusMode;
  return [
    { label: 'Zoom in', shortcut: '+', onClick: () => zoomTo(useViewport.getState().zoom * 1.25) },
    { label: 'Zoom out', shortcut: '−', onClick: () => zoomTo(useViewport.getState().zoom / 1.25) },
    {
      label: 'Fit page in window',
      shortcut: '0',
      onClick: () => {
        const p = getPage();
        fitView(p.width, p.height);
      },
    },
    { label: 'Actual size (100%)', shortcut: '1', onClick: () => zoomTo(1) },
    {
      label: 'Zoom to selection',
      shortcut: '2',
      onClick: () => {
        const b = selectionAABB(selectedObjects(), getAsset);
        if (b) zoomToRect(b);
      },
    },
    { separator: true },
    { label: 'Rulers', checked: ov.rulers, onClick: () => setOverlay({ rulers: !ov.rulers }) },
    { label: 'Rule of thirds', checked: ov.thirds, onClick: () => setOverlay({ thirds: !ov.thirds }) },
    { label: 'Composition grid', checked: ov.compGrid, onClick: () => setOverlay({ compGrid: !ov.compGrid }) },
    { label: 'Center lines', checked: ov.center, onClick: () => setOverlay({ center: !ov.center }) },
    { label: 'Safe zone', checked: ov.safe, onClick: () => setOverlay({ safe: !ov.safe }) },
    { label: 'Focal region', checked: ov.focal, onClick: () => setOverlay({ focal: !ov.focal }) },
    { label: 'Layout guides', checked: ov.perspective, onClick: () => setOverlay({ perspective: !ov.perspective }) },
    { separator: true },
    { label: 'Snapping', checked: snap.enabled, onClick: () => setSnap({ enabled: !snap.enabled }) },
    { separator: true },
    { label: 'Hide panels', checked: focus, shortcut: 'Tab', onClick: () => useUI.setState({ focusMode: !focus }) },
  ];
}

function windowMenu(): ContextMenuItem[] {
  const p = usePrefs.getState();
  const stage = useUI.getState().stage;
  const ws = (['home', 'import', 'compose', 'arrange', 'review', 'export'] as const).map((s, i) => ({
    label: ['Home', 'Import', 'Compose', 'Arrange', 'Review', 'Export'][i], checked: stage === s,
    shortcut: `Alt+${i}`,
    onClick: () => setStage(s),
  }));
  return [
    ...ws,
    { separator: true },
    { label: 'Library panel', checked: !p.leftCollapsed, onClick: () => p.setPrefs({ leftCollapsed: !p.leftCollapsed }) },
    { label: 'Properties panel', checked: !p.rightCollapsed, onClick: () => p.setPrefs({ rightCollapsed: !p.rightCollapsed }) },
    { label: 'Reset panel sizes', onClick: () => p.setPrefs({ leftCollapsed: false, rightCollapsed: false, leftWidth: 300, rightWidth: 320 }) },
    { separator: true },
    { label: 'Dark theme', checked: p.theme === 'dark', onClick: () => p.setPrefs({ theme: 'dark' }) },
    { label: 'Light theme', checked: p.theme === 'light', onClick: () => p.setPrefs({ theme: 'light' }) },
    { label: 'Match system theme', checked: p.theme === 'system', onClick: () => p.setPrefs({ theme: 'system' }) },
  ];
}

function helpMenu(): ContextMenuItem[] {
  return [
    { label: 'Guide', shortcut: 'F1', onClick: () => setStage('guide') },
    { label: 'Interactive tutorials', onClick: () => (useUI.setState({ guideLesson: 'tutorials' }), setStage('guide')) },
    { label: 'Keyboard shortcuts', shortcut: '?', onClick: () => openDialog('shortcuts') },
    { separator: true },
    { label: 'Show quick start again', onClick: () => usePrefs.getState().setPrefs({ quickStartDismissed: false }) },
  ];
}

/** Edit with no project: only Settings stays available. */
const editMenuGated = (): ContextMenuItem[] => (isProjectOpen() ? editMenu() : editMenu().map((i) => (i.separator || i.label === 'Settings…' ? i : { ...i, disabled: true })));
/** Window with no project: Home, panels and theme stay; the project workspaces don't. */
const windowMenuGated = (): ContextMenuItem[] => (isProjectOpen() ? windowMenu() : windowMenu().map((i) => (['Import', 'Compose', 'Arrange', 'Review', 'Export'].includes(i.label ?? '') ? { ...i, disabled: true } : i)));

const MENUS: { id: string; label: string; items: () => ContextMenuItem[] }[] = [
  { id: 'file', label: 'File', items: fileMenu },
  { id: 'edit', label: 'Edit', items: editMenuGated },
  { id: 'object', label: 'Object', items: () => needsProject(objectMenu()) },
  { id: 'view', label: 'View', items: () => needsProject(viewMenu()) },
  { id: 'window', label: 'Window', items: windowMenuGated },
  { id: 'help', label: 'Help', items: helpMenu },
];

export function MenuBar() {
  const [active, setActive] = useState<string | null>(null);
  const wasOpen = useRef<string | null>(null);
  // the shared menu closes itself on outside clicks/Escape; follow it
  useEffect(() => useUI.subscribe((s) => !s.menu && setActive(null)), []);
  const show = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    openMenu(r.left, r.bottom + 2, MENUS.find((m) => m.id === id)!.items());
    setActive(id);
  };
  return (
    <nav className="menubar" aria-label="Main menu">
      {MENUS.map((m) => (
        <button
          key={m.id}
          className={`menubar-item ${active === m.id ? 'on' : ''}`}
          onPointerDown={() => (wasOpen.current = active)}
          onClick={(e) => {
            // a second click on the open menu closes it
            if (wasOpen.current === m.id) return;
            show(m.id, e.currentTarget);
          }}
          onPointerEnter={(e) => {
            if (active && active !== m.id) show(m.id, e.currentTarget);
          }}
        >
          {m.label}
        </button>
      ))}
    </nav>
  );
}
