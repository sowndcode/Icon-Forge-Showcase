// Share Codes: a custom theme or template as a line of text people can paste to each other.
//
//   IFS1-THEME-<base64url(deflate(json))>      IFS1-TEMPLATE-<…>
//
// The JSON is { v: 1, kind, name, data } with keys written in sorted order and numbers rounded, so the
// same configuration always gives the same code. Nothing else goes in: no project content, asset files,
// file paths, ids or user details. Decoding treats the text as hostile:
//   - size limits on the code, the unpacked JSON, nesting, lists and strings
//   - every value is checked against a whitelist schema and rebuilt into a fresh object (unknown keys
//     are dropped, so `__proto__` & co. can never reach an object merge)
//   - no code is ever run; colours, fonts and enums are checked by pattern
// Works fully offline (fflate is bundled).

import { deflateSync, Inflate } from 'fflate';
import type { Background, BgPattern, GradientStop, LayoutPresetData, Page, SceneObject, ShadowStyle, ShapeObject, TextBadge, TextObject, TextStyle } from './types';
import { createPage, defaultBackground, defaultFocal, defaultSafeZone, defaultTextStyle } from './defaults';
import { uid } from './ids';

export const SHARE_VERSION = 1;
const PREFIX = 'IFS';
export const MAX_CODE_LENGTH = 400_000;
const MAX_JSON_BYTES = 2_000_000;
const MAX_DEPTH = 24;
const MAX_OBJECTS = 600;

export type ShareKind = 'theme' | 'template';

/** A theme as plain data (built-in themes compute their background; a saved one stores it). */
export interface CustomThemeData {
  blurb: string;
  bg: Background;
  title: Partial<TextStyle>;
  sub: string;
  accent: string;
  accent2: string;
  accentText: string;
}

export interface CustomTemplateData {
  page: Page;
}

export interface SharedItem<T = CustomThemeData | CustomTemplateData> {
  kind: ShareKind;
  name: string;
  data: T;
  /** Things the code cannot carry, for the import preview (missing background image, fonts…). */
  notes: string[];
}

export class ShareCodeError extends Error {}
const fail = (msg: string): never => {
  throw new ShareCodeError(msg);
};

// ---------------------------------------------------------------------------
// Validators: each returns a clean copy of a value or throws ShareCodeError
// ---------------------------------------------------------------------------

type V<T> = (v: unknown, at: string) => T;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num =
  (min: number, max: number): V<number> =>
  (v, at) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(`${at} must be a number from ${min} to ${max}`);
const int = (min: number, max: number): V<number> => (v, at) => (Number.isInteger(v) ? num(min, max)(v, at) : fail(`${at} must be a whole number`));
const bool: V<boolean> = (v, at) => (typeof v === 'boolean' ? v : fail(`${at} must be true or false`));
const str =
  (max: number, re?: RegExp): V<string> =>
  (v, at) =>
    typeof v === 'string' && v.length <= max && (!re || re.test(v)) ? v : fail(`${at} is not valid text`);
const oneOf =
  <T extends string>(...list: T[]): V<T> =>
  (v, at) =>
    list.includes(v as T) ? (v as T) : fail(`${at} has an unknown value`);
const arr =
  <T>(item: V<T>, max: number): V<T[]> =>
  (v, at) =>
    Array.isArray(v) && v.length <= max ? v.map((x, i) => item(x, `${at}[${i}]`)) : fail(`${at} must be a list of at most ${max}`);

