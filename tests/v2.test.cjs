'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const { PDFDocument } = require('../app/node_modules/pdf-lib');
const { options, pageIndices } = require('../app/src/core/options.cjs');
const { safeEntry } = require('../app/src/host/archives.cjs');
const engine = require('../app/src/host/engine.cjs'), ff = require('../app/src/host/ffmpeg.cjs');
const { WatchFolders } = require('../app/src/host/watch.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-v2-test-'));
engine.setTempRoot(path.join(root, 'temp'));
const outputs = path.join(root, 'outputs');
function generate(args) { const r = spawnSync(ff.ffmpegPath(), ['-hide_banner','-loglevel','error','-y',...args], { encoding:'utf8' }); assert.equal(r.status,0,r.stderr); }
const image = path.join(root,'image.png'), media = path.join(root,'clip.mp4');
generate(['-f','lavfi','-i','testsrc2=s=320x240:d=1','-frames:v','1',image]);
generate(['-f','lavfi','-i','testsrc2=s=320x240:d=2:r=24','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',media]);
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const before = [hash(image),hash(media)];
test('rejects invalid page ranges and preserves explicit page order',()=>{
  assert.deepEqual(pageIndices('3,1-2',3),[2,0,1]); assert.throws(()=>pageIndices('../x',3)); assert.throws(()=>pageIndices('1-4',3));
  assert.throws(()=>options({start:4,end:2})); assert.equal(options({width:Infinity}).width,0);
  assert.equal(options({background:'red;movie=x'}).background,'#ffffff');
});
test('archives reject traversal and drive paths',()=>{for(const x of ['../secret','a/../../x','C:\\Windows\\x','/root/file'])assert.throws(()=>safeEntry(x));assert.equal(safeEntry('a/b.txt'),'a/b.txt');});
test('image crop, resize and rotation execute on the copy',async()=>{
  const r = await engine.convert({inputs:[image],targetId:'image_edit',opts:{outDir:outputs,crop:{x:.25,y:.25,w:.5,h:.5},width:80,rotate:90,grayscale:true}});
  const p=await ff.probe(r.output);assert.equal(p.width,60);assert.equal(p.height,80);assert.equal(hash(image),before[0]);
});
test('video trim and speed preserve measurable duration; mute removes audio',async()=>{
  const r = await engine.convert({inputs:[media],targetId:'video_edit',opts:{outDir:outputs,start:.5,end:1.5,speed:2,mute:true,width:160,useGpu:false}});
  const p=await ff.probe(r.output);assert.equal(p.hasAudio,false);assert.equal(p.width,160);assert.ok(p.duration>=.4&&p.duration<=.7,JSON.stringify(p));assert.equal(hash(media),before[1]);
});
test('audio rate and time filters execute',async()=>{
  const r=await engine.convert({inputs:[media],targetId:'a_flac',opts:{outDir:outputs,start:.2,end:1.2,speed:2,sampleRate:48000,normalize:true}});
  const p=await ff.probe(r.output);assert.equal(p.sampleRate,48000);assert.ok(Math.abs(p.duration-.5)<.15);
});
test('new image and audio formats decode correctly',async()=>{
  for(const target of ['i_jp2','i_tga']){const r=await engine.convert({inputs:[image],targetId:target,opts:{outDir:outputs}});assert.equal((await ff.probe(r.output)).width,320);}
  for(const target of ['a_aac','a_ac3']){const r=await engine.convert({inputs:[media],targetId:target,opts:{outDir:outputs}});assert.equal((await ff.probe(r.output)).hasAudio,true);}
});
test('PDF merge, reorder and rotate work without Office',async()=>{
  const inputs=[];
  for(const [i,width] of [200,300].entries()){const doc=await PDFDocument.create();doc.addPage([width,400]);const file=path.join(root,`doc-${i}.pdf`);fs.writeFileSync(file,await doc.save());inputs.push(file);}
  const r=await engine.convert({inputs,targetId:'pdf_merge',opts:{outDir:outputs,rotate:90}});
  const doc=await PDFDocument.load(fs.readFileSync(r.output));assert.equal(doc.getPageCount(),2);assert.equal(doc.getPage(1).getWidth(),300);assert.equal(doc.getPage(0).getRotation().angle,90);
  const selected=await engine.convert({inputs:[r.output],targetId:'pdf_edit',opts:{outDir:outputs,pages:'2,1'}});
  const reordered=await PDFDocument.load(fs.readFileSync(selected.output));assert.equal(reordered.getPage(0).getWidth(),300);
  await assert.rejects(engine.convert({inputs:[image],targetId:'pdf_merge'}),/PDF/);
});
test('watch folder ignores baseline, waits for stable writes, never recurses into output',async()=>{
  const dir=path.join(root,'inbox');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'old.txt'),'old');const received=[];
  const watcher=new WatchFolders(path.join(root,'watch.json'),async(f,r)=>received.push([f,r]),60000);
  watcher.add(dir,'t_html');const fresh=path.join(dir,'new.txt');fs.writeFileSync(fresh,'new');await watcher.tick();assert.equal(received.length,0);
  await watcher.tick();assert.equal(received.length,1);assert.equal(received[0][0],fresh);await watcher.tick();assert.equal(received.length,1);
  fs.mkdirSync(path.join(dir,'Convertidos'));fs.writeFileSync(path.join(dir,'Convertidos','child.txt'),'skip');await watcher.tick();await watcher.tick();assert.equal(received.length,1);watcher.stop();
});
test('7Z pack/extract round trip returns original content',async()=>{
  const text=path.join(root,'nota.txt');fs.writeFileSync(text,'ação e café');const packed=await engine.convert({inputs:[text],targetId:'any_7z',opts:{outDir:outputs}});
  const unpacked=await engine.convert({inputs:[packed.output],targetId:'archive_extract',opts:{outDir:outputs}});assert.equal(fs.readFileSync(path.join(unpacked.output,'nota.txt'),'utf8'),'ação e café');
});
test('concurrent conversions never overwrite or replace each other',async()=>{
  const jobs=await Promise.allSettled([1,2].map(()=>engine.convert({inputs:[image],targetId:'i_webp',opts:{outDir:outputs}})));
  assert.ok(jobs.some(j=>j.status==='fulfilled'));assert.equal(hash(image),before[0]);
  const successful=jobs.filter(j=>j.status==='fulfilled');if(successful.length===2)assert.notEqual(successful[0].value.output,successful[1].value.output);
});
