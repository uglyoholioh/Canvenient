from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.group import GroupCreate, GroupOut, GroupUpdate

router = APIRouter(prefix = "/groups", tags = ["groups"])

@router.get("", response_model = list[GroupOut])
async def get_groups(current_user: CurrentUser):
    rows = await db.fetch_all(
        query = """
            SELECT g.*
            FROM groups g
            JOIN g_members gm ON gm.g_id = g.id
            WHERE gm.user_id = :user_id
        """,
        values = {"user_id": current_user.id}
    )
    return [GroupOut.model_validate(dict(row)) for row in rows]

@router.post("", response_model = GroupOut, status_code = status.HTTP_201_CREATED)
async def create_group(payload: GroupCreate, current_user: CurrentUser):
    async with db.transaction():
        row = await db.fetch_one(
            query = """
                INSERT INTO groups (user_id, c_id, name, description)
                VALUES (:user_id, :c_id, :name, :description)
                RETURNING *
            """,
            values = {
                "user_id": current_user.id,
                "c_id": payload.c_id,
                "name": payload.name,
                "description": payload.description
            }
        )
        
        #adding creator as first member and admin
        await db.execute(
            query = """
                INSERT INTO g_members (g_id, user_id, role)
                VALUES (:g_id, :user_id, 'admin')
            """,
            values = {
                "g_id": row["id"],
                "user_id": current_user.id
            }
        )
        
        return GroupOut.model_validate(dict(row))

