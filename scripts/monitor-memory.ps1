# PowerShell Process-Level Memory Profiler for Nora
param(
    [int]$IntervalSeconds = 5,
    [int]$TotalDurationMinutes = 60
)

$startTime = Get-Date
$endTime = $startTime.AddMinutes($TotalDurationMinutes)

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Nora Real-Time Process Memory Monitor" -ForegroundColor Cyan
Write-Host " Sampling every $IntervalSeconds s for $TotalDurationMinutes mins" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

function Format-MB ($bytes) {
    return [math]::Round($bytes / 1MB, 2)
}

function Get-ProcessRole ($cmd) {
    if (-not $cmd) { return "Main (Node/DB)" }
    if ($cmd -match "--type=renderer") { return "Renderer (UI)" }
    if ($cmd -match "--type=gpu-process") { return "GPU Process" }
    if ($cmd -match "--type=utility") { return "Utility Worker" }
    if ($cmd -match "--type=crashpad-handler") { return "Crashpad" }
    return "Main (Node/DB)"
}

while ((Get-Date) -lt $endTime) {
    $processes = Get-Process -Name "electron", "nora" -ErrorAction SilentlyContinue | Sort-Object Id

    if ($processes) {
        $timestamp = (Get-Date).ToString("HH:mm:ss")
        $totalWS = 0
        $totalPM = 0

        # Query process command lines for role mapping
        $pids = $processes.Id
        $cimProcs = @{}
        try {
            Get-CimInstance Win32_Process -Filter "Name='electron.exe' or Name='nora.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
                $cimProcs[$_.ProcessId] = $_.CommandLine
            }
        } catch { }

        Write-Host "`n[$timestamp] Nora Processes Active: $($processes.Count)" -ForegroundColor Yellow
        Write-Host ("{0,-8} {1,-18} {2,-16} {3,-16}" -f "PID", "Role", "WorkingSet (MB)", "PrivateBytes (MB)") -ForegroundColor Gray
        Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

        foreach ($p in $processes) {
            $wsMB = Format-MB $p.WorkingSet64
            $pmMB = Format-MB $p.PrivateMemorySize64
            $totalWS += $p.WorkingSet64
            $totalPM += $p.PrivateMemorySize64

            $cmd = $cimProcs[$p.Id]
            $role = Get-ProcessRole $cmd

            Write-Host ("{0,-8} {1,-18} {2,-16} {3,-16}" -f $p.Id, $role, $wsMB, $pmMB)
        }

        $totalWS_MB = Format-MB $totalWS
        $totalPM_MB = Format-MB $totalPM
        Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
        Write-Host ("TOTAL NORA RAM: WorkingSet = {0} MB  |  PrivateCommit = {1} MB" -f $totalWS_MB, $totalPM_MB) -ForegroundColor Green
    } else {
        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] Waiting for Nora to start..." -ForegroundColor DarkGray
    }

    Start-Sleep -Seconds $IntervalSeconds
}
