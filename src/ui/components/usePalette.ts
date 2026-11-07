// Main colours of the project's icons, sampled from their decoded previews (cached per asset set).

import { useMemo } from 'react';
import { paletteFromPixels, type Palette } from '../../core/palette';
import { images } from '../../render/images';
import { useDoc } from '../../state/doc';
import { useImageVersion } from '../left/AssetLibrary';

const S = 24; // each icon is sampled at 24×24
let cache: { key: string; p: Palette | null } | null = null;

export function usePalette(): Palette | null {
  useImageVersion();
  const ids = useDoc((s) => s.doc.assets.filter((a) => a.kind === 'asset' && a.status === 'ready').map((a) => a.id).join(','));
  const loaded = ids ? ids.split(',').filter((id) => images.previews.has(id)).length : 0;
  return useMemo(() => {
    if (!ids || !loaded) return null;
    const key = `${ids}|${loaded}`;
    if (cache?.key === key) return cache.p;
    // spread the sample over the whole library, up to 80 icons
    const all = ids.split(',').filter((id) => images.previews.has(id));
    const step = Math.max(1, Math.floor(all.length / 80));
    const pick = all.filter((_, i) => i % step === 0).slice(0, 80);
    const c = document.createElement('canvas');
    c.width = S * pick.length;
    c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    pick.forEach((id, i) => ctx.drawImage(images.previews.get(id)!, i * S, 0, S, S));
    const p = paletteFromPixels(ctx.getImageData(0, 0, c.width, S).data);
    cache = { key, p };
    return p;
  }, [ids, loaded]);
}
