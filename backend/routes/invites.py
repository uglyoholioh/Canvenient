import secrets
from fastapi import APIRouter, HTTPException, status
from database import db
from dependencies import CurrentUser
from models.invite import InviteCreate, InviteOut

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(payload: InviteCreate, current_user: CurrentUser):
    # 1. Verify that the user is an admin of the group
    member = await db.fetch_one(
        query="""
            SELECT role 
            FROM g_members 
            WHERE g_id = :g_id AND user_id = :user_id
        """,
        values={"g_id": payload.g_id, "user_id": current_user.id}
    )
    
    if not member or member["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can create invite links."
        )
        
    # 2. Generate a random short URL code
    code = secrets.token_urlsafe(8)
    
    # 3. Store the invite in the database
    row = await db.fetch_one(
        query="""
            INSERT INTO invites (creator_id, code, g_id)
            VALUES (:creator_id, :code, :g_id)
            RETURNING code, g_id
        """,
        values={
            "creator_id": current_user.id,
            "code": code,
            "g_id": payload.g_id
        }
    )
    
    return InviteOut.model_validate(dict(row))


@router.post("/join/{code}", status_code=status.HTTP_200_OK)
async def join_group(code: str, current_user: CurrentUser):
    # 1. Fetch group ID associated with the invite code
    invite = await db.fetch_one(
        query="""
            SELECT g_id 
            FROM invites 
            WHERE code = :code
        """,
        values={"code": code}
    )
    
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invite link."
        )
        
    g_id = invite["g_id"]
    
    # 2. Add user to group memberships, silently ignoring duplicates
    await db.execute(
        query="""
            INSERT INTO g_members (g_id, user_id, role)
            VALUES (:g_id, :user_id, 'member')
            ON CONFLICT (g_id, user_id) DO NOTHING
        """,
        values={"g_id": g_id, "user_id": current_user.id}
    )
    
    return {
        "message": "Successfully joined group!",
        "g_id": g_id
    }
