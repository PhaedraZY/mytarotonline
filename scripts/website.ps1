[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop')]
    [string]$Action = 'Start',
    [ValidateRange(1024, 65535)]
    [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ServerPath = Join-Path $ProjectRoot 'server.js'
$RuntimeRoot = Join-Path $ProjectRoot '.runtime'
$LogRoot = Join-Path $RuntimeRoot 'logs'
$StateFile = Join-Path $RuntimeRoot 'website-service.json'
$ApiRoot = "http://127.0.0.1:$Port"
$ExpectedVersion = (Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json).version

function Get-ServiceRecord {
    if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
    try { return Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json }
    catch { throw "Cannot read $StateFile. No process has been changed." }
}

function Get-OwnedProcess($Record) {
    if (-not $Record -or $Record.projectRoot -ne $ProjectRoot -or $Record.serverPath -ne $ServerPath) { return $null }
    $recordedId = 0
    if (-not [int]::TryParse([string]$Record.processId, [ref]$recordedId) -or $recordedId -le 0) { return $null }
    $candidate = Get-Process -Id $recordedId -ErrorAction SilentlyContinue
    if (-not $candidate) { return $null }
    try {
        # Holding a process handle also avoids treating a later reuse of its PID
        # as the process whose identity we just checked.
        $null = $candidate.Handle
        if ($candidate.Path -ne $Record.executable -or [IO.Path]::GetFileName($candidate.Path) -ne 'node.exe') { return $null }
        if ($candidate.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$Record.startTimeUtcTicks) { return $null }
        $details = Get-CimInstance Win32_Process -Filter "ProcessId=$recordedId"
        if (-not $details -or $details.ExecutablePath -ne $Record.executable) { return $null }
        $scriptArgument = '(?i)(?:^|\s)"?' + [regex]::Escape($ServerPath) + '"?(?=\s|$)'
        if ($details.CommandLine -notmatch $scriptArgument -or $details.CommandLine -notmatch '(?:^|\s)--env-file-if-exists=\.env(?:\s|$)') { return $null }
        return $candidate
    } catch { return $null }
}

function Get-WebsiteStatus {
    $record = Get-ServiceRecord
    $owned = Get-OwnedProcess $record
    $available = $false
    $version = $null
    try {
        $health = Invoke-RestMethod "$ApiRoot/api/health" -TimeoutSec 5
        $version = $health.version
        $available = $health.ok -eq $true -and $version -eq $ExpectedVersion
    } catch { }
    return [pscustomobject]@{
        available = $available
        url = $ApiRoot
        version = $version
        expectedVersion = $ExpectedVersion
        managed = [bool]($owned -and $record.url -eq $ApiRoot)
        processId = if ($owned) { $owned.Id } else { $null }
    }
}

switch ($Action) {
    'Status' {
        Get-WebsiteStatus | ConvertTo-Json
    }
    'Start' {
        $current = Get-WebsiteStatus
        if ($current.available) {
            Write-Output "LUNARIA $ExpectedVersion already responds at $ApiRoot. Reusing it without changing ownership."
            $current | ConvertTo-Json
            break
        }
        $record = Get-ServiceRecord
        if (Get-OwnedProcess $record) {
            throw "A recorded project process is still running but health is unavailable. Inspect $LogRoot; no duplicate was started."
        }
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) { throw "Port $Port is already in use by a service that did not pass the LUNARIA version check. No process was changed." }
        $NodeExe = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        if (-not (Test-Path -LiteralPath $ServerPath)) { throw "Missing server script: $ServerPath" }
        New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
        $previousPort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
        try {
            # Port is scoped to this launch; Node receives .env from the project
            # working directory and an absolute server path for ownership checks.
            $env:PORT = [string]$Port
            $process = Start-Process -FilePath $NodeExe -ArgumentList @('--env-file-if-exists=.env', ('"{0}"' -f $ServerPath)) -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LogRoot 'website.stdout.log') -RedirectStandardError (Join-Path $LogRoot 'website.stderr.log')
        } finally {
            [Environment]::SetEnvironmentVariable('PORT', $previousPort, 'Process')
        }
        [pscustomobject]@{
            processId = $process.Id
            executable = $NodeExe
            projectRoot = $ProjectRoot
            serverPath = $ServerPath
            url = $ApiRoot
            version = $ExpectedVersion
            startTimeUtcTicks = $process.StartTime.ToUniversalTime().Ticks.ToString()
            startedAtUtc = $process.StartTime.ToUniversalTime().ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 500
            $process.Refresh()
            if ($process.HasExited) { throw "LUNARIA exited. See $LogRoot\website.stderr.log" }
            $current = Get-WebsiteStatus
            if ($current.available -and $current.managed) { break }
        }
        if (-not $current.available -or -not $current.managed) { throw "LUNARIA did not become healthy. See $LogRoot\website.stderr.log" }
        $current | ConvertTo-Json
    }
    'Stop' {
        $record = Get-ServiceRecord
        if (-not $record) {
            Write-Output 'No task-owned website record exists. Existing services were left running.'
            break
        }
        $owned = Get-OwnedProcess $record
        if (-not $owned) {
            throw 'Recorded PID, executable, absolute server path or start time no longer matches. No process was stopped.'
        }
        Stop-Process -InputObject $owned -ErrorAction Stop
        Remove-Item -LiteralPath $StateFile
        Write-Output 'Task-owned LUNARIA website stopped.'
    }
}
