// Import formats and file collection (drag & drop, file picker, folder picker).
// Each file carries its relative folder path so folder structure becomes categories.

import { unzipSync } from 'fflate';

const MIB = 1024 * 1024;

/**
 * Unpack a .showcase file, refusing zip bombs. Real projects store their images uncompressed, so they
 * unpack to about their own size; only project.json and fonts shrink, hence the generous limit.
 */
export function unzipProject(buf: Uint8Array, limit = Math.min(4096 * MIB, Math.max(256 * MIB, buf.length * 20))) {
  let total = 0;
  return unzipSync(buf, {
    filter: (f) => {
      if (f.name !== 'project.json' && !/^(assets|fonts)\//.test(f.name)) return false;
      // stored entries unpack to `size` whatever the header claims, deflated ones to at most `originalSize`
      total += Math.max(f.size, f.originalSize);
      if (total > limit) throw new Error('it unpacks to far more data than a project should');
      return true;
    },
  });
}

export const IMAGE_EXT = ['png', 'webp', 'jpg', 'jpeg', 'jfif', 'avif', 'gif', 'bmp'];
export const ACCEPT_IMAGES = 'image/png,image/webp,image/jpeg,image/avif,image/gif,image/bmp,.png,.webp,.jpg,.jpeg,.jfif,.avif,.gif,.bmp';
export const PROJECT_EXT = 'showcase';
export const FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];

export interface FileEntry {
  file: File;
  /** Relative directory ("Halloween/Weapons"), '' for loose files. */
  dir: string;
}

export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

export function isImage(f: { name: string; type: string }) {
  return f.type.startsWith('image/') || IMAGE_EXT.includes(extOf(f.name));
}

export function formatOf(f: { name: string; type: string }): string {
  const e = extOf(f.name);
  if (e === 'jpg' || e === 'jfif') return 'jpeg';
  if (IMAGE_EXT.includes(e)) return e;
  return f.type.replace('image/', '') || 'unknown';
}

/** From an <input type=file> (webkitdirectory gives webkitRelativePath). */
export function entriesFromInput(files: FileList | File[]): FileEntry[] {
  return Array.from(files).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const parts = rel.split('/');
    parts.pop();
    return { file, dir: parts.join('/') };
  });
}

/** Recursively collects files from a drop, preserving folder paths. */
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<FileEntry[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null)).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return Array.from(dt.files ?? []).map((file) => ({ file, dir: '' }));
  const out: FileEntry[] = [];
  const walk = async (entry: FileSystemEntry, dir: string, depth: number): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File | null>((res) => (entry as FileSystemFileEntry).file(res, () => res(null)));
      if (f) out.push({ file: f, dir });
    } else if (entry.isDirectory && depth < 8) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const sub = dir ? `${dir}/${entry.name}` : entry.name;
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])));
        for (const e of batch) await walk(e, sub, depth + 1);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, '', 0);
  return out;
}

/** Category from a folder path: drop the dropped root folder, use the deepest remaining name. */
export function categoryFromDir(dir: string, rootCount: number): string {
  if (!dir) return '';
  const parts = dir.split('/').filter(Boolean);
  // With a single dropped root ("Halloween/Characters") the root is the pack name, not a category.
  const rel = rootCount === 1 && parts.length > 1 ? parts.slice(1) : rootCount === 1 ? [] : parts;
  const name = rel[rel.length - 1] ?? '';
  return prettyCategory(name);
}

export function prettyCategory(s: string): string {
  return s
    .replace(/^\d+[\s._-]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "03_evil_pumpkin.png" → "Evil Pumpkin" */
export function prettyName(file: string): string {
  const base = file.replace(/\.[^.]+$/, '');
  const s = base
    .replace(/^\d+[\s._-]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (s || base).replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
