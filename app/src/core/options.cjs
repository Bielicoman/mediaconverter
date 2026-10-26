'use strict';
// One validated contract shared by the wheel, the panel and the engine.
const number = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
function options(v = {}) {
  if (!v || typeof v !== 'object') v = {};
  const out = {
    quality: ['max', 'balanced', 'small'].includes(v.quality) ? v.quality : 'balanced',
    maxHeight: number(v.maxHeight, 0, 16384, 0),
    width: Math.round(number(v.width, 0, 16384, 0)), height: Math.round(number(v.height, 0, 16384, 0)),
    rotate: [0, 90, 180, 270].includes(Number(v.rotate)) ? Number(v.rotate) : 0,
    flip: v.flip === true, grayscale: v.grayscale === true, stripMetadata: v.stripMetadata === true,
    mute: v.mute === true, normalize: v.normalize === true,
    start: number(v.start, 0, 864000, 0), end: number(v.end, 0, 864000, 0),
    speed: number(v.speed, .25, 4, 1), sampleRate: [0, 22050, 44100, 48000, 96000].includes(Number(v.sampleRate)) ? Number(v.sampleRate) : 0,
    useGpu: v.useGpu !== false, background: /^#[0-9a-f]{6}$/i.test(v.background) ? v.background : '#ffffff',
    pages: typeof v.pages === 'string' ? v.pages.slice(0, 500) : '',
    outDir: typeof v.outDir === 'string' ? v.outDir.slice(0, 4096) : 'beside'
  };
  if (v.crop && typeof v.crop === 'object') {
    const c = v.crop;
    const x = number(c.x, 0, .99, 0), y = number(c.y, 0, .99, 0);
    out.crop = { x, y, w: number(c.w, .01, 1 - x, 1 - x), h: number(c.h, .01, 1 - y, 1 - y) };
  }
  if (out.end && out.end <= out.start) throw new Error('O fim do trecho deve ser maior que o início.');
  return out;
}
function pageIndices(text, count) {
  if (!text.trim()) return Array.from({ length: count }, (_, i) => i);
  const out = [];
  for (const item of text.split(',')) {
    const m = item.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error('Use páginas como 1-3, 5, 8.');
    const a = +m[1], b = +(m[2] || m[1]);
    if (a < 1 || b < a || b > count) throw new Error(`Intervalo fora do documento de ${count} páginas.`);
    for (let n = a; n <= b; n++) if (!out.includes(n - 1)) out.push(n - 1);
  }
  return out;
}
module.exports = { options, pageIndices };
