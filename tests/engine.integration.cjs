'use strict';
// Teste de integração real: gera amostras com o FFmpeg empacotado, converte para cada destino
// que não depende do Electron e confere a saída com ffprobe/tamanho. Uso:
//   node tests/engine.integration.cjs <pasta-de-trabalho> [--office]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const engine = require('../app/src/host/engine.cjs');
const ff = require('../app/src/host/ffmpeg.cjs');
const F = require('../app/src/core/formats.cjs');

const work = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'mc-integration'));
const withOffice = process.argv.includes('--office');
fs.rmSync(work, { recursive: true, force: true });
const S = path.join(work, 'amostras');
fs.mkdirSync(S, { recursive: true });
engine.setTempRoot(path.join(work, 'tmp'));

function gen(args) {
  const r = spawnSync(ff.ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}
gen(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(S, 'clipe.mp4')]);
gen(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=25:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(S, 'vertical.mov')]);
gen(['-f', 'lavfi', '-i', 'sine=f=220:d=4:sample_rate=48000', '-ac', '2', '-c:a', 'pcm_s24le', path.join(S, 'tom.wav')]);
gen(['-f', 'lavfi', '-i', 'color=c=black@0.0:s=301x201,format=rgba', '-f', 'lavfi', '-i', 'color=c=0x22cc66:s=150x100,format=rgba', '-filter_complex', '[0][1]overlay=50:50:format=auto,format=rgba', '-frames:v', '1', path.join(S, 'alfa.png')]);
gen(['-f', 'lavfi', '-i', 'testsrc2=s=640x480', '-frames:v', '1', path.join(S, 'foto.jpg')]);
gen(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=10:d=1', path.join(S, 'anim.gif')]);
fs.writeFileSync(path.join(S, 'legenda.srt'), Buffer.from('1\r\n00:00:01,000 --> 00:00:02,500\r\nOlá, ação!\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSegunda linha\r\n', 'latin1'));
fs.writeFileSync(path.join(S, 'dados.json'), JSON.stringify([{ nome: 'Ana', cidade: 'São Paulo', valor: 10.5 }, { nome: 'Bruno, Jr', cidade: 'Rio', valor: 20 }], null, 2));
fs.writeFileSync(path.join(S, 'planilha.csv'), 'nome;valor\nAna;1\nBia;2\n');
fs.writeFileSync(path.join(S, 'leia.md'), '# Título\n\nTexto com **negrito** e acentuação: ação.\n\n- um\n- dois\n');
fs.writeFileSync(path.join(S, 'qualquer.bin'), Buffer.alloc(2048, 7));

const cases = [
  ['clipe.mp4', 'v_mp4_h265', { codec: 'hevc' }],
  ['clipe.mp4', 'v_webm', { codec: 'vp9' }],
  ['clipe.mp4', 'v_mov_prores', { codec: 'prores' }],
  ['clipe.mp4', 'v_mov_dnxhr', { codec: 'dnxhd' }],
  ['clipe.mp4', 'v_mkv_remux', { codec: 'h264' }],
  ['clipe.mp4', 'v_gif', { codec: 'gif' }],
  ['clipe.mp4', 'a_mp3', { acodec: 'mp3' }],
  ['clipe.mp4', 'a_wav', { acodec: 'pcm_s24le' }],
  ['clipe.mp4', 'v_frame_png', { codec: 'png', width: 1280 }],
  ['clipe.mp4', 'v_mp4_h264', { codec: 'h264', height: 720, opts: { maxHeight: 480 }, expectHeight: 480 }],
  ['vertical.mov', 'v_mp4_h264', { codec: 'h264', opts: { maxHeight: 720, useGpu: false }, expectWidth: 720 }],
  ['tom.wav', 'a_mp3', { acodec: 'mp3' }],
  ['tom.wav', 'a_flac', { acodec: 'flac' }],
  ['tom.wav', 'a_m4a', { acodec: 'aac' }],
  ['tom.wav', 'a_ogg', { acodec: 'vorbis' }],
  ['tom.wav', 'a_opus', { acodec: 'opus' }],
  ['tom.wav', 'a_aiff', { acodec: 'pcm_s24be' }],
  ['tom.wav', 'a_alac', { acodec: 'alac' }],
  ['alfa.png', 'i_jpg', { codec: 'mjpeg' }],
  ['alfa.png', 'i_webp', { codec: 'webp' }],
  ['alfa.png', 'i_avif', { codec: 'av1' }],
  ['alfa.png', 'i_tiff', { codec: 'tiff' }],
  ['alfa.png', 'i_bmp', { codec: 'bmp' }],
  ['alfa.png', 'i_gif', { codec: 'gif' }],
  ['alfa.png', 'i_ico', { codec: 'png' }],
  ['foto.jpg', 'i_png', { codec: 'png' }],
  ['anim.gif', 'i_png', { codec: 'png' }],
  ['legenda.srt', 'sub_vtt', { contains: 'Olá, ação!' }],
  ['legenda.srt', 'sub_ass', { contains: 'Segunda linha' }],
  ['dados.json', 'dt_csv', { contains: '"Bruno, Jr"' }],
  ['dados.json', 'dt_tsv', { contains: 'São Paulo' }],
  ['planilha.csv', 'dt_json', { contains: '"valor": 2' }],
  ['leia.md', 't_html', { contains: '<strong>negrito</strong>' }],
  ['leia.md', 't_txt', { contains: 'Texto com negrito' }],
  ['qualquer.bin', 'any_zip', { minBytes: 100 }]
];
if (withOffice) {
  cases.push(['dados.json', 'dt_xlsx', { minBytes: 3000 }]);
  cases.push(['leia.md', 't_docx', { minBytes: 3000 }]);
}

(async () => {
  let pass = 0, fail = 0;
  const outputs = {};
  for (const [file, target, expect] of cases) {
    const input = path.join(S, file);
    const t0 = Date.now();
    try {
      const r = await engine.convert({ inputs: [input], targetId: target, opts: { quality: 'balanced', ...(expect.opts || {}) } });
      outputs[file + '>' + target] = r.output;
      const problems = [];
      if (path.resolve(r.output) === path.resolve(input)) problems.push('sobrescreveu o original');
      if (fs.readdirSync(path.dirname(r.output)).some(n => n.includes('.convertendo.'))) problems.push('sobrou arquivo parcial');
      if (expect.codec || expect.acodec || expect.width || expect.expectHeight || expect.expectWidth) {
        const p = await ff.probe(r.output);
        if (expect.codec && p.vcodec !== expect.codec) problems.push(`vcodec ${p.vcodec} ≠ ${expect.codec}`);
        if (expect.acodec && p.acodec !== expect.acodec) problems.push(`acodec ${p.acodec} ≠ ${expect.acodec}`);
        if (expect.width && p.width !== expect.width) problems.push(`largura ${p.width}`);
        if (expect.expectHeight && p.height !== expect.expectHeight) problems.push(`altura ${p.height} ≠ ${expect.expectHeight}`);
        if (expect.expectWidth && p.width !== expect.expectWidth) problems.push(`largura ${p.width} ≠ ${expect.expectWidth}`);
      }
      if (expect.contains && !fs.readFileSync(r.output, 'utf8').includes(expect.contains)) problems.push('conteúdo esperado ausente');
      if (expect.minBytes && r.bytes < expect.minBytes) problems.push(`${r.bytes} bytes`);
      if (problems.length) { fail++; console.log(`✖ ${file} → ${target}: ${problems.join('; ')}`); }
      else { pass++; console.log(`✔ ${file} → ${target} · ${path.basename(r.output)} · ${(r.bytes / 1024).toFixed(1)} KB · ${Date.now() - t0} ms`); }
    } catch (e) { fail++; console.log(`✖ ${file} → ${target}: ${e.message}`); }
  }
  // Segunda conversão igual: nunca sobrescreve, ganha "(convertido)".
  try {
    const again = await engine.convert({ inputs: [path.join(S, 'tom.wav')], targetId: 'a_mp3' });
    if (/\(convertido\)\.mp3$/.test(again.output)) { pass++; console.log('✔ repetição gera ' + path.basename(again.output)); }
    else { fail++; console.log('✖ repetição: ' + again.output); }
  } catch (e) { fail++; console.log('✖ repetição: ' + e.message); }
  // Destino inválido para a categoria é recusado.
  try { await engine.convert({ inputs: [path.join(S, 'tom.wav')], targetId: 'i_png' }); fail++; console.log('✖ aceitou destino inválido'); }
  catch (e) { pass++; console.log('✔ recusa destino inválido: ' + e.message); }
  // Cancelamento remove o parcial.
  try {
    const ac = new AbortController();
    const p = engine.convert({ inputs: [path.join(S, 'clipe.mp4')], targetId: 'v_mov_prores', opts: { quality: 'max' } }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    await p; fail++; console.log('✖ cancelamento não interrompeu');
  } catch (e) {
    const leftovers = fs.readdirSync(S).filter(n => n.includes('.convertendo.'));
    await new Promise(r => setTimeout(r, 600));
    const after = fs.readdirSync(S).filter(n => n.includes('.convertendo.'));
    if (e.cancelled && !after.length) { pass++; console.log('✔ cancelamento limpa o parcial'); }
    else { fail++; console.log('✖ cancelamento: ' + e.message + ' sobras=' + after.join(',') + ' antes=' + leftovers.join(',')); }
  }
  console.log(`\n${pass} ok · ${fail} falhas`);
  fs.writeFileSync(path.join(work, 'saidas.json'), JSON.stringify(outputs, null, 2));
  process.exitCode = fail ? 1 : 0;
})();
