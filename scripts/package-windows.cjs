'use strict';
// Empacota o app para Windows x64 sem baixar nada: usa o Electron já extraído e o electron-builder
// instalado no projeto do Media Downloader (mesma versão do workflow dele, 26.15.3).
//   node scripts/package-windows.cjs --electron <pasta-do-electron-extraido> [--builder <pasta node_modules>]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const root = path.join(__dirname, '..');
const appDir = path.join(root, 'app');
const pkg = require(path.join(appDir, 'package.json'));
const electronDir = path.resolve(arg('--electron', ''));
const builderModules = path.resolve(arg('--builder', 'C:/IA/02_Plugins/ADOBE PREMIERE/MediaDownloader/node_modules'));
const outRoot = path.join(root, 'out');
const target = path.join(outRoot, `Media Converter-${pkg.version}-win32-x64`);
const dist = path.join(root, 'dist');

function must(cond, msg) { if (!cond) { console.error('ERRO: ' + msg); process.exit(1); } }
must(fs.existsSync(path.join(electronDir, 'electron.exe')), 'electron.exe não encontrado em ' + electronDir);
for (const b of ['ffmpeg.exe', 'ffprobe.exe']) must(fs.statSync(path.join(appDir, 'bin', b)).size > 1e6, `bin/${b} ausente`);
must(fs.existsSync(path.join(appDir, 'icons', 'icon.ico')), 'icons/icon.ico ausente (rode scripts/render-icons.cjs)');

console.log('1/4 copiando o Electron', fs.readFileSync(path.join(electronDir, 'version'), 'utf8').trim());
must(path.dirname(path.resolve(target)) === path.resolve(outRoot), 'pasta de saída fora do workspace');
if (fs.existsSync(target)) fs.renameSync(target, target + '-previous-' + Date.now());
fs.cpSync(electronDir, target, { recursive: true });
fs.renameSync(path.join(target, 'electron.exe'), path.join(target, 'Media Converter.exe'));
fs.rmSync(path.join(target, 'resources', 'default_app.asar'), { force: true });
// 55 idiomas do Chromium; o app usa dois.
for (const f of fs.readdirSync(path.join(target, 'locales'))) if (!/^(en-US|pt-BR)\.pak$/.test(f)) fs.rmSync(path.join(target, 'locales', f));

console.log('2/4 copiando o app (sem ASAR: os motores precisam ser executáveis)');
const dest = path.join(target, 'resources', 'app');
for (const part of ['package.json', 'package-lock.json', 'src', 'icons', 'bin', 'licenses', 'node_modules']) fs.cpSync(path.join(appDir, part), path.join(dest, part), { recursive: true });
for (const extra of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) if (fs.existsSync(path.join(root, extra))) fs.copyFileSync(path.join(root, extra), path.join(dest, extra));

console.log('3/4 ícone e metadados do executável (rcedit)');
const rcedit = path.join(builderModules, 'rcedit', 'bin', 'rcedit-x64.exe');
must(fs.existsSync(rcedit), 'rcedit não encontrado em ' + rcedit);
let r = spawnSync(rcedit, [path.join(target, 'Media Converter.exe'),
  '--set-icon', path.join(appDir, 'icons', 'icon.ico'),
  '--set-version-string', 'ProductName', 'Media Converter',
  '--set-version-string', 'FileDescription', 'Media Converter',
  '--set-version-string', 'CompanyName', 'Alex Ascencio',
  '--set-version-string', 'LegalCopyright', 'MIT · Alex Ascencio',
  '--set-version-string', 'OriginalFilename', 'Media Converter.exe',
  '--set-file-version', pkg.version, '--set-product-version', pkg.version], { stdio: 'inherit' });
must(r.status === 0, 'rcedit falhou');

console.log('4/4 instalador NSIS');
fs.mkdirSync(dist, { recursive: true });
const cli = path.join(builderModules, 'electron-builder', 'cli.js');
r = spawnSync(process.execPath, [cli, '--win', 'nsis', '--x64', '--publish', 'never',
  '--projectDir', appDir, '--config', path.join(root, 'installers', 'windows', 'electron-builder.nsis.json'),
  '--prepackaged', target, `--config.directories.output=${dist}`, `--config.electronVersion=${fs.readFileSync(path.join(electronDir, 'version'), 'utf8').trim()}`],
  { stdio: 'inherit', env: { ...process.env, NODE_PATH: builderModules } });
must(r.status === 0, 'electron-builder falhou');
const exe = path.join(dist, `MediaConverter-${pkg.version}-Windows-x64-Setup.exe`);
must(fs.existsSync(exe), 'instalador não gerado');
console.log('OK', exe, (fs.statSync(exe).size / 1048576).toFixed(1) + ' MB');
