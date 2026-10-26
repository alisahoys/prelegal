# Prelegal

Prelegal is a work-in-progress legal document drafting application.

## Run with Docker Compose

Install Docker Desktop (or Docker Engine with the Compose plugin), then run the start script for your platform from the repository root:

- macOS: `sh scripts/start-mac.sh`
- Linux: `sh scripts/start-linux.sh`
- Windows PowerShell: `./scripts/start-windows.ps1`

The frontend is available at http://localhost:3000. The FastAPI backend health endpoint is at http://localhost:8000/health.

Stop the services with `sh scripts/stop-mac.sh`, `sh scripts/stop-linux.sh`, or `./scripts/stop-windows.ps1` as appropriate, from the repository root.

The backend recreates its temporary SQLite database whenever it starts. The database currently contains an empty `users` table; all database contents are discarded on backend restart.

The workspace supports all 12 legal agreement templates in `catalog.json`, including Mutual NDA, Cloud Service, Service Level, Data Processing, Design Partner, Professional Services, Partnership, Business Associate, Software License, Pilot, and AI Addendum agreements. Each template has guided form fields with a live preview and print/download options. The AI chat helps users choose an agreement and gather details through follow-up questions; responses are validated before fields are updated. The assistant is optional, and using it sends your message, recent chat, and eligible agreement fields to OpenRouter through the backend. The MNDA modifications field is excluded. Chat is not saved by this prototype, but OpenRouter's data practices may apply; review the notice and consent checkbox before sending. The prototype sign-in screen accepts any valid-looking email and password without authenticating or saving credentials. The backend API is unauthenticated and only bound to localhost, so this prototype is not for public deployment.

To enable chat, add `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_FALLBACK_MODELS` to `.env`. Model IDs must be free OpenRouter models that support structured outputs and end in `:free`; free models can be slow or rate-limited on longer replies. The API key is passed only to the backend container.
