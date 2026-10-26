'use strict';
// Painel do Media Converter. Toda ação real passa por window.mc (preload); nada é simulado.
(function () {
  const $ = id => document.getElementById(id);
  const api = window.mc;
  const state = {
    files: [], // itens descritos pelo processo principal + estado da conversão
    groups: {}, // categoria → destino aplicado a todos
    settings: null,
    quality: 'balanced',
    maxHeight: 0,
    folder: { dir: '', items: [], groups: {} },
    batch: null, // { ids:[], done, total, current, fraction, started, timer }
    history: [],
    catalog: null
  };

  // ---------- utilidades ----------
  const fmtBytes = n => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) .toString().replace('.', ',') + ' ' + u[i]; };
  const fmtTime = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
  const fmtDur = s => s ? fmtTime(s) : '';
  const uid = () => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const basename = p => String(p).split(/[\\/]/).pop();
  const dirname = p => String(p).replace(/[\\/][^\\/]*$/, '');
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }
  const svgIcon = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };
  const ICON = {
    folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    open: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    retry: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
  };

  function toast(text, type = 'success') {
    const t = h('div', { class: 'toast ' + type, text });
    $('toastContainer').append(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; setTimeout(() => t.remove(), 300); }, type === 'error' ? 6500 : 3800);
  }

  // ---------- janela ----------
  $('btnWinMinimize').onclick = () => api.window.minimize();
  $('btnWinMaximize').onclick = () => api.window.maximize();
  $('btnWinClose').onclick = () => api.window.close();
  document.querySelectorAll('.nav-tab').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));
  function selectTab(id) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === id));
    if (id === 'tab-wheel') refreshIntegration();
  }

  // ---------- destino ----------
  function renderDest() {
    const s = state.settings;
    const folder = s.outMode === 'folder' && s.outDir;
    $('outDirPath').textContent = folder ? s.outDir : 'Ao lado do original';
    $('outDirPath').title = folder ? s.outDir : 'Cada cópia fica na mesma pasta do arquivo de origem';
    $('btnBeside').classList.toggle('hidden', !folder);
    $('btnOpenDir').classList.toggle('hidden', !folder);
  }
  $('btnChangeDir').onclick = async () => {
    const dir = await api.dialog.openFolder('Escolher a pasta das cópias convertidas');
    if (!dir) return;
    const r = await api.settings.update({ outMode: 'folder', outDir: dir });
    state.settings = r.settings; renderDest();
  };
  $('btnBeside').onclick = async () => { const r = await api.settings.update({ outMode: 'beside' }); state.settings = r.settings; renderDest(); };
  $('btnOpenDir').onclick = () => api.shell.openPath(state.settings.outDir);

  // ---------- arquivos ----------
  const dz = $('dropZone');
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (activeTab() === 'tab-files') dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave' && e.relatedTarget) return; dz.classList.remove('over'); }));
  document.addEventListener('drop', async e => {
    e.preventDefault();
    const paths = [...(e.dataTransfer.files || [])].map(f => api.files.pathOf(f)).filter(Boolean);
    if (!paths.length) return;
    if (activeTab() === 'tab-folder') { /* pasta: aceita a primeira pasta solta */ const first = paths[0]; await loadFolder(first).catch(() => addFiles(paths)); return; }
    selectTab('tab-files');
    await addFiles(paths);
  });
  const activeTab = () => (document.querySelector('.tab-content.active') || {}).id;
  $('btnPickFiles').onclick = async () => addFiles(await api.dialog.openFiles());
  $('btnPickFolderFiles').onclick = async () => {
    const dir = await api.dialog.openFolder('Adicionar todos os arquivos de uma pasta');
    if (!dir) return;
    const r = await api.files.scan(dir, false);
    if (r.truncated) toast('A pasta tem muitos arquivos; os primeiros 5000 foram adicionados.', 'error');
    addFiles(r.files);
  };
  $('btnClearFiles').onclick = () => { state.files = state.files.filter(f => f.status === 'running' || f.status === 'queued'); renderFiles(); };

  async function addFiles(paths) {
    if (!paths || !paths.length) return;
    const known = new Set(state.files.map(f => f.path.toLowerCase()));
    const fresh = paths.filter(p => !known.has(p.toLowerCase()));
    if (!fresh.length) { toast('Esses arquivos já estão na lista.'); return; }
    let described = [];
    for (let i = 0; i < fresh.length; i += 400) described = described.concat(await api.files.describe(fresh.slice(i, i + 400)));
    for (const d of described) {
      const item = { ...d, target: state.groups[d.category] && d.targets.some(t => t.id === state.groups[d.category] && t.available) ? state.groups[d.category] : d.defaultTarget, status: 'idle', progress: 0, probe: null, thumb: null };
      state.files.push(item);
      if (!state.groups[d.category]) state.groups[d.category] = item.target;
    }
    renderFiles();
    // Metadados e miniaturas sem bloquear a lista (as primeiras 60).
    for (const item of state.files.filter(f => !f.probed).slice(0, 60)) {
      item.probed = true;
      api.files.probe(item.path).then(r => { if (!r) return; item.probe = r.probe; item.thumb = r.thumb; updateRow(item); }).catch(() => {});
    }
  }

  function metaText(f) {
    const parts = [f.ext ? f.ext.toUpperCase() : 'SEM EXTENSÃO', fmtBytes(f.size)];
    const p = f.probe;
    if (p) {
      if (p.hasVideo && p.width) parts.push(`${p.width}×${p.height}`);
      if (p.duration && (f.category === 'video' || f.category === 'audio')) parts.push(fmtDur(p.duration));
      if (p.vcodec && f.category === 'video') parts.push(p.vcodec.toUpperCase());
      if (!p.hasVideo && p.acodec) parts.push(p.acodec.toUpperCase() + (p.sampleRate ? ' ' + (p.sampleRate / 1000).toString().replace('.', ',') + ' kHz' : ''));
    }
    return parts.join(' · ');
  }

  function statusChip(f) {
    switch (f.status) {
      case 'queued': return h('span', { class: 'chip', text: 'NA FILA' });
      case 'running': return h('span', { class: 'chip run', text: Math.round(f.progress * 100) + '%' });
      case 'done': return h('span', { class: 'chip ok', text: 'PRONTO' });
      case 'error': return h('span', { class: 'chip bad', text: f.cancelled ? 'CANCELADO' : 'ERRO' });
      default: return null;
    }
  }

  function targetSelect(f) {
    const sel = h('select', { class: 'target-select', 'aria-label': 'Formato de saída de ' + f.name, disabled: f.status === 'running' || f.status === 'queued' });
    if (!f.targets.length) sel.append(h('option', { value: '', text: 'Sem conversão disponível' }));
    for (const t of f.targets) sel.append(h('option', { value: t.id, disabled: !t.available, text: t.label + (t.available ? '' : ' — ' + t.reason) }));
    sel.value = f.target || '';
    sel.onchange = () => { f.target = sel.value; if (f.status !== 'idle') { f.status = 'idle'; f.error = ''; f.output = ''; } renderGroups(); updateRow(f); updateSummary(); };
    return sel;
  }

  function rowFor(f) {
    const thumb = h('div', { class: 'file-thumb' }, f.thumb ? h('img', { src: f.thumb, alt: '' }) : h('span', { class: 'glyph', text: (f.ext || '?').toUpperCase().slice(0, 5) }), h('span', { class: 'bar', style: `width:${f.status === 'running' ? Math.round(f.progress * 100) : f.status === 'done' ? 100 : 0}%` }));
    thumb.draggable = true;
    thumb.title = 'Arraste o arquivo; com Shift, abra a roda';
    thumb.ondragstart = e => { e.preventDefault(); api.files.drag(f.output || f.path); };
    const meta = h('div', { class: 'file-meta' }, h('span', { class: 'cat', text: f.categoryLabel }), ' · ' + metaText(f));
    if (f.status === 'error' && f.error) meta.append(' · ', h('span', { class: 'err', text: f.error }));
    if (f.status === 'done' && f.output) meta.append(' · → ' + basename(f.output));
    const actions = h('div', { class: 'row-actions' }, statusChip(f));
    if (!['running','queued'].includes(f.status)) actions.append(h('button', { class: 'mini-btn studio-trigger', title: 'Preparar: recorte, tamanho e opções', onclick: () => window.MCStudio.open([f.path]), text: 'Ajustar' }));
    if (f.status === 'done' && f.output) actions.append(h('button', { class: 'mini-btn', title: 'Mostrar na pasta', onclick: () => api.shell.showItem(f.output) }, svgIcon(ICON.folder)));
    if (f.status !== 'running' && f.status !== 'queued') actions.append(h('button', { class: 'mini-btn', title: 'Remover da lista', onclick: () => { state.files = state.files.filter(x => x !== f); renderFiles(); } }, svgIcon(ICON.close)));
    if (f.status === 'queued' || f.status === 'running') actions.append(h('button', { class: 'mini-btn', title: 'Cancelar este arquivo', onclick: () => api.convert.cancel(f.jobId) }, svgIcon(ICON.close)));
    const row = h('div', { class: 'file-row' + (f.status === 'done' ? ' done' : f.status === 'error' ? ' error' : ''), 'data-path': f.path },
      thumb, h('div', { class: 'file-info' }, h('div', { class: 'file-name', title: f.path, text: f.name }), meta), targetSelect(f), actions);
    return row;
  }

  function updateRow(f) {
    const old = [...$('fileList').children].find(r => r.dataset.path === f.path);
    if (old) old.replaceWith(rowFor(f));
  }

  function renderFiles() {
    const list = $('fileList');
    list.textContent = '';
    for (const f of state.files) list.append(rowFor(f));
    dz.classList.toggle('compact', state.files.length > 0);
    $('btnClearFiles').classList.toggle('hidden', !state.files.length);
    renderGroups();
    updateSummary();
  }

  function renderGroups() {
    const cats = [...new Set(state.files.map(f => f.category))];
    $('groupBlock').classList.toggle('hidden', !cats.length);
    $('optionBlock').classList.toggle('hidden', !cats.length);
    $('resOption').classList.toggle('hidden', !cats.some(c => c === 'video' || c === 'image'));
    const box = $('groupList');
    box.textContent = '';
    for (const cat of cats) {
      const items = state.files.filter(f => f.category === cat);
      // Destinos válidos para todos os arquivos desse tipo.
      let common = items[0].targets.map(t => t.id);
      for (const it of items.slice(1)) common = common.filter(id => it.targets.some(t => t.id === id));
      const info = items[0].targets.filter(t => common.includes(t.id));
      const sel = h('select', { class: 'target-select', 'aria-label': 'Formato para ' + items[0].categoryLabel });
      for (const t of info) sel.append(h('option', { value: t.id, disabled: !t.available, text: `${t.label} — ${t.available ? t.desc : t.reason}` }));
      const chosen = items.every(f => f.target === items[0].target) ? items[0].target : '';
      if (!chosen) sel.prepend(h('option', { value: '', text: 'Formatos diferentes por arquivo' }));
      sel.value = chosen;
      sel.onchange = () => {
        if (!sel.value) return;
        state.groups[cat] = sel.value;
        for (const f of items) if (f.status !== 'running' && f.status !== 'queued' && f.targets.some(t => t.id === sel.value && t.available)) { f.target = sel.value; if (f.status !== 'idle') { f.status = 'idle'; f.error = ''; } }
        renderFiles();
      };
      const pluralLabel = state.catalog && state.catalog.categories[cat] ? state.catalog.categories[cat].plural : items[0].categoryLabel;
      box.append(h('div', { class: 'group-row' }, h('div', { class: 'group-label', text: `${items.length} ${items.length === 1 ? items[0].categoryLabel : pluralLabel}` }, h('small', { text: 'aplicar a todos deste tipo' })), sel));
    }
  }

  function pendingFiles() { return state.files.filter(f => f.target && (f.status === 'idle' || f.status === 'error')); }

  function updateSummary() {
    const total = state.files.length;
    const ready = pendingFiles();
    const size = state.files.reduce((a, f) => a + (f.size || 0), 0);
    $('filesSummary').textContent = total ? `${total} ${total === 1 ? 'arquivo' : 'arquivos'} · ${fmtBytes(size)}` + (ready.length !== total ? ` · ${ready.length} para converter` : '') : 'Nenhum arquivo adicionado.';
    $('btnConvert').disabled = !ready.length;
    $('btnConvertLabel').textContent = ready.length > 1 ? `Converter ${ready.length} arquivos` : 'Converter';
  }

  // Qualidade e resolução
  function renderQuality() { document.querySelectorAll('#qualitySeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === state.quality))); $('maxHeight').value = String(state.maxHeight); }
  document.querySelectorAll('#qualitySeg button').forEach(b => b.onclick = () => { state.quality = b.dataset.q; renderQuality(); });
  $('maxHeight').onchange = () => { state.maxHeight = Number($('maxHeight').value) || 0; };

  $('btnConvert').onclick = async () => {
    const list = pendingFiles();
    if (!list.length) return;
    const jobs = list.map(f => { f.jobId = uid(); f.status = 'queued'; f.progress = 0; f.error = ''; f.cancelled = false; return { id: f.jobId, inputs: [f.path], targetId: f.target }; });
    renderFiles();
    beginBatch(jobs.map(j => j.id));
    try { await api.convert.start(jobs, { quality: state.quality, maxHeight: state.maxHeight }); }
    catch (e) { toast(e.message, 'error'); for (const f of list) f.status = 'idle'; renderFiles(); endBatch(); }
  };

  // ---------- pasta inteira ----------
  $('btnPickFolder').onclick = async () => { const dir = await api.dialog.openFolder('Escolher a pasta para converter'); if (dir) loadFolder(dir); };
  $('folderRecursive').onchange = () => { if (state.folder.dir) loadFolder(state.folder.dir); };
  async function loadFolder(dir) {
    const r = await api.files.scan(dir, $('folderRecursive').checked);
    state.folder.dir = dir;
    $('folderPath').value = dir;
    let items = [];
    for (let i = 0; i < r.files.length; i += 400) items = items.concat(await api.files.describe(r.files.slice(i, i + 400)));
    state.folder.items = items;
    state.folder.groups = {};
    if (r.truncated) toast('A pasta tem mais de 5000 arquivos; só os primeiros entram.', 'error');
    renderFolder();
  }
  function renderFolder() {
    const items = state.folder.items;
    const cats = [...new Set(items.map(f => f.category))];
    $('folderGroups').classList.toggle('hidden', !cats.length);
    const box = $('folderGroupList');
    box.textContent = '';
    for (const cat of cats) {
      const group = items.filter(f => f.category === cat);
      const ids = group[0].targets.map(t => t.id).filter(id => group.every(g => g.targets.some(t => t.id === id)));
      const sel = h('select', { class: 'target-select' });
      sel.append(h('option', { value: '', text: 'Não converter' }));
      for (const t of group[0].targets.filter(t => ids.includes(t.id))) sel.append(h('option', { value: t.id, disabled: !t.available, text: `${t.label} — ${t.available ? t.desc : t.reason}` }));
      if (!(cat in state.folder.groups)) state.folder.groups[cat] = cat === 'other' || cat === 'archive' ? '' : (group[0].defaultTarget && ids.includes(group[0].defaultTarget) ? group[0].defaultTarget : '');
      sel.value = state.folder.groups[cat];
      sel.onchange = () => { state.folder.groups[cat] = sel.value; folderSummary(); };
      const size = group.reduce((a, f) => a + f.size, 0);
      const plural = state.catalog && state.catalog.categories[cat] ? state.catalog.categories[cat].plural : group[0].categoryLabel;
      box.append(h('div', { class: 'group-row' }, h('div', { class: 'group-label', text: `${group.length} ${group.length === 1 ? group[0].categoryLabel : plural}` }, h('small', { text: fmtBytes(size) })), sel));
    }
    folderSummary();
  }
  function folderJobs() {
    return state.folder.items.filter(f => state.folder.groups[f.category]).map(f => ({ id: uid(), inputs: [f.path], targetId: state.folder.groups[f.category], name: f.name }));
  }
  function folderSummary() {
    const n = folderJobs().length;
    $('folderSummary').textContent = state.folder.dir ? `${state.folder.items.length} arquivos na pasta · ${n} para converter` : 'Nenhuma pasta escolhida.';
    $('btnConvertFolder').disabled = !n;
    $('btnConvertFolderLabel').textContent = n ? `Converter ${n} ${n === 1 ? 'arquivo' : 'arquivos'}` : 'Converter pasta';
  }
  const folderJobNames = new Map();
  $('btnConvertFolder').onclick = async () => {
    const jobs = folderJobs();
    if (!jobs.length) return;
    for (const j of jobs) folderJobNames.set(j.id, j.name);
    beginBatch(jobs.map(j => j.id));
    try { await api.convert.start(jobs.map(({ id, inputs, targetId }) => ({ id, inputs, targetId })), { quality: state.quality, maxHeight: state.maxHeight }); }
    catch (e) { toast(e.message, 'error'); endBatch(); }
  };

  // ---------- progresso ----------
  function beginBatch(ids) {
    if (state.batch) { state.batch.ids.push(...ids); state.batch.total += ids.length; renderProgress(); return; }
    state.batch = { ids: ids.slice(), done: 0, failed: 0, total: ids.length, current: null, fraction: 0, started: Date.now(), timer: setInterval(renderProgress, 1000) };
    $('progressCard').classList.add('active');
    renderProgress();
  }
  function endBatch() {
    const b = state.batch;
    if (!b) return;
    clearInterval(b.timer);
    state.batch = null;
    setTimeout(() => { if (!state.batch) $('progressCard').classList.remove('active'); }, 1600);
  }
  function nameForJob(id) { const f = state.files.find(x => x.jobId === id); return f ? f.name : folderJobNames.get(id) || ''; }
  function renderProgress() {
    const b = state.batch;
    if (!b) return;
    const overall = b.total ? (b.done + b.failed + b.fraction) / b.total : 0;
    $('progressPercent').textContent = Math.floor(overall * 100) + '%';
    $('progressBarFill').style.width = (overall * 100).toFixed(1) + '%';
    const idx = Math.min(b.done + b.failed + 1, b.total);
    $('progressTitle').textContent = b.current ? `Convertendo ${idx} de ${b.total} · ${nameForJob(b.current)}` : `Na fila: ${b.total}`;
    $('progressStatus').textContent = `${b.done} pronto${b.done === 1 ? '' : 's'}${b.failed ? ` · ${b.failed} com erro` : ''}`;
    $('progressElapsed').textContent = fmtTime((Date.now() - b.started) / 1000);
  }
  $('btnCancel').onclick = () => { if (state.batch) for (const id of state.batch.ids) api.convert.cancel(id); };

  api.convert.onStart(({ id }) => {
    const f = state.files.find(x => x.jobId === id);
    if (f) { f.status = 'running'; f.progress = 0; updateRow(f); }
    if (state.batch) { state.batch.current = id; state.batch.fraction = 0; renderProgress(); }
  });
  api.convert.onProgress(({ id, fraction }) => {
    const f = state.files.find(x => x.jobId === id);
    if (f) {
      f.progress = fraction;
      const row = [...$('fileList').children].find(r => r.dataset.path === f.path);
      if (row) { const bar = row.querySelector('.bar'); if (bar) bar.style.width = Math.round(fraction * 100) + '%'; const chip = row.querySelector('.chip'); if (chip) chip.textContent = Math.round(fraction * 100) + '%'; }
    }
    if (state.batch && state.batch.current === id) { state.batch.fraction = fraction; renderProgress(); }
  });
  api.convert.onDone(({ id, result }) => {
    const f = state.files.find(x => x.jobId === id);
    const source = f ? f.path : null;
    if (f) { f.status = 'done'; f.output = result.output; f.progress = 1; updateRow(f); updateSummary(); }
    if (state.batch) { state.batch.done++; state.batch.fraction = 0; renderProgress(); }

    folderJobNames.delete(id);
    finishIfIdle();
  });
  api.convert.onError(({ id, message, cancelled }) => {
    const f = state.files.find(x => x.jobId === id);
    if (f) { f.status = 'error'; f.error = cancelled ? 'Cancelado' : message; f.cancelled = cancelled; updateRow(f); updateSummary(); }
    if (state.batch) { state.batch.failed++; state.batch.fraction = 0; renderProgress(); }
    if (!cancelled) toast(`${nameForJob(id) || 'Arquivo'}: ${message}`, 'error');
    folderJobNames.delete(id);
    finishIfIdle();
  });
  function finishIfIdle() {
    const b = state.batch;
    if (!b || b.done + b.failed < b.total) return;
    const msg = b.failed ? `${b.done} convertido${b.done === 1 ? '' : 's'}, ${b.failed} não.` : b.done === 1 ? 'Conversão concluída. O original foi mantido.' : `${b.done} arquivos convertidos. Os originais foram mantidos.`;
    toast(msg, b.failed && !b.done ? 'error' : 'success');
    $('progressPercent').textContent = '100%';
    $('progressBarFill').style.width = '100%';
    $('progressTitle').textContent = 'Concluído';
    endBatch();
  }

  // ---------- histórico ----------
  function loadHistory() { try { state.history = JSON.parse(localStorage.getItem('mc.history') || '[]').slice(0, 200); } catch (_) { state.history = []; } }
  function saveHistory() { try { localStorage.setItem('mc.history', JSON.stringify(state.history.slice(0, 200))); } catch (_) {} }
  function pushHistory(entry) { state.history.unshift(entry); saveHistory(); renderHistory(); }
  function renderHistory() {
    const list = $('historyList');
    list.textContent = '';
    $('historyCount').textContent = String(state.history.length);
    if (!state.history.length) {
      const empty = h('div', { class: 'history-empty' }, svgIcon('M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z'), h('div', { text: 'As cópias convertidas aparecem aqui.' }));
      list.append(empty);
      return;
    }
    for (const it of state.history) {
      const ext = it.kind === 'folder' ? 'PASTA' : (basename(it.output).split('.').pop() || '').toUpperCase().slice(0, 5);
      const meta = [it.label, it.bytes ? fmtBytes(it.bytes) : '', it.ms ? (it.ms / 1000).toFixed(1).replace('.', ',') + ' s' : ''].filter(Boolean).join(' · ');
      list.append(h('div', { class: 'history-item' },
        h('div', { class: 'history-item-thumb badge', text: ext }),
        h('div', { class: 'history-item-info' }, h('div', { class: 'history-item-title', title: it.output, text: basename(it.output) }), h('div', { class: 'history-item-meta', text: meta + (it.from ? ' · de ' + basename(it.from) : '') })),
        h('div', { class: 'history-item-actions' },
          h('button', { class: 'btn-history-action', title: 'Abrir arquivo', 'aria-label':'Abrir arquivo', onclick: async () => { if (!(await api.shell.openPath(it.output))) toast('Não foi possível abrir.', 'error'); } }, svgIcon(ICON.open)),
          h('button', { class: 'btn-history-action', title: 'Mostrar na pasta', 'aria-label':'Mostrar na pasta', onclick: async () => { if (!(await api.shell.showItem(it.output))) toast('O arquivo não está mais nesse local.', 'error'); } }, svgIcon(ICON.folder)))));
    }
  }
  $('btnClearHistory').onclick = async () => { await api.history.clear(); state.history = []; saveHistory(); renderHistory(); };

  // ---------- roda rápida (aba) ----------
  function renderWheelPreview() {
    const cat = $('sliceCategory').value || 'video';
    const info = state.catalog.categories[cat];
    const ids = (state.settings.wheel[cat] && state.settings.wheel[cat].length ? state.settings.wheel[cat] : info.wheelDefault);
    const items = ids.map(id => info.targets.find(t => t.id === id)).filter(t => t && !t.tool);
    const slots = items.length;
    const arranged = window.MCWheel.arrange(items, slots);
    const ctl = window.MCWheel.build($('wheelPreview'), arranged, { centerTitle: info.label, centerSub: 'prévia', numbers: true, onPick: i => { if (!arranged[i].placeholder) toast(`Destino: ${arranged[i].label}. Use Abrir a roda agora para converter.`); } });
    return ctl;
  }
  function renderSlices() {
    const cat = $('sliceCategory').value;
    const info = state.catalog.categories[cat];
    const current = (state.settings.wheel[cat] && state.settings.wheel[cat].length ? state.settings.wheel[cat] : info.wheelDefault).slice();
    const grid = $('sliceGrid');
    grid.textContent = '';
    for (const t of info.targets.filter(t => !t.tool)) {
      const on = current.includes(t.id);
      const box = h('input', { type: 'checkbox', checked: on });
      const label = h('label', { class: 'slice-opt' + (on ? ' on' : '') }, box, h('span', { text: t.label }), h('b', { text: on ? String(current.indexOf(t.id) + 1) : '' }));
      box.onchange = async () => {
        let next = current.filter(id => id !== t.id);
        if (box.checked) next.push(t.id);
        if (!next.length) { box.checked = true; toast('Mantenha pelo menos um formato.', 'error'); return; }
        const wheel = { ...state.settings.wheel, [cat]: next };
        const r = await api.settings.update({ wheel });
        state.settings = r.settings;
        renderSlices(); renderWheelPreview();
      };
      grid.append(label);
    }
  }
  $('sliceCategory').onchange = () => { renderSlices(); renderWheelPreview(); };
  $('btnTestWheel').onclick = () => api.wheel.test();

  async function refreshIntegration() {
    let st;
    try { st = await api.integration.status(); } catch (e) { return; }
    const set = (sel, on) => { const b = document.querySelector(sel); if (b) b.setAttribute('aria-checked', String(Boolean(on))); };
    set('[data-integration="contextMenu"]', st.contextMenu.enabled);
    set('[data-integration="sendTo"]', st.sendTo.enabled);
    set('[data-integration="openAtLogin"]', st.openAtLogin);
    set('[data-setting="keepInTray"]', state.settings.keepInTray);
    const label = (id, on, txtOn, txtOff) => { const n = $(id); n.textContent = on ? txtOn : txtOff; n.className = 'state' + (on ? '' : ' off'); };
    label('stContext', st.contextMenu.enabled, 'Ativo no menu do botão direito', 'Desativado');
    label('stSendTo', st.sendTo.enabled, 'Ativo em Enviar para', 'Desativado');
    label('stLogin', st.openAtLogin, 'Abre com o Windows, na bandeja', 'Desativado');
    label('stTray', state.settings.keepInTray, 'Ativado', 'Desativado: fechar encerra o app');
    const hk = $('stHotkey');
    if (st.hotkey.key === 'off') { hk.textContent = 'Desativado'; hk.className = 'state off'; }
    else if (st.hotkey.registered) { hk.textContent = `${st.hotkey.key} ativo`; hk.className = 'state'; }
    else { hk.textContent = `${st.hotkey.key} está em uso por outro programa. Escolha outro.`; hk.className = 'state bad'; }
    $('hotkeySelect').value = st.hotkey.key;
  }
  document.querySelectorAll('[data-integration]').forEach(b => b.addEventListener('click', async () => {
    const on = b.getAttribute('aria-checked') !== 'true';
    b.disabled = true;
    try { await api.integration.set(b.dataset.integration, on); state.settings = await api.settings.get(); }
    catch (e) { toast(e.message, 'error'); }
    finally { b.disabled = false; refreshIntegration(); }
  }));
  document.querySelector('[data-setting="keepInTray"]').addEventListener('click', async () => {
    const r = await api.settings.update({ keepInTray: !state.settings.keepInTray });
    state.settings = r.settings; refreshIntegration();
  });
  $('hotkeySelect').onchange = async () => {
    const r = await api.settings.update({ hotkey: $('hotkeySelect').value });
    state.settings = r.settings;
    refreshIntegration();
  };

  // ---------- configurações ----------
  $('btnOpenSettings').onclick = async () => {
    const s = state.settings;
    $('themeSelect').value = s.theme || 'dark';
    $('setQuality').value = s.quality; $('setMaxHeight').value = String(s.maxHeight); $('setGpu').checked = s.useGpu;
    $('modalSettings').classList.add('active');
    renderEngines(await api.engines());
  };
  $('btnCloseSettings').onclick = () => $('modalSettings').classList.remove('active');
  $('modalSettings').addEventListener('click', e => { if (e.target === $('modalSettings')) $('modalSettings').classList.remove('active'); });
  $('btnSaveSettings').onclick = async () => {
    const r = await api.settings.update({ theme: $('themeSelect').value, quality: $('setQuality').value, maxHeight: Number($('setMaxHeight').value), useGpu: $('setGpu').checked });
    state.settings = r.settings;
    document.body.dataset.theme = r.settings.theme;
    state.quality = r.settings.quality; state.maxHeight = r.settings.maxHeight; renderQuality();
    $('modalSettings').classList.remove('active');
    toast('Configurações salvas.');
  };
  function renderEngines(e) {
    const grid = $('engineGrid');
    grid.textContent = '';
    const row = (k, ok, text) => grid.append(h('span', { text: k }), h('span', { class: ok ? 'ok' : 'no', text }));
    row('FFmpeg (vídeo, áudio, imagem, legenda)', Boolean(e.ffmpeg), e.ffmpeg ? 'v' + e.ffmpeg : 'Ausente');
    row('GPU NVIDIA NVENC', e.gpu && e.gpu.h264_nvenc, e.gpu && e.gpu.h264_nvenc ? 'Disponível' : 'Não detectada · usa o processador');
    for (const [k, name] of [['word', 'Microsoft Word'], ['excel', 'Microsoft Excel'], ['powerpoint', 'Microsoft PowerPoint']]) row(name, e.office && e.office[k], e.office && e.office[k] ? 'Instalado' : 'Não instalado');
    row('PDF do Windows (páginas em imagem)', e.pdf, e.pdf ? 'Disponível' : 'Indisponível');
    row('Leitura da seleção do Explorador', e.explorer, e.explorer ? 'Pronta' : 'Indisponível');
    const dot = $('engineDot');
    dot.className = 'brand-status-dot' + (e.ffmpeg ? '' : ' off');
    dot.title = e.ffmpeg ? 'Motores prontos' : 'FFmpeg ausente';
  }

  api.onAddFiles(list => { selectTab('tab-files'); addFiles(list); });
  api.onToast(t => toast(t.text, t.type || 'success'));
  document.addEventListener('paste', async e => {
    if (activeTab() !== 'tab-files' || /input|textarea/i.test((e.target || {}).tagName || '')) return;
    const list = await api.files.fromClipboard();
    if (list.length) addFiles(list);
  });

  $('gestureSelect').onchange = async () => { const r = await api.settings.update({ gesture: $('gestureSelect').value }); state.settings = r.settings; $('gestureState').textContent = r.settings.gesture === 'off' ? 'Desativado' : 'Gesto configurado: ' + r.settings.gesture; };
  api.history.onChanged(entries => { state.history = entries; saveHistory(); renderHistory(); });
  document.addEventListener('keydown', async e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); addFiles(await api.dialog.openFiles()); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('btnConvert').disabled && !document.querySelector('dialog[open]')) $('btnConvert').click();
  });
  // ---------- início ----------
  (async function init() {
    const [info, settings, catalog] = await Promise.all([api.info(), api.settings.get(), api.catalog()]);
    state.settings = settings; state.catalog = catalog;
    if(info.platform!=='win32'){
      document.querySelectorAll('[data-integration]').forEach(button=>{button.disabled=true;button.title='Integração do Windows';button.closest('.integration').hidden=true;});
      $('gestureSelect').disabled=true;
    }
    document.body.dataset.theme = settings.theme;
    $('gestureSelect').value = settings.gesture;
    api.gesture().then(g => $('gestureState').textContent = g.platform === 'win32' ? (g.ready ? 'Monitor de gesto ativo' : 'Iniciando monitor de gesto…') : 'Use o atalho global ou arraste para o painel nesta plataforma.');
    state.quality = settings.quality; state.maxHeight = settings.maxHeight;
    $('appVersionTag').textContent = '· v' + info.version;
    document.title = 'Media Converter ' + info.version;
    $('aboutLine').textContent = `Media Converter ${info.version} · por Alex Ascencio · preferências em ${info.userData}`;
    for (const k of info.hotkeys) $('hotkeySelect').append(h('option', { value: k, text: k === 'off' ? 'Desativado' : k }));
    for (const [id, c] of Object.entries(catalog.categories)) if (id !== 'other' && id !== 'archive') $('sliceCategory').append(h('option', { value: id, text: c.plural }));
    renderDest(); renderQuality(); state.history = await api.history.list(); renderHistory(); renderFiles(); renderSlices(); renderWheelPreview();
    api.engines().then(renderEngines).catch(() => {});
  })();
})();

