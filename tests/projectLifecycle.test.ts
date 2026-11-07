// Project lifecycle: open, close, switch, create and delete behave like a desktop editor. Closing or
// deleting never creates a replacement project or opens Import; saves finish before a project is
// closed, and a save in flight can never bring a deleted project back.

import './helpers/canvasStub';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let answer: 'go' | 'keep' = 'keep';
const asked: string[] = [];
vi.mock('../src/ui/components/ask', () => ({
  askChoice: async (o: { title: string }) => (asked.push(o.title), answer),
  askConfirm: async () => true,
  askText: async () => null,
}));

import { createPage, createProject, createText } from '../src/core/defaults';
import type { ProjectDoc } from '../src/core/types';
import { db, type StoredProject } from '../src/services/db';
import { commit, getDoc, loadDoc, unloadDoc, useDoc } from '../src/state/doc';
import { boot, closeProject, createNewProject, deleteStoredProject, deleteStoredProjects, openStoredProject, saveNow, startAutosave } from '../src/state/project';
import { useUI } from '../src/state/ui';

// an in-memory stand-in for the app's storage
let projects: Map<string, StoredProject>;
let kv: Map<string, unknown>;
let failWrites = false;
let slowWrite: Promise<void> | null = null;

function stored(name: string, pages = 2): ProjectDoc {
  const d = createProject(name);
  d.pages = Array.from({ length: pages }, (_, i) => {
    const p = createPage(`${name} page ${i + 1}`, 1920, 1080);
    p.objects = [createText(`${name} title ${i + 1}`, 960, 200)];
    return p;
  });
  d.activePageId = d.pages[0].id;
  projects.set(d.id, { id: d.id, meta: { id: d.id, name, updatedAt: 1, pages, assets: 0 }, doc: d });
  return d;
}

