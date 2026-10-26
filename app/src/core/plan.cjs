'use strict';
// Monta os argumentos do FFmpeg para cada destino. Lógica pura: recebe a análise do ffprobe
// já resumida e devolve uma lista de argumentos. Testável sem executar nada.

const { TARGETS } = require('./formats.cjs');

const Q = (quality, max, balanced, small) => (quality === 'max' ? max : quality === 'small' ? small : balanced);

function hasAlpha(pixFmt) {
  return /^(rgba|bgra|argb|abgr|yuva|gbrap|ya8|ya16|pal8)/.test(String(pixFmt || ''));
}

// Limita o lado menor ao valor escolhido (1080p = 1080 de altura em paisagem, de largura em retrato).
function scaleFilter(probe, maxSide, flags = 'lanczos') {
  if (!maxSide || !probe || !probe.width || !probe.height) return null;
  const portrait = probe.height > probe.width;
  const shortSide = portrait ? probe.width : probe.height;
  if (shortSide <= maxSide) return null;
  return portrait ? `scale=${maxSide}:-2:flags=${flags}` : `scale=-2:${maxSide}:flags=${flags}`;
}

function evenFilter(probe) {
  if (!probe || !probe.width || !probe.height) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  return probe.width % 2 || probe.height % 2 ? 'scale=trunc(iw/2)*2:trunc(ih/2)*2' : null;
}

const WHITE_BG = 'format=rgba,split[mcbg][mcfg];[mcbg]drawbox=x=0:y=0:w=iw:h=ih:color=white@1:t=fill[mcw];[mcw][mcfg]overlay=format=auto';

function joinFilters(list) {
  return list.filter(Boolean).join(',');
}

function videoFilters(probe, opts) {
  const scale = scaleFilter(probe, opts.maxHeight);
  return joinFilters([scale || evenFilter(probe)]);
}

function audioArgs(targetId, quality) {
  switch (targetId) {
    case 'a_aac': return ['-c:a', 'aac', '-b:a', Q(quality, '256k', '192k', '128k'), '-f', 'adts'];
    case 'a_ac3': return ['-c:a', 'ac3', '-b:a', Q(quality, '640k', '448k', '192k')];
    case 'a_mp3': return ['-c:a', 'libmp3lame', '-b:a', Q(quality, '320k', '192k', '128k'), '-id3v2_version', '3'];
    case 'a_wav': return ['-c:a', quality === 'small' ? 'pcm_s16le' : 'pcm_s24le'];
    case 'a_flac': return ['-c:a', 'flac', '-compression_level', Q(quality, '8', '5', '5')];
    case 'a_m4a': return ['-c:a', 'aac', '-b:a', Q(quality, '256k', '192k', '128k'), '-movflags', '+faststart'];
    case 'a_ogg': return ['-c:a', 'libvorbis', '-q:a', Q(quality, '8', '6', '4')];
    case 'a_opus': return ['-c:a', 'libopus', '-b:a', Q(quality, '192k', '128k', '96k')];
    case 'a_aiff': return ['-c:a', quality === 'small' ? 'pcm_s16be' : 'pcm_s24be', '-f', 'aiff'];
    case 'a_alac': return ['-c:a', 'alac', '-f', 'ipod'];
    default: throw new Error('Destino de áudio desconhecido: ' + targetId);
  }
}

