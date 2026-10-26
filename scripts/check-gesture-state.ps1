$ErrorActionPreference='Stop'
$source=Get-Content (Join-Path $PSScriptRoot '../app/src/host/ps/gesture.ps1') -Raw
$code=[regex]::Match($source,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if(-not $code){throw 'Código nativo ausente'}
Add-Type -TypeDefinition $code
$s=New-Object McGesture+HoldState
function Expect([int]$actual,[int]$expected,[string]$label){if($actual -ne $expected){throw "$label : esperado $expected, recebido $actual"}}
Expect ($s.Update($true,$true,$false,$true,$false,$true)) 0 'Movimento e Shift sem arraste'
Expect ($s.Update($true,$true,$true,$true,$false,$true)) 1 'Arraste confirmado mostra'
for($i=0;$i -lt 100;$i++){Expect ($s.Update($true,$false,$false,$true,$false,$false)) 0 'Overlay não causa piscar'}
Expect ($s.Update($true,$false,$false,$false,$false,$true)) -1 'Soltar Shift oculta'
Expect ($s.Update($true,$true,$false,$true,$false,$true)) 1 'Pressionar de novo na mesma sessão'
Expect ($s.Update($false,$true,$false,$true,$false,$true)) -1 'Soltar mouse encerra'
Expect ($s.Update($true,$true,$false,$true,$false,$true)) 0 'Novo clique não herda confirmação'
Expect ($s.Update($true,$true,$true,$true,$false,$true)) 1 'Novo arraste reconhecido'
Expect ($s.Update($true,$false,$false,$true,$true,$true)) -1 'Escape cancela'
Expect ($s.Update($true,$true,$true,$true,$false,$true)) 0 'Cancelamento fica válido até soltar mouse'
[void]$s.Update($false,$false,$false,$false,$false,$false)
Expect ($s.Update($true,$false,$true,$true,$false,$true)) 0 'Arraste de outro aplicativo não ativa'
Write-Output 'Estado nativo: sem piscar, Shift momentâneo, reativação, cancelamento e origem restrita aprovados.'
