'use strict';
const {app,BrowserWindow}=require('electron');
if(process.platform==='linux')app.disableHardwareAcceleration();
const fs=require('fs'),path=require('path'),os=require('os');
app.setPath('appData',fs.mkdtempSync(path.join(os.tmpdir(),'mc-native-smoke-')));
process.argv=[process.argv[0],path.resolve('app')];
require('../app/src/main.cjs');
const timeout=setTimeout(()=>{console.error('Timeout de abertura');app.exit(1)},30000);
app.whenReady().then(()=>setTimeout(async()=>{
 try{
  const win=BrowserWindow.getAllWindows().find(w=>w.getTitle().startsWith('Media Converter'));
  if(!win)throw new Error('Painel ausente');
  const info=await win.webContents.executeJavaScript('window.mc.info()');
  const engines=await win.webContents.executeJavaScript('window.mc.engines()');
  if(!engines.ffmpeg)throw new Error('FFmpeg nativo não respondeu');
  const title=await win.webContents.executeJavaScript('document.title');
  if(!title.startsWith('Media Converter'))throw new Error('Renderer não respondeu');
  console.log('Painel e motor responderam:',title,engines.ffmpeg);
  fs.mkdirSync('docs/validation/native',{recursive:true});
  fs.writeFileSync('docs/validation/native/'+process.platform+'-'+process.arch+'.png',(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync('docs/validation/native/'+process.platform+'-'+process.arch+'.json',JSON.stringify({info,engines},null,2));
  console.log('Painel e FFmpeg validados:',process.platform,process.arch);clearTimeout(timeout);app.exit(0);
 }catch(e){console.error(e);app.exit(1)}
},3000));
