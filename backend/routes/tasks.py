from datetime import datetime, timezone

from database import db
from dependencies import CurrentUser
from fastapi import APIRouter, HTTPException, Response, status
from models.task import TaskCreate, TaskOut, TaskPriority, TaskUpdate
from routes.canvas import list_canvas_assignments, list_canvas_courses

router = APIRouter(prefix="/tasks", tags=["tasks"])


def get_recommended_priority(
    status: str, effective_due_at: datetime | None
) -> TaskPriority:
    if status == "done":
        return "low"

    if effective_due_at is None:
        return "medium"

    now = datetime.now(timezone.utc)
    delta = effective_due_at - now
    hours_remaining = delta.total_seconds() / 3600

    if hours_remaining <= 0:
        return "urgent"
    if hours_remaining <= 24:
        return "urgent"
    if hours_remaining <= 72:
        return "high"
    if hours_remaining <= 168:
        return "medium"
    return "low"


def parse_canvas_datetime(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_past_due(value: datetime | None) -> bool:
    if value is None:
        return False

    due_at = value
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)

    return due_at <= datetime.now(timezone.utc)


def build_task(record) -> TaskOut:
    effective_due_at = record["due_at_override"] or record["source_due_at"]
    return TaskOut(
        id=record["id"],
        title=record["title"],
        description=record["description"],
        status=record["status"],
        priority_manual=record["priority_manual"],
        recommended_priority=get_recommended_priority(
            record["status"], effective_due_at
        ),
        estimated_minutes=record["estimated_minutes"],
        source_type=record["source_type"],
        source_id=record["source_id"],
        source_due_at=record["source_due_at"],
        due_at_override=record["due_at_override"],
        effective_due_at=effective_due_at,
        external_url=record["external_url"],
        module_id=record["module_id"],
        module_code=record["module_code"],
        module_name=record["module_name"],
        category_id=record["category_id"],
        category_name=record["category_name"],
        category_color=record["category_color"],
        completed_at=record["completed_at"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


async def ensure_reference_belongs_to_user(
    table_name: str, record_id: int | None, user_id: int, detail: str
) -> None:
    if record_id is None:
        return

    query = f"SELECT id FROM {table_name} WHERE id = :record_id AND user_id = :user_id"
    record = await db.fetch_one(
        query=query,
        values={"record_id": record_id, "user_id": user_id},
    )

    if not record:
        raise HTTPException(status_code=404, detail=detail)


async def fetch_task_for_user(task_id: int, user_id: int):
    row = await db.fetch_one(
        query="""
            SELECT
                t.id,
                t.title,
                t.description,
                t.status,
                t.priority_manual,
                t.estimated_minutes,
                t.source_type,
                t.source_id,
                t.source_due_at,
                t.due_at_override,
                t.external_url,
                t.module_id,
                t.category_id,
                t.completed_at,
                t.created_at,
                t.updated_at,
                m.module_code AS module_code,
                m.name AS module_name,
                c.name AS category_name,
                c.color AS category_color
            FROM tasks t
            LEFT JOIN academic_modules m
                ON m.id = t.module_id
            LEFT JOIN categories c
                ON c.id = t.category_id
            WHERE t.id = :task_id AND t.user_id = :user_id
        """,
        values={"task_id": task_id, "user_id": user_id},
    )

    if not row:
        raise HTTPException(status_code=404, detail="Task not found.")

    return row


@router.get("", response_model=list[TaskOut])
async def list_tasks(current_user: CurrentUser):
    rows = await db.fetch_all(
        query="""
            SELECT
                t.id,
                t.title,
                t.description,
                t.status,
                t.priority_manual,
                t.estimated_minutes,
                t.source_type,
                t.source_id,
                t.source_due_at,
                t.due_at_override,
                t.external_url,
                t.module_id,
                t.category_id,
                t.completed_at,
                t.created_at,
                t.updated_at,
                m.module_code AS module_code,
                m.name AS module_name,
                c.name AS category_name,
                c.color AS category_color
            FROM tasks t
            LEFT JOIN academic_modules m
                ON m.id = t.module_id
            LEFT JOIN categories c
                ON c.id = t.category_id
            WHERE t.user_id = :user_id
            ORDER BY
                CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
                COALESCE(t.due_at_override, t.source_due_at) ASC NULLS LAST,
                t.created_at DESC
        """,
        values={"user_id": current_user.id},
    )
    return [build_task(row) for row in rows]


@router.post("/sync-canvas", response_model=list[TaskOut])
async def sync_canvas_tasks(current_user: CurrentUser):
    await db.execute(
        query="""
            DELETE FROM tasks
            WHERE user_id = :user_id
                AND source_type = 'canvas'
                AND COALESCE(due_at_override, source_due_at) <= NOW()
        """,
        values={"user_id": current_user.id},
    )

    courses = await list_canvas_courses(current_user)
    for course in courses:
        await db.execute(
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
                    'canvas',
                    :source_course_id,
                    :external_url
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

    try:
        assignments = await list_canvas_assignments(current_user)
    except Exception:
        return await list_tasks(current_user)

    for assignment in assignments:
        try:
            course_code = assignment.get("course_code") or "Canvas"
            course_id = str(assignment.get("course_id") or "")
            course_url = (
                f"https://canvas.nus.edu.sg/courses/{course_id}" if course_id else None
            )

            module_row = await db.fetch_one(
                query="""
                    SELECT id, name
                    FROM academic_modules
                    WHERE user_id = :user_id AND module_code = :module_code
                    ORDER BY id ASC
                    LIMIT 1
                """,
                values={"user_id": current_user.id, "module_code": course_code},
            )

            module_values = {
                "user_id": current_user.id,
                "module_code": course_code,
                "name": assignment.get("course_name") or course_code,
                "source_course_id": course_id or None,
                "external_url": course_url,
            }

            if module_row:
                await db.execute(
                    query="""
                        UPDATE academic_modules
                        SET
                            source_type = 'canvas',
                            source_course_id = COALESCE(
                                source_course_id,
                                :source_course_id
                            ),
                            name = CASE
                                WHEN name = :module_code THEN :name
                                ELSE name
                            END,
                            external_url = COALESCE(external_url, :external_url)
                        WHERE id = :module_id AND user_id = :user_id
                    """,
                    values={**module_values, "module_id": module_row["id"]},
                )
            else:
                module_row = await db.fetch_one(
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
                            'canvas',
                            :source_course_id,
                            :external_url
                        )
                        RETURNING id
                    """,
                    values=module_values,
                )

            due_at = parse_canvas_datetime(assignment.get("due_at"))
            source_id = f"canvas:{course_id}:{assignment.get('id')}"
            is_submitted = bool(assignment.get("has_submitted"))
            should_remove_from_planner = is_submitted or is_past_due(due_at)
            existing = await db.fetch_one(
                query="""
                    SELECT id, completed_at
                    FROM tasks
                    WHERE user_id = :user_id
                        AND source_type = 'canvas'
                        AND source_id = :source_id
                """,
                values={"user_id": current_user.id, "source_id": source_id},
            )

            values = {
                "user_id": current_user.id,
                "module_id": module_row["id"],
                "title": assignment.get("title") or "Untitled Canvas assignment",
                "description": (assignment.get("description") or "")[:4000],
                "priority_manual": get_recommended_priority("todo", due_at),
                "source_id": source_id,
                "source_due_at": due_at,
                "external_url": assignment.get("external_url"),
            }

            if should_remove_from_planner:
                if existing:
                    await db.execute(
                        query="""
                            DELETE FROM tasks
                            WHERE id = :task_id AND user_id = :user_id
                        """,
                        values={
                            "task_id": existing["id"],
                            "user_id": current_user.id,
                        },
                    )
                continue

            if existing:
                await db.execute(
                    query="""
                        UPDATE tasks
                        SET
                            module_id = :module_id,
                            title = :title,
                            description = :description,
                            source_due_at = :source_due_at,
                            external_url = :external_url,
                            updated_at = NOW()
                        WHERE id = :task_id AND user_id = :user_id
                    """,
                    values={
                        **values,
                        "task_id": existing["id"],
                    },
                )
            else:
                await db.execute(
                    query="""
                        INSERT INTO tasks (
                            user_id,
                            module_id,
                            title,
                            description,
                            priority_manual,
                            source_type,
                            source_id,
                            source_due_at,
                            external_url
                        )
                        VALUES (
                            :user_id,
                            :module_id,
                            :title,
                            :description,
                            :priority_manual,
                            'canvas',
                            :source_id,
                            :source_due_at,
                            :external_url
                        )
                    """,
                    values=values,
                )
        except Exception:
            continue

    return await list_tasks(current_user)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, current_user: CurrentUser):
    await ensure_reference_belongs_to_user(
        "academic_modules",
        payload.module_id,
        current_user.id,
        "Module not found.",
    )
    await ensure_reference_belongs_to_user(
        "categories",
        payload.category_id,
        current_user.id,
        "Category not found.",
    )

    completed_at = datetime.now(timezone.utc) if payload.status == "done" else None

    row = await db.fetch_one(
        query="""
            INSERT INTO tasks (
                user_id,
                module_id,
                category_id,
                title,
                description,
                status,
                priority_manual,
                estimated_minutes,
                source_type,
                source_id,
                source_due_at,
                due_at_override,
                external_url,
                completed_at
            )
            VALUES (
                :user_id,
                :module_id,
                :category_id,
                :title,
                :description,
                :status,
                :priority_manual,
                :estimated_minutes,
                :source_type,
                :source_id,
                :source_due_at,
                :due_at_override,
                :external_url,
                :completed_at
            )
            RETURNING id
        """,
        values={
            "user_id": current_user.id,
            "module_id": payload.module_id,
            "category_id": payload.category_id,
            "title": payload.title,
            "description": payload.description,
            "status": payload.status,
            "priority_manual": payload.priority_manual,
            "estimated_minutes": payload.estimated_minutes,
            "source_type": payload.source_type,
            "source_id": payload.source_id,
            "source_due_at": payload.source_due_at,
            "due_at_override": payload.due_at_override,
            "external_url": payload.external_url,
            "completed_at": completed_at,
        },
    )
    return build_task(await fetch_task_for_user(row["id"], current_user.id))


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, payload: TaskUpdate, current_user: CurrentUser):
    existing = await fetch_task_for_user(task_id, current_user.id)
    updates = payload.model_dump(exclude_unset=True)

    module_id = updates.get("module_id", existing["module_id"])
    category_id = updates.get("category_id", existing["category_id"])

    await ensure_reference_belongs_to_user(
        "academic_modules",
        module_id,
        current_user.id,
        "Module not found.",
    )
    await ensure_reference_belongs_to_user(
        "categories",
        category_id,
        current_user.id,
        "Category not found.",
    )

    status_value = updates.get("status", existing["status"])
    completed_at = existing["completed_at"]
    if status_value == "done" and completed_at is None:
        completed_at = datetime.now(timezone.utc)
    if status_value != "done":
        completed_at = None

    await db.execute(
        query="""
            UPDATE tasks
            SET
                module_id = :module_id,
                category_id = :category_id,
                title = :title,
                description = :description,
                status = :status,
                priority_manual = :priority_manual,
                estimated_minutes = :estimated_minutes,
                source_type = :source_type,
                source_id = :source_id,
                source_due_at = :source_due_at,
                due_at_override = :due_at_override,
                external_url = :external_url,
                completed_at = :completed_at,
                updated_at = NOW()
            WHERE id = :task_id AND user_id = :user_id
        """,
        values={
            "task_id": task_id,
            "user_id": current_user.id,
            "module_id": module_id,
            "category_id": category_id,
            "title": updates.get("title", existing["title"]),
            "description": updates.get("description", existing["description"]),
            "status": status_value,
            "priority_manual": updates.get(
                "priority_manual", existing["priority_manual"]
            ),
            "estimated_minutes": updates.get(
                "estimated_minutes", existing["estimated_minutes"]
            ),
            "source_type": updates.get("source_type", existing["source_type"]),
            "source_id": updates.get("source_id", existing["source_id"]),
            "source_due_at": updates.get("source_due_at", existing["source_due_at"]),
            "due_at_override": updates.get(
                "due_at_override", existing["due_at_override"]
            ),
            "external_url": updates.get("external_url", existing["external_url"]),
            "completed_at": completed_at,
        },
    )
    return build_task(await fetch_task_for_user(task_id, current_user.id))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, current_user: CurrentUser):
    await fetch_task_for_user(task_id, current_user.id)
    await db.execute(
        query="DELETE FROM tasks WHERE id = :task_id AND user_id = :user_id",
        values={"task_id": task_id, "user_id": current_user.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
