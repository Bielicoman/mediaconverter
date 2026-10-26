<p align="center"><img src="site/logo.png" width="76" alt="Media Converter"></p>
<h1 align="center">Media Converter</h1>
<p align="center">Converta arquivos locais. Receba uma cópia nova. Preserve o original.</p>

[Site oficial](https://mediaconverter-henna.vercel.app) · [Downloads 2.6.0](https://github.com/Bielicoman/mediaconverter/releases/tag/v2.6.0) · [Notas da versão](docs/RELEASE.md)

Aplicativo de Alex Ascencio para Windows, macOS e Linux. Vídeo, áudio, imagens, documentos, PDFs, dados, legendas e arquivos compactados. Painel, Studio de ajustes, histórico, pastas automáticas e roda rápida com uma fatia por opção, sem espaços vazios.

## Downloads

| Sistema | Pacotes |
|---|---|
| Windows x64 | [Instalador EXE](https://github.com/Bielicoman/mediaconverter/releases/download/v2.6.0/MediaConverter-2.6.0-win-x64.exe) |
| Mac Apple Silicon | [DMG](https://github.com/Bielicoman/mediaconverter/releases/download/v2.6.0/MediaConverter-2.6.0-mac-arm64.dmg) |
| Mac Intel | [DMG](https://github.com/Bielicoman/mediaconverter/releases/download/v2.6.0/MediaConverter-2.6.0-mac-x64.dmg) |
| Linux x64 | [AppImage](https://github.com/Bielicoman/mediaconverter/releases/download/v2.6.0/MediaConverter-2.6.0-linux-x64.AppImage) · [DEB](https://github.com/Bielicoman/mediaconverter/releases/download/v2.6.0/MediaConverter-2.6.0-linux-x64.deb) |

A versão multiplataforma é uma prévia. Mac sem assinatura Developer ID/notarização. AppImage requer FUSE; o DEB é a alternativa para Ubuntu e derivados. FFmpeg e FFprobe vêm incluídos.

## O que funciona

- Vídeo e áudio: conversão, trecho, velocidade, resolução, extração de áudio e normalização.
- Imagens: formatos comuns, recorte visual, tamanho, rotação, fundo e compressão.
- PDF: unir, selecionar, reordenar e girar páginas localmente, sem Office.
- Documentos: Microsoft Office instalado no Windows; LibreOffice instalado no macOS/Linux.
- Arquivos compactados: ZIP, 7Z, TAR e extração conforme os formatos suportados pelo motor nativo.
- Pastas automáticas: novos arquivos viram cópias em uma pasta de saída isolada.

Conversões que dependem de componentes exclusivos do Windows, como PDF para imagens via WinRT e algumas rotas do Office, aparecem indisponíveis em macOS/Linux. Não há plugins para editores.

## Roda rápida

Selecione arquivos pelo app ou arraste-os para a roda. Digite o número do formato e pressione Enter; setas navegam, Tab alterna conversões/ferramentas/ações e Esc fecha. Clique fora fecha sem cancelar uma conversão em andamento.

No Windows, há integração com o Explorador, Enviar para e atalho global. O gesto automático aceita somente eventos reconhecidos de arraste originados no Explorador/desktop, sobre uma área do shell e com arquivos válidos. Movimento do mouse com Shift sozinho não abre a roda. A detecção depende dos eventos emitidos pelo shell; o atalho e o painel são as alternativas quando o evento não é disponibilizado. O gesto físico ainda requer validação no computador de destino.

## Desenvolver e testar

```sh
npm ci
npm ci --prefix app
node scripts/prepare-native.cjs
npm test
npx electron app
```

Para empacotar no sistema de destino:

```sh
npx electron-builder --config installers/electron-builder.json --publish never
```

O workflow do GitHub usa runners nativos para Windows x64, Linux x64, Mac Intel e Apple Silicon. Executa testes de conversão e abertura do painel antes de publicar os pacotes. Isso não substitui revisão visual e instalação manual em cada computador.

## Exemplos reais

[Proposta DOCX](site/examples/proposta-criativa.docx) → [PDF convertido](site/examples/proposta-criativa.pdf). O arquivo foi convertido pelo motor do app no Windows. [PNG original](site/logo.png) → [WebP convertido](site/examples/marca.webp). Sem dados pessoais nas amostras.

## Licenças

Código próprio sob [MIT](LICENSE). Motores e fontes mantêm suas licenças; consulte [avisos de terceiros](THIRD-PARTY-NOTICES.md). O [Media Downloader](https://mediadownloader-blush.vercel.app) é o aplicativo complementar para baixar mídia.
