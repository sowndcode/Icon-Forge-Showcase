// Icon Forge Showcase desktop shell. Loads the built UI from disk through a private app://
// protocol — no web server, no localhost, no network. Native dialogs, file writing and the app's own
// storage (data/ next to the app) go through IPC.
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu, session, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const paths = require('./paths.cjs');
const log = require('./log.cjs');
const store = require('./store.cjs');
const migrate = require('./migrate.cjs');
const locations = require('./locations.cjs');

const startedAt = Date.now();
const DIST = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webp': 'image/webp',
};
const APP_ORIGIN = 'app://showcase';
const MAX_OPEN_BYTES = 2 * 1024 ** 3;
const dev = !app.isPackaged;
const smoke = dev && !!process.env.SC_CAPTURE;

// ---------------------------------------------------------------------------
// Where things are kept (must be decided before the app is ready)
// ---------------------------------------------------------------------------

const ROOT = paths.projectRoot(app);
// the profile used by earlier versions (%APPDATA%\asset-forge-showcase) — read once for the migration, never written
const LEGACY_PROFILES = smoke ? [process.env.SC_LEGACY_PROFILE] : [path.join(app.getPath('appData'), 'asset-forge-showcase'), path.join(app.getPath('appData'), 'Asset Forge Showcase')];
// development smoke tests run with their own data folder so they never touch real data
const DATA_DIR = (dev && process.env.SC_DATA_DIR) || (smoke ? path.join(app.getPath('temp'), 'showcase-smoke-' + process.pid, 'data') : path.join(ROOT, 'data'));
let L = paths.layout(DATA_DIR, dev && process.env.SC_DATA_DIR ? path.join(DATA_DIR, '..', 'exports') : path.join(ROOT, 'exports'));
let storageWarning = null;
if (!paths.writable(L.data)) {
  // e.g. the project folder is read-only: keep working from the user profile instead, and say so
  storageWarning = `The data folder can't be written to:\n${L.data}\n\nThis session saves to:\n${path.join(app.getPath('userData'), 'data')}`;
  L = paths.layout(path.join(app.getPath('userData'), 'data'), path.join(app.getPath('userData'), 'exports'));
}
paths.ensureDirs(L);
log.init(L.logs);
store.init(L);
app.setPath('userData', L.profile);
app.setPath('sessionData', L.profile);
app.setPath('crashDumps', path.join(L.logs, 'crashes'));

// one app at a time — checked before anything is copied, so a double start can't migrate twice
const gotLock = app.requestSingleInstanceLock();
let migration = { phase: 'none' };
if (gotLock) {
  try {
    migration = migrate.prepare(L, LEGACY_PROFILES);
  } catch (e) {
    log.error('migrate', 'could not copy earlier data', e);
    migration = { phase: 'error', error: e.message };
  }
}

if (gotLock) log.info('app', `start v${app.getVersion()} (electron ${process.versions.electron})${dev ? ' dev' : ''}, data: ${L.data}`);
process.on('uncaughtException', (e) => log.error('main', 'uncaught', e));
process.on('unhandledRejection', (e) => log.error('main', 'unhandled rejection', e));

// Data folders used by copies of the app on this computer, kept outside every app folder
// (development runs with their own data folder use their own list, so tests never touch the real one)
const LOCATIONS = (dev && process.env.SC_LOCATIONS) || path.join(app.getPath('appData'), 'Icon Forge Showcase', 'data-locations.json');

/**
 * A new copy of the app (e.g. a release extracted to another folder) starts with no projects. When an
 * earlier data folder with projects exists, offer to copy them here; the earlier folder is only read.
 */
