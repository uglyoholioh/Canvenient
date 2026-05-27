from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import db
from models.user import UserSummary
from security import decode_access_token


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserSummary:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id = int(payload["sub"])
    user = await db.fetch_one(
        query="""
            SELECT u.id, u.email,
                   COALESCE(s.name, '')         AS name,
                   COALESCE(s.canvas_token, '') AS canvas_token
            FROM users u
            LEFT JOIN user_settings s ON s.user_id = u.id
            WHERE u.id = :user_id
        """,
        values={"user_id": user_id},
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return UserSummary(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        canvas_token=user["canvas_token"],
    )


CurrentUser = Annotated[UserSummary, Depends(get_current_user)]
