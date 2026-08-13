param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$BaseUrl
)

$ErrorActionPreference = 'Stop'

$normalizedBaseUrl = $BaseUrl.Trim()
$baseHost = ([Uri]$normalizedBaseUrl).Host.ToLowerInvariant()
$knownProductionHost = 'app.hienxavlxd.com'
$stagingBaseUrl = if ($env:CLOUDFLARE_STAGING_BASE_URL) {
  $env:CLOUDFLARE_STAGING_BASE_URL.Trim()
} elseif ($env:PLAYWRIGHT_BASE_URL_STAGING) {
  $env:PLAYWRIGHT_BASE_URL_STAGING.Trim()
} else {
  ""
}

if ($baseHost -eq $knownProductionHost -and [string]::IsNullOrWhiteSpace($stagingBaseUrl)) {
  throw "BaseUrl đang trỏ production ($baseHost). Để chạy authenticated suite cần set CLOUDFLARE_STAGING_BASE_URL hoặc PLAYWRIGHT_BASE_URL_STAGING."
}

$targetBaseUrl = if ($baseHost -eq $knownProductionHost) { $stagingBaseUrl } else { $normalizedBaseUrl }
$requiredIdentities = @('OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'DISPATCHER', 'DRIVER', 'WORKER', 'CUSTOMER', 'SUPPLIER', 'CUSTOMER_B', 'SUPPLIER_B', 'WORKER_B', 'DRIVER_B')
foreach ($role in $requiredIdentities) {
  foreach ($field in @('USERNAME', 'PASSWORD')) {
    $name = "E2E_${role}_${field}"
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      throw "Thiếu biến môi trường $name. Authenticated UAT không được phép skip."
    }
  }
}

$fixtureSecret = $env:CLOUDFLARE_INTEGRATION_SECRET
if ([string]::IsNullOrWhiteSpace($fixtureSecret) -or $fixtureSecret.Length -lt 32) {
  throw "Thiếu CLOUDFLARE_INTEGRATION_SECRET hợp lệ để chuẩn bị fixture authenticated staging."
}

$fixtureCredentials = [ordered]@{}
foreach ($role in $requiredIdentities) {
  $fixtureCredentials[$role] = @{ username = [Environment]::GetEnvironmentVariable("E2E_${role}_USERNAME"); password = [Environment]::GetEnvironmentVariable("E2E_${role}_PASSWORD") }
}

$fixtureBody = @{ action = "apply"; credentials = $fixtureCredentials } | ConvertTo-Json -Depth 5 -Compress
try {
  $fixtureResponse = Invoke-RestMethod -Method Post -Uri "$targetBaseUrl/api/internal/integration/fixture" -Headers @{ "x-erp-integration-secret" = $fixtureSecret } -ContentType "application/json" -Body $fixtureBody -TimeoutSec 45
  if ($fixtureResponse.ok -ne $true -or $fixtureResponse.fixture -ne "UAT-UXV2") {
    throw "Phản hồi fixture staging không hợp lệ."
  }
} catch {
  throw "Không thể chuẩn bị fixture authenticated staging: $($_.Exception.Message)"
}

$env:PLAYWRIGHT_BASE_URL = $targetBaseUrl
$env:PLAYWRIGHT_BASE_URL_STAGING = $targetBaseUrl
if ($baseHost -eq $knownProductionHost) {
  Write-Output "Tự động chuyển sang staging URL: $targetBaseUrl"
}

npx.cmd playwright test --config playwright.auth.config.ts --workers 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