function offerEarlierData() {
  if (smoke || (dev && process.env.SC_DATA_DIR && !process.env.SC_LOCATIONS)) return;
  try {
    const found = locations.earlierData(LOCATIONS, L.data);
    if (found) {
      const when = found.lastUsed ? new Date(found.lastUsed).toLocaleDateString() : 'earlier';
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Icon Forge Showcase',
        message: `Projects from another copy of Icon Forge Showcase were found (${found.projects} project${found.projects === 1 ? '' : 's'}, last used ${when}).`,
        detail: `${found.path}\n\nCopy them into this copy's data folder? The other folder is only read and stays exactly as it is.`,
        buttons: ['Copy projects here', 'Not now', "Don't ask again"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (choice === 0) {
        try {
          const r = locations.copyEarlier(found.path, L.data);
          log.info('locations', `copied ${r.projects} projects (${r.files} files) from ${found.path}`);
          dialog.showMessageBoxSync({ type: 'info', title: 'Icon Forge Showcase', message: `Copied ${r.projects} project${r.projects === 1 ? '' : 's'}.`, detail: `The other folder was not changed:\n${found.path}` });
        } catch (e) {
          log.error('locations', 'copy failed', e);
          dialog.showMessageBoxSync({ type: 'warning', title: 'Icon Forge Showcase', message: 'The projects could not be copied.', detail: `${e.message}\n\nNothing was deleted. The other folder still has every project:\n${found.path}` });
        }
      } else if (choice === 2) locations.decline(LOCATIONS, L.data, found.path);
    }
    locations.remember(LOCATIONS, L.data);
  } catch (e) {
    log.warn('locations', 'could not check earlier data folders', e);
  }
}

// when the UI was last loaded — a newer build on disk means a relaunch should reload it
let loadedAt = 0;
const STATE_FILE = () => path.join(L.settings, 'window-state.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Block every network request that isn't our own files: the app is fully offline by design.
function lockDownNetwork(s) {
  s.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !/^(app|devtools|blob|data):/.test(details.url) }));
  // no camera, microphone, location, notifications…; only what the UI uses (copying text, fullscreen)
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
  s.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  s.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') return s;
  } catch {
    /* first start or damaged: defaults */
  }
  return { width: 1600, height: 950, maximized: true };
}

function createWindow() {
  const state = loadWindowState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1280,
    minHeight: 720,
    title: 'Icon Forge Showcase',
    // the app's window colour (--bg-0), so nothing flashes while the page loads
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#eeeef0',
    autoHideMenuBar: true,
    show: false,
    // Windows takes the multi-size .ico (title bar 16 px, taskbar 24–32 px, Alt+Tab 48 px…)
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => {
    win.show();
    log.info('app', `window shown after ${Date.now() - startedAt} ms`);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN + '/')) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  // let the page's beforeunload (pending autosave) decide; never lose work silently
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Wait for save', 'Close anyway'], defaultId: 0, message: 'Your latest changes are still being saved.', detail: 'Close anyway? (Work is autosaved within a second.)' });
    if (choice === 1) e.preventDefault();
  });
  win.webContents.on('render-process-gone', (_e, d) => log.error('app', 'window process ended:', d.reason, d.exitCode));
  win.webContents.on('unresponsive', () => log.warn('app', 'window not responding'));
  win.on('close', () => {
    try {
      const b = win.getNormalBounds();
      fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch {
      /* not critical */
    }
  });
  win.webContents.on('did-finish-load', () => (loadedAt = Date.now()));
  win.loadURL(APP_ORIGIN + '/index.html');
  // Development-only smoke test: SC_CAPTURE=<file.png> saves a screenshot after start-up and quits.
  if (smoke) {
    win.webContents.on('console-message', (e) => console.log('[page]', e.message));
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        console.log('native bridge:', await win.webContents.executeJavaScript('typeof window.showcaseNative'));
        if (process.env.SC_FILES) {
          // simulate dropping files onto the window, then report the analysis result
          const files = process.env.SC_FILES.split('|').map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
          await win.webContents.executeJavaScript(`(async () => {
            const dt = new DataTransfer();
            for (const f of ${JSON.stringify(files)}) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: 'image/png' }));
            window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
          })()`);
          await new Promise((r) => setTimeout(r, 4000));
          console.log('import result:', await win.webContents.executeJavaScript(`[...document.querySelectorAll('.libtile')].length + ' tiles; ' + document.querySelector('.statusbar')?.textContent`));
        }
        if (process.env.SC_EVAL) console.log('eval:', JSON.stringify(await win.webContents.executeJavaScript(process.env.SC_EVAL)));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SC_CAPTURE, img.toPNG());
        console.log('captured', process.env.SC_CAPTURE);
        app.quit();
      }, Number(process.env.SC_WAIT) || 3500),
    );
  }
  return win;
}

