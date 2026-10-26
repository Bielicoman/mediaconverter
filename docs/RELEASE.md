# Media Converter 2.6.2

- Corrigida a detecção de arraste real do Explorador/área de trabalho, incluindo quando o shell não emite WinEvent.
- Shift momentâneo: segurar mostra, soltar oculta, segurar novamente reapresenta na mesma sessão. Sem expiração de 20 segundos.
- Corrigida a oscilação quando a roda encobre a imagem nativa do arraste.
- Abas Converter/Ferramentas/Ações acessíveis passando o arquivo sobre elas durante o arraste, sem clicar.
- Preservados o design radial escuro, a distribuição sem espaços vazios e os ícones corretos para abrir arquivo e revelar na pasta.
- Uma conversão recebida pelo drop continua mesmo quando a roda é ocultada.

Prévia para Windows x64, Mac Intel, Apple Silicon e Linux x64. Mac sem assinatura Developer ID/notarização. Office no Windows e LibreOffice no Mac/Linux são necessários para suas respectivas rotas de documentos. Gesto de sistema e integração com Explorador exclusivos do Windows.

Verificações: 24 testes de conversão, teste do estado nativo contra oscilação e teste Electron de manter a roda por mais de 20 segundos, liberar/repetir Shift, trocar abas durante arraste e impedir reabertura por consulta atrasada. O usuário confirmou o gesto estável no Windows. Os testes automatizados não substituem instalação manual em cada plataforma.
