// Preview of a game theme: its background with a sample title in the theme's look.

import { useEffect, useRef } from 'react';
import { createText, scaleTextStyle } from '../../core/defaults';
import type { Theme } from '../../core/themes';
import type { Page } from '../../core/types';
import { drawBackground } from '../../render/renderer';
import { drawText, naturalWidth, textHeight } from '../../render/text';
import { images } from '../../render/images';
import { getAsset } from '../../state/doc';
import { completeBackground } from './BgThumb';

const W = 400,
  H = 225;
const PAGE = { width: 1600, height: 900 } as Page;

export function ThemeThumb({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const k = W / PAGE.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawBackground(ctx, PAGE, completeBackground(theme.bg()), { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
    const word = theme.name.toUpperCase();
    const t = createText(word, PAGE.width / 2, PAGE.height / 2, scaleTextStyle(theme.title, 2));
    const fit = Math.min(1, (PAGE.width * 0.82) / (naturalWidth(word, t.style) + 1));
    if (fit < 1) t.style = { ...t.style, ...scaleTextStyle(theme.title, 2 * fit), fontSize: t.style.fontSize * fit };
    t.w = PAGE.width * 0.9;
    t.h = textHeight(t);
    ctx.save();
    ctx.translate(t.x, t.y - 40);
    drawText(ctx, { ...t, x: 0, y: 0 }, k);
    ctx.restore();
    // badge colour strip
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.roundRect(PAGE.width / 2 - 170, PAGE.height / 2 + 150, 340, 70, 35);
    ctx.fill();
  }, [theme]);
  return <canvas ref={ref} width={W} height={H} className="bgthumb" />;
}
