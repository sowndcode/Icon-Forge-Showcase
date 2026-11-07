import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The desktop storage modules are plain CommonJS for Electron's main process.
const require = createRequire(import.meta.url);
const paths = require('../electron/paths.cjs');
const store = require('../electron/store.cjs');
const migrate = require('../electron/migrate.cjs');
const log = require('../electron/log.cjs');

// a folder with spaces, like the real install location
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase store '));
const L = paths.layout(path.join(tmp, 'data'), path.join(tmp, 'exports'));

const project = (id: string, name: string, n = 1) => ({
  id,
  meta: { id, name, updatedAt: n, pages: 1, assets: 1 },
  doc: { id, name, version: 1, assets: [{ id: 'as1' }], fonts: [], pages: [{ id: 'pg1', objects: [] }] },
});

beforeAll(() => {
  paths.ensureDirs(L);
  log.init(L.logs);
  store.init(L);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('paths', () => {
  it('keeps everything under data/', () => {
    for (const k of ['settings', 'projects', 'files', 'autosaves', 'cache', 'profile', 'logs']) expect(L[k].startsWith(L.data)).toBe(true);
    expect(fs.existsSync(L.settings) && fs.existsSync(L.files)).toBe(true);
  });
  it('refuses paths that escape their folder', () => {
    expect(() => paths.safeJoin(L.data, '../outside.txt')).toThrow();
    expect(() => paths.safeJoin(L.data, '..\\..\\x')).toThrow();
    expect(() => paths.safeJoin(L.data, 'a\0b.png')).toThrow();
    expect(() => paths.safeJoin(L.data, 'sub\\..\\..\\x')).toThrow();
    expect(paths.safeJoin(L.data, 'a/b.png')).toBe(path.join(L.data, 'a', 'b.png'));
  });
});

describe('file store', () => {
  it('saves, lists and reopens projects', async () => {
    await store.putProject(project('prjA', 'Alpha', 5));
    await store.putProject(project('prjB', 'Beta', 9));
    expect((await store.listProjects()).map((m: { name: string }) => m.name)).toEqual(['Beta', 'Alpha']);
    expect((await store.getProject('prjA')).doc.name).toBe('Alpha');
    expect(await store.getProject('nope')).toBeUndefined();
    expect(fs.existsSync(path.join(L.projects, 'prjA', 'project.json'))).toBe(true);
  });

  it('rejects ids that could reach other folders', async () => {
    await expect(store.getProject('../settings')).rejects.toThrow('Invalid id');
    await expect(store.putBlob('..\\x', new ArrayBuffer(1), '')).rejects.toThrow('Invalid id');
    await expect(store.putProject({ ...project('a/b', 'x'), id: 'a/b' })).rejects.toThrow();
  });

  it('restores a damaged project from its autosave and keeps the damaged file', async () => {
    await store.putProject(project('prjC', 'First', 1));
    await store.putProject(project('prjC', 'Second', 2)); // the first version becomes an autosave
    expect(fs.readdirSync(path.join(L.autosaves, 'prjC'))).toHaveLength(1);
    fs.writeFileSync(path.join(L.projects, 'prjC', 'project.json'), '{"broken": ');
    const p = await store.getProject('prjC');
    expect(p.doc.name).toBe('First');
    expect(p.recovered).toBeTruthy();
    expect(fs.readdirSync(path.join(L.projects, 'prjC')).some((n) => n.includes('.corrupt-'))).toBe(true);
    // and it reads normally afterwards
    expect((await store.getProject('prjC')).recovered).toBeUndefined();
  });

  it('rebuilds a missing project list entry', async () => {
    fs.unlinkSync(path.join(L.projects, 'prjA', 'meta.json'));
    expect((await store.listProjects()).some((m: { id: string }) => m.id === 'prjA')).toBe(true);
  });

  it('stores original files with a readable extension and type', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    await store.putBlob('as1', png.buffer, ''); // type unknown → sniffed
    expect(fs.existsSync(path.join(L.files, 'as1.png'))).toBe(true);
    const b = await store.getBlob('as1');
    expect(b.type).toBe('image/png');
    expect([...new Uint8Array(b.data)]).toEqual([...png]);
    await store.putBlob('fnt1', new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer, 'font/woff2');
    expect(fs.existsSync(path.join(L.files, 'fnt1.woff2'))).toBe(true);
  });

  it('deleting a project moves it and its files to the trash, keeping autosaves', async () => {
    // give the project an image of its own (the helper's 'as1' is shared with other test projects)
    const c = await store.getProject('prjC');
    c.doc.assets = [{ id: 'asC' }];
    await store.putProject(c);
    await store.putBlob('asC', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]).buffer, 'image/png');
    const trashId = await store.deleteProject('prjC');
    expect(fs.existsSync(path.join(L.projects, 'prjC'))).toBe(false);
    expect(await store.getBlob('asC')).toBeUndefined();
    expect(await store.getBlob('as1')).toBeTruthy();
    expect(fs.existsSync(path.join(L.trashProjects, trashId, 'files', 'asC.png'))).toBe(true);
    expect(fs.existsSync(path.join(L.autosaves, 'prjC'))).toBe(true);
    const [t] = await store.listTrash();
    expect(t).toMatchObject({ trashId, id: 'prjC', name: 'First', files: ['asC'] });
  });

  it('restores a trashed project with its files', async () => {
    const [t] = await store.listTrash();
    expect(await store.restoreTrash(t.trashId)).toBe('prjC');
    expect((await store.getProject('prjC')).doc.name).toBe('First');
    expect((await store.getBlob('asC')).type).toBe('image/png');
    expect(await store.listTrash()).toHaveLength(0);
    expect(fs.readdirSync(L.trashProjects)).toHaveLength(0);
  });

  it('restores under a new id when the old one is taken again', async () => {
    const trashId = await store.deleteProject('prjC');
    await store.putProject(project('prjC', 'New one with the same id', 9));
    const id = await store.restoreTrash(trashId);
    expect(id).not.toBe('prjC');
    expect((await store.getProject(id)).doc.id).toBe(id);
    expect((await store.getProject('prjC')).doc.name).toBe('New one with the same id');
  });

  it('never moves a file another project still uses', async () => {
    await store.putBlob('shared1', new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, 'image/png');
    const a = project('prjS1', 'S1');
    const b = project('prjS2', 'S2');
    a.doc.assets = [{ id: 'shared1' }];
    b.doc.assets = [{ id: 'shared1' }];
    await store.putProject(a);
    await store.putProject(b);
    const trashId = await store.deleteProject('prjS1');
    expect(await store.getBlob('shared1')).toBeTruthy();
    expect((await store.listTrash()).find((t: { trashId: string }) => t.trashId === trashId).files).toEqual([]);
  });

  it('deletes trashed projects permanently only when asked', async () => {
    const before = (await store.listTrash()).length;
    expect(before).toBeGreaterThan(0);
    const [first] = await store.listTrash();
    expect(await store.purgeTrash([first.trashId])).toBe(1);
    expect(await store.listTrash()).toHaveLength(before - 1);
    await store.purgeTrash('all');
    expect(await store.listTrash()).toHaveLength(0);
    await expect(store.restoreTrash('../settings')).rejects.toThrow('Invalid trash item');
    await expect(store.purgeTrash(['..\\..\\x-2026-01-01T00-00-00-000Z'])).rejects.toThrow();
  });

  it('keeps a removed file for undo, and brings it back when needed', async () => {
    await store.putBlob('asU', new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer, 'image/jpeg');
    await store.deleteBlob('asU');
    expect(fs.existsSync(path.join(L.files, 'asU.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(L.trashFiles, 'asU.jpg'))).toBe(true);
    // the asset came back through undo: reading it restores the file
    expect((await store.getBlob('asU')).type).toBe('image/jpeg');
    expect(fs.existsSync(path.join(L.files, 'asU.jpg'))).toBe(true);
    // removed files older than 30 days are cleared
    await store.deleteBlob('asU');
    const old = new Date(Date.now() - 31 * 24 * 3600 * 1000);
    fs.utimesSync(path.join(L.trashFiles, 'asU.jpg'), old, old);
    await store.cleanup();
    expect(fs.existsSync(path.join(L.trashFiles, 'asU.jpg'))).toBe(false);
  });

  it('keeps preferences, state and presets in data/settings', async () => {
    await store.setKV('prefs', { accent: 'blue', savedAt: 1 });
    await store.setKV('lastProject', 'prjB');
    await store.putPreset({ id: 'pre1', kind: 'text', name: 'Title', createdAt: 1, data: {} });
    await store.putPreset({ id: 'pre1', kind: 'text', name: 'Title 2', createdAt: 1, data: {} });
    expect(JSON.parse(fs.readFileSync(path.join(L.settings, 'preferences.json'), 'utf8')).accent).toBe('blue');
    expect(JSON.parse(fs.readFileSync(path.join(L.settings, 'state.json'), 'utf8')).lastProject).toBe('prjB');
    expect((await store.listPresets()).map((p: { name: string }) => p.name)).toEqual(['Title 2']);
    await expect(store.setKV('../x', 1)).rejects.toThrow();
  });
});

describe('migration', () => {
  const legacy = path.join(tmp, 'old profile');
  const L2 = paths.layout(path.join(tmp, 'data2'), path.join(tmp, 'exports2'));

  const age = (dir: string) => {
    const old = new Date(Date.now() - 3600_000);
    for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) fs.utimesSync(path.join(e.parentPath, e.name), old, old);
  };

  it('waits while the old database is still being written', () => {
    fs.mkdirSync(path.join(legacy, 'IndexedDB', 'db'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'IndexedDB', 'db', '000.log'), 'old');
    fs.writeFileSync(path.join(legacy, 'window-state.json'), '{"width":1,"height":2}');
    paths.ensureDirs(L2);
    expect(migrate.prepare(L2, [legacy]).phase).toBe('blocked');
    expect(fs.existsSync(path.join(L2.migration, 'state.json'))).toBe(false);
    expect(fs.existsSync(path.join(L2.profile, 'IndexedDB'))).toBe(false);
  }, 30_000);

  it('copies the old profile without changing it, replacing a half-finished earlier copy', () => {
    age(legacy);
    // left over from an interrupted start: must not be merged with the new copy
    fs.mkdirSync(path.join(L2.profile, 'IndexedDB', 'db'), { recursive: true });
    fs.writeFileSync(path.join(L2.profile, 'IndexedDB', 'db', 'stale.ldb'), 'stale');
    const r = migrate.prepare(L2, [legacy]);
    expect(fs.existsSync(path.join(L2.profile, 'IndexedDB', 'db', 'stale.ldb'))).toBe(false);
    expect(r.phase).toBe('pending');
    expect(fs.readFileSync(path.join(L2.profile, 'IndexedDB', 'db', '000.log'), 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(legacy, 'IndexedDB', 'db', '000.log'), 'utf8')).toBe('old');
    expect(fs.existsSync(path.join(L2.settings, 'window-state.json'))).toBe(true);
    // a second start before the import finished doesn't copy again
    expect(migrate.prepare(L2, [legacy]).phase).toBe('pending');
    expect(migrate.status().pending).toBe(true);
  });

  it('imports without overwriting, keeps conflicting copies, and reports', async () => {
    store.init(L2);
    await store.putProject(project('prjX', 'Edited here', 7));
    expect(await migrate.importProject(project('prjY', 'Old', 1))).toBe('written');
    expect(await migrate.importProject(project('prjY', 'Old', 1))).toBe('same');
    expect(await migrate.importProject(project('prjX', 'Older copy', 3))).toBe('conflict');
    expect((await store.getProject('prjX')).doc.name).toBe('Edited here');
    expect(fs.readdirSync(L2.conflicts)).toHaveLength(1);
    expect(await migrate.importBlob('as9', new Uint8Array([0xff, 0xd8, 0xff]).buffer, 'image/jpeg')).toBe('written');
    expect(await migrate.importBlob('as9', new Uint8Array([1]).buffer, 'image/jpeg')).toBe('exists');
    expect(await migrate.importKV('lastProject', 'prjY')).toBe('written');
    expect(await migrate.importKV('lastProject', 'other')).toBe('exists');
    const r = await migrate.finish({ projects: { written: ['prjY'], same: [], conflict: ['prjX'] }, files: { written: 1 }, blobKeys: ['as9'], errors: [] });
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(L2.migration, 'report.txt'), 'utf8')).toContain('Result: complete');
    expect(migrate.prepare(L2, [legacy]).phase).toBe('done');
    expect(fs.existsSync(path.join(legacy, 'IndexedDB', 'db', '000.log'))).toBe(true);
  });

  it('marks an unverified import as failed so it runs again', async () => {
    const L3 = paths.layout(path.join(tmp, 'data3'), path.join(tmp, 'exports3'));
    paths.ensureDirs(L3);
    migrate.prepare(L3, [legacy]);
    store.init(L3);
    const r = await migrate.finish({ projects: { written: ['missing1'] }, blobKeys: [], errors: [] });
    expect(r.ok).toBe(false);
    expect(migrate.prepare(L3, [legacy]).phase).toBe('pending');
  });

  it('starts fresh when there is nothing to migrate', () => {
    const L4 = paths.layout(path.join(tmp, 'data4'), path.join(tmp, 'exports4'));
    paths.ensureDirs(L4);
    expect(migrate.prepare(L4, [path.join(tmp, 'no such folder'), undefined]).phase).toBe('none');
  });
});