// ---------------------------------------------------------------------------
// Native bridge (used by the renderer through preload.cjs)
// ---------------------------------------------------------------------------

/** Only our own page may call the bridge. */
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    const url = e.senderFrame?.url ?? '';
    if (!url.startsWith(APP_ORIGIN + '/')) {
      log.warn('ipc', `refused ${channel} from ${url.slice(0, 80)}`);
      throw new Error('Not permitted');
    }
    return fn(e, ...args);
  });
}

// paths the user picked in a dialog this session — writes are only allowed there
const allowedFiles = new Set();
const allowedDirs = new Set();
// the save dialog reopens where the user saved last (exports/ until then)
let lastSaveDir = null;

function exportDir() {
  if (lastSaveDir && fs.existsSync(lastSaveDir)) return lastSaveDir;
  try {
    fs.mkdirSync(L.exports, { recursive: true });
    return L.exports;
  } catch {
    return app.getPath('documents');
  }
}

/** "name.png" → "name_2.png", "name_3.png"… until the name is free in `dir`. */
function uniqueName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 10000; i++) {
    const n = `${stem}_${i}${ext}`;
    if (!fs.existsSync(path.join(dir, n))) return n;
  }
  return `${stem}_${Date.now()}${ext}`;
}

// Windows device names ("NUL.png", "con.txt") never become files there; prefix them
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
const cleanName = (n) => {
  const s = String(n ?? 'export').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').slice(0, 200) || 'export';
  return RESERVED.test(s.split('.')[0]) ? `_${s}` : s;
};
/** Each segment of a relative path cleaned like a file name ('..' is left for safeJoin to refuse). */
const cleanRel = (rel) => String(rel).split(/[\\/]+/).filter(Boolean).map((seg) => (seg === '..' || seg === '.' ? seg : cleanName(seg))).join('/');
const cleanFilters = (f) => (Array.isArray(f) ? f.slice(0, 10).map((x) => ({ name: String(x?.name ?? '').slice(0, 80), extensions: (Array.isArray(x?.extensions) ? x.extensions : []).map((e) => String(e).replace(/[^\w*]/g, '')).slice(0, 20) })) : undefined);

/** Plain-language reason for a failed file write (shown in the app's error message). */
function writeError(e, file) {
  const where = path.basename(file);
  const why = {
    ENOSPC: 'the disk is full',
    EDQUOT: 'the disk quota is used up',
    EACCES: 'Windows/macOS refused permission for this folder',
    EPERM: 'the file is read-only or in use by another program',
    EBUSY: 'the file is open in another program',
    EROFS: 'the drive is read-only',
    ENAMETOOLONG: 'the file name or folder path is too long',
    ENOENT: 'the folder no longer exists',
  }[e?.code];
  return new Error(why ? `Could not save ${where}: ${why}.` : `Could not save ${where}: ${e?.message ?? e}`);
}

/**
 * Write to a temporary file next to the target, then rename it into place, so an interrupted export
 * (full disk, crash, power cut) never leaves a half-written image under the real name.
 */
