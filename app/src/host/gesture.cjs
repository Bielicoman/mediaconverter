'use strict';
const { spawn } = require('child_process');
const path = require('path');
class Gesture {
  constructor(onDrag, onRelease) { this.onDrag = onDrag; this.onRelease = onRelease; this.child = null; this.ready = false; }
  start(modifier) {
    this.stop();
    if (process.platform !== 'win32' || modifier === 'off') return;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'ps', 'gesture.ps1'), '-Modifier', modifier], { windowsHide: true });
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if(this.child!==child)return;
      buffer += chunk; let pos;
      while ((pos = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, pos).trim(); buffer = buffer.slice(pos + 1);
        try { const msg = JSON.parse(line); if (msg.ready) this.ready = true; if (msg.gesture === 'drag' && msg.source==='shell-event') Promise.resolve(this.onDrag()).catch(()=>{}); if (msg.gesture === 'release') this.onRelease(); } catch (_) {}
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => { this.ready = false; });
    child.on('exit', () => { if (this.child === child) { this.child = null; this.ready = false; } });
  }
  stop() { const child = this.child; this.child = null; this.ready = false; child?.kill(); }
}
module.exports = { Gesture };
