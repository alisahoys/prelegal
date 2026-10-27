import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_startup_recreates_users_table(monkeypatch, tmp_path: Path):
    database_path = tmp_path / "prelegal.sqlite3"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, created_at TEXT)"
        )
        connection.execute("INSERT INTO users VALUES (1, 'stale@example.test', 'hash', 'now')")

    monkeypatch.setattr("app.main.DATABASE_PATH", database_path)

    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}

    with sqlite3.connect(database_path) as connection:
        tables = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        columns = connection.execute("PRAGMA table_info(users)").fetchall()
        rows = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    assert tables == [("users",), ("sessions",), ("saved_documents",)]
    assert [column[1] for column in columns] == ["id", "email", "password_hash", "created_at"]
    assert rows == 0
