FROM ghcr.io/astral-sh/uv:0.13.4 AS uv

FROM python:3.12-slim

COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev

COPY backend/app ./app
COPY catalog.json /catalog.json
COPY templates/ /templates/
ENV PATH="/app/.venv/bin:$PATH" \
    DATABASE_PATH=/tmp/prelegal.sqlite3

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
