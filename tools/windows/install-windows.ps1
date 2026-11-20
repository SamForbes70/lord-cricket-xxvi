# Installs Lord Cricket XXVI for the current Windows user (owner order of 20 November 2026, step 6: a free, unsigned
# installer). Copies the unzipped game to a per-user folder, adds Start menu and desktop shortcuts with the game's icon,
# and registers it under Settings > Apps for this user only, so no administrator rights are needed. Run it again to
# update in place. -Uninstall removes the program, its shortcuts and its Apps entry; saves live in the browser and are
# not touched.
#
# The shortcut folders and the registry key can be overridden so the Windows CI job can test a full install and
# uninstall without touching the runner's real desktop.
param(
  [switch]$Uninstall,
  [string]$Destination = (Join-Path $env:LOCALAPPDATA 'Programs\LordCricketXXVI'),
  [string[]]$ShortcutFolders = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')),
  [string]$RegistryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LordCricketXXVI',
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$ShortcutName = 'Lord Cricket XXVI.lnk'

function Say([string]$Text) {
  if (-not $Quiet) { Write-Host $Text }
}

function Stop-RunningGame([string]$Folder) {
  $starter = Join-Path $Folder 'start-windows.ps1'
  if (Test-Path -LiteralPath $starter) {
    try {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $starter -Stop | Out-Null
    } catch {
      # Nothing was running.
    }
  }
}

function Remove-Shortcuts {
  foreach ($folder in $ShortcutFolders) {
    if (-not $folder) { continue }
    $path = Join-Path $folder $ShortcutName
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }
}

if ($Uninstall) {
  Stop-RunningGame $Destination
  Remove-Shortcuts
  if (Test-Path -LiteralPath $RegistryKey) { Remove-Item -LiteralPath $RegistryKey -Recurse -Force }
  if (Test-Path -LiteralPath $Destination) {
    # This script may be running from inside the folder; PowerShell has already read it, so the folder can go.
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  Say 'Lord Cricket XXVI has been removed. Your saves stay in your browser until you clear them there.'
  exit 0
}

$Source = $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Source 'index.html'))) {
  throw "Run this from the unzipped game folder: index.html was not found in $Source."
}

$sourceFull = [System.IO.Path]::GetFullPath($Source).TrimEnd('\')
$destinationFull = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')
if ($sourceFull -ne $destinationFull) {
  Stop-RunningGame $Destination
  if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

$exe = Join-Path $Destination 'LordCricketXXVI.exe'
$bat = Join-Path $Destination 'Play-Lord-Cricket.bat'
$target = if (Test-Path -LiteralPath $exe) { $exe } else { $bat }
$icon = Join-Path $Destination 'lord-cricket.ico'

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $ShortcutFolders) {
  if (-not $folder) { continue }
  if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
  $link = $shell.CreateShortcut((Join-Path $folder $ShortcutName))
  $link.TargetPath = $target
  $link.WorkingDirectory = $Destination
  $link.Description = 'Lord Cricket XXVI: offline cricket management'
  if (Test-Path -LiteralPath $icon) { $link.IconLocation = "$icon,0" }
  if (-not $target.EndsWith('.exe')) { $link.WindowStyle = 7 }
  $link.Save()
}

$version = 'local build'
$versionFile = Join-Path $Destination 'VERSION.txt'
if (Test-Path -LiteralPath $versionFile) {
  $first = Get-Content -LiteralPath $versionFile -TotalCount 1
  if ($first) { $version = $first.Trim() }
}
$installer = Join-Path $Destination 'install-windows.ps1'
New-Item -Path $RegistryKey -Force | Out-Null
$values = @{
  DisplayName = 'Lord Cricket XXVI'
  DisplayVersion = $version
  Publisher = 'Lord Cricket XXVI (personal build)'
  InstallLocation = $Destination
  DisplayIcon = $icon
  UninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$installer`" -Uninstall"
  NoModify = 1
  NoRepair = 1
}
foreach ($name in $values.Keys) {
  $type = if ($values[$name] -is [int]) { 'DWord' } else { 'String' }
  New-ItemProperty -Path $RegistryKey -Name $name -Value $values[$name] -PropertyType $type -Force | Out-Null
}

Say "Installed Lord Cricket XXVI to $Destination."
Say 'Start it from the Start menu or the desktop shortcut. Remove it from Settings > Apps.'
