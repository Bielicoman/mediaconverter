# Converte pelo Microsoft Office instalado (automação COM). Não fecha instâncias do usuário:
# só chama Quit quando a instância usada aqui não tem outros documentos abertos.
param(
  [Parameter(Mandatory = $true)][ValidateSet('word', 'excel', 'powerpoint')][string]$App,
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][string]$Code
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Release($o) { if ($null -ne $o) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($o) } catch {} } }

$office = $null; $doc = $null; $failed = $false
try {
  $inFull = (Resolve-Path -LiteralPath $In).ProviderPath
  switch ($App) {
    'word' {
      $office = New-Object -ComObject Word.Application
      $office.AutomationSecurity = 3
      $office.Visible = $false
      $office.DisplayAlerts = 0
      $office.Options.ConfirmConversions = $false
      # Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles)
      $doc = $office.Documents.Open($inFull, $false, $true, $false)
      $fmt = [int]$Code
      if ($fmt -eq 2) {
        # SaveAs2(..., Encoding = 65001): texto em UTF-8.
        $m = [Type]::Missing
        $doc.SaveAs2($Out, $fmt, $m, $m, $false, $m, $m, $m, $m, $m, $m, 65001)
      } else {
        $doc.SaveAs2($Out, $fmt)
      }
    }
    'excel' {
      $office = New-Object -ComObject Excel.Application
      $office.AutomationSecurity = 3
      $office.Visible = $false
      $office.DisplayAlerts = $false
      $office.AskToUpdateLinks = $false
      # Open(Filename, UpdateLinks = 0, ReadOnly = True)
      $doc = $office.Workbooks.Open($inFull, 0, $true)
      if ($Code -eq 'pdf') { $doc.ExportAsFixedFormat(0, $Out) }
      else { $doc.SaveAs($Out, [int]$Code) }
    }
    'powerpoint' {
      $office = New-Object -ComObject PowerPoint.Application
      $office.AutomationSecurity = 3
      # Open(FileName, ReadOnly = msoTrue, Untitled = msoFalse, WithWindow = msoFalse)
      $doc = $office.Presentations.Open($inFull, -1, 0, 0)
      $doc.SaveAs($Out, [int]$Code)
    }
  }
  if (-not (Test-Path -LiteralPath $Out)) { throw 'O Office terminou sem gerar a saída.' }
} catch {
  $failed = $true
  [Console]::Error.WriteLine($_.Exception.Message)
} finally {
  if ($null -ne $doc) {
    try {
      if ($App -eq 'word') { $doc.Close([ref]0) } elseif ($App -eq 'excel') { $doc.Close($false) } else { $doc.Close() }
    } catch {}
    Release $doc; $doc = $null
  }
  if ($null -ne $office) {
    try {
      $open = switch ($App) { 'word' { $office.Documents.Count } 'excel' { $office.Workbooks.Count } default { $office.Presentations.Count } }
      if ($open -eq 0) { if ($App -eq 'word') { $office.Quit([ref]0) } else { $office.Quit() } }
    } catch {}
    Release $office; $office = $null
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
if ($failed) { exit 1 }
Write-Output (@{ ok = $true; out = $Out } | ConvertTo-Json -Compress)
