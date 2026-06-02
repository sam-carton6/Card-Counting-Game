# push.ps1
# Stage all changes, commit with a prompted message, and push.
#
# Usage:
#   .\push.ps1                    <- prompts you for a message
#   .\push.ps1 "my message here"  <- skips the prompt

param(
    [string]$Message = ""
)

# ── Show what's changed ──────────────────────────────────────────────────────

Write-Host ""
$status = git status --short
if (-not $status) {
    Write-Host "Nothing to commit — working tree is clean." -ForegroundColor Yellow
    exit 0
}

Write-Host "Changes to be committed:" -ForegroundColor Cyan
Write-Host $status
Write-Host ""

# ── Get commit message ───────────────────────────────────────────────────────

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = Read-Host "Commit message"
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Host "Aborted: commit message cannot be empty." -ForegroundColor Red
    exit 1
}

# ── Stage, commit, push ──────────────────────────────────────────────────────

git add -A

git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Push failed. Check your remote/credentials and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
