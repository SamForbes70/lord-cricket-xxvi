# Lord Cricket XXVI: private GitHub publication and verification.
# Runs on the owner's Windows PC, via the user's own GitHub CLI web authorisation.
# Intentionally does not write credentials or request a personal access token.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$Owner = 'SamForbes70'
$Name = 'lord-cricket-xxvi'
$FullName = "$Owner/$Name"
$ExpectedHistoricalCommit = '5b8b9da990d657197fb56bbfd33152f87b875f5c'
$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Fail([string]$Reason) { Write-Host "`nSTOP: $Reason" -ForegroundColor Red; exit 1 }
function RunOrFail([string]$Description, [scriptblock]$Command) {
    Write-Host "`n$Description" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { Fail "$Description failed (exit code $LASTEXITCODE). No automatic retry or force-push." }
}
function RequireCommand([string]$NameToCheck,[string]$InstallUrl) {
    if (-not (Get-Command $NameToCheck -ErrorAction SilentlyContinue)) { Fail "$NameToCheck is not installed or not on PATH. Install from $InstallUrl, reopen Command Prompt, and rerun the launcher." }
}

Write-Host 'Lord Cricket XXVI: private GitHub repository setup' -ForegroundColor Green
Write-Host "Target: https://github.com/$FullName (PRIVATE)"
Write-Host "Source: $RepoPath"
RequireCommand 'git' 'https://git-scm.com/downloads/win'
RequireCommand 'gh' 'https://cli.github.com/'
Set-Location -LiteralPath $RepoPath
if (-not (Test-Path '.git\HEAD')) { Fail 'The source folder is not a Git repository. Check that the complete ZIP was extracted.' }
if ((git branch --show-current).Trim() -ne 'main') { Fail 'Expected main branch not checked out. Review the local checkout before proceeding.' }
if ($LASTEXITCODE -ne 0) { Fail 'Could not read Git branch.' }
$Dirty = @(git status --porcelain=v1)
if ($LASTEXITCODE -ne 0 -or $Dirty.Count -ne 0) { Fail 'The repository is not clean; review changes before publishing.' }
& git cat-file -e "${ExpectedHistoricalCommit}^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Fail 'Historical Pass 22 commit is missing.' }
& git merge-base --is-ancestor $ExpectedHistoricalCommit HEAD
if ($LASTEXITCODE -ne 0) { Fail 'Pass 22 is not an ancestor of HEAD. Will not publish the wrong history.' }
$CurrentCommit = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { Fail 'Could not obtain local HEAD commit.' }
$RemoteNames = @(git remote)
if ($RemoteNames.Count -gt 0) { Fail "Existing Git remote(s): $($RemoteNames -join ', '). No automatic overwrite. Inspect and publish manually." }

# Protect against accidentally committing obvious local credential file names.
$Tracked = @(git ls-files)
$Suspicious = @($Tracked | Where-Object {
    $_ -match '(^|/)(\.env(\.|$)|id_rsa($|\.)|id_ed25519($|\.)|.*\.pem$|.*\.p12$|.*\.key$|credentials\.json$|secrets?\.json$)'
})
if ($Suspicious.Count -gt 0) { Fail "Tracked credential-like files detected: $($Suspicious -join ', '). Review before publishing." }

Write-Host "Local Git HEAD: $CurrentCommit"
Write-Host 'Authentication will open your browser. Never paste authentication codes or tokens into this chat.'
& gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
    RunOrFail 'Sign in to GitHub via browser' { gh auth login --hostname github.com --git-protocol https --web }
}
$ActualOwner = (& gh api user --jq '.login')
if ($LASTEXITCODE -ne 0) { Fail 'Could not read authenticated GitHub identity. Please check gh auth status.' }
$ActualOwner = ($ActualOwner | Out-String).Trim()
if ($ActualOwner -cne $Owner) { Fail "Logged into '$ActualOwner', expected '$Owner'. Switch GitHub CLI account before publishing." }

# A pre-existing destination needs manual review. Do not push or overwrite.
& gh repo view $FullName --json nameWithOwner *> $null
if ($LASTEXITCODE -eq 0) { Fail "Destination $FullName already exists. Review it before choosing merge or push. Nothing was modified." }

Write-Host "`nCreating private repository, adding origin and pushing existing main history..." -ForegroundColor Cyan
& gh repo create $FullName --private --source . --remote origin --push --description 'Lord Cricket XXVI: deterministic statistical cricket management simulator'
if ($LASTEXITCODE -ne 0) { Fail 'GitHub repository creation or push failed. Inspect GitHub and git remote -v before any retry.' }
$Visibility = ((& gh repo view $FullName --json visibility --jq '.visibility') | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $Visibility -ne 'PRIVATE') { Fail "Could not confirm PRIVATE visibility (reported '$Visibility'). Inspect GitHub settings immediately." }
$RemoteHead = (& git ls-remote --heads origin main)
if ($LASTEXITCODE -ne 0 -or -not $RemoteHead) { Fail 'Could not verify remote main branch.' }
$RemoteHash = (($RemoteHead | Select-Object -First 1) -split '\s+')[0]
if ($RemoteHash -ne $CurrentCommit) { Fail "Remote main does not match local HEAD. Local $CurrentCommit remote $RemoteHash" }
$ExpectedUrl = "https://github.com/$FullName"
Write-Host "`nSUCCESS: $ExpectedUrl" -ForegroundColor Green
Write-Host 'Visibility: PRIVATE'
Write-Host "Main commit: $RemoteHash"
Write-Host 'Existing Pass 22 history has been preserved.'
Write-Host 'Next: open the Lord_Cricket_XXVI folder in Codex desktop, then connect repository in Codex Cloud.'
Write-Host 'Local Codex instructions: PUBLISH_TO_GITHUB_AND_OPEN_CODEX.md'
Start-Process $ExpectedUrl
Start-Process 'https://chatgpt.com/codex'
exit 0
