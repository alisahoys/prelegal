# Prelegal

Prelegal is a work-in-progress legal document drafting application.

## Run with Docker Compose

Install Docker Desktop (or Docker Engine with the Compose plugin), then run the start script for your platform from the repository root:

- macOS: `sh scripts/start-mac.sh`
- Linux: `sh scripts/start-linux.sh`
- Windows PowerShell: `./scripts/start-windows.ps1`

The frontend is available at http://localhost:3000. The FastAPI backend health endpoint is at http://localhost:8000/health.

Stop the services with `sh scripts/stop-mac.sh`, `sh scripts/stop-linux.sh`, or `./scripts/stop-windows.ps1` as appropriate, from the repository root.

The backend recreates its temporary SQLite database whenever it starts. The database currently contains an empty `users` table; all database contents are discarded on backend restart. No signup or sign-in functionality is included yet.