function buildFfmpegArgs({ targetId, input, output, probe = {}, quality = 'balanced', maxHeight = 0, gpu = {}, subCharenc = '', options = {} }) {
  const t = TARGETS[targetId];
  if (!t || t.engine !== 'ffmpeg') throw new Error('Destino não usa FFmpeg: ' + targetId);
  const head = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats'];
  const opts = { ...options, maxHeight };
  const transformedVisual = Boolean(options.crop || options.rotate || options.width || options.height);
  if (transformedVisual) maxHeight = 0;
  const normalized = require('./options.cjs').options({ ...opts, quality });
  Object.assign(opts, normalized);
  if (transformedVisual) opts.maxHeight = 0;
  const sourceTarget = targetId;
  targetId = ({ image_edit: 'i_png', video_edit: 'v_mp4_h264', audio_edit: 'a_wav' })[targetId] || targetId;
  const duration = Number(probe.duration) || 0;
  let pre = [];
  let body = [];

  if (t.kind === 'audio') {
    if (!probe.hasAudio) throw new Error('Este arquivo não tem faixa de áudio.');
    body = ['-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '0', ...audioArgs(targetId, quality)];
  } else if (t.kind === 'video') {
    if (!probe.hasVideo) throw new Error('Este arquivo não tem faixa de vídeo.');
    const a = probe.hasAudio;
    switch (targetId) {
      case 'v_mp4_h264': {
        const enc = gpu.h264_nvenc
          ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', Q(quality, '18', '23', '28'), '-b:v', '0']
          : ['-c:v', 'libx264', '-preset', quality === 'max' ? 'slow' : 'medium', '-crf', Q(quality, '17', '21', '26')];
        const vf = videoFilters(probe, opts);
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), ...enc, '-pix_fmt', 'yuv420p', ...(vf ? ['-vf', vf] : []),
          ...(a ? ['-c:a', 'aac', '-b:a', Q(quality, '320k', '256k', '160k')] : []), '-movflags', '+faststart', '-map_metadata', '0'];
        break;
      }
      case 'v_mp4_h265': {
        const enc = gpu.hevc_nvenc
          ? ['-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', Q(quality, '20', '25', '30'), '-b:v', '0']
          : ['-c:v', 'libx265', '-preset', 'medium', '-crf', Q(quality, '20', '24', '28'), '-x265-params', 'log-level=error'];
        const vf = videoFilters(probe, opts);
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), ...enc, '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', ...(vf ? ['-vf', vf] : []),
          ...(a ? ['-c:a', 'aac', '-b:a', Q(quality, '320k', '256k', '160k')] : []), '-movflags', '+faststart', '-map_metadata', '0'];
        break;
      }
      case 'v_avi':
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), '-c:v', 'mpeg4', '-q:v', Q(quality, '2', '4', '7'), '-pix_fmt', 'yuv420p', ...(a ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : [])];
        break;
      case 'v_mp4_av1':
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), '-c:v', 'libaom-av1', '-crf', Q(quality, '24', '32', '40'), '-b:v', '0', '-cpu-used', '6', '-pix_fmt', 'yuv420p', ...(a ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-movflags', '+faststart'];
        break;
      case 'v_webm': {
        const vf = videoFilters(probe, opts);
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), '-c:v', 'libvpx-vp9', '-crf', Q(quality, '28', '33', '38'), '-b:v', '0',
          '-row-mt', '1', '-deadline', 'good', '-cpu-used', Q(quality, '2', '3', '4'), '-pix_fmt', 'yuv420p', ...(vf ? ['-vf', vf] : []),
          ...(a ? ['-c:a', 'libopus', '-b:a', Q(quality, '192k', '160k', '96k')] : [])];
        break;
      }
      case 'v_mov_prores': {
        const vf = joinFilters([scaleFilter(probe, maxHeight), evenFilter(probe)]);
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le',
          ...(vf ? ['-vf', vf] : []), ...(a ? ['-c:a', 'pcm_s24le'] : []), '-map_metadata', '0'];
        break;
      }
      case 'v_mov_dnxhr': {
        const vf = joinFilters([scaleFilter(probe, maxHeight), evenFilter(probe)]);
        body = ['-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), '-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-pix_fmt', 'yuv422p',
          ...(vf ? ['-vf', vf] : []), ...(a ? ['-c:a', 'pcm_s24le'] : []), '-map_metadata', '0'];
        break;
      }
      case 'v_mkv_remux':
        body = ['-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-map_metadata', '0'];
        break;
      case 'v_mp4_remux':
        body = ['-map', '0:v?', '-map', '0:a?', '-c', 'copy', ...(String(probe.vcodec) === 'hevc' ? ['-tag:v', 'hvc1'] : []), '-movflags', '+faststart', '-map_metadata', '0'];
        break;
      case 'v_gif': {
        const w = Number(Q(quality, 960, 640, 480));
        const gf = `fps=15,scale='min(${w},iw)':-1:flags=lanczos,split[g1][g2];[g1]palettegen=stats_mode=diff[gp];[g2][gp]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
        body = ['-map', '0:v:0', '-an', '-vf', gf, '-loop', '0'];
        break;
      }
      default: throw new Error('Destino de vídeo desconhecido: ' + targetId);
    }
  } else if (t.kind === 'still') {
    if (!probe.hasVideo) throw new Error('Este arquivo não tem faixa de vídeo.');
    const at = opts.start ? String(opts.start) : duration > 0 ? (duration * 0.1).toFixed(3) : '0';
    pre = ['-ss', at];
    const vf = scaleFilter(probe, maxHeight);
    body = ['-map', '0:v:0', '-frames:v', '1', '-an', ...(vf ? ['-vf', vf] : []), '-c:v', 'png'];
  } else if (t.kind === 'image') {
    const alpha = hasAlpha(probe.pixFmt);
    const scale = scaleFilter(probe, maxHeight);
    const one = ['-map', '0:v:0', '-frames:v', '1', '-an'];
    switch (targetId) {
      case 'i_jp2': body = [...one, ...(scale ? ['-vf', scale] : []), '-c:v', 'jpeg2000', '-pix_fmt', 'rgb24']; break;
      case 'i_tga': body = [...one, ...(scale ? ['-vf', scale] : []), '-c:v', 'targa']; break;
      case 'i_png': body = [...one, ...(scale ? ['-vf', scale] : []), '-c:v', 'png']; break;
      case 'i_jpg': {
        const vf = joinFilters([scale, alpha ? WHITE_BG : null, 'format=yuvj420p']);
        body = [...one, '-vf', vf, '-c:v', 'mjpeg', '-q:v', Q(quality, '2', '4', '7')];
        break;
      }
      case 'i_webp': body = [...one, ...(scale ? ['-vf', scale] : []), '-c:v', 'libwebp', '-quality', Q(quality, '95', '85', '72'), '-compression_level', '6']; break;
      case 'i_avif': {
        const vf = joinFilters([scale, alpha ? WHITE_BG : null, 'format=yuv420p']);
        body = [...one, '-vf', vf, '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', Q(quality, '18', '28', '38'), '-b:v', '0', '-cpu-used', '6', '-f', 'avif'];
        break;
      }
      case 'i_tiff': body = [...one, ...(scale ? ['-vf', scale] : []), '-c:v', 'tiff', '-compression_algo', 'lzw']; break;
      case 'i_bmp': {
        const vf = joinFilters([scale, alpha ? WHITE_BG : null, 'format=bgr24']);
        body = [...one, '-vf', vf, '-c:v', 'bmp'];
        break;
      }
      case 'i_gif': {
        const vf = joinFilters([scale, 'split[i1][i2];[i1]palettegen=reserve_transparent=1[ip];[i2][ip]paletteuse=alpha_threshold=128']);
        body = [...one, '-vf', vf, '-c:v', 'gif'];
        break;
      }
      case 'i_ico': {
        const vf = "scale=w='min(256,iw)':h='min(256,ih)':force_original_aspect_ratio=decrease,format=rgba";
        body = [...one, '-vf', vf, '-c:v', 'png', '-f', 'ico'];
        break;
      }
      default: throw new Error('Destino de imagem desconhecido: ' + targetId);
    }
  } else if (t.kind === 'subtitle') {
    if (subCharenc) pre = ['-sub_charenc', subCharenc];
    const codec = { sub_srt: 'srt', sub_vtt: 'webvtt', sub_ass: 'ass' }[targetId];
    body = ['-map', '0:s:0', '-c:s', codec];
  } else {
    throw new Error('Destino sem regra de FFmpeg: ' + targetId);
  }

  const visual = [];
  if (opts.crop) {
    const c = opts.crop;
    visual.push(`crop=w=iw*${c.w}:h=ih*${c.h}:x=iw*${c.x}:y=ih*${c.y}`);
  }
  if (opts.width || opts.height) visual.push(`scale=${opts.width || -2}:${opts.height || -2}:force_original_aspect_ratio=decrease`);
  if (opts.rotate === 90) visual.push('transpose=1');
  if (opts.rotate === 180) visual.push('hflip,vflip');
  if (opts.rotate === 270) visual.push('transpose=2');
  if (opts.flip) visual.push('hflip');
  if (opts.grayscale) visual.push('hue=s=0');
  if (t.kind === 'video' && opts.speed !== 1) visual.push(`setpts=PTS/${opts.speed}`);
  if (visual.length && ['video', 'image', 'still'].includes(t.kind)) {
    if (targetId.includes('remux')) throw new Error('Ajustes visuais exigem recompressão. Escolha H.264 ou H.265.');
    let idx = body.indexOf('-vf');
    if (idx >= 0) body[idx + 1] = [...visual, body[idx + 1]].join(',');
    else body.push('-vf', visual.join(','));
    if (t.kind === 'video') { idx = body.indexOf('-vf'); body[idx + 1] += ',scale=trunc(iw/2)*2:trunc(ih/2)*2'; }
  }
  if (transformedVisual && normalized.maxHeight && ['video','image','still'].includes(t.kind)) {
    const limit = normalized.maxHeight;
    const vf = `scale=w='if(lt(iw,ih),min(iw,${limit}),-2)':h='if(lt(iw,ih),-2,min(ih,${limit}))'`;
    const idx = body.indexOf('-vf'); if (idx >= 0) body[idx + 1] += ',' + vf; else body.push('-vf', vf);
  }
  const af = [];
  if (opts.speed !== 1) af.push(`atempo=${opts.speed}`);
  if (opts.normalize) af.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  if (probe.hasAudio && ['video', 'audio'].includes(t.kind)) {
    if (af.length && targetId.includes('remux')) throw new Error('Ajustes de áudio exigem recompressão.');
    if (af.length && !opts.mute) body.push('-af', af.join(','));
    if (opts.sampleRate && !targetId.includes('remux')) body.push('-ar', String(opts.sampleRate));
  }
  if (opts.mute && t.kind === 'video') body.push('-an');
  if (opts.stripMetadata) body.push('-map_metadata', '-1', '-map_chapters', '-1');
  if (opts.background !== '#ffffff') body = body.map(v => typeof v === 'string' ? v.replaceAll('color=white@1', 'color=0x' + opts.background.slice(1) + '@1') : v);
  if (['video', 'audio'].includes(t.kind)) {
    if (opts.start) pre.push('-ss', String(opts.start));
    if (opts.end) body.push('-t', String((opts.end - opts.start) / opts.speed));
  }
  const effective = (opts.end ? Math.min(duration, opts.end) : duration) - opts.start;
  return { args: [...head, ...pre, '-i', input, ...body, output], duration: t.kind === 'video' || t.kind === 'audio' ? Math.max(0, effective) / opts.speed : 0 };
}

// Lê o bloco "-progress pipe:1" e devolve segundos processados, ou null.
function parseProgress(chunk) {
  const m = /out_time_(?:us|ms)=(\d+)/g;
  let last = null;
  let r;
  while ((r = m.exec(chunk))) last = Number(r[1]) / 1e6;
  return last;
}

module.exports = { buildFfmpegArgs, parseProgress, scaleFilter, hasAlpha };
