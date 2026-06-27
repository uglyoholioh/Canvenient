from fastapi import APIRouter, HTTPException, Response, status
from database import db
from dependencies import CurrentUser
from models.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("", response_model=list[NotificationOut])
async def list_notifications(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT * FROM notifications
            WHERE user_id = :user_id
            ORDER BY created_at DESC
        """,
        values={"user_id": current_user.id}
    )
    return [NotificationOut.model_validate(dict(row)) for row in rows]

@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(notification_id: int, current_user: CurrentUser):
    row = await db.fetch_one(
        query="""
            UPDATE notifications
            SET is_read = TRUE
            WHERE id = :id AND user_id = :user_id
            RETURNING *
        """,
        values={"id": notification_id, "user_id": current_user.id}
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found."
        )
    return NotificationOut.model_validate(dict(row))

@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(current_user: CurrentUser):
    await db.execute(
        query="""
            UPDATE notifications
            SET is_read = TRUE
            WHERE user_id = :user_id AND is_read = FALSE
        """,
        values={"user_id": current_user.id}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
