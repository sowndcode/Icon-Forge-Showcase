import { describe, expect, it } from 'vitest';
import { categoryFromDir, prettyName } from '../src/services/formats';

// The folder/file convention recommended for preparing packs (one root folder, one level of categories).
describe('pack naming convention', () => {
  it('reads category folders (pack root dropped as a single folder)', () => {
    expect(categoryFromDir('Halloween/01_Characters', 1)).toBe('Characters');
    expect(categoryFromDir('Halloween/03_Candy_and_Treats', 1)).toBe('Candy and Treats');
    expect(categoryFromDir('Halloween/02_Cute_Monsters', 1)).toBe('Cute Monsters');
    expect(categoryFromDir('Sci_Fi_UI/04-Buttons', 1)).toBe('Buttons');
  });
  it('files directly in the pack root get no category', () => {
    expect(categoryFromDir('Halloween', 1)).toBe('');
  });
  it('deeper nesting uses the deepest folder', () => {
    expect(categoryFromDir('Halloween/Weapons/Swords', 1)).toBe('Swords');
  });
  it('category folders dropped one by one still work', () => {
    expect(categoryFromDir('01_Characters', 3)).toBe('Characters');
  });
  it('turns numbered file names into labels', () => {
    expect(prettyName('03_evil_pumpkin.png')).toBe('Evil Pumpkin');
    expect(prettyName('01_jack_o_lantern.webp')).toBe('Jack O Lantern');
    expect(prettyName('12_health_potion.PNG')).toBe('Health Potion');
  });
  it('sorts numbered names numerically', () => {
    const names = ['10_c.png', '02_b.png', '1_a.png', '100_d.png'];
    expect(names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))).toEqual(['1_a.png', '02_b.png', '10_c.png', '100_d.png']);
  });
});

import { createPage, createProject, DEFAULT_EXPORT } from '../src/core/defaults';
import { batchNames, withSuffix, zipNameFor, fileNameFor } from '../src/services/exporter';
import { numberedName } from '../src/services/native';

describe('export file names', () => {
  const doc = { ...createProject('Halloween Icons'), pages: [createPage('Cover', 630, 500), createPage('Cover', 1920, 1080), createPage('Catalog', 1080, 1080)] };
  it('fills tokens and keeps capitalisation', () => {
    expect(fileNameFor('{project}_{page}', doc, doc.pages[0], 0, DEFAULT_EXPORT)).toBe('Halloween_Icons_Cover.png');
    expect(fileNameFor('{index}-{w}x{h}', doc, doc.pages[1], 1, { ...DEFAULT_EXPORT, format: 'jpeg' })).toBe('02-1920x1080.jpg');
    expect(fileNameFor('{date}', doc, doc.pages[0], 0, DEFAULT_EXPORT, new Date(2026, 9, 22))).toBe('2026-10-22.png');
  });
  it('strips characters Windows does not allow', () => {
    expect(fileNameFor('a/b:c*?', doc, doc.pages[0], 0, DEFAULT_EXPORT)).toBe('a_b_c.png');
    expect(fileNameFor('   ', doc, doc.pages[0], 0, DEFAULT_EXPORT)).toBe('Halloween_Icons_Cover.png');
  });
  it('never gives two pages of one batch the same name', () => {
    expect(batchNames(doc, doc.pages, DEFAULT_EXPORT)).toEqual(['Halloween_Icons_Cover.png', 'Halloween_Icons_Cover_2.png', 'Halloween_Icons_Catalog.png']);
  });
  it('never produces device names, control characters or overlong names', () => {
    const page = (name: string) => ({ ...doc.pages[0], name });
    expect(fileNameFor('{page}', doc, page('NUL'), 0, DEFAULT_EXPORT)).toBe('_NUL.png');
    expect(fileNameFor('{page}', doc, page('con.backup'), 0, DEFAULT_EXPORT)).toBe('_con.backup.png');
    expect(fileNameFor('{page}', doc, page('Icon'), 0, DEFAULT_EXPORT)).toBe('Icon.png');
    expect(fileNameFor('{page}', doc, page('a\u0001b\u007f'), 0, DEFAULT_EXPORT)).toBe('a_b.png');
    expect(fileNameFor('{page}', doc, page('x'.repeat(400)), 0, DEFAULT_EXPORT).length).toBeLessThanOrEqual(154);
    expect(zipNameFor({ ...doc, name: 'AUX' })).toBe('_AUX_images.zip');
    expect(withSuffix('cover.png', '/../\u0000x')).toBe('cover_.._x.png');
  });
  it('numbers names before the extension', () => {
    expect(numberedName('cover.png', 3)).toBe('cover_3.png');
  });
});
