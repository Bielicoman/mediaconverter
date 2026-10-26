# Decodifica uma imagem pelo Windows Imaging Component e grava PNG.
# Cobre HEIC/HEIF (com a extensão "Extensões de Imagem HEIF" da Microsoft Store) e JPEG XR.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName PresentationCore
  $inFull = (Resolve-Path -LiteralPath $In).ProviderPath
  $stream = [IO.File]::OpenRead($inFull)
  try {
    $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($stream, [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
    $frame = $decoder.Frames[0]
    $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($frame))
    $outStream = [IO.File]::Create($Out)
    try { $encoder.Save($outStream) } finally { $outStream.Dispose() }
    Write-Output (@{ ok = $true; width = $frame.PixelWidth; height = $frame.PixelHeight } | ConvertTo-Json -Compress)
  } finally { $stream.Dispose() }
} catch {
  $msg = $_.Exception.Message
  if ($msg -match '0x88982F50|componente|component') { $msg = 'O Windows não tem o decodificador deste formato. Para HEIC, instale "Extensões de Imagem HEIF" na Microsoft Store.' }
  [Console]::Error.WriteLine($msg)
  exit 1
}
