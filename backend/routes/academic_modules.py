from database import db
from dependencies import CurrentUser
from fastapi import APIRouter
from models.academic_module import AcademicModuleOut

router = APIRouter(prefix="/academic-modules", tags=["academic-modules"])


def build_academic_module(record) -> AcademicModuleOut:
    return AcademicModuleOut(
        id=record["id"],
        module_code=record["module_code"],
        name=record["name"],
        source_type=record["source_type"],
        source_course_id=record["source_course_id"],
        external_url=record["external_url"],
    )


@router.get("", response_model=list[AcademicModuleOut])
async def list_academic_modules(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT id, module_code, name, source_type, source_course_id, external_url
            FROM academic_modules
            WHERE user_id = :user_id
            ORDER BY module_code ASC, name ASC
        """,
        values={"user_id": current_user.id},
    )
    return [build_academic_module(row) for row in rows]
