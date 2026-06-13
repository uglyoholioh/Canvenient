from fastapi import APIRouter, HTTPException, Response, status

from database import db
from dependencies import CurrentUser
from models.academic_module import (
    AcademicModuleCreate,
    AcademicModuleOut,
    AcademicModuleUpdate,
)

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


@router.post(
    "", response_model=AcademicModuleOut, status_code=status.HTTP_201_CREATED
)
async def create_academic_module(
    payload: AcademicModuleCreate, current_user: CurrentUser
):
    try:
        row = await db.fetch_one(
            query="""
                INSERT INTO academic_modules (
                    user_id,
                    module_code,
                    name,
                    source_type,
                    source_course_id,
                    external_url
                )
                VALUES (
                    :user_id,
                    :module_code,
                    :name,
                    :source_type,
                    :source_course_id,
                    :external_url
                )
                RETURNING id, module_code, name, source_type, source_course_id, external_url
            """,
            values={
                "user_id": current_user.id,
                "module_code": payload.module_code,
                "name": payload.name,
                "source_type": payload.source_type,
                "source_course_id": payload.source_course_id,
                "external_url": payload.external_url,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a module with that code.",
        ) from exc

    return build_academic_module(row)


@router.patch("/{module_id}", response_model=AcademicModuleOut)
async def update_academic_module(
    module_id: int, payload: AcademicModuleUpdate, current_user: CurrentUser
):
    existing = await db.fetch_one(
        query="""
            SELECT id, module_code, name, source_type, source_course_id, external_url
            FROM academic_modules
            WHERE id = :module_id AND user_id = :user_id
        """,
        values={"module_id": module_id, "user_id": current_user.id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Module not found.")

    updates = payload.model_dump(exclude_unset=True)
    merged = {
        "module_code": updates.get("module_code", existing["module_code"]),
        "name": updates.get("name", existing["name"]),
        "source_type": updates.get("source_type", existing["source_type"]),
        "source_course_id": updates.get(
            "source_course_id", existing["source_course_id"]
        ),
        "external_url": updates.get("external_url", existing["external_url"]),
    }

    try:
        row = await db.fetch_one(
            query="""
                UPDATE academic_modules
                SET
                    module_code = :module_code,
                    name = :name,
                    source_type = :source_type,
                    source_course_id = :source_course_id,
                    external_url = :external_url
                WHERE id = :module_id AND user_id = :user_id
                RETURNING id, module_code, name, source_type, source_course_id, external_url
            """,
            values={
                "module_id": module_id,
                "user_id": current_user.id,
                **merged,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a module with that code.",
        ) from exc

    return build_academic_module(row)


@router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_academic_module(module_id: int, current_user: CurrentUser):
    existing = await db.fetch_one(
        query="""
            SELECT id, source_type
            FROM academic_modules
            WHERE id = :module_id AND user_id = :user_id
        """,
        values={"module_id": module_id, "user_id": current_user.id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Module not found.")

    if existing["source_type"] == "canvas":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas-synced modules cannot be removed manually.",
        )

    await db.execute(
        query="""
            DELETE FROM academic_modules
            WHERE id = :module_id AND user_id = :user_id
        """,
        values={"module_id": module_id, "user_id": current_user.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
