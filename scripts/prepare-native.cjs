'use strict';
const fs=require('fs');
for(const file of [require('../app/node_modules/ffmpeg-static'),require('../app/node_modules/ffprobe-static').path,require('../app/node_modules/7zip-bin').path7za]){
 if(!fs.existsSync(file))throw new Error('Motor ausente: '+file);
 if(process.platform!=='win32')fs.chmodSync(file,0o755);
}
console.log('Motores nativos prontos para',process.platform,process.arch);
