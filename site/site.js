'use strict';
// Navegação suave respeitando a preferência de movimento.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const hash = link.getAttribute('href');
  if (hash.length < 2) return;
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!target) return;
  event.preventDefault();
  history.pushState(null, '', hash);
  target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
});

// Demonstração da roda. Ilustrativa: nenhum arquivo é lido nem convertido no navegador.
(() => {
  const host = document.getElementById('demoWheel');
  const status = document.getElementById('demoStatus');
  const shell = document.querySelector('.wheel-demo');
  if (!host || !window.MCWheel) return;
  const T = (badge, label, desc) => ({ badge, label, desc, available: true });
  const FILES = {
    video: { name: 'entrevista.mov', ext: 'MOV', sub: '4K · 02:14', targets: [T('MP4', 'MP4 · H.264', 'Abre em qualquer lugar'), T('HEVC', 'MP4 · H.265', 'Metade do tamanho'), T('PRORES', 'MOV · ProRes 422 HQ', 'Edição profissional'), T('WEBM', 'WebM · VP9', 'Para sites'), T('GIF', 'GIF animado', 'Paleta otimizada'), T('MP3', 'Áudio MP3', 'Extrai o áudio'), T('WAV', 'Áudio WAV 24-bit', 'Para edição'), T('PNG', 'Quadro em PNG', 'Captura um quadro')] },
    audio: { name: 'trilha.wav', ext: 'WAV', sub: '48 kHz · 03:40', targets: [T('MP3', 'Áudio MP3', 'Até 320 kbps'), T('FLAC', 'Áudio FLAC', 'Sem perdas'), T('M4A', 'Áudio M4A', 'Apple e celulares'), T('OGG', 'Áudio OGG', 'Jogos e web'), T('OPUS', 'Áudio Opus', 'Muito compacto'), T('AIFF', 'Áudio AIFF', 'macOS e Logic')] },
    image: { name: 'logo.png', ext: 'PNG', sub: '2048 × 2048', targets: [T('JPG', 'Imagem JPG', 'Fotos leves'), T('WEBP', 'Imagem WebP', 'Mantém transparência'), T('AVIF', 'Imagem AVIF', 'O menor arquivo'), T('PDF', 'Documento PDF', 'Página A4'), T('ICO', 'Ícone ICO', 'Até 256 px'), T('TIFF', 'Imagem TIFF', 'Sem perdas')] },
    document: { name: 'proposta-criativa.docx', ext: 'DOCX', sub: '1 página', targets: [T('PDF', 'Documento PDF', 'Pelo Word instalado'), T('ODT', 'OpenDocument', 'LibreOffice'), T('TXT', 'Texto TXT', 'Só o texto'), T('RTF', 'Rich Text', 'Formatação básica'), T('ZIP', 'Compactar em ZIP', 'Para enviar')] }
  };
  let ctl = null, kind = 'video', timer = null;
  const say = (strong, rest) => { status.textContent = ''; const b = document.createElement('b'); b.textContent = strong; status.append(b, ' ' + rest); };
  function show(k) {
    kind = k; clearInterval(timer);
    const f = FILES[k];
    ctl = window.MCWheel.build(host, f.targets, {
      centerTitle: f.ext, centerSub: f.sub,
      onHover: i => { if (i >= 0) say(f.targets[i].label, '· ' + f.targets[i].desc); },
      onPick: i => pick(i)
    });
    say(f.name, '· passe o mouse e escolha uma fatia');
  }
  function pick(i) {
    const f = FILES[kind], t = f.targets[i];
    ctl.setActive(i); ctl.setState('busy');
    let p = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      p = Math.min(1, p + 0.045 + Math.random() * 0.03);
      ctl.setProgress(p); ctl.setCenter(Math.floor(p * 100) + '%', t.badge);
      if (p >= 1) {
        clearInterval(timer); ctl.setState('done');
        const out = f.name.replace(/\.[^.]+$/, '') + '.' + t.badge.toLowerCase().replace('prores', 'mov').replace('hevc', 'mp4');
        say('Exemplo concluído', '· no app real, ' + out + ' apareceria ao lado do original');
        timer = setTimeout(() => show(kind), 3200);
      }
    }, 90);
  }
  document.querySelectorAll('[data-demo-file]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-demo-file]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    show(b.dataset.demoFile);
  }));
  // Inclinação sutil acompanhando o cursor, como na demonstração do Media Downloader.
  if (shell && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shell.addEventListener('pointermove', e => {
      const r = shell.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      shell.style.setProperty('--demo-ry', (x * 5).toFixed(2) + 'deg');
      shell.style.setProperty('--demo-rx', (-y * 4).toFixed(2) + 'deg');
      shell.style.setProperty('--demo-light', Math.round((x + .5) * 100) + '%');
    });
    shell.addEventListener('pointerleave', () => { shell.style.setProperty('--demo-rx', '0deg'); shell.style.setProperty('--demo-ry', '0deg'); });
  }
  show('document');
})();
