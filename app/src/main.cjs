'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, globalShortcut, screen, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

app.setName('Media Converter');
app.setAppUserModelId('com.alexascencio.mediaconverter.desktop');
try { app.setPath('userData', path.join(app.getPath('appData'), 'MediaConverter')); } catch (_) {}

const F = require('./core/formats.cjs');
const ff = require('./host/ffmpeg.cjs');
const ps = require('./host/powershell.cjs');
const engine = require('./host/engine.cjs');
const integ = require('./host/shell.cjs');
const { Settings, HOTKEYS } = require('./host/settings.cjs');

const ROOT = path.join(__dirname, '..');
const ICON_ICO = path.join(ROOT, 'icons', 'icon.ico');
const ICON_PNG = path.join(ROOT, 'icons', 'logo.png');
const VERSION = require('../package.json').version;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let settings;
let mainWindow = null;
let wheelWindow = null;
let tray = null;
let quitting = false;
const explorer = new ps.ExplorerHelper();
let officeCache = null;
let watcher;
let gestureMode = false, gestureTimer, gestureGeneration = 0;
const { Gesture } = require('./host/gesture.cjs');
const gesture = new Gesture(async () => {
  if (wheelBusy) return;
  const generation = ++gestureGeneration;
  gestureMode = true;
  const selection = await explorer.selection({ strict: true }).catch(() => null);
  const files = selection?.files.filter(file => { try { return fs.statSync(file).isFile(); } catch { return false; } }) || [];
  if (generation !== gestureGeneration) return;
  if (!gestureMode || wheelBusy || !files.length || !['explorer','desktop'].includes(selection?.source)) { gestureMode = false; return; }
  openWheel(files, 'gesture');
  clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => { if (gestureMode && !wheelBusy) closeWheel(); }, 20000);
}, () => {
  gestureGeneration++;
  clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => { if (gestureMode && !wheelBusy) closeWheel(); }, 1500);
});
function historyFile() { return path.join(app.getPath('userData'), 'history-v2.json'); }
function readHistory() { try { return JSON.parse(fs.readFileSync(historyFile(), 'utf8')).slice(0, 200); } catch (_) { return []; } }
function recordHistory(job, result) {
  const entry = { ...result, from: job.inputs[0], at: Date.now() };
  fs.writeFileSync(historyFile(), JSON.stringify([entry, ...readHistory()].slice(0, 200)));
  send(mainWindow, 'history:changed', readHistory());
}


// ---------- Janelas ----------
function trusted(event) {
  const wc = event.sender;
  const ok = (mainWindow && !mainWindow.isDestroyed() && wc === mainWindow.webContents) || (wheelWindow && !wheelWindow.isDestroyed() && wc === wheelWindow.webContents);
  if (!ok) throw new Error('Origem de chamada não permitida.');
}