beforeEach(() => {
  projects = new Map();
  kv = new Map();
  failWrites = false;
  slowWrite = null;
  answer = 'keep';
  asked.length = 0;
  vi.spyOn(db, 'putProject').mockImplementation(async (p: StoredProject) => {
    if (slowWrite) await slowWrite;
    if (failWrites) throw new Error('the disk is full');
    projects.set(p.id, structuredClone(p));
  });
  vi.spyOn(db, 'getProject').mockImplementation(async (id: string) => structuredClone(projects.get(id)));
  vi.spyOn(db, 'deleteProject').mockImplementation(async (id: string) => void projects.delete(id));
  vi.spyOn(db, 'listProjects').mockImplementation(async () => [...projects.values()].map((p) => p.meta));
  vi.spyOn(db, 'getKV').mockImplementation(async (k: string) => kv.get(k) as never);
  vi.spyOn(db, 'setKV').mockImplementation(async (k: string, v: unknown) => void kv.set(k, v));
  vi.spyOn(db, 'getBlob').mockResolvedValue(undefined);
  vi.spyOn(db, 'putBlob').mockResolvedValue(undefined);
  vi.spyOn(db, 'listPresets').mockResolvedValue([]);
  unloadDoc();
  useUI.setState({ stage: 'home', dialog: null, selection: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const rename = (name: string) => commit('Rename', (d) => ({ ...d, name }));

// autosave listens to the window closing and the page being hidden; Node has neither
let autosaveOn = false;
function autosave() {
  const g = globalThis as Record<string, unknown>;
  g.window ??= { addEventListener: () => undefined };
  g.document ??= { addEventListener: () => undefined, visibilityState: 'visible' };
  if (!autosaveOn) startAutosave();
  autosaveOn = true;
}

describe('closing a project', () => {
  it('saves it, then shows Home with no project open; nothing is created or deleted', async () => {
    const a = stored('Alpha');
    expect(await openStoredProject(a.id)).toBe(true);
    rename('Alpha edited');
    expect(await closeProject()).toBe(true);
    expect(useDoc.getState().open).toBe(false);
    expect(useUI.getState().stage).toBe('home');
    expect(projects.size).toBe(1);
    expect(projects.get(a.id)!.doc.name).toBe('Alpha edited');
    // no history from the closed project is left
    expect(useDoc.getState().past).toHaveLength(0);
  });

  it('is not reopened on the next start', async () => {
    const a = stored('Alpha');
    await openStoredProject(a.id);
    await closeProject();
    unloadDoc();
    useUI.setState({ booting: true, stage: 'compose' });
    await boot();
    expect(useDoc.getState().open).toBe(false);
    expect(useUI.getState().stage).toBe('home');
    expect(projects.size).toBe(1);
  });

  it('reopening it brings back every page and text', async () => {
    const a = stored('Alpha', 3);
    await openStoredProject(a.id);
    await closeProject();
    await openStoredProject(a.id);
    const d = getDoc();
    expect(d.pages.map((p) => p.name)).toEqual(['Alpha page 1', 'Alpha page 2', 'Alpha page 3']);
    expect(d.pages[2].objects[0]).toMatchObject({ type: 'text', text: 'Alpha title 3' });
  });

  it('waits for a pending autosave before closing', async () => {
    vi.useFakeTimers();
    autosave();
    const a = stored('Alpha');
    await openStoredProject(a.id);
    rename('Typed just before closing');
    // the autosave timer has not fired yet
    expect(projects.get(a.id)!.doc.name).toBe('Alpha');
    await closeProject();
    expect(projects.get(a.id)!.doc.name).toBe('Typed just before closing');
  });

  it('a failed save keeps the project open unless the user chooses otherwise', async () => {
    const a = stored('Alpha');
    await openStoredProject(a.id);
    rename('Unsaved');
    failWrites = true;
    answer = 'keep';
    expect(await closeProject()).toBe(false);
    expect(asked).toHaveLength(1);
    expect(useDoc.getState().open).toBe(true);
    expect(getDoc().name).toBe('Unsaved');
    // the user decides to close without the latest changes
    answer = 'go';
    expect(await closeProject()).toBe(true);
    expect(useDoc.getState().open).toBe(false);
    expect(projects.get(a.id)!.doc.name).toBe('Alpha');
  });
});

describe('switching projects', () => {
  it('saves the first, loads the second with nothing carried over', async () => {
    const a = stored('Alpha');
    const b = stored('Beta', 1);
    await openStoredProject(a.id);
    rename('Alpha changed');
    useUI.setState({ selection: ['something'] });
    await openStoredProject(b.id);
    expect(projects.get(a.id)!.doc.name).toBe('Alpha changed');
    expect(getDoc().id).toBe(b.id);
    expect(getDoc().pages).toHaveLength(1);
    expect(useDoc.getState().past).toHaveLength(0);
    expect(useUI.getState().selection).toEqual([]);
    expect(kv.get('lastProject')).toBe(b.id);
    expect(projects.size).toBe(2);
  });

  it('a new project saves the open one first and never duplicates it', async () => {
    const a = stored('Alpha');
    await openStoredProject(a.id);
    rename('Alpha before new');
    await createNewProject({ name: 'Gamma', width: 630, height: 500, copyAssets: false });
    expect(projects.get(a.id)!.doc.name).toBe('Alpha before new');
    expect([...projects.values()].map((p) => p.meta.name).sort()).toEqual(['Alpha before new', 'Gamma']);
  });
});

describe('deleting projects', () => {
  it('deleting the open project shows Home with no project, not Import, and creates nothing', async () => {
    const a = stored('Alpha');
    const b = stored('Beta');
    await openStoredProject(a.id);
    useUI.setState({ stage: 'compose' });
    await deleteStoredProject(a.id);
    expect(useDoc.getState().open).toBe(false);
    expect(useUI.getState().stage).toBe('home');
    expect([...projects.keys()]).toEqual([b.id]);
    expect(kv.get('lastProject')).toBe('');
  });

  it('deleting another project leaves the open one exactly as it was', async () => {
    const a = stored('Alpha');
    const b = stored('Beta');
    await openStoredProject(a.id);
    rename('Alpha in progress');
    const before = getDoc();
    useUI.setState({ stage: 'arrange', selection: ['x'] });
    await deleteStoredProject(b.id);
    expect(getDoc()).toBe(before);
    expect(useDoc.getState().open).toBe(true);
    expect(useUI.getState().stage).toBe('arrange');
    expect(useUI.getState().selection).toEqual(['x']);
    expect(projects.has(b.id)).toBe(false);
  });

  it('deleting the last project leaves none, and Home', async () => {
    const a = stored('Alpha');
    await openStoredProject(a.id);
    await deleteStoredProjects([a.id]);
    expect(projects.size).toBe(0);
    expect(useDoc.getState().open).toBe(false);
  });

  it('a pending autosave cannot bring a deleted project back', async () => {
    vi.useFakeTimers();
    autosave();
    const a = stored('Alpha');
    await openStoredProject(a.id);
    rename('Edit that was waiting to be saved');
    await deleteStoredProject(a.id);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(projects.has(a.id)).toBe(false);
  });

  it('a save already being written finishes before the delete, so the delete wins', async () => {
    const a = stored('Alpha');
    await openStoredProject(a.id);
    rename('Being written');
    let release!: () => void;
    slowWrite = new Promise((r) => (release = r));
    const saving = saveNow();
    const deleting = deleteStoredProject(a.id);
    release();
    await Promise.all([saving, deleting]);
    expect(projects.has(a.id)).toBe(false);
    // and nothing writes it later either
    await saveNow();
    expect(projects.has(a.id)).toBe(false);
  });
});

describe('no project open', () => {
  it('nothing is saved and the placeholder is never listed', async () => {
    unloadDoc();
    commit('Rename', (d) => ({ ...d, name: 'Should not be saved' }));
    await saveNow();
    expect(projects.size).toBe(0);
    expect(db.putProject).not.toHaveBeenCalled();
  });

  it('a first start with no projects opens nothing and creates nothing', async () => {
    useUI.setState({ booting: true });
    await boot();
    expect(useDoc.getState().open).toBe(false);
    expect(projects.size).toBe(0);
  });

  it('loading a project directly marks it open', () => {
    loadDoc(createProject('Direct'));
    expect(useDoc.getState().open).toBe(true);
  });
});
