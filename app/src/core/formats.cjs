'use strict';
// Catálogo de formatos. Lógica pura: não conhece Electron, FFmpeg nem Office.
// Cada destino declara o motor que o executa; o host decide se o motor existe.

const CATEGORIES = {
  video: { label: 'Vídeo', plural: 'Vídeos' },
  audio: { label: 'Áudio', plural: 'Áudios' },
  image: { label: 'Imagem', plural: 'Imagens' },
  document: { label: 'Documento', plural: 'Documentos' },
  spreadsheet: { label: 'Planilha', plural: 'Planilhas' },
  presentation: { label: 'Apresentação', plural: 'Apresentações' },
  pdf: { label: 'PDF', plural: 'PDFs' },
  text: { label: 'Texto', plural: 'Textos' },
  data: { label: 'Dados', plural: 'Dados' },
  subtitle: { label: 'Legenda', plural: 'Legendas' },
  archive: { label: 'Arquivo ZIP', plural: 'Arquivos ZIP' },
  other: { label: 'Arquivo', plural: 'Arquivos' }
};

const EXTENSIONS = {
  video: ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'mts', 'm2ts', 'ts', 'mxf', '3gp', '3g2', 'mpg', 'mpeg', 'ogv', 'vob', 'f4v', 'dv', 'asf'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'aifc', 'amr', 'ac3', 'eac3', 'mka', 'caf', 'w64', 'wv', 'mp2', 'au'],
  image: ['png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'bmp', 'tif', 'tiff', 'gif', 'avif', 'ico', 'psd', 'exr', 'dpx', 'tga', 'jp2', 'j2k', 'pbm', 'pgm', 'ppm', 'pcx', 'sgi', 'svg', 'heic', 'heif', 'jxr', 'wdp'],
  document: ['doc', 'docx', 'docm', 'odt', 'rtf', 'dot', 'dotx', 'wpd'],
  spreadsheet: ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'],
  presentation: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'odp'],
  pdf: ['pdf'],
  text: ['txt', 'md', 'markdown', 'html', 'htm', 'log'],
  data: ['json', 'csv', 'tsv'],
  subtitle: ['srt', 'vtt', 'ass', 'ssa'],
  archive: ['zip','7z','rar','tar','gz','bz2','xz','iso','cab']
};

const EXT_TO_CATEGORY = Object.create(null);
for (const [cat, list] of Object.entries(EXTENSIONS)) for (const e of list) EXT_TO_CATEGORY[e] = cat;

// Imagens que o FFmpeg empacotado não decodifica. Medido no build 6.1.1 essentials:
// sem decodificador SVG, HEIF ou JPEG XR. SVG passa pelo Chromium; HEIC/JXR pelo WIC do Windows.
const IMAGE_DECODER = { svg: 'chromium', heic: 'wic', heif: 'wic', jxr: 'wic', wdp: 'wic', avif: 'chromium' };

