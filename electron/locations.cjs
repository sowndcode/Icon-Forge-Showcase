// Where earlier copies of the app kept their data, so a new copy can find it.
//
// The app keeps its data in a "data" folder next to itself (portable). Extracting a new release into
// another folder therefore starts with no projects, and the earlier projects can look lost (they are
// still in the old folder). Each start records its data folder in a small list in the user's profile,
// outside every app folder; a start with no projects that finds an earlier folder with projects
// offers to COPY them. Nothing is ever moved, deleted or overwritten:
//   - the copy goes to a staging folder inside the new data folder first, is checked file by file
//     (count and sizes), and only then renamed into place;
//   - it only runs when this data folder has no projects, so nothing here can be replaced;
//   - the earlier folder is only read, and stays as it was (a backup by construction).
const path = require('node:path');
const fs = require('node:fs');

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_ENTRIES = 12;

/** Number of projects in a data folder (project folders holding a project file). */
function projectCount(dataDir) {
  try {
    return fs
      .readdirSync(path.join(dataDir, 'projects'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && ID.test(d.name) && !d.name.startsWith('_') && fs.existsSync(path.join(dataDir, 'projects', d.name, 'project.json'))).length;
  } catch {
    return 0;
  }
}

function readList(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(v?.locations) ? v : { locations: [] };
  } catch {
    return { locations: [] };
  }
}

function writeList(file, list) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1));
  fs.renameSync(tmp, file);
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Record this data folder (most recent first). Returns the list. */
function remember(file, dataDir, now = Date.now()) {
  const list = readList(file);
  const prev = list.locations.find((l) => same(l.path, dataDir));
  const entry = { path: path.resolve(dataDir), lastUsed: now, projects: projectCount(dataDir), dismissed: prev?.dismissed ?? [] };
  list.locations = [entry, ...list.locations.filter((l) => !same(l.path, dataDir))].slice(0, MAX_ENTRIES);
  writeList(file, list);
  return list;
}

/**
 * An earlier data folder worth offering when this one has no projects: it still exists, holds
 * projects and was not declined from this folder. Most recently used first.
 */
function earlierData(file, dataDir) {
  if (projectCount(dataDir) > 0) return null;
  const list = readList(file);
  const here = list.locations.find((l) => same(l.path, dataDir));
  const declined = new Set((here?.dismissed ?? []).map((p) => path.resolve(p).toLowerCase()));
  for (const l of list.locations.slice().sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))) {
    if (same(l.path, dataDir) || declined.has(path.resolve(l.path).toLowerCase())) continue;
    const n = projectCount(l.path);
    if (n > 0) return { path: path.resolve(l.path), projects: n, lastUsed: l.lastUsed };
  }
  return null;
}

/** Don't offer `from` again for this data folder. */
function decline(file, dataDir, from) {
  const list = readList(file);
  let here = list.locations.find((l) => same(l.path, dataDir));
  if (!here) {
    here = { path: path.resolve(dataDir), lastUsed: Date.now(), projects: 0, dismissed: [] };
    list.locations.unshift(here);
  }
  here.dismissed = [...new Set([...(here.dismissed ?? []), path.resolve(from)])];
  writeList(file, list);
}

function listFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push({ rel: path.relative(root, p), size: fs.statSync(p).size });
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

/**
 * Copy the projects (with their images) and, when this folder has none yet, the settings and saved
 * presets of `from` into `dataDir`. Returns { projects, files }. Throws without changing anything
 * when the copy cannot be verified; this folder must have no projects.
 */
function copyEarlier(from, dataDir) {
  if (projectCount(dataDir) > 0) throw new Error('This data folder already has projects; nothing was copied.');
  if (same(from, dataDir)) throw new Error('That is this data folder.');
  const parts = [['projects', true]];
  const settingsHere = path.join(dataDir, 'settings');
  const hasOwnSettings = ['preferences.json', 'presets.json'].some((f) => fs.existsSync(path.join(settingsHere, f)));
  if (!hasOwnSettings) parts.push(['settings', false]);
  const staging = path.join(dataDir, `.copy-in-progress-${process.pid}`);
  fs.rmSync(staging, { recursive: true, force: true });
  let files = 0;
  let placed = false;
  try {
    for (const [name] of parts) {
      const src = path.join(from, name);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(staging, name);
      fs.cpSync(src, dst, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
      const a = listFiles(src),
        b = new Map(listFiles(dst).map((f) => [f.rel, f.size]));
      for (const f of a) if (b.get(f.rel) !== f.size) throw new Error(`Could not copy ${f.rel} completely.`);
      files += a.length;
    }
    // verified: put each part in place (an empty folder made at start-up may be there already)
    for (const [name] of parts) {
      const staged = path.join(staging, name);
      if (!fs.existsSync(staged)) continue;
      const target = path.join(dataDir, name);
      if (fs.existsSync(target)) {
        // only empty folders (or, for projects, folders without projects) are replaced
        const left = listFiles(target).filter((f) => !f.rel.startsWith('_'));
        if (name === 'settings' ? left.some((f) => /(preferences|presets)\.json$/.test(f.rel)) : projectCount(dataDir) > 0) throw new Error(`${name} appeared while copying; nothing was replaced.`);
        const aside = path.join(staging, `${name}.before`);
        placed = true;
        fs.renameSync(target, aside);
        fs.renameSync(staged, target);
        // what was here (e.g. an empty _files folder) is kept beside the copy, never lost
        for (const f of listFiles(aside)) {
          const to = path.join(target, f.rel);
          if (!fs.existsSync(to)) {
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(path.join(aside, f.rel), to);
          }
        }
      } else {
        placed = true;
        fs.renameSync(staged, target);
      }
    }
  } catch (e) {
    // before anything was put in place the staging copy is just a copy; after, it may hold the only
    // copy of what was here, so it stays (named .copy-in-progress-…) for the log to point at
    if (!placed) fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  fs.rmSync(staging, { recursive: true, force: true });
  return { projects: projectCount(dataDir), files };
}

module.exports = { projectCount, remember, earlierData, decline, copyEarlier };
