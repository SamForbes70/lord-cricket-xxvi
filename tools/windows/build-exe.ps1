param(
  [string]$OutFile = "",
  # Optional .ico to embed as the EXE's icon (scripts/make-icon.mjs draws the game's icon).
  [string]$Icon = ""
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SourceCs = Join-Path $PSScriptRoot 'LordCricketLauncher.cs'
if (-not (Test-Path $SourceCs)) {
  throw "Launcher source not found: $SourceCs"
}

if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = Join-Path $RepoRoot 'LordCricketXXVI.exe'
}

$CscCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$Csc = $CscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Csc) {
  throw 'Windows .NET Framework 4.x csc.exe was not found under %WINDIR%\Microsoft.NET.'
}

$OutDir = Split-Path -Parent $OutFile
if ($OutDir -and -not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

Write-Host "Compiling $OutFile using $Csc..."
$cscArgs = @('/nologo', '/optimize+', '/target:winexe', "/out:$OutFile")
if (-not [string]::IsNullOrWhiteSpace($Icon)) {
  if (-not (Test-Path -LiteralPath $Icon)) { throw "Icon not found: $Icon" }
  $cscArgs += "/win32icon:$((Resolve-Path -LiteralPath $Icon).Path)"
}
$cscArgs += @('/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', $SourceCs)
& $Csc @cscArgs
if ($LASTEXITCODE -ne 0) {
  throw 'csc.exe failed to compile LordCricketXXVI.exe'
}

Write-Host "Built $OutFile"
