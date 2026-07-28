param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    $python = "python"
}

$existing = Get-NetTCPConnection -LocalPort 8789 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
    Start-Process -FilePath $python -ArgumentList "server.py" -WorkingDirectory $projectDir -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:8789/"
}
