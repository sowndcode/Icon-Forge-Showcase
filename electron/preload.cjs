// Exposes a tiny, explicit native API to the UI. No Node access is given to the page itself.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Errors from the main process arrive as "Error invoking remote method 'sc:x': Error: <reason>";
// pass on just the reason, which is written for people.
const invoke = (channel, ...args) =>
  ipcRenderer.invoke(channel, ...args).catch((e) => {
    throw new Error(String(e?.message ?? e).replace(/^Error invoking remote method '[^']*': (?:Error: )?/, ''));
  });
const call = (channel) => (...args) => invoke(channel, ...args);

contextBridge.exposeInMainWorld('showcaseNative', {
  chooseSavePath: (name, filters) => invoke('sc:chooseSavePath', name, filters),
  writeFile: (file, data) => invoke('sc:writeFile', file, data),
  pickFolder: () => invoke('sc:pickFolder'),
  writeInFolder: (root, rel, data, keepExisting) => invoke('sc:writeInFolder', root, rel, data, keepExisting),
  openFile: (filters) => invoke('sc:openFile', filters),
  openFolder: (dir) => invoke('sc:openFolder', dir),
  setZoom: (f) => webFrame.setZoomFactor(Math.max(0.7, Math.min(1.6, Number(f) || 1))),
  appInfo: () => invoke('sc:appInfo'),
  setTheme: (theme) => invoke('sc:setTheme', theme).catch(() => undefined),
  openDataFolder: () => invoke('sc:openDataFolder'),
  log: (level, msg) => invoke('sc:log', level, msg).catch(() => undefined),
  // app storage in <project>/data
  store: {
    listProjects: call('sc:store:listProjects'),
    getProject: call('sc:store:getProject'),
    putProject: call('sc:store:putProject'),
    deleteProject: call('sc:store:deleteProject'),
    getBlob: call('sc:store:getBlob'),
    putBlob: call('sc:store:putBlob'),
    deleteBlob: call('sc:store:deleteBlob'),
    listPresets: call('sc:store:listPresets'),
    putPreset: call('sc:store:putPreset'),
    deletePreset: call('sc:store:deletePreset'),
    getKV: call('sc:store:getKV'),
    setKV: call('sc:store:setKV'),
    usage: call('sc:store:usage'),
    usageDetail: call('sc:store:usageDetail'),
    listTrash: call('sc:store:listTrash'),
    restoreTrash: call('sc:store:restoreTrash'),
    purgeTrash: call('sc:store:purgeTrash'),
  },
  migrate: {
    status: call('sc:migrate:status'),
    project: call('sc:migrate:project'),
    blob: call('sc:migrate:blob'),
    preset: call('sc:migrate:preset'),
    kv: call('sc:migrate:kv'),
    finish: call('sc:migrate:finish'),
  },
});
