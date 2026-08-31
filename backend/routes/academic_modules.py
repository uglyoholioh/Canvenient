from database import db
from dependencies import CurrentUser
from fastapi import APIRouter
from models.academic_module import AcademicModuleOut
from module_colors import ensure_discovered_module_colors, normalize_module_code

router = APIRouter(prefix="/academic-modules", tags=["academic-modules"])


def build_academic_module(record, color: str | None = None) -> AcademicModuleOut:
    return AcademicModuleOut(
        id=record["id"],
        module_code=record["module_code"],
        name=record["name"],
        source_type=record["source_type"],
        source_course_id=record["source_course_id"],
        external_url=record["external_url"],
        color=color,
    )


@router.get("", response_model=list[AcademicModuleOut])
async def list_academic_modules(current_user: CurrentUser):
    colors = await ensure_discovered_module_colors(current_user.id)
    rows = await db.fetch_all(
        query="""
            SELECT id, module_code, name, source_type, source_course_id, external_url
            FROM academic_modules
            WHERE user_id = :user_id
            ORDER BY module_code ASC, name ASC
        """,
        values={"user_id": current_user.id},
    )
    return [
        build_academic_module(row, colors.get(normalize_module_code(row["module_code"])))
        for row in rows
    ]
