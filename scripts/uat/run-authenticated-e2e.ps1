param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$BaseUrl
)

$ErrorActionPreference = 'Stop'
$requiredIdentities = @('OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'DISPATCHER', 'DRIVER', 'WORKER', 'CUSTOMER', 'SUPPLIER', 'CUSTOMER_B', 'SUPPLIER_B', 'WORKER_B')
foreach ($role in $requiredIdentities) {
  foreach ($field in @('USERNAME', 'PASSWORD')) {
    $name = "E2E_${role}_${field}"
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      throw "Thiếu biến môi trường $name. Authenticated UAT không được phép skip."
    }
  }
}

$env:PLAYWRIGHT_BASE_URL = $BaseUrl
npx.cmd playwright test --config playwright.auth.config.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
