'use strict';
// Roda radial em SVG, usada pela roda rápida e pela prévia do painel.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const C = 200, R_OUT = 186, R_IN = 80, R_LABEL = 136, GAP = 1.6;

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }
  const rad = d => (d - 90) * Math.PI / 180;
  const pt = (r, d) => [C + r * Math.cos(rad(d)), C + r * Math.sin(rad(d))];

  function sector(a0, a1, r0, r1) {
    const corner = Math.min(4, (a1 - a0) / 8), inset = 8;
    const p = (r, a) => pt(r, a).join(' ');
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${p(r1,a0+corner)}A${r1} ${r1} 0 ${large} 1 ${p(r1,a1-corner)}Q${p(r1,a1)} ${p(r1-inset,a1)}L${p(r0+inset,a1)}Q${p(r0,a1)} ${p(r0,a1-corner)}A${r0} ${r0} 0 ${large} 0 ${p(r0,a0+corner)}Q${p(r0,a0)} ${p(r0+inset,a0)}L${p(r1-inset,a0)}Q${p(r1,a0)} ${p(r1,a0+corner)}Z`;
  }

  // items: [{badge, label, available}] · opts: {onPick(i), onHover(i), centerTitle, centerSub, interactive}
  function build(container, items, opts = {}) {
    container.textContent = '';
    const svg = el('svg', { viewBox: '0 0 400 400', class: 'mc-wheel', role: 'menu' }, container);
    const defs = el('defs', {}, svg);
    const g1 = el('radialGradient', { id: 'mcRing', cx: '50%', cy: '50%', r: '50%' }, defs);
    el('stop', { offset: '40%', 'stop-color': '#121a16', 'stop-opacity': '.96' }, g1);
    el('stop', { offset: '100%', 'stop-color': '#0b100e', 'stop-opacity': '.97' }, g1);
    const g2 = el('linearGradient', { id: 'mcHot', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#66f0a8' }, g2);
    el('stop', { offset: '100%', 'stop-color': '#1fc172' }, g2);
    const glow = el('filter', { id: 'mcGlow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feGaussianBlur', { stdDeviation: '9' }, glow);

    el('circle', { cx: C, cy: C, r: R_OUT + 8, fill: 'rgba(62,224,143,.10)', filter: 'url(#mcGlow)', class: 'mc-halo' }, svg);
    el('circle', { cx: C, cy: C, r: R_OUT + 1, fill: 'url(#mcRing)', stroke: 'rgba(255,255,255,.10)', 'stroke-width': '1' }, svg);
    const ring = el('g', { class: 'mc-slices' }, svg);
    const n = Math.max(items.length, 1);
    const step = 360 / n; svg.style.setProperty('--wheel-font',Math.min(16,Math.max(6,250/n))+'px');
    if (n > 12) svg.classList.add('crowded');
    const slices = items.map((it, i) => {
      const mid = i * step;
      const a0 = mid - step / 2 + GAP / 2, a1 = mid + step / 2 - GAP / 2;
      const g = el('g', { class: 'mc-slice' + (it.available === false ? ' disabled' : '') + (it.placeholder ? ' placeholder' : ''), role: 'menuitem', tabindex: '-1', 'aria-label': it.label, 'aria-disabled': String(it.available === false), 'data-i': i }, ring);
      g.style.setProperty('--d', `${i * 35}ms`); // CSSOM: permitido sob CSP sem 'unsafe-inline'
      el('path', { d: n === 1 ? `M${C} ${C - R_OUT}A${R_OUT} ${R_OUT} 0 1 1 ${C - 0.01} ${C - R_OUT}L${C - 0.01} ${C - R_IN}A${R_IN} ${R_IN} 0 1 0 ${C} ${C - R_IN}Z` : sector(a0, a1, R_IN + 4, R_OUT - 4), class: 'mc-slice-bg' }, g);
      const [lx, ly] = n === 1 ? [C, C - R_LABEL] : pt(R_LABEL, mid);
      el('text', { x: lx, y: ly - 3, class: 'mc-badge', 'text-anchor': 'middle' }, g).textContent = it.badge;
      const sub = el('text', { x: lx, y: ly + 13, class: 'mc-sub', 'text-anchor': 'middle' }, g);
      sub.textContent = subLabel(it);
      if (opts.numbers !== false && !it.placeholder) el('text', { x: lx, y: ly - 22, class: 'mc-key', 'text-anchor': 'middle' }, g).textContent = String(it.shortcut || i + 1);
      return g;
    });
    // Centro
    const center = el('g', { class: 'mc-center' }, svg);
    el('circle', { cx: C, cy: C, r: R_IN - 4, class: 'mc-center-bg' }, center);
    const track = el('circle', { cx: C, cy: C, r: R_IN - 10, class: 'mc-track' }, center);
    const prog = el('circle', { cx: C, cy: C, r: R_IN - 10, class: 'mc-prog', transform: `rotate(-90 ${C} ${C})` }, center);
    const circ = 2 * Math.PI * (R_IN - 10);
    prog.setAttribute('stroke-dasharray', String(circ));
    prog.setAttribute('stroke-dashoffset', String(circ));
    const t1 = el('text', { x: C, y: C - 4, class: 'mc-c1', 'text-anchor': 'middle' }, center);
    const t2 = el('text', { x: C, y: C + 15, class: 'mc-c2', 'text-anchor': 'middle' }, center);
    const check = el('path', { d: `M${C - 17} ${C + 1}l11 11 23-24`, class: 'mc-check' }, center);
    t1.textContent = opts.centerTitle || '';
    t2.textContent = opts.centerSub || '';
    track.style.opacity = '0';

    let active = -1;
    let locked = false; // depois da escolha, a fatia fica destacada até o fim
    const setActive = (i, force) => {
      if (i === active || (locked && !force)) return;
      if (active >= 0 && slices[active]) slices[active].classList.remove('hot');
      active = i;
      if (i >= 0 && slices[i]) slices[i].classList.add('hot');
      if (opts.onHover) opts.onHover(i);
    };
    let sliceAt = () => -1;
    if (opts.interactive !== false) {
      // Fatia sob o ponteiro, pelo ângulo: funciona com mouse, caneta e toque (sem hover).
      sliceAt = e => {
        const r = svg.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * 400 - C, y = (e.clientY - r.top) / r.height * 400 - C;
        const dist = Math.hypot(x, y);
        if (dist < R_IN * 0.55 || dist > R_OUT + 30) return -1;
        const ang = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360 + step / 2) % 360;
        return Math.min(n - 1, Math.floor(ang / step));
      };
      svg.addEventListener('pointermove', e => setActive(sliceAt(e)));
      svg.addEventListener('pointerleave', () => setActive(-1));
      svg.addEventListener('click', e => { const i = sliceAt(e); if (i < 0 || locked) return; setActive(i); if (opts.onPick) opts.onPick(i); });
    }
    requestAnimationFrame(() => svg.classList.add('in'));
    return {
      svg,
      hit: sliceAt,
      setActive,
      get active() { return active; },
      setCenter(a, b) { t1.textContent = a || ''; t2.textContent = b || ''; },
      setProgress(f) { track.style.opacity = '1'; prog.setAttribute('stroke-dashoffset', String(circ * (1 - Math.max(0, Math.min(1, f))))); },
      setState(s) { svg.classList.remove('busy', 'done', 'error'); if (s) svg.classList.add(s); locked = Boolean(s); }
    };
  }

  // Legenda curta da fatia sem repetir o selo: "MP4 · H.264" → "H.264"; "Áudio MP3" → "Compatibilidade ampla".
  function subLabel(it) {
    const label = String(it.label || '');
    let s = label.includes('·') ? label.split('·').pop().trim().replace(/\s*\(.*\)$/, '') : short(label);
    if (!s || s.toUpperCase() === String(it.badge).toUpperCase()) s = String(it.desc || '').split('·')[0].trim();
    return s.length > 17 ? s.slice(0, 16) + '…' : s;
  }

  function short(s) {
    const x = String(s || '').replace(/^(Áudio|Imagem|Documento|Legenda)\s+/, '').replace(/\s*·.*$/, '').replace(/\s*\(.*\)$/, '');
    return x.length > 16 ? x.slice(0, 15) + '…' : x;
  }

  window.MCWheel = { build, arrange(items){return items.filter(it=>!it.placeholder).map((it,i)=>({...it,shortcut:i+1}));} };
})();


