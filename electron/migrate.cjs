// One-time move of data saved by earlier versions (browser database in %APPDATA%\asset-forge-showcase)
// into <project>/data. Nothing is ever deleted or overwritten:
//   1. main process: the old profile's database folders are COPIED into data/cache/chromium
//      (the original stays where it was, as a backup)
//   2. the window reads that copy and hands every project / file / preset / setting to importX() below,
//      which only writes what isn't there yet (a differing project is kept in projects/_conflicts)
//   3. finish() checks every imported item can be read back, then writes data/migration/report.txt
// Until step 3 succeeds the migration simply runs again on the next start (each step is repeat-safe).
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const log = require('./log.cjs');
const store = require('./store.cjs');

const COPIED = ['IndexedDB', 'Local Storage'];

let L = null;
const stateFile = () => path.join(L.migration, 'state.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(s) {
  fs.mkdirSync(L.migration, { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify({ ...s, updatedAt: new Date().toISOString() }, null, 1));
}

const hasOldData = (dir) => COPIED.some((d) => fs.existsSync(path.join(dir, d)));

/** An earlier version still running holds its profile's "lockfile" open. */
function inUse(dir) {
  const lock = path.join(dir, 'lockfile');
  if (!fs.existsSync(lock)) return false;
  try {
    fs.closeSync(fs.openSync(lock, 'r+'));
    return false; // left over from a crash
  } catch (e) {
    return e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES';
  }
}

/**
 * After its window closes, an earlier version's helper processes (e.g. the storage service) can keep
 * writing the database for a while, without the lockfile. They carry the profile in their command line.
 */
function helpersRunning(dir) {
  if (process.platform !== 'win32') return false;
  try {
    const out = require('node:child_process').execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--user-data-dir=*' } | ForEach-Object { $_.CommandLine }"],
      { encoding: 'utf8', timeout: 15000, windowsHide: true },
    );
    const needle = path.resolve(dir).toLowerCase();
    return out.toLowerCase().split(/\r?\n/).some((l) => l.includes(needle + '"') || l.includes(needle + ' ') || l.endsWith(needle));
  } catch {
    return false; // can't tell: the before/after comparison below still guards the copy
  }
}

/** Size and time of every file in the database folders, to notice writes during the copy. */
function fingerprint(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const s = fs.statSync(p);
        out.push(`${path.relative(dir, p)}:${s.size}:${s.mtimeMs}`);
      }
    }
  };
  for (const d of COPIED) if (fs.existsSync(path.join(dir, d))) walk(path.join(dir, d));
  return out.sort().join('\n');
}

const QUIET_MS = 15_000;
const recentlyWritten = (fp) => fp.split('\n').some((l) => Date.now() - Number(l.split(':').pop()) < QUIET_MS);

/**
 * Before the app is ready: copy the old profile in. Returns
 *   { phase: 'none' | 'done' }        nothing to do
 *   { phase: 'pending', from }        the window has to import the copied data
 *   { phase: 'blocked', from }        an older version is still open — ask the user to close it
 */
function prepare(layout, legacyDirs) {
  L = layout;
  const state = readState();
  if (state?.phase === 'done' || state?.phase === 'none') return state;
  if (state?.phase === 'copied' || state?.phase === 'failed') return { phase: 'pending', from: state.from };

  const from = legacyDirs.find((d) => d && path.resolve(d) !== path.resolve(L.profile) && hasOldData(d));
  if (!from) {
    writeState({ phase: 'none' });
    return { phase: 'none' };
  }
  // the database must be at rest: a copy taken while it's being written can bring back deleted items
  // or miss recent ones, so wait until nothing is using it
  const before = fingerprint(from);
  if (inUse(from) || recentlyWritten(before) || helpersRunning(from)) return { phase: 'blocked', from };

  // copy into a staging folder, check nothing changed meanwhile, then swap it in whole
  // (a half-finished copy from an interrupted earlier start is ours and is replaced, never merged)
  const staging = path.join(L.cache, 'migration-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  const copied = [];
  for (const d of COPIED) {
    const src = path.join(from, d);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(staging, d), { recursive: true });
    copied.push(d);
  }
  if (fingerprint(from) !== before) {
    fs.rmSync(staging, { recursive: true, force: true });
    log.warn('migrate', 'earlier data changed while copying; will try again on the next start');
    return { phase: 'blocked', from };
  }
  for (const d of copied) {
    fs.rmSync(path.join(L.profile, d), { recursive: true, force: true });
    fs.renameSync(path.join(staging, d), path.join(L.profile, d));
  }
  fs.rmSync(staging, { recursive: true, force: true });
  const ws = path.join(from, 'window-state.json');
  const wsTo = path.join(L.settings, 'window-state.json');
  if (fs.existsSync(ws) && !fs.existsSync(wsTo)) {
    fs.copyFileSync(ws, wsTo);
    copied.push('window-state.json');
  }
  writeState({ phase: 'copied', from, copied, copiedAt: new Date().toISOString() });
  log.info('migrate', 'copied earlier data from', from, '→', copied.join(', '));
  return { phase: 'pending', from };
}

