$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$python = "python"
$script = Join-Path $PSScriptRoot "fetch_rsba_powerbi.py"

Push-Location $repo
try {
    & $python $script @args
}
finally {
    Pop-Location
}
