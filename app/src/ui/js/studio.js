'use strict';
(() => {
  const api = window.mc, $ = id => document.getElementById(id);
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-dialog'; dialog.id = 'studioDialog';
  dialog.innerHTML = `<header class="studio-head"><div><h2 id="studioTitle">Preparar cópia</h2><p id="studioFile"></p></div><button id="studioClose" aria-label="Fechar ferramentas">×</button></header>
  <div class="studio-layout"><section class="studio-preview"><div class="crop-canvas" id="studioVisual"><canvas id="cropCanvas"></canvas></div><div id="studioDocument" class="preview-file"></div><ol class="pdf-order" id="pdfOrder"></ol><p id="studioPreviewHint" class="preview-label"></p></section>
  <section class="studio-options"><h3>Saída</h3><label>Formato<select id="studioTarget"></select></label>
  <label>Qualidade<select id="studioQuality"><option value="max">Máxima</option><option value="balanced">Equilibrada</option><option value="small">Compacta</option></select></label>
  <div class="studio-presets" id="studioPresets"></div>
  <section id="studioImageOptions" class="studio-mode-options"><h3>Enquadramento e tamanho</h3><div class="studio-presets"><button id="cropReset">Imagem inteira</button><button data-ratio="1">1:1</button><button data-ratio="1.7777778">16:9</button><button data-ratio="0.5625">9:16</button></div><div class="studio-pair"><label>Largura (px)<input id="studioWidth" type="number" min="0" max="16384" value="0"></label><label>Altura (px)<input id="studioHeight" type="number" min="0" max="16384" value="0"></label></div><p class="studio-note">0 mantém a dimensão automática. O tamanho cabe na caixa sem distorcer.</p><label>Fundo para JPG / AVIF / BMP<input id="studioBackground" type="color" value="#ffffff"></label><label class="toggle-row"><input type="checkbox" id="studioGray">Preto e branco</label><label class="toggle-row"><input type="checkbox" id="studioFlip">Espelhar horizontalmente</label></section>
  <label id="studioRotateLabel">Rotação<select id="studioRotate"><option value="0">Sem rotação</option><option value="90">90° à direita</option><option value="180">180°</option><option value="270">90° à esquerda</option></select></label>
  <section id="studioMediaOptions" class="studio-mode-options"><h3>Trecho e reprodução</h3><div class="studio-pair"><label>Início (s)<input id="studioStart" type="number" min="0" step="0.1" value="0"></label><label>Fim (s, 0 = todo)<input id="studioEnd" type="number" min="0" step="0.1" value="0"></label></div><label>Velocidade<select id="studioSpeed"><option value="0.5">0,5×</option><option value="1">1×</option><option value="1.5">1,5×</option><option value="2">2×</option></select></label><label class="toggle-row" id="studioMuteLabel"><input type="checkbox" id="studioMute">Remover áudio do vídeo</label><label class="toggle-row"><input type="checkbox" id="studioNormalize">Normalizar volume (−16 LUFS)</label><label>Amostragem<select id="studioRate"><option value="0">Original</option><option value="44100">44,1 kHz</option><option value="48000">48 kHz</option><option value="96000">96 kHz</option></select></label></section>
  <section id="studioPdfOptions" class="studio-mode-options"><label>Páginas de cada PDF<input id="studioPages" placeholder="Todas, ou 1-3, 5, 8"></label><p class="studio-note">A ordem digitada é preservada. Use as setas na lista para ordenar os PDFs antes de unir.</p></section>
  <label class="toggle-row" id="studioMetadataLabel"><input type="checkbox" id="studioMetadata">Remover metadados da cópia</label>
  <div class="studio-presets"><button id="studioSavePreset">Salvar preset</button><button id="studioLoadPreset">Usar meu preset</button></div></section></div>
  <footer class="studio-footer"><p id="studioStatus" aria-live="polite">O original fica intacto.</p><button id="studioRun">Salvar cópia</button></footer>`;
  document.body.append(dialog);
  let files = [], info = [], crop = null, image = null, anchor = null, activeJob = '', busy = false, output = '', openGeneration = 0;
  const canvas = $('cropCanvas'), ctx = canvas.getContext('2d');
  const number = id => Number($(id).value) || 0;
  const status = (s, error = false) => { $('studioStatus').textContent = s; $('studioStatus').className = error ? 'studio-error' : ''; };
  function readOptions() {
    return { quality: $('studioQuality').value, width: number('studioWidth'), height: number('studioHeight'), crop,
      rotate: number('studioRotate'), flip: $('studioFlip').checked, grayscale: $('studioGray').checked,
      background: $('studioBackground').value, start: number('studioStart'), end: number('studioEnd'), speed: number('studioSpeed'),
      mute: $('studioMute').checked, normalize: $('studioNormalize').checked, sampleRate: number('studioRate'),
      stripMetadata: $('studioMetadata').checked, pages: $('studioPages').value };
  }
  function draw() {
    if (!image) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (crop) {
      const x = crop.x * canvas.width, y = crop.y * canvas.height, w = crop.w * canvas.width, h = crop.h * canvas.height;
      ctx.save(); ctx.fillStyle = '#08110b99'; ctx.beginPath(); ctx.rect(0,0,canvas.width,canvas.height); ctx.rect(x,y,w,h); ctx.fill('evenodd');
      ctx.strokeStyle = '#8df0b9'; ctx.lineWidth = 2; ctx.strokeRect(x,y,w,h);
      ctx.globalAlpha = .5; for(let n=1;n<3;n++){ ctx.beginPath();ctx.moveTo(x+w*n/3,y);ctx.lineTo(x+w*n/3,y+h);ctx.moveTo(x,y+h*n/3);ctx.lineTo(x+w,y+h*n/3);ctx.stroke(); }ctx.restore();
    }
  }
  function point(e) { const r = canvas.getBoundingClientRect(); return { x: Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y: Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)) }; }
  canvas.onpointerdown = e => { if(busy)return;anchor=point(e);canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => { if(!anchor)return; const p=point(e); crop={x:Math.min(p.x,anchor.x),y:Math.min(p.y,anchor.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y)};draw(); };
  canvas.onpointerup = () => { anchor=null;if(crop && (crop.w<.01||crop.h<.01))crop=null;draw(); };
  $('cropReset').onclick = () => { crop=null;draw(); };
  dialog.querySelectorAll('[data-ratio]').forEach(b => b.onclick = () => {
    if(!image)return;const ratio=Number(b.dataset.ratio), source=image.width/image.height;
    const w = source > ratio ? ratio/source : 1, h=source>ratio?1:source/ratio;
    crop={x:(1-w)/2,y:(1-h)/2,w,h};draw();
  });
  function pdfOrder() {
    $('pdfOrder').replaceChildren();
    files.forEach((file,i)=>{const li=document.createElement('li'),label=document.createElement('span');label.textContent=file.split(/[\\/]/).pop();li.append(label);
      for(const [text,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.textContent=text;b.disabled=i+delta<0||i+delta>=files.length||busy;b.onclick=()=>{[files[i],files[i+delta]]=[files[i+delta],files[i]];pdfOrder();};li.append(b);}$('pdfOrder').append(li);});
  }
  async function open(paths) {
    if (busy) return;
    const generation = ++openGeneration;
    const selected=paths.slice(), described=await api.files.describe(selected); if(generation!==openGeneration || !described.length)return;
    files=selected; info=described;
    const first=info[0], cat=first.category, isImage=cat==='image', isVideo=cat==='video', isAudio=cat==='audio', isPdf=cat==='pdf';
    if(files.length>1 && !info.every(f=>f.category===cat)){status('Selecione arquivos do mesmo tipo.',true);return;}
    crop=null;image=null;output='';activeJob='';
    $('studioFile').textContent=files.length===1?first.name:`${files.length} arquivos · uma cópia por arquivo${isPdf?' ou um PDF unido':''}`;
    $('studioTitle').textContent=isImage?'Preparar imagem':isVideo?'Preparar vídeo':isAudio?'Preparar áudio':isPdf?'Organizar PDFs':'Preparar conversão';
    const target=$('studioTarget');target.replaceChildren();
    for(const t of first.targets.filter(t=>info.every(f=>f.targets.some(x=>x.id===t.id)) && t.id!=='any_zip')){const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.label;opt.disabled=!t.available;target.append(opt);}
    target.value=({image:'image_edit',video:'video_edit',audio:'audio_edit',pdf:files.length>1?'pdf_merge':'pdf_edit'})[cat]||first.defaultTarget;
    if(!target.value)target.selectedIndex=0;
    for(const id of ['studioWidth','studioHeight','studioStart','studioEnd','studioRotate','studioRate'])$(id).value='0';
    $('studioSpeed').value='1';$('studioQuality').value='balanced';$('studioPages').value='';$('studioBackground').value='#ffffff';
    for(const id of ['studioGray','studioFlip','studioMute','studioNormalize','studioMetadata'])$(id).checked=false;
    $('studioImageOptions').hidden=!(isImage||isVideo);$('studioMediaOptions').hidden=!(isVideo||isAudio);$('studioPdfOptions').hidden=!isPdf;
    $('studioRotateLabel').hidden=!(isImage||isVideo||isPdf);$('studioMuteLabel').hidden=!isVideo;$('studioMetadataLabel').hidden=!(isImage||isVideo||isAudio);
    $('studioVisual').hidden=!(isImage||isVideo);$('studioDocument').hidden=isImage||isVideo||isPdf;$('pdfOrder').hidden=!isPdf;
    $('studioDocument').textContent=first.ext.toUpperCase();$('studioPreviewHint').textContent=isImage||isVideo?'Arraste na imagem para marcar o recorte. As medidas são aplicadas antes da rotação.':isPdf?'Os PDFs são processados localmente.':'Trecho e ajustes são aplicados à cópia.';
    $('studioRun').textContent='Salvar cópia';$('studioRun').disabled=false;status('O original fica intacto.');pdfOrder();
    const presets=$('studioPresets');presets.replaceChildren();
    if(isImage||isVideo)for(const [name,width,height] of [['Original',0,0],['Web 1920',1920,0],['Social 1080',1080,1080],['Miniatura',480,0]]){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{$('studioWidth').value=width;$('studioHeight').value=height;};presets.append(b);}
    dialog.showModal();
    if(isImage||isVideo){try{const r=await api.files.probe(first.path);if(generation!==openGeneration)return;if(!r?.thumb){$('studioVisual').hidden=true;return;}const img=new Image();img.onload=()=>{if(generation!==openGeneration)return;image=img;const k=Math.min(1,560/img.width,390/img.height);canvas.width=Math.round(img.width*k);canvas.height=Math.round(img.height*k);draw();};img.src=r.thumb;}catch(e){status(e.message,true);}}
  }
  $('studioClose').onclick=()=>{if(busy)jobIds.forEach(id=>api.convert.cancel(id));else {openGeneration++;dialog.close();}};
  dialog.addEventListener('cancel',e=>{if(busy){e.preventDefault();jobIds.forEach(id=>api.convert.cancel(id));}});
  $('studioSavePreset').onclick=()=>{try{localStorage.setItem('mc.studio.preset.'+info[0].category,JSON.stringify(readOptions()));status('Preset salvo para este tipo de arquivo.');}catch(e){status(e.message,true);}};
  $('studioLoadPreset').onclick=()=>{try{const s=JSON.parse(localStorage.getItem('mc.studio.preset.'+info[0].category)||'null');if(!s)return status('Salve um preset primeiro.');for(const [key,id] of Object.entries({quality:'studioQuality',width:'studioWidth',height:'studioHeight',rotate:'studioRotate',background:'studioBackground',start:'studioStart',end:'studioEnd',speed:'studioSpeed',sampleRate:'studioRate',pages:'studioPages'}))$(id).value=s[key];for(const [key,id] of Object.entries({flip:'studioFlip',grayscale:'studioGray',mute:'studioMute',normalize:'studioNormalize',stripMetadata:'studioMetadata'}))$(id).checked=s[key];crop=s.crop||null;draw();status('Preset aplicado.');}catch(e){status(e.message,true);}};
  let remaining=0, failures=0, jobIds=[];
  $('studioRun').onclick=async()=>{
    if(output){await api.shell.showItem(output);return;}
    const target=$('studioTarget').value;if(!target)return;
    const opts=readOptions();
    if(opts.end && opts.end<=opts.start)return status('O fim deve ser maior que o início.',true);
    const multi=target==='pdf_merge';
    activeJob='s'+Date.now();const jobs=multi?[{id:activeJob,inputs:files,targetId:target}]:files.map((f,i)=>({id:activeJob+'-'+i,inputs:[f],targetId:target}));
    jobIds=jobs.map(j=>j.id);remaining=jobs.length;failures=0;busy=true;$('studioRun').disabled=true;status('Preparando cópia…');
    try{await api.convert.start(jobs,opts);}catch(e){busy=false;$('studioRun').disabled=false;status(e.message,true);}
  };
  api.convert.onProgress(({id,fraction})=>{if(id.startsWith(activeJob)&&activeJob)status(`Convertendo · ${Math.floor(fraction*100)}%`);});
  function complete(id,result,error){if(!activeJob||!id.startsWith(activeJob))return;if(error)failures++;if(result)output=result.output;remaining--;if(remaining>0)return;busy=false;$('studioRun').disabled=false;$('studioRun').textContent=output?'Mostrar cópia':'Tentar novamente';status(error|| (failures?`${failures} arquivo(s) com erro.`:'Cópia salva. O original foi preservado.'),!!error||!!failures);}
  api.convert.onDone(({id,result})=>complete(id,result));api.convert.onError(({id,message})=>complete(id,null,message));
  api.tools.onInit(async data => { await open(Array.isArray(data) ? data : data.files); const focus = !Array.isArray(data) && data.focus; if (focus && $(focus)) { $(focus).scrollIntoView({ block: 'center' }); $(focus).focus(); } });
  window.MCStudio={open};
})();