// id: identificador estável · ext: extensão de saída · engine: ffmpeg | office | chromium | pdfwin | data | zip
const TARGETS = {
  // Vídeo
  v_mp4_h264: { ext: 'mp4', engine: 'ffmpeg', kind: 'video', label: 'MP4 · H.264', desc: 'Abre em qualquer lugar · alta qualidade', badge: 'MP4' },
  v_mp4_h265: { ext: 'mp4', engine: 'ffmpeg', kind: 'video', label: 'MP4 · H.265 (HEVC)', desc: 'Cerca de metade do tamanho · players modernos', badge: 'HEVC' },
  v_webm: { ext: 'webm', engine: 'ffmpeg', kind: 'video', label: 'WebM · VP9', desc: 'Para sites · áudio Opus', badge: 'WEBM' },
  v_mov_prores: { ext: 'mov', engine: 'ffmpeg', kind: 'video', label: 'MOV · ProRes 422 HQ', desc: 'Edição profissional · arquivo grande', badge: 'PRORES' },
  v_mov_dnxhr: { ext: 'mov', engine: 'ffmpeg', kind: 'video', label: 'MOV · DNxHR HQ', desc: 'Edição em Avid e Resolve', badge: 'DNXHR' },
  v_mkv_remux: { ext: 'mkv', engine: 'ffmpeg', kind: 'video', label: 'MKV · sem recompressão', desc: 'Troca só o contêiner · segundos', badge: 'REMUX' },
  v_mp4_remux: { ext: 'mp4', engine: 'ffmpeg', kind: 'video', label: 'MP4 · sem recompressão', desc: 'Troca só o contêiner · exige codec compatível', badge: 'REMUX' },
  v_gif: { ext: 'gif', engine: 'ffmpeg', kind: 'video', label: 'GIF animado', desc: 'Até 15 fps · paleta otimizada', badge: 'GIF' },
  v_frame_png: { ext: 'png', engine: 'ffmpeg', kind: 'still', label: 'Quadro em PNG', desc: 'Captura do quadro a 10% da duração', badge: 'PNG' },
  // Áudio (também extrai de vídeo)
  a_mp3: { ext: 'mp3', engine: 'ffmpeg', kind: 'audio', label: 'Áudio MP3', desc: 'Compatibilidade ampla · até 320 kbps', badge: 'MP3' },
  a_wav: { ext: 'wav', engine: 'ffmpeg', kind: 'audio', label: 'Áudio WAV 24-bit', desc: 'PCM para edição · sem compressão', badge: 'WAV' },
  a_flac: { ext: 'flac', engine: 'ffmpeg', kind: 'audio', label: 'Áudio FLAC', desc: 'Sem perdas · menor que WAV', badge: 'FLAC' },
  a_m4a: { ext: 'm4a', engine: 'ffmpeg', kind: 'audio', label: 'Áudio M4A (AAC)', desc: 'Apple e celulares · até 256 kbps', badge: 'M4A' },
  a_ogg: { ext: 'ogg', engine: 'ffmpeg', kind: 'audio', label: 'Áudio OGG Vorbis', desc: 'Jogos e web', badge: 'OGG' },
  a_opus: { ext: 'opus', engine: 'ffmpeg', kind: 'audio', label: 'Áudio Opus', desc: 'Voz e streaming · muito compacto', badge: 'OPUS' },
  a_aiff: { ext: 'aiff', engine: 'ffmpeg', kind: 'audio', label: 'Áudio AIFF 24-bit', desc: 'PCM para macOS e Logic', badge: 'AIFF' },
  a_alac: { ext: 'm4a', engine: 'ffmpeg', kind: 'audio', label: 'Áudio ALAC', desc: 'Apple Lossless · sem perdas', badge: 'ALAC' },
  // Imagem
  i_png: { ext: 'png', engine: 'ffmpeg', kind: 'image', label: 'Imagem PNG', desc: 'Sem perdas · mantém transparência', badge: 'PNG' },
  i_jpg: { ext: 'jpg', engine: 'ffmpeg', kind: 'image', label: 'Imagem JPG', desc: 'Fotos leves · fundo branco no lugar da transparência', badge: 'JPG' },
  i_webp: { ext: 'webp', engine: 'ffmpeg', kind: 'image', label: 'Imagem WebP', desc: 'Para sites · mantém transparência', badge: 'WEBP' },
  i_avif: { ext: 'avif', engine: 'ffmpeg', kind: 'image', label: 'Imagem AVIF', desc: 'O menor arquivo · navegadores atuais', badge: 'AVIF' },
  i_tiff: { ext: 'tif', engine: 'ffmpeg', kind: 'image', label: 'Imagem TIFF', desc: 'Impressão e arquivo · sem perdas', badge: 'TIFF' },
  i_bmp: { ext: 'bmp', engine: 'ffmpeg', kind: 'image', label: 'Imagem BMP', desc: 'Bitmap sem compressão', badge: 'BMP' },
  i_gif: { ext: 'gif', engine: 'ffmpeg', kind: 'image', label: 'Imagem GIF', desc: 'Paleta de 256 cores', badge: 'GIF' },
  i_ico: { ext: 'ico', engine: 'ffmpeg', kind: 'image', label: 'Ícone ICO', desc: 'Ícone do Windows · até 256 px', badge: 'ICO' },
  i_pdf: { ext: 'pdf', engine: 'chromium', kind: 'pdf', label: 'Documento PDF', desc: 'Imagem centralizada em página A4', badge: 'PDF' },
  // Word
  d_pdf: { ext: 'pdf', engine: 'office', app: 'word', code: 17, label: 'Documento PDF', desc: 'Pelo Microsoft Word instalado', badge: 'PDF' },
  d_docx: { ext: 'docx', engine: 'office', app: 'word', code: 16, label: 'Word DOCX', desc: 'Formato atual do Word', badge: 'DOCX' },
  d_odt: { ext: 'odt', engine: 'office', app: 'word', code: 23, label: 'OpenDocument ODT', desc: 'LibreOffice e Google Docs', badge: 'ODT' },
  d_rtf: { ext: 'rtf', engine: 'office', app: 'word', code: 6, label: 'Rich Text RTF', desc: 'Texto com formatação básica', badge: 'RTF' },
  d_txt: { ext: 'txt', engine: 'office', app: 'word', code: 2, label: 'Texto TXT', desc: 'Somente o texto · UTF-8', badge: 'TXT' },
  d_html: { ext: 'html', engine: 'office', app: 'word', code: 10, label: 'Página HTML', desc: 'HTML filtrado do Word', badge: 'HTML' },
  // Excel
  s_pdf: { ext: 'pdf', engine: 'office', app: 'excel', code: 'pdf', label: 'Documento PDF', desc: 'Pelo Microsoft Excel instalado', badge: 'PDF' },
  s_xlsx: { ext: 'xlsx', engine: 'office', app: 'excel', code: 51, label: 'Excel XLSX', desc: 'Formato atual do Excel', badge: 'XLSX' },
  s_csv: { ext: 'csv', engine: 'office', app: 'excel', code: 62, label: 'CSV UTF-8', desc: 'Primeira planilha · separador do Windows', badge: 'CSV' },
  s_ods: { ext: 'ods', engine: 'office', app: 'excel', code: 60, label: 'OpenDocument ODS', desc: 'LibreOffice e Google Planilhas', badge: 'ODS' },
  // PowerPoint
  p_pdf: { ext: 'pdf', engine: 'office', app: 'powerpoint', code: 32, label: 'Documento PDF', desc: 'Pelo Microsoft PowerPoint instalado', badge: 'PDF' },
  p_pptx: { ext: 'pptx', engine: 'office', app: 'powerpoint', code: 24, label: 'PowerPoint PPTX', desc: 'Formato atual do PowerPoint', badge: 'PPTX' },
  p_odp: { ext: 'odp', engine: 'office', app: 'powerpoint', code: 35, label: 'OpenDocument ODP', desc: 'LibreOffice Impress', badge: 'ODP' },
  p_png: { ext: '', engine: 'office', app: 'powerpoint', code: 18, folder: true, label: 'Slides em PNG', desc: 'Uma imagem por slide, numa pasta', badge: 'PNG' },
  // PDF
  pdf_png: { ext: '', engine: 'pdfwin', folder: true, image: 'png', label: 'Páginas em PNG', desc: 'Uma imagem por página, numa pasta', badge: 'PNG' },
  pdf_jpg: { ext: '', engine: 'pdfwin', folder: true, image: 'jpg', label: 'Páginas em JPG', desc: 'Uma imagem por página, numa pasta', badge: 'JPG' },
  pdf_docx: { ext: 'docx', engine: 'office', app: 'word', code: 16, label: 'Word DOCX editável', desc: 'Reconstrução do Word · layout pode variar', badge: 'DOCX' },
  pdf_txt: { ext: 'txt', engine: 'office', app: 'word', code: 2, label: 'Texto TXT', desc: 'Texto extraído pelo Word', badge: 'TXT' },
  // Texto
  t_pdf: { ext: 'pdf', engine: 'chromium', kind: 'pdf', label: 'Documento PDF', desc: 'Página A4 com tipografia limpa', badge: 'PDF' },
  t_html: { ext: 'html', engine: 'data', label: 'Página HTML', desc: 'Markdown e texto viram HTML', badge: 'HTML' },
  t_docx: { ext: 'docx', engine: 'office', app: 'word', code: 16, label: 'Word DOCX', desc: 'Pelo Microsoft Word instalado', badge: 'DOCX' },
  t_txt: { ext: 'txt', engine: 'data', label: 'Texto TXT', desc: 'Remove marcação · UTF-8', badge: 'TXT' },
  // Dados
  dt_json: { ext: 'json', engine: 'data', label: 'JSON', desc: 'Lista de objetos com cabeçalho', badge: 'JSON' },
  dt_csv: { ext: 'csv', engine: 'data', label: 'CSV', desc: 'Separado por vírgula · UTF-8', badge: 'CSV' },
  dt_tsv: { ext: 'tsv', engine: 'data', label: 'TSV', desc: 'Separado por tabulação', badge: 'TSV' },
  dt_xlsx: { ext: 'xlsx', engine: 'office', app: 'excel', code: 51, viaCsv: true, label: 'Excel XLSX', desc: 'Pelo Microsoft Excel instalado', badge: 'XLSX' },
  // Legendas
  sub_srt: { ext: 'srt', engine: 'ffmpeg', kind: 'subtitle', label: 'Legenda SRT', desc: 'A mais compatível', badge: 'SRT' },
  sub_vtt: { ext: 'vtt', engine: 'ffmpeg', kind: 'subtitle', label: 'Legenda WebVTT', desc: 'Players da web', badge: 'VTT' },
  sub_ass: { ext: 'ass', engine: 'ffmpeg', kind: 'subtitle', label: 'Legenda ASS', desc: 'Estilos avançados', badge: 'ASS' },
  // Arquivos
  zip_extract: { ext: '', engine: 'zip', op: 'extract', folder: true, label: 'Extrair pasta', desc: 'Descompacta ao lado do ZIP', badge: 'PASTA' },
  any_zip: { ext: 'zip', engine: 'zip', op: 'compress', label: 'Compactar em ZIP', desc: 'Vários arquivos viram um ZIP', badge: 'ZIP', multi: true }
};