function lockDown(win, file) {
  const url = require('url').pathToFileURL(file).href;
  const wc = win.webContents;
  wc.on('will-navigate', (e, target) => { if (target !== url) e.preventDefault(); });
  wc.on('will-attach-webview', e => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
}

function createMain({ show = true } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) { if (show) { mainWindow.show(); mainWindow.focus(); } return mainWindow; }
  mainWindow = new BrowserWindow({
    width: 1080, height: 820, minWidth: 700, minHeight: 620,
    frame: false, backgroundColor: '#070b09', show: false, center: true,
    title: 'Media Converter', icon: fs.existsSync(ICON_ICO) ? ICON_ICO : ICON_PNG,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  const file = path.join(__dirname, 'ui', 'index.html');
  lockDown(mainWindow, file);
  mainWindow.loadFile(file);
  mainWindow.once('ready-to-show', () => { if (show) mainWindow.show(); });
  mainWindow.on('close', e => {
    if (!quitting && settings.get().keepInTray) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('maximize', () => send(mainWindow, 'window:state', { maximized: true }));
  mainWindow.on('unmaximize', () => send(mainWindow, 'window:state', { maximized: false }));
  return mainWindow;
}

function send(win, channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// Roda: janela transparente centrada no cursor, presa à área útil do monitor.
const WHEEL_SIZE = 420;
function openWheel(files, source = 'menu') {
  const isGesture = source === 'gesture';
  if (!isGesture) gestureMode = false;
  const list = files.filter(f => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } });
  const point = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  const x = Math.round(Math.min(Math.max(point.x - WHEEL_SIZE / 2, area.x), area.x + area.width - WHEEL_SIZE));
  const y = Math.round(Math.min(Math.max(point.y - WHEEL_SIZE / 2, area.y), area.y + area.height - WHEEL_SIZE));
  const payload = wheelPayload(list, source);
  if (wheelWindow && !wheelWindow.isDestroyed()) {
    if (wheelBusy) { wheelWindow.show(); return; }
    wheelWindow.setBounds({ x, y, width: WHEEL_SIZE, height: WHEEL_SIZE });
    send(wheelWindow, 'wheel:init', payload);
    if (isGesture) wheelWindow.showInactive(); else { wheelWindow.show(); wheelWindow.focus(); }
    return;
  }
  wheelWindow = new BrowserWindow({
    x, y, width: WHEEL_SIZE, height: WHEEL_SIZE, frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    show: false, backgroundColor: '#00000000', title: 'Media Converter · roda rápida',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  wheelWindow.setAlwaysOnTop(true, 'pop-up-menu');
  const file = path.join(__dirname, 'ui', 'wheel.html');
  lockDown(wheelWindow, file);
  wheelWindow.loadFile(file);
  wheelWindow.webContents.once('did-finish-load', () => { send(wheelWindow, 'wheel:init', payload); if (isGesture) wheelWindow.showInactive(); else { wheelWindow.show(); wheelWindow.focus(); } });
  wheelWindow.on('blur', () => { if (!gestureMode && !wheelBusy && wheelWindow && !wheelWindow.isDestroyed()) closeWheel(); });
  wheelWindow.on('closed', () => { wheelWindow = null; wheelBusy = false; });
}
let wheelBusy = false;
function closeWheel() { gestureMode = false; clearTimeout(gestureTimer); if (wheelWindow && !wheelWindow.isDestroyed()) wheelWindow.close(); }

function wheelPayload(files, source) {
  const s = settings.get();
  const { categories, targets } = F.wheelTargets(files, s.wheel);
  return {
    source,
    files: files.map(f => ({ path: f, name: path.basename(f), ext: F.extOf(f), category: F.categoryOf(f) })),
    categories: categories.map(c => ({ id: c, label: F.CATEGORIES[c].label, plural: F.CATEGORIES[c].plural })),
    targets: targets.map(id => targetInfo(id)),
    layoutSlots: Math.max(1, ...Object.keys(F.BY_CATEGORY).map(cat => (s.wheel[cat] || F.WHEEL_DEFAULTS[cat] || []).filter(id => !F.TARGETS[id]?.tool).length)),
    allTargets: files.length ? F.commonTargets(files).targets.filter(id => files.every(f => F.isTargetValid(F.categoryOf(f), id, F.extOf(f)))).map(targetInfo) : F.WHEEL_DEFAULTS.image.map(targetInfo),
    theme: s.theme,
    gesture: source === 'gesture',
    outLabel: s.outMode === 'folder' && s.outDir ? s.outDir : 'Ao lado do original'
  };
}

function targetInfo(id) {
  const t = F.TARGETS[id];
  const info = { id, label: t.label, desc: t.desc, badge: t.badge, ext: t.ext, engine: t.engine, tool: Boolean(t.tool), folder: Boolean(t.folder), multi: Boolean(t.multi), available: true, reason: '' };
  if (process.platform !== 'win32' && (t.engine==='pdfwin'||(t.engine==='office'&&(t.folder||t.viaCsv||id.startsWith('pdf_'))))) {info.available=false;info.reason='Esta conversão específica usa componentes do Windows.';}
  if (t.engine === 'office' && officeCache && !officeCache[t.app]) {
    info.available = false;
    info.reason = process.platform!=='win32' ? 'Requer LibreOffice instalado' : { word: 'Requer Microsoft Word', excel: 'Requer Microsoft Excel', powerpoint: 'Requer Microsoft PowerPoint' }[t.app];
  }
  return info;
}

// ---------- Chamadas agrupadas do menu de contexto ----------
// Com vários arquivos selecionados o Explorador abre uma instância por arquivo; elas chegam
// aqui pela segunda instância e viram uma única roda.
let pending = [];
let pendingTimer = null;
function queueWheelFiles(files, source) {
  for (const f of files) if (!pending.includes(f)) pending.push(f);
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { const list = pending; pending = []; if (list.length) openWheel(list, source); else createMain(); }, 260);
}

function handleArgv(argv, first) {
  const { wheel, files } = integ.filesFromArgv(argv);
  if (wheel) { queueWheelFiles(files, 'menu'); return true; }
  if (!first || !argv.includes('--hidden')) createMain();
  return false;
}

// ---------- Atalho global ----------
async function onHotkey() {
  try {
    const sel = await explorer.selection();
    if (sel.files.length) openWheel(sel.files, sel.source);
    else openWheel([], 'empty');
  } catch (e) {
    openWheel([], 'empty');
  }
}

function applyHotkey() {
  globalShortcut.unregisterAll();
  const key = settings.get().hotkey;
  if (!key || key === 'off') return { key: 'off', registered: false };
  const registered = globalShortcut.register(key, onHotkey);
  return { key, registered };
}

// ---------- Bandeja ----------
function createTray() {
  const img = nativeImage.createFromPath(process.platform==='win32'&&fs.existsSync(ICON_ICO) ? ICON_ICO : ICON_PNG).resize({width:20,height:20});
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Media Converter');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Media Converter', click: () => createMain() },
    { label: 'Roda rápida com a seleção do Explorador', click: () => onHotkey() },
    { type: 'separator' },
    { label: 'Sair', click: () => quitApp() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => createMain());
}

async function quitApp() {
  if (busy()) {
    const r = await dialog.showMessageBox({ type: 'warning', buttons: ['Cancelar conversões e sair', 'Continuar convertendo'], defaultId: 1, cancelId: 1, title: 'Media Converter', message: 'Há conversões em andamento.', detail: 'Ao sair, as cópias incompletas são descartadas. Os originais não são alterados.' });
    if (r.response !== 0) return;
    cancel('all');
    await new Promise(res => setTimeout(res, 700));
  }
  quitting = true;
  app.quit();
}

// ---------- Fila de conversão ----------
// Duas faixas independentes: o painel e a roda. Uma conversão rápida pela roda não espera
// a fila longa do painel.
const lanes = { panel: { queue: [], running: null }, wheel: { queue: [], running: null } };
const controllers = new Map();

function enqueue(lane, jobs, opts, target) {
  for (const j of jobs) lanes[lane].queue.push({ ...j, opts, target });
  pump(lane);
}

async function pump(laneName) {
  const lane = lanes[laneName];
  if (lane.running) return;
  const job = lane.queue.shift();
  if (!job) return;
  lane.running = job;
  const ac = new AbortController();
  controllers.set(job.id, ac);
  const win = job.target();
  send(win, 'convert:start', { id: job.id });
  try {
    const result = await engine.convert({ inputs: job.inputs, targetId: job.targetId, opts: job.opts }, {
      signal: ac.signal,
      onProgress: f => send(job.target(), 'convert:progress', { id: job.id, fraction: f })
    });
    recordHistory(job, result);
    send(job.target(), 'convert:done', { id: job.id, result });
  } catch (e) {
    send(job.target(), 'convert:error', { id: job.id, message: e.message, cancelled: Boolean(e.cancelled) });
  } finally {
    controllers.delete(job.id);
    lane.running = null;
    if (!lane.queue.length) send(job.target(), 'convert:idle', { lane: laneName });
    pump(laneName);
  }
}

function cancel(id) {
  const removed = j => send(j.target(), 'convert:error', { id: j.id, message: 'Conversão cancelada.', cancelled: true });
  if (id === 'all') {
    for (const lane of Object.values(lanes)) { for (const job of lane.queue.splice(0)) removed(job); }
    for (const ac of controllers.values()) ac.abort();
    return;
  }
  for (const lane of Object.values(lanes)) { const i = lane.queue.findIndex(j => j.id === id); if (i >= 0) removed(lane.queue.splice(i, 1)[0]); }
  const ac = controllers.get(id);
  if (ac) ac.abort();
}

function busy() { return Object.values(lanes).some(l => l.running || l.queue.length); }

// ---------- Descrição de arquivos ----------
function describe(file) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch (_) { return null; }
  const category = F.categoryOf(file);
  const ext = F.extOf(file);
  const targets = F.targetsFor(category).filter(id => F.isTargetValid(category, id, ext)).map(targetInfo);
  const wheel = F.wheelTargets([file], settings.get().wheel).targets;
  const def = wheel.find(id => targets.some(t => t.id === id && t.available)) || (targets.find(t => t.available) || {}).id || '';
  return { path: file, name: path.basename(file), ext, size, category, categoryLabel: F.CATEGORIES[category].label, targets, defaultTarget: def };
}

const SKIP_DIRS = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information']);
function scanFolder(dir, recursive, limit = 5000) {
  const out = [];
  const walk = d => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (recursive && !SKIP_DIRS.has(e.name.toLowerCase()) && !e.name.startsWith('.')) walk(full); }
      else if (e.isFile() && !e.name.includes('.convertendo.') && !/^(desktop\.ini|thumbs\.db)$/i.test(e.name)) out.push(full);
    }
  };
  walk(dir);
  return { files: out, truncated: out.length >= limit };
}

