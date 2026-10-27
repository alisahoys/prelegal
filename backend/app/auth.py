import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from app.database import database_connection
from app.schemas import AuthRequest, UserResponse
from app.security import hash_password, new_session, session_token_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_current_user(request: Request, authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token_hash = session_token_hash(authorization.removeprefix("Bearer "))
    with database_connection(request.app.state.database_path) as connection:
        row = connection.execute(
            "SELECT users.id, users.email, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?",
            (token_hash,),
        ).fetchone()
    if row is None or datetime.fromisoformat(row["expires_at"]) <= datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Authentication required.")
    return {"id": row["id"], "email": row["email"]}


def create_session(request: Request, user_id: int) -> str:
    token, token_hash, expires_at = new_session()
    with database_connection(request.app.state.database_path) as connection:
        connection.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash, user_id, expires_at))
    return token


def user_response(row) -> UserResponse:
    return UserResponse(id=row["id"], email=row["email"])


@router.post("/signup", status_code=201)
def signup(payload: AuthRequest, request: Request) -> dict:
    try:
        with database_connection(request.app.state.database_path) as connection:
            cursor = connection.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (payload.email, hash_password(payload.password)))
            row = connection.execute("SELECT id, email FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc
    return {"accessToken": create_session(request, row["id"]), "user": user_response(row)}


@router.post("/signin")
def signin(payload: AuthRequest, request: Request) -> dict:
    with database_connection(request.app.state.database_path) as connection:
        row = connection.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (payload.email,)).fetchone()
    if row is None or not verify_password(row["password_hash"], payload.password):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {"accessToken": create_session(request, row["id"]), "user": user_response(row)}


@router.get("/session")
def session(user: dict = Depends(get_current_user)) -> dict:
    return {"user": user}


@router.post("/signout", status_code=204)
def signout(request: Request, response: Response, user: dict = Depends(get_current_user), authorization: str = Header()) -> Response:
    del user
    token_hash = session_token_hash(authorization.removeprefix("Bearer "))
    with database_connection(request.app.state.database_path) as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
    response.status_code = 204
    return response