// File tools always create a new copy, including same-extension image edits.
Object.assign(TARGETS, {
  image_edit: { ext: 'png', engine: 'ffmpeg', kind: 'image', label: 'Ajustar imagem', desc: 'Recorte, tamanho, rotação e fundo', badge: 'AJUSTAR', tool: true },
  video_edit: { ext: 'mp4', engine: 'ffmpeg', kind: 'video', label: 'Ajustar vídeo', desc: 'Trecho, velocidade, tamanho e áudio', badge: 'AJUSTAR', tool: true },
  audio_edit: { ext: 'wav', engine: 'ffmpeg', kind: 'audio', label: 'Ajustar áudio', desc: 'Trecho, velocidade e normalização', badge: 'AJUSTAR', tool: true },
  pdf_edit: { ext: 'pdf', engine: 'pdf', label: 'Organizar PDF', desc: 'Selecionar e girar páginas', badge: 'PÁGINAS', tool: true },
  pdf_merge: { ext: 'pdf', engine: 'pdf', label: 'Unir PDFs', desc: 'Na ordem dos arquivos selecionados', badge: 'UNIR', multi: true, tool: true },
  v_avi: { ext: 'avi', engine: 'ffmpeg', kind: 'video', label: 'Vídeo AVI', desc: 'MPEG-4 e MP3', badge: 'AVI' },
  v_mp4_av1: { ext: 'mp4', engine: 'ffmpeg', kind: 'video', label: 'MP4 · AV1', desc: 'Compressão moderna · lento no processador', badge: 'AV1' },
  a_aac: { ext: 'aac', engine: 'ffmpeg', kind: 'audio', label: 'Áudio AAC', desc: 'Fluxo ADTS', badge: 'AAC' },
  a_ac3: { ext: 'ac3', engine: 'ffmpeg', kind: 'audio', label: 'Áudio AC3', desc: 'Dolby Digital · até 640 kbps', badge: 'AC3' },
  i_jp2: { ext: 'jp2', engine: 'ffmpeg', kind: 'image', label: 'Imagem JPEG 2000', desc: 'Arquivo e impressão', badge: 'JP2' },
  i_tga: { ext: 'tga', engine: 'ffmpeg', kind: 'image', label: 'Imagem TGA', desc: 'Texturas e composição', badge: 'TGA' }
});
Object.assign(TARGETS, {
  archive_extract: { ext: '', engine: 'archive', folder: true, op: 'extract', label: 'Extrair conteúdo', desc: 'ZIP, 7Z, RAR, TAR, GZ e outros', badge: 'EXTRAIR' },
  any_7z: { ext: '7z', engine: 'archive', format: '7z', label: 'Compactar em 7Z', desc: 'Compressão LZMA2', badge: '7Z', multi: true },
  any_tar: { ext: 'tar', engine: 'archive', format: 'tar', label: 'Compactar em TAR', desc: 'Pacote sem compressão', badge: 'TAR', multi: true }
});
const BY_CATEGORY = {
  video: ['a_aac', 'a_ac3', 'v_avi', 'v_mp4_av1', 'video_edit', 'v_mp4_h264', 'v_mp4_h265', 'v_webm', 'v_mov_prores', 'v_mov_dnxhr', 'v_mkv_remux', 'v_mp4_remux', 'v_gif', 'a_mp3', 'a_wav', 'a_flac', 'a_m4a', 'v_frame_png', 'any_zip'],
  audio: ['a_aac', 'a_ac3', 'audio_edit', 'a_mp3', 'a_wav', 'a_flac', 'a_m4a', 'a_ogg', 'a_opus', 'a_aiff', 'a_alac', 'any_zip'],
  image: ['i_jp2', 'i_tga', 'image_edit', 'i_png', 'i_jpg', 'i_webp', 'i_avif', 'i_pdf', 'i_tiff', 'i_ico', 'i_gif', 'i_bmp', 'any_zip'],
  document: ['d_pdf', 'd_docx', 'd_odt', 'd_rtf', 'd_txt', 'd_html', 'any_zip'],
  spreadsheet: ['s_pdf', 's_xlsx', 's_csv', 's_ods', 'any_zip'],
  presentation: ['p_pdf', 'p_pptx', 'p_png', 'p_odp', 'any_zip'],
  pdf: ['pdf_edit', 'pdf_merge', 'pdf_png', 'pdf_jpg', 'pdf_docx', 'pdf_txt', 'any_zip'],
  text: ['t_pdf', 't_html', 't_docx', 't_txt', 'any_zip'],
  data: ['dt_json', 'dt_csv', 'dt_tsv', 'dt_xlsx', 'any_zip'],
  subtitle: ['sub_srt', 'sub_vtt', 'sub_ass', 'any_zip'],
  archive: ['archive_extract','any_zip','any_7z','any_tar'],
  other: ['any_zip']
};

