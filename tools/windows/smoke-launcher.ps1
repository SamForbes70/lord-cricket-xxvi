param([string]$GameDir = "")
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($GameDir)) {
    $GameDir = Join-Path $PSScriptRoot '..\..\apps\web\dist'
}
$GameDir = [IO.Path]::GetFullPath($GameDir)
$exe = Join-Path $GameDir 'LordCricketXXVI.exe'
if (-not (Test-Path $exe)) { throw "Native Windows EXE is missing: $exe" }
if (-not (Test-Path (Join-Path $GameDir 'index.html'))) { throw 'Built index.html is missing' }

$env:LCXXVI_NO_TRAY = '1'
$env:LCXXVI_NO_BROWSER = '1'
$base = 'http://127.0.0.1:4180'
$proc = Start-Process -FilePath $exe -WorkingDirectory $GameDir -PassThru
try {
    $ready = $false
    for ($n = 0; $n -lt 50; $n++) {
        Start-Sleep -Milliseconds 200
        if ($proc.HasExited) { throw "Launcher exited unexpectedly with code $($proc.ExitCode)" }
        try {
            $health = Invoke-WebRequest -UseBasicParsing -Uri "$base/__lcxxvi-health" -TimeoutSec 1
            if ($health.Content -eq 'LORD_CRICKET_XXVI_LAUNCHER_V1') { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { throw 'FAIL: health endpoint not ready' }
    Write-Host 'PASS health endpoint and binding'

    $home = Invoke-WebRequest -UseBasicParsing -Uri "$base/" -TimeoutSec 5
    if ($home.StatusCode -ne 200 -or $home.Headers['Content-Type'] -notlike '*text/html*') { throw 'FAIL: root HTML' }
    if ($home.Headers['X-Content-Type-Options'] -ne 'nosniff') { throw 'FAIL: nosniff header' }
    if ($home.Headers['Cache-Control'] -ne 'no-store') { throw 'FAIL: cache policy' }
    Write-Host 'PASS HTML and security headers'

    $head = Invoke-WebRequest -UseBasicParsing -Method Head -Uri "$base/index.html" -TimeoutSec 5
    if ($head.StatusCode -ne 200) { throw 'FAIL: HEAD request' }
    Write-Host 'PASS HEAD request'

    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$base/LordCricketXXVI.exe" -TimeoutSec 5 | Out-Null
        throw 'FAIL: executable was served over HTTP'
    } catch [System.Net.WebException] {
        if ([int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }
    Write-Host 'PASS executable denied'

    try {
        Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$base/__lcxxvi-shutdown" -TimeoutSec 5 | Out-Null
        throw 'FAIL: shutdown accepted without control header'
    } catch [System.Net.WebException] {
        if ([int]$_.Exception.Response.StatusCode -ne 403) { throw }
    }
    Write-Host 'PASS unauthorised shutdown denied'

    $second = Start-Process -FilePath $exe -WorkingDirectory $GameDir -PassThru
    try {
        if (-not $second.WaitForExit(5000)) { throw 'FAIL: duplicate launcher process did not exit' }
    } finally {
        if (-not $second.HasExited) { Stop-Process -Id $second.Id -Force }
    }
    $again = Invoke-WebRequest -UseBasicParsing -Uri "$base/__lcxxvi-health" -TimeoutSec 5
    if ($again.Content -ne 'LORD_CRICKET_XXVI_LAUNCHER_V1') { throw 'FAIL: original instance died' }
    Write-Host 'PASS single instance reuse'

    $quit = Invoke-WebRequest -UseBasicParsing -Method Post -Headers @{ 'X-LCXXVI-Shutdown' = '1' } -Uri "$base/__lcxxvi-shutdown" -TimeoutSec 5
    if ($quit.StatusCode -ne 200 -or -not $proc.WaitForExit(6000)) {
        throw 'FAIL: graceful shutdown'
    }
    Write-Host 'PASS graceful shutdown'
} finally {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
}
