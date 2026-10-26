# Avisos de terceiros e proveniência

O código próprio do Media Converter é MIT, copyright 2026 Alex Ascencio. Isso não relicencia programas, fontes ou bibliotecas de terceiros.

| Componente | Versão medida | Licença / origem |
|---|---|---|
| Electron | 44.7.0 | MIT; contém Chromium e Node.js com avisos próprios (`LICENSES.chromium.html` acompanha o runtime) |
| FFmpeg / FFprobe | 6.1.1 essentials, Gyan | GPLv3 ou posterior; build estática com `--enable-gpl --enable-version3` — https://github.com/GyanD/codexffmpeg/releases/tag/6.1.1 |
| pdf-lib | 1.17.1 | MIT, Hopding; licenças preservadas em app/node_modules |
| 7-Zip | 26.01 (executável local) | LGPL + restrições unRAR; app/licenses/7zip-License.txt; https://www.7-zip.org/ |
| Manrope | fonte variável | SIL OFL 1.1 (`app/src/ui/fonts/OFL.txt`) |

Componentes usados mas **não distribuídos**: Microsoft Office (Word, Excel, PowerPoint), Windows.Data.Pdf, Windows Imaging Component e PowerShell pertencem à Microsoft e são usados quando já estão instalados no computador.

## Limite de verificação da fonte correspondente GPL

Igual ao Media Downloader: o núcleo FFmpeg está identificado, mas o conjunto completo de fontes das bibliotecas vinculadas estaticamente no build Gyan ainda não foi coletado. Isso continua registrado como pendência de distribuição. Pedidos: ascencioalexgabriel@gmail.com.

## Pacotes multiplataforma 2.6
Os builds nativos usam `ffmpeg-static` 5.3.0 (FFmpeg 6.1.1), `ffprobe-static` 3.1.0 e `7zip-bin` 5.2.0. Cada dependência preserva seus avisos e licenças no pacote. Fontes e scripts dos fornecedores: https://github.com/eugeneware/ffmpeg-static/tree/b6.1.1 ; https://github.com/descriptinc/ffprobe-static ; https://github.com/develar/7zip-bin . A licença MIT do app não altera as licenças desses motores. LibreOffice não é distribuído, apenas detectado quando instalado.