async function thumbFor(file) {
  const cat = F.categoryOf(file);
  if (cat !== 'video' && cat !== 'image') return null;
  const st = fs.statSync(file);
  const key = crypto.createHash('sha1').update(file + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 20);
  const dir = path.join(app.getPath('userData'), 'miniaturas');
  fs.mkdirSync(dir, { recursive: true });
  // Imagens em PNG para manter a transparência; vídeos em JPG, mais leve.
  const out = path.join(dir, key + (cat === 'image' ? '.png' : '.jpg'));
  if (fs.existsSync(out)) return out;
  let src = file;
  const tmpDir = path.join(app.getPath('temp'), 'MediaConverter');
  if (cat === 'image' && F.IMAGE_DECODER[F.extOf(file)]) {
    fs.mkdirSync(tmpDir, { recursive: true });
    const work = fs.mkdtempSync(path.join(tmpDir, 'mini-'));
    try { src = await engine.decodableImage(file, work); await ff.thumbnail(src, out, {}); }
    finally { fs.rm(work, { recursive: true, force: true }, () => {}); }
    return fs.existsSync(out) ? out : null;
  }
  let at = 0;
  if (cat === 'video') { try { const p = await ff.probe(file); at = p.duration ? Math.min(p.duration * 0.1, 30) : 0; } catch (_) {} }
  await ff.thumbnail(src, out, { atSeconds: at });
  return fs.existsSync(out) ? out : null;
}

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => { trusted(event); return fn(event, ...args); });
}
const isStr = (s, max = 4096) => typeof s === 'string' && s.length > 0 && s.length <= max;
const isPathList = list => Array.isArray(list) && list.length <= 20000 && list.every(p => isStr(p) && path.isAbsolute(p));