function status() {
  const s = readState();
  const pending = s?.phase === 'copied' || s?.phase === 'failed';
  if (pending) log.info('migrate', `importing into data/ (${s.phase === 'failed' ? 'retry' : 'first run'})`);
  return { pending, from: s?.from ?? null };
}

// ---------------------------------------------------------------------------
// Import steps (called by the window, one item at a time)
// ---------------------------------------------------------------------------

async function importProject(p) {
  const id = store.checkId(p?.id);
  const existing = await store.getProject(id).catch(() => null);
  if (!existing) {
    await store.putProject(p);
    return 'written';
  }
  const { recovered, ...cur } = existing;
  if (JSON.stringify(cur) === JSON.stringify(p)) return 'same';
  // never replace a project that's already in data/: keep the older copy next to it
  const file = path.join(L.conflicts, `${id}-${store.stamp()}.json`);
  await store.writeAtomic(file, JSON.stringify(p));
  return 'conflict';
}

async function importBlob(key, data, type) {
  if (await store.findBlob(key)) return 'exists';
  await store.putBlob(key, data, type);
  return 'written';
}

async function importPreset(p) {
  store.checkId(p?.id);
  if ((await store.presetsDoc.get()).some((x) => x.id === p.id)) return 'exists';
  await store.putPreset(p);
  return 'written';
}

async function importKV(key, value) {
  if ((await store.getKV(key)) !== undefined) return 'exists';
  await store.setKV(key, value);
  return 'written';
}

/** Verify everything the window reported, write the report, and mark the migration done (or failed → retried). */
async function finish(summary) {
  const s = readState() ?? {};
  const problems = [...(summary.errors ?? [])];
  const projectIds = [...(summary.projects?.written ?? []), ...(summary.projects?.same ?? [])];
  for (const id of projectIds) {
    const p = await store.getProject(id).catch((e) => problems.push(`project ${id}: ${e.message}`));
    if (p === undefined) problems.push(`project ${id}: missing after import`);
  }
  for (const k of summary.blobKeys ?? []) if (!(await store.findBlob(k))) problems.push(`file ${k}: missing after import`);

  const ok = problems.length === 0;
  const at = new Date().toISOString();
  const report = {
    ok,
    at,
    from: s.from,
    copiedFolders: s.copied ?? [],
    projects: summary.projects,
    files: summary.files,
    presets: summary.presets,
    settings: summary.settings,
    problems,
  };
  const n = (o) => (o ? Object.entries(o).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k, v]) => `${Array.isArray(v) ? v.length : v} ${k}`).join(', ') || 'none' : 'none');
  const text = [
    `Icon Forge Showcase — data migration, ${at}`,
    '',
    `Result: ${ok ? 'complete' : 'INCOMPLETE — it will run again on the next start; nothing was deleted'}`,
    `Moved from: ${s.from}`,
    `Moved to:   ${L.data}`,
    '',
    `Projects:  ${n(summary.projects)}   (data/projects/<id>/)`,
    `Files:     ${n(summary.files)}   (data/projects/_files/)`,
    `Presets:   ${n(summary.presets)}   (data/settings/presets.json)`,
    `Settings:  ${n(summary.settings)}   (data/settings/)`,
    '',
    summary.projects?.conflict?.length ? 'Projects that already existed with different content were NOT replaced; the older copy is in data/projects/_conflicts/.\n' : '',
    'The original data was left untouched in the folder above. Once you have checked that your projects',
    'open correctly you may delete that folder yourself; the app never deletes it.',
    ...(problems.length ? ['', 'Problems:', ...problems.map((p) => '  - ' + p)] : []),
    '',
  ].join('\n');
  fs.mkdirSync(L.migration, { recursive: true });
  fs.writeFileSync(path.join(L.migration, `report-${store.stamp()}.json`), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(L.migration, 'report.txt'), text);
  writeState({ ...s, phase: ok ? 'done' : 'failed', finishedAt: at });
  if (ok) log.info('migrate', `done: ${n(summary.projects)} projects, ${n(summary.files)} files`);
  else log.error('migrate', 'incomplete:', problems.slice(0, 20).join('; '));
  return { ok, problems: problems.slice(0, 20), projects: projectIds.length, reportPath: path.join(L.migration, 'report.txt') };
}

module.exports = { prepare, status, importProject, importBlob, importPreset, importKV, finish, inUse };
