# Checks the Windows launcher scripts without starting a server or a browser.
#  1. Every .ps1 in tools/windows parses.
#  2. Open-GameWindow in start-windows.ps1 (the game zip) and launch-repo.ps1 (a checkout) opens the single
#     installed browser it finds. With exactly one match, an unwrapped pipeline returns a string and indexing it gives
#     its first character ("C"), which Start-Process cannot find; this is the failure an owner hit on 20 November 2026.
#  3. When no browser is installed it falls back to the default browser, and when that fails it prints the address
#     instead of stopping the launch.
# Runs under Windows PowerShell 5.1 (what the .bat launchers use) and PowerShell 7.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$failures = 0

foreach ($file in Get-ChildItem -Path $here -Filter '*.ps1') {
  $tokens = $null; $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { Write-Host "PARSE FAIL $($file.Name): $($errors[0].Message)"; $failures++ } else { Write-Host "parse ok $($file.Name)" }
}

function Get-FunctionText([string]$Path, [string]$Name) {
  $tokens = $null; $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  $fn = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name }, $true) | Select-Object -First 1
  if (-not $fn) { throw "$Name not found in $Path" }
  return $fn.Extent.Text
}

$saved = @{ PF86 = ${env:ProgramFiles(x86)}; PF = $env:ProgramFiles; LAD = $env:LOCALAPPDATA }
$fake = Join-Path ([System.IO.Path]::GetTempPath()) ("lcxxvi-launcher-test-" + [guid]::NewGuid().ToString('N'))
try {
  foreach ($script in @('start-windows.ps1', 'launch-repo.ps1')) {
    $fnText = Get-FunctionText (Join-Path $here $script) 'Open-GameWindow'
    foreach ($case in @('single-edge', 'none', 'none-and-no-default')) {
      Remove-Item -Recurse -Force $fake -ErrorAction SilentlyContinue
      $pf86 = Join-Path $fake 'pf86'; $pf = Join-Path $fake 'pf'; $lad = Join-Path $fake 'lad'
      New-Item -ItemType Directory -Force -Path $pf86, $pf, $lad | Out-Null
      $edge = Join-Path $lad 'Microsoft\Edge\Application\msedge.exe'
      if ($case -eq 'single-edge') { New-Item -ItemType File -Force -Path $edge | Out-Null }
      ${env:ProgramFiles(x86)} = $pf86; $env:ProgramFiles = $pf; $env:LOCALAPPDATA = $lad
      $script:started = @()
      $script:failDefault = ($case -eq 'none-and-no-default')
      # Stand-in for Start-Process: record what would be started, and fail like Windows for a missing file.
      function Start-Process { param([string]$FilePath, $ArgumentList, $ErrorAction)
        if ($FilePath -like 'http*') {
          if ($script:failDefault) { throw 'no default browser' }
          $script:started += "url:$FilePath"; return
        }
        if (-not (Test-Path -LiteralPath $FilePath)) { throw 'The system cannot find the file specified.' }
        $script:started += "exe:$FilePath"
      }
      . ([scriptblock]::Create($fnText))
      $output = Open-GameWindow 'http://127.0.0.1:4180/' 6>&1 | Out-String
      $ok = switch ($case) {
        'single-edge' { $script:started.Count -eq 1 -and $script:started[0] -eq "exe:$edge" }
        'none' { $script:started.Count -eq 1 -and $script:started[0] -eq 'url:http://127.0.0.1:4180/' }
        'none-and-no-default' { $script:started.Count -eq 0 }
      }
      if ($ok) { Write-Host "ok $script $case" } else { Write-Host "FAIL $script $case started=$($script:started -join ';') $output"; $failures++ }
      Remove-Item function:Start-Process
    }
  }
} catch {
  Write-Host "FAIL: $($_.Exception.Message)"; $failures++
} finally {
  ${env:ProgramFiles(x86)} = $saved.PF86; $env:ProgramFiles = $saved.PF; $env:LOCALAPPDATA = $saved.LAD
  Remove-Item -Recurse -Force $fake -ErrorAction SilentlyContinue
}
# 4. The installer: a full per-user install and uninstall into temporary folders and a test registry key, so the
#    runner's real desktop, Start menu and Apps list are not touched.
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("lcxxvi-install-test-" + [guid]::NewGuid().ToString('N'))
$testKey = 'HKCU:\Software\LordCricketXXVI-InstallerTest'
try {
  $game = Join-Path $work 'game'; $dest = Join-Path $work 'installed'; $links = Join-Path $work 'links'
  New-Item -ItemType Directory -Force -Path $game, (Join-Path $game 'assets') | Out-Null
  Set-Content -LiteralPath (Join-Path $game 'index.html') -Value '<!doctype html>'
  Set-Content -LiteralPath (Join-Path $game 'assets\app.js') -Value '//'
  Set-Content -LiteralPath (Join-Path $game 'VERSION.txt') -Value "abc1234 test build`nsecond line"
  Set-Content -LiteralPath (Join-Path $game 'Play-Lord-Cricket.bat') -Value '@echo off'
  Copy-Item -LiteralPath (Join-Path $here 'install-windows.ps1') -Destination $game
  & (Join-Path $game 'install-windows.ps1') -Destination $dest -ShortcutFolders @($links) -RegistryKey $testKey -Quiet
  $checks = [ordered]@{
    'copied the game' = (Test-Path -LiteralPath (Join-Path $dest 'assets\app.js'))
    'created the shortcut' = (Test-Path -LiteralPath (Join-Path $links 'Lord Cricket XXVI.lnk'))
    'registered the app' = ((Get-ItemProperty -LiteralPath $testKey).DisplayName -eq 'Lord Cricket XXVI')
    'recorded the version' = ((Get-ItemProperty -LiteralPath $testKey).DisplayVersion -eq 'abc1234 test build')
    'points the uninstaller at the copy' = ((Get-ItemProperty -LiteralPath $testKey).UninstallString -like "*$dest*install-windows.ps1*-Uninstall*")
  }
  & (Join-Path $dest 'install-windows.ps1') -Uninstall -Destination $dest -ShortcutFolders @($links) -RegistryKey $testKey -Quiet
  $checks['removed the program'] = -not (Test-Path -LiteralPath $dest)
  $checks['removed the shortcut'] = -not (Test-Path -LiteralPath (Join-Path $links 'Lord Cricket XXVI.lnk'))
  $checks['removed the Apps entry'] = -not (Test-Path -LiteralPath $testKey)
  foreach ($name in $checks.Keys) {
    if ($checks[$name]) { Write-Host "ok installer $name" } else { Write-Host "FAIL installer $name"; $failures++ }
  }
} catch {
  Write-Host "FAIL installer: $($_.Exception.Message)"; $failures++
} finally {
  Remove-Item -LiteralPath $testKey -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failures -gt 0) { Write-Host "$failures launcher check(s) failed"; exit 1 }
Write-Host 'Launcher script checks passed'
