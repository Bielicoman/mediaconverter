# Compacta arquivos em um ZIP ou extrai um ZIP, com System.IO.Compression (sem limite de 2 GB do Compress-Archive).
param(
  [Parameter(Mandatory = $true)][ValidateSet('compress', 'extract')][string]$Op,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$ListFile,
  [string]$In
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if ($Op -eq 'compress') {
    $items = Get-Content -LiteralPath $ListFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() }
    $zip = [IO.Compression.ZipFile]::Open($Out, [IO.Compression.ZipArchiveMode]::Create)
    $used = @{}
    try {
      $n = 0
      foreach ($item in $items) {
        $n++
        if (Test-Path -LiteralPath $item -PathType Container) {
          $root = (Resolve-Path -LiteralPath $item).ProviderPath.TrimEnd('\')
          $parent = Split-Path $root -Parent
          Get-ChildItem -LiteralPath $root -Recurse -File -Force | ForEach-Object {
            $entry = $_.FullName.Substring($parent.Length + 1).Replace('\', '/')
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry, [IO.Compression.CompressionLevel]::Optimal)
          }
        } else {
          $name = Split-Path $item -Leaf
          $entry = $name; $k = 2
          while ($used.ContainsKey($entry.ToLower())) { $entry = [IO.Path]::GetFileNameWithoutExtension($name) + " ($k)" + [IO.Path]::GetExtension($name); $k++ }
          $used[$entry.ToLower()] = $true
          [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item, $entry, [IO.Compression.CompressionLevel]::Optimal)
        }
        [Console]::Error.WriteLine(('progress {0}/{1}' -f $n, $items.Count))
      }
    } finally { $zip.Dispose() }
  } else {
    if (Test-Path -LiteralPath $Out) { throw 'A pasta de destino já existe.' }
    New-Item -ItemType Directory -Path $Out | Out-Null
    $archive = [IO.Compression.ZipFile]::OpenRead($In)
    try {
      $root = [IO.Path]::GetFullPath($Out).TrimEnd('\') + '\'
      foreach ($e in $archive.Entries) {
        $dest = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $e.FullName))
        # Bloqueia entradas com ..\ que sairiam da pasta (zip slip).
        if (-not $dest.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw "Entrada insegura no ZIP: $($e.FullName)" }
        if ($e.FullName.EndsWith('/')) { New-Item -ItemType Directory -Force -Path $dest | Out-Null; continue }
        New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $false)
      }
    } finally { $archive.Dispose() }
  }
  Write-Output (@{ ok = $true; out = $Out } | ConvertTo-Json -Compress)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
