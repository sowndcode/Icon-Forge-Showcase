// High-resolution export. Renders each page independently at the TARGET resolution from the
// original image data (never a screenshot of the editor, never overlays).

import type { AssetLookup } from '../core/transform';
import type { ExportSettings, Page, ProjectDoc } from '../core/types';
import { images, PREVIEW_MAX } from '../render/images';
import { drawBackground, drawWatermark, drawWithEffects, forgetWarpSource, type Ctx2D, type RenderOptions, type WatermarkRender } from '../render/renderer';
import { wmAppliesTo } from '../core/watermark';
import { zipSync, type Zippable } from 'fflate';
import { chooseFolder, chooseSaveTarget, numberedName, revealFolder, writeInFolder, writeTarget } from './native';

export const MAX_SIDE = 16384;
export const MAX_PIXELS = 268_000_000;

export function exportSize(page: Page, s: ExportSettings): { w: number; h: number; scale: number } {
  const scale = s.customWidth ? s.customWidth / page.width : s.scale;
  return { w: Math.max(1, Math.round(page.width * scale)), h: Math.max(1, Math.round(page.height * scale)), scale };
}

export function exportProblem(page: Page, s: ExportSettings): string | null {
  const { w, h } = exportSize(page, s);
  if (w > MAX_SIDE || h > MAX_SIDE) return `Output ${w}×${h} exceeds the ${MAX_SIDE}px limit — choose a smaller scale.`;
  if (w * h > MAX_PIXELS) return `Output ${w}×${h} is too large to render.`;
  return null;
}

export const MIME: Record<ExportSettings['format'], string> = { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg' };
export const EXT: Record<ExportSettings['format'], string> = { png: 'png', webp: 'webp', jpeg: 'jpg' };

export const NAME_TOKENS: { token: string; label: string }[] = [
  { token: '{project}', label: 'Project name' },
  { token: '{page}', label: 'Page name' },
  { token: '{index}', label: 'Page number (01, 02…)' },
  { token: '{w}', label: 'Width in px' },
  { token: '{h}', label: 'Height in px' },
  { token: '{date}', label: 'Date (2026-10-22)' },
  { token: '{time}', label: 'Time (1405)' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Windows device names: "NUL.png" or "con.png" would not create a file there. */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** A file name stem every system accepts: no separators, control or reserved characters, no device names, bounded length. */
export function safeStem(v: string, max = 150): string {
  // keep the user's capitalisation; only strip what Windows does not allow in file names
  let s = v.replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g, '_').replace(/\s+/g, '_').replace(/^[._]+|[._]+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/[._]+$/g, '');
  return RESERVED.test(s.split('.')[0]) ? `_${s}` : s;
}

export function fileNameFor(pattern: string, doc: ProjectDoc, page: Page, index: number, s: ExportSettings, now = new Date()): string {
  const { w, h } = exportSize(page, s);
  const clean = (v: string) => v.replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g, '_').replace(/\s+/g, '_');
  const base = (pattern.trim() || '{project}_{page}')
    .replace(/\{project\}/g, clean(doc.name))
    .replace(/\{page\}/g, clean(page.exportName || page.name))
    .replace(/\{index\}/g, pad(index + 1))
    .replace(/\{w\}/g, String(w))
    .replace(/\{h\}/g, String(h))
    .replace(/\{date\}/g, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
    .replace(/\{time\}/g, `${pad(now.getHours())}${pad(now.getMinutes())}`);
  const safe = safeStem(base);
  return `${safe || 'page'}.${EXT[s.format]}`;
}

function makeCanvas(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    return { canvas: c, ctx: c.getContext('2d')! };
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d')! };
}

/** Thrown by renderPageCanvas when its `signal` is cancelled. */
export class RenderCancelled extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'RenderCancelled';
  }
}

export interface RenderControl {
  /** Set `cancelled` to stop between objects (the promise rejects with RenderCancelled). */
  signal?: { cancelled: boolean };
  /**
   * Give the window a chance to paint and handle input every this many milliseconds of drawing.
   * Previews pass ~12 so large pages render without freezing the window; omitted, the render runs in one go.
   */
  sliceMs?: number;
}

