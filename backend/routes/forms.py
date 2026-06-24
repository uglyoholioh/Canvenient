import json
from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.form import FormCreate, FormOut, FormUpdate, FormResponseCreate, FormResponseOut
from typing import Any

router = APIRouter(prefix="/forms", tags=["forms"])


def build_form(record) -> dict[str, Any]:
    d = dict(record)
    if isinstance(d.get("fields"), str):
        d["fields"] = json.loads(d["fields"])
    return d


def build_response(record) -> dict[str, Any]:
    d = dict(record)
    if isinstance(d.get("response_data"), str):
        d["response_data"] = json.loads(d["response_data"])
    return d


@router.get("", response_model=list[FormOut])
async def list_forms(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT DISTINCT f.*
            FROM cg_forms f
            LEFT JOIN g_members gm ON gm.g_id = f.g_id
            LEFT JOIN groups g ON g.c_id = f.c_id
            LEFT JOIN g_members gm_comm ON gm_comm.g_id = g.id
            WHERE f.user_id = :user_id
               OR gm.user_id = :user_id
               OR gm_comm.user_id = :user_id
            ORDER BY f.created_at DESC
        """,
        values={"user_id": current_user.id}
    )
    return [FormOut.model_validate(build_form(row)) for row in rows]


@router.post("", response_model=FormOut, status_code=status.HTTP_201_CREATED)
async def create_form(payload: FormCreate, current_user: CurrentUser):
    if payload.g_id is not None:
        member = await db.fetch_one(
            query="""
                SELECT role FROM g_members 
                WHERE g_id = :g_id AND user_id = :user_id
            """,
            values={"g_id": payload.g_id, "user_id": current_user.id}
        )
        if not member or member["role"] != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only group admins can create forms for this group."
            )
    elif payload.c_id is not None:
        comm = await db.fetch_one(
            query="""
                SELECT user_id FROM communities WHERE id = :c_id
            """,
            values={"c_id": payload.c_id}
        )
        if not comm or comm["user_id"] != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the community creator can create forms for this community."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Form must belong to either a group or community."
        )

    async with db.transaction():
        row = await db.fetch_one(
            query="""
                INSERT INTO cg_forms (user_id, c_id, g_id, title, description, form_type, fields, closes_at)
                VALUES (:user_id, :c_id, :g_id, :title, :description, :form_type, :fields, :closes_at)
                RETURNING *
            """,
            values={
                "user_id": current_user.id,
                "c_id": payload.c_id,
                "g_id": payload.g_id,
                "title": payload.title,
                "description": payload.description,
                "form_type": payload.form_type,
                "fields": json.dumps(payload.fields),
                "closes_at": payload.closes_at
            }
        )
        
        member_ids = []
        if payload.g_id is not None:
            records = await db.fetch_all(
                query="""
                    SELECT user_id FROM g_members 
                    WHERE g_id = :g_id AND user_id != :creator_id
                """,
                values={"g_id": payload.g_id, "creator_id": current_user.id}
            )
            member_ids = [r["user_id"] for r in records]
        elif payload.c_id is not None:
            records = await db.fetch_all(
                query="""
                    SELECT DISTINCT gm.user_id 
                    FROM g_members gm
                    JOIN groups g ON gm.g_id = g.id
                    WHERE g.c_id = :c_id AND gm.user_id != :creator_id
                """,
                values={"c_id": payload.c_id, "creator_id": current_user.id}
            )
            member_ids = [r["user_id"] for r in records]
            
        for m_id in member_ids:
            await db.execute(
                query="""
                    INSERT INTO notifications (user_id, title, description)
                    VALUES (:user_id, :title, :description)
                """,
                values={
                    "user_id": m_id,
                    "title": f"New Form: {payload.title}",
                    "description": f"A new form/poll has been published: {payload.description or 'No description provided'}."
                }
            )
            
        return FormOut.model_validate(build_form(row))


@router.get("/{form_id}", response_model=FormOut)
async def get_form(form_id: int, current_user: CurrentUser):
    row = await db.fetch_one(
        query="""
            SELECT DISTINCT f.*
            FROM cg_forms f
            LEFT JOIN g_members gm ON gm.g_id = f.g_id
            LEFT JOIN groups g ON g.c_id = f.c_id
            LEFT JOIN g_members gm_comm ON gm_comm.g_id = g.id
            WHERE f.id = :form_id AND (
                f.user_id = :user_id
                OR gm.user_id = :user_id
                OR gm_comm.user_id = :user_id
            )
        """,
        values={"form_id": form_id, "user_id": current_user.id}
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found or access denied."
        )
    return FormOut.model_validate(build_form(row))


@router.post("/{form_id}/responses", response_model=FormResponseOut, status_code=status.HTTP_201_CREATED)
async def submit_response(form_id: int, payload: FormResponseCreate, current_user: CurrentUser):
    form = await get_form(form_id, current_user)
    if form.closes_at and form.closes_at < datetime.now(form.closes_at.tzinfo):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This form is closed for submissions."
        )
        
    try:
        row = await db.fetch_one(
            query="""
                INSERT INTO cg_form_responses (form_id, user_id, response_data)
                VALUES (:form_id, :user_id, :response_data)
                RETURNING *
            """,
            values={
                "form_id": form_id,
                "user_id": current_user.id,
                "response_data": json.dumps(payload.response_data)
            }
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted a response for this form."
        ) from exc
        
    return FormResponseOut.model_validate(build_response(row))


@router.get("/{form_id}/responses", response_model=list[FormResponseOut])
async def list_responses(form_id: int, current_user: CurrentUser):
    form = await get_form(form_id, current_user)
    
    is_admin = False
    if form.user_id == current_user.id:
        is_admin = True
    elif form.g_id is not None:
        member = await db.fetch_one(
            query="""
                SELECT role FROM g_members 
                WHERE g_id = :g_id AND user_id = :user_id
            """,
            values={"g_id": form.g_id, "user_id": current_user.id}
        )
        if member and member["role"] == "admin":
            is_admin = True
    elif form.c_id is not None:
        comm = await db.fetch_one(
            query="""
                SELECT user_id FROM communities WHERE id = :c_id
            """,
            values={"c_id": form.c_id}
        )
        if comm and comm["user_id"] == current_user.id:
            is_admin = True
            
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only form admins can view submissions."
        )
        
    rows = await db.fetch_all(
        query="""
            SELECT * FROM cg_form_responses 
            WHERE form_id = :form_id
            ORDER BY submitted_at DESC
        """,
        values={"form_id": form_id}
    )
    return [FormResponseOut.model_validate(build_response(row)) for row in rows]


@router.get("/{form_id}/stats", response_model=dict[str, Any])
async def get_form_stats(form_id: int, current_user: CurrentUser):
    form = await get_form(form_id, current_user)
    
    is_admin = False
    if form.user_id == current_user.id:
        is_admin = True
    elif form.g_id is not None:
        member = await db.fetch_one(
            query="""
                SELECT role FROM g_members 
                WHERE g_id = :g_id AND user_id = :user_id
            """,
            values={"g_id": form.g_id, "user_id": current_user.id}
        )
        if member and member["role"] == "admin":
            is_admin = True
    elif form.c_id is not None:
        comm = await db.fetch_one(
            query="""
                SELECT user_id FROM communities WHERE id = :c_id
            """,
            values={"c_id": form.c_id}
        )
        if comm and comm["user_id"] == current_user.id:
            is_admin = True
            
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only form admins can view statistics."
        )
        
    resp_count = await db.fetch_val(
        query="""
            SELECT COUNT(*) FROM cg_form_responses 
            WHERE form_id = :form_id
        """,
        values={"form_id": form_id}
    )
    
    total_members = 0
    if form.g_id is not None:
        total_members = await db.fetch_val(
            query="""
                SELECT COUNT(*) FROM g_members 
                WHERE g_id = :g_id
            """,
            values={"g_id": form.g_id}
        )
    elif form.c_id is not None:
        total_members = await db.fetch_val(
            query="""
                SELECT COUNT(DISTINCT gm.user_id) 
                FROM g_members gm
                JOIN groups g ON gm.g_id = g.id
                WHERE g.c_id = :c_id
            """,
            values={"c_id": form.c_id}
        )
        
    return {
        "form_id": form_id,
        "responses_count": resp_count,
        "total_members": total_members,
        "response_rate": (resp_count / total_members) if total_members > 0 else 0.0
    }
