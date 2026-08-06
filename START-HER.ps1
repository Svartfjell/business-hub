$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\data\segment.sqlite")) {
  Write-Host ""
  Write-Host "Mangler data\segment.sqlite" -ForegroundColor Yellow
  Write-Host "Kopier segment.sqlite fra det gamle prosjektet."
  exit 1
}

npm install
npm run build
npm run dev
