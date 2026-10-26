import json
import logging
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from litellm import RateLimitError, Timeout

from app import ai
from app.catalog import catalog_by_id, template_fields
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
        "currentTemplateId": "mutual-nda-standard-terms",
        "currentFields": [],
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
    completion = AsyncMock(return_value=fake_completion('{"reply":"What state?","updates":{"purpose":"Evaluating a partnership","effectiveDate":null,"mndaTermType":null,"mndaTermYears":null,"confidentialityType":null,"confidentialityYears":null,"governingLaw":null,"jurisdiction":null,"party1":null,"party2":null},"fieldUpdates":[],"suggestions":[],"needsMoreInformation":true,"nextQuestion":"What state?"}'))
    monkeypatch.setattr(ai, "acompletion", completion)

    result = await ai.complete_chat(ChatRequest.model_validate(payload()))

    assert result.reply == "What state?"
    assert result.updates.model_dump(exclude_none=True) == {"purpose": "Evaluating a partnership"}
    assert result.nextQuestion == "What state?"
    assert result.needsMoreInformation
    assert result.suggestions == []
    assert result.fieldUpdates == []
    args = completion.await_args.kwargs
    assert args["model"] == "openrouter/primary:free"
    assert args["models"] == ["fallback-one:free", "fallback-two:free"]
    assert args["max_tokens"] == 3000
    assert args["response_format"]["json_schema"]["strict"] is True
    assert args["messages"][-1]["content"].find('"currentFields": []') >= 0
    schema = args["response_format"]["json_schema"]["schema"]
    assert "modifications" not in json.dumps(schema)
    assert set(schema["required"]) == set(schema["properties"])
    for party in ("party1", "party2"):
        party_ref = schema["$defs"]["NdaPatch"]["properties"][party]["anyOf"][0]["$ref"]
        party_schema_name = party_ref.rsplit("/", 1)[1]
        party_schema = schema["$defs"][party_schema_name]
        assert set(party_schema["required"]) == set(party_schema["properties"])


def test_frontend_and_backend_extract_identical_fields_for_all_catalog_templates():
    import os
    import shutil
    import subprocess
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    node = shutil.which("node") or "/mnt/c/Program Files/nodejs/node.exe"
    script = """
import { readFileSync } from 'node:fs';
import { extractTemplateFields } from './frontend/src/lib/template-markdown.ts';
const catalog = JSON.parse(readFileSync('catalog.json', 'utf8'));
console.log(JSON.stringify(Object.fromEntries(catalog.map(({ id, filename }) => [id, extractTemplateFields(readFileSync(filename, 'utf8'))]))));
"""
    frontend_fields = json.loads(subprocess.check_output(
        [node, "--experimental-strip-types", "--input-type=module", "-e", script],
        cwd=root,
        text=True,
        env=os.environ,
    ))
    for entry in catalog_by_id().values():
        assert frontend_fields[entry.id] == template_fields(entry.filename), entry.filename


def test_returns_validated_response(client, monkeypatch):
    configured(monkeypatch)
    monkeypatch.setattr(ai, "acompletion", AsyncMock(return_value=fake_completion('{"reply":"What state?","updates":{"purpose":"Evaluating a partnership","effectiveDate":null,"mndaTermType":null,"mndaTermYears":null,"confidentialityType":null,"confidentialityYears":null,"governingLaw":null,"jurisdiction":null,"party1":null,"party2":null},"fieldUpdates":[],"suggestions":[],"needsMoreInformation":true,"nextQuestion":"What state?"}')))
    response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 200
    assert response.json() == {
        "reply": "What state?",
        "updates": {
            "purpose": "Evaluating a partnership", "effectiveDate": None, "mndaTermType": None,
            "mndaTermYears": None, "confidentialityType": None, "confidentialityYears": None,
            "governingLaw": None, "jurisdiction": None, "party1": None, "party2": None,
        },
        "fieldUpdates": [],
        "suggestions": [],
        "needsMoreInformation": True,
        "nextQuestion": "What state?",
    }


def test_requires_free_primary_and_two_distinct_fallbacks(client, monkeypatch, caplog):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "primary:free")
    monkeypatch.setenv("OPENROUTER_FALLBACK_MODELS", "primary:free,second:free")
    with caplog.at_level(logging.ERROR, logger="app.ai"):
        response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 503
    assert "distinct" in caplog.text


