param(
  [int]$Port = 4180,
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$GameRoot = $PSScriptRoot
$BaseUrl = "http://127.0.0.1:$Port"
$HealthUrl = "$BaseUrl/__lcxxvi-health"
$ShutdownUrl = "$BaseUrl/__lcxxvi-shutdown"
$StateDir = Join-Path $env:LOCALAPPDATA 'LordCricketXXVI'
$LogOut = Join-Path $StateDir 'portable-server.out.log'
$LogErr = Join-Path $StateDir 'portable-server.err.log'

function Get-ServerHealth {
  try {
    $resp = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 2
    if ($resp -and ($resp.app -eq 'lord-cricket-xxvi' -or $resp.status -eq 'ok')) {
      return $resp
    }
  } catch {
    return $null
  }
  return $null
}

function Open-GameWindow([string]$Url) {
  # Each candidate is checked before use, and the list is always an array: with a single match PowerShell would
  # otherwise return a string, and $list[0] would be its first character ("C"), which fails to start.
  $roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles, $env:LOCALAPPDATA) | Where-Object { $_ }
  $browsers = @()
  foreach ($relative in @('Microsoft\Edge\Application\msedge.exe', 'Google\Chrome\Application\chrome.exe')) {
    foreach ($root in $roots) {
      $candidate = Join-Path $root $relative
      if (Test-Path -LiteralPath $candidate) { $browsers += $candidate }
    }
  }
  foreach ($browser in $browsers) {
    try {
      Start-Process -FilePath $browser -ArgumentList "--app=$Url" -ErrorAction Stop | Out-Null
      return
    } catch {
      Write-Host "Could not open $browser ($($_.Exception.Message)); trying the next browser."
    }
  }
  try {
    Start-Process $Url -ErrorAction Stop | Out-Null
  } catch {
    Write-Host "The game is running. Open $Url in your web browser."
  }
}

if ($Stop) {
  $h = Get-ServerHealth
  if ($h) {
    try { Invoke-RestMethod -Uri $ShutdownUrl -Method Post -Headers @{ "X-LCXXVI-Shutdown" = "1" } -TimeoutSec 3 | Out-Null } catch {}
    Write-Host "Stopped Lord Cricket XXVI server on $BaseUrl."
  } else {
    Write-Host "No running server found on $BaseUrl."
  }
  exit 0
}

if (Get-ServerHealth) {
  Write-Host "Lord Cricket XXVI is already running at $BaseUrl - opening window."
  Open-GameWindow "$BaseUrl/#title"
  exit 0
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeOk = $false
if ($nodeCmd) {
  try {
    $major = [int]((& $nodeCmd.Source -p "process.versions.node.split('.')[0]").Trim())
    if ($major -ge 18) { $nodeOk = $true }
  } catch {}
}

if ($nodeOk -and (Test-Path (Join-Path $GameRoot 'serve.mjs'))) {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $env:PORT = "$Port"
  Start-Process -FilePath $nodeCmd.Source `
    -ArgumentList @('serve.mjs', "$Port") `
    -WorkingDirectory $GameRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogOut `
    -RedirectStandardError $LogErr | Out-Null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 200
    if (Get-ServerHealth) {
      Open-GameWindow "$BaseUrl/#title"
      Write-Host "Opened Lord Cricket XXVI at $BaseUrl (Node.js server)."
      exit 0
    }
  }
  throw "Node server failed to start on $BaseUrl. Check $LogErr."
}

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
$pythonReal = $null
if ($pythonCmd -and $pythonCmd.Source -notmatch '\\WindowsApps\\python(\.exe)?$') {
  try {
    $exe = (& $pythonCmd.Source -c "import sys; print(sys.executable)" 2>$null).Trim()
    if ($exe -and $exe -notmatch '\\WindowsApps\\') { $pythonReal = $exe }
  } catch {}
}

if ($pythonReal) {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  Start-Process -FilePath $pythonReal `
    -ArgumentList @('-m', 'http.server', "$Port", '--bind', '127.0.0.1') `
    -WorkingDirectory $GameRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogOut `
    -RedirectStandardError $LogErr | Out-Null
  Start-Sleep -Milliseconds 700
  Open-GameWindow "$BaseUrl/#title"
  Write-Host "Opened Lord Cricket XXVI at $BaseUrl (Python server)."
  exit 0
}

$cscCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$csPath = Join-Path $GameRoot 'LordCricketLauncher.cs'
$exePath = Join-Path $GameRoot 'LordCricketXXVI.exe'

if ((Test-Path $csPath) -and $csc -and -not (Test-Path $exePath)) {
  Write-Host 'Building native Windows launcher LordCricketXXVI.exe (first run only)...'
  $iconPath = Join-Path $GameRoot 'lord-cricket.ico'
  $iconArgs = @()
  if (Test-Path $iconPath) { $iconArgs = @("/win32icon:$iconPath") }
  & $csc /nologo /optimize+ /target:winexe /out:$exePath @iconArgs /r:System.Windows.Forms.dll /r:System.Drawing.dll $csPath
}

if (Test-Path $exePath) {
  Start-Process -FilePath $exePath -WorkingDirectory $GameRoot | Out-Null
  exit 0
}

throw 'Unable to start local HTTP server: install Node.js 18+ or run Build-Exe.bat on Windows.'
