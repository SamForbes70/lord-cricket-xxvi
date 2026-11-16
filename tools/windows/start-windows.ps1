param()
$ErrorActionPreference = 'Stop'
$GameDir = $PSScriptRoot
if (-not (Test-Path (Join-Path $GameDir 'index.html'))) {
    $repoDist = [IO.Path]::GetFullPath((Join-Path $GameDir '..\..\apps\web\dist'))
    if (Test-Path (Join-Path $repoDist 'index.html')) { $GameDir = $repoDist }
}
if (-not (Test-Path (Join-Path $GameDir 'index.html'))) {
    throw "Cannot find the built game (index.html). Extract the entire ZIP first."
}

$exe = Join-Path $GameDir 'LordCricketXXVI.exe'
$url = 'http://127.0.0.1:4180/'
if (Test-Path -LiteralPath $exe) {
    Start-Process -FilePath $exe -WorkingDirectory $GameDir
    return
}

function Open-When-Ready {
    param([int]$Attempts = 25)
    for ($i = 0; $i -lt $Attempts; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $response = Invoke-WebRequest -Uri ($url + '__lcxxvi-health') -UseBasicParsing -TimeoutSec 1
            if ($response.Content -eq 'LORD_CRICKET_XXVI_LAUNCHER_V1') { Start-Process $url; return }
        } catch {}
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { Start-Process $url; return }
        } catch {}
    }
    Write-Warning "The server did not become ready at $url. Port 4180 may be in use."
}

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $versionText = (& $nodeCmd.Source --version 2>$null)
    if ($LASTEXITCODE -eq 0 -and $versionText -match '^v(\d+)\.') {
        if ([int]$Matches[1] -ge 18 -and (Test-Path (Join-Path $GameDir 'serve.mjs'))) {
            Start-Process -FilePath $nodeCmd.Source -ArgumentList @('serve.mjs','4180') -WorkingDirectory $GameDir
            Open-When-Ready
            return
        }
    }
}

$pyCandidates = @(Get-Command python.exe, python3.exe -All -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -and $_.Source -notmatch '(?i)\\WindowsApps\\' })
foreach ($py in $pyCandidates) {
    try {
        $pyVersion = (& $py.Source --version 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $pyVersion -notmatch '^Python\s+3\.') { continue }
        Start-Process -FilePath $py.Source -ArgumentList @('-m','http.server','4180','--bind','127.0.0.1','--directory',('"' + $GameDir + '"')) -WorkingDirectory $GameDir
        Open-When-Ready
        return
    } catch { continue }
}

$builder = Join-Path $PSScriptRoot 'build-exe.ps1'
if (Test-Path -LiteralPath $builder) {
    & $builder -OutFile $exe
    Start-Process -FilePath $exe -WorkingDirectory $GameDir
    return
}
throw "No runnable launcher found. Download the Windows release ZIP containing LordCricketXXVI.exe."
