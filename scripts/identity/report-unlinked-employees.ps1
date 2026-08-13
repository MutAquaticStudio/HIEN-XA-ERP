param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('staging', 'production')]
  [string]$Environment
)

$ErrorActionPreference = 'Stop'
$sql = "SELECT namespace, revision, payload FROM erp_runtime_documents WHERE namespace IN ('identity', 'operations') ORDER BY namespace"
$raw = & npx.cmd wrangler d1 execute DB --env $Environment --remote --command $sql --json
if ($LASTEXITCODE -ne 0) { throw 'Không thể đọc runtime document từ Cloudflare D1.' }
$response = $raw | ConvertFrom-Json
$rows = @($response)[0].results
$identityRow = $rows | Where-Object { $_.namespace -eq 'identity' } | Select-Object -First 1
$operationsRow = $rows | Where-Object { $_.namespace -eq 'operations' } | Select-Object -First 1
if (-not $identityRow -or -not $operationsRow) { throw 'Thiếu identity hoặc operations runtime document.' }

$identity = $identityRow.payload | ConvertFrom-Json
$operations = $operationsRow.payload | ConvertFrom-Json
$employees = @($operations.state.employees) | Where-Object { $_.status -eq 'active' }
$linked = [System.Collections.Generic.HashSet[string]]::new()
@($identity.users) | Where-Object { $_.employeeId } | ForEach-Object { [void]$linked.Add([string]$_.employeeId) }
$internalRoles = @('accountant', 'sales', 'warehouse', 'dispatcher', 'driver', 'worker', 'supervisor')
$orphans = @($identity.users) | Where-Object {
  $_.status -eq 'active' -and $internalRoles -contains $_.role -and -not $_.employeeId
}

Write-Output "DRY-RUN ONLY - không ghi dữ liệu - môi trường: $Environment"
Write-Output "Identity revision: $($identityRow.revision); Operations revision: $($operationsRow.revision)"
foreach ($user in $orphans) {
  Write-Output "`nTài khoản chưa liên kết: $($user.username) [$($user.role)] id=$($user.id) sessionVersion=$($user.sessionVersion)"
  $eligible = $employees | Where-Object { -not $linked.Contains([string]$_.id) }
  foreach ($employee in $eligible) {
    Write-Output "  Nhân sự có thể rà soát: $($employee.code) - $($employee.displayName) [$($employee.roleType)] id=$($employee.id)"
  }
}
if ($orphans.Count -eq 0) { Write-Output 'Không có tài khoản nhân sự đang hoạt động bị thiếu liên kết.' }
