param(
    [Parameter(Mandatory = $true)]
    [string]$Branch,
    [string]$BaseBranch = "main",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$RepoRoot = "c:\red3d"
$WorktreeBase = "c:\red3d-worktrees"
$SafeName = $Branch -replace "[^a-zA-Z0-9_-]", "-"
$TargetPath = Join-Path $WorktreeBase $SafeName

Push-Location $RepoRoot
try {
    if ($Remove) {
        Write-Host "Eliminando worktree '$TargetPath'..." -ForegroundColor Yellow
        git worktree remove $TargetPath
        git worktree prune
        Write-Host "Worktree eliminado correctamente." -ForegroundColor Green
        exit 0
    }

    if (-not (Test-Path $WorktreeBase)) {
        New-Item -ItemType Directory -Path $WorktreeBase | Out-Null
    }

    $branchExists = git branch --list $Branch
    if ($branchExists) {
        Write-Host "Creando worktree para rama existente '$Branch' en '$TargetPath'..." -ForegroundColor Cyan
        git worktree add $TargetPath $Branch
    } else {
        Write-Host "Creando worktree con nueva rama '$Branch' desde '$BaseBranch' en '$TargetPath'..." -ForegroundColor Cyan
        git worktree add -b $Branch $TargetPath $BaseBranch
    }

    Write-Host "`nWorktree listo en: $TargetPath" -ForegroundColor Green
    Write-Host "Tu rama principal en $RepoRoot queda 100% protegida." -ForegroundColor Green
} finally {
    Pop-Location
}
