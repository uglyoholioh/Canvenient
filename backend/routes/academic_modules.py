from fastapi import APIRouter, HTTPException

from database import db
from dependencies import CurrentUser
from models.academic_module import (
    AcademicModuleCreate,
    AcademicModuleOut,
    AcademicModuleSelectionUpdate,
)
from module_colors import ensure_discovered_module_colors, normalize_module_code
from routes.canvas import list_canvas_courses

router = APIRouter(prefix="/academic-modules", tags=["academic-modules"])


async def sync_canvas_courses_as_academic_modules(current_user: CurrentUser) -> None:
    """Ensure task course pickers have local module IDs even before a task sync."""
    for course in await list_canvas_courses(current_user):
        await db.execute(
            query="""
                INSERT INTO academic_modules (
                    user_id, module_code, name, source_type, source_course_id, external_url
                )
                VALUES (
                    :user_id, :module_code, :name, 'canvas', :source_course_id, :external_url
                )
                ON CONFLICT (user_id, module_code)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    source_type = 'canvas',
                    source_course_id = EXCLUDED.source_course_id,
                    external_url = EXCLUDED.external_url
            """,
            values={
                "user_id": current_user.id,
                "module_code": course["course_code"],
                "name": course["name"],
                "source_course_id": str(course["id"]),
                "external_url": course["external_url"],
            },
        )


def build_academic_module(record, color: str | None = None) -> AcademicModuleOut:
    return AcademicModuleOut(
        id=record["id"],
        module_code=record["module_code"],
        name=record["name"],
        source_type=record["source_type"],
        source_course_id=record["source_course_id"],
        external_url=record["external_url"],
        color=color,
        is_selected=bool(record["is_selected"]),
    )


@router.get("", response_model=list[AcademicModuleOut])
async def list_academic_modules(current_user: CurrentUser):
    await sync_canvas_courses_as_academic_modules(current_user)
    colors = await ensure_discovered_module_colors(current_user.id)
    rows = await db.fetch_all(
        query="""
            SELECT id, module_code, name, source_type, source_course_id, external_url, is_selected
            FROM academic_modules
            WHERE user_id = :user_id
            ORDER BY module_code ASC, name ASC
        """,
        values={"user_id": current_user.id},
    )
    return [build_academic_module(row, colors.get(normalize_module_code(row["module_code"]))) for row in rows]


@router.put("/selection", response_model=list[AcademicModuleOut])
async def update_academic_module_selection(payload: AcademicModuleSelectionUpdate, current_user: CurrentUser):
    await sync_canvas_courses_as_academic_modules(current_user)
    selected_ids = {int(module_id) for module_id in payload.module_ids}
    await db.execute(
        query="UPDATE academic_modules SET is_selected = FALSE WHERE user_id = :user_id",
        values={"user_id": current_user.id},
    )
    for module_id in selected_ids:
        await db.execute(
            query="UPDATE academic_modules SET is_selected = TRUE WHERE user_id = :user_id AND id = :module_id",
            values={"user_id": current_user.id, "module_id": module_id},
        )
    return await list_academic_modules(current_user)


@router.post("/custom", response_model=AcademicModuleOut, status_code=201)
async def create_custom_academic_module(payload: AcademicModuleCreate, current_user: CurrentUser):
    """Modules that are not on Canvas — a lab, a project, an audited course."""
    module_code = payload.module_code.strip().upper()
    if not module_code:
        raise HTTPException(status_code=422, detail="Module code is required.")
    existing = await db.fetch_one(
        query="SELECT id FROM academic_modules WHERE user_id = :user_id AND module_code = :module_code",
        values={"user_id": current_user.id, "module_code": module_code},
    )
    if existing:
        raise HTTPException(status_code=400, detail="Module already exists.")
    await db.execute(
        query="""
            INSERT INTO academic_modules (user_id, module_code, name, source_type, is_selected)
            VALUES (:user_id, :module_code, :name, 'manual', TRUE)
        """,
        values={
            "user_id": current_user.id,
            "module_code": module_code,
            "name": payload.name.strip() or module_code,
        },
    )
    row = await db.fetch_one(
        query="SELECT * FROM academic_modules WHERE user_id = :user_id AND module_code = :module_code",
        values={"user_id": current_user.id, "module_code": module_code},
    )
    colors = await ensure_discovered_module_colors(current_user.id)
    return build_academic_module(row, colors.get(normalize_module_code(row["module_code"])))


@router.delete("/custom/{module_id}", status_code=204)
async def delete_custom_academic_module(module_id: int, current_user: CurrentUser):
    row = await db.fetch_one(
        query="SELECT source_type FROM academic_modules WHERE id = :id AND user_id = :user_id",
        values={"id": module_id, "user_id": current_user.id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Module not found.")
    if row["source_type"] == "canvas":
        raise HTTPException(status_code=400, detail="Canvas-synced modules cannot be deleted.")
    await db.execute(
        query="DELETE FROM academic_modules WHERE id = :id AND user_id = :user_id",
        values={"id": module_id, "user_id": current_user.id},
    )
