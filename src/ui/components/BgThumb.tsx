// Small live preview of a background style, drawn with the real renderer so patterns, mesh
// gradients and spotlights look exactly like they will on the canvas.

import { useEffect, useRef } from 'react';
import { defaultBackground } from '../../core/defaults';
import type { Background, Page } from '../../core/types';
import { drawBackground } from '../../render/renderer';
import { getAsset } from '../../state/doc';
import { images } from '../../render/images';

const W = 192,
  H = 120;
const PAGE = { width: 1920, height: 1200 } as Page;

/** Fill in layers that older saved presets may be missing. */
export function completeBackground(b: Background): Background {
  const d = defaultBackground();
  return { ...d, ...b, gradient: { ...d.gradient, ...b.gradient }, image: { ...d.image, ...b.image }, overlay: { ...d.overlay, ...b.overlay }, pattern: { ...d.pattern, ...b.pattern }, light: { ...d.light, ...b.light }, vignette: { ...d.vignette, ...b.vignette } };
}

export function BgThumb({ bg }: { bg: Background }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const k = W / PAGE.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawBackground(ctx, PAGE, completeBackground(bg), { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
  }, [bg]);
  return <canvas ref={ref} width={W} height={H} className="bgthumb" />;
}
