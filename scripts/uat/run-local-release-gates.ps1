param(
  [switch]$SkipAndroidExport
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$mobile = Join-Path $root 'apps\mobile'

function Invoke-Gate {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Gate thất bại: $Name" }
}

Push-Location $root
try {
  Invoke-Gate 'Root typecheck' { npm.cmd run typecheck }
  Invoke-Gate 'Root unit suite' { npm.cmd test -- --run }
  Invoke-Gate 'Web production build' { npm.cmd run build }
  $existingServer = @('http://127.0.0.1:3000', 'http://127.0.0.1:3012') | Where-Object {
    try {
      $response = Invoke-WebRequest -Uri "$_/login" -UseBasicParsing -TimeoutSec 3
      $response.StatusCode -eq 200 -and $response.Content -match 'Hiền Xa|Hien Xa'
    } catch { $false }
  } | Select-Object -First 1
  if ($existingServer) { $env:PLAYWRIGHT_BASE_URL = $existingServer }
  Invoke-Gate 'Public Playwright và axe' { npx.cmd playwright test --config playwright.config.ts }

  Push-Location $mobile
  try {
    Invoke-Gate 'Mobile typecheck' { npm.cmd run typecheck }
    Invoke-Gate 'Mobile Jest' { npm.cmd test -- --runInBand }
    Invoke-Gate 'Expo Doctor' { npx.cmd expo-doctor }
    if (-not $SkipAndroidExport) {
      Invoke-Gate 'Expo Android export' { npx.cmd expo export --platform android --output-dir dist-ux-v2 }
    }
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}

Write-Host "`nTất cả local release gate đã đạt." -ForegroundColor Green