async function writeFileAtomic(file, buf) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}-${Date.now().toString(36)}.part`);
  try {
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, file);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => undefined);
    throw writeError(e, file);
  }
}

function toBuffer(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('Invalid file data');
}

handle('sc:chooseSavePath', async (e, defaultName, filters) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const dir = exportDir();
  // development smoke tests only: take the dialog's default answer without showing it
  if (smoke && process.env.SC_AUTO_SAVE) {
    const auto = path.join(dir, uniqueName(dir, cleanName(defaultName)));
    allowedFiles.add(auto);
    return auto;
  }
  const res = await dialog.showSaveDialog(win, { defaultPath: path.join(dir, uniqueName(dir, cleanName(defaultName))), filters: cleanFilters(filters) });
  if (res.canceled || !res.filePath) return null;
  allowedFiles.add(res.filePath);
  lastSaveDir = path.dirname(res.filePath);
  return res.filePath;
});

handle('sc:writeFile', async (_e, file, data) => {
  if (!allowedFiles.has(file)) throw new Error('Write not permitted');
  await writeFileAtomic(file, toBuffer(data));
  return path.basename(file);
});

handle('sc:pickFolder', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (smoke && process.env.SC_AUTO_SAVE) {
    const auto = exportDir();
    allowedDirs.add(auto);
    return auto;
  }
  const res = await dialog.showOpenDialog(win, { title: 'Choose export folder', defaultPath: exportDir(), properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  allowedDirs.add(res.filePaths[0]);
  lastSaveDir = res.filePaths[0];
  return res.filePaths[0];
});

handle('sc:writeInFolder', async (_e, root, rel, data, keepExisting) => {
  if (!allowedDirs.has(root)) throw new Error('Write not permitted');
  let full = paths.safeJoin(root, cleanRel(rel));
  const buf = toBuffer(data);
  await fs.promises.mkdir(path.dirname(full), { recursive: true }).catch((e) => {
    throw writeError(e, full);
  });
  if (keepExisting) full = path.join(path.dirname(full), uniqueName(path.dirname(full), path.basename(full)));
  await writeFileAtomic(full, buf);
  return path.basename(full);
});

handle('sc:openFile', async (e, filters) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: cleanFilters(filters) });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  // a project file is read whole; refuse what can't fit in memory instead of crashing the window
  const st = await fs.promises.stat(file);
  if (st.size > MAX_OPEN_BYTES) throw new Error(`${path.basename(file)} is ${(st.size / 1024 ** 3).toFixed(1)} GB — too large to open (the limit is ${MAX_OPEN_BYTES / 1024 ** 3} GB).`);
  const buf = await fs.promises.readFile(file);
  return { path: file, name: path.basename(file), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
});

// The native title bar and dialogs follow the app's theme (Windows 10 1809+ and 11 draw a dark title
// bar for 'dark'). Only these three values are accepted.
handle('sc:setTheme', (_e, theme) => {
  if (theme !== 'dark' && theme !== 'light' && theme !== 'system') throw new Error('Invalid theme');
  nativeTheme.themeSource = theme;
});

handle('sc:appInfo', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, dataPath: L.data, exportsPath: L.exports }));
handle('sc:openDataFolder', async () => (await shell.openPath(L.data)) || null);

handle('sc:openFolder', async (_e, dir) => {
  if (!allowedDirs.has(dir)) return 'not permitted';
  return (await shell.openPath(dir)) || null;
});

// storage
handle('sc:store:listProjects', () => store.listProjects());
handle('sc:store:getProject', (_e, id) => store.getProject(id));
handle('sc:store:putProject', (_e, p) => store.putProject(p));
handle('sc:store:deleteProject', (_e, id) => store.deleteProject(id));
handle('sc:store:getBlob', (_e, key) => store.getBlob(key));
handle('sc:store:putBlob', (_e, key, data, type) => store.putBlob(key, data, typeof type === 'string' ? type : ''));
handle('sc:store:deleteBlob', (_e, key) => store.deleteBlob(key));
handle('sc:store:listPresets', () => store.listPresets());
handle('sc:store:putPreset', (_e, p) => store.putPreset(p));
handle('sc:store:deletePreset', (_e, id) => store.deletePreset(id));
handle('sc:store:getKV', (_e, key) => store.getKV(key));
handle('sc:store:setKV', (_e, key, value) => store.setKV(key, value));
handle('sc:store:usage', () => store.usage());
handle('sc:store:usageDetail', () => store.usageDetail());
handle('sc:store:listTrash', () => store.listTrash());
handle('sc:store:restoreTrash', (_e, trashId) => store.restoreTrash(trashId));
handle('sc:store:purgeTrash', (_e, ids) => store.purgeTrash(ids));

// migration of data saved by earlier versions
handle('sc:migrate:status', () => migrate.status());
handle('sc:migrate:project', (_e, p) => migrate.importProject(p));
handle('sc:migrate:blob', (_e, key, data, type) => migrate.importBlob(key, data, typeof type === 'string' ? type : ''));
handle('sc:migrate:preset', (_e, p) => migrate.importPreset(p));
handle('sc:migrate:kv', (_e, key, value) => migrate.importKV(key, value));
handle('sc:migrate:finish', (_e, summary) => migrate.finish(summary ?? {}));

// errors from the window end up in data/logs/main.log (rate-limited)
let logBudget = { at: 0, n: 0 };
handle('sc:log', (_e, level, msg) => {
  const now = Date.now();
  if (now - logBudget.at > 60_000) logBudget = { at: now, n: 0 };
  if (++logBudget.n > 50) return;
  (level === 'error' ? log.error : level === 'warn' ? log.warn : log.info)('window', String(msg).slice(0, 4000));
});

// ---------------------------------------------------------------------------

async function serveApp(req) {
  try {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = paths.safeJoin(DIST, '.' + rel);
    const st = await fs.promises.stat(file).catch(() => null);
    if (!st?.isFile()) return new Response('Not found', { status: 404 });
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers = { 'content-type': type, 'x-content-type-options': 'nosniff' };
    if (type.startsWith('text/html')) {
      headers['content-security-policy'] =
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data:; font-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
    }
    return new Response(await fs.promises.readFile(file), { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// Windows groups the taskbar button and takes its icon by this id (without it, a development run
// shows Electron's icon and a packaged build may not pin correctly)
if (process.platform === 'win32') app.setAppUserModelId('com.iconforge.showcase');

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
      // started again after an update: reload so the open window runs the newest build
      try {
        if (fs.statSync(path.join(DIST, 'index.html')).mtimeMs > loadedAt) w.webContents.reload();
      } catch {
        /* not critical */
      }
    }
  });
  app.on('child-process-gone', (_e, d) => d.reason !== 'clean-exit' && log.warn('app', `${d.type} process ended: ${d.reason}`));
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    if (migration.phase === 'blocked') {
      // an earlier version is still open on the old data: moving it now could lose its latest changes
      log.warn('migrate', 'earlier version still open; migration postponed');
      dialog.showMessageBoxSync({
        type: 'info',
        buttons: ['OK'],
        title: 'Icon Forge Showcase',
        message: 'An earlier Icon Forge Showcase is still open or still saving.',
        detail: 'Close any other Icon Forge Showcase window, wait a few seconds, then start the app again.\n\nOn that start your projects and settings are moved into the "data" folder next to the app. Nothing is deleted.',
      });
      app.quit();
      return;
    }
    offerEarlierData();
    if (storageWarning) dialog.showMessageBox({ type: 'warning', title: 'Icon Forge Showcase', message: 'Saving outside the app folder', detail: storageWarning });
    if (migration.phase === 'error') dialog.showMessageBox({ type: 'warning', title: 'Icon Forge Showcase', message: 'Earlier data could not be copied', detail: `${migration.error}\n\nNothing was deleted. Details are in data/logs/main.log.` });
    protocol.handle('app', serveApp);
    lockDownNetwork(session.defaultSession);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