describe('cleanup', () => {
  it('removes temp files left by earlier runs but not a save in progress', async () => {
    store.init(L);
    const leftover = path.join(L.settings, `x.json.tmp-${process.pid + 1}`);
    const inProgress = path.join(L.settings, `x.json.tmp-${process.pid}`);
    fs.writeFileSync(leftover, '');
    fs.writeFileSync(inProgress, '');
    await store.cleanup();
    expect(fs.existsSync(leftover)).toBe(false);
    expect(fs.existsSync(inProgress)).toBe(true);
  });

  it('moves week-old unreferenced files to the trash, never ones anything still names', async () => {
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const put = (n: string, at = old) => {
      const f = path.join(L.files, n);
      fs.writeFileSync(f, 'x');
      fs.utimesSync(f, at, at);
      return f;
    };
    await store.putProject({ ...project('prjOrph', 'Orph'), doc: { ...project('prjOrph', 'Orph').doc, assets: [{ id: 'asKept' }] } });
    await store.putPreset({ id: 'pre1', kind: 'background', name: 'B', data: { image: { assetId: 'asInPreset' } } });
    fs.mkdirSync(path.join(L.autosaves, 'prjGone'), { recursive: true });
    fs.writeFileSync(path.join(L.autosaves, 'prjGone', '2026-01-01T00-00-00-000Z.json'), JSON.stringify({ doc: { assets: [{ id: 'asInSnapshot' }] } }));
    const kept = put('asKept.png');
    const inPreset = put('asInPreset.png');
    const inSnapshot = put('asInSnapshot.webp');
    const recent = put('asRecent.png', new Date());
    const orphan = put('asOrphan.png');
    const notOurs = put('notes.txt');
    const r = await store.sweepOrphans();
    expect(r.files).toBe(1);
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(path.join(L.trashFiles, 'asOrphan.png'))).toBe(true);
    for (const f of [kept, inPreset, inSnapshot, recent, notOurs]) expect(fs.existsSync(f)).toBe(true);
    // asked for again later (e.g. an old backup refers to it): it comes back from the trash
    expect((await store.getBlob('asOrphan'))?.data.byteLength).toBe(1);
    expect(fs.existsSync(orphan)).toBe(true);
  });

  it('reports usage per part, and the total matches the parts', async () => {
    const d = await store.usageDetail();
    expect(d.files).toBeGreaterThan(0);
    expect(await store.usage()).toBe(d.projects + d.files + d.autosaves + d.trash + d.settings);
  });
});

