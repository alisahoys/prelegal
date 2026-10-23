import json
import os

import litellm
from litellm import acompletion
from pydantic import ValidationError

from app.catalog import catalog_by_id
from app.prompts import SYSTEM_PROMPT
from app.schemas import ChatRequest, ChatResponse


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
        raise AIConfigurationError
    primary = os.environ.get("OPENROUTER_MODEL", "").strip()
    fallbacks = [model.strip() for model in os.environ.get("OPENROUTER_FALLBACK_MODELS", "").split(",") if model.strip()]
    models = [primary, *fallbacks]
    if not primary or len(fallbacks) != 2 or any(not model.endswith(":free") for model in models):
        raise AIConfigurationError
    if len(set(models)) != len(models):
        raise AIConfigurationError
    return primary, fallbacks


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
    primary, fallbacks = _models()
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
            max_tokens=1200,
        )
    except Exception as exc:
        if isinstance(exc, litellm.RateLimitError):
            raise AIRateLimitError from None
        if isinstance(exc, litellm.Timeout):
            raise AITimeoutError from None
        raise AIProviderError from None

    try:
        content = response.choices[0].message.content
        if not isinstance(content, str):
            raise ValueError
        result = ChatResponse.model_validate_json(content)
        allowed_ids = set(catalog_by_id())
        seen: set[str] = set()
        suggestions = []
        for suggestion in result.suggestions:
            if suggestion.templateId in allowed_ids and suggestion.templateId not in seen:
                suggestions.append(suggestion)
                seen.add(suggestion.templateId)
        if request.currentData is None and result.updates and result.updates.model_dump(exclude_none=True):
            raise ValueError
        return result.model_copy(update={"suggestions": suggestions})
    except (IndexError, AttributeError, TypeError, ValueError, ValidationError):
        raise AIProviderError from None
