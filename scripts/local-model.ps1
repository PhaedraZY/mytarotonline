[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop', 'Pull', 'Test')]
    [string]$Action = 'Status',
    [string]$Model = 'qwen3.5:9b',
    [ValidateRange(1024, 65535)]
    [int]$Port = 11434
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $ProjectRoot '.runtime'
$ModelRoot = Join-Path $ProjectRoot '.models'
$OllamaExe = Join-Path $RuntimeRoot 'ollama\ollama.exe'
$LogRoot = Join-Path $RuntimeRoot 'logs'
$StateFile = Join-Path $RuntimeRoot 'ollama-service.json'
$ApiRoot = "http://127.0.0.1:$Port"

function Get-OllamaStatus {
    try {
        $version = Invoke-RestMethod "$ApiRoot/api/version" -TimeoutSec 3
        $tags = Invoke-RestMethod "$ApiRoot/api/tags" -TimeoutSec 5
        return [pscustomobject]@{ available = $true; url = $ApiRoot; version = $version.version; models = @($tags.models | Select-Object name, size, details) }
    } catch {
        return [pscustomobject]@{ available = $false; url = $ApiRoot; models = @() }
    }
}

function Set-TaskEnvironment {
    # Process-only variables are inherited by the child service. No user or
    # machine environment variables, startup entries or firewall rules change.
    $env:OLLAMA_HOST = "127.0.0.1:$Port"
    $env:OLLAMA_MODELS = $ModelRoot
    $env:OLLAMA_NO_CLOUD = '1'
    $env:OLLAMA_NUM_PARALLEL = '1'
    $env:OLLAMA_MAX_LOADED_MODELS = '1'
    $env:OLLAMA_CONTEXT_LENGTH = '8192'
    $env:OLLAMA_KEEP_ALIVE = '5m'
}

switch ($Action) {
    'Status' {
        Get-OllamaStatus | ConvertTo-Json -Depth 8
    }
    'Start' {
        if (-not (Test-Path -LiteralPath $OllamaExe)) {
            throw "Portable runtime missing. Run python scripts/local-download-runtime.py first."
        }
        $current = Get-OllamaStatus
        if ($current.available) {
            Write-Output "Ollama already responds at $ApiRoot. Existing service left as-is."
            $current | ConvertTo-Json -Depth 8
            break
        }
        New-Item -ItemType Directory -Force -Path $LogRoot, $ModelRoot | Out-Null
        Set-TaskEnvironment
        $process = Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LogRoot 'ollama.stdout.log') -RedirectStandardError (Join-Path $LogRoot 'ollama.stderr.log')
        [pscustomobject]@{ processId = $process.Id; executable = $OllamaExe; url = $ApiRoot; models = $ModelRoot; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 500
            $current = Get-OllamaStatus
            if ($current.available) { break }
            if ($process.HasExited) { throw "Ollama exited. See $LogRoot\ollama.stderr.log" }
        }
        if (-not $current.available) { throw "Ollama did not become ready. See $LogRoot\ollama.stderr.log" }
        $current | ConvertTo-Json -Depth 8
    }
    'Stop' {
        if (-not (Test-Path -LiteralPath $StateFile)) { throw 'No task-owned service record found; no process was stopped.' }
        $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        $process = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
        if ($process) {
            if ($process.Path -ne $OllamaExe) { throw 'Recorded process no longer matches this project runtime; no process was stopped.' }
            Stop-Process -Id $process.Id
        }
        Remove-Item -LiteralPath $StateFile
        Write-Output 'Task-owned Ollama service stopped.'
    }
    'Pull' {
        if (-not (Test-Path -LiteralPath $OllamaExe)) { throw 'Portable runtime missing.' }
        Set-TaskEnvironment
        & $OllamaExe pull $Model
        if ($LASTEXITCODE -ne 0) { throw "Ollama pull failed with exit code $LASTEXITCODE" }
    }
    'Test' {
        $status = Get-OllamaStatus
        if (-not $status.available) { throw "Start the service first: .\scripts\local-model.ps1 Start" }
        $schema = @{
            type = 'object'
            additionalProperties = $false
            required = @('summary', 'cards', 'action')
            properties = @{
                summary = @{ type = 'string' }
                cards = @{ type = 'array'; minItems = 1; maxItems = 1; items = @{ type = 'object'; additionalProperties = $false; required = @('cardId', 'interpretation'); properties = @{ cardId = @{ type = 'string'; enum = @('major-09') }; interpretation = @{ type = 'string' } } } }
                action = @{ type = 'string' }
            }
        }
        $request = @{
            model = $Model
            stream = $false
            think = $false
            format = $schema
            keep_alive = '5m'
            options = @{ temperature = 0.35; num_ctx = 8192; num_predict = 640 }
            messages = @(
                @{ role = 'system'; content = '你是一位温柔、克制的塔罗叙事向导。只依据已给定的牌义作中文自我反思，不声称命运已确定。严格输出指定 JSON，三项文本各不超过100个汉字。' },
                @{ role = 'user'; content = '问题：我希望更有条理地开展一个创作项目。已抽到 major-09 隐士，正位，现在牌位。允许牌义：独处思考、内在指引、审慎探索。请结合问题解释，并给一个可执行的小行动。' }
            )
        }
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $json = $request | ConvertTo-Json -Depth 14 -Compress
        $response = Invoke-RestMethod "$ApiRoot/api/chat" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 300
        $timer.Stop()
        $content = $response.message.content | ConvertFrom-Json
        if ($content.cards.Count -ne 1 -or $content.cards[0].cardId -ne 'major-09' -or -not $content.summary -or -not $content.action) {
            throw 'Smoke response did not preserve the required card or structure.'
        }
        $result = [pscustomobject]@{
            checkedAt = (Get-Date).ToString('o')
            model = $response.model
            elapsedSeconds = [math]::Round($timer.Elapsed.TotalSeconds, 3)
            loadSeconds = [math]::Round($response.load_duration / 1e9, 3)
            promptTokens = $response.prompt_eval_count
            outputTokens = $response.eval_count
            outputTokensPerSecond = if ($response.eval_duration -gt 0) { [math]::Round($response.eval_count / ($response.eval_duration / 1e9), 2) } else { $null }
            doneReason = $response.done_reason
            response = $content
        }
        $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $RuntimeRoot 'local-model-smoke.json') -Encoding UTF8
        $result | ConvertTo-Json -Depth 10
    }
}
