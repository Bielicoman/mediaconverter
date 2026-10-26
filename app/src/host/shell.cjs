'use strict';
// Integração com o Windows, toda em HKCU (sem administrador):
//  · menu de contexto do Explorador: "Converter com Media Converter" → abre a roda;
//  · "Enviar para → Media Converter (roda rápida)": aceita vários arquivos numa chamada;
//  · iniciar com o Windows, minimizado na bandeja.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.cjs');

const KEY = 'HKCU\\Software\\Classes\\*\\shell\\MediaConverter';
const MENU_TEXT = 'Converter com Media Converter';

// Comando que reabre o app com --wheel. Em desenvolvimento, electron.exe recebe a pasta do app.
function launchCommand(app) {
  const exe = process.execPath;
  const prefix = app.isPackaged ? [] : [path.resolve(app.getAppPath())];
  return { exe, prefix };
}

function quote(s) { return '"' + String(s).replace(/"/g, '') + '"'; }

async function regAdd(key, name, value, type = 'REG_SZ') {
  const args = ['add', key, '/f', '/t', type, '/d', value];
  if (name === null) args.splice(2, 0, '/ve'); else args.splice(2, 0, '/v', name);
  await run('reg.exe', args, { timeout: 10000 });
}

async function contextMenuStatus() {
  try {
    const r = await run('reg.exe', ['query', KEY + '\\command', '/ve'], { timeout: 8000 });
    const m = /REG_SZ\s+(.*)$/m.exec(r.stdout);
    return { enabled: true, command: m ? m[1].trim() : '' };
  } catch (_) { return { enabled: false, command: '' }; }
}

async function enableContextMenu(app, iconPath) {
  const { exe, prefix } = launchCommand(app);
  const cmd = [quote(exe), ...prefix.map(quote), '--wheel', '"%1"'].join(' ');
  await regAdd(KEY, null, MENU_TEXT);
  await regAdd(KEY, 'Icon', iconPath && fs.existsSync(iconPath) ? iconPath : exe);
  // Player: o Explorador repassa a seleção múltipla; o app junta as chamadas numa só roda.
  await regAdd(KEY, 'MultiSelectModel', 'Player');
  await regAdd(KEY + '\\command', null, cmd);
  return contextMenuStatus();
}

async function disableContextMenu() {
  try { await run('reg.exe', ['delete', KEY, '/f'], { timeout: 10000 }); } catch (_) {}
  return contextMenuStatus();
}

function sendToPath(app) { return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Media Converter (roda rápida).lnk'); }

function sendToStatus(app) { return { enabled: fs.existsSync(sendToPath(app)) }; }

function enableSendTo(app, shell, iconPath) {
  const { exe, prefix } = launchCommand(app);
  const ok = shell.writeShortcutLink(sendToPath(app), 'create', {
    target: exe,
    args: [...prefix.map(quote), '--wheel'].join(' '),
    description: 'Abre a roda rápida do Media Converter com os arquivos enviados',
    icon: iconPath && fs.existsSync(iconPath) ? iconPath : exe,
    iconIndex: 0
  });
  if (!ok) throw new Error('O Windows não criou o atalho em Enviar para.');
  return sendToStatus(app);
}

function disableSendTo(app) {
  try { fs.rmSync(sendToPath(app), { force: true }); } catch (_) {}
  return sendToStatus(app);
}

// Escrita direta em HKCU\...\Run: verificável e removida pelo desinstalador.
// (Medido: app.setLoginItemSettings não criou a entrada nesta máquina com Electron 44.7.0.)
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_NAME = 'Media Converter';

async function openAtLoginStatus() {
  try { await run('reg.exe', ['query', RUN_KEY, '/v', RUN_NAME], { timeout: 8000 }); return { enabled: true }; }
  catch (_) { return { enabled: false }; }
}

async function setOpenAtLogin(app, enabled) {
  if (enabled) {
    const { exe, prefix } = launchCommand(app);
    await regAdd(RUN_KEY, RUN_NAME, [quote(exe), ...prefix.map(quote), '--hidden'].join(' '));
  } else {
    try { await run('reg.exe', ['delete', RUN_KEY, '/v', RUN_NAME, '/f'], { timeout: 8000 }); } catch (_) {}
  }
  return openAtLoginStatus();
}

// Extrai caminhos de arquivo do argv recebido (primeira instância ou segunda instância).
// O Chromium reordena a linha de comando (opções antes dos caminhos), então a posição de
// --wheel não indica onde os arquivos começam: vale todo argumento que for arquivo existente.
function filesFromArgv(argv) {
  if (!argv.includes('--wheel')) return { wheel: false, files: [] };
  const self = path.resolve(process.execPath).toLowerCase();
  const files = [];
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('--')) continue;
    try {
      const full = path.resolve(a);
      if (full.toLowerCase() !== self && fs.statSync(full).isFile() && !files.includes(full)) files.push(full);
    } catch (_) {}
  }
  return { wheel: true, files };
}

module.exports = { contextMenuStatus, enableContextMenu, disableContextMenu, sendToStatus, enableSendTo, disableSendTo, setOpenAtLogin, openAtLoginStatus, filesFromArgv, MENU_TEXT };
if(process.platform!=='win32'){
 const unavailable=async()=>{throw new Error('Integração disponível apenas no Windows. Use o painel ou a roda com seleção de arquivos.');};
 Object.assign(module.exports,{contextMenuStatus:async()=>({enabled:false,supported:false}),sendToStatus:()=>({enabled:false,supported:false}),openAtLoginStatus:async()=>({enabled:false,supported:false}),enableContextMenu:unavailable,disableContextMenu:unavailable,enableSendTo:unavailable,disableSendTo:unavailable,setOpenAtLogin:unavailable});
}
