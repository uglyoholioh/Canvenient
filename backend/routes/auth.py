import bcrypt
from fastapi import APIRouter, HTTPException, status

from database import db
from dependencies import CurrentUser
from models.auth import AuthResponse
from models.user import ProfileUpdate, UserCreate, UserLogin, UserSummary
from security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


def build_user_summary(record) -> UserSummary:
    return UserSummary(
        id=record["id"],
        email=record["email"],
        name=record["name"] or "",
        canvas_token=record["canvas_token"] or "",
        theme=record["theme"] or "default",
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
    user_summary = UserSummary(id=user["id"], email=user["email"])
    return AuthResponse(
        access_token=create_access_token(user_summary.id),
        user=user_summary,
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

    user_summary = build_user_summary(user)
    return AuthResponse(
        access_token=create_access_token(user_summary.id),
        user=user_summary,
    )


@router.get("/me", response_model=UserSummary)
async def get_current_session_user(current_user: CurrentUser):
    return current_user


@router.patch("/profile", response_model=UserSummary)
async def update_profile(data: ProfileUpdate, current_user: CurrentUser):
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
            "canvas_token": data.canvas_token,
            "theme": data.theme,
        },
    )
    return UserSummary(
        id=current_user.id,
        email=current_user.email,
        name=data.name,
        canvas_token=data.canvas_token,
        theme=data.theme,
    )