/**
 * Render a page at `scale`. Images are decoded at full resolution only when they are drawn
 * larger than the preview, one at a time with a small cache, so 500-asset catalogs export
 * without holding hundreds of full-size bitmaps in memory.
 */
export async function renderPageCanvas(page: Page, getAsset: AssetLookup, scale: number, matte?: string, onProgress?: (done: number, total: number) => void, wm?: WatermarkRender, control: RenderControl = {}) {
  const { signal, sliceMs } = control;
  let sliceStart = performance.now();
  const checkpoint = async () => {
    if (signal?.cancelled) throw new RenderCancelled();
    if (sliceMs && performance.now() - sliceStart > sliceMs) {
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.cancelled) throw new RenderCancelled();
      sliceStart = performance.now();
    }
  };
  const w = Math.round(page.width * scale),
    h = Math.round(page.height * scale);
  const { canvas, ctx } = makeCanvas(w, h);
  if (matte) {
    ctx.fillStyle = matte;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const cache = new Map<string, ImageBitmap>();
  const owned = new Set<ImageBitmap>();
  const need = async (id: string, devicePx: number): Promise<ImageBitmap | null> => {
    const prev = images.previews.get(id);
    if (prev && devicePx <= Math.max(prev.width, prev.height) * 0.95 && Math.max(prev.width, prev.height) >= Math.min(PREVIEW_MAX, devicePx)) return prev;
    if (cache.has(id)) return cache.get(id)!;
    const bmp = (await images.decodeOnce(id)) ?? prev ?? null;
    if (bmp && bmp !== prev) {
      if (!images.hasFull(id)) owned.add(bmp);
      cache.set(id, bmp);
      if (cache.size > 24) {
        const [k, v] = cache.entries().next().value as [string, ImageBitmap];
        cache.delete(k);
        if (owned.has(v)) {
          forgetWarpSource(v);
          v.close();
          owned.delete(v);
        }
      }
    }
    return bmp;
  };
  const current = new Map<string, ImageBitmap | null>();
  const opts: RenderOptions = { pxScale: scale, getAsset, getImage: (id) => current.get(id) ?? null, placeholders: false };
  // background
  const bgId = page.background.type === 'image' ? page.background.image.assetId : undefined;
  if (bgId) current.set(bgId, await need(bgId, Math.max(page.width, page.height) * scale * page.background.image.scale));
  drawBackground(ctx, page, page.background, opts);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  const total = page.objects.length;
  try {
    if (signal) await checkpoint();
    for (let i = 0; i < total; i++) {
      const o = page.objects[i];
      if (o.hidden) continue;
      if (o.type === 'image') {
        current.clear();
        current.set(o.assetId, await need(o.assetId, Math.max(o.w, o.h) * scale));
      }
      drawWithEffects(ctx, page, i, opts);
      if (onProgress && i % 20 === 0) onProgress(i, total);
      if ((signal || sliceMs) && i % 8 === 7) await checkpoint();
    }
  } catch (e) {
    for (const b of owned) (forgetWarpSource(b), b.close());
    throw e;
  }
  ctx.restore();
  if (signal?.cancelled) {
    for (const b of owned) (forgetWarpSource(b), b.close());
    throw new RenderCancelled();
  }
  // the watermark goes over the finished page; logos are decoded at the size they are drawn
  if (wm && wmAppliesTo(wm.watermark, page.id)) {
    current.clear();
    const S = Math.min(page.width, page.height) * scale;
    for (const l of wm.watermark.layers) if (l.visible && l.kind === 'image' && l.assetId) current.set(l.assetId, await need(l.assetId, Math.max(64, l.size * S * 3)));
    drawWatermark(ctx, page, wm, opts);
  }
  for (const b of owned) (forgetWarpSource(b), b.close());
  return canvas;
}

export async function encodeCanvas(canvas: OffscreenCanvas | HTMLCanvasElement, s: ExportSettings): Promise<Blob> {
  const type = MIME[s.format];
  const quality = s.format === 'png' ? undefined : s.quality;
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((res, rej) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), type, quality));
}

