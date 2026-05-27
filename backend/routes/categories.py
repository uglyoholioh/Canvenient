from fastapi import APIRouter, HTTPException, Response, status

from database import db
from dependencies import CurrentUser
from models.category import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def build_category(record) -> CategoryOut:
    return CategoryOut(id=record["id"], name=record["name"], color=record["color"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT id, name, color
            FROM categories
            WHERE user_id = :user_id
            ORDER BY name ASC
        """,
        values={"user_id": current_user.id},
    )
    return [build_category(row) for row in rows]


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(payload: CategoryCreate, current_user: CurrentUser):
    try:
        row = await db.fetch_one(
            query="""
                INSERT INTO categories (user_id, name, color)
                VALUES (:user_id, :name, :color)
                RETURNING id, name, color
            """,
            values={
                "user_id": current_user.id,
                "name": payload.name,
                "color": payload.color,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a category with that name.",
        ) from exc

    return build_category(row)


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int, payload: CategoryUpdate, current_user: CurrentUser
):
    existing = await db.fetch_one(
        query="""
            SELECT id, name, color
            FROM categories
            WHERE id = :category_id AND user_id = :user_id
        """,
        values={"category_id": category_id, "user_id": current_user.id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")

    updates = payload.model_dump(exclude_unset=True)
    merged = {
        "name": updates.get("name", existing["name"]),
        "color": updates.get("color", existing["color"]),
    }

    try:
        row = await db.fetch_one(
            query="""
                UPDATE categories
                SET name = :name, color = :color
                WHERE id = :category_id AND user_id = :user_id
                RETURNING id, name, color
            """,
            values={
                "category_id": category_id,
                "user_id": current_user.id,
                **merged,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a category with that name.",
        ) from exc

    return build_category(row)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: int, current_user: CurrentUser):
    existing = await db.fetch_one(
        query="""
            SELECT id
            FROM categories
            WHERE id = :category_id AND user_id = :user_id
        """,
        values={"category_id": category_id, "user_id": current_user.id},
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")

    await db.execute(
        query="DELETE FROM categories WHERE id = :category_id AND user_id = :user_id",
        values={"category_id": category_id, "user_id": current_user.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
