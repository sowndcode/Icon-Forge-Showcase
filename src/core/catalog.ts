// Catalog page builder: a clean grid of every asset, optional numbers, names and category headers.

import { createPage, createShape, createText, createImage } from './defaults';
import { uid } from './ids';
import { placeImageByVisibleBox } from './transform';
import type { AssetRecord, Background, CatalogSettings, Page, SceneObject } from './types';
import { prettyName } from '../services/formats';

export const DEFAULT_CATALOG: CatalogSettings = {
  columns: 0,
  spacing: 18,
  margin: 90,
  fill: 0.78,
  labels: true,
  numbers: true,
  headers: true,
  labelSize: 0.11,
  labelColor: '#e5e7eb',
  title: '',
  maxPerPage: 0,
  cellBackground: true,
  cellStyle: 'soft',
  cellColor: '#ffffff',
  headerColor: '#ffffff',
  subtitle: true,
};

/** One-click looks for the catalog dialog. */
export const CATALOG_STYLES: { name: string; settings: Partial<CatalogSettings>; background: string }[] = [
  { name: 'Dark', settings: { cellStyle: 'soft', cellColor: '#ffffff', labelColor: '#d6d9de', headerColor: '#ffffff' }, background: 'Charcoal' },
  { name: 'Cards', settings: { cellStyle: 'card', cellColor: '#2d3036', labelColor: '#e5e7eb', headerColor: '#7cb4ff' }, background: 'Ink' },
  { name: 'Clean', settings: { cellStyle: 'none', labelColor: '#c9ccd2', headerColor: '#ffffff' }, background: 'Graphite fade' },
  { name: 'Light', settings: { cellStyle: 'card', cellColor: '#ffffff', labelColor: '#3b3f46', headerColor: '#1f2328' }, background: 'Fog' },
  { name: 'Outline', settings: { cellStyle: 'outline', cellColor: '#5b6270', labelColor: '#d6d9de', headerColor: '#ffd23f' }, background: 'Slate' },
];

