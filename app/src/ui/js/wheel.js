'use strict';
(()=>{
 const api=window.mc,$=id=>document.getElementById(id);let payload,ctl,mode='formats',page=0,current=[],busy=false,jobs=new Map(),outputs=[],timer,modeTimer,hoverMode=null;
 const tip=(text,error=false)=>{$('tip').textContent=text;$('tip').className='on'+(error?' err':'');};
 function items(){
  if(mode==='actions')return [{id:'reveal',badge:'PASTA',label:'Mostrar na pasta',desc:'Localizar o original'},{id:'copyPath',badge:'CAMINHO',label:'Copiar caminho',desc:'Endereço completo'},{id:'open',badge:'ABRIR',label:'Abrir original',desc:'Aplicativo padrão'},{id:'panel',badge:'PAINEL',label:'Abrir painel',desc:'Preparar esta seleção'}];
  const all=payload.allTargets||payload.targets||[];
  if(mode==='tools'){
    const category=payload.files[0]?.category;
    const presets={image:[['RECORTE','Recortar','cropCanvas'],['TAMANHO','Redimensionar','studioWidth'],['GIRAR','Girar imagem','studioRotate'],['FUNDO','Cor do fundo','studioBackground'],['ESPELHO','Espelhar','studioFlip'],['P&B','Preto e branco','studioGray'],['META','Remover metadados','studioMetadata'],['COMPRIMIR','Comprimir imagem','studioQuality']],video:[['TRECHO','Cortar trecho','studioStart'],['TAMANHO','Redimensionar','studioWidth'],['GIRAR','Girar vídeo','studioRotate'],['SEM SOM','Remover áudio','studioMute'],['RITMO','Velocidade','studioSpeed'],['VOLUME','Normalizar volume','studioNormalize'],['META','Remover metadados','studioMetadata']],audio:[['TRECHO','Cortar áudio','studioStart'],['RITMO','Velocidade','studioSpeed'],['VOLUME','Normalizar volume','studioNormalize'],['KHZ','Taxa de amostragem','studioRate'],['META','Remover metadados','studioMetadata']],pdf:[['PÁGINAS','Selecionar páginas','studioPages'],['GIRAR','Girar páginas','studioRotate'],['UNIR','Unir PDFs','studioTarget']]};
    if(presets[category])return presets[category].map(([badge,label,focus])=>({id:'tool-'+focus,badge,label,focus,tool:true,desc:'Abrir opções antes de salvar'}));
    return all.filter(t=>t.tool);
  }
  return (payload.targets?.length ? payload.targets : all).filter(t=>!t.tool);
 }
 function render(){digits='';const all=items();const slots = all.length;
  current=window.MCWheel.arrange(all,slots);
  $('wheelPageLabel').textContent=`${all.length} opções`;$('wheelPrev').hidden=$('wheelNext').hidden=true;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('empty').classList.toggle('on',!payload.files.length&&!payload.gesture);$('stage').style.display=!payload.files.length&&!payload.gesture?'none':'';
  ctl=window.MCWheel.build($('stage'),current,{centerTitle:payload.files[0]?(payload.files.length>1?`${payload.files.length} arquivos`:payload.files[0].ext.toUpperCase()):'Solte aqui',centerSub:payload.files[0]?.name?.slice(0,18)||'uma cópia nova',onHover:i=>{if(!busy){if(current[i]&&!current[i].placeholder){document.body.classList.add('hovering');tip(current[i].label+' · '+(current[i].reason||current[i].desc));}else{document.body.classList.remove('hovering');tip('Número + Enter  ·  Tab  ·  Esc');}}},onPick:pick});
  tip(current.length?(payload.gesture?'Passe nas abas para trocar · solte na opção':'Número + Enter · Tab alterna rodas · Esc cancela'):'Abra o painel para as opções deste tipo.');
 }
 function init(p){payload=p;mode='formats';page=0;busy=false;jobs.clear();outputs=[];clearTimeout(timer);$('doneActions').classList.remove('on');$('show').style.display='';document.body.dataset.theme=p.theme||'dark';document.body.classList.remove('converting','has-thumb');$('wheelThumb').hidden=true;render();if(p.files[0])api.files.probe(p.files[0].path).then(r=>{if(payload===p&&r?.thumb){$('wheelThumb').src=r.thumb;$('wheelThumb').hidden=false;document.body.classList.add('has-thumb');}}).catch(()=>{});}
 async function pick(i){if(busy||!current[i]||current[i].available===false)return;const t=current[i],files=payload.files.map(f=>f.path);if(!files.length)return tip('Solte arquivos locais primeiro.');
  if(mode==='actions'){try{if(t.id==='panel')await api.wheel.openPanel(files);else{await api.action(t.id,files);api.wheel.close();}}catch(e){tip(e.message,true);}return;}
  if(t.tool)return api.tools.open(files,t.focus);
  busy=true;document.body.classList.add('converting');ctl.setActive(i);ctl.setState('busy');ctl.setProgress(0);ctl.setCenter('Preparando',t.badge);
  const base='w'+Date.now(),list=t.multi?[{id:base,inputs:files,targetId:t.id}]:files.map((f,k)=>({id:base+'-'+k,inputs:[f],targetId:t.id}));jobs=new Map(list.map(j=>[j.id,{done:false,fraction:0,error:''}]));try{await api.convert.start(list);}catch(e){fail(e.message);}
 }
 function refresh(){let total=0;for(const j of jobs.values())total+=j.done?1:j.fraction;const f=total/jobs.size;ctl.setProgress(f);ctl.setCenter(Math.floor(f*100)+'%',`${[...jobs.values()].filter(j=>j.done).length}/${jobs.size}`);}
 function fail(s){busy=false;api.wheel.done();ctl?.setState('error');ctl?.setCenter('Erro','');tip(s,true);$('doneActions').classList.add('on');$('show').style.display='none';}
 function finish(){if(![...jobs.values()].every(j=>j.done))return;api.wheel.done();busy=false;const errors=[...jobs.values()].filter(j=>j.error);if(!outputs.length)return fail(errors[0]?.error||'Falha na conversão.');ctl.setState('done');ctl.setProgress(1);tip(errors.length?`${outputs.length} cópias · ${errors.length} com erro`:`Cópia salva · ${outputs.length===1?outputs[0].split(/[\\/]/).pop():outputs.length+' arquivos'}`,!!errors.length);$('doneActions').classList.add('on');timer=setTimeout(()=>api.wheel.close(),6500);}
 api.convert.onProgress(({id,fraction})=>{const j=jobs.get(id);if(j){j.fraction=fraction;refresh();}});api.convert.onDone(({id,result})=>{const j=jobs.get(id);if(j){j.done=true;outputs.push(result.output);refresh();finish();}});api.convert.onError(({id,message})=>{const j=jobs.get(id);if(j){j.done=true;j.error=message;refresh();finish();}});
 function cancel(){if(busy)for(const id of jobs.keys())api.convert.cancel(id);else api.wheel.close();}
 document.addEventListener('pointerdown',e=>{
  if(busy||e.button!==0)return;
  if(e.target===document.body||e.target===document.documentElement||(e.target.closest('#stage')&&!e.target.closest('.mc-center')&&ctl?.hit(e)===-1))api.wheel.close();
 });
 $('close').onclick=cancel;$('dismiss').onclick=()=>api.wheel.close();$('show').onclick=()=>{if(outputs[0])api.shell.showItem(outputs[0]);api.wheel.close();};$('pick').onclick=()=>api.wheel.pickFiles();$('panel').onclick=()=>api.wheel.openPanel([]);
 const turn=d=>{if(!busy&&ctl){const valid=current.map((t,i)=>t.available!==false?i:-1).filter(i=>i>=0);if(!valid.length)return;const at=valid.indexOf(ctl.active);ctl.setActive(valid[(at+d+valid.length)%valid.length]);}};$('wheelNext').onclick=()=>turn(1);$('wheelPrev').onclick=()=>turn(-1);
 function clearModeHover(){clearTimeout(modeTimer);hoverMode?.classList.remove('drag-hover');hoverMode=null;}
 function selectMode(next){if(!busy&&mode!==next){clearModeHover();mode=next;page=0;render();}}
 document.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>selectMode(b.dataset.mode);b.title='Durante o arraste, passe aqui para trocar';});
 let digits='',lastDigit=0;let lastScroll=0;document.addEventListener('wheel',e=>{e.preventDefault();if(Date.now()-lastScroll>250){lastScroll=Date.now();turn(e.deltaY>0?1:-1);}},{passive:false});
 document.addEventListener('contextmenu',e=>{e.preventDefault();if(!busy){mode=mode==='tools'?'formats':'tools';page=0;render();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')return cancel();if(busy)return;if(e.key==='Tab'){e.preventDefault();const modes=['formats','tools','actions'];mode=modes[(modes.indexOf(mode)+(e.shiftKey?2:1))%3];return render();}if(['t','a','c'].includes(e.key.toLowerCase())){mode={t:'tools',a:'actions',c:'formats'}[e.key.toLowerCase()];page=0;return render();}if(/^[0-9]$/.test(e.key)){if(Date.now()-lastDigit>1200)digits='';digits+=e.key;lastDigit=Date.now();const index=current.findIndex(t=>t.shortcut===Number(digits));if(index>=0&&current[index].available!==false)ctl.setActive(index);return;}const n=current.length;if(!n)return;if(['ArrowRight','ArrowDown'].includes(e.key)){digits='';turn(1);}if(['ArrowLeft','ArrowUp'].includes(e.key)){digits='';turn(-1);}if(e.key==='Enter'){const typed=digits&&Date.now()-lastDigit<5000?current.findIndex(t=>t.shortcut===Number(digits)):-1;const selected=typed>=0?typed:ctl.active;if(selected>=0)pick(selected);digits='';}});
 for(const ev of ['dragenter','dragover'])document.addEventListener(ev,e=>{
  e.preventDefault();e.dataTransfer.dropEffect='copy';
  const tab=!busy&&e.target.closest?.('[data-mode]');
  if(tab&&tab.dataset.mode!==mode){
    if(hoverMode!==tab){clearModeHover();hoverMode=tab;tab.classList.add('drag-hover');modeTimer=setTimeout(()=>selectMode(tab.dataset.mode),180);}
  }else clearModeHover();
  if(ctl&&!busy)ctl.setActive(ctl.hit(e));
 });
 document.addEventListener('dragleave',e=>{if(!e.relatedTarget||!hoverMode?.contains(e.relatedTarget))clearModeHover();});
 document.addEventListener('dragend',clearModeHover);
 document.addEventListener('drop',clearModeHover);
 document.addEventListener('drop',async e=>{e.preventDefault();if(busy)return;const chosen=current[ctl?.hit(e)??-1],oldMode=mode;const files=[...e.dataTransfer.files].map(f=>api.files.pathOf(f)).filter(Boolean);if(!files.length)return tip('Solte arquivos locais do Explorador.',true);try{init(await api.wheel.drop(files));if(chosen){mode=oldMode;const all=items(),index=all.findIndex(t=>t.id===chosen.id);if(index>=0){render();pick(current.findIndex(t=>t.id===chosen.id));}else{mode='formats';render();tip('Escolha um formato compatível com os arquivos soltos.');}}}catch(error){fail(error.message);}});
 document.addEventListener('mouseenter',()=>clearTimeout(timer));api.wheel.onInit(init);
})();






