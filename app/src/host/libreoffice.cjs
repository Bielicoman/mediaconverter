'use strict';
const fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
const {run}=require('./proc.cjs');
function binary(){return ['/Applications/LibreOffice.app/Contents/MacOS/soffice','/usr/bin/libreoffice','/usr/bin/soffice','/snap/bin/libreoffice'].find(p=>fs.existsSync(p))||null;}
async function convert(input,ext,tmp,signal){
 const exe=binary();if(!exe)throw new Error('Instale o LibreOffice para converter documentos nesta plataforma.');
 const out=path.join(tmp,'office-output');fs.mkdirSync(out,{recursive:true});
 await run(exe,['-env:UserInstallation='+pathToFileURL(path.join(tmp,'office-profile')).href,'--headless','--convert-to',ext,'--outdir',out,input],{signal,timeout:180000});
 const file=path.join(out,path.parse(input).name+'.'+ext);if(!fs.existsSync(file))throw new Error('O LibreOffice não produziu o arquivo solicitado.');return file;
}
module.exports={binary,convert};
