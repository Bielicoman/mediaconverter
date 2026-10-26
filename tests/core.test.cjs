'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const F = require('../app/src/core/formats.cjs');
const { buildFfmpegArgs, parseProgress, scaleFilter, hasAlpha } = require('../app/src/core/plan.cjs');
const { uniqueOutput, partialPath } = require('../app/src/core/naming.cjs');
const D = require('../app/src/core/data.cjs');

test('categorias por extensão', () => {
  assert.equal(F.categoryOf('C:/a/b/Vídeo.MOV'), 'video');
  assert.equal(F.categoryOf('song.flac'), 'audio');
  assert.equal(F.categoryOf('x.jpeg'), 'image');
  assert.equal(F.categoryOf('relatorio.docx'), 'document');
  assert.equal(F.categoryOf('dados.csv'), 'data');
  assert.equal(F.categoryOf('LEIA-ME'), 'other');
  assert.equal(F.categoryOf('.gitignore'), 'other');
});

test('todo destino listado existe no catálogo', () => {
  for (const [cat, ids] of Object.entries(F.BY_CATEGORY)) for (const id of ids) assert.ok(F.TARGETS[id], `${cat}:${id}`);
  for (const [cat, ids] of Object.entries(F.WHEEL_DEFAULTS)) {
    assert.equal(new Set(ids).size, ids.length, cat);
    for (const id of ids) assert.ok(F.BY_CATEGORY[cat].includes(id), `${cat}:${id}`);
  }
});

test('não oferece conversão para a mesma extensão sem ganho', () => {
  assert.equal(F.isTargetValid('image', 'i_png', 'png'), false);
  assert.equal(F.isTargetValid('image', 'i_jpg', 'jpeg'), false);
  assert.equal(F.isTargetValid('video', 'v_mp4_h265', 'mp4'), true);
  assert.equal(F.isTargetValid('audio', 'a_mp3', 'mp3'), false);
  assert.equal(F.isTargetValid('document', 'd_docx', 'docx'), false);
  assert.equal(F.isTargetValid('data', 'dt_csv', 'csv'), false);
  assert.equal(F.isTargetValid('data', 'dt_xlsx', 'csv'), true);
});

test('roda: todas as opções sem limite e compactação para seleção mista', () => {
  const one = F.wheelTargets(['a.png']);
  assert.ok(one.targets.length > 8);
  assert.ok(!one.targets.includes('i_png'));
  assert.equal(one.targets[0], 'i_jpg');
  const mixed = F.wheelTargets(['a.png', 'b.mp3']);
  assert.deepEqual(mixed.targets, ['any_zip', 'any_7z', 'any_tar']);
  const vids = F.wheelTargets(['a.mp4', 'b.mov'], { video: ['v_gif', 'a_wav'] });
  assert.deepEqual(vids.targets.slice(0, 2), ['v_gif', 'a_wav']);
});

test('FFmpeg: H.264 com áudio, faststart e limite 1080p', () => {
  const { args } = buildFfmpegArgs({ targetId: 'v_mp4_h264', input: 'in.mov', output: 'out.mp4', probe: { hasVideo: true, hasAudio: true, width: 3840, height: 2160, duration: 10 }, maxHeight: 1080 });
  const s = args.join(' ');
  assert.match(s, /-c:v libx264/);
  assert.match(s, /-vf scale=-2:1080/);
  assert.match(s, /-c:a aac/);
  assert.match(s, /\+faststart/);
  assert.equal(args.at(-1), 'out.mp4');
});

test('FFmpeg: NVENC quando disponível', () => {
  const { args } = buildFfmpegArgs({ targetId: 'v_mp4_h265', input: 'a', output: 'b', probe: { hasVideo: true, hasAudio: false, width: 1920, height: 1080 }, gpu: { hevc_nvenc: true } });
  assert.ok(args.includes('hevc_nvenc'));
  assert.ok(!args.includes('-c:a'));
});

