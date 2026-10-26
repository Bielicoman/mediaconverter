'use strict';
// Execução de processos com cancelamento, tempo limite e captura de saída.
const { spawn } = require('child_process');

function run(file, args, { signal, timeout = 0, onStdout, onStderr, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(cancelled());
    const child = spawn(file, args, { windowsHide: true, cwd });
    let out = '';
    let err = '';
    let timer = null;
    let done = false;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); fn(value); };
    const kill = () => { try { child.kill(); } catch (_) {} if (process.platform === 'win32' && child.pid) { try { spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }); } catch (_) {} } };
    const onAbort = () => { kill(); finish(reject, cancelled()); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    if (timeout > 0) timer = setTimeout(() => { kill(); finish(reject, new Error('Tempo limite excedido.')); }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { out += d; if (out.length > 4e6) out = out.slice(-2e6); if (onStdout) onStdout(d); });
    child.stderr.on('data', d => { err += d; if (err.length > 2e6) err = err.slice(-1e6); if (onStderr) onStderr(d); });
    child.on('error', e => finish(reject, e));
    child.on('close', code => {
      if (code === 0) finish(resolve, { stdout: out, stderr: err });
      else {
        const msg = lastLines(err) || `O processo terminou com código ${code}.`;
        const e = new Error(msg);
        e.code = code; e.stderr = err; e.stdout = out;
        finish(reject, e);
      }
    });
  });
}

function lastLines(text, n = 4) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => !/^progress \d+\/\d+$/.test(s)).slice(-n).join(' · ');
}

function cancelled() {
  const e = new Error('Conversão cancelada.');
  e.cancelled = true;
  return e;
}

module.exports = { run, cancelled, lastLines };
