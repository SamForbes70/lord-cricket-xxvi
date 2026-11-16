param(
  [string]$OutFile = ""
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
& $Csc /nologo /optimize+ /target:winexe /out:$OutFile /r:System.Windows.Forms.dll /r:System.Drawing.dll $SourceCs
if ($LASTEXITCODE -ne 0) {
  throw 'csc.exe failed to compile LordCricketXXVI.exe'
}

Write-Host "Built $OutFile"
