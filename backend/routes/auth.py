import bcrypt
from fastapi import APIRouter, HTTPException, status

from database import db
from dependencies import CurrentUser
from models.auth import AuthResponse
from models.user import UserCreate, UserLogin, UserSummary
from security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


def build_user_summary(record) -> UserSummary:
    return UserSummary(id=record["id"], email=record["email"])


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
    user_summary = build_user_summary(user)
    return AuthResponse(
        access_token=create_access_token(user_summary.id),
        user=user_summary,
    )


@router.post("/login", response_model=AuthResponse)
async def login(data: UserLogin):
    normalized_email = data.email.strip().lower()
    query = """
        SELECT id, email, hashed_password
        FROM users
        WHERE LOWER(email) = LOWER(:email)
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
