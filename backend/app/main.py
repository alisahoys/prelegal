import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException

from app.ai import AIConfigurationError, AIProviderError, AIRateLimitError, AITimeoutError, complete_chat
from app.database import initialize_database
from app.schemas import ChatRequest, ChatResponse

DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", "/tmp/prelegal.sqlite3"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database(DATABASE_PATH)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/nda/chat", response_model=ChatResponse, response_model_exclude_none=False)
async def nda_chat(request: ChatRequest) -> ChatResponse:
    try:
        return await complete_chat(request)
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail="AI chat is not configured.") from exc
    except AIRateLimitError:
        raise HTTPException(
            status_code=429,
            detail="The free AI models are temporarily rate-limited. Your draft is unchanged; try again or continue editing manually.",
        ) from None
    except AITimeoutError:
        raise HTTPException(status_code=504, detail="The AI request timed out. Your draft is unchanged; please try again.") from None
    except AIProviderError:
        raise HTTPException(status_code=502, detail="The AI service could not complete this request. Your draft is unchanged; please try again.") from None
