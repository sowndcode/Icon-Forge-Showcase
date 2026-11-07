// A new copy of the app finds the projects of an earlier copy and can copy them, never changing the
// earlier folder and never replacing anything.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const locations = createRequire(import.meta.url)('../electron/locations.cjs');
let tmp = '';
const reg = () => path.join(tmp, 'profile', 'data-locations.json');

function dataDir(name: string, projects: string[] = [], opts: { prefs?: string; files?: Record<string, string> } = {}) {
  const d = path.join(tmp, name, 'data');
  fs.mkdirSync(path.join(d, 'projects', '_files'), { recursive: true });
  fs.mkdirSync(path.join(d, 'settings'), { recursive: true });
  for (const id of projects) {
    fs.mkdirSync(path.join(d, 'projects', id), { recursive: true });
    fs.writeFileSync(path.join(d, 'projects', id, 'project.json'), JSON.stringify({ id, doc: { name: id } }));
    fs.writeFileSync(path.join(d, 'projects', id, 'meta.json'), JSON.stringify({ id }));
  }
  for (const [k, v] of Object.entries(opts.files ?? {})) fs.writeFileSync(path.join(d, 'projects', '_files', k), v);
  if (opts.prefs) fs.writeFileSync(path.join(d, 'settings', 'preferences.json'), opts.prefs);
  return d;
}
const snapshot = (d: string) => {
  const out: Record<string, string> = {};
  const walk = (x: string) => {
    for (const e of fs.readdirSync(x, { withFileTypes: true })) {
      const p = path.join(x, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(d, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(d);
  return out;
};

beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ifs-loc-'))));
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('earlier data folders', () => {
  it('a new copy with no projects is offered the earlier folder that has them', () => {
    const old = dataDir('v0.1', ['prjA', 'prjB'], { files: { 'as1.png': 'PNG1' }, prefs: '{"theme":"light"}' });
    locations.remember(reg(), old);
    const fresh = dataDir('v0.2');
    const found = locations.earlierData(reg(), fresh);
    expect(found).toMatchObject({ path: path.resolve(old), projects: 2 });
    // a folder that has projects is never offered anything
    expect(locations.earlierData(reg(), old)).toBeNull();
  });

  it('copying brings projects, images and settings, and leaves the earlier folder exactly as it was', () => {
    const old = dataDir('v0.1', ['prjA', 'prjB'], { files: { 'as1.png': 'PNG1', 'as2.png': 'PNG2' }, prefs: '{"theme":"light"}' });
    const before = snapshot(old);
    const fresh = dataDir('v0.2');
    const r = locations.copyEarlier(old, fresh);
    expect(r.projects).toBe(2);
    expect(snapshot(old)).toEqual(before);
    expect(fs.readFileSync(path.join(fresh, 'projects', '_files', 'as2.png'), 'utf8')).toBe('PNG2');
    expect(fs.readFileSync(path.join(fresh, 'settings', 'preferences.json'), 'utf8')).toBe('{"theme":"light"}');
    expect(fs.readdirSync(fresh).some((n) => n.startsWith('.copy-in-progress'))).toBe(false);
  });

  it('never replaces: a folder with projects refuses, and its own settings are kept', () => {
    const old = dataDir('v0.1', ['prjA'], { prefs: '{"theme":"light"}' });
    const busy = dataDir('busy', ['prjMine']);
    expect(() => locations.copyEarlier(old, busy)).toThrow(/already has projects/);
    const fresh = dataDir('v0.2', [], { prefs: '{"theme":"dark"}' });
    locations.copyEarlier(old, fresh);
    expect(fs.readFileSync(path.join(fresh, 'settings', 'preferences.json'), 'utf8')).toBe('{"theme":"dark"}');
  });

  it('"Don\'t ask again" is remembered for that folder', () => {
    const old = dataDir('v0.1', ['prjA']);
    locations.remember(reg(), old);
    const fresh = dataDir('v0.2');
    locations.decline(reg(), fresh, old);
    expect(locations.earlierData(reg(), fresh)).toBeNull();
  });

  it('a damaged or missing list never stops the app', () => {
    fs.mkdirSync(path.dirname(reg()), { recursive: true });
    fs.writeFileSync(reg(), '{oops');
    const fresh = dataDir('v0.2');
    expect(locations.earlierData(reg(), fresh)).toBeNull();
    expect(locations.remember(reg(), fresh).locations).toHaveLength(1);
  });
});
