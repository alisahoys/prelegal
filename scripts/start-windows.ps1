$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
docker compose --project-directory $projectRoot -f (Join-Path $projectRoot "compose.yaml") up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
