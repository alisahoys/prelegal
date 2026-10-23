import sqlite3
from pathlib import Path


def initialize_database(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database_path.unlink(missing_ok=True)

    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