/** #rgb, #rrggbb(aa), rgb()/rgba()/hsl()/hsla() or a plain colour name — never url(), expressions or markup. */
export const color: V<string> = str(64, /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(\s*[-\d.%\s,/deg]+\)|[a-z]{3,24})$/i);
const fontFamily: V<string> = str(100, /^[\p{L}\p{N} _.,'"-]+$/u);
const name: V<string> = (v, at) => {
  const s = str(120)(v, at).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return s || fail(`${at} is empty`);
};

/** Pick only the listed keys, each checked; `req` keys must be present. Returns a brand new object. */
function obj<T>(shape: { [K in keyof T]-?: V<T[K]> }, req: (keyof T)[] = []): V<T> {
  return (v, at) => {
    if (!isObj(v)) return fail(`${at} must be an object`);
    const out = {} as T;
    for (const k of Object.keys(shape) as (keyof T)[]) {
      const val = Object.prototype.hasOwnProperty.call(v, k) ? v[k as string] : undefined;
      if (val === undefined || val === null) {
        if (req.includes(k)) fail(`${at}.${String(k)} is missing`);
        continue;
      }
      out[k] = shape[k](val, `${at}.${String(k)}`);
    }
    return out;
  };
}

const shadow = obj<ShadowStyle>({ enabled: bool, color, blur: num(0, 2000), dx: num(-5000, 5000), dy: num(-5000, 5000), opacity: num(0, 1) }, ['enabled', 'color']);
const strokeV = obj<{ enabled: boolean; color: string; width: number }>({ enabled: bool, color, width: num(0, 2000) }, ['enabled', 'color', 'width']);
const glow = obj<{ enabled: boolean; color: string; blur: number; opacity: number }>({ enabled: bool, color, blur: num(0, 2000), opacity: num(0, 1) }, ['enabled', 'color']);
const extrude = obj<{ enabled: boolean; color: string; depth: number; angle: number }>({ enabled: bool, color, depth: num(0, 2000), angle: num(-3600, 3600) }, ['enabled', 'color']);
const badge = obj<TextBadge>(
  { enabled: bool, shape: oneOf('rect', 'pill', 'circle', 'burst', 'ribbon', 'slant', 'tag'), color, color2: color, gradient: bool, padX: num(0, 5000), padY: num(0, 5000), radius: num(0, 5000), stroke: strokeV, points: int(3, 64) },
  ['enabled', 'shape', 'color'],
);

/** Every text style field; a theme's title look and template text both use it. */
const textStyleShape: { [K in keyof TextStyle]-?: V<TextStyle[K]> } = {
  fontFamily,
  fontSize: num(1, 5000),
  fontWeight: int(100, 1000),
  italic: bool,
  align: oneOf('left', 'center', 'right'),
  letterSpacing: num(-500, 2000),
  lineHeight: num(0.3, 5),
  uppercase: bool,
  fill: color,
  stroke: strokeV,
  shadow,
  fillMode: oneOf('solid', 'gradient'),
  fill2: color,
  gradientAngle: num(-3600, 3600),
  stroke2: strokeV,
  glow,
  extrude,
  curve: num(-1, 1),
  badge,
  pixel: num(0, 500),
};
const partialTextStyle = obj<Partial<TextStyle>>(textStyleShape as { [K in keyof Partial<TextStyle>]-?: V<Partial<TextStyle>[K]> });
const fullTextStyle: V<TextStyle> = (v, at) => ({ ...defaultTextStyle(), ...partialTextStyle(v, at) });

const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const;

const pattern = obj<BgPattern>(
  { enabled: bool, kind: oneOf('dots', 'grid', 'diagonal', 'checker', 'rays', 'halftone', 'waves', 'stars', 'confetti', 'bokeh', 'noise'), color, color2: color, color3: color, opacity: num(0, 1), scale: num(0.01, 100), angle: num(-3600, 3600), cx: num(-10, 10), cy: num(-10, 10), seed: int(0, 2 ** 31) },
  ['enabled', 'kind', 'color'],
);

/** A background with every part filled in; an image never travels (it belongs to its project). */
const background: V<Background> = (v, at) => {
  const d = defaultBackground();
  const b = obj<{ type: Background['type']; color: string; gradient: Partial<Background['gradient']>; image: Partial<Background['image']>; overlay: Partial<Background['overlay']>; pattern: BgPattern; light: Partial<Background['light']>; vignette: Partial<Background['vignette']> }>(
    {
      type: oneOf('transparent', 'solid', 'linear', 'radial', 'mesh', 'image'),
      color,
      gradient: obj<Background['gradient']>({ stops: arr(obj<GradientStop>({ offset: num(0, 1), color }, ['offset', 'color']), 16), angle: num(-3600, 3600), cx: num(-10, 10), cy: num(-10, 10), radius: num(0, 100) }),
      image: obj<Omit<Background['image'], 'assetId'>>({ fit: oneOf('fit', 'fill', 'stretch', 'center', 'tile'), scale: num(0.01, 100), offsetX: num(-100, 100), offsetY: num(-100, 100), rotation: num(-3600, 3600), blur: num(0, 1000), brightness: num(-100, 100), contrast: num(-100, 100), saturation: num(-100, 100), opacity: num(0, 1) }),
      overlay: obj<Background['overlay']>({ enabled: bool, color, opacity: num(0, 1), blend: oneOf(...BLENDS) }),
      pattern,
      light: obj<Background['light']>({ enabled: bool, color, x: num(-10, 10), y: num(-10, 10), size: num(0, 100), strength: num(0, 10) }),
      vignette: obj<Background['vignette']>({ enabled: bool, strength: num(0, 10), color }),
    },
    ['type', 'color'],
  )(v, at);
  return {
    type: b.type,
    color: b.color,
    gradient: { ...d.gradient, ...b.gradient, stops: b.gradient?.stops?.length ? b.gradient.stops : d.gradient.stops },
    image: { ...d.image, ...b.image, assetId: undefined },
    overlay: { ...d.overlay, ...b.overlay },
    pattern: b.pattern ?? d.pattern,
    light: { ...d.light, ...b.light },
    vignette: { ...d.vignette, ...b.vignette },
  };
};

const themeData = obj<CustomThemeData>({ blurb: str(200), bg: background, title: partialTextStyle, sub: color, accent: color, accent2: color, accentText: color }, ['bg', 'title', 'sub', 'accent', 'accent2', 'accentText']);

// --- template pages: text and shapes only, plus the layout waiting for icons ---

const base = { name: str(120), x: num(-1e5, 1e5), y: num(-1e5, 1e5), w: num(0, 1e5), h: num(0, 1e5), rotation: num(-3600, 3600), flipX: bool, flipY: bool, opacity: num(0, 1), hidden: bool, locked: bool };
const SHAPES = ['rect', 'ellipse', 'line', 'star', 'triangle', 'arrow', 'burst', 'heart', 'diamond', 'pentagon', 'hexagon', 'octagon', 'ring', 'plus', 'bubble', 'shield', 'ribbon', 'semicircle', 'parallelogram', 'bolt', 'moon', 'chevron'] as const;
const textObj = obj<Omit<TextObject, 'id' | 'type'>>({ ...base, text: str(2000), style: fullTextStyle } as never, ['x', 'y', 'w', 'h', 'text', 'style'] as never);
const shapeObj = obj<Omit<ShapeObject, 'id' | 'type'>>(
  {
    ...base,
    shape: oneOf(...SHAPES),
    fill: color,
    fillEnabled: bool,
    stroke: color,
    strokeWidth: num(0, 5000),
    radius: num(0, 1e5),
    blur: num(0, 5000),
    fill2: color,
    effect: obj({ enabled: bool, look: oneOf('silhouette', 'fade', 'grayscale', 'darken', 'blur'), amount: num(0, 1), color, scope: oneOf('area', 'whole'), targets: oneOf('icons', 'all') }, ['enabled', 'look', 'amount', 'color', 'scope', 'targets']),
  } as never,
  ['shape', 'x', 'y', 'w', 'h'] as never,
);

const sceneObject = (v: unknown, at: string): SceneObject | null => {
  if (!isObj(v)) return fail(`${at} must be an object`);
  const defaults = { rotation: 0, flipX: false, flipY: false, opacity: 1 };
  if (v.type === 'text') {
    const o = textObj(v, at) as Partial<TextObject>;
    return { ...defaults, ...o, id: uid('tx'), type: 'text', name: o.name || 'Text' } as TextObject;
  }
  if (v.type === 'shape') {
    const o = shapeObj(v, at) as Partial<ShapeObject>;
    return { fill: '#ffffff', fillEnabled: true, stroke: '#ffffff', strokeWidth: 0, radius: 0, ...defaults, ...o, id: uid('sh'), type: 'shape', name: o.name || 'Shape' } as ShapeObject;
  }
  return null; // images belong to the project they were placed in
};

const paramValue: V<number | boolean | string> = (v, at) => (typeof v === 'number' ? num(-1e6, 1e6)(v, at) : typeof v === 'boolean' ? v : str(64, /^[\w .-]*$/)(v, at));
const params: V<Record<string, number | boolean | string>> = (v, at) => {
  if (!isObj(v)) return fail(`${at} must be an object`);
  const keys = Object.keys(v);
  if (keys.length > 64) fail(`${at} has too many settings`);
  const out: Record<string, number | boolean | string> = {};
  for (const k of keys) {
    if (!/^[A-Za-z][\w]{0,40}$/.test(k)) fail(`${at} has an invalid setting name`);
    out[k] = paramValue(v[k], `${at}.${k}`);
  }
  return out;
};
const vec = obj<{ x: number; y: number }>({ x: num(-10, 10), y: num(-10, 10) }, ['x', 'y']);
const slot = obj<{ cx: number; cy: number; w: number; h: number; rot: number; depth: number }>({ cx: num(-10, 10), cy: num(-10, 10), w: num(0, 10), h: num(0, 10), rot: num(-3600, 3600), depth: num(0, 1) }, ['cx', 'cy', 'w', 'h']);

export function templateLayout(knownAlgorithms: ReadonlySet<string>): V<LayoutPresetData & { slots?: unknown[] }> {
  return (v, at) => {
    const t = obj<LayoutPresetData & { slots: { cx: number; cy: number; w: number; h: number; rot: number }[] }>(
      {
        algorithm: str(40, /^[a-z][\w-]*$/i),
        params,
        seed: int(0, 2 ** 31),
        overlap: oneOf('strict', 'relaxed', 'showcase'),
        maxOverlap: num(0, 1),
        avoidFocal: bool,
        respectSafe: bool,
        plane: (x, a) => arr(vec, 4)(x, a) as never,
        path: (x, a) => arr(vec, 400)(x, a),
        slots: (x, a) => arr(slot, 2000)(x, a).map((s) => ({ ...s, rot: (s as Partial<typeof s>).rot ?? 0 })),
      },
      ['algorithm'],
    )(v, at);
    if (!knownAlgorithms.has(t.algorithm)) fail(`${at} uses a layout this version doesn't have (${t.algorithm})`);
    if (t.plane && t.plane.length !== 4) fail(`${at}.plane must have four corners`);
    const d: LayoutPresetData = { algorithm: t.algorithm, params: {}, seed: 1, overlap: 'strict', maxOverlap: 0.3, avoidFocal: true, respectSafe: true };
    return Object.assign(d, t as Partial<typeof t>);
  };
}

function templatePage(knownAlgorithms: ReadonlySet<string>): V<Page> {
  return (v, at) => {
    if (!isObj(v)) return fail(`${at} must be an object`);
    const W = int(16, 16384)(v.width, `${at}.width`),
      H = int(16, 16384)(v.height, `${at}.height`);
    const list = Array.isArray(v.objects) ? v.objects : fail(`${at}.objects must be a list`);
    if (list.length > MAX_OBJECTS) fail(`the template has more than ${MAX_OBJECTS} objects`);
    const page = createPage(v.name === undefined ? 'Template' : name(v.name, `${at}.name`), W, H, v.background === undefined ? undefined : background(v.background, `${at}.background`));
    page.objects = list.map((o, i) => sceneObject(o, `${at}.objects[${i}]`)).filter((o): o is SceneObject => !!o);
    if (v.safeZone !== undefined) page.safeZone = { ...defaultSafeZone(), ...obj({ enabled: bool, top: num(0, 100), right: num(0, 100), bottom: num(0, 100), left: num(0, 100) })(v.safeZone, `${at}.safeZone`) };
    if (v.focal !== undefined) page.focal = { ...defaultFocal(W, H), ...obj({ enabled: bool, shape: oneOf('rect', 'ellipse'), x: num(-1e5, 1e5), y: num(-1e5, 1e5), w: num(0, 1e5), h: num(0, 1e5) })(v.focal, `${at}.focal`) };
    if (v.templateLayout !== undefined) page.templateLayout = templateLayout(knownAlgorithms)(v.templateLayout, `${at}.templateLayout`) as Page['templateLayout'];
    return page;
  };
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/** JSON with sorted keys and rounded numbers: the same data always gives the same text. */
export function stableJson(v: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) fail('the data is nested too deeply');
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : 'null';
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableJson(x, depth + 1)).join(',')}]`;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`;
  }
  return 'null';
}

