param(
  [string]$EnvironmentFile = (Join-Path $PSScriptRoot '..\..\.env.integration.local'),
  [string]$EvidencePath = (Join-Path $PSScriptRoot '..\..\qa-artifacts\UAT-20260813')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$results = [System.Collections.Generic.List[object]]::new()

function Import-EnvironmentFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Environment file not found: $Path" }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#') -or $trimmed -notmatch '^[A-Za-z_][A-Za-z0-9_]*=') { continue }
    $parts = $trimmed -split '=', 2
    $name = $parts[0]
    $value = $parts[1].Trim().Trim('"')
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Require-Environment([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) { throw "Missing required environment variable: $Name" }
  return $value.Trim()
}

function Invoke-QAGate([string]$Name, [scriptblock]$Command) {
  $startedAt = Get-Date
  $logPath = Join-Path $EvidencePath ($Name + '.log')
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  try {
    $global:LASTEXITCODE = 0
    & $Command 2>&1 | Tee-Object -FilePath $logPath
    if ($LASTEXITCODE -ne 0) { throw "$Name exited with code $LASTEXITCODE" }
    $results.Add([pscustomobject]@{ gate = $Name; status = 'PASS'; durationSeconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1); log = (Split-Path -Leaf $logPath) })
  } catch {
    $results.Add([pscustomobject]@{ gate = $Name; status = 'FAIL'; durationSeconds = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1); log = (Split-Path -Leaf $logPath); error = $_.Exception.Message })
    Write-Host "$Name failed: $($_.Exception.Message)" -ForegroundColor Red
  }
}

function Invoke-HttpSmoke([string]$BaseUrl, [string]$Path) {
  $uri = [Uri]($BaseUrl.TrimEnd('/') + $Path)
  $request = [System.Net.HttpWebRequest]::Create($uri)
  $request.Method = 'GET'
  $request.AllowAutoRedirect = $false
  $request.Timeout = 30000
  try {
    $response = $request.GetResponse()
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
  }
  if ($null -eq $response) { throw "No HTTP response for $Path" }
  try {
    [pscustomobject]@{
      path = $Path
      status = [int]$response.StatusCode
      hsts = -not [string]::IsNullOrWhiteSpace($response.Headers['Strict-Transport-Security'])
      csp = -not [string]::IsNullOrWhiteSpace($response.Headers['Content-Security-Policy'])
      nosniff = $response.Headers['X-Content-Type-Options'] -eq 'nosniff'
      referrerPolicy = -not [string]::IsNullOrWhiteSpace($response.Headers['Referrer-Policy'])
      cacheControl = -not [string]::IsNullOrWhiteSpace($response.Headers['Cache-Control'])
    }
  } finally {
    $response.Close()
  }
}

function Invoke-StagingFixture([string]$BaseUrl) {
  $secret = Require-Environment 'CLOUDFLARE_INTEGRATION_SECRET'
  if ($secret.Length -lt 32) { throw 'CLOUDFLARE_INTEGRATION_SECRET must contain at least 32 characters.' }
  $identities = @('OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'DISPATCHER', 'DRIVER', 'WORKER', 'CUSTOMER', 'SUPPLIER', 'CUSTOMER_B', 'SUPPLIER_B', 'WORKER_B', 'DRIVER_B')
  $credentials = [ordered]@{}
  foreach ($identity in $identities) {
    $credentials[$identity] = @{
      username = Require-Environment "E2E_${identity}_USERNAME"
      password = Require-Environment "E2E_${identity}_PASSWORD"
    }
  }
  $body = @{ action = 'apply'; credentials = $credentials } | ConvertTo-Json -Depth 5 -Compress
  $response = Invoke-RestMethod -Method Post -Uri "$($BaseUrl.TrimEnd('/'))/api/internal/integration/fixture" -Headers @{ 'x-erp-integration-secret' = $secret } -ContentType 'application/json' -Body $body -TimeoutSec 45
  if ($response.ok -ne $true -or $response.fixture -ne 'UAT-UXV2') { throw 'Cloudflare staging fixture returned an invalid response.' }
}

New-Item -ItemType Directory -Force -Path $EvidencePath | Out-Null
Import-EnvironmentFile $EnvironmentFile

$stagingBaseUrl = Require-Environment 'CLOUDFLARE_STAGING_BASE_URL'
$productionBaseUrl = Require-Environment 'CLOUDFLARE_PRODUCTION_BASE_URL'
if (([Uri]$stagingBaseUrl).Host -eq ([Uri]$productionBaseUrl).Host) { throw 'Refusing QA because staging and production hosts are identical.' }
foreach ($pair in @(
  @('CLOUDFLARE_STAGING_D1_ID', 'CLOUDFLARE_PRODUCTION_D1_ID'),
  @('CLOUDFLARE_STAGING_R2_BUCKET', 'CLOUDFLARE_PRODUCTION_R2_BUCKET'),
  @('CLOUDFLARE_STAGING_QUEUE', 'CLOUDFLARE_PRODUCTION_QUEUE')
)) {
  if ((Require-Environment $pair[0]) -eq (Require-Environment $pair[1])) { throw "Refusing QA because $($pair[0]) equals $($pair[1])." }
}

$manifest = [ordered]@{
  runId = 'UAT-20260813'
  stagingHost = ([Uri]$stagingBaseUrl).Host
  productionHost = ([Uri]$productionBaseUrl).Host
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
  stagingBindingsIsolated = $true
  scope = 'Cloudflare staging only; no production mutation; Android deferred'
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidencePath 'manifest.json') -Encoding utf8

Push-Location $root
try {
  Invoke-QAGate 'typecheck' { npm.cmd run typecheck }
  Invoke-QAGate 'unit' { npm.cmd test }
  Invoke-QAGate 'web-build' { npm.cmd run build }
  Invoke-QAGate 'cloudflare-integration' { npm.cmd run test:cloudflare-integration }
  Invoke-QAGate 'staging-fixture-public' { Invoke-StagingFixture $stagingBaseUrl }
  $env:PLAYWRIGHT_BASE_URL = $stagingBaseUrl
  Invoke-QAGate 'public-e2e' { npm.cmd run test:e2e:public }
  Invoke-QAGate 'staging-fixture-authenticated' { Invoke-StagingFixture $stagingBaseUrl }
  Invoke-QAGate 'authenticated-e2e' { & (Join-Path $PSScriptRoot 'run-authenticated-e2e.ps1') -BaseUrl $stagingBaseUrl }
  try {
    $smoke = @('/','/login','/dat-hang','/khach-hang/dang-nhap','/nha-cung-cap/dang-nhap','/api/mobile/catalog') | ForEach-Object { Invoke-HttpSmoke $stagingBaseUrl $_ }
    $smoke | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $EvidencePath 'cloudflare-readonly-smoke.json') -Encoding utf8
    $results.Add([pscustomobject]@{ gate = 'cloudflare-readonly-smoke'; status = 'PASS'; durationSeconds = 0; log = 'cloudflare-readonly-smoke.json' })
  } catch {
    $results.Add([pscustomobject]@{ gate = 'cloudflare-readonly-smoke'; status = 'FAIL'; durationSeconds = 0; error = $_.Exception.Message })
  }
} finally {
  Pop-Location
}

$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $EvidencePath 'gate-summary.json') -Encoding utf8
if (($results | Where-Object { $_.status -eq 'FAIL' }).Count -gt 0) { exit 1 }