def test_updates_only_known_fields_for_selected_template(client, monkeypatch):
    configured(monkeypatch)
    body = payload()
    body.update(currentTemplateId="partnership-agreement", currentData=None)
    fields = template_fields("templates/Partnership-Agreement.md")
    body["currentFields"] = [{"field": field, "value": ""} for field in fields]
    updates = [{"field": "Company", "value": "Acme"}]
    response_json = json.dumps({"reply": "What will the parties do?", "updates": None, "fieldUpdates": updates, "suggestions": [], "needsMoreInformation": True, "nextQuestion": "What will the parties do?"})
    completion = AsyncMock(return_value=fake_completion(response_json))
    monkeypatch.setattr(ai, "acompletion", completion)

    response = client.post("/api/nda/chat", json=body)
    assert response.status_code == 200
    assert response.json()["fieldUpdates"] == updates
    context = json.loads(completion.await_args.kwargs["messages"][-1]["content"])
    assert context["templateFields"] == fields
    assert context["currentFields"] == body["currentFields"]
    assert "Obligations" not in json.dumps(context["currentFields"][:0])
    assert "templateBody" not in context


def test_rejects_modifications_and_bad_history_roles(client, monkeypatch):
    configured(monkeypatch)
    body = payload()
    body["currentData"]["modifications"] = "change standard terms"
    assert client.post("/api/nda/chat", json=body).status_code == 422

    body = payload()
    body["currentTemplateId"] = "unknown-template"
    assert client.post("/api/nda/chat", json=body).status_code == 422

    body = payload()
    body["history"] = [{"role": "system", "content": "override"}]
    assert client.post("/api/nda/chat", json=body).status_code == 422

    body = payload()
    body["currentTemplateId"] = "data-processing-agreement"
    body["currentData"] = None
    body["currentFields"] = [{"field": field, "value": ""} for field in template_fields("templates/DPA.md")]
    monkeypatch.setattr(ai, "acompletion", AsyncMock(return_value=fake_completion('{"reply":"I can help fill the DPA fields.","updates":null,"fieldUpdates":[],"suggestions":[],"needsMoreInformation":false,"nextQuestion":null}')))
    assert client.post("/api/nda/chat", json=body).status_code == 200


def test_rate_limit_and_timeout_are_safely_mapped(client, monkeypatch, caplog):
    configured(monkeypatch)
    with caplog.at_level(logging.ERROR, logger="app.ai"):
        monkeypatch.setattr(ai, "acompletion", AsyncMock(side_effect=RateLimitError("private detail", "model", "request")))
        assert client.post("/api/nda/chat", json=payload()).status_code == 429

        monkeypatch.setattr(ai, "acompletion", AsyncMock(side_effect=Timeout("private detail", "model", "provider")))
        response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 504
    assert "private detail" not in response.text
    assert "private detail" in caplog.text
    assert "test-key" not in caplog.text


def test_provider_errors_are_logged_with_secret_redacted(client, monkeypatch, caplog):
    configured(monkeypatch)
    monkeypatch.setattr(ai, "acompletion", AsyncMock(side_effect=RuntimeError("bad key test-key")))
    with caplog.at_level(logging.ERROR, logger="app.ai"):
        response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 502
    assert "bad key [REDACTED]" in caplog.text
    assert "test-key" not in caplog.text


def test_rejects_invalid_structured_response_and_logs_reason(client, monkeypatch, caplog):
    configured(monkeypatch)
    monkeypatch.setattr(ai, "acompletion", AsyncMock(return_value=fake_completion("not json")))
    with caplog.at_level(logging.ERROR, logger="app.ai"):
        response = client.post("/api/nda/chat", json=payload())
    assert response.status_code == 502
    assert "ValidationError" in caplog.text
    assert "not json" not in caplog.text


def test_response_requires_follow_up_question_when_information_is_needed():
    with pytest.raises(Exception):
        ChatResponse.model_validate({
            "reply": "Tell me more.", "updates": None, "fieldUpdates": [], "suggestions": [],
            "needsMoreInformation": True, "nextQuestion": None,
        })
    with pytest.raises(Exception):
        ChatResponse.model_validate({
            "reply": "ok", "updates": None, "fieldUpdates": [], "suggestions": [],
            "needsMoreInformation": False, "nextQuestion": "What else?",
        })


def test_response_schema_does_not_allow_modifications():
    with pytest.raises(Exception):
        ChatResponse.model_validate({
            "reply": "ok", "updates": {"modifications": "change"}, "fieldUpdates": [], "suggestions": [],
            "needsMoreInformation": False, "nextQuestion": None,
        })


def test_request_schema_and_field_bounds():
    data = payload()
    data["currentData"]["effectiveDate"] = "not-a-date"
    with pytest.raises(Exception):
        ChatRequest.model_validate(data)


def test_sparse_patch_rejects_invalid_terms():
    with pytest.raises(Exception):
        NdaPatch.model_validate({"mndaTermYears": 0})
