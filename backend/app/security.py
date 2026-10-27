import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

password_hasher = PasswordHasher()
SESSION_DURATION = timedelta(days=7)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerificationError:
        return False


def new_session() -> tuple[str, str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = (datetime.now(UTC) + SESSION_DURATION).isoformat()
    return token, token_hash, expires_at


def session_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
