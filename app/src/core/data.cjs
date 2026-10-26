'use strict';
// Conversões de dados e texto feitas em JavaScript puro: CSV/TSV/JSON e Markdown/TXT/HTML.

function stripBom(text) {
  return String(text).replace(/^﻿/, '');
}

// Separador mais provável na primeira linha fora de aspas (Excel em pt-BR exporta com ";").
function detectDelimiter(text) {
  const line = stripBom(text).split(/\r?\n/).find(l => l.trim()) || '';
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

// RFC 4180: aspas duplas escapadas, quebras de linha dentro de campos.
function parseDelimited(text, delimiter) {
  const src = stripBom(text);
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function stringifyDelimited(rows, delimiter = ',') {
  const needs = new RegExp(`["\\r\\n${delimiter === '\t' ? '\\t' : delimiter.replace(/[|\\]/g, '\\$&')}]`);
  const cell = v => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return needs.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map(r => r.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}

// JSON → linhas: lista de objetos (cabeçalho = união das chaves), lista de listas ou objeto único.
function jsonToRows(value) {
  let list = value;
  if (!Array.isArray(list)) {
    if (list && typeof list === 'object') {
      const arrayKey = Object.keys(list).find(k => Array.isArray(list[k]) && list[k].every(x => x && typeof x === 'object'));
      list = arrayKey ? list[arrayKey] : [list];
    } else list = [{ valor: list }];
  }
  if (list.every(Array.isArray)) return list.map(r => r.slice());
  const header = [];
  for (const item of list) {
    const obj = item && typeof item === 'object' ? item : { valor: item };
    for (const k of Object.keys(obj)) if (!header.includes(k)) header.push(k);
  }
  const rows = [header];
  for (const item of list) {
    const obj = item && typeof item === 'object' ? item : { valor: item };
    rows.push(header.map(k => (k in obj ? obj[k] : '')));
  }
  return rows;
}

function coerce(s) {
  if (s === '') return '';
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && s.length < 16) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

function rowsToJson(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h, i) => (String(h).trim() || `coluna_${i + 1}`));
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, coerce(r[i] === undefined ? '' : r[i])])));
}

function convertData(text, fromExt, toExt) {
  const from = String(fromExt).toLowerCase();
  let rows;
  if (from === 'json') rows = jsonToRows(JSON.parse(stripBom(text)));
  else if (from === 'tsv') rows = parseDelimited(text, '\t');
  else rows = parseDelimited(text);
  switch (String(toExt).toLowerCase()) {
    case 'json': return JSON.stringify(rowsToJson(rows), null, 2) + '\n';
    case 'csv': return '﻿' + stringifyDelimited(rows, ',');
    case 'tsv': return stringifyDelimited(rows, '\t');
    default: throw new Error('Destino de dados desconhecido: ' + toExt);
  }
}

// ---------- Texto ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(md) {
  let s = esc(md);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${safeUrl(src)}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => `<a href="${safeUrl(href)}">${txt}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`);
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

function safeUrl(u) {
  const s = String(u).replace(/&amp;/g, '&');
  return /^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+(\/|$))/i.test(s) && !/^javascript:/i.test(s) ? esc(s) : '#';
}

// Markdown comum: títulos, listas, citações, blocos de código, tabelas, regras e parágrafos.
function markdownToHtml(md) {
  const lines = stripBom(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flush(); out.push(`<h${m[1].length}>${inline(m[2].replace(/\s#+$/, ''))}</h${m[1].length}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      flush();
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${markdownToHtml(q.join('\n'))}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        item = item.replace(/^\[( |x)\]\s+/i, (_, c) => (c.trim() ? '☑ ' : '☐ '));
        items.push(`<li>${inline(item)}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) body.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}

function textToHtml(text) {
  return stripBom(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

const DOC_CSS = `body{font:15px/1.7 "Segoe UI",Manrope,Arial,sans-serif;color:#16181d;max-width:760px;margin:40px auto;padding:0 24px}
h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .6em}h1{font-size:30px}h2{font-size:23px}h3{font-size:19px}
code{font:13px Consolas,monospace;background:#f1f3f5;padding:2px 5px;border-radius:4px}
pre{background:#f1f3f5;padding:14px;border-radius:8px;overflow:auto;white-space:pre-wrap}pre code{background:none;padding:0}
blockquote{margin:1em 0;padding:.2em 1em;border-left:3px solid #2fbf71;color:#444}
table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #d5d9de;padding:7px 9px;text-align:left}th{background:#f4f6f8}
img{max-width:100%}hr{border:0;border-top:1px solid #d5d9de;margin:2em 0}a{color:#12804a}
@page{size:A4;margin:18mm}`;

function htmlDocument(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>\n${bodyHtml}\n</body></html>\n`;
}

// Texto de origem (txt/md/html/log) → documento HTML completo.
function textSourceToHtml(text, ext, title) {
  const e = String(ext).toLowerCase();
  if (e === 'html' || e === 'htm') return stripBom(text);
  if (e === 'md' || e === 'markdown') return htmlDocument(title, markdownToHtml(text));
  return htmlDocument(title, textToHtml(text));
}

function htmlToText(html) {
  return stripBom(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function textSourceToTxt(text, ext) {
  const e = String(ext).toLowerCase();
  if (e === 'html' || e === 'htm') return htmlToText(text);
  if (e === 'md' || e === 'markdown') return htmlToText(markdownToHtml(text));
  return stripBom(text);
}

module.exports = {
  detectDelimiter, parseDelimited, stringifyDelimited, jsonToRows, rowsToJson, convertData,
  markdownToHtml, textToHtml, htmlDocument, textSourceToHtml, htmlToText, textSourceToTxt, esc
};