describe('log', () => {
  it('hides the home folder and long data', () => {
    const home = os.homedir();
    const out = log.redact(`failed at ${home}${path.sep}Desktop${path.sep}x.png data:image/png;base64,${'A'.repeat(80)}`);
    expect(out).not.toContain(home);
    expect(out).toContain('~');
    expect(out).not.toContain('AAAAAAAAAA');
  });

  it('hides the app folder and user name, even outside the home folder', () => {
    const user = os.userInfo().username;
    const out = log.redact(`opened ${tmp}${path.sep}data${path.sep}x.json and D:${path.sep}${user}${path.sep}y.png`);
    expect(out).toContain('<app>');
    expect(out).not.toContain(tmp);
    expect(out.toLowerCase()).not.toContain(user.toLowerCase());
  });
});

describe('presets file safety', () => {
  const L3 = paths.layout(path.join(tmp, 'data3'), path.join(tmp, 'exports3'));
  beforeAll(() => {
    paths.ensureDirs(L3);
    store.init(L3);
  });
  afterAll(() => store.init(L));

  it('sets a presets file of the wrong shape aside instead of overwriting it', async () => {
    fs.writeFileSync(path.join(L3.settings, 'presets.json'), '{"not": "a list"}');
    expect(await store.listPresets()).toEqual([]);
    expect(fs.readdirSync(L3.settings).some((n: string) => n.startsWith('presets.corrupt-'))).toBe(true);
    await store.putPreset({ id: 'thm1', kind: 'theme', name: 'Mine', createdAt: 1, data: {} });
    expect((await store.listPresets()).map((p: { id: string }) => p.id)).toEqual(['thm1']);
  });

  it('refuses presets of an unknown kind, without a name, or far too large', async () => {
    await expect(store.putPreset({ id: 'x1', kind: 'script', name: 'x', data: {} })).rejects.toThrow('Invalid preset');
    await expect(store.putPreset({ id: 'x2', kind: 'theme', data: {} })).rejects.toThrow('Invalid preset');
    await expect(store.putPreset({ id: 'x3', kind: 'theme', name: 'big', data: 'a'.repeat(5 * 1024 * 1024) })).rejects.toThrow('too large');
    await expect(store.putPreset([{ id: 'x4' }])).rejects.toThrow('Invalid preset');
  });
});
