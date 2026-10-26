'use strict';
const path = require('path');
const fs = require('fs/promises');
const { run } = require('./proc.cjs');
const bundled=path.join(__dirname,'../../bin/7z.exe');
const bin = process.platform==='win32' && require('fs').existsSync(bundled) ? bundled : require('7zip-bin').path7za;
function safeEntry(name) {
  const n = name.replace(/\\/g, '/');
  if (n.startsWith('/') || /^[a-z]:/i.test(n) || n.split('/').includes('..') || n.includes('\0')) throw new Error('O arquivo compactado contém um caminho inseguro.');
  return n;
}
async function extract(input, output, signal) {
  const listing = await run(bin, ['l', '-slt', '-ba', '-sccUTF-8', '--', input], { signal, timeout: 60000 });
  for (const line of listing.stdout.split(/\r?\n/)) {
    if (line.startsWith('Path = ')) safeEntry(line.slice(7));
    if (/^(Symbolic Link|Hard Link) = .+/.test(line)) throw new Error('Links em arquivos compactados não são extraídos.');
  }
  await fs.mkdir(output, { recursive: true });
  await run(bin, ['x', '-y', '-aos', '-sccUTF-8', '-o' + output, '--', input], { signal, timeout: 3600000 });
}
async function pack(inputs, output, format, signal) {
  // List files contain absolute literal paths. Wildcards and option prefixes never enter argv.
  const list = output + '.list';
  try {
    await fs.writeFile(list, inputs.join('\n'), 'utf8');
    await run(bin, ['a', '-t' + format, '-y', '-scsUTF-8', '-sccUTF-8', '-mx=5', output, '@' + list], { signal, timeout: 3600000 });
  } finally { await fs.rm(list, { force: true }); }
}
module.exports = { extract, pack, safeEntry };
