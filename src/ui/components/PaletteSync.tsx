// Keeps the colour-field swatches in step with the icons' colours (shades of each main colour).

import { useEffect } from 'react';
import { harmonyColors, hsl, rgbToHsl } from '../../core/palette';
import { useSwatches } from './colorSwatches';
import { usePalette } from './usePalette';

export function PaletteSync() {
  const p = usePalette();
  const key = p?.colors.join(',') ?? '';
  useEffect(() => {
    if (!p) return useSwatches.setState({ icon: [], match: [] });
    // each main colour with a deep and a light shade, ready for backgrounds and text
    const icon = p.colors.flatMap((c) => {
      const [h, s, l] = rgbToHsl(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16));
      return [hsl(h, Math.min(1, s * 1.05), Math.max(0.1, l * 0.45)), c.toLowerCase(), hsl(h, s * 0.9, l + (1 - l) * 0.55)];
    });
    // colours that go with the icons (complement, triad, neighbours) in a deep and a light version
    const match = harmonyColors(p).slice(0, 6).flatMap((c) => {
      const [h] = rgbToHsl(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16));
      return [hsl(h, 0.6, 0.3), hsl(h, 0.7, 0.55)];
    });
    useSwatches.setState({ icon, match });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
