; Ao desinstalar, remove a integração criada pelo app (menu do botão direito, Enviar para e
; início automático), toda no perfil do usuário. Preferências em %APPDATA%\MediaConverter ficam.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\MediaConverter"
  Delete "$APPDATA\Microsoft\Windows\SendTo\Media Converter (roda rápida).lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Media Converter"
!macroend
