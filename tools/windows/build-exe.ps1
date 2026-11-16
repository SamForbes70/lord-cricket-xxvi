param([string]$OutFile = "")
$ErrorActionPreference = 'Stop'

$SourceCs = Join-Path $PSScriptRoot 'LordCricketLauncher.cs'
if (-not (Test-Path -LiteralPath $SourceCs)) { throw "Launcher source missing: $SourceCs" }
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([string]::IsNullOrWhiteSpace($OutFile)) {
    if (Test-Path (Join-Path $PSScriptRoot 'index.html')) {
        $OutFile = Join-Path $PSScriptRoot 'LordCricketXXVI.exe'
    } else {
        $OutFile = Join-Path $RepoRoot 'LordCricketXXVI.exe'
    }
}
$OutFile = [IO.Path]::GetFullPath($OutFile)
$CscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$Csc = $CscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $Csc) { throw 'Windows .NET Framework 4.x csc.exe not found. Use the prebuilt release ZIP instead.' }
$TargetDir = Split-Path -Parent $OutFile
if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null }
& $Csc '/nologo' '/optimize+' '/langversion:5' '/target:winexe' '/platform:anycpu' ("/out:" + $OutFile) '/r:System.Windows.Forms.dll' '/r:System.Drawing.dll' $SourceCs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutFile)) {
    throw "The Windows launcher failed to compile (csc exit code $LASTEXITCODE)."
}
Write-Host "Built $OutFile"
