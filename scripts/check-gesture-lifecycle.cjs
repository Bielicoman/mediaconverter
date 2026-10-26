'use strict';
// Integração do main real; substitui somente a observação física e a seleção do shell.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
app.setPath('appData',fs.mkdtempSync(path.join(os.tmpdir(),'mc-hold-')));
let observer,selection=async()=>({files:[path.resolve('site/examples/proposta-criativa.docx')],source:'explorer'});
require.cache[require.resolve('../app/src/host/gesture.cjs')]={exports:{Gesture:class{
  constructor(drag,release){observer={drag,release};this.ready=true;} start(){} stop(){}
}}};
const ps=require('../app/src/host/powershell.cjs');
ps.ExplorerHelper=class { start(){return Promise.resolve()} stop(){} selection(){return selection()} };
const seen=new Map();
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.focus=function(){};
BrowserWindow.prototype.showInactive=function(){seen.set(this,true)};
BrowserWindow.prototype.hide=function(){seen.set(this,false)};
process.argv=[process.argv[0],path.resolve('app')];require('../app/src/main.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await wait(25)}throw Error('Tempo esgotado')};
const wheel=()=>BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('roda rápida'));
const timeout=setTimeout(()=>app.exit(1),35000);
app.whenReady().then(async()=>{try{
  await wait(800);
  await observer.drag(); await until(()=>seen.get(wheel())===true);
  const original=wheel();
  const tabs=await original.webContents.executeJavaScript(`(async()=>{
    const visited=[];
    for(const mode of ['tools','actions','formats']){
      const button=document.querySelector('[data-mode="'+mode+'"]');
      button.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
      await new Promise(r=>setTimeout(r,240));
      visited.push(document.querySelector('[data-mode].active').dataset.mode);
    }
    return visited;
  })()`);
  assert.deepEqual(tabs,['tools','actions','formats']);
  // Sem expiração automática, inclusive além do limite antigo de 20 segundos.
  await wait(20500); assert.equal(seen.get(original),true);
  observer.release(); assert.equal(seen.get(original),false);
  await observer.drag(); assert.equal(wheel(),original); assert.equal(seen.get(original),true);
  const payload=await original.webContents.executeJavaScript(`window.mc.wheel.drop([${JSON.stringify(path.resolve('site/examples/proposta-criativa.docx'))}])`);
  assert.equal(payload.gesture,true);
  observer.release(); assert.equal(seen.get(original),false); assert.equal(original.isDestroyed(),false);
  let resolve; selection=()=>new Promise(r=>resolve=r);
  const pending=observer.drag(); observer.release();
  resolve({files:[path.resolve('site/examples/proposta-criativa.docx')],source:'explorer'});
  await pending; assert.equal(seen.get(original),false);
  fs.mkdirSync('docs/validation',{recursive:true});
  fs.writeFileSync('docs/validation/gesture-lifecycle.json',JSON.stringify({passed:true,dragHoverTabs:tabs,heldBeyond20Seconds:true,releaseImmediate:true,repressSameDrag:true,dropKeepsGestureMode:true,lateSelectionDoesNotReopen:true,physicalInputSimulated:true},null,2));
  clearTimeout(timeout);app.exit(0);
}catch(e){console.error(e);fs.writeFileSync('docs/validation/gesture-lifecycle-error.txt',e.stack);app.exit(1)}});
