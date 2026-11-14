$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $projectPython)) {
    throw 'Run setup first: py -3.12 -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
}
& $projectPython run.py
