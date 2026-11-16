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
  $edgeCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($edgeCandidates.Count -gt 0) {
    Start-Process -FilePath $edgeCandidates[0] -ArgumentList "--app=$Url" | Out-Null
    return
  }

  $chromeCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($chromeCandidates.Count -gt 0) {
    Start-Process -FilePath $chromeCandidates[0] -ArgumentList "--app=$Url" | Out-Null
    return
  }

  Start-Process $Url | Out-Null
}

if ($Stop) {
  $h = Get-ServerHealth
  if ($h) {
    try { Invoke-RestMethod -Uri $ShutdownUrl -Method Post -TimeoutSec 3 | Out-Null } catch {}
    Write-Host "Stopped Lord Cricket XXVI server on $BaseUrl."
  } else {
    Write-Host "No running server found on $BaseUrl."
  }
  exit 0
}

if (Get-ServerHealth) {
  Write-Host "Lord Cricket XXVI is already running at $BaseUrl - opening window."
  Open-GameWindow "$BaseUrl/"
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
      Open-GameWindow "$BaseUrl/"
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
  Open-GameWindow "$BaseUrl/"
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
  & $csc /nologo /optimize+ /target:winexe /out:$exePath /r:System.Windows.Forms.dll /r:System.Drawing.dll $csPath
}

if (Test-Path $exePath) {
  Start-Process -FilePath $exePath -WorkingDirectory $GameRoot | Out-Null
  exit 0
}

throw 'Unable to start local HTTP server: install Node.js 18+ or run Build-Exe.bat on Windows.'
