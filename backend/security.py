import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, status

load_dotenv()

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7))
)
JWT_ALGORITHM = "HS256"


def _load_or_create_jwt_secret() -> str:
    env_secret = os.getenv("JWT_SECRET")
    if env_secret:
        return env_secret

    # Desktop installs run without a configured secret: persist a random
    # per-install key next to the SQLite database so sessions survive
    # restarts without signing tokens with a guessable constant.
    database_url = os.getenv("DATABASE_URL") or ""
    if "sqlite" in database_url.lower():
        db_path = database_url.split("///", 1)[-1]
        if db_path:
            secret_path = Path(db_path).parent / "jwt_secret"
            try:
                secret_path.parent.mkdir(parents=True, exist_ok=True)
                if secret_path.exists():
                    existing = secret_path.read_text(encoding="utf-8").strip()
                    if existing:
                        return existing
                generated = secrets.token_hex(32)
                secret_path.write_text(generated, encoding="utf-8")
                return generated
            except OSError:
                pass

    # Server deployments should set JWT_SECRET explicitly; an ephemeral key
    # (which resets sessions on restart) is still safer than a constant.
    logging.getLogger("canvenient.security").warning(
        "JWT_SECRET is not set; using an ephemeral random key (sessions reset on restart)."
    )
    return secrets.token_hex(32)


JWT_SECRET = _load_or_create_jwt_secret()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _unauthorized(detail: str = "Invalid or expired token.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()
        ),
    }
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}

    header_segment = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    signature_segment = _b64url_encode(signature)
    return f"{header_segment}.{payload_segment}.{signature_segment}"


def decode_access_token(token: str) -> dict:
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:
        raise _unauthorized() from exc

    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()

    try:
        provided_signature = _b64url_decode(signature_segment)
    except Exception as exc:
        raise _unauthorized() from exc

    if not hmac.compare_digest(expected_signature, provided_signature):
        raise _unauthorized()

    try:
        header = json.loads(_b64url_decode(header_segment))
        payload = json.loads(_b64url_decode(payload_segment))
    except Exception as exc:
        raise _unauthorized() from exc

    if header.get("alg") != JWT_ALGORITHM:
        raise _unauthorized()

    exp = payload.get("exp")
    sub = payload.get("sub")

    if not exp or not sub:
        raise _unauthorized()

    if datetime.now(timezone.utc).timestamp() >= exp:
        raise _unauthorized("Your session has expired. Please log in again.")

    return payload
