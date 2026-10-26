<p align="center"><img src="site/logo.png" width="76" alt="Media Converter"></p>
<h1 align="center">Media Converter</h1>
<p align="center">Qualquer arquivo, no formato certo. Uma cópia nova, o original intacto.</p>

Aplicativo gratuito de Alex Ascencio para Windows 10 e 11 (x64). Mesma identidade do [Media Downloader](https://mediadownloader-blush.vercel.app), em verde. Sem plugins de edição: o atalho rápido é a **roda seletora** do Windows.

## Versão 2.5.0

[Instalador Windows x64](dist/MediaConverter-2.5.0-Windows-x64-Setup.exe) · [Upgrade e evidências](docs/UPGRADE-2.5.md) · [Sistema visual](DESIGN.md)

Novo Studio de ajustes: recorte visual, tamanho, rotação, fundo, presets, trecho, velocidade e áudio. PDFs podem ser unidos, reordenados e girados sem Office. Pastas automáticas processam novos arquivos. Tema claro e escuro; logo com borda branca.

## O que faz

| Tipo | Converte para | Motor |
|---|---|---|
| Vídeo | MP4 H.264 · H.265 · AV1 · AVI · WebM VP9 · ProRes 422 HQ · DNxHR HQ · MKV/MP4 sem recompressão · GIF · quadro PNG · MP3/WAV/FLAC/M4A | FFmpeg 6.1.1 (NVENC quando houver GPU NVIDIA) |
| Áudio | MP3 · WAV 24-bit · FLAC · M4A · OGG · Opus · AIFF · ALAC · AAC · AC3 | FFmpeg |
| Imagem | PNG · JPG · WebP · AVIF · TIFF · BMP · GIF · ICO · JP2 · TGA · PDF | FFmpeg; SVG/AVIF pelo Chromium; HEIC/JXR pelo WIC do Windows |
| Word | PDF · DOCX · ODT · RTF · TXT · HTML | Microsoft Word instalado (COM) |
| Excel | PDF · XLSX · CSV UTF-8 · ODS | Microsoft Excel instalado |
| PowerPoint | PDF · PPTX · ODP · slides em PNG | Microsoft PowerPoint instalado |
| PDF | Unir · selecionar/reordenar páginas · girar · páginas em PNG/JPG · DOCX editável · TXT | pdf-lib sem Office · Windows.Data.Pdf (WinRT) · Word |
| Texto/Markdown/HTML | PDF · HTML · DOCX · TXT | Chromium do app · Word |
| Dados | JSON · CSV · TSV · XLSX | JavaScript · Excel |
| Legendas | SRT · VTT · ASS | FFmpeg |
| Arquivos | ZIP · 7Z · TAR; extrair ZIP, 7Z, RAR, TAR, GZ, BZ2, XZ, ISO e CAB | System.IO.Compression · 7-Zip |

Regras: a saída nunca sobrescreve nada (`nome (convertido).ext`); a cópia é gravada como `*.convertendo.*` e só recebe o nome final inteira; cancelar apaga a parcial. Converter não recupera qualidade perdida. O limite de resolução só reduz; o Studio permite escolher explicitamente um novo tamanho.

## Roda rápida

- **Botão direito → “Converter com Media Converter”** (HKCU, sem administrador; no Windows 11 em “Mostrar mais opções”). Seleção múltipla vira uma única roda.
- **Atalho global** `Alt+Shift+C` (configurável): lê os arquivos selecionados na janela do Explorador em primeiro plano (aba ativa), na área de trabalho ou copiados com Ctrl+C.
- **Enviar para → Media Converter (roda rápida)**.
- **Shift + arraste** ou **Ctrl+Shift + arraste** no Windows, configuráveis.
- Número + Enter escolhe a fatia; setas navegam; Tab alterna rodas; Esc cancela.
- **Sem limite de formatos.** Todos aparecem juntos, com número global uniforme de divisões entre tipos. Posições sem conversão compatível ficam livres.

## Estrutura

```
app/src/core   lógica pura e testável (catálogo, argumentos do FFmpeg, nomes, CSV/JSON/Markdown)
app/src/host   adaptadores: FFmpeg, Office/WinRT/WIC/ZIP via PowerShell, Chromium, registro do Windows
app/src/ui     painel e roda (contextIsolation + sandbox; sem Node na interface)
site/          site estático (Vercel)
```

## Desenvolvimento

```sh
npm test                      # unidade (núcleo)
npm run test:integration      # conversões reais com o FFmpeg empacotado
npm run test:office           # inclui Word e Excel (exige Office)
node scripts/package-windows.cjs --electron <pasta do Electron 44.7.0 extraído>
node scripts/serve-site.cjs   # site em http://127.0.0.1:4173
```

O CSS do app e do site é gerado a partir do Media Downloader (`scripts/recolor-*.cjs`) para manter a identidade em sincronia.

## Licença

Código próprio sob [MIT](LICENSE). FFmpeg (build gyan.dev essentials 6.1.1) sob GPL; veja [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Contato: **ascencioalexgabriel@gmail.com**.