// Ordem padrão: todas as opções compatíveis, sem teto de quantidade.
const WHEEL_DEFAULTS = {
  video: ['v_mp4_h264', 'v_mp4_h265', 'v_mov_prores', 'v_webm', 'v_gif', 'a_mp3', 'a_wav', 'v_frame_png'],
  audio: ['a_mp3', 'a_wav', 'a_flac', 'a_m4a', 'a_ogg', 'a_opus', 'a_aiff', 'any_zip'],
  image: ['i_png', 'i_jpg', 'i_webp', 'i_avif', 'i_pdf', 'i_ico', 'i_tiff', 'any_zip'],
  document: ['d_pdf', 'd_docx', 'd_odt', 'd_txt', 'd_rtf', 'any_zip'],
  spreadsheet: ['s_pdf', 's_xlsx', 's_csv', 's_ods', 'any_zip'],
  presentation: ['p_pdf', 'p_pptx', 'p_png', 'any_zip'],
  pdf: ['pdf_png', 'pdf_jpg', 'pdf_docx', 'pdf_txt', 'any_zip'],
  text: ['t_pdf', 't_html', 't_docx', 't_txt', 'any_zip'],
  data: ['dt_json', 'dt_csv', 'dt_tsv', 'dt_xlsx', 'any_zip'],
  subtitle: ['sub_srt', 'sub_vtt', 'sub_ass', 'any_zip'],
  archive: ['archive_extract','any_zip','any_7z','any_tar'],
  other: ['any_zip']
};

