'use strict';
// Scripts do Windows (Office, PDF, WIC, ZIP) e o assistente persistente do Explorador.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { run } = require('./proc.cjs');

let scriptDir = path.join(__dirname, 'ps');
function setScriptDir(dir) { scriptDir = dir; }

const PS = 'powershell.exe';
const BASE = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'];

async function script(name, params, { signal, timeout = 10 * 60 * 1000, onProgress } = {}) {
  const args = [...BASE, path.join(scriptDir, name)];
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) args.push('-' + k, String(v));
  const r = await run(PS, args, {
    signal, timeout,
    onStderr: chunk => {
      if (!onProgress) return;
      const m = /progress (\d+)\/(\d+)/g; let x; let last = null;
      while ((x = m.exec(chunk))) last = [Number(x[1]), Number(x[2])];
      if (last && last[1] > 0) onProgress(last[0] / last[1]);
    }
  });
  const line = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop() || '{}';
  try { return JSON.parse(line); } catch (_) { return { ok: true, raw: r.stdout }; }
}

// Office instalado? Lê o registro de classes COM; não abre nenhum aplicativo.
async function officeApps() {
  if(process.platform!=='win32'){const ok=Boolean(require('./libreoffice.cjs').binary());return {word:ok,excel:ok,powerpoint:ok};}
  const keys = { word: 'Word.Application', excel: 'Excel.Application', powerpoint: 'PowerPoint.Application' };
  const out = {};
  await Promise.all(Object.entries(keys).map(async ([k, progId]) => {
    try { await run('reg.exe', ['query', `HKCR\\${progId}\\CLSID`], { timeout: 8000 }); out[k] = true; } catch (_) { out[k] = false; }
  }));
  return out;
}

// Processo PowerShell persistente: os tipos C# compilam uma vez (~1,4 s) e cada consulta leva ~100 ms.
class ExplorerHelper {
  constructor() { this.proc = null; this.pending = new Map(); this.buf = ''; this.ready = null; this.seq = 0; }
  start() {
    if(process.platform!=='win32')return Promise.resolve();
    if (this.proc) return this.ready;
    const file = path.join(scriptDir, 'explorer.ps1');
    if (!fs.existsSync(file)) return Promise.reject(new Error('explorer.ps1 ausente'));
    this.proc = spawn(PS, [...BASE, file], { windowsHide: true });
    this.proc.stdout.setEncoding('utf8');
    this.ready = new Promise((resolve, reject) => {
      this.pending.set('0', { resolve, reject });
      setTimeout(() => { if (this.pending.delete('0')) reject(new Error('Assistente do Explorador não respondeu.')); }, 20000);
    });
    this.ready.catch(() => {});
    this.proc.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch (_) { continue; }
        const job = this.pending.get(String(msg.id));
        if (!job) continue; // resposta de um pedido que já expirou
        this.pending.delete(String(msg.id));
        job.resolve(msg);
      }
    });
    this.proc.on('exit', () => {
      for (const j of this.pending.values()) j.reject(new Error('Assistente do Explorador encerrado.'));
      this.pending.clear();
      this.proc = null;
    });
    return this.ready;
  }
  async request(cmd, timeout = 6000) {
    await this.start();
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error('Sem resposta do Explorador.')); }, timeout);
      this.proc.stdin.write(`${cmd}|${id}\n`);
    });
  }
  async selection({ strict = false } = {}) {
    if(process.platform!=='win32')return {files:[],source:'none'};
    const r = await this.request(strict ? 'drag' : 'sel');
    if (r.error) throw new Error(r.error);
    return { files: (r.files || []).filter(f => typeof f === 'string' && f), source: r.source || 'none' };
  }
  stop() { const p = this.proc; if (p) { try { p.stdin.write('exit\n'); } catch (_) {} setTimeout(() => { try { p.kill(); } catch (_) {} }, 800); } }
}

module.exports = { script, officeApps, ExplorerHelper, setScriptDir };