const toB64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) fail('This code contains characters a share code never has. Copy it again in full.');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Inflate with a hard output limit, so a tiny code can't unpack into gigabytes. */
function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > limit) fail('The code unpacks to far more data than a theme or template has');
    parts.push(chunk);
  });
  try {
    inf.push(data, true);
  } catch (e) {
    if (e instanceof ShareCodeError) throw e;
    fail('The code is damaged or incomplete (it could not be unpacked). Copy it again in full.');
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** What goes into a template code: the page's design, nothing tied to the project or computer. */
export function shareablePage(p: Page): Record<string, unknown> {
  return {
    name: p.name,
    width: p.width,
    height: p.height,
    background: { ...p.background, image: { ...p.background.image, assetId: undefined } },
    objects: p.objects
      .filter((o) => o.type !== 'image')
      .map((o) => {
        // ids, groups, layout links and template bookkeeping stay home
        const { id: _id, groupId: _g, layoutId: _l, pinned: _p, tplKey: _k, depthMode: _dm, depth: _d, hero: _h, ...rest } = o as SceneObject & Record<string, unknown>;
        if (rest.type === 'text') delete rest.textEdited;
        return rest;
      }),
    safeZone: p.safeZone,
    focal: p.focal,
    templateLayout: p.templateLayout,
  };
}

export function encodeShareCode(kind: ShareKind, itemName: string, data: CustomThemeData | CustomTemplateData): string {
  const payload = kind === 'template' ? { page: shareablePage((data as CustomTemplateData).page) } : { ...(data as CustomThemeData), bg: { ...(data as CustomThemeData).bg, image: { ...(data as CustomThemeData).bg.image, assetId: undefined } } };
  const json = stableJson({ v: SHARE_VERSION, kind, name: itemName.slice(0, 120), data: payload });
  return `${PREFIX}${SHARE_VERSION}-${kind.toUpperCase()}-${toB64Url(deflateSync(new TextEncoder().encode(json), { level: 9 }))}`;
}

/**
 * Read a share code. Throws ShareCodeError with a sentence for the user when the code is damaged,
 * from a newer version, or not a share code at all. `knownAlgorithms` = layout ids this build has.
 */
export function decodeShareCode(input: string, knownAlgorithms: ReadonlySet<string>): SharedItem {
  const code = String(input).replace(/\s+/g, '');
  if (!code) fail('Paste a share code first');
  if (code.length > MAX_CODE_LENGTH) fail('This is far longer than a share code');
  const m = /^IFS(\d{1,3})-(THEME|TEMPLATE)-(.+)$/i.exec(code);
  if (!m) fail('This is not an Icon Forge Showcase share code (they start with “IFS1-”)');
  const version = Number(m![1]);
  if (version > SHARE_VERSION) fail(`This code was made by a newer version of Icon Forge Showcase (format ${version}). Update the app to import it.`);
  if (version < 1) fail('Unknown share code format');
  const kind = m![2].toLowerCase() as ShareKind;
  const bytes = inflateLimited(fromB64Url(m![3]), MAX_JSON_BYTES);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('The code is damaged (its contents are not readable)');
  }
  depthCheck(raw, 0);
  if (!isObj(raw) || raw.v !== version || raw.kind !== kind) fail('The code is damaged (its header does not match)');
  try {
    return readItem(raw as Record<string, unknown>, kind, knownAlgorithms);
  } catch (e) {
    if (e instanceof ShareCodeError && !/^[A-Z]/.test(e.message)) fail(`The code was damaged or edited by hand (${e.message})`);
    throw e;
  }
}

