import json
import logging
import os
import re

import litellm
from litellm import acompletion
from pydantic import ValidationError

from app.catalog import catalog_by_id, template_fields
from app.prompts import SYSTEM_PROMPT
from app.schemas import ChatRequest, ChatResponse, FieldUpdate, NdaPatch, TemplateSuggestion

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


def _redacted_response_sample(content: str, allowed_fields: set[str], allowed_ids: set[str]) -> str:
    try:
        response = json.loads(content)
    except json.JSONDecodeError:
        return f"[non-JSON response redacted; {len(content)} characters]"
    if not isinstance(response, dict):
        return "[non-object JSON response redacted]"

    field_updates = response.get("fieldUpdates")
    suggestions = response.get("suggestions")
    sample = {
        "reply": "[REDACTED]" if isinstance(response.get("reply"), str) else "[INVALID]",
        "updates": None if response.get("updates") is None else "[REDACTED]",
        "fieldUpdates": [
            {
                "field": item.get("field") if isinstance(item.get("field"), str) and item.get("field") in allowed_fields else "[UNKNOWN]",
                "value": "[REDACTED]",
            }
            for item in field_updates[:5]
            if isinstance(item, dict)
        ] if isinstance(field_updates, list) else "[INVALID]",
        "suggestions": [
            {
                "templateId": item.get("templateId") if isinstance(item.get("templateId"), str) and item.get("templateId") in allowed_ids else "[UNKNOWN]",
                "reason": "[REDACTED]",
            }
            for item in suggestions[:3]
            if isinstance(item, dict)
        ] if isinstance(suggestions, list) else "[INVALID]",
        "needsMoreInformation": response.get("needsMoreInformation") if isinstance(response.get("needsMoreInformation"), bool) else "[INVALID]",
        "nextQuestion": "[REDACTED]" if isinstance(response.get("nextQuestion"), str) else None,
    }
    return json.dumps(sample, ensure_ascii=False)[:600]


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
                    "templateFields": template_fields(template.filename),
                    "currentFields": [field.model_dump() for field in request.currentFields],
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
                    "name": "agreement_chat",
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
    except (IndexError, AttributeError, TypeError) as exc:
        logger.error("AI provider returned a malformed chat response (%s)", type(exc).__name__)
        raise AIProviderError from None
    if not isinstance(content, str):
        logger.error("AI provider returned non-text chat response content")
        raise AIProviderError from None

    catalog = catalog_by_id()
    template = catalog[request.currentTemplateId]
    allowed_fields = set(template_fields(template.filename)) if request.currentData is None else set()
    allowed_ids = set(catalog)
    sample = _redacted_response_sample(content, allowed_fields, allowed_ids)
    try:
        raw_result = json.loads(content)
        if not isinstance(raw_result, dict):
            raise ValueError("provider response must be a JSON object")
        raw_nda_updates = raw_result.get("updates")
        if request.currentData is None and raw_nda_updates is not None:
            if not isinstance(raw_nda_updates, dict):
                raise ValueError("NDA updates must be an object or null")
            try:
                validated_nda_updates = NdaPatch.model_validate(raw_nda_updates)
            except ValidationError:
                logger.warning("AI provider returned an invalid NDA update for a non-NDA template; dropping it")
            else:
                if validated_nda_updates.model_dump(exclude_none=True):
                    logger.warning("AI provider returned an NDA update for a non-NDA template; dropping it")
            raw_result["updates"] = None
        if request.currentData is not None and raw_result.get("fieldUpdates") not in (None, []):
            logger.warning("AI provider returned generic updates for an NDA template; dropping them")
            raw_result["fieldUpdates"] = []

        raw_suggestions = raw_result.get("suggestions")
        suggestions = []
        if isinstance(raw_suggestions, list):
            for item in raw_suggestions:
                try:
                    if not isinstance(item, dict) or not isinstance(item.get("reason"), str) or not item["reason"].strip():
                        raise ValueError
                    suggestion = TemplateSuggestion.model_validate(item)
                    if suggestion.templateId not in allowed_ids or any(s.templateId == suggestion.templateId for s in suggestions):
                        raise ValueError
                except (TypeError, ValueError, ValidationError):
                    logger.warning("AI provider returned an invalid template suggestion; dropping it")
                    continue
                if len(suggestions) == 3:
                    logger.warning("AI provider returned excess template suggestions; dropping the rest")
                    break
                suggestions.append(suggestion)
        elif raw_suggestions is not None:
            logger.warning("AI provider returned an invalid suggestion list; dropping it")
        raw_result["suggestions"] = [item.model_dump() for item in suggestions]

        raw_fields = raw_result.get("fieldUpdates")
        field_updates = []
        if request.currentData is None and isinstance(raw_fields, list):
            for item in raw_fields:
                try:
                    field_update = FieldUpdate.model_validate(item)
                    if field_update.field not in allowed_fields or any(update.field == field_update.field for update in field_updates):
                        raise ValueError
                except (TypeError, ValueError, ValidationError):
                    logger.warning("AI provider returned an invalid template field update; dropping it")
                    continue
                if len(field_updates) == 100:
                    logger.warning("AI provider returned excess template field updates; dropping the rest")
                    break
                field_updates.append(field_update)
        elif request.currentData is None and raw_fields is not None:
            logger.warning("AI provider returned an invalid field update list; dropping it")
        raw_result["fieldUpdates"] = [item.model_dump() for item in field_updates]

        result = ChatResponse.model_validate(raw_result)
        if sum(len(item.value) for item in field_updates) > 20_000:
            raise ValueError("provider returned excessive template field data")
        return result
    except (IndexError, AttributeError, TypeError, ValueError, ValidationError) as exc:
        validation_reason = str(exc) if isinstance(exc, ValueError) and not isinstance(exc, ValidationError) else type(exc).__name__
        logger.error("AI provider returned an invalid chat response (%s): %s; sample=%s", type(exc).__name__, validation_reason, sample)
        raise AIProviderError from None
