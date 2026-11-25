$ErrorActionPreference = "Continue"
$Root = "c:\red3d"
$Python = "$Root\.venv\Scripts\python.exe"
$Failures = 0

Write-Host "=== [1/5] Backend pytest ===" -ForegroundColor Cyan
Push-Location "$Root\backend"
& $Python -m pytest -v
if ($LASTEXITCODE -ne 0) { $Failures++ }
Pop-Location

Write-Host "`n=== [2/5] Pipeline pytest ===" -ForegroundColor Cyan
Push-Location $Root
& $Python -m pytest pipeline/tests -v
if ($LASTEXITCODE -ne 0) { $Failures++ }
Pop-Location

Write-Host "`n=== [3/5] Frontend TypeScript check ===" -ForegroundColor Cyan
Push-Location "$Root\frontend"
npx tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) { $Failures++ }

Write-Host "`n=== [4/5] Frontend ESLint ===" -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { $Failures++ }
Pop-Location

Write-Host "`n=== [5/5] Git Hygiene Check ===" -ForegroundColor Cyan
Push-Location $Root
$leaked = git ls-files backend/.env data/raw/ "**/*.pyc"
if ($leaked) {
    Write-Host "ARCHIVOS SENSIBLES O BINARIOS TRACKEADOS EN GIT:" -ForegroundColor Red
    $leaked | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    $Failures++
} else {
    Write-Host "OK: sin .env, data/raw/ ni *.pyc trackeados." -ForegroundColor Green
}
Pop-Location

Write-Host "`n========================================" -ForegroundColor Cyan
if ($Failures -eq 0) {
    Write-Host "QA AUTOMATION: TODO OK (0 fallos)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "QA AUTOMATION: $Failures bloque(s) con fallos" -ForegroundColor Red
    exit 1
}
