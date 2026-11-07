// Synthetic icon packs for the benchmarks: 40 distinct drawings, one preview bitmap per asset.
import type { AssetRecord } from '../src/core/types';
import { images, previewMaxFor } from '../src/render/images';

export async function makeIcons(n: number) {
  const SRC = 256;
  const pool: { bmp: OffscreenCanvas; blob: Blob }[] = [];
  for (let i = 0; i < 40; i++) {
    const c = new OffscreenCanvas(SRC, SRC);
    const x = c.getContext('2d')!;
    x.fillStyle = `hsl(${i * 37} 70% 55%)`;
    x.beginPath();
    x.arc(SRC / 2, SRC / 2, SRC * (0.3 + (i % 5) * 0.03), 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 90px sans-serif';
    x.textAlign = 'center';
    x.fillText(String(i), SRC / 2, SRC / 2 + 30);
    pool.push({ bmp: c, blob: await c.convertToBlob({ type: 'image/png' }) });
  }
  images.clear();
  const pm = previewMaxFor(n);
  const assets: AssetRecord[] = [];
  for (let i = 0; i < n; i++) {
    const id = 'as' + i;
    const p = pool[i % pool.length];
    // a distinct preview bitmap per asset, like a real pack
    images.previews.set(id, await createImageBitmap(p.bmp, { resizeWidth: pm, resizeHeight: pm, resizeQuality: 'high' }));
    images.blobs.set(id, p.blob);
    assets.push({ id, name: `icon_${i}.png`, format: 'png', kind: 'asset', folder: '', category: '', width: SRC, height: SRC, bytes: p.blob.size, importIndex: i, addedAt: 1, status: 'ready', alpha: { bounds: { x: 40, y: 40, w: 176, h: 176 }, occupancy: 0.6, fill: 0.8, hasAlpha: true, empty: false, centroid: { x: 128, y: 128 } } });
  }
  return assets;
}

