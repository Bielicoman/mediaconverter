'use strict';
// Preferências em userData/settings.json. Valores desconhecidos são descartados.
const fs = require('fs');
const path = require('path');
const F = require('../core/formats.cjs');

const HOTKEYS = ['Alt+Shift+C', 'Ctrl+Alt+Space', 'Ctrl+Shift+Space', 'off'];

const DEFAULTS = {
  outMode: 'beside', // beside | folder
  outDir: '',
  quality: 'balanced', // max | balanced | small
  maxHeight: 0,
  useGpu: true,
  hotkey: 'Alt+Shift+C',
  keepInTray: true,
  openAtLogin: false,
  gesture: 'Shift',
  theme: 'dark',
  wheel: {} // categoria → lista de destinos
};

function sanitize(input) {
  const s = { ...DEFAULTS };
  const v = input && typeof input === 'object' ? input : {};
  if (v.outMode === 'beside' || v.outMode === 'folder') s.outMode = v.outMode;
  if (typeof v.outDir === 'string') s.outDir = v.outDir.slice(0, 1024);
  if (['max', 'balanced', 'small'].includes(v.quality)) s.quality = v.quality;
  if ([0, 2160, 1440, 1080, 720, 480].includes(Number(v.maxHeight))) s.maxHeight = Number(v.maxHeight);
  if (typeof v.useGpu === 'boolean') s.useGpu = v.useGpu;
  if (HOTKEYS.includes(v.hotkey)) s.hotkey = v.hotkey;
  if (typeof v.keepInTray === 'boolean') s.keepInTray = v.keepInTray;
  if (typeof v.openAtLogin === 'boolean') s.openAtLogin = v.openAtLogin;
  if (['Shift', 'Ctrl+Shift', 'off'].includes(v.gesture)) s.gesture = v.gesture;
  if (['dark', 'light'].includes(v.theme)) s.theme = v.theme;
  if (v.wheel && typeof v.wheel === 'object') {
    s.wheel = {};
    for (const [cat, ids] of Object.entries(v.wheel)) {
      if (!F.BY_CATEGORY[cat] || !Array.isArray(ids)) continue;
      const clean = [...new Set(ids.filter(id => F.BY_CATEGORY[cat].includes(id)))];
      if (clean.length) s.wheel[cat] = clean;
    }
  }
  if (s.outMode === 'folder' && !s.outDir) s.outMode = 'beside';
  return s;
}

class Settings {
  constructor(dir) { this.file = path.join(dir, 'settings.json'); this.data = this.load(); }
  load() { try { return sanitize(JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch (_) { return sanitize({}); } }
  get() { return JSON.parse(JSON.stringify(this.data)); }
  update(patch) {
    this.data = sanitize({ ...this.data, ...(patch || {}) });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    return this.get();
  }
  // Opções de conversão derivadas das preferências.
  convertOptions() {
    const d = this.data;
    return { quality: d.quality, maxHeight: d.maxHeight, useGpu: d.useGpu, outDir: d.outMode === 'folder' && d.outDir ? d.outDir : 'beside' };
  }
}

module.exports = { Settings, sanitize, DEFAULTS, HOTKEYS };
