# Setup and run job-matcher (Asset Manager - CV Matcher)
# Usage: .\setup-and-run.ps1
# Or from repo root: powershell -ExecutionPolicy Bypass -File .\setup-and-run.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "Setting up job-matcher..." -ForegroundColor Cyan
Set-Location $ProjectRoot

# Install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies (npm install)..." -ForegroundColor Yellow
    npm install
} else {
    Write-Host "node_modules found. Run 'npm install' manually if you need to update." -ForegroundColor Gray
}

# Default port 5000; set PORT=5001 here if 5000 is already in use
if (-not $env:PORT) { $env:PORT = "5000" }
Write-Host "Starting dev server at http://localhost:$($env:PORT)" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
npm run dev
