param(
  [string[]]$Variants = @('L0', 'L1', 'L2', 'L3'),
  [string]$OutRoot = "$env:TEMP\opencode\nora-memprof",
  [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot | Split-Path | Split-Path
$electronExe = Join-Path $repo 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electronExe)) { throw "electron.exe not found at $electronExe (run npm install / build first)" }

$Variants = @($Variants | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() }) | Where-Object { $_ }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $OutRoot $stamp
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Write-Log([string]$msg) { Write-Host "[matrix $(Get-Date -Format HH:mm:ss)] $msg" }

$userNoraRunning = @(Get-Process -Name 'Nora' -ErrorAction SilentlyContinue).Count -gt 0
if ($userNoraRunning) {
  Write-Log 'WARNING: an installed Nora instance appears to be running. L3 profile copy may catch the DB mid-write.'
}

function Get-TreeProcesses([int]$rootPid, [string]$dbgPath) {
  $result = @()
  $all = @()
  try {
    $all = Get-CimInstance -Query "SELECT ProcessId, ParentProcessId, Name, CommandLine FROM Win32_Process WHERE Name='electron.exe'" -ErrorAction Stop
  } catch {
    Add-Content -Path $dbgPath -Value "CIM query failed: $($_.Exception.Message)"
    return ,$result
  }
  Add-Content -Path $dbgPath -Value "CIM rows: $(@($all).Count)"
  $byParent = @{}
  foreach ($p in $all) {
    $parentKey = [int]$p.ParentProcessId
    if (-not $byParent.ContainsKey($parentKey)) { $byParent[$parentKey] = @() }
    $byParent[$parentKey] += $p
  }
  $result = @()
  try {
    $rootRow = $all | Where-Object { [int]$_.ProcessId -eq [int]$rootPid } | Select-Object -First 1
    if ($rootRow) {
      $result += [pscustomobject]@{ ProcessId = [int]$rootPid; ParentProcessId = 0; Name = $rootRow.Name; CommandLine = $rootRow.CommandLine }
    }
  } catch {}
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue([int]$rootPid)
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $byParent.ContainsKey($current)) { continue }
    foreach ($child in $byParent[$current]) {
      $result += $child
      $queue.Enqueue([int]$child.ProcessId)
    }
  }
  return ,$result
}

function Sample-Tree([int]$rootPid, [string]$dbgPath) {
  $rows = @()
  $total = 0
  $totalPm = 0
  try {
    $procs = Get-TreeProcesses -rootPid $rootPid -dbgPath $dbgPath
    foreach ($p in $procs) {
      try {
        $gp = Get-Process -Id $p.ProcessId -ErrorAction Stop
        $ws = [math]::Round($gp.WorkingSet64 / 1MB, 1)
        $pm = [math]::Round($gp.PrivateMemorySize64 / 1MB, 1)
        $total += $ws
        $totalPm += $pm
        $cmdline = ''
        if ($p.CommandLine -match '--type=(\w+)') { $cmdline = $Matches[1] } elseif ($p.CommandLine) { $cmdline = 'main' }
        $rows += [pscustomobject]@{ pid = $p.ProcessId; role = $cmdline; wsMB = $ws; pmMB = $pm }
      } catch { continue }
    }
  } catch {
    Add-Content -Path $dbgPath -Value "Sample-Tree exception: $($_.Exception.Message)"
    return $null
  }
  if ($rows.Count -eq 0) { return $null }
  return [pscustomobject]@{ ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds(); totalWsMB = [math]::Round($total, 1); totalPmMB = [math]::Round($totalPm, 1); processes = $rows }
}

function Invoke-Variant([string]$variant) {
  Write-Log "=== Variant $variant ==="
  $profileDir = Join-Path $outDir "$variant\profile"
  $telemetryDir = Join-Path $outDir "$variant\telemetry"
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
  New-Item -ItemType Directory -Path $telemetryDir -Force | Out-Null

  if ($variant -eq 'L3') {
    Write-Log 'Copying real user profile (%APPDATA%\Nora)...'
    robocopy "$env:APPDATA\Nora" $profileDir /E /NFL /NDL /NJH /NJS /XD logs Crashpad CrashpadMetrics 'Crash Reports' | Out-Null
  }

  $env:NORA_USER_DATA = $profileDir
  $env:NORA_PROFILE_DIR = $telemetryDir
  $env:NODE_ENV = 'production'
  $env:NORA_DEVTOOLS_CLOSED = '1'
  $env:ELECTRON_RENDERER_URL = ''
  $env:NORA_SCENARIO = if ($variant -eq 'L0') { '0' } else { '1' }
  $env:NORA_NO_PGLITE = if ($variant -eq 'L1') { '1' } else { '' }
  $env:NORA_PGLITE_MEMORY = if ($variant -eq 'L2') { '1' } else { '' }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $argList = if ($variant -eq 'L0') { @((Join-Path $PSScriptRoot 'bare-electron')) } else { @($repo) }
  $stdoutLog = Join-Path $outDir "$variant\console.out.log"
  $stderrLog = Join-Path $outDir "$variant\console.err.log"
  $proc = Start-Process -FilePath $electronExe -ArgumentList $argList -WorkingDirectory $repo -PassThru `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  Write-Log "Launched PID $($proc.Id)"

  $samples = New-Object System.Collections.Generic.List[object]
  $dbg = Join-Path $outDir "$variant\harness-debug.log"
  if (Test-Path $dbg) { Remove-Item $dbg -Force }
  while (-not $proc.HasExited -and $sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    Start-Sleep -Milliseconds 1500
    if ($proc.HasExited) { break }
    $s = Sample-Tree -rootPid $proc.Id -dbgPath $dbg
    if ($s -and $s.processes.Count -gt 0) { $samples.Add($s) | Out-Null }
  }
  $wallMs = $sw.ElapsedMilliseconds

  if (-not $proc.HasExited) {
    Write-Log 'Timeout reached; killing tree.'
    foreach ($p in (Get-TreeProcesses -rootPid $proc.Id -dbgPath $dbg)) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  } else {
    $proc.WaitForExit(2000) | Out-Null
    Write-Log "Exited with code $($proc.ExitCode) after $([math]::Round($wallMs/1000.0,1))s"
  }

  Remove-Item env:NORA_USER_DATA -ErrorAction SilentlyContinue
  Remove-Item env:NORA_PROFILE_DIR -ErrorAction SilentlyContinue
  Remove-Item env:NORA_NO_PGLITE -ErrorAction SilentlyContinue
  Remove-Item env:NORA_PGLITE_MEMORY -ErrorAction SilentlyContinue
  Remove-Item env:NORA_SCENARIO -ErrorAction SilentlyContinue
  Remove-Item env:NORA_DEVTOOLS_CLOSED -ErrorAction SilentlyContinue
  Remove-Item env:ELECTRON_RENDERER_URL -ErrorAction SilentlyContinue

  $samples | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $outDir "$variant\external-samples.json")
  Write-Log "Collected $($samples.Count) external samples over $([math]::Round($wallMs/1000.0,1))s"
}

foreach ($v in $Variants) { Invoke-Variant -variant $v }

Write-Log "All variants done. Results in $outDir"
