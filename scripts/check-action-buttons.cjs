'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');const fs=require('fs'),path=require('path'),os=require('os');
app.setPath('appData',fs.mkdtempSync(path.join(os.tmpdir(),'mc-actions-')));
BrowserWindow.prototype.show=function(){};BrowserWindow.prototype.focus=function(){};
process.argv=[process.argv[0],path.resolve('app')];require('../app/src/main.cjs');
const output=path.resolve('site/examples/proposta-criativa.pdf');const calls=[];
setTimeout(()=>app.exit(1),15000);
app.whenReady().then(()=>setTimeout(async()=>{try{
 const win=BrowserWindow.getAllWindows().find(w=>w.getTitle().startsWith('Media Converter'));
 ipcMain.removeHandler('shell:openPath');ipcMain.removeHandler('shell:showItem');
 ipcMain.handle('shell:openPath',(_e,p)=>{calls.push({action:'open',path:p});return true});
 ipcMain.handle('shell:showItem',(_e,p)=>{calls.push({action:'folder',path:p});return true});
 win.webContents.send('history:changed',[{output,kind:'file',label:'PDF de exemplo',bytes:180361,ms:400}]);
 await new Promise(r=>setTimeout(r,200));
 const buttons=await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.history-item-actions button')).map(b=>({title:b.title,path:b.querySelector('path').getAttribute('d')}))`);
 if(buttons[0]?.title!=='Abrir arquivo'||!buttons[0].path.startsWith('M19 19')||buttons[1]?.title!=='Mostrar na pasta'||!buttons[1].path.startsWith('M10 4'))throw Error('Ícone ou ordem incorreta');
 await win.webContents.executeJavaScript(`document.querySelector('.history-item-actions button[title="Abrir arquivo"]').click()`);
 await win.webContents.executeJavaScript(`document.querySelector('.history-item-actions button[title="Mostrar na pasta"]').click()`);
 if(calls.length!==2||calls[0].action!=='open'||calls[1].action!=='folder'||calls.some(c=>c.path!==output))throw Error('Ação incorreta');
 const geometry=await win.webContents.executeJavaScript(`(()=>{const results=[];const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:372px;height:306px';document.body.append(host);for(const count of [1,2,3,6,20,41]){const items=Array.from({length:count},(_,i)=>({badge:'F'+i,label:'Formato '+i,available:true}));const ctl=window.MCWheel.build(host,items);ctl.svg.style.width='100%';ctl.svg.style.height='100%';host.querySelectorAll('.mc-slice').forEach(g=>{g.style.transform='none';g.style.transition='none'});const hits=Array.from(host.querySelectorAll('.mc-badge'),(label,i)=>{const r=label.getBoundingClientRect();return {expected:i,hit:ctl.hit({clientX:r.x+r.width/2,clientY:r.y+r.height/2})}});results.push({count,passed:hits.every(h=>h.hit===h.expected),hits});}host.remove();return results})()`);
 if(geometry.some(g=>!g.passed))throw Error('Área clicável incorreta: '+JSON.stringify(geometry));
 fs.mkdirSync('docs/validation',{recursive:true});fs.writeFileSync('docs/validation/action-buttons.json',JSON.stringify({passed:true,buttons,calls,geometry},null,2));app.exit(0);
 }catch(e){fs.writeFileSync('docs/validation/action-buttons-error.txt',e.stack);app.exit(1)}},2500));