export async function renderPageBlob(page: Page, getAsset: AssetLookup, s: ExportSettings, onProgress?: (d: number, t: number) => void, wm?: WatermarkRender): Promise<Blob> {
  const problem = exportProblem(page, s);
  if (problem) throw new Error(problem);
  const { scale } = exportSize(page, s);
  const pg = s.transparent && s.format !== 'jpeg' ? withoutBackground(page) : page;
  const canvas = await renderPageCanvas(pg, getAsset, scale, s.format === 'jpeg' ? s.matte : undefined, onProgress, wm);
  return encodeCanvas(canvas, s);
}

/** The page with every background layer switched off (transparent export). */
export function withoutBackground(page: Page): Page {
  const b = page.background;
  return {
    ...page,
    background: { ...b, type: 'transparent', pattern: { ...b.pattern, enabled: false }, light: { ...b.light, enabled: false }, overlay: { ...b.overlay, enabled: false }, vignette: { ...b.vignette, enabled: false } },
  };
}

/** Rough output size by encoding a quarter-scale render and extrapolating. */
export async function estimateBytes(page: Page, getAsset: AssetLookup, s: ExportSettings): Promise<number> {
  const { w, h } = exportSize(page, s);
  const k = Math.min(1, 640 / Math.max(page.width, page.height));
  const canvas = await renderPageCanvas(page, getAsset, k, s.format === 'jpeg' ? s.matte : undefined);
  const blob = await encodeCanvas(canvas, s);
  const ratio = (w * h) / (canvas.width * canvas.height);
  // compression improves with resolution — damp the extrapolation
  return blob.size * Math.pow(ratio, s.format === 'png' ? 0.85 : 0.75);
}

export interface ExportJob {
  doc: ProjectDoc;
  pages: Page[];
  settings: ExportSettings;
  getAsset: AssetLookup;
  onProgress?: (label: string, done: number, total: number) => void;
  /** The project's watermark and token values (used unless the settings say 'none'). */
  watermark?: WatermarkRender;
  /** Set `cancelled` to stop after the page being rendered. */
  signal?: { cancelled: boolean };
}

/** One file of an export: a page, its name and whether it carries the watermark. */
export interface ExportOutput {
  page: Page;
  name: string;
  watermarked: boolean;
}

/** Name with a suffix before the extension ("cover.png" + "_preview" → "cover_preview.png"). */
export const withSuffix = (name: string, suffix: string) => name.replace(/(\.[a-z0-9]+)$/i, `${suffix.replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g, '_').slice(0, 40)}$1`);

/**
 * Every file an export writes. With the watermark set to 'both', each page gives a clean file and a
 * watermarked one ("…_preview"); pages the watermark does not apply to give only the clean file.
 * Names are unique within the export, so the two versions can never overwrite each other.
 */
export function exportOutputs(doc: ProjectDoc, pages: Page[], s: ExportSettings, wm?: WatermarkRender): ExportOutput[] {
  const names = batchNames(doc, pages, s);
  const mode = s.watermark ?? 'project';
  const suffix = s.previewSuffix?.trim() || '_preview';
  const out: ExportOutput[] = [];
  pages.forEach((p, i) => {
    const applies = !!wm && wmAppliesTo(wm.watermark, p.id);
    if (mode === 'both' && applies) {
      out.push({ page: p, name: names[i], watermarked: false }, { page: p, name: withSuffix(names[i], suffix), watermarked: true });
    } else out.push({ page: p, name: names[i], watermarked: mode !== 'none' && applies });
  });
  const taken = new Set<string>();
  for (const o of out) {
    let n = o.name;
    for (let k = 2; taken.has(n.toLowerCase()); k++) n = numberedName(o.name, k);
    taken.add(n.toLowerCase());
    o.name = n;
  }
  return out;
}

/** Export one or many pages. Single page → save dialog; many → folder (or downloads). */
export interface ExportResult {
  ok: number;
  failed: { page: string; error: string }[];
  cancelled?: boolean;
  /** Names actually written (may carry a _2 suffix when a file already existed). */
  written: string[];
}

