// One-time move of data saved by earlier desktop versions (browser database) into <project>/data.
// The main process has already copied the old database into this window's profile; here every item is
// read from that copy and handed over one at a time. Nothing is overwritten (see electron/migrate.cjs),
// and the original folder in %APPDATA% is never touched.
import { idb, type StoredProject } from './db';

// same key as state/prefs.ts
const PREFS_LOCAL_KEY = 'asset-forge-showcase:prefs';

export interface MigrationResult {
  ok: boolean;
  projects: number;
  problems: string[];
  reportPath: string;
}

type Tally = Record<string, number>;
const bump = (t: Tally, k: string) => (t[k] = (t[k] ?? 0) + 1);

/** `onProgress` gets a short line for the start-up screen. */
export async function migrateEarlierData(onProgress: (note: string) => void = () => undefined): Promise<MigrationResult | null> {
  const m = window.showcaseNative?.migrate;
  if (!m) return null;
  const st = await m.status();
  if (!st.pending) return null;

  const projects: Record<string, string[]> = { written: [], same: [], conflict: [] };
  const files: Tally = {};
  const presets: Tally = {};
  const settings: Tally = {};
  const blobKeys: string[] = [];
  const errors: string[] = [];
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const keep = 'Keep this window open — this happens once, and nothing is deleted.';
  onProgress(`Moving your projects into the app's data folder…
${keep}`);
  let all: StoredProject[] = [];
  await attempt('reading projects', async () => void (all = (await idb.allProjects()) ?? []));
  for (const [i, p] of all.entries()) {
    onProgress(`Moving projects into the app's data folder: ${i + 1} of ${all.length}
${keep}`);
    await attempt(`project ${p.id}`, async () => void projects[await m.project(p)]?.push(p.id));
  }

  let keys: IDBValidKey[] = [];
  await attempt('reading files', async () => void (keys = (await idb.blobKeys()) ?? []));
  for (const [i, k] of keys.entries()) {
    if (typeof k !== 'string') continue;
    if (i % 25 === 0) onProgress(`Moving images and fonts into the app's data folder: ${i + 1} of ${keys.length}
${keep}`);
    await attempt(`file ${k}`, async () => {
      const b = await idb.getBlob(k);
      if (!b) return;
      bump(files, await m.blob(k, await b.arrayBuffer(), b.type));
      blobKeys.push(k);
    });
  }

  await attempt('presets', async () => {
    for (const p of (await idb.listPresets()) ?? []) bump(presets, await m.preset(p));
  });

  await attempt('settings', async () => {
    for (const k of (await idb.kvKeys()) ?? []) {
      if (typeof k !== 'string') continue;
      let v = await idb.getKV<unknown>(k);
      // preferences were also kept in localStorage; take whichever copy is newer
      if (k === 'prefs') v = newerPrefs(v);
      bump(settings, await m.kv(k, v));
    }
    const kvHasPrefs = ((await idb.kvKeys()) ?? []).includes('prefs');
    const local = newerPrefs(undefined);
    if (!kvHasPrefs && local) bump(settings, await m.kv('prefs', local));
  });

  onProgress('Checking the moved data…');
  const result = await m.finish({ projects, files, presets, settings, blobKeys, errors });
  // the copy inside data/cache is no longer needed once everything is verified (the original stays in %APPDATA%)
  if (result.ok) await idb.drop().catch(() => undefined);
  return result;
}

function newerPrefs(fromDb: unknown): unknown {
  let local: { savedAt?: number } | null = null;
  try {
    local = JSON.parse(localStorage.getItem(PREFS_LOCAL_KEY) ?? 'null');
  } catch {
    local = null;
  }
  const dbAt = (fromDb as { savedAt?: number } | undefined)?.savedAt ?? 0;
  return local && (local.savedAt ?? 0) > dbAt ? local : fromDb;
}
