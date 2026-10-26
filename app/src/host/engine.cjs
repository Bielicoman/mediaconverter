'use strict';
// Motor de conversão: escolhe o executor de cada destino, grava num arquivo temporário
// ao lado da saída e só renomeia quando a cópia termina inteira. O original nunca é alterado.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const F = require('../core/formats.cjs');
const { buildFfmpegArgs } = require('../core/plan.cjs');
const { uniqueOutput, partialPath } = require('../core/naming.cjs');
const D = require('../core/data.cjs');
const ff = require('./ffmpeg.cjs');
const ps = require('./powershell.cjs');
const { cancelled } = require('./proc.cjs');

let chromium = null; // carregado sob demanda: depende do processo principal do Electron
function chrome() { if (!chromium) chromium = require('./chromium.cjs'); return chromium; }

let tempRoot = path.join(os.tmpdir(), 'MediaConverter');
function setTempRoot(dir) { tempRoot = dir; }

const exists = p => fs.existsSync(p);

async function makeTemp() {
  const dir = path.join(tempRoot, `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function isUtf8(file) {
  const buf = await fsp.readFile(file);
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch (_) { return false; }
}

async function readText(file) {
  const buf = await fsp.readFile(file);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { return new TextDecoder('windows-1252').decode(buf); }
}

function outDirFor(input, opts) {
  if (opts.outDir && opts.outDir !== 'beside') return opts.outDir;
  return path.dirname(input);
}

async function finalize(partial, final, signal) {
  if (signal?.aborted) throw cancelled();
  if (exists(final)) throw new Error('Já existe um arquivo com o nome de saída. Nada foi sobrescrito.');
  if ((await fsp.stat(partial)).isFile()) {
    try { await fsp.link(partial, final); } catch(e) { if (['EPERM','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(e.code)) await fsp.copyFile(partial, final, fs.constants.COPYFILE_EXCL); else throw e; }
    await fsp.unlink(partial);
  }
  else await fsp.rename(partial, final);
  return final;
}

async function removeQuiet(p) { try { await fsp.rm(p, { recursive: true, force: true }); } catch (_) {} }

// Decodifica para PNG temporário as imagens que o FFmpeg não abre.
async function decodableImage(input, tmp, signal) {
  const ext = F.extOf(input);
  const via = F.IMAGE_DECODER[ext];
  if (!via) return input;
  if (via !== 'chromium' && process.platform !== 'win32') return input;
  if (via === 'chromium') {
    // AVIF: o FFmpeg 6.1 só lê AVIF sem grade; tenta direto e recorre ao Chromium.
    if (ext === 'avif') { try { const p = await ff.probe(input, { signal }); if (p.hasVideo && p.width) return input; } catch (_) {} }
    const out = path.join(tmp, 'decodificado.png');
    await chrome().rasterize({ image: input, out });
    return out;
  }
  const out = path.join(tmp, 'decodificado.png');
  await ps.script('wic.ps1', { In: input, Out: out }, { signal, timeout: 120000 });
  return out;
}

async function runFfmpeg({ input, targetId, opts, signal, onProgress, tmp }) {
  const t = F.TARGETS[targetId];
  const cat = F.categoryOf(input);
  const source = cat === 'image' ? await decodableImage(input, tmp, signal) : input;
  const probe = await ff.probe(source, { signal });
  let subCharenc = '';
  if (t.kind === 'subtitle' && !(await isUtf8(source))) subCharenc = 'CP1252';
  const gpu = opts.useGpu && (targetId === 'v_mp4_h264' || targetId === 'v_mp4_h265') ? await ff.detectGpu() : {};
  const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: t.ext, exists });
  const partial = partialPath(final);
  const { args, duration } = buildFfmpegArgs({ targetId, input: source, output: partial, probe, quality: opts.quality, maxHeight: Number(opts.maxHeight) || 0, gpu, subCharenc, options: opts });
  try {
    await ff.convert(args, { duration, signal, onProgress });
    if (!exists(partial) || (await fsp.stat(partial)).size === 0) throw new Error('O FFmpeg terminou sem gerar dados.');
    return { output: await finalize(partial, final, signal), kind: 'file' };
  } catch (e) {
    await removeQuiet(partial);
    if (targetId === 'v_mp4_remux' && !e.cancelled) throw new Error('Os codecs deste vídeo não cabem em MP4 sem recompressão. Use MP4 · H.264.');
    throw e;
  }
}

async function runOffice({ input, targetId, opts, signal, onProgress, tmp }) {
  const t = F.TARGETS[targetId];
  if (process.platform !== 'win32') {
    if(t.folder||t.viaCsv||F.categoryOf(input)==='pdf')throw new Error('Esta conversão específica usa o Microsoft Office no Windows.');
    const native=require('./libreoffice.cjs');
    const converted=await native.convert(input,t.ext,tmp,signal);
    const final=uniqueOutput({inputPath:input,outDir:outDirFor(input,opts),ext:t.ext,exists});
    const partial=partialPath(final);
    try{await fsp.copyFile(converted,partial);return {output:await finalize(partial,final,signal),kind:'file'};}catch(e){await removeQuiet(partial);throw e;}
  }
  const apps = await ps.officeApps();
  if (!apps[t.app]) {
    const name = { word: 'Microsoft Word', excel: 'Microsoft Excel', powerpoint: 'Microsoft PowerPoint' }[t.app];
    throw new Error(`${name} não está instalado. Esta conversão usa o ${name} do computador.`);
  }
  let source = input;
  const inExt = F.extOf(input);
  if (t.viaCsv) {
    // Excel lê CSV sem BOM como ANSI; o CSV intermediário vai em UTF-8 com BOM e vírgula.
    const text = await readText(input);
    source = path.join(tmp, 'dados.csv');
    await fsp.writeFile(source, D.convertData(text, inExt === 'json' ? 'json' : inExt, 'csv'), 'utf8');
  } else if (targetId === 't_docx' && inExt !== 'html' && inExt !== 'htm') {
    const text = await readText(input);
    source = path.join(tmp, 'documento.html');
    await fsp.writeFile(source, D.textSourceToHtml(text, inExt, path.parse(input).name), 'utf8');
  }
  onProgress && onProgress(0.15);
  if (t.folder) {
    const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: '', suffix: '(slides)', exists });
    const partial = partialPath(final);
    try { await ps.script('office.ps1', { App: t.app, In: source, Out: partial, Code: t.code }, { signal, timeout: 15 * 60 * 1000 });
    return { output: await finalize(partial, final, signal), kind: 'folder' }; } catch(e) { await removeQuiet(partial); throw e; }
  }
  const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: t.ext, exists });
  const partial = partialPath(final);
  try {
    await ps.script('office.ps1', { App: t.app, In: source, Out: partial, Code: t.code }, { signal, timeout: 15 * 60 * 1000 });
    return { output: await finalize(partial, final, signal), kind: 'file' };
  } catch (e) { await removeQuiet(partial); throw e; }
}

async function runChromium({ input, targetId, opts, signal, tmp }) {
  const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: 'pdf', exists });
  const partial = partialPath(final);
  try {
    if (targetId === 'i_pdf') {
      let image = await decodableImage(input, tmp, signal);
      if (opts.crop || opts.width || opts.height || opts.rotate || opts.grayscale || opts.flip) {
        const adjusted = path.join(tmp, 'ajustada.png');
        const p = await ff.probe(image, { signal });
        const plan = buildFfmpegArgs({ targetId: 'image_edit', input: image, output: adjusted, probe: p, options: opts });
        await ff.convert(plan.args, { signal }); image = adjusted;
      }
      let probe = {};
      try { probe = await ff.probe(image, { signal }); } catch (_) {}
      // PNG/JPG/WebP/GIF/SVG/AVIF abrem no Chromium; os demais passam por PNG.
      let src = image;
      if (!/^(png|jpe?g|jfif|webp|gif|svg|avif|bmp)$/i.test(path.extname(image).slice(1))) {
        src = path.join(tmp, 'pagina.png');
        await ff.convert(['-hide_banner', '-loglevel', 'error', '-y', '-i', image, '-frames:v', '1', src], { signal });
      }
      await chrome().imageToPdf({ image: src, out: partial, width: probe.width, height: probe.height });
    } else {
      const ext = F.extOf(input);
      if (ext === 'html' || ext === 'htm') await chrome().printToPdf({ file: input, out: partial });
      else await chrome().printToPdf({ html: D.textSourceToHtml(await readText(input), ext, path.parse(input).name), out: partial });
    }
    if (signal && signal.aborted) throw cancelled();
    return { output: await finalize(partial, final, signal), kind: 'file' };
  } catch (e) { await removeQuiet(partial); throw e; }
}

async function runPdfWin({ input, targetId, opts, signal, onProgress, tmp }) {
  const t = F.TARGETS[targetId];
  const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: '', suffix: '(páginas)', exists });
  const partial = partialPath(final), stage = path.join(tmp, 'paginas');
  const scale = opts.quality === 'small' ? 1.25 : opts.quality === 'max' ? 3 : 2;
  try {
    const r = await ps.script('pdf.ps1', { In: input, OutDir: stage, Scale: scale, Pages: opts.pages }, { signal, timeout: 30 * 60 * 1000, onProgress: f => onProgress?.(f * .7) });
    await fsp.mkdir(partial);
    const files = r.files || [];
    for (let i = 0; i < files.length; i++) {
      if (signal?.aborted) throw cancelled();
      const out = path.join(partial, path.parse(files[i]).name + '.' + t.image);
      const rotate = { 90: 'transpose=1', 180: 'hflip,vflip', 270: 'transpose=2' }[opts.rotate];
      if (t.image === 'png' && !rotate) await fsp.copyFile(files[i], out);
      else await ff.convert(['-hide_banner', '-loglevel', 'error', '-y', '-i', files[i], ...(rotate ? ['-vf', rotate] : []), ...(t.image === 'jpg' ? ['-q:v', opts.quality === 'small' ? '6' : '2'] : []), out], { signal });
      onProgress?.(.7 + .3 * (i + 1) / files.length);
    }
    return { output: await finalize(partial, final, signal), kind: 'folder', pages: r.pages };
  } catch(e) { await removeQuiet(partial); throw e; }
}

async function runData({ input, targetId, opts, signal }) {
  if (signal?.aborted) throw cancelled();
  const t = F.TARGETS[targetId];
  const inExt = F.extOf(input);
  const text = await readText(input);
  let content;
  if (targetId === 't_html') content = D.textSourceToHtml(text, inExt, path.parse(input).name);
  else if (targetId === 't_txt') content = D.textSourceToTxt(text, inExt);
  else content = D.convertData(text, inExt, t.ext);
  const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: t.ext, exists });
  const partial = partialPath(final);
  try { if (signal?.aborted) throw cancelled();
  await fsp.writeFile(partial, content, 'utf8');
  return { output: await finalize(partial, final, signal), kind: 'file' };
  } catch(e) { await removeQuiet(partial); throw e; }
}

async function runZip({ inputs, targetId, opts, signal, onProgress, tmp }) {
  const t = F.TARGETS[targetId];
  if(process.platform!=='win32'){
    const archive=require('./archives.cjs');
    const final=uniqueOutput({inputPath:inputs[0],outDir:outDirFor(inputs[0],opts),ext:t.op==='extract'?'':'zip',exists});
    const partial=partialPath(final);
    try{if(t.op==='extract')await archive.extract(inputs[0],partial,signal);else await archive.pack(inputs,partial,'zip',signal);return {output:await finalize(partial,final,signal),kind:t.op==='extract'?'folder':'file'};}catch(e){await removeQuiet(partial);throw e;}
  }
  if (t.op === 'extract') {
    const input = inputs[0];
    const final = uniqueOutput({ inputPath: input, outDir: outDirFor(input, opts), ext: '', exists });
    const partial = partialPath(final);
    try { await ps.script('zip.ps1', { Op: 'extract', In: input, Out: partial }, { signal, timeout: 60 * 60 * 1000 });
    return { output: await finalize(partial, final, signal), kind: 'folder' }; } catch(e) { await removeQuiet(partial); throw e; }
  }
  const first = inputs[0];
  const suffix = inputs.length > 1 ? `e mais ${inputs.length - 1}` : '';
  const final = uniqueOutput({ inputPath: first, outDir: outDirFor(first, opts), ext: 'zip', suffix, exists });
  const partial = partialPath(final);
  const list = path.join(tmp, 'lista.txt');
  await fsp.writeFile(list, '﻿' + inputs.join('\r\n'), 'utf8');
  try {
    await ps.script('zip.ps1', { Op: 'compress', Out: partial, ListFile: list }, { signal, timeout: 60 * 60 * 1000, onProgress });
    return { output: await finalize(partial, final, signal), kind: 'file' };
  } catch (e) { await removeQuiet(partial); throw e; }
}

// inputs: lista de caminhos. Só "Compactar em ZIP" junta vários arquivos numa saída;
// os demais destinos convertem um arquivo por chamada.
async function convert({ inputs, targetId, opts = {} }, { signal, onProgress } = {}) {
  if (signal?.aborted) throw cancelled();
  const t = F.TARGETS[targetId];
  if (!t) throw new Error('Formato de saída desconhecido.');
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('Nenhum arquivo informado.');
  for (const p of inputs) if (!exists(p)) throw new Error('Arquivo não encontrado: ' + p);
  if (!t.multi && inputs.length !== 1) throw new Error('Este formato converte um arquivo por vez.');
  if (t.engine === 'pdf' && inputs.some(p => F.categoryOf(p) !== 'pdf')) throw new Error('Selecione apenas arquivos PDF para esta ferramenta.');
  if (!t.multi) {
    const input = inputs[0];
    const cat = F.categoryOf(input);
    if (!F.isTargetValid(cat, targetId, F.extOf(input))) throw new Error(`${F.CATEGORIES[cat].label} ${F.extOf(input).toUpperCase()} não converte para ${t.label}.`);
  }
  const options = require('../core/options.cjs').options(opts);
  const outDir = outDirFor(inputs[0], options);
  if (!path.isAbsolute(outDir)) throw new Error('Escolha uma pasta de saída absoluta.');
  await fsp.mkdir(outDir, { recursive: true });
  const tmp = await makeTemp();
  const ctx = { input: inputs[0], inputs, targetId, opts: options, signal, onProgress, tmp };
  const started = Date.now();
  try {
    let result;
    switch (t.engine) {
      case 'archive': {
        const final = uniqueOutput({ inputPath: inputs[0], outDir: outDirFor(inputs[0], options), ext: t.ext, suffix: t.folder ? '(extraído)' : '', exists });
        const partial = partialPath(final);
        try {
          const archive = require('./archives.cjs');
          if (t.op === 'extract') await archive.extract(inputs[0], partial, signal);
          else await archive.pack(inputs, partial, t.format, signal);
          result = { output: await finalize(partial, final, signal), kind: t.folder ? 'folder' : 'file' };
        } catch(e) { await removeQuiet(partial); throw e; }
        break;
      }
      case 'pdf': {
        const final = uniqueOutput({ inputPath: inputs[0], outDir: outDirFor(inputs[0], options), ext: 'pdf', exists });
        const partial = partialPath(final);
        try { const details = await require('./pdf.cjs').transform({ inputs, output: partial, opts: options, signal, onProgress }); result = { output: await finalize(partial, final, signal), kind: 'file', ...details }; }
        catch (e) { await removeQuiet(partial); throw e; }
        break;
      }
      case 'ffmpeg': result = await runFfmpeg(ctx); break;
      case 'office': result = await runOffice(ctx); break;
      case 'chromium': result = await runChromium(ctx); break;
      case 'pdfwin': result = await runPdfWin(ctx); break;
      case 'data': result = await runData(ctx); break;
      case 'zip': result = await runZip(ctx); break;
      default: throw new Error('Motor desconhecido: ' + t.engine);
    }
    onProgress && onProgress(1);
    let bytes = 0;
    try { const st = await fsp.stat(result.output); bytes = st.isFile() ? st.size : 0; } catch (_) {}
    return { ...result, bytes, ms: Date.now() - started, targetId, label: t.label };
  } finally {
    await removeQuiet(tmp);
  }
}

module.exports = { convert, setTempRoot, decodableImage };
