// Local font files (TTF/OTF/WOFF) registered with the FontFace API and stored with the project.

import { uid } from '../core/ids';
import { getDoc, mutate } from '../state/doc';
import { toast } from '../state/ui';
import { db } from './db';

const loaded = new Set<string>();

async function register(family: string, blob: Blob) {
  if (loaded.has(family)) return;
  const face = new FontFace(family, await blob.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  loaded.add(family);
}

export async function importFonts(files: File[]) {
  let ok = 0;
  for (const f of files) {
    const family = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    try {
      await register(family, f);
      const id = uid('fnt');
      await db.putBlob(id, f);
      mutate((d) => ({ ...d, fonts: [...d.fonts.filter((x) => x.family !== family), { id, family, fileName: f.name }] }));
      ok++;
    } catch {
      toast(`Could not load font ${f.name}`, 'error');
    }
  }
  if (ok) toast(`Added ${ok} font${ok > 1 ? 's' : ''}`, 'success');
}

export async function loadProjectFonts(blobs?: Map<string, Blob>) {
  for (const f of getDoc().fonts) {
    const b = blobs?.get(f.id) ?? (await db.getBlob(f.id).catch(() => undefined));
    if (b) await register(f.family, b).catch(() => undefined);
  }
}

export async function fontBlobs(): Promise<Map<string, Blob>> {
  const m = new Map<string, Blob>();
  for (const f of getDoc().fonts) {
    const b = await db.getBlob(f.id).catch(() => undefined);
    if (b) m.set(f.id, b);
  }
  return m;
}
