from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.group import GroupCreate, GroupOut, GroupUpdate, GroupMemberOut

router = APIRouter(prefix = "/groups", tags = ["groups"])

@router.get("", response_model = list[GroupOut])
async def get_groups(current_user: CurrentUser):
    rows = await db.fetch_all(
        query = """
            SELECT g.*, gm.role
            FROM groups g
            JOIN g_members gm ON gm.g_id = g.id
            WHERE gm.user_id = :user_id
        """,
        values = {"user_id": current_user.id}
    )
    return [GroupOut.model_validate(dict(row)) for row in rows]

@router.post("", response_model = GroupOut, status_code = status.HTTP_201_CREATED)
async def create_group(payload: GroupCreate, current_user: CurrentUser):
    # Verify community exists and belongs to the current user
    comm = await db.fetch_one(
        query="SELECT user_id FROM communities WHERE id = :c_id",
        values={"c_id": payload.c_id}
    )
    if not comm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community not found."
        )
    if comm["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the community creator can create groups in this community."
        )

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
        
        group_dict = dict(row)
        group_dict["role"] = "admin"
        return GroupOut.model_validate(group_dict)


@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
async def get_group_members(group_id: int, current_user: CurrentUser):
    member_check = await db.fetch_one(
        query="SELECT role FROM g_members WHERE g_id = :g_id AND user_id = :user_id",
        values={"g_id": group_id, "user_id": current_user.id}
    )
    if not member_check:
        raise HTTPException(status_code=403, detail="You are not a member of this group.")

    rows = await db.fetch_all(
        query="""
            SELECT gm.user_id, COALESCE(us.name, '') AS name, u.email, gm.role
            FROM g_members gm
            JOIN users u ON u.id = gm.user_id
            LEFT JOIN user_settings us ON us.user_id = gm.user_id
            WHERE gm.g_id = :g_id
            ORDER BY gm.role DESC, u.email ASC
        """,
        values={"g_id": group_id}
    )
    return [GroupMemberOut.model_validate(dict(row)) for row in rows]