/** File names for a batch, made unique within the batch (two pages called "Hero" → Hero, Hero_2). */
export function batchNames(doc: ProjectDoc, pages: Page[], settings: ExportSettings): string[] {
  const now = new Date();
  const names = pages.map((p) => fileNameFor(settings.pattern, doc, p, doc.pages.indexOf(p), settings, now));
  const taken = new Set<string>();
  return names.map((n) => {
    let out = n;
    for (let i = 2; taken.has(out.toLowerCase()); i++) out = numberedName(n, i);
    taken.add(out.toLowerCase());
    return out;
  });
}

/** Name of the .zip for a batch export: "{project}_images.zip". */
export function zipNameFor(doc: ProjectDoc): string {
  return `${safeStem(doc.name) || 'showcase'}_images.zip`;
}

/** Render every output and save them together in one .zip (asks where once). */
async function exportZip(job: ExportJob, outs: ExportOutput[]): Promise<ExportResult> {
  const { doc, settings } = job;
  const failed: { page: string; error: string }[] = [];
  const zipName = zipNameFor(doc);
  const target = await chooseSaveTarget(zipName, 'application/zip', 'zip', 'ZIP archive');
  if (!target) return { ok: 0, failed, cancelled: true, written: [] };
  const files: Zippable = {};
  let ok = 0;
  for (let i = 0; i < outs.length; i++) {
    if (job.signal?.cancelled) return { ok: 0, failed, cancelled: true, written: [] };
    job.onProgress?.(`Rendering ${outs[i].name}`, i, outs.length);
    try {
      const blob = await renderPageBlob(outs[i].page, job.getAsset, settings, undefined, outs[i].watermarked ? job.watermark : undefined);
      // images are already compressed — store them as-is
      files[outs[i].name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
      ok++;
    } catch (e) {
      failed.push({ page: outs[i].page.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!ok) return { ok, failed, written: [] };
  job.onProgress?.('Writing ZIP', outs.length, outs.length);
  const zipped = zipSync(files);
  const saved = await writeTarget(target, new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), zipName);
  return { ok, failed, written: [saved] };
}

export async function runExport(job: ExportJob): Promise<ExportResult> {
  const { doc, pages, settings } = job;
  const failed: { page: string; error: string }[] = [];
  const written: string[] = [];
  const outs = exportOutputs(doc, pages, settings, job.watermark);
  const keepExisting = settings.onConflict !== 'overwrite';
  if (outs.length === 1) {
    const o = outs[0];
    const target = await chooseSaveTarget(o.name, MIME[settings.format], EXT[settings.format], settings.format.toUpperCase() + ' image');
    if (!target) return { ok: 0, failed, cancelled: true, written };
    try {
      job.onProgress?.(`Rendering ${o.page.name}`, 0, 1);
      const blob = await renderPageBlob(o.page, job.getAsset, settings, undefined, o.watermarked ? job.watermark : undefined);
      written.push(await writeTarget(target, blob, o.name));
      return { ok: 1, failed, written };
    } catch (e) {
      return { ok: 0, failed: [{ page: o.page.name, error: e instanceof Error ? e.message : String(e) }], written };
    }
  }
  if (settings.saveAs === 'zip') return exportZip(job, outs);
  const folder = await chooseFolder();
  if (!folder) return { ok: 0, failed, cancelled: true, written };
  let ok = 0;
  for (let i = 0; i < outs.length; i++) {
    if (job.signal?.cancelled) return { ok, failed, cancelled: true, written };
    job.onProgress?.(`Rendering ${outs[i].name}`, i, outs.length);
    try {
      const blob = await renderPageBlob(outs[i].page, job.getAsset, settings, undefined, outs[i].watermarked ? job.watermark : undefined);
      written.push(await writeInFolder(folder, outs[i].name, blob, keepExisting));
      ok++;
    } catch (e) {
      failed.push({ page: outs[i].page.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (ok && settings.revealFolder !== false) revealFolder(folder);
  return { ok, failed, written };
}
