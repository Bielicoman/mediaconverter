param([string]$Modifier = 'Shift', [string]$DiagnosticsPath = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class McGesture {
  public sealed class HoldState {
    bool down, shellStart, confirmed, cancelled;
    public bool Visible { get; private set; }
    public int Update(bool left,bool shell,bool nativeDrag,bool modifier,bool escape,bool moved) {
      if(left&&!down){shellStart=shell;confirmed=false;cancelled=false;}
      if(left&&shellStart&&!cancelled&&nativeDrag&&moved)confirmed=true;
      if(left&&escape)cancelled=true;
      bool next=left&&confirmed&&!cancelled&&modifier;
      int transition=next==Visible?0:(next?1:-1);
      Visible=next;down=left;return transition;
    }
  }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string className,string title);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
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
  public static bool ShellImage(){
    IntPtr image=IntPtr.Zero;
    while((image=FindWindowEx(IntPtr.Zero,image,"SysDragImage",null))!=IntPtr.Zero){
      uint pid;GetWindowThreadProcessId(image,out pid);
      try{if(IsWindowVisible(image)&&String.Equals(System.Diagnostics.Process.GetProcessById((int)pid).ProcessName,"explorer",StringComparison.OrdinalIgnoreCase))return true;}catch{}
    }
    return false;
  }
}
'@
$hook=[McGesture]::Start()
if($hook -eq [IntPtr]::Zero){throw 'Não foi possível observar eventos de arraste.'}
$down = $false; $x = 0; $y = 0
$state=New-Object McGesture+HoldState
Write-Output '{"ready":true}'
while ($true) {
  [Windows.Forms.Application]::DoEvents()
  $left = [McGesture]::Down(1)
  $p = New-Object McGesture+Point
  [void][McGesture]::GetCursorPos([ref]$p)
  if ($left -and -not $down) { $x = $p.X; $y = $p.Y }
  # A própria roda pode ocultar SysDragImage. Depois da confirmação nativa,
  # a sessão segue válida até soltar o mouse ou cancelar; não depende da miniatura.
  $mod = [McGesture]::Down(16)
  if ($Modifier -eq 'Ctrl+Shift') { $mod = $mod -and [McGesture]::Down(17) }
  # A roda acompanha o modificador; soltar Shift não encerra a sessão de arraste.
  $nativeDrag=[McGesture]::Active -or [McGesture]::ShellImage()
  $moved=[Math]::Abs($p.X - $x) + [Math]::Abs($p.Y - $y) -gt 14
  $transition=$state.Update($left,[McGesture]::OverShell(),$nativeDrag,$mod,[McGesture]::Down(27),$moved)
  if ($transition -eq 1) { Write-Output '{"gesture":"drag","source":"shell-event"}' }
  if ($transition -eq -1) { Write-Output '{"gesture":"release"}' }
  if($DiagnosticsPath -and $transition -ne 0){[IO.File]::AppendAllText($DiagnosticsPath,('{"visible":'+$state.Visible.ToString().ToLower()+'}'+[Environment]::NewLine))}
  if (-not $left) { [McGesture]::Active=$false }
  $down = $left
  Start-Sleep -Milliseconds 32
}
