import bcrypt
from fastapi import APIRouter, HTTPException, status

from database import db
from dependencies import CurrentUser
from models.auth import AuthResponse
from models.user import ProfileUpdate, UserCreate, UserLogin, UserPublic, UserSummary
from security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


def canvas_token_hint(token: str | None) -> str:
    return f"•••• {token[-4:]}" if token else ""


def build_user_public(record) -> UserPublic:
    token = record["canvas_token"] or ""
    return UserPublic(
        id=record["id"],
        email=record["email"],
        name=record["name"] or "",
        theme=record["theme"] or "default",
        canvas_connected=bool(token),
        canvas_token_hint=canvas_token_hint(token),
    )


def to_public_user(summary: UserSummary) -> UserPublic:
    return UserPublic(
        id=summary.id,
        email=summary.email,
        name=summary.name,
        theme=summary.theme,
        canvas_connected=bool(summary.canvas_token),
        canvas_token_hint=canvas_token_hint(summary.canvas_token),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate):
    normalized_email = data.email.strip().lower()
    query = "SELECT id FROM users WHERE LOWER(email) = LOWER(:email)"
    existing = await db.fetch_one(query=query, values={"email": normalized_email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt())
    insert_query = """
        INSERT INTO users (email, hashed_password)
        VALUES (:email, :password)
        RETURNING id, email
    """
    user = await db.fetch_one(
        query=insert_query,
        values={"email": normalized_email, "password": hashed},
    )
    user_public = UserPublic(id=user["id"], email=user["email"])
    return AuthResponse(
        access_token=create_access_token(user_public.id),
        user=user_public,
    )


@router.post("/login", response_model=AuthResponse)
async def login(data: UserLogin):
    normalized_email = data.email.strip().lower()
    query = """
        SELECT u.id, u.email, u.hashed_password,
               COALESCE(s.name, '')         AS name,
               COALESCE(s.canvas_token, '') AS canvas_token,
               COALESCE(s.theme, 'default') AS theme
        FROM users u
        LEFT JOIN user_settings s ON s.user_id = u.id
        WHERE LOWER(u.email) = LOWER(:email)
    """
    user = await db.fetch_one(query=query, values={"email": normalized_email})
    if not user or not bcrypt.checkpw(data.password.encode(), user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return AuthResponse(
        access_token=create_access_token(user["id"]),
        user=build_user_public(user),
    )


@router.get("/me", response_model=UserPublic)
async def get_current_session_user(current_user: CurrentUser):
    return to_public_user(current_user)


@router.patch("/profile", response_model=UserPublic)
async def update_profile(data: ProfileUpdate, current_user: CurrentUser):
    # Omitted canvas_token keeps the stored one; "" disconnects.
    effective_token = data.canvas_token
    if effective_token is None:
        existing = await db.fetch_one(
            query="SELECT canvas_token FROM user_settings WHERE user_id = :user_id",
            values={"user_id": current_user.id},
        )
        effective_token = (existing["canvas_token"] if existing else "") or ""

    await db.execute(
        query="""
            INSERT INTO user_settings (user_id, name, canvas_token, theme)
            VALUES (:user_id, :name, :canvas_token, :theme)
            ON CONFLICT (user_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                canvas_token = EXCLUDED.canvas_token,
                theme = EXCLUDED.theme
        """,
        values={
            "user_id": current_user.id,
            "name": data.name,
            "canvas_token": effective_token,
            "theme": data.theme,
        },
    )
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        name=data.name,
        theme=data.theme,
        canvas_connected=bool(effective_token),
        canvas_token_hint=canvas_token_hint(effective_token),
    )
