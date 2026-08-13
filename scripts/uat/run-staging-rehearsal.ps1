param(
  [ValidatePattern('^https://')]
  [string]$BaseUrl
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$manifestPath = Join-Path $PSScriptRoot 'migration-manifest.txt'

function Require-EnvironmentVariable([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) { throw "Missing environment variable $Name." }
  return $value
}

function Invoke-Checked([string]$Label, [scriptblock]$Command) {
  Write-Host "`n== $Label ==" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

if ((Require-EnvironmentVariable 'ERP_RUN_INTEGRATION_TESTS') -ne '1') {
  throw 'ERP_RUN_INTEGRATION_TESTS must equal 1.'
}
if ((Require-EnvironmentVariable 'ERP_TEST_DATABASE_CONFIRMATION') -ne 'hien-xa-staging') {
  throw 'ERP_TEST_DATABASE_CONFIRMATION must equal hien-xa-staging.'
}
if ((Require-EnvironmentVariable 'ERP_UAT_FIXTURE_CONFIRMATION') -ne 'UAT-UXV2') {
  throw 'ERP_UAT_FIXTURE_CONFIRMATION must equal UAT-UXV2.'
}
$databaseUrl = Require-EnvironmentVariable 'ERP_TEST_DATABASE_URL'
$projectRef = Require-EnvironmentVariable 'SUPABASE_TEST_PROJECT_REF'
$productionProjectRef = Require-EnvironmentVariable 'SUPABASE_PRODUCTION_PROJECT_REF'
$supabaseUrl = Require-EnvironmentVariable 'SUPABASE_TEST_URL'
Require-EnvironmentVariable 'SUPABASE_TEST_ANON_KEY' | Out-Null
Require-EnvironmentVariable 'SUPABASE_TEST_SERVICE_ROLE_KEY' | Out-Null

if ($projectRef -eq $productionProjectRef) {
  throw 'Refusing rehearsal because staging and production project refs are identical.'
}
if ($projectRef -notmatch '^[a-z0-9]{15,40}$' -or $productionProjectRef -notmatch '^[a-z0-9]{15,40}$') {
  throw 'Staging and production project refs must be valid Supabase project refs.'
}
try {
  $supabaseUri = [Uri]$supabaseUrl
  $databaseUri = [Uri]$databaseUrl
} catch {
  throw 'Staging Supabase and database URLs must be valid and percent-encoded.'
}
if ($supabaseUri.Scheme -ne 'https' -or $supabaseUri.Host -ne "$projectRef.supabase.co") {
  throw 'SUPABASE_TEST_URL does not match SUPABASE_TEST_PROJECT_REF.'
}
$databaseUser = [Uri]::UnescapeDataString($databaseUri.UserInfo.Split(':')[0])
$directDatabase = $databaseUri.Host -eq "db.$projectRef.supabase.co"
$pooledDatabase = $databaseUri.Host.EndsWith('.pooler.supabase.com') -and $databaseUser.EndsWith(".$projectRef")
if (-not $directDatabase -and -not $pooledDatabase) {
  throw 'ERP_TEST_DATABASE_URL does not identify the configured staging project ref.'
}

$requiredIdentities = @('OWNER', 'ACCOUNTANT', 'WAREHOUSE', 'DISPATCHER', 'DRIVER', 'WORKER', 'CUSTOMER', 'SUPPLIER', 'CUSTOMER_B', 'SUPPLIER_B', 'WORKER_B', 'DRIVER_B')
$passwords = @{}
foreach ($identity in $requiredIdentities) {
  $expectedUsername = "uat.uxv2.$($identity.ToLowerInvariant().Replace('_', '.'))"
  if ((Require-EnvironmentVariable "E2E_${identity}_USERNAME") -ne $expectedUsername) {
    throw "E2E_${identity}_USERNAME must be $expectedUsername."
  }
  $password = Require-EnvironmentVariable "E2E_${identity}_PASSWORD"
  if ($password.Length -lt 20 -or $password.Length -gt 128 -or $password -notmatch '[A-Za-z]' -or $password -notmatch '\d') {
    throw "E2E_${identity}_PASSWORD must contain letters and numbers and be 20-128 characters long."
  }
  if ($passwords.ContainsKey($password)) { throw 'Each UAT role must use a different password.' }
  $passwords[$password] = $true
}

$expected = @(Get-Content $manifestPath | Where-Object { $_ -match '^\d{12}$' })
$actual = @(Get-ChildItem (Join-Path $root 'supabase\migrations') -File -Filter '*.sql' |
  Sort-Object Name |
  ForEach-Object { $_.BaseName.Split('_')[0] })
if ($expected.Count -ne 27 -or (Compare-Object $expected $actual)) {
  throw "Migration manifest does not match exactly 27 source migrations. Expected=$($expected.Count), Actual=$($actual.Count)."
}

Push-Location $root
try {
  Invoke-Checked 'Supabase migration dry-run 1' {
    npx.cmd supabase@latest db push --db-url $databaseUrl --dry-run
  }
  Invoke-Checked 'Apply migrations to staging' {
    npx.cmd supabase@latest db push --db-url $databaseUrl
  }
  Invoke-Checked 'Assert migration history 27/27' {
    npx.cmd vitest run --config vitest.integration.config.ts tests/integration/staging-migration-history.test.ts --no-file-parallelism --maxWorkers=1
  }
  Invoke-Checked 'Supabase migration dry-run 2' {
    npx.cmd supabase@latest db push --db-url $databaseUrl --dry-run
  }
  Invoke-Checked 'Supabase database lint' {
    npx.cmd supabase@latest db lint --db-url $databaseUrl
  }
  $env:ERP_UAT_FIXTURE_APPLY = '1'
  Invoke-Checked 'Apply idempotent UAT-UXV2 fixture' {
    npx.cmd vitest run --config vitest.integration.config.ts tests/integration/uat-ux-v2-fixture.test.ts --no-file-parallelism --maxWorkers=1
  }
  Remove-Item Env:ERP_UAT_FIXTURE_APPLY -ErrorAction SilentlyContinue
  Invoke-Checked 'Run complete staging integration suite' {
    npm.cmd run test:integration -- --no-file-parallelism --maxWorkers=1
  }
  if ($BaseUrl) {
    Invoke-Checked 'Run authenticated Playwright UAT' {
      & (Join-Path $PSScriptRoot 'run-authenticated-e2e.ps1') -BaseUrl $BaseUrl
    }
  }
} finally {
  Remove-Item Env:ERP_UAT_FIXTURE_APPLY -ErrorAction SilentlyContinue
  Pop-Location
}
