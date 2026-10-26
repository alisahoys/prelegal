import json
import logging
import os
import re

import litellm
from litellm import acompletion
from pydantic import ValidationError

from app.catalog import catalog_by_id
from app.prompts import SYSTEM_PROMPT
from app.schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)


class AIConfigurationError(Exception):
    pass


class AIProviderError(Exception):
    pass


class AIRateLimitError(Exception):
    pass


class AITimeoutError(Exception):
    pass


def _models() -> tuple[str, list[str]]:
    if not os.environ.get("OPENROUTER_API_KEY", "").strip():
        raise AIConfigurationError("OPENROUTER_API_KEY is missing")
    primary = os.environ.get("OPENROUTER_MODEL", "").strip()
    fallbacks = [model.strip() for model in os.environ.get("OPENROUTER_FALLBACK_MODELS", "").split(",") if model.strip()]
    models = [primary, *fallbacks]
    if not primary:
        raise AIConfigurationError("OPENROUTER_MODEL is missing")
    if len(fallbacks) != 2:
        raise AIConfigurationError("OPENROUTER_FALLBACK_MODELS must contain exactly two model IDs")
    if any(not model.endswith(":free") for model in models):
        raise AIConfigurationError("All configured model IDs must be free models ending in :free")
    if len(set(models)) != len(models):
        raise AIConfigurationError("The primary and fallback model IDs must be distinct")
    return primary, fallbacks


def _safe_error_details(error: Exception) -> str:
    details = str(error)
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if api_key:
        details = details.replace(api_key, "[REDACTED]")
    return re.sub(r"(?i)(authorization\s*[:=]\s*bearer\s+|api[_-]?key\s*[:=]\s*)\S+", r"\1[REDACTED]", details)[:2000]


def _messages(request: ChatRequest) -> list[dict[str, str]]:
    history = request.history[-12:]
    catalog = catalog_by_id()
    template = catalog[request.currentTemplateId]
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *[{"role": message.role, "content": message.content} for message in history],
        {
            "role": "user",
            "content": json.dumps(
                {
                    "catalog": [{"id": entry.id, "name": entry.name, "description": entry.description} for entry in catalog.values()],
                    "selectedTemplate": {"id": template.id, "name": template.name, "editor": template.editor},
                    "currentData": request.currentData.model_dump() if request.currentData else None,
                    "message": request.message,
                },
                ensure_ascii=False,
            ),
        },
    ]


async def complete_chat(request: ChatRequest) -> ChatResponse:
    try:
        primary, fallbacks = _models()
    except AIConfigurationError as exc:
        logger.error("AI chat configuration error: %s", exc)
        raise

    try:
        response = await acompletion(
            model=f"openrouter/{primary}",
            models=fallbacks,
            messages=_messages(request),
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "mutual_nda_chat",
                    "schema": ChatResponse.model_json_schema(),
                    "strict": True,
                },
            },
            temperature=0.2,
            timeout=45,
            max_tokens=3000,
        )
    except Exception as exc:
        logger.error("AI provider request failed (%s): %s", type(exc).__name__, _safe_error_details(exc))
        if isinstance(exc, litellm.RateLimitError):
            raise AIRateLimitError from None
        if isinstance(exc, litellm.Timeout):
            raise AITimeoutError from None
        raise AIProviderError from None

    try:
        content = response.choices[0].message.content
        if not isinstance(content, str):
            raise ValueError("response message content is not a string")
        result = ChatResponse.model_validate_json(content)
        allowed_ids = set(catalog_by_id())
        seen: set[str] = set()
        suggestions = []
        for suggestion in result.suggestions:
            if suggestion.templateId in allowed_ids and suggestion.templateId not in seen:
                suggestions.append(suggestion)
                seen.add(suggestion.templateId)
        if request.currentData is None and result.updates and result.updates.model_dump(exclude_none=True):
            raise ValueError("provider returned NDA field updates for a non-NDA template")
        return result.model_copy(update={"suggestions": suggestions})
    except (IndexError, AttributeError, TypeError, ValueError, ValidationError):
        logger.exception("AI provider returned an invalid chat response")
        raise AIProviderError from None