function readItem(r: Record<string, unknown>, kind: ShareKind, knownAlgorithms: ReadonlySet<string>): SharedItem {
  const itemName = name(r.name, 'name');
  const notes: string[] = [];
  if (kind === 'theme') {
    const data = themeData(r.data, 'theme');
    if (data.bg.type === 'image') {
      data.bg = { ...data.bg, type: 'solid' };
      notes.push('The theme used a background image, which is not part of a code. It uses its base colour instead.');
    }
    return { kind, name: itemName, data, notes };
  }
  if (!isObj(r.data)) fail('The code is damaged (no template inside)');
  const page = templatePage(knownAlgorithms)((r.data as Record<string, unknown>).page, 'template');
  if (page.background.type === 'image') {
    page.background = { ...page.background, type: 'solid' };
    notes.push('The template used a background image, which is not part of a code. It uses its base colour instead.');
  }
  const fonts = [...new Set(page.objects.filter((o): o is TextObject => o.type === 'text').map((o) => o.style.fontFamily))];
  if (fonts.length) notes.push(`Fonts: ${fonts.join(', ')}. Where one isn't installed, text uses a similar font.`);
  if (!page.templateLayout) notes.push('This template has no icon layout, only its background, text and shapes.');
  return { kind, name: itemName, data: { page }, notes };
}

function depthCheck(v: unknown, d: number) {
  if (d > MAX_DEPTH) fail('The code is damaged (nested too deeply)');
  if (Array.isArray(v)) for (const x of v) depthCheck(x, d + 1);
  else if (isObj(v)) for (const k of Object.keys(v)) depthCheck(v[k], d + 1);
}

/** Check stored custom theme data (presets.json can be edited or damaged): a clean copy, or null. */
export function cleanThemeData(v: unknown): CustomThemeData | null {
  try {
    const d = themeData(v, 'theme');
    return { ...d, blurb: (d as Partial<CustomThemeData>).blurb ?? '' };
  } catch {
    return null;
  }
}

/** "Name", then "Name 2", "Name 3"… so presets of one kind never share a name. */
export function uniqueName(want: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.trim().toLowerCase()));
  const base = want.trim() || 'Untitled';
  if (!used.has(base.toLowerCase())) return base;
  const stem = base.replace(/\s+\d+$/, '');
  for (let i = 2; ; i++) if (!used.has(`${stem} ${i}`.toLowerCase())) return `${stem} ${i}`;
}

