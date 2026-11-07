// Rendered preview of a text style (title, badge…), drawn with the real text renderer.

import { useEffect, useRef } from 'react';
import { createText } from '../../core/defaults';
import type { TextStyle } from '../../core/types';
import { drawText, naturalWidth, textHeight } from '../../render/text';

const W = 220,
  H = 84;

export function TextThumb({ text, style }: { text: string; style: Partial<TextStyle> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const t = createText(text, 0, 0, style);
    t.w = Math.ceil(naturalWidth(text, t.style) + t.style.fontSize * 0.4);
    t.h = textHeight(t);
    // leave room for shadows, glow and depth
    const fx = t.style.fontSize * 0.35;
    const k = Math.min((W - 12) / (t.w + fx), (H - 10) / (t.h + fx), 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(k, 0, 0, k, W / 2, H / 2);
    drawText(ctx, t, k);
  }, [text, style]);
  return <canvas ref={ref} width={W} height={H} className="textthumb" />;
}
