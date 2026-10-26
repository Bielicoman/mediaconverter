# Media Converter 2.6.1

- Design radial escuro aprovado, com uma fatia por opção e nenhum espaço vazio.
- Rodapé separado da roda; fontes adaptadas à quantidade de opções.
- Monitor de gesto do Windows restrito a eventos de arraste reconhecidos do Explorador/desktop. Movimento + Shift sozinho não é mais um gatilho. Sem fallback para arquivos antigos da área de transferência.
- Painel, Studio, PDF local, arquivos compactados, histórico e pastas automáticas.
- Pacotes nativos para Windows x64, Linux x64, Mac Intel e Apple Silicon, com FFmpeg e FFprobe.
- Documentos em macOS/Linux usam LibreOffice instalado separadamente. Windows usa Office. PDF para imagens via Windows e integração com Explorer não são oferecidos nas outras plataformas.

Prévia multiplataforma. Builds e testes automatizados em runners nativos não substituem a validação de gestos físicos ou instalação em cada computador. Mac sem assinatura Developer ID/notarização. A roda pode ser aberta no app e receber arquivos; o gesto de sistema é exclusivo do Windows e depende de eventos de acessibilidade emitidos pelo shell.

Exemplos do site: proposta criativa DOCX convertida para PDF pelo motor do app, e ícone PNG convertido para WebP. Nenhum dado pessoal é usado nas amostras.

- 2.6.1: corrigida a associação dos ícones e ações de abrir arquivo e mostrar na pasta.
