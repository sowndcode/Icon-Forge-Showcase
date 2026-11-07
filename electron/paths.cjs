// Where the app keeps its files. Everything lives next to the app, in <project>/data and
// <project>/exports, resolved from this file's location (never from the working directory).
const path = require('node:path');
const fs = require('node:fs');

/** The project folder: the folder holding package.json (or, in a packaged build, the folder holding the .exe). */
function projectRoot(app) {
  return app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
}

function layout(dataDir, exportsDir) {
  const data = path.resolve(dataDir);
  return {
    data,
    settings: path.join(data, 'settings'),
    projects: path.join(data, 'projects'),
    // original imported images and fonts, one file per asset (shared by the projects that use them)
    files: path.join(data, 'projects', '_files'),
    conflicts: path.join(data, 'projects', '_conflicts'),
    autosaves: path.join(data, 'autosaves'),
    // deleted projects (with their files) until the trash is emptied; single deleted files for 30 days
    trash: path.join(data, 'trash'),
    trashProjects: path.join(data, 'trash', 'projects'),
    trashFiles: path.join(data, 'trash', 'files'),
    cache: path.join(data, 'cache'),
    // the Chromium profile: GPU/code caches, local UI conveniences (panel folds, recent colours)
    profile: path.join(data, 'cache', 'chromium'),
    logs: path.join(data, 'logs'),
    migration: path.join(data, 'migration'),
    exports: path.resolve(exportsDir),
  };
}

function ensureDirs(l) {
  for (const d of [l.settings, l.projects, l.files, l.autosaves, l.trashProjects, l.trashFiles, l.profile, l.logs]) fs.mkdirSync(d, { recursive: true });
}

/** True when files can be created in `dir` (creating it if needed). */
function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve `rel` inside `root`; throws when it would escape it. Backslashes count as separators on
 * every system, so "..\\..\\x" from the window is refused on macOS and Linux exactly as on Windows.
 */
function safeJoin(root, rel) {
  const base = path.resolve(root);
  const clean = String(rel).replace(/\\/g, '/');
  if (clean.includes('\0')) throw new Error('Invalid path');
  const full = path.resolve(base, clean);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Invalid path');
  return full;
}

module.exports = { projectRoot, layout, ensureDirs, writable, safeJoin };
