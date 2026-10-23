---
name: openrouter-free
description: Use when writing code that calls an LLM in this project. Explains how to call free OpenRouter models through LiteLLM with structured outputs.
---

# Calling free LLMs through OpenRouter

## Library
- Use LiteLLM.
- Model names have the format `openrouter/<model-id>`, for example `openrouter/<provider>/<model>:free`.

## Choosing the model
1. Use free models only (model IDs ending in `:free`). Never use a paid model.
2. Get the current list of models from `GET https://openrouter.ai/api/v1/models`. Keep only models with a price of 0 that support structured outputs (check `supported_parameters`).
3. Choose the strongest general-purpose model from that list, plus 2 fallback models. Tell the user which models you chose and why.
4. Put the model IDs in `.env` as `OPENROUTER_MODEL` and `OPENROUTER_FALLBACK_MODELS`. Never write model IDs in the code.
5. Pass the fallback models to OpenRouter in the `models` list, so a request goes to the next model if the first one is rate-limited or unavailable.

## Structured outputs
- Define the reply format as a Pydantic model and pass it in `response_format`.
- Validate the reply with the Pydantic model before using it.

## Errors
- Free models are rate-limited. Handle