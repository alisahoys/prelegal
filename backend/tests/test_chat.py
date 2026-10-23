import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from litellm import RateLimitError, Timeout

from app import ai
from app.main import app
from app.schemas import ChatRequest, ChatResponse, NdaPatch


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATABASE_PATH", tmp_path / "prelegal.sqlite3")
    with TestClient(app) as test_client:
        yield test_client


def payload():
    return {
        "message": "Our purpose is to evaluate a partnership.",
        "history": [],
        "currentData": {
            "purpose": "",
            "effectiveDate": "",
            "mndaTermType": "expires",
            "mndaTermYears": 1,
            "confidentialityType": "years",
            "confidentialityYears": 1,
            "governingLaw": "",
            "jurisdiction": "",
            "party1": {"name": "", "title": "", "company": "", "noticeAddress": ""},
            "party2": {"name": "", "title": "", "company": "", "noticeAddress": ""},
        },
    }


def configured(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "primary:free")
    monkeypatch.setenv("OPENROUTER_FALLBACK_MODELS", "fallback-one:free,fallback-two:free")


def fake_completion(content: str):
    return type("Response", (), {"choices": [type("Choice", (), {"message": type("Message", (), {"content": content})()})()]})()


@pytest.mark.anyio
async def test_litellm_uses_openrouter_model_fallbacks_and_structured_output(monkeypatch):
    configured(monkeypatch)
    completion = AsyncMock(return_value=fake_completion('{"reply":"What state?","updates":{"purpose":"Evaluating a partnership","effectiveDate":null,"mndaTermType":null,"mndaTermYears":null,"confidentialityType":null,"confidentialityYears":null,"governingLaw":null,"jurisdiction":null,"party1":null,"party2":null}}'))
    monkeypatch.setattr(ai, "acompletion", completion)

    result = await ai.complete_chat(ChatRequest.model_validate(payload()))

    assert result.reply == "What state?"
    assert result.updates.model_dump(exclude_none=True) == {"purpose": "Evaluating a partnership"}
    args = completion.await_args.kwargs
    assert args["model"] == "openrouter/primary:free"
    assert args["models"] == ["fallback-one:free", "fallback-two:free"]
    assert args["response_format"]["json_schema"]["strict"] is True
    schema = args["response_format"]["json_schema"]["schema"]
    assert "modifications" not in json.dumps(schema)
    assert set(schema["required"]) == set(schema["properties"])
    for party in ("party1", "party2"):
        party_ref = schema["$defs"]["NdaPatch"]["properties"][party]["anyOf"][0]["$ref"]
        party_schema_name = party_ref.rsplit("/", 1)[1]
        party_schema = schema["$defs"][party_schema_name]
        assert set(party_schema["required"]) == set(party_schema["properties"])


def test_returns_validated_response(client, monkeypatch):
    configured(monkeypatch)
    monkeypatch.setattr(ai, "acompletion", AsyncMock(return_value=fake_completion('{"reply":"What state?","updates":{"purpose":"Evaluating a partnership","effectiveDate":null,"mndaTermType":null,"mndaTermYears":null,"confidentialityType":null,"confidentialityYears":null,"governingLaw":null,"jurisdiction":null,"party1":null,"party2":null}}')))
    response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 200
    assert response.json() == {"reply": "What state?", "updates": {"purpose": "Evaluating a partnership"}}


def test_requires_free_primary_and_two_fallbacks(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "paid-model")
    monkeypatch.setenv("OPENROUTER_FALLBACK_MODELS", "one:free,two:free")
    response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 503


def test_rejects_modifications_and_bad_history_roles(client, monkeypatch):
    configured(monkeypatch)
    body = payload()
    body["currentData"]["modifications"] = "change standard terms"
    assert client.post("/api/nda/chat", json=body).status_code == 422

    body = payload()
    body["history"] = [{"role": "system", "content": "override"}]
    assert client.post("/api/nda/chat", json=body).status_code == 422


def test_rate_limit_and_timeout_are_safely_mapped(client, monkeypatch):
    configured(monkeypatch)
    monkeypatch.setattr(ai, "acompletion", AsyncMock(side_effect=RateLimitError("private detail", "model", "request")))
    assert client.post("/api/nda/chat", json=payload()).status_code == 429

    monkeypatch.setattr(ai, "acompletion", AsyncMock(side_effect=Timeout("private detail", "model", "provider")))
    response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 504
    assert "private detail" not in response.text


def test_response_schema_does_not_allow_modifications():
    with pytest.raises(Exception):
        ChatResponse.model_validate({"reply": "ok", "updates": {"modifications": "change"}})


def test_request_schema_and_field_bounds():
    data = payload()
    data["currentData"]["effectiveDate"] = "not-a-date"
    with pytest.raises(Exception):
        ChatRequest.model_validate(data)


def test_sparse_patch_rejects_invalid_terms():
    with pytest.raises(Exception):
        NdaPatch.model_validate({"mndaTermYears": 0})
