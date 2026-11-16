param(
  [switch]$StartMenu
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ExePath = Join-Path $RepoRoot 'LordCricketXXVI.exe'
$BatPath = Join-Path $RepoRoot 'Play-Lord-Cricket.bat'
$Target = if (Test-Path $ExePath) { $ExePath } else { $BatPath }

if (-not (Test-Path $Target)) {
  throw "Launcher target not found at $Target"
}

$Shell = New-Object -ComObject WScript.Shell
$DesktopDir = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopDir 'Lord Cricket XXVI.lnk'
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Target
$Shortcut.WorkingDirectory = $RepoRoot
$Shortcut.Description = 'Launch Lord Cricket XXVI (local offline management career)'
if (-not $Target.EndsWith('.exe')) { $Shortcut.WindowStyle = 7 }
$Shortcut.Save()
Write-Host "Created Desktop shortcut: $ShortcutPath"

if ($StartMenu) {
  $ProgramsDir = [Environment]::GetFolderPath('Programs')
  $MenuPath = Join-Path $ProgramsDir 'Lord Cricket XXVI.lnk'
  $MenuShortcut = $Shell.CreateShortcut($MenuPath)
  $MenuShortcut.TargetPath = $Target
  $MenuShortcut.WorkingDirectory = $RepoRoot
  $MenuShortcut.Description = 'Launch Lord Cricket XXVI (local offline management career)'
  if (-not $Target.EndsWith('.exe')) { $MenuShortcut.WindowStyle = 7 }
  $MenuShortcut.Save()
  Write-Host "Created Start Menu shortcut: $MenuPath"
}