test('FFmpeg: JPG achata transparência em branco', () => {
  const { args } = buildFfmpegArgs({ targetId: 'i_jpg', input: 'a.png', output: 'b.jpg', probe: { hasVideo: true, width: 10, height: 10, pixFmt: 'rgba' } });
  assert.match(args.join(' '), /drawbox=.*white/);
  const opaque = buildFfmpegArgs({ targetId: 'i_jpg', input: 'a.png', output: 'b.jpg', probe: { hasVideo: true, width: 10, height: 10, pixFmt: 'rgb24' } });
  assert.doesNotMatch(opaque.args.join(' '), /drawbox/);
});

test('FFmpeg: áudio sem faixa falha com mensagem clara', () => {
  assert.throws(() => buildFfmpegArgs({ targetId: 'a_mp3', input: 'a', output: 'b', probe: { hasVideo: true, hasAudio: false } }), /não tem faixa de áudio/);
});

test('escala respeita retrato', () => {
  assert.equal(scaleFilter({ width: 1080, height: 1920 }, 720), 'scale=720:-2:flags=lanczos');
  assert.equal(scaleFilter({ width: 1280, height: 720 }, 1080), null);
  assert.equal(hasAlpha('yuva420p'), true);
  assert.equal(hasAlpha('yuv420p'), false);
});

test('progresso do FFmpeg', () => {
  assert.equal(parseProgress('frame=1\nout_time_us=2500000\nout_time_ms=2500000\nprogress=continue'), 2.5);
  assert.equal(parseProgress('nada'), null);
});

test('nome da cópia nunca sobrescreve nem coincide com o original', () => {
  const taken = new Set([path.join('C:/x', 'foto.jpg'), path.join('C:/x', 'foto (convertido).jpg')].map(p => path.resolve(p).toLowerCase()));
  const exists = p => taken.has(path.resolve(p).toLowerCase());
  assert.equal(uniqueOutput({ inputPath: 'C:/x/foto.png', ext: 'webp', exists }), path.join('C:/x', 'foto.webp'));
  assert.equal(uniqueOutput({ inputPath: 'C:/x/foto.png', ext: 'jpg', exists }), path.join('C:/x', 'foto (convertido 2).jpg'));
  assert.equal(uniqueOutput({ inputPath: 'C:/x/clip.mp4', ext: 'mp4', exists: () => false }), path.join('C:/x', 'clip (convertido).mp4'));
  assert.match(partialPath(path.join('C:/x', 'a.mp4')), /a\.convertendo\.[a-f0-9-]+\.mp4$/);
  assert.notEqual(partialPath('a.mp4'), partialPath('a.mp4'));
});

test('CSV: aspas, quebras de linha e separador ponto e vírgula', () => {
  const rows = D.parseDelimited('nome;obs\n"Ana";"linha 1\nlinha 2"\n"B ""x""";2\n');
  assert.deepEqual(rows, [['nome', 'obs'], ['Ana', 'linha 1\nlinha 2'], ['B "x"', '2']]);
  const json = JSON.parse(D.convertData('a,b\n1,texto\n', 'csv', 'json'));
  assert.deepEqual(json, [{ a: 1, b: 'texto' }]);
  const back = D.convertData(JSON.stringify([{ a: 1, b: 'x,y' }, { c: true }]), 'json', 'csv');
  assert.equal(back, '\uFEFFa,b,c\r\n1,"x,y",\r\n,,true\r\n');
});

test('Markdown vira HTML seguro', () => {
  const html = D.markdownToHtml('# Título\n\nTexto **forte** e [link](javascript:alert(1)).\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |');
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<strong>forte<\/strong>/);
  assert.match(html, /href="#"/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(D.markdownToHtml('<script>x</script>'), /<script>/);
});


test('radial layout fills the circle with exactly the available choices and logical shortcuts', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/src/ui/js/wheel-svg.js'),'utf8'),context);
  const arrange=context.window.MCWheel.arrange;
  for(const size of [0,1,2,3,6,20,41]){
    const items=Array.from({length:size},(_,i)=>({id:'format-'+i}));
    const slots=arrange(items,20);
    assert.equal(slots.length,size);
    assert.deepEqual(Array.from(slots.filter(x=>!x.placeholder),x=>x.id),items.map(x=>x.id));
    assert.deepEqual(Array.from(slots.filter(x=>!x.placeholder),x=>x.shortcut),items.map((_,i)=>i+1));
    assert.equal(slots.filter(x=>x.placeholder).length,0);
  }
});

