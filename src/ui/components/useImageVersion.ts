import { useEffect, useState } from 'react';
import { images } from '../../render/images';

/** Re-render when decoded images arrive or change. */
export function useImageVersion(): number {
  const [n, set] = useState(0);
  useEffect(() => images.subscribe(() => set((x) => x + 1)), []);
  return n;
}
