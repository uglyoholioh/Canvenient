from fastapi import APIRouter, HTTPException
from typing import Any, Optional
from pydantic import BaseModel
from database import db
from dependencies import CurrentUser
from datetime import datetime

router = APIRouter(prefix="/folders", tags=["Folders"])

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

@router.get("")
async def get_folders(current_user: CurrentUser) -> Any:
    query = "SELECT * FROM folders WHERE user_id = :user_id ORDER BY name ASC"
    rows = await db.fetch_all(query=query, values={"user_id": current_user.id})
    return [dict(r) for r in rows]

@router.post("")
async def create_folder(folder: FolderCreate, current_user: CurrentUser) -> Any:
    query = """
        INSERT INTO folders (user_id, name, parent_id)
        VALUES (:user_id, :name, :parent_id)
        RETURNING id
    """
    values = {
        "user_id": current_user.id,
        "name": folder.name,
        "parent_id": folder.parent_id
    }
    new_id = await db.execute(query=query, values=values)
    
    get_query = "SELECT * FROM folders WHERE id = :id"
    row = await db.fetch_one(query=get_query, values={"id": new_id})
    return dict(row)

@router.patch("/{folder_id}")
async def update_folder(folder_id: int, folder: FolderUpdate, current_user: CurrentUser) -> Any:
    updates = []
    values = {"id": folder_id, "user_id": current_user.id}
    
    if folder.name is not None:
        updates.append("name = :name")
        values["name"] = folder.name
    if folder.parent_id is not None:
        updates.append("parent_id = :parent_id")
        values["parent_id"] = folder.parent_id
        
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
        
    query = f"""
        UPDATE folders 
        SET {', '.join(updates)}
        WHERE id = :id AND user_id = :user_id
    """
    await db.execute(query=query, values=values)
    
    get_query = "SELECT * FROM folders WHERE id = :id"
    row = await db.fetch_one(query=get_query, values={"id": folder_id})
    return dict(row)

@router.delete("/{folder_id}")
async def delete_folder(folder_id: int, current_user: CurrentUser) -> Any:
    query = "DELETE FROM folders WHERE id = :id AND user_id = :user_id"
    await db.execute(query=query, values={"id": folder_id, "user_id": current_user.id})
    return {"success": True}