for (const [cat, list] of Object.entries(BY_CATEGORY)) if (cat !== 'archive') list.push('any_7z','any_tar');
for (const cat of Object.keys(WHEEL_DEFAULTS)) WHEEL_DEFAULTS[cat] = [...new Set([...WHEEL_DEFAULTS[cat], ...BY_CATEGORY[cat]])].filter(id => !TARGETS[id].tool && BY_CATEGORY[cat].includes(id));

function extOf(filePath) {
  const name = String(filePath || '').split(/[\\/]/).pop();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function categoryOf(filePath) {
  return EXT_TO_CATEGORY[extOf(filePath)] || 'other';
}

function targetsFor(category) {
  return (BY_CATEGORY[category] || BY_CATEGORY.other).slice();
}

// Destino é aceito para a categoria? Também impede converter para a mesma extensão sem ganho
// (PNG → PNG), exceto quando o codec muda (MP4 H.264 → MP4 H.265).
function isTargetValid(category, targetId, inputExt) {
  if (!targetsFor(category).includes(targetId)) return false;
  const t = TARGETS[targetId];
  if (!t) return false;
  if (t.tool) return true;
  if (t.engine === 'ffmpeg' && (t.kind === 'image' || t.kind === 'subtitle') && sameExt(inputExt, t.ext)) return false;
  if (t.engine === 'ffmpeg' && t.kind === 'audio' && category === 'audio' && sameExt(inputExt, t.ext) && targetId !== 'a_alac') return false;
  if (t.engine === 'office' && sameExt(inputExt, t.ext) && !t.viaCsv) return false;
  if (t.engine === 'data' && sameExt(inputExt, t.ext)) return false;
  return true;
}

function sameExt(a, b) {
  const n = x => ({ jpeg: 'jpg', jfif: 'jpg', jpe: 'jpg', tiff: 'tif', htm: 'html', markdown: 'md', aif: 'aiff', aifc: 'aiff' }[x] || x);
  return n(String(a || '').toLowerCase()) === n(String(b || '').toLowerCase());
}

// Destinos comuns a um conjunto de arquivos (usado pela roda com seleção múltipla).
function commonTargets(paths) {
  const cats = [...new Set(paths.map(categoryOf))];
  if (!cats.length) return { categories: [], targets: [] };
  let common = targetsFor(cats[0]);
  for (const c of cats.slice(1)) common = common.filter(t => targetsFor(c).includes(t));
  return { categories: cats, targets: common };
}

function wheelTargets(paths, custom) {
  const { categories, targets } = commonTargets(paths);
  const exts = paths.map(extOf);
  const valid = id => categories.every(cat => paths.filter(p => categoryOf(p) === cat).every((p, i) => isTargetValid(cat, id, extOf(p)))) && exts.length > 0;
  let order = [];
  if (categories.length === 1) {
    const cat = categories[0];
    const preferred = (custom && Array.isArray(custom[cat]) && custom[cat].length ? custom[cat] : WHEEL_DEFAULTS[cat]) || [];
    order = preferred.filter(id => targets.includes(id));

  } else {
    order = targets.slice();
  }
  const out = order.filter(valid);
  if (paths.length > 1 && !out.includes('any_zip') && targets.includes('any_zip')) out.push('any_zip');
  return { categories, targets: out };
}

function describeTarget(id) {
  const t = TARGETS[id];
  return t ? { id, ...t } : null;
}

module.exports = {
  CATEGORIES, EXTENSIONS, TARGETS, BY_CATEGORY, WHEEL_DEFAULTS, IMAGE_DECODER,
  extOf, categoryOf, targetsFor, isTargetValid, sameExt, commonTargets, wheelTargets, describeTarget
};
