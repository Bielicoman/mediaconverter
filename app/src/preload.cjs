'use strict';
// Ponte mínima entre a interface e o processo principal (contextIsolation + sandbox).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('mc', {
  window: { minimize: () => invoke('window:minimize'), maximize: () => invoke('window:maximize'), close: () => invoke('window:close'), onState: fn => on('window:state', fn) },
  watch: { list: () => invoke('watch:list'), add: (dir, targetId) => invoke('watch:add', dir, targetId), remove: id => invoke('watch:remove', id) },
  history: { list: () => invoke('history:list'), clear: () => invoke('history:clear'), onChanged: fn => on('history:changed', fn) },
  tools: { open: (files, focus) => invoke('tools:open', files, focus), onInit: fn => on('tools:init', fn) },
  gesture: () => invoke('gesture:status'),
  action: (action, files) => invoke('files:action', action, files),
  info: () => invoke('app:info'),
  settings: { get: () => invoke('settings:get'), update: patch => invoke('settings:update', patch) },
  dialog: { openFiles: () => invoke('dialog:openFiles'), openFolder: title => invoke('dialog:openFolder', title) },
  files: {
    drag: file => ipcRenderer.send('files:drag', file),
    describe: list => invoke('files:describe', list),
    scan: (dir, recursive) => invoke('files:scan', dir, recursive),
    probe: file => invoke('files:probe', file),
    fromClipboard: () => invoke('files:fromClipboard'),
    // Caminho real de um arquivo solto na janela (File de arrastar e soltar).
    pathOf: file => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } }
  },
  convert: {
    start: (jobs, opts) => invoke('convert:start', { jobs, opts }),
    cancel: id => invoke('convert:cancel', id),
    onStart: fn => on('convert:start', fn),
    onProgress: fn => on('convert:progress', fn),
    onDone: fn => on('convert:done', fn),
    onError: fn => on('convert:error', fn),
    onIdle: fn => on('convert:idle', fn)
  },
  shell: { showItem: p => invoke('shell:showItem', p), openPath: p => invoke('shell:openPath', p), openExternal: u => invoke('shell:openExternal', u) },
  engines: () => invoke('engines:status'),
  integration: { status: () => invoke('integration:status'), set: (what, enabled) => invoke('integration:set', what, enabled) },
  catalog: () => invoke('targets:catalog'),
  wheel: {
    drop: files => invoke('wheel:drop', files),
    close: () => invoke('wheel:close'),
    done: () => invoke('wheel:done'),
    openPanel: files => invoke('wheel:openPanel', files),
    pickFiles: () => invoke('wheel:pickFiles'),
    test: () => invoke('wheel:test'),
    onInit: fn => on('wheel:init', fn)
  },
  onAddFiles: fn => on('panel:addFiles', fn),
  onToast: fn => on('toast', fn)
});
