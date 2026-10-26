'use strict';
// Adaptador do FFmpeg e do ffprobe empacotados em app/bin.
const fs = require('fs');
const path = require('path');
const { run } = require('./proc.cjs');
const { parseProgress } = require('../core/plan.cjs');

const exe = process.platform === 'win32' ? '.exe' : '';
let binDir = path.join(__dirname, '..', '..', 'bin');

function setBinDir(dir) { binDir = dir; }
function ffmpegPath() { const bundled=path.join(binDir,'ffmpeg'+exe); return fs.existsSync(bundled)?bundled:require('ffmpeg-static'); }
function ffprobePath() { const bundled=path.join(binDir,'ffprobe'+exe); return fs.existsSync(bundled)?bundled:require('ffprobe-static').path; }
function available() { return fs.existsSync(ffmpegPath()) && fs.existsSync(ffprobePath()); }

async function version() {
  const r = await run(ffmpegPath(), ['-hide_banner', '-version'], { timeout: 15000 });
  return (r.stdout.split(/\r?\n/)[0] || '').replace(/^ffmpeg version\s+/, '').split(' ')[0];
}

async function probe(file, { signal } = {}) {
  const r = await run(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { signal, timeout: 60000 });
  const data = JSON.parse(r.stdout || '{}');
  return summarize(data);
}

function summarize(data) {
  const streams = data.streams || [];
  const fmt = data.format || {};
  const v = streams.find(s => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const cover = streams.find(s => s.codec_type === 'video' && s.disposition && s.disposition.attached_pic);
  const a = streams.find(s => s.codec_type === 'audio');
  const sub = streams.find(s => s.codec_type === 'subtitle');
  const num = x => (x === undefined || x === null || x === 'N/A' ? 0 : Number(x) || 0);
  let fps = 0;
  if (v && v.avg_frame_rate && v.avg_frame_rate.includes('/')) {
    const [n, d] = v.avg_frame_rate.split('/').map(Number);
    fps = d ? n / d : 0;
  }
  let width = v ? num(v.width) : 0;
  let height = v ? num(v.height) : 0;
  const rotate = v && Array.isArray(v.side_data_list) ? Math.abs(num((v.side_data_list.find(x => 'rotation' in x) || {}).rotation)) : 0;
  if (rotate === 90 || rotate === 270) [width, height] = [height, width];
  return {
    container: fmt.format_name || '',
    duration: num(fmt.duration) || (v ? num(v.duration) : 0) || (a ? num(a.duration) : 0),
    size: num(fmt.size),
    bitrate: num(fmt.bit_rate),
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    hasSubtitle: Boolean(sub),
    hasCover: Boolean(cover),
    vcodec: v ? v.codec_name : '',
    acodec: a ? a.codec_name : '',
    scodec: sub ? sub.codec_name : '',
    width, height, fps,
    pixFmt: v ? v.pix_fmt || '' : '',
    frames: v ? num(v.nb_frames) : 0,
    sampleRate: a ? num(a.sample_rate) : 0,
    channels: a ? num(a.channels) : 0
  };
}

// Executa e reporta a fração concluída (0..1) quando a duração é conhecida.
function convert(args, { duration = 0, signal, onProgress } = {}) {
  let last = 0;
  return run(ffmpegPath(), args, {
    signal,
    onStdout: chunk => {
      if (!onProgress) return;
      const t = parseProgress(chunk);
      if (t !== null && duration > 0) {
        const f = Math.max(0, Math.min(0.999, t / duration));
        if (f - last >= 0.004) { last = f; onProgress(f); }
      }
    }
  });
}

let gpuCache = null;
// Testa de verdade: codifica 1 quadro. Listar o encoder não prova que há GPU e driver.
async function detectGpu() {
  if (gpuCache) return gpuCache;
  const test = async enc => {
    try {
      await run(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1', '-frames:v', '1', '-c:v', enc, '-f', 'null', '-'], { timeout: 20000 });
      return true;
    } catch (_) { return false; }
  };
  const [h264, hevc] = await Promise.all([test('h264_nvenc'), test('hevc_nvenc')]);
  gpuCache = { h264_nvenc: h264, hevc_nvenc: hevc };
  return gpuCache;
}

async function thumbnail(file, out, { atSeconds = 0, width = 360 } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (atSeconds > 0) args.push('-ss', atSeconds.toFixed(2));
  args.push('-i', file, '-frames:v', '1', '-an', '-vf', `scale='min(${width},iw)':-2:flags=bilinear`, '-q:v', '5', out);
  await run(ffmpegPath(), args, { timeout: 30000 });
  return out;
}

module.exports = { setBinDir, ffmpegPath, ffprobePath, available, version, probe, summarize, convert, detectGpu, thumbnail };
