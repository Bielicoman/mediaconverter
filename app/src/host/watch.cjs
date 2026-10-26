'use strict';
const fs = require('fs');
const path = require('path');
const F = require('../core/formats.cjs');
// Shallow scan, stable size/mtime before enqueue, output in a distinct subfolder.
class WatchFolders {
  constructor(file, onFile, interval = 1600) {
    this.file = file; this.onFile = onFile; this.pending = new Map(); this.running = false;
    try { this.rules = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { this.rules = []; }
    this.rules = this.rules.filter(r => path.isAbsolute(r.dir) && F.TARGETS[r.targetId]);
    for (const r of this.rules) this.baseline(r);
    this.lastError = '';
    this.timer = setInterval(() => this.tick().catch(e => { this.lastError = e.message; }), interval); this.timer.unref();
  }
  list() { return this.rules.map(r => ({ ...r })); }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.rules, null, 2)); }
  baseline(rule) { for (const f of this.scan(rule)) this.pending.set(f, { stamp: this.stamp(f), seen: true }); }
  scan(rule) { try { return fs.readdirSync(rule.dir, { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.') && !e.name.includes('.convertendo.')).map(e => path.join(rule.dir, e.name)); } catch (_) { return []; } }
  stamp(file) { try { const s = fs.statSync(file); return `${s.size}:${s.mtimeMs}`; } catch (_) { return ''; } }
  add(dir, targetId) {
    if (!path.isAbsolute(dir) || !fs.statSync(dir).isDirectory() || !F.TARGETS[targetId]) throw new Error('Pasta ou formato inválido.');
    if (this.rules.some(r => r.dir.toLowerCase() === dir.toLowerCase())) throw new Error('Esta pasta já é monitorada.');
    const rule = { id: Date.now().toString(36), dir, targetId, outDir: path.join(dir, 'Convertidos') };
    this.baseline(rule); this.rules.push(rule); this.save(); return this.list();
  }
  remove(id) { this.rules = this.rules.filter(r => r.id !== id); this.save(); return this.list(); }
  async tick() {
    if (this.running) return; this.running = true;
    try {
      const alive = new Set();
      for (const r of this.rules) for (const file of this.scan(r)) {
        alive.add(file);
        const stamp = this.stamp(file), old = this.pending.get(file);
        if (!old || old.stamp !== stamp) { this.pending.set(file, { stamp, seen: false }); continue; }
        if (old.seen) continue;
        try {
          if (F.isTargetValid(F.categoryOf(file), r.targetId, F.extOf(file))) await this.onFile(file, r);
          old.seen = true;
        } catch (e) { this.lastError = e.message; }
      }
      for (const file of this.pending.keys()) if (!alive.has(file)) this.pending.delete(file);
    } finally { this.running = false; }
  }
  stop() { clearInterval(this.timer); }
}
module.exports = { WatchFolders };
