// A page rendered at a given display size, as a bitmap that overlays (watermarks, checks) can be drawn
// over cheaply. Re-rendered only when the page or its decoded images change, never while dragging.
//
// The bitmap returned always belongs to `page`: while another page is selected and its render is
// on the way the hook returns null (callers clear their canvas), never the previous page's bitmap,
// which would be drawn distorted into the new page's shape. After an edit to the same page the
// previous render stays visible until the new one is ready, so editing does not flicker.

import { useEffect, useState } from 'react';
import type { Page } from '../../core/types';
import { inGesture } from '../../state/doc';
import { useImageVersion } from './useImageVersion';
import { isCancelled, requestPreview, type Bitmap } from './previewRender';

export type { Bitmap } from './previewRender';

interface Shown {
  bmp: Bitmap;
  pageId: string;
  w: number;
  h: number;
  transparent: boolean;
  matte: string;
}

/** `scale` is device pixels per page pixel. */
export function usePageRender(page: Page, scale: number, opts: { transparent?: boolean; matte?: string } = {}): Bitmap | null {
  const [shown, setShown] = useState<Shown | null>(null);
  const v = useImageVersion();
  const transparent = !!opts.transparent;
  const matte = opts.matte ?? '';
  useEffect(() => {
    let cancelled = false;
    let release = () => undefined as void;
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      if (cancelled) return;
      if (inGesture()) {
        t = setTimeout(run, 300);
        return;
      }
      const req = requestPreview(page, scale, { transparent, matte: matte || undefined });
      release = req.release;
      req.promise.then(
        (r) => !cancelled && setShown({ bmp: r.canvas, pageId: page.id, w: page.width, h: page.height, transparent, matte }),
        (e) => !isCancelled(e) && console.warn('preview render failed', e),
      );
    };
    // a page of its own renders at once; edits to the same page wait a moment (sliders, typing)
    const same = shown && shown.pageId === page.id;
    t = setTimeout(run, same ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, Math.round(scale * 1000), v, transparent, matte]);
  if (!shown || shown.pageId !== page.id || shown.w !== page.width || shown.h !== page.height || shown.transparent !== transparent || shown.matte !== matte) return null;
  return shown.bmp;
}
