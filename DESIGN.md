# Media Converter 2

## Atmosfera
Uma bancada de trabalho discreta. A roda é o componente de identidade: setores arredondados, centro com a prévia real do arquivo e estados de progresso ligados ao processo. O verde e a moldura branca do logo mantêm parentesco com o Media Downloader.

## Paleta
Fundo `#101715`, superfície `#19221e`, texto `#edf4ef`, secundário `#a5b4ab`, ação `#73e6ac`, erro `#ffa58f`. No tema claro: fundo `#eef3ee`, superfície branca, texto `#20372b`, ação textual `#1d8052`.

## Tipografia
Manrope local, títulos 600, corpo 400–500, controles 600–700. Não depender de fontes remotas. Formatos curtos nos setores estreitos; nome completo e descrição aparecem ao apontar. Numerais associados à seleção pelo teclado.

## Componentes e layout
Painel principal com área de entrada à esquerda e histórico à direita em telas largas. Studio modal centralizado, prévia e controles separados. Raio 28px nas superfícies principais, 12px em campos, cápsulas em navegação e ações. As molduras identificam regiões funcionais.

## Roda
Não limitar formatos a oito nem esconder excedentes em páginas. A quantidade de setores corresponde exatamente às opções disponíveis; não criar posições vazias. Ferramentas e ações têm suas próprias rodas de tamanho uniforme por modo. Nunca preencher uma posição com uma conversão inválida.

## Movimento
Entrada curta com `cubic-bezier(.22,1,.36,1)`. Evitar o halo neon e animação contínua decorativa. Progresso deriva dos executores. `prefers-reduced-motion` reduz as transições.

## Responsividade e acesso
Foco de teclado visível, rótulos acessíveis e cancelamento por Esc. No Studio estreito os controles ficam abaixo da prévia. Preservar nomes completos em tooltips, erros legíveis e estado vazio com ação útil.

## Compact Glass 2.1
Janela de 420 DIP em vez de 620 (32% menor; área 54% menor). Vidro translúcido neutro com reflexos verdes discretos, bordas finas, iluminação ligada ao ponteiro e inclinação máxima de 2 graus. Nenhum efeito contínuo. Contornos suaves por SVG; o acrílico nativo foi descartado após apresentar recortes no teste real do Windows. Não declarar desfoque nativo do desktop.
As opções são distribuídas pelo círculo preservando a quantidade global de divisões; não há posições livres. Atalhos numéricos seguem a ordem lógica das opções, independentemente da posição geométrica.

