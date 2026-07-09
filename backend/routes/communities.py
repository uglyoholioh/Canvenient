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


@router.patch("/{community_id}", response_model=CommunityOut)
async def update_community(community_id: int, payload: CommunityUpdate, current_user: CurrentUser):
    existing = await db.fetch_one(
        query="SELECT * FROM communities WHERE id = :id",
        values={"id": community_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Community not found.")
    
    if existing["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the community creator can update this community."
        )
        
    updates = payload.model_dump(exclude_unset=True)
    name = updates.get("name")
    if name is not None:
        name = name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Community name cannot be empty.")
    else:
        name = existing["name"]
        
    description = updates.get("description") if "description" in updates else existing["description"]
    if description is None:
        description = ""
    
    row = await db.fetch_one(
        query="""
            UPDATE communities
            SET name = :name, description = :description
            WHERE id = :id
            RETURNING *
        """,
        values={"id": community_id, "name": name, "description": description}
    )
    return CommunityOut.model_validate(dict(row))


@router.delete("/{community_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_community(community_id: int, current_user: CurrentUser):
    existing = await db.fetch_one(
        query="SELECT * FROM communities WHERE id = :id",
        values={"id": community_id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Community not found.")
        
    if existing["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the community creator can delete this community."
        )
        
    await db.execute(
        query="DELETE FROM communities WHERE id = :id",
        values={"id": community_id}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


