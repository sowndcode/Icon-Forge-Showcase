import './helpers/canvasStub';
import { describe, expect, it } from 'vitest';
import { createPage, createProject, createText } from '../src/core/defaults';
import { cleanWatermark, defaultLayer, layoutLayer, markBox, presetLayers, suggestAnchor, WATERMARK_PRESETS, wmAppliesTo, wmText } from '../src/core/watermark';
import type { ExportSettings, Page } from '../src/core/types';
import { exportOutputs } from '../src/services/exporter';
import { getDoc, loadDoc, redo, undo } from '../src/state/doc';
import { addLayer, getWatermark, updateLayer } from '../src/state/watermark';
import { remapIds, sanitizeDoc } from '../src/state/project';

const measure = (px: number) => px * 5; // a five-em line
const S: ExportSettings = { format: 'png', quality: 0.9, scale: 1, matte: '#ffffff', pattern: '{page}' };

describe('watermark layout', () => {
  it('nine-point anchors stay inside the margins', () => {
    const page = { width: 1000, height: 500 };
    for (const anchor of ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'] as const) {
      const [m] = layoutLayer(defaultLayer('text', { anchor, size: 0.04, margin: 0.04 }), page, measure, 1);
      const b = markBox(m);
      expect(b.x).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(980 + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(480 + 1e-6);
    }
  });

  it('scales with the page: same proportions on a cover and on a 4K screenshot', () => {
    const l = defaultLayer('text', { anchor: 'br' });
    const [a] = layoutLayer(l, { width: 630, height: 500 }, measure, 1);
    const [b] = layoutLayer(l, { width: 3840, height: 2160 }, measure, 1);
    expect(a.h / 500).toBeCloseTo(b.h / 2160, 6);
    expect((630 - a.x) / 500).toBeCloseTo((3840 - b.x) / 2160, 6);
  });

  it('repeated patterns cover the page and stay bounded', () => {
    const l = defaultLayer('text', { mode: 'tile', size: 0.01, tile: { gapX: 0.1, gapY: 0.1, angle: -30, stagger: true } });
    const marks = layoutLayer(l, { width: 3840, height: 2160 }, measure, 1);
    expect(marks.length).toBeGreaterThan(50);
    expect(marks.length).toBeLessThanOrEqual(1000);
    const xs = marks.map((m) => m.x),
      ys = marks.map((m) => m.y);
    expect(Math.min(...xs)).toBeLessThan(100);
    expect(Math.max(...xs)).toBeGreaterThan(3740);
    expect(Math.min(...ys)).toBeLessThan(100);
    expect(Math.max(...ys)).toBeGreaterThan(2060);
  });

  it('per-icon marks sit inside each icon', () => {
    const icons = [
      { x: 100, y: 100, w: 200, h: 200 },
      { x: 400, y: 50, w: 80, h: 120 },
    ];
    const marks = layoutLayer(defaultLayer('image', { mode: 'icon', iconSize: 0.25, anchor: 'br' }), { width: 600, height: 400 }, measure, 1, icons);
    expect(marks).toHaveLength(2);
    marks.forEach((m, i) => {
      const b = markBox(m),
        ic = icons[i];
      expect(b.x).toBeGreaterThanOrEqual(ic.x);
      expect(b.x + b.w).toBeLessThanOrEqual(ic.x + ic.w + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(ic.y + ic.h + 1e-6);
    });
  });

  it('tokens are filled in', () => {
    expect(wmText('© {year} {brand} · {page}', { year: '2026', brand: 'Studio', page: 'Cover' })).toBe('© 2026 Studio · Cover');
  });

  it('smart placement avoids the title', () => {
    const page: Page = createPage('P', 1000, 600);
    const l = defaultLayer('text', { size: 0.05 });
    // a wide title along the bottom: the suggestion moves away from the bottom edge
    const anchor = suggestAnchor(l, page, measure, 1, { text: [{ x: 0, y: 480, w: 1000, h: 120 }], icons: [] });
    expect(anchor.startsWith('b')).toBe(false);
    expect(suggestAnchor(l, page, measure, 1, { text: [], icons: [] })).toBe('br');
  });
});

describe('watermark scope, project data and undo', () => {
  it('page scope: all but excluded, or only listed', () => {
    const w = { enabled: true, layers: [defaultLayer()], scope: 'all' as const, pageIds: ['b'] };
    expect(wmAppliesTo(w, 'a')).toBe(true);
    expect(wmAppliesTo(w, 'b')).toBe(false);
    expect(wmAppliesTo({ ...w, scope: 'only' }, 'b')).toBe(true);
    expect(wmAppliesTo({ ...w, scope: 'only' }, 'a')).toBe(false);
    expect(wmAppliesTo({ ...w, enabled: false }, 'a')).toBe(false);
    expect(wmAppliesTo({ ...w, layers: [{ ...defaultLayer(), visible: false }] }, 'a')).toBe(false);
  });

  it('older projects open with no watermark; saved ones round-trip', () => {
    const d = createProject('Old');
    expect(sanitizeDoc(JSON.parse(JSON.stringify(d))).watermark).toBeUndefined();
    const w = { enabled: true, layers: [defaultLayer('image', { assetId: 'asLogo' })], scope: 'only' as const, pageIds: [d.pages[0].id] };
    const back = sanitizeDoc(JSON.parse(JSON.stringify({ ...d, watermark: w })));
    expect(back.watermark).toEqual(cleanWatermark(w));
  });

  it('opening a .showcase file remaps the logo id with the other assets', () => {
    const d = createProject('File');
    d.assets = [{ id: 'asLogo', name: 'logo.png', format: 'png', kind: 'watermark', folder: '', category: '', width: 100, height: 50, bytes: 10, importIndex: 0, addedAt: 1, status: 'ready' }];
    d.watermark = { enabled: true, layers: [defaultLayer('image', { assetId: 'asLogo' })], scope: 'all', pageIds: [] };
    const out = remapIds(d, new Map());
    expect(out.watermark!.layers[0].assetId).toBe(out.assets[0].id);
    expect(out.assets[0].id).not.toBe('asLogo');
  });

  it('watermark edits are undoable and never touch pages', () => {
    const d = createProject('Undo');
    d.pages[0].objects = [createText('Title', 100, 100)];
    loadDoc(d);
    const pages = getDoc().pages;
    const l = addLayer('text');
    updateLayer(l.id, { opacity: 0.3 });
    expect(getWatermark().layers[0].opacity).toBe(0.3);
    expect(getDoc().pages).toBe(pages);
    undo();
    expect(getWatermark().layers[0].opacity).toBe(0.75);
    undo();
    expect(getWatermark().layers).toHaveLength(0);
    redo();
    redo();
    expect(getWatermark().layers[0].opacity).toBe(0.3);
  });

  it('presets give fresh layers and logos where asked', () => {
    for (const p of WATERMARK_PRESETS) {
      const a = presetLayers(p, 'asLogo'),
        b = presetLayers(p, 'asLogo');
      expect(a.length).toBe(p.layers.length);
      expect(a[0].id).not.toBe(b[0].id);
      for (const l of a) if (l.kind === 'image') expect(l.assetId).toBe('asLogo');
    }
  });
});

describe('export with watermarks', () => {
  const doc = createProject('Pack');
  const p1 = { ...createPage('Cover', 630, 500) },
    p2 = { ...createPage('Catalog', 1920, 1080) };
  doc.pages = [p1, p2];
  const wm = { watermark: { enabled: true, layers: [defaultLayer()], scope: 'all' as const, pageIds: [p2.id] }, vars: {} };

  it('both: a clean and a preview file for watermarked pages, never the same name', () => {
    const outs = exportOutputs(doc, [p1, p2], { ...S, watermark: 'both' }, wm);
    expect(outs.map((o) => [o.name, o.watermarked])).toEqual([
      ['Cover.png', false],
      ['Cover_preview.png', true],
      ['Catalog.png', false],
    ]);
  });

  it('none exports clean files; project follows the scope', () => {
    expect(exportOutputs(doc, [p1, p2], { ...S, watermark: 'none' }, wm).every((o) => !o.watermarked)).toBe(true);
    expect(exportOutputs(doc, [p1, p2], { ...S, watermark: 'project' }, wm).map((o) => o.watermarked)).toEqual([true, false]);
  });

  it('a page called like the preview of another keeps a distinct name', () => {
    const p3 = createPage('Cover_preview', 630, 500);
    const outs = exportOutputs({ ...doc, pages: [p1, p3] }, [p1, p3], { ...S, watermark: 'both' }, { ...wm, watermark: { ...wm.watermark, pageIds: [] } });
    const names = outs.map((o) => o.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