function registerIpc() {
  ipcMain.on('files:drag', (event, file) => {
    try { trusted(event); if (isStr(file) && path.isAbsolute(file) && fs.statSync(file).isFile()) event.sender.startDrag({ file, icon: nativeImage.createFromPath(ICON_PNG).resize({ width: 48, height: 48 }) }); }
    catch (e) { send(BrowserWindow.fromWebContents(event.sender), 'toast', { type: 'error', text: e.message }); }
  });
  handle('window:minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
  handle('window:maximize', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
  handle('window:close', e => BrowserWindow.fromWebContents(e.sender)?.close());

  handle('watch:list', () => watcher.list());
  handle('watch:add', (_e, dir, targetId) => watcher.add(dir, targetId));
  handle('watch:remove', (_e, id) => watcher.remove(id));
  handle('history:list', () => readHistory());
  handle('history:clear', () => { fs.writeFileSync(historyFile(), '[]'); send(mainWindow, 'history:changed', []); return true; });
  handle('files:action', async (_e, action, files) => {
    if (!isPathList(files) || !files.length) throw new Error('Selecione arquivos.');
    if (action === 'copyPath') { clipboard.writeText(files.join('\n')); return true; }
    if (action === 'reveal') { shell.showItemInFolder(files[0]); return true; }
    if (action === 'open') { const error = await shell.openPath(files[0]); if (error) throw new Error(error); return true; }
    throw new Error('Ação desconhecida.');
  });
  handle('tools:open', (_e, files, focus) => {
    if (!isPathList(files) || !files.length) throw new Error('Selecione arquivos.');
    gestureMode = false; closeWheel();
    const win = createMain();
    const deliver = () => send(win, 'tools:init', { files, focus: isStr(focus, 80) ? focus : '' });
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver); else deliver();
    return true;
  });
  handle('wheel:drop', (_e, files) => {
    if (!isPathList(files) || !files.length) throw new Error('Solte arquivos locais.');
    gestureMode = false; clearTimeout(gestureTimer);
    wheelWindow?.show(); wheelWindow?.focus();
    return wheelPayload(files.filter(f => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } }), 'drop');
  });
  handle('gesture:status', () => ({ ready: gesture.ready, platform: process.platform }));
  handle('app:info', () => ({ version: VERSION, platform: process.platform, packaged: app.isPackaged, userData: app.getPath('userData'), hotkeys: HOTKEYS }));
  handle('settings:get', () => settings.get());
  handle('settings:update', async (_e, patch) => {
    const before = settings.get();
    const next = settings.update(patch);
    let hotkey = null;
    if (before.gesture !== next.gesture) gesture.start(next.gesture);
    if (before.hotkey !== next.hotkey) hotkey = applyHotkey();
    if (before.openAtLogin !== next.openAtLogin) await integ.setOpenAtLogin(app, next.openAtLogin);
    return { settings: next, hotkey };
  });

  handle('dialog:openFiles', async e => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Escolher arquivos para converter', properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });
  handle('dialog:openFolder', async (e, title) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: isStr(title, 200) ? title : 'Escolher pasta', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  handle('files:describe', (_e, list) => { if (!isPathList(list)) throw new Error('Lista inválida.'); return list.map(describe).filter(Boolean); });
  handle('files:scan', (_e, dir, recursive) => { if (!isStr(dir) || !fs.existsSync(dir)) throw new Error('Pasta inválida.'); return scanFolder(dir, Boolean(recursive)); });
  handle('files:probe', async (_e, file) => {
    if (!isStr(file) || !fs.existsSync(file)) return null;
    const cat = F.categoryOf(file);
    let probe = null;
    if (['video', 'audio', 'image'].includes(cat) && !F.IMAGE_DECODER[F.extOf(file)]) { try { probe = await ff.probe(file); } catch (_) {} }
    let thumb = null;
    try { thumb = await thumbFor(file); } catch (_) {}
    return { probe, thumb: thumb ? require('url').pathToFileURL(thumb).href : null };
  });
  handle('files:fromClipboard', () => {
    // Texto copiado com caminhos (um por linha) ou arquivo copiado no Explorador.
    const text = clipboard.readText().split(/\r?\n/).map(s => s.trim().replace(/^"|"$/g, '')).filter(s => s && path.isAbsolute(s) && fs.existsSync(s));
    return text;
  });

  handle('convert:start', (e, payload) => {
    const { jobs, opts } = payload || {};
    if (!Array.isArray(jobs) || !jobs.length || jobs.length > 20000) throw new Error('Nada para converter.');
    for (const j of jobs) if (!isStr(j.id, 80) || !isPathList(j.inputs) || !F.TARGETS[j.targetId]) throw new Error('Tarefa inválida.');
    const s = settings.convertOptions();
    const merged = require('./core/options.cjs').options({ ...s, ...(opts || {}) });
    const lane = wheelWindow && e.sender === wheelWindow.webContents ? 'wheel' : 'panel';
    const target = lane === 'wheel' ? () => wheelWindow : () => mainWindow;
    if (lane === 'wheel') wheelBusy = true;
    enqueue(lane, jobs.map(j => ({ id: j.id, inputs: j.inputs, targetId: j.targetId, opts: merged })), merged, target);
    return { queued: jobs.length, lane };
  });
  handle('convert:cancel', (_e, id) => { cancel(isStr(id, 80) ? id : 'all'); return true; });

  handle('shell:showItem', (_e, p) => { if (isStr(p) && fs.existsSync(p)) { shell.showItemInFolder(p); return true; } return false; });
  handle('shell:openPath', async (_e, p) => { if (isStr(p) && fs.existsSync(p)) { const err = await shell.openPath(p); return !err; } return false; });
  handle('shell:openExternal', async (_e, url) => {
    try { const u = new URL(url); if (u.protocol === 'https:') { await shell.openExternal(u.href); return true; } } catch (_) {}
    return false;
  });

  handle('engines:status', async () => {
    const out = { ffmpeg: null, gpu: null, office: null, pdf: process.platform==='win32', explorer: false, platform:process.platform };
    try { out.ffmpeg = ff.available() ? await ff.version() : null; } catch (_) {}
    try { out.gpu = await ff.detectGpu(); } catch (_) {}
    try { officeCache = await ps.officeApps(); out.office = officeCache; } catch (_) {}
    if(process.platform==='win32')try { await explorer.start(); out.explorer = true; } catch (_) {}
    return out;
  });

  handle('integration:status', async () => ({
    contextMenu: await integ.contextMenuStatus(),
    sendTo: integ.sendToStatus(app),
    openAtLogin: (await integ.openAtLoginStatus()).enabled,
    hotkey: { key: settings.get().hotkey, registered: settings.get().hotkey !== 'off' && globalShortcut.isRegistered(settings.get().hotkey) }
  }));
  handle('integration:set', async (_e, what, enabled) => {
    if (what === 'contextMenu') return enabled ? integ.enableContextMenu(app, ICON_ICO) : integ.disableContextMenu();
    if (what === 'sendTo') return enabled ? integ.enableSendTo(app, shell, ICON_ICO) : integ.disableSendTo(app);
    if (what === 'openAtLogin') {
      const r = await integ.setOpenAtLogin(app, Boolean(enabled));
      settings.update({ openAtLogin: r.enabled });
      return r;
    }
    throw new Error('Integração desconhecida.');
  });

  handle('targets:catalog', () => ({
    categories: Object.fromEntries(Object.entries(F.CATEGORIES).map(([k, v]) => [k, { ...v, targets: F.BY_CATEGORY[k].map(targetInfo), wheelDefault: F.WHEEL_DEFAULTS[k] }])),
    unlimitedSlices: true
  }));

  // Roda
  handle('wheel:close', () => { if (!wheelBusy) closeWheel(); return true; });
  handle('wheel:done', () => { wheelBusy = false; return true; });
  handle('wheel:openPanel', (_e, files) => {
    closeWheel();
    const win = createMain();
    const list = isPathList(files) ? files : [];
    const deliver = () => send(win, 'panel:addFiles', list);
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver); else deliver();
    return true;
  });
  handle('wheel:test', () => { onHotkey(); return true; });
  handle('wheel:pickFiles', async () => {
    wheelBusy = true;
    try {
      const r = await dialog.showOpenDialog(wheelWindow, { title: 'Escolher arquivos para a roda', properties: ['openFile', 'multiSelections'] });
      if (!r.canceled && r.filePaths.length) send(wheelWindow, 'wheel:init', wheelPayload(r.filePaths, 'dialog'));
      return !r.canceled;
    } finally { wheelBusy = false; }
  });
}

