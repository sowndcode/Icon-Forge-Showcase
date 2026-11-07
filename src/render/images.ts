// Runtime image cache (never persisted):
//   blobs     — original files (from import or IndexedDB)
//   previews  — downscaled bitmaps for fast editor drawing (≤ PREVIEW_MAX px)
//   full      — full-resolution bitmaps, LRU by pixel budget; used when zoomed in and for export
//   thumbs    — object URLs for library thumbnails
// Rendering always goes back to these sources — nothing is re-rasterised while editing.

export const PREVIEW_MAX = 512;

/**
 * Preview size for an icon in a pack of `count` icons. Large packs draw each icon small, and zooming
 * in or exporting decodes the original anyway, so their previews can be smaller: 5,000 icons at
 * 512 px would need ~5 GB of decoded bitmaps, at 160 px ~0.5 GB. Icons smaller than this keep their size.
 */
export function previewMaxFor(count: number): number {
  return count <= 500 ? PREVIEW_MAX : count <= 1500 ? 256 : count <= 3000 ? 192 : 160;
}
export const THUMB_MAX = 192;
const FULL_BUDGET = 72_000_000; // pixels kept decoded at full resolution

type Listener = () => void;

class ImageStore {
  blobs = new Map<string, Blob>();
  previews = new Map<string, ImageBitmap>();
  thumbs = new Map<string, string>();
  private full = new Map<string, ImageBitmap>();
  private fullPixels = 0;
  private loadingFull = new Map<string, Promise<ImageBitmap | null>>();
  private listeners = new Set<Listener>();
  private versionN = 0;
  private notifyQueued = false;

  get version() {
    return this.versionN;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Coalesced change notification (many previews arrive in bursts). */
  notify() {
    this.versionN++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      for (const l of this.listeners) l();
    });
  }

  setPreview(id: string, bmp: ImageBitmap) {
    this.previews.get(id)?.close();
    this.previews.set(id, bmp);
    this.notify();
  }

  setThumb(id: string, blob: Blob) {
    const old = this.thumbs.get(id);
    if (old) URL.revokeObjectURL(old);
    this.thumbs.set(id, URL.createObjectURL(blob));
  }

  /** Best bitmap for drawing at `devicePx` on-screen size; triggers a full decode when needed. */
  get(id: string, devicePx: number): ImageBitmap | null {
    const f = this.full.get(id);
    if (f) {
      // refresh LRU position
      this.full.delete(id);
      this.full.set(id, f);
      return f;
    }
    const p = this.previews.get(id) ?? null;
    if (p && devicePx > Math.max(p.width, p.height) * 1.15 && this.blobs.has(id)) void this.loadFull(id).then((b) => b && this.notify());
    return p;
  }

  hasFull(id: string) {
    return this.full.has(id);
  }

  /** Decode the original at full resolution (cached under the pixel budget). */
  loadFull(id: string): Promise<ImageBitmap | null> {
    const have = this.full.get(id);
    if (have) return Promise.resolve(have);
    const pending = this.loadingFull.get(id);
    if (pending) return pending;
    const blob = this.blobs.get(id);
    if (!blob) return Promise.resolve(null);
    const p = createImageBitmap(blob)
      .then((bmp) => {
        this.full.set(id, bmp);
        this.fullPixels += bmp.width * bmp.height;
        this.evict();
        return bmp;
      })
      .catch(() => null)
      .finally(() => this.loadingFull.delete(id));
    this.loadingFull.set(id, p);
    return p;
  }

  /** Decode without caching (export of very large sets). */
  async decodeOnce(id: string): Promise<ImageBitmap | null> {
    const have = this.full.get(id);
    if (have) return have;
    const blob = this.blobs.get(id);
    if (!blob) return null;
    try {
      return await createImageBitmap(blob);
    } catch {
      return null;
    }
  }

  private evict() {
    for (const [k, b] of this.full) {
      if (this.fullPixels <= FULL_BUDGET || this.full.size <= 1) break;
      this.full.delete(k);
      this.fullPixels -= b.width * b.height;
      b.close();
    }
  }

  remove(id: string) {
    this.blobs.delete(id);
    this.previews.get(id)?.close();
    this.previews.delete(id);
    const f = this.full.get(id);
    if (f) {
      this.fullPixels -= f.width * f.height;
      f.close();
      this.full.delete(id);
    }
    const t = this.thumbs.get(id);
    if (t) URL.revokeObjectURL(t);
    this.thumbs.delete(id);
    this.notify();
  }

  clear() {
    for (const id of [...this.blobs.keys(), ...this.previews.keys()]) this.remove(id);
    this.full.clear();
    this.fullPixels = 0;
  }
}

export const images = new ImageStore();
