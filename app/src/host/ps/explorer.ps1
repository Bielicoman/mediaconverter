# Processo persistente: compila os tipos uma vez e responde comandos pela entrada padrão.
#   sel  → arquivos selecionados na janela do Explorador em primeiro plano (aba ativa),
#          na área de trabalho, ou, sem seleção, os arquivos copiados com Ctrl+C.
# Cada resposta é uma linha JSON.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies Microsoft.CSharp, System.Core -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class McShell {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static string Title(IntPtr h) { var sb = new StringBuilder(1024); GetWindowText(h, sb, 1024); return sb.ToString(); }
  public static string ClassOf(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
  static void Collect(dynamic view, List<string> list) {
    dynamic items = view.SelectedItems();
    int n = items.Count;
    for (int i = 0; i < n; i++) { string p = items.Item(i).Path; if (!String.IsNullOrEmpty(p)) list.Add(p); }
  }
  // Seleção na área de trabalho: IShellWindows.FindWindowSW com SWC_DESKTOP.
  public static List<string> Desktop() {
    var list = new List<string>();
    dynamic sh = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
    dynamic wins = sh.Windows();
    object loc = 0; object root = Type.Missing; int hwnd;
    dynamic desk = wins.FindWindowSW(ref loc, ref root, 8, out hwnd, 1);
    if (desk != null) Collect(desk.Document, list);
    return list;
  }
  // Janelas do Explorador com o mesmo HWND (abas do Windows 11). A aba ativa é a que dá nome à janela.
  public static List<string> Explorer(IntPtr fg, out int matched) {
    var list = new List<string>();
    matched = 0;
    string title = Title(fg);
    dynamic sh = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
    dynamic wins = sh.Windows();
    var candidates = new List<object>();
    foreach (dynamic w in wins) {
      try { if (new IntPtr((long)w.HWND) == fg) candidates.Add(w); } catch { }
    }
    matched = candidates.Count;
    dynamic chosen = null;
    if (candidates.Count == 1) chosen = candidates[0];
    else {
      foreach (dynamic w in candidates) {
        try { string name = w.LocationName; if (!String.IsNullOrEmpty(name) && title.StartsWith(name, StringComparison.OrdinalIgnoreCase)) { chosen = w; break; } } catch { }
      }
    }
    if (chosen != null) { try { Collect(chosen.Document, list); } catch { } }
    return list;
  }
}
"@

$script:reqId = '0'
# Cada resposta devolve o id do pedido ("sel|17"), para o processo principal casar pedido e resposta.
function Json($o) { $o['id'] = $script:reqId; [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

Json @{ ready = $true }
while ($true) {
  $raw = [Console]::In.ReadLine()
  if ($null -eq $raw -or $raw -eq 'exit') { break }
  $parts = $raw.Split('|')
  $line = $parts[0]
  $script:reqId = if ($parts.Count -gt 1) { $parts[1] } else { '0' }
  try {
    if ($line -eq 'sel' -or $line -eq 'drag') {
      $fg = [McShell]::GetForegroundWindow()
      $cls = [McShell]::ClassOf($fg)
      $files = @(); $source = 'none'; $matched = 0
      if ($cls -eq 'CabinetWClass' -or $cls -eq 'ExploreWClass') {
        $files = @([McShell]::Explorer($fg, [ref]$matched)); $source = 'explorer'
      } elseif ($cls -eq 'Progman' -or $cls -eq 'WorkerW') {
        $files = @([McShell]::Desktop()); $source = 'desktop'
      }
      if ($files.Count -eq 0 -and $line -ne 'drag') {
        $drop = [Windows.Forms.Clipboard]::GetFileDropList()
        if ($drop -and $drop.Count -gt 0) { $files = @($drop); $source = 'clipboard' }
      }
      Json @{ files = @($files); source = $source; window = $cls }
    } elseif ($line -eq 'dbg') {
      $fg = [McShell]::GetForegroundWindow()
      $sh = New-Object -ComObject Shell.Application
      $rows = @()
      foreach ($w in $sh.Windows()) {
        $n = -1; $err = ''
        try { $n = $w.Document.SelectedItems().Count } catch { $err = $_.Exception.Message }
        $rows += @{ hwnd = [long]$w.HWND; name = $w.LocationName; sel = $n; err = $err }
      }
      Json @{ fg = [long]$fg; title = [McShell]::Title($fg); cls = [McShell]::ClassOf($fg); windows = $rows }
    } elseif ($line -eq 'ping') {
      Json @{ pong = $true }
    } else {
      Json @{ error = "comando desconhecido: $line" }
    }
  } catch {
    Json @{ error = $_.Exception.Message; files = @() }
  }
}
