import bcrypt
from fastapi import APIRouter, HTTPException, status
from database import db
from models.user import UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt())
    doc = {
        "email": data.email,
        "hashed_password": hashed,
    }
    result = await db.users.insert_one(doc)
    return {"id": str(result.inserted_id), "email": data.email}

@router.post("/login")
async def login(data: UserCreate):
    user = await db.users.find_one({"email": data.email})
    if not user or not bcrypt.checkpw(data.password.encode(), user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"message": "Login successful", "user_id": str(user["_id"])}
