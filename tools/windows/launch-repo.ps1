param(
  [switch]$Rebuild,
  [switch]$Stop,
  [switch]$BrowserOnly,
  [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ($Port -le 0) {
  if ($env:PORT -and [int]::TryParse($env:PORT, [ref]$null)) {
    $Port = [int]$env:PORT
  } else {
    $Port = 4180
  }
}

$BaseUrl = "http://127.0.0.1:$Port"
$HealthUrl = "$BaseUrl/__lcxxvi-health"
$ShutdownUrl = "$BaseUrl/__lcxxvi-shutdown"
$StateDir = Join-Path $env:LOCALAPPDATA 'LordCricketXXVI'
$LogOut = Join-Path $StateDir 'server.out.log'
$LogErr = Join-Path $StateDir 'server.err.log'

function Get-ServerHealth {
  try {
    $resp = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 2
    if ($resp -and $resp.app -eq 'lord-cricket-xxvi') {
      return $resp
    }
  } catch {
    return $null
  }
  return $null
}

function Stop-RunningServer {
  $health = Get-ServerHealth
  if (-not $health) {
    Write-Host "No running Lord Cricket XXVI server found on port $Port."
    return $false
  }
  try {
    Invoke-RestMethod -Uri $ShutdownUrl -Method Post -Headers @{ "X-LCXXVI-Shutdown" = "1" } -TimeoutSec 3 | Out-Null
    Start-Sleep -Milliseconds 350
  } catch {
    if ($health.pid) {
      Stop-Process -Id ([int]$health.pid) -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host "Stopped Lord Cricket XXVI server on $BaseUrl."
  return $true
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

function Get-LocalBuildId {
  $manifestPath = Join-Path $RepoRoot 'apps\web\dist\offline-manifest.json'
  if (-not (Test-Path $manifestPath)) { return $null }
  try {
    $json = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
    return $json.buildId
  } catch {
    return $null
  }
}

function Test-BuildRequired {
  if ($Rebuild) { return $true }
  $distIndex = Join-Path $RepoRoot 'apps\web\dist\index.html'
  if (-not (Test-Path $distIndex)) { return $true }

  $packagesDir = Join-Path $RepoRoot 'packages'
  foreach ($pkg in (Get-ChildItem -Directory $packagesDir)) {
    if (-not (Test-Path (Join-Path $pkg.FullName 'dist'))) { return $true }
  }

  $distTime = (Get-Item $distIndex).LastWriteTimeUtc
  $watchRoots = @(
    (Join-Path $RepoRoot 'apps'),
    (Join-Path $RepoRoot 'packages')
  )
  foreach ($root in $watchRoots) {
    $newer = Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx,*.css,*.html,*.json | Where-Object {
      $_.FullName -notmatch '\\(dist|node_modules)\\' -and $_.LastWriteTimeUtc -gt $distTime
    } | Select-Object -First 1
    if ($newer) { return $true }
  }

  foreach ($cfg in @('package.json', 'tsconfig.json', 'tsconfig.base.json')) {
    $cfgPath = Join-Path $RepoRoot $cfg
    if ((Test-Path $cfgPath) -and ((Get-Item $cfgPath).LastWriteTimeUtc -gt $distTime)) {
      return $true
    }
  }
  return $false
}

if ($Stop) {
  Stop-RunningServer | Out-Null
  exit 0
}

if ($BrowserOnly) {
  if (Get-ServerHealth) {
    Open-GameWindow "$BaseUrl/#title"
    exit 0
  }
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  throw 'Node.js 22.12.0 or later is required to run from the source checkout. Install Node.js LTS from https://nodejs.org/ or use a packaged LordCricketXXVI build.'
}

$nodeVerRaw = (& $nodeCmd.Source -p "process.versions.node").Trim()
$parts = $nodeVerRaw.Split('.') | ForEach-Object { [int]$_ }
if ($parts[0] -lt 22 -or ($parts[0] -eq 22 -and $parts[1] -lt 12)) {
  throw "Node.js $nodeVerRaw detected, but >= 22.12.0 is required. Update Node.js from https://nodejs.org/."
}

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCmd) {
  throw 'npm was not found on PATH alongside Node.js.'
}

Push-Location $RepoRoot
try {
  if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    Write-Host 'Installing workspace dependencies (first run only)...'
    & $npmCmd.Source ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
  }

  $needsBuild = Test-BuildRequired
  if ($needsBuild) {
    Write-Host 'Building Lord Cricket XXVI...'
    & $npmCmd.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
  }
} finally {
  Pop-Location
}

$desiredBuildId = Get-LocalBuildId
$running = Get-ServerHealth
if ($running) {
  if ($Rebuild -or ($desiredBuildId -and $running.buildId -and $running.buildId -ne $desiredBuildId)) {
    Write-Host 'Restarting existing server to serve updated build...'
    Stop-RunningServer | Out-Null
  } else {
    Write-Host "Lord Cricket XXVI is already running at $BaseUrl - opening window."
    Open-GameWindow "$BaseUrl/#title"
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$env:PORT = "$Port"
Write-Host "Starting Lord Cricket XXVI server on $BaseUrl..."
Start-Process -FilePath $nodeCmd.Source `
  -ArgumentList 'start.mjs' `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $LogOut `
  -RedirectStandardError $LogErr | Out-Null

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  if (Get-ServerHealth) {
    $ready = $true
    break
  }
}

if (-not $ready) {
  $errText = if (Test-Path $LogErr) { Get-Content -Raw $LogErr } else { '' }
  throw "Server did not become ready on $BaseUrl. Check port $Port or $LogErr. $errText"
}

Open-GameWindow "$BaseUrl/#title"
Write-Host "Opened Lord Cricket XXVI at $BaseUrl."
Write-Host "To stop the background server later, run tools\windows\Stop-Lord-Cricket.bat."
