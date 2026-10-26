param([string]$Modifier = 'Shift')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class McGesture {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
  public static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
  public delegate void WinEventProc(IntPtr hook,uint evt,IntPtr hwnd,int obj,int child,uint thread,uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr mod,WinEventProc callback,uint pid,uint tid,uint flags);
  [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,System.Text.StringBuilder text,int count);
  static WinEventProc callback=OnEvent;
  public static bool Active=false;
  public static int Session=0;
  static bool ShellOrigin(IntPtr hwnd){
    if(hwnd==IntPtr.Zero)hwnd=GetForegroundWindow();
    uint pid;GetWindowThreadProcessId(hwnd,out pid);
    try{if(!String.Equals(System.Diagnostics.Process.GetProcessById((int)pid).ProcessName,"explorer",StringComparison.OrdinalIgnoreCase))return false;}catch{return false;}
    var name=new System.Text.StringBuilder(256);GetClassName(GetForegroundWindow(),name,256);
    string c=name.ToString();return c=="CabinetWClass"||c=="ExploreWClass"||c=="Progman"||c=="WorkerW";
  }
  static void OnEvent(IntPtr hook,uint evt,IntPtr hwnd,int obj,int child,uint thread,uint time){
    if(evt==15){Active=false;return;}
    if(evt==14){Active=Down(1)&&ShellOrigin(hwnd);Session++;}
  }
  public static IntPtr Start(){return SetWinEventHook(14,15,IntPtr.Zero,callback,0,0,0);}
  public static bool OverShell(){Point p;GetCursorPos(out p);return ShellOrigin(GetAncestor(WindowFromPoint(p),2));}
}
'@
$hook=[McGesture]::Start()
if($hook -eq [IntPtr]::Zero){throw 'Não foi possível observar eventos de arraste.'}
$down = $false; $fired = $false; $x = 0; $y = 0; $session=-1
Write-Output '{"ready":true}'
while ($true) {
  [Windows.Forms.Application]::DoEvents()
  if($session -ne [McGesture]::Session){$session=[McGesture]::Session;$fired=$false}
  $left = [McGesture]::Down(1)
  $p = New-Object McGesture+Point
  [void][McGesture]::GetCursorPos([ref]$p)
  if ($left -and -not $down) { $x = $p.X; $y = $p.Y; $fired = $false }
  if ($left -and [McGesture]::Active -and -not $fired) {
    $mod = [McGesture]::Down(16)
    if ($Modifier -eq 'Ctrl+Shift') { $mod = $mod -and [McGesture]::Down(17) }
    if ($mod -and [McGesture]::OverShell() -and ([Math]::Abs($p.X - $x) + [Math]::Abs($p.Y - $y) -gt 14)) {
      Write-Output '{"gesture":"drag","source":"shell-event"}'; $fired = $true
    }
  }
  if ($fired -and (-not $left -or -not [McGesture]::Active)) { Write-Output '{"gesture":"release"}'; $fired=$false; [McGesture]::Active=$false }
  $down = $left
  Start-Sleep -Milliseconds 32
}
