import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createPage, createShape, createText, createImage, defaultBackground } from '../src/core/defaults';
import { cleanThemeData, decodeShareCode, encodeShareCode, ShareCodeError, stableJson, uniqueName, type CustomThemeData, type CustomTemplateData } from '../src/core/shareCode';
import type { TextObject } from '../src/core/types';

const ALGS = new Set(['grid', 'cluster', 'scatter']);
const theme = (): CustomThemeData => ({
  blurb: 'Gold on purple',
  bg: { ...defaultBackground(), type: 'radial', color: '#120a24', gradient: { ...defaultBackground().gradient, stops: [{ offset: 0, color: '#3b2a6e' }, { offset: 1, color: '#0e0a1f' }] } },
  title: { fontFamily: 'Georgia', fontWeight: 700, fill: '#fff4cf', fillMode: 'gradient', fill2: '#d99b2b', stroke: { enabled: true, color: '#2a1606', width: 6 } },
  sub: '#e9d8a6',
  accent: '#d99b2b',
  accent2: '#9a6412',
  accentText: '#1d1004',
});
const template = (): CustomTemplateData => {
  const page = createPage('Cover', 630, 500);
  page.objects = [createShape('rect', 315, 80, 500, 120, { fill: '#111111', name: 'Panel' }), createText('MY PACK', 315, 80, { fontSize: 60 }), createImage('as_private', 'secret.png', 10, 10, 10, 10)];
  page.background = { ...page.background, image: { ...page.background.image, assetId: 'as_private' } };
  page.templateLayout = { algorithm: 'grid', params: { columns: 4, rows: 2 }, seed: 7, overlap: 'strict', maxOverlap: 0.3, avoidFocal: true, respectSafe: true, slots: [{ cx: 0.2, cy: 0.6, w: 0.1, h: 0.1, rot: 0 }] };
  page.exportName = 'C:\\Users\\someone\\private';
  page.fromTemplate = { id: 'square', assetIds: ['as_private'] };
  return { page };
};
/** Build a code from any JSON, for malformed-input tests. */
const raw = (json: unknown, head = 'IFS1-THEME-') => {
  const b = deflateSync(new TextEncoder().encode(typeof json === 'string' ? json : JSON.stringify(json)));
  return head + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

describe('share codes', () => {
  it('round-trips a theme exactly', () => {
    const code = encodeShareCode('theme', 'Royal', theme());
    expect(code).toMatch(/^IFS1-THEME-[A-Za-z0-9_-]+$/);
    const back = decodeShareCode(code, ALGS);
    expect(back.kind).toBe('theme');
    expect(back.name).toBe('Royal');
    const d = back.data as CustomThemeData;
    expect(d.title).toEqual(theme().title);
    expect(d.accent).toBe('#d99b2b');
    expect(d.bg.gradient.stops).toEqual(theme().bg.gradient.stops);
  });

  it('is deterministic and survives whitespace from chat apps', () => {
    const a = encodeShareCode('theme', 'Royal', theme());
    expect(encodeShareCode('theme', 'Royal', { ...theme() })).toBe(a);
    const wrapped = a.match(/.{1,40}/g)!.join('\n  ');
    expect(decodeShareCode(`  ${wrapped}\n`, ALGS).name).toBe('Royal');
  });

  it('keeps a template design and leaves project content and paths out', () => {
    const code = encodeShareCode('template', 'Cover', template());
    const back = decodeShareCode(code, ALGS);
    const page = (back.data as CustomTemplateData).page;
    expect(page.width).toBe(630);
    expect(page.objects.map((o) => o.type)).toEqual(['shape', 'text']); // the image stays home
    expect((page.objects[1] as TextObject).text).toBe('MY PACK');
    expect(page.templateLayout?.algorithm).toBe('grid');
    expect(page.templateLayout?.slots?.length).toBe(1);
    expect(page.background.image.assetId).toBeUndefined();
    expect(page.exportName).toBeUndefined();
    expect(page.fromTemplate).toBeUndefined();
    const json = stableJson(page);
    expect(json).not.toContain('as_private');
    expect(json).not.toContain('Users');
    expect(back.notes.some((n) => n.startsWith('Fonts:'))).toBe(true);
  });

  it('gives imported objects fresh ids', () => {
    const t = template();
    const back = decodeShareCode(encodeShareCode('template', 'x', t), ALGS).data as CustomTemplateData;
    expect(back.page.objects[0].id).not.toBe(t.page.objects[0].id);
    expect(back.page.id).not.toBe(t.page.id);
  });

  it('refuses things that are not share codes, with a readable reason', () => {
    for (const bad of ['', 'hello', 'IFS1-THEME-', 'IFS1-THEME-!!!', 'IFS1-WIDGET-abc', 'IFS1-THEME-' + 'A'.repeat(50)]) {
      expect(() => decodeShareCode(bad, ALGS)).toThrow(ShareCodeError);
    }
  });

  it('refuses codes from a newer format with an update hint', () => {
    expect(() => decodeShareCode(encodeShareCode('theme', 'x', theme()).replace('IFS1', 'IFS9'), ALGS)).toThrow(/newer version/);
  });

  it('refuses malformed contents', () => {
    expect(() => decodeShareCode(raw('not json'), ALGS)).toThrow(/not readable/);
    expect(() => decodeShareCode(raw({ v: 1, kind: 'template', name: 'x', data: {} }), ALGS)).toThrow(/header/); // kind mismatch
    expect(() => decodeShareCode(raw({ v: 1, kind: 'theme', name: 'x', data: { ...theme(), accent: 'url(javascript:alert(1))' } }), ALGS)).toThrow(ShareCodeError);
    expect(() => decodeShareCode(raw({ v: 1, kind: 'theme', name: 'x', data: { ...theme(), title: { fontSize: 1e12 } } }), ALGS)).toThrow(ShareCodeError);
    expect(() => decodeShareCode(raw({ v: 1, kind: 'theme', name: 'x', data: { ...theme(), bg: { ...theme().bg, overlay: { blend: 'evil' } } } }), ALGS)).toThrow(ShareCodeError);
  });

  it('never lets __proto__ or unknown keys through', () => {
    const json = `{"v":1,"kind":"theme","name":"p","data":{"__proto__":{"polluted":true},"constructor":{"x":1},"accent":"#fff","accent2":"#fff","accentText":"#000","sub":"#fff","title":{"__proto__":{"polluted":true},"fill":"#fff"},"bg":{"type":"solid","color":"#000"},"extra":"x"}}`;
    const d = decodeShareCode(raw(json), ALGS).data as CustomThemeData & Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(d, '__proto__')).toBe(false);
    expect(d.extra).toBeUndefined();
    expect(d.title).toEqual({ fill: '#fff' });
  });

  it('refuses a layout this version does not have', () => {
    const t = template();
    t.page.templateLayout!.algorithm = 'notALayout';
    expect(() => decodeShareCode(encodeShareCode('template', 'x', t), ALGS)).toThrow(/layout this version/);
  });

  it('refuses a code that unpacks to a huge payload (zip bomb)', () => {
    const big = `{"v":1,"kind":"theme","name":"${'a'.repeat(5_000_000)}"}`;
    expect(() => decodeShareCode(raw(big), ALGS)).toThrow(/far more data/);
  });

  it('refuses deeply nested data', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 60; i++) deep = [deep];
    expect(() => decodeShareCode(raw({ v: 1, kind: 'theme', name: 'x', data: deep }), ALGS)).toThrow(/nested/);
  });

  it('turns an image background into its base colour and says so', () => {
    const t = theme();
    t.bg = { ...t.bg, type: 'image', image: { ...t.bg.image, assetId: 'as1' } };
    const back = decodeShareCode(encodeShareCode('theme', 'x', t), ALGS);
    expect((back.data as CustomThemeData).bg.type).toBe('solid');
    expect(back.notes[0]).toMatch(/background image/);
  });

  it('cleans stored theme data and rejects damaged entries', () => {
    expect(cleanThemeData(theme())?.accent).toBe('#d99b2b');
    expect(cleanThemeData({ accent: 5 })).toBeNull();
    expect(cleanThemeData(null)).toBeNull();
  });

  it('numbers duplicate names', () => {
    expect(uniqueName('Royal', ['royal', 'Royal 2'])).toBe('Royal 3');
    expect(uniqueName('Fresh', ['Royal'])).toBe('Fresh');
  });
});
