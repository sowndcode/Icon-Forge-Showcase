import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/defaults';
import { unzipProject } from '../src/services/formats';
import { remapIds } from '../src/state/project';

describe('unzipProject', () => {
  const zeros = new Uint8Array(1024 * 1024);

  it('unpacks the parts of a project and skips everything else', () => {
    const z = unzipProject(zipSync({ 'project.json': strToU8('{}'), 'assets/a.png': strToU8('png'), 'fonts/f': strToU8('ttf'), 'other.exe': strToU8('MZ') }));
    expect(Object.keys(z).sort()).toEqual(['assets/a.png', 'fonts/f', 'project.json']);
  });

  it('refuses an archive that unpacks past the limit', () => {
    const bomb = zipSync({ 'project.json': strToU8('{}'), 'assets/a': zeros, 'assets/b': zeros });
    expect(() => unzipProject(bomb, 1024 * 1024)).toThrow(/far more data/);
    expect(Object.keys(unzipProject(bomb, 3 * 1024 * 1024))).toHaveLength(3);
  });

  it('sets the default limit from the archive size, so a small file cannot unpack to gigabytes', () => {
    const big = new Uint8Array(300 * 1024 * 1024);
    expect(() => unzipProject(zipSync({ 'assets/a': big }))).toThrow(/far more data/);
    // the same data stored uncompressed, as the app saves images, opens fine
    expect(Object.keys(unzipProject(zipSync({ 'assets/a': [big, { level: 0 }] })))).toEqual(['assets/a']);
  }, 60_000); // deflating 300 MB takes longer than the default 5 s on slower machines

  it('counts a stored entry by its real size even if its header claims less', () => {
    const zip = zipSync({ 'assets/a': [zeros, { level: 0 }] });
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const eocd = zip.length - 22;
    const central = view.getUint32(eocd + 16, true);
    view.setUint32(central + 24, 1, true); // original size in the central directory
    expect(() => unzipProject(zip, 1000)).toThrow(/far more data/);
  });
});

describe('remapIds', () => {
  it('gives project files new ids and drops files the project does not use', () => {
    const doc = createProject('Test');
    doc.assets = [{ id: 'used' } as (typeof doc.assets)[number]];
    const blobs = new Map([['used', new Blob(['a'])], ['someone_elses_file', new Blob(['b'])]]);
    const out = remapIds(doc, blobs);
    expect([...blobs.keys()]).toEqual([out.assets[0].id]);
    expect(out.assets[0].id).not.toBe('used');
  });
});
