'use strict';
// Servidor estático local do site (somente desenvolvimento). Uso: node scripts/serve-site.cjs [porta]
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'site');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.json': 'application/json' };
http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { res.writeHead(400); res.end(); return; }
  if (p === '/downloads/MediaConverter-2.5.0-Windows-x64-Setup.exe') {
    const installer = path.join(__dirname, '../dist/MediaConverter-2.5.0-Windows-x64-Setup.exe');
    if (!fs.existsSync(installer)) { res.writeHead(404); res.end('Instalador ainda não empacotado.'); return; }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(installer).size, 'Content-Disposition': 'attachment; filename="MediaConverter-2.5.0-Windows-x64-Setup.exe"' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(installer).pipe(res);
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('site em http://127.0.0.1:' + port));





