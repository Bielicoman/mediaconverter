'use strict';
// Usa o Chromium do próprio Electron, em janelas ocultas e isoladas, para:
//  · imprimir HTML/Markdown/TXT/imagens em PDF (webContents.printToPDF);
//  · rasterizar SVG e AVIF em PNG preservando transparência (canvas → PNG).
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { esc } = require('../core/data.cjs');

const MIME = { svg: 'image/svg+xml', avif: 'image/avif', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon' };
// Data URL: imagem desenhada no canvas não "contamina" a origem e nenhum arquivo externo é lido.
function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return 'data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + fs.readFileSync(file).toString('base64');
}

function hiddenWindow({ javascript = false } = {}) {
  const win = new BrowserWindow({
    show: false, width: 1200, height: 900,
    webPreferences: { partition: 'mc-render', sandbox: true, contextIsolation: true, nodeIntegration: false, javascript, spellcheck: false }
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', e => e.preventDefault());
  wc.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  return win;
}

async function withWindow(opts, fn, timeout = 120000) {
  const win = hiddenWindow(opts);
  let timer;
  try {
    return await Promise.race([
      fn(win),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo limite ao renderizar.')), timeout); })
    ]);
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}

// Bloqueia requisições de rede: um HTML convertido não pode buscar nada fora do disco.
function blockNetwork(win) {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
}

async function printToPdf({ html, file, out, landscape = false }) {
  return withWindow({ javascript: false }, async win => {
    blockNetwork(win);
    if (file) await win.loadFile(file);
    else {
      const tmp = out + '.render.html';
      fs.writeFileSync(tmp, html, 'utf8');
      try { await win.loadFile(tmp); } finally { fs.rm(tmp, { force: true }, () => {}); }
    }
    const pdf = await win.webContents.printToPDF({ printBackground: true, landscape, pageSize: 'A4', preferCSSPageSize: true, margins: { marginType: 'default' } });
    fs.writeFileSync(out, pdf);
    return out;
  });
}

async function imageToPdf({ image, out, width = 0, height = 0 }) {
  const landscape = width > height && width > 0;
  const src = dataUrl(image);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}html,body{margin:0;height:100%}
body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}
</style></head><body><img src="${esc(src)}"></body></html>`;
  const tmpDir = path.dirname(out);
  const tmp = path.join(tmpDir, `.mc-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  try {
    return await withWindow({ javascript: false }, async win => {
      blockNetwork(win);
      await win.loadFile(tmp);
      const pdf = await win.webContents.printToPDF({ printBackground: true, landscape, pageSize: 'A4', preferCSSPageSize: true });
      fs.writeFileSync(out, pdf);
      return out;
    });
  } finally { fs.rm(tmp, { force: true }, () => {}); }
}

// Desenha a imagem num canvas do tamanho natural (SVG sem tamanho: 1024 px) e grava PNG.
async function rasterize({ image, out, maxSide = 8192 }) {
  const src = dataUrl(image);
  const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>`;
  const tmp = path.join(path.dirname(out), `.mc-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, page, 'utf8');
  try {
    return await withWindow({ javascript: true }, async win => {
      blockNetwork(win);
      await win.loadFile(tmp);
      const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
          const k = Math.min(1, ${maxSide} / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('O Chromium não conseguiu abrir esta imagem.'));
        img.src = ${JSON.stringify(src)};
      })`, true);
      const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      return out;
    });
  } finally { fs.rm(tmp, { force: true }, () => {}); }
}

module.exports = { printToPdf, imageToPdf, rasterize };
