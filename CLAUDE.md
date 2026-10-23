# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory. The user [interacts with an] AI chat in order to establish what document they want and how to fill in the fields. The available documents are covered [in the] catalog.json file in the project root, included here:

@catalog.json

Before we start: the initial implementation is a frontend-only prototype that only supports the Mutual NDA document with no AI chat.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

## AI design

When writing code to make calls to LLMs, use LiteLLM via OpenRouter with free models only (model IDs ending in `:free`). Never use a paid model.

Choosing the model:
1. Get the current list of free models from the OpenRouter models API (`GET https://openrouter.ai/api/v1/models`), and keep only models with a price of 0 that support structured outputs (check `supported_parameters`).
2. From that list, choose the strongest general-purpose model (prefer large, recent instruction-tuned models), plus 2 fallback models. Tell me which models you chose and why.
3. Put the model IDs in `.env` (`OPENROUTER_MODEL` and `OPENROUTER_FALLBACK_MODELS`), not in the code, so they can be changed without code changes.
4. Pass the fallback models to OpenRouter in the `models` list, so a request goes to the next model if the first one is rate-limited or unavailable.

Use Structured Outputs so that you can interpret the results and populate the fields in the legal document. Validate the model's reply with a Pydantic model before using it.

Free models are rate-limited. Handle HTTP 429 errors: show the user a clear message instead of crashing.

The OpenRouter API key is in `.env` as `OPENROUTER_API_KEY`. Never print, log or commit it.

## Technical design

The entire project should be packaged into a Docker container. The backend should be in backend/ and be a uv project, using FastAPI. The frontend should be in frontend/ The database should use SQLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in. Consider statically building the frontend and serving it via FastAPI, if that will work. There should be scripts in scripts/ for:

# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1

Backend available at http://localhost:8000

## Color Scheme

Use a soft, feminine palette. Define all colors as CSS variables in one place and use the variables, not hex codes, in components.

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | Raspberry rose | #B04A73 | Main buttons, links, active states (white text on it) |
| Primary hover | Deep rose | #943B5F | Hover and pressed state of primary buttons |
| Secondary | Dusty rose | #D8A7B1 | Secondary buttons, highlights (dark text on it) |
| Accent | Soft lavender | #B8A1D9 | Badges, tags, small accents |
| Background | Blush white | #FFF7F9 | Page background |
| Surface | White | #FFFFFF | Cards, panels, chat bubbles, form fields |
| Border | Pale pink | #F0D9E0 | Borders and dividers |
| Text | Dark plum | #4A2C3D | Main text |
| Muted text | Mauve grey | #7E5E6E | Labels, hints, secondary text |
| Success | Sage green | #5E9E82 | Success messages |
| Error | Warm red | #C94A4A | Error messages and validation |

Keep text readable: main text and button text must have a contrast ratio of at least 4.5:1 against their background.