import bcrypt
from fastapi import APIRouter, HTTPException, status
from database import db
from models.user import UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate):
    query = "SELECT * FROM users WHERE email = :email"
    existing = await db.fetch_one(query=query, values={"email": data.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt())
    insert_query = "INSERT INTO users (email, hashed_password) VALUES (:email, :password) RETURNING id"
    user_id = await db.execute(query=insert_query, values={"email": data.email, "password": hashed})
    return {"id": str(user_id), "email": data.email}

@router.post("/login")
async def login(data: UserLogin):
    query = "SELECT * FROM users WHERE email = :email"
    user = await db.fetch_one(query=query, values={"email": data.email})
    if not user or not bcrypt.checkpw(data.password.encode(), user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"message": "Login successful", "user_id": str(user["id"])}

