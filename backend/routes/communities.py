from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.community import CommunityCreate, CommunityUpdate, CommunityOut

router = APIRouter(prefix="/communities", tags=["communities"])

@router.get("", response_model = list[CommunityOut])
async def get_communities(current_user: CurrentUser):
    rows = await db.fetch_all(
        query = """
            SELECT c.*
            FROM communities c
            WHERE c.user_id = :user_id
            UNION
            SELECT DISTINCT c.*
            FROM communities c
            JOIN groups g ON g.c_id = c.id
            JOIN g_members gm ON gm.g_id = g.id
            WHERE gm.user_id = :user_id
            ORDER BY id
        """,
        values = {"user_id": current_user.id}
    )
    return [CommunityOut.model_validate(dict(row)) for row in rows]

@router.post("", response_model = CommunityOut, status_code = status.HTTP_201_CREATED)
async def create_community(payload: CommunityCreate, current_user: CurrentUser):
    row = await db.fetch_one(
        query = """
            INSERT INTO communities (user_id, name, description)
            VALUES (:user_id, :name, :description)
            RETURNING *
        """,
        values = {"user_id": current_user.id, "name": payload.name, "description": payload.description}
    )
    return CommunityOut.model_validate(dict(row))