// ---------- Ciclo de vida ----------
app.on('second-instance', (_e, argv) => handleArgv(argv, false));

app.whenReady().then(async () => {
  settings = new Settings(app.getPath('userData'));
  ff.setBinDir(path.join(ROOT, 'bin'));
  engine.setTempRoot(path.join(app.getPath('temp'), 'MediaConverter'));
  registerIpc();
  createTray();
  applyHotkey();
  gesture.start(settings.get().gesture);
  watcher = new (require('./host/watch.cjs').WatchFolders)(path.join(app.getPath('userData'), 'watch-folders.json'), async (file, rule) => {
    fs.mkdirSync(rule.outDir, { recursive: true });
    enqueue('panel', [{ id: 'watch-' + crypto.randomUUID(), inputs: [file], targetId: rule.targetId }], { ...settings.convertOptions(), outDir: rule.outDir }, () => null);
  });
  ps.officeApps().then(r => { officeCache = r; }).catch(() => {});
  setTimeout(() => explorer.start().catch(() => {}), 1500);
  const opened = handleArgv(process.argv, true);
  if (!opened && process.argv.includes('--hidden')) { /* só a bandeja */ }
});

app.on('window-all-closed', () => { if (!settings || !settings.get().keepInTray) { quitting = true; app.quit(); } });
app.on('before-quit', e => {
  if (busy() && !quitting) { e.preventDefault(); createMain(); send(mainWindow, 'toast', { type: 'error', text: 'Há conversões em andamento. Cancele ou aguarde antes de sair.' }); return; }
  quitting = true;
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); explorer.stop(); gesture.stop(); watcher?.stop(); });

