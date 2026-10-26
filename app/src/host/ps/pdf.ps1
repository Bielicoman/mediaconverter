# Renderiza cada página de um PDF em PNG com Windows.Data.Pdf (WinRT, Windows 10 ou superior).
# Saída: uma pasta com pagina-001.png, pagina-002.png... JSON com a lista no stdout.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [double]$Scale = 2.0,
  [string]$Prefix = 'pagina',
  [string]$Pages = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
  $asTaskOp = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $asTaskAction = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
  function Await($op, [Type]$type) {
    $task = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(-1)
    $task.Result
  }
  function AwaitAction($op) { $task = $asTaskAction.Invoke($null, @($op)); [void]$task.Wait(-1) }

  [void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  [void][Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
  [void][Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

  $inFull = (Resolve-Path -LiteralPath $In).ProviderPath
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $outFull = (Resolve-Path -LiteralPath $OutDir).ProviderPath

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($inFull)) ([Windows.Storage.StorageFile])
  $pdf = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  if ($pdf.IsPasswordProtected) { throw 'O PDF está protegido por senha.' }
  $folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($outFull)) ([Windows.Storage.StorageFolder])
  $count = [int]$pdf.PageCount
  $digits = [Math]::Max(3, $count.ToString().Length)
  $written = @()
  $indices = New-Object 'System.Collections.Generic.List[int]'
  if ([string]::IsNullOrWhiteSpace($Pages)) { for ($n = 0; $n -lt $count; $n++) { $indices.Add($n) } }
  else {
    foreach ($token in $Pages.Split(',')) {
      if ($token.Trim() -notmatch '^(\d+)(?:\s*-\s*(\d+))?$') { throw 'Intervalo de paginas invalido.' }
      $a = [int]$Matches[1]; $b = $a; if ($Matches[2]) { $b = [int]$Matches[2] }
      if ($a -lt 1 -or $b -lt $a -or $b -gt $count) { throw 'Paginas fora do documento.' }
      for ($n = $a; $n -le $b; $n++) { if (-not $indices.Contains($n - 1)) { $indices.Add($n - 1) } }
    }
  }
  $done = 0
  foreach ($i in $indices) {
    $page = $pdf.GetPage([uint32]$i)
    $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $opts.DestinationWidth = [uint32][Math]::Round($page.Size.Width * $Scale)
    $opts.DestinationHeight = [uint32][Math]::Round($page.Size.Height * $Scale)
    $name = '{0}-{1}.png' -f $Prefix, ($i + 1).ToString().PadLeft($digits, '0')
    $target = Await ($folder.CreateFileAsync($name, [Windows.Storage.CreationCollisionOption]::GenerateUniqueName)) ([Windows.Storage.StorageFile])
    $stream = Await ($target.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
    try { AwaitAction ($page.RenderToStreamAsync($stream, $opts)) } finally { $stream.Dispose(); $page.Dispose() }
    $written += $target.Path
    $done++; [Console]::Error.WriteLine(("progress {0}/{1}" -f $done, $indices.Count))
  }
  Write-Output (@{ ok = $true; pages = $indices.Count; files = $written } | ConvertTo-Json -Compress)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