/** Rough brightness of a background, to pick a readable title color. */
function isLightBackground(bg: Background): boolean {
  const hex = bg.type === 'solid' || bg.type === 'image' ? bg.color : bg.gradient.stops[0]?.color ?? bg.color;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

interface Section {
  name: string;
  assets: AssetRecord[];
}

function sections(assets: AssetRecord[], headers: boolean): Section[] {
  if (!headers) return [{ name: '', assets }];
  const m = new Map<string, AssetRecord[]>();
  for (const a of assets) {
    const k = a.category || 'Uncategorized';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  }
  return [...m].map(([name, list]) => ({ name, assets: list }));
}

interface Plan {
  K: number; // section columns
  cols: number; // icons per row inside a section column
  cell: number;
  labelH: number;
  headerH: number;
  colW: number;
  gutter: number;
  columns: number[][]; // section indexes per section column
  height: number;
}

function sectionHeight(n: number, cols: number, cell: number, labelH: number, headerH: number, spacing: number) {
  const rows = Math.ceil(n / cols);
  return headerH + rows * (cell + labelH) + Math.max(0, rows - 1) * spacing;
}

/**
 * Choose how many section columns (K) and icons per row (cols) give the largest cells while
 * everything fits the page. Sections flow top-to-bottom, column by column, in order.
 */
function planLayout(secs: Section[], W: number, availH: number, s: CatalogSettings, hasHeaders: boolean): Plan {
  let best: Plan | null = null;
  const gutter = s.spacing * 4;
  for (let K = 1; K <= (hasHeaders ? Math.min(6, secs.length) : 1); K++) {
    const colW = (W - 2 * s.margin - gutter * (K - 1)) / K;
    const colsRange = s.columns ? [Math.max(1, Math.round(s.columns / K))] : Array.from({ length: 40 }, (_, i) => i + 1);
    for (const cols of colsRange) {
      const cell = (colW - s.spacing * (cols - 1)) / cols;
      if (cell < 8) break;
      const labelH = s.labels || s.numbers ? Math.max(12, cell * s.labelSize * 1.5) : 0;
      const headerH = hasHeaders ? Math.max(24, Math.min(cell * 0.32, 90)) : 0;
      const hs = secs.map((sec) => sectionHeight(sec.assets.length, cols, cell, labelH, headerH, s.spacing));
      // greedy balanced split into K columns, keeping order
      const total = hs.reduce((a, b) => a + b, 0) + s.spacing * 2 * (secs.length - 1);
      const target = total / K;
      const columns: number[][] = [[]];
      let acc = 0;
      hs.forEach((h, i) => {
        const cur = columns[columns.length - 1];
        if (cur.length && acc + h / 2 > target && columns.length < K) {
          columns.push([i]);
          acc = h;
        } else {
          cur.push(i);
          acc += h + (cur.length > 1 ? s.spacing * 2 : 0);
        }
      });
      const height = Math.max(...columns.map((c) => c.reduce((a, i, j) => a + hs[i] + (j ? s.spacing * 2 : 0), 0)));
      if (height <= availH && (!best || cell > best.cell)) best = { K, cols, cell, labelH, headerH, colW, gutter, columns, height };
    }
  }
  if (best) return best;
  // nothing fits: smallest sensible grid on one column
  const cols = 40;
  const colW = W - 2 * s.margin;
  const cell = (colW - s.spacing * (cols - 1)) / cols;
  return { K: 1, cols, cell, labelH: 12, headerH: hasHeaders ? 24 : 0, colW, gutter: 0, columns: [secs.map((_, i) => i)], height: availH };
}

/**
 * Build catalog pages. Assets are numbered in order across pages. When maxPerPage is 0 the
 * column count is chosen so everything fits one page of the given size.
 */
export function buildCatalogPages(assets: AssetRecord[], s: CatalogSettings, size: { w: number; h: number }, bg: Background, baseName = 'Catalog'): Page[] {
  const chunks: AssetRecord[][] = [];
  if (s.maxPerPage > 0) for (let i = 0; i < assets.length; i += s.maxPerPage) chunks.push(assets.slice(i, i + s.maxPerPage));
  else chunks.push(assets);
  let number = 0;
  return chunks.map((chunk, pi) => {
    const page = createPage(chunks.length > 1 ? `${baseName} ${pi + 1}` : baseName, size.w, size.h, structuredClone(bg));
    const objects: SceneObject[] = [];
    const W = size.w,
      H = size.h;
    const titleH = s.title ? Math.min(W, H) * 0.07 : 0;
    const secs = sections(chunk, s.headers);
    const hasHeaders = s.headers && (secs.length > 1 || !!secs[0]?.name);
    const availH = H - 2 * s.margin - titleH;
    const plan = planLayout(secs, W, availH, s, hasHeaders);
    const y0 = s.margin + titleH + Math.max(0, (availH - plan.height) / 2);
    const style = s.cellStyle ?? (s.cellBackground ? 'soft' : 'none');
    const headerColor = s.headerColor ?? '#ffffff';
    if (s.title) {
      objects.push(createText(s.title, W / 2, s.margin + titleH * 0.32, { fontSize: titleH * 0.56, align: 'center', fontFamily: 'Segoe UI Black', fontWeight: 900, fill: isLightBackground(bg) ? '#16181d' : '#ffffff' }));
      if (s.subtitle !== false)
        objects.push(createText(`${assets.length} assets${chunks.length > 1 ? `  ·  page ${pi + 1} of ${chunks.length}` : ''}`, W / 2, s.margin + titleH * 0.78, { fontSize: titleH * 0.2, align: 'center', fontFamily: 'Segoe UI', fontWeight: 600, letterSpacing: titleH * 0.02, fill: s.labelColor, shadow: { enabled: false, color: '#000000', blur: 0, dx: 0, dy: 0, opacity: 0 } }));
    }
    const groupId = uid('grp');
    const noShadow = { enabled: false, color: '#000000', blur: 0, dx: 0, dy: 0, opacity: 0 };
    const gridW = plan.cols * plan.cell + (plan.cols - 1) * s.spacing;
    plan.columns.forEach((colSecs, k) => {
      const colX = s.margin + k * (plan.colW + plan.gutter) + (plan.colW - gridW) / 2;
      let y = y0;
      colSecs.forEach((si, j) => {
        const sec = secs[si];
        if (j) y += s.spacing * 2;
        if (plan.headerH) {
          const t = createText(`${sec.name.toUpperCase()}   ${sec.assets.length}`, colX + gridW / 2, y + plan.headerH * 0.42, { fontSize: plan.headerH * 0.5, align: 'left', fontFamily: 'Segoe UI', fontWeight: 700, letterSpacing: plan.headerH * 0.04, fill: headerColor, shadow: noShadow });
          t.w = gridW;
          t.name = 'Header ' + sec.name;
          objects.push(t);
          // thin divider under the header
          const rule = createShape('line', colX + gridW / 2, y + plan.headerH * 0.82, gridW, 0, { stroke: headerColor, strokeWidth: Math.max(1.5, plan.headerH * 0.04), opacity: 0.35, name: 'Header line' });
          objects.push(rule);
          y += plan.headerH;
        }
        sec.assets.forEach((a, i) => {
          const r = Math.floor(i / plan.cols),
            c = i % plan.cols;
          const cx = colX + c * (plan.cell + s.spacing) + plan.cell / 2;
          const top = y + r * (plan.cell + plan.labelH + s.spacing);
          number++;
          if (style !== 'none') {
            const color = s.cellColor ?? '#ffffff';
            const look =
              style === 'soft'
                ? { fill: color, opacity: 0.06 }
                : style === 'card'
                  ? { fill: color, opacity: 1, stroke: '#000000', strokeWidth: 0 }
                  : { fillEnabled: false, stroke: color, strokeWidth: Math.max(1.5, plan.cell * 0.012), opacity: 1 };
            const bgShape = createShape('rect', cx, top + (plan.cell + plan.labelH) / 2, plan.cell, plan.cell + plan.labelH, { radius: plan.cell * 0.08, name: 'Cell', ...look });
            bgShape.groupId = groupId;
            objects.push(bgShape);
          }
          const img = createImage(a.id, a.name.replace(/\.[^.]+$/, ''), cx, top + plan.cell / 2, a.width || 100, a.height || 100);
          const vw = a.alpha && !a.alpha.empty ? a.alpha.bounds.w : a.width || 1;
          const vh = a.alpha && !a.alpha.empty ? a.alpha.bounds.h : a.height || 1;
          const kk = Math.min((plan.cell * s.fill) / vw, (plan.cell * s.fill) / vh);
          Object.assign(img, placeImageByVisibleBox(img, a, cx, top + plan.cell / 2, vw * kk, vh * kk, 0));
          img.groupId = groupId;
          objects.push(img);
          if (s.labels || s.numbers) {
            const label = [s.numbers ? String(number).padStart(2, '0') : '', s.labels ? prettyName(a.name) : ''].filter(Boolean).join('  ');
            const t = createText(label, cx, top + plan.cell + plan.labelH / 2, { fontSize: plan.labelH * 0.55, fontFamily: 'Segoe UI', fontWeight: 600, fill: s.labelColor, align: 'center', shadow: noShadow });
            t.w = plan.cell;
            t.groupId = groupId;
            objects.push(t);
          }
        });
        const rows = Math.ceil(sec.assets.length / plan.cols);
        y += rows * (plan.cell + plan.labelH) + Math.max(0, rows - 1) * s.spacing;
      });
    });
    page.objects = objects;
    page.groups = [{ id: groupId, name: 'Catalog grid', collapsed: true }];
    page.catalog = { ...s, assetIds: chunk.map((a) => a.id), pageIndex: pi };
    return page;
  });
}
