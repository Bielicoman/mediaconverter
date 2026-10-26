'use strict';
// Nome da cópia convertida. Nunca devolve um caminho que já existe nem o próprio original.
const path = require('path');

const INVALID = /[<>:"/\\|?*\x00-\x1f]/g;

function cleanBase(name) {
  const cleaned = String(name || 'arquivo').replace(INVALID, '_').replace(/[. ]+$/, '').trim();
  return cleaned || 'arquivo';
}

// exists(caminho) → boolean. Injetado para manter a função pura e testável.
function uniqueOutput({ inputPath, outDir, ext, suffix = '', exists }) {
  const parsed = path.parse(inputPath);
  const dir = outDir || parsed.dir;
  const base = cleanBase(parsed.name) + (suffix ? ' ' + suffix : '');
  const dotExt = ext ? '.' + ext : '';
  const same = p => path.resolve(p).toLowerCase() === path.resolve(inputPath).toLowerCase();
  let candidate = path.join(dir, base + dotExt);
  if (!same(candidate) && !exists(candidate)) return candidate;
  candidate = path.join(dir, base + ' (convertido)' + dotExt);
  if (!same(candidate) && !exists(candidate)) return candidate;
  for (let n = 2; n < 10000; n++) {
    candidate = path.join(dir, `${base} (convertido ${n})${dotExt}`);
    if (!exists(candidate)) return candidate;
  }
  throw new Error('Não foi possível gerar um nome livre para a cópia.');
}

// Arquivo temporário ao lado da saída: a cópia só recebe o nome final quando termina inteira.
function partialPath(finalPath) {
  const p = path.parse(finalPath);
  return path.join(p.dir, `${p.name}.convertendo.${require('crypto').randomUUID()}${p.ext}`);
}

module.exports = { uniqueOutput, partialPath, cleanBase };
