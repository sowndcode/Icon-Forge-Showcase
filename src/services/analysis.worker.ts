/// <reference lib="webworker" />
// Decodes an image off the main thread: alpha analysis (cached in the project afterwards),
// an editor preview bitmap and a small library thumbnail.

import { analyzeAlpha, scaleAlpha } from '../core/alpha';
import type { AlphaInfo } from '../core/types';

export interface AnalyzeRequest {
  id: string;
  blob: Blob;
  analyze: boolean;
  previewMax: number;
  thumbMax: number;
  threshold: number;
}

export interface AnalyzeResponse {
  id: string;
  ok: boolean;
  error?: string;
  width?: number;
  height?: number;
  alpha?: AlphaInfo;
  preview?: ImageBitmap;
  thumb?: Blob;
}

const ANALYZE_MAX = 2048;

async function handle(req: AnalyzeRequest): Promise<{ res: AnalyzeResponse; transfer: Transferable[] }> {
  const bmp = await createImageBitmap(req.blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
  const W = bmp.width,
    H = bmp.height;
  if (!W || !H) throw new Error('Image has zero size');
  if (W * H > 16384 * 16384) throw new Error('Image is too large');
  let alpha: AlphaInfo | undefined;
  if (req.analyze) {
    const k = Math.min(1, ANALYZE_MAX / Math.max(W, H));
    const aw = Math.max(1, Math.round(W * k)),
      ah = Math.max(1, Math.round(H * k));
    const c = new OffscreenCanvas(aw, ah);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, aw, ah);
    const data = ctx.getImageData(0, 0, aw, ah).data;
    alpha = scaleAlpha(analyzeAlpha(data, aw, ah, req.threshold), 1 / k, W, H);
  }
  const pk = Math.min(1, req.previewMax / Math.max(W, H));
  const preview =
    pk < 1
      ? await createImageBitmap(bmp, { resizeWidth: Math.max(1, Math.round(W * pk)), resizeHeight: Math.max(1, Math.round(H * pk)), resizeQuality: 'high' })
      : await createImageBitmap(bmp);
  const tk = Math.min(1, req.thumbMax / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * tk)),
    th = Math.max(1, Math.round(H * tk));
  const tc = new OffscreenCanvas(tw, th);
  const tctx = tc.getContext('2d')!;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(preview, 0, 0, tw, th);
  let thumb: Blob;
  try {
    thumb = await tc.convertToBlob({ type: 'image/webp', quality: 0.85 });
  } catch {
    thumb = await tc.convertToBlob({ type: 'image/png' });
  }
  bmp.close();
  return { res: { id: req.id, ok: true, width: W, height: H, alpha, preview, thumb }, transfer: [preview] };
}

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  try {
    const { res, transfer } = await handle(e.data);
    (self as unknown as Worker).postMessage(res, transfer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id: e.data.id, ok: false, error: /decode|source image|InvalidState/i.test(msg) ? 'Could not decode image (corrupt or unsupported)' : msg } satisfies AnalyzeResponse);
  }
};
