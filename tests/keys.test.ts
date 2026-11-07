import { describe, expect, it } from 'vitest';
import { parseShortcut } from '../src/ui/components/Keys';
import { SHORTCUTS } from '../src/ui/shortcuts';
import { middleTruncate } from '../src/ui/components/paths';

const show = (s: string) => parseShortcut(s).map((a) => a.keys.map((k) => (k.key ? `[${k.text}]` : k.text)).join('+') + (a.note ? ` (${a.note})` : ''));

describe('shortcut keycaps', () => {
  it('splits alternatives and keys', () => {
    expect(show('Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y')).toEqual(['[Ctrl]+[Z]', '[Ctrl]+[Shift]+[Z]', '[Ctrl]+[Y]']);
    expect(show('Ctrl+C / Ctrl+V / Ctrl+D')).toEqual(['[Ctrl]+[C]', '[Ctrl]+[V]', '[Ctrl]+[D]']);
  });
  it('mouse actions and notes are not keys', () => {
    expect(show('Shift+click')).toEqual(['[Shift]+click']);
    expect(show('Space + drag')).toEqual(['[Space]+drag']);
    expect(show('Ctrl (while dragging)')).toEqual(['[Ctrl] (while dragging)']);
    expect(show('Esc (twice)')).toEqual(['[Esc] (twice)']);
    expect(show('Ctrl+] / Ctrl+[')).toEqual(['[Ctrl]+[]]', '[Ctrl]+[[]']);
  });
  it('every listed shortcut parses into at least one key', () => {
    for (const [k] of SHORTCUTS) expect(parseShortcut(k).every((a) => a.keys.length > 0), k).toBe(true);
  });
});

describe('long folder paths', () => {
  it('keep the drive and the last folders, and fit', () => {
    const win = 'C:\\Users\\Someone\\Documents\\Very long folder name\\Projects in progress\\Icon Forge Showcase portable\\data';
    const out = middleTruncate(win);
    expect(out.length).toBeLessThanOrEqual(52);
    expect(out.startsWith('C:\\…\\')).toBe(true);
    expect(out.endsWith('\\data')).toBe(true);
    expect(middleTruncate('/home/me/app/data')).toBe('/home/me/app/data');
  });
});
