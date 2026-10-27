from fastapi.testclient import TestClient

from app.main import app


def signup(client: TestClient, email: str) -> str:
    response = client.post("/api/auth/signup", json={"email": email, "password": "test-password-long"})
    assert response.status_code == 201
    return response.json()["accessToken"]


def document_payload(title: str = "NDA draft") -> dict:
    return {
        "title": title,
        "state": {
            "templateId": "mutual-nda-standard-terms",
            "ndaData": {
                "purpose": "Evaluate a partnership",
                "effectiveDate": "2026-10-27",
                "mndaTermType": "expires",
                "mndaTermYears": 1,
                "confidentialityType": "years",
                "confidentialityYears": 1,
                "governingLaw": "",
                "jurisdiction": "",
                "modifications": "",
                "party1": {"name": "", "title": "", "company": "", "noticeAddress": ""},
                "party2": {"name": "", "title": "", "company": "", "noticeAddress": ""},
            },
            "fields": {},
        },
    }


def test_documents_are_isolated_by_user_and_updates_keep_identity(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATABASE_PATH", tmp_path / "prelegal.sqlite3")
    with TestClient(app) as client:
        user_a = signup(client, "a@example.com")
        created = client.post("/api/documents", headers={"Authorization": f"Bearer {user_a}"}, json=document_payload())
        assert created.status_code == 201
        document = created.json()
        user_b = signup(client, "b@example.com")
        headers_b = {"Authorization": f"Bearer {user_b}"}
        assert client.get("/api/documents", headers=headers_b).json() == {"items": []}
        assert client.get(f"/api/documents/{document['id']}", headers=headers_b).status_code == 404
        assert client.put(f"/api/documents/{document['id']}", headers=headers_b, json=document_payload("Stolen" )).status_code == 404
        updated = client.put(f"/api/documents/{document['id']}", headers={"Authorization": f"Bearer {user_a}"}, json=document_payload("Updated"))
        assert updated.status_code == 200
        assert updated.json()["id"] == document["id"]
        assert updated.json()["title"] == "Updated"


def test_auth_uses_hashed_password_and_revocable_opaque_session(tmp_path, monkeypatch):
    monkeypatch.setattr("app.main.DATABASE_PATH", tmp_path / "prelegal.sqlite3")
    with TestClient(app) as client:
        signup_response = client.post("/api/auth/signup", json={"email": "a@example.com", "password": "test-password-long"})
        assert signup_response.status_code == 201
        token = signup_response.json()["accessToken"]
        assert "test-password-long" not in signup_response.text
        assert "password_hash" not in signup_response.text
        assert client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"}).json()["user"]["email"] == "a@example.com"
        assert client.post("/api/auth/signout", headers={"Authorization": f"Bearer {token}"}).status_code == 204
        assert client.get("/api/auth/session", headers={"Authorization": f"Bearer {token}"}).status_code == 401
