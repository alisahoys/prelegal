import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.database import initialize_database

DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", "/tmp/prelegal.sqlite3"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database(DATABASE_PATH)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
