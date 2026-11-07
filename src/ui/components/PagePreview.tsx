// Small rendered preview of a page that hasn't been added to the project yet (catalog dialog,
// template cards). `build` is called lazily after `delay` ms so lists stay responsive.

import { useEffect, useRef, useState } from 'react';
import type { Page } from '../../core/types';
import { images } from '../../render/images';
import { renderPage } from '../../render/renderer';
import { getAsset } from '../../state/doc';

const cache = new Map<string, string>();

export function PagePreview({ build, cacheKey, width = 280, delay = 0, className = '' }: { build: () => Page | null; cacheKey: string; width?: number; delay?: number; className?: string }) {
  const key = `${cacheKey}|${width}`;
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? null);
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) return setUrl(hit);
    const t = setTimeout(() => {
      try {
        const p = buildRef.current();
        if (!p) return setUrl(null);
        const dpr = Math.max(1.5, Math.min(2, window.devicePixelRatio || 1));
        const k = (width * dpr) / Math.max(p.width, p.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(p.width * k));
        c.height = Math.max(1, Math.round(p.height * k));
        const ctx = c.getContext('2d')!;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        renderPage(ctx, p, { pxScale: k, getAsset, getImage: (id) => images.previews.get(id) ?? null });
        const u = c.toDataURL('image/jpeg', 0.92);
        if (cache.size > 200) cache.clear();
        cache.set(key, u);
        setUrl(u);
      } catch {
        setUrl(null);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [key, width, delay]);
  return <div className={`page-preview ${className}`}>{url ? <img src={url} alt="" /> : <span className="spinner" />}</div>;
}
