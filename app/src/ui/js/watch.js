'use strict';
(() => {
  const api=window.mc, host=document.createElement('section');host.className='main-card';
  host.innerHTML='<h3 style="font-size:16px;font-weight:600">Pastas automáticas</h3><p class="studio-note">Arquivos novos e compatíveis são convertidos após terminar a cópia. As saídas ficam em uma subpasta Convertidos; arquivos já existentes são ignorados.</p><div class="studio-pair"><select id="watchTarget" class="target-select" aria-label="Formato automático"></select><button id="watchAdd" class="btn-paste">Monitorar uma pasta</button></div><div id="watchList"></div><p class="studio-note" id="watchStatus" aria-live="polite"></p>';
  document.getElementById('tab-folder').append(host);
  const $=id=>document.getElementById(id);
  function render(rules){$('watchList').replaceChildren();for(const r of rules){const row=document.createElement('div');row.className='group-row';const label=document.createElement('div');label.className='group-label';label.textContent=r.dir;const small=document.createElement('small');small.textContent='→ '+r.targetId+' · Convertidos';label.append(small);const button=document.createElement('button');button.className='btn-paste';button.textContent='Parar';button.onclick=async()=>render(await api.watch.remove(r.id));row.append(label,button);$('watchList').append(row);}}
  $('watchAdd').onclick=async()=>{try{const dir=await api.dialog.openFolder('Monitorar novos arquivos desta pasta');if(!dir)return;render(await api.watch.add(dir,$('watchTarget').value));$('watchStatus').textContent='Monitoramento ativo enquanto o Media Converter estiver aberto.';}catch(e){$('watchStatus').textContent=e.message;}};
  api.catalog().then(c=>{const seen=new Set();for(const cat of Object.values(c.categories))for(const t of cat.targets){if(seen.has(t.id)||!t.available||t.multi||t.tool||t.folder)continue;seen.add(t.id);const o=document.createElement('option');o.value=t.id;o.textContent=t.label;$('watchTarget').append(o);}$('watchTarget').value='i_webp';});
  api.watch.list().then(render);
})();
