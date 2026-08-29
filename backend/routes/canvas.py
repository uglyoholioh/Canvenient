import json
import asyncio
import base64
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from database import db
from dependencies import CurrentUser
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/canvas", tags=["canvas"])

CANVAS_CACHE_TTL_MINUTES = 15


class CanvasSubmissionRequest(BaseModel):
    type: str
    content: str = ""
    filename: str | None = None
    content_type: str | None = None


async def require_canvas_course(current_user: CurrentUser, course_id: int) -> dict[str, Any]:
    courses = await list_canvas_courses(current_user)
    course = next((item for item in courses if int(item["id"]) == course_id), None)
    if not course:
        raise HTTPException(status_code=404, detail="Canvas course not found.")
    return course


def canvas_error_detail(response: httpx.Response, fallback: str) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            if isinstance(payload.get("message"), str):
                return payload["message"]
            errors = payload.get("errors")
            if isinstance(errors, list) and errors:
                first = errors[0]
                if isinstance(first, dict) and isinstance(first.get("message"), str):
                    return first["message"]
    except Exception:
        pass
    return fallback


async def get_canvas_cache(user_id: int, cache_key: str) -> tuple[Any | None, datetime | None]:
    try:
        row = await db.fetch_one(
            query="""
                SELECT data, synced_at
                FROM canvas_api_cache
                WHERE user_id = :user_id AND cache_key = :cache_key
            """,
            values={"user_id": user_id, "cache_key": cache_key},
        )
        if not row:
            return None, None
        raw_data = row["data"]
        data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
        synced_at = row["synced_at"]
        if isinstance(synced_at, str):
            synced_at = datetime.fromisoformat(synced_at.replace("Z", "+00:00"))
        return data, synced_at
    except Exception:
        return None, None


async def save_canvas_cache(user_id: int, cache_key: str, data: Any) -> None:
    try:
        is_sqlite = "sqlite" in str(db.url).lower()
        json_data = json.dumps(data)
        if is_sqlite:
            await db.execute(
                query="""
                    INSERT INTO canvas_api_cache (user_id, cache_key, data, synced_at)
                    VALUES (:user_id, :cache_key, :data, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, cache_key)
                    DO UPDATE SET data = EXCLUDED.data, synced_at = CURRENT_TIMESTAMP
                """,
                values={"user_id": user_id, "cache_key": cache_key, "data": json_data},
            )
        else:
            await db.execute(
                query="""
                    INSERT INTO canvas_api_cache (user_id, cache_key, data, synced_at)
                    VALUES (:user_id, :cache_key, :data, NOW())
                    ON CONFLICT (user_id, cache_key)
                    DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()
                """,
                values={"user_id": user_id, "cache_key": cache_key, "data": json_data},
            )
    except Exception:
        pass


def is_cache_fresh(synced_at: datetime | None, ttl_minutes: int = CANVAS_CACHE_TTL_MINUTES) -> bool:
    if not synced_at:
        return False
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - synced_at) < timedelta(minutes=ttl_minutes)


def has_canvas_submission(submission: dict[str, Any] | None) -> bool:
    if not submission:
        return False

    workflow_state = submission.get("workflow_state")
    return bool(
        submission.get("submitted_at")
        or submission.get("graded_at")
        or submission.get("grade") is not None
        or submission.get("score") is not None
        or workflow_state in {"submitted", "graded", "pending_review"}
    )


async def fetch_assignment_submission(
    client: httpx.AsyncClient, headers: dict, course_id: int, assignment_id: int
) -> dict[str, Any]:
    try:
        response = await client.get(
            "https://canvas.nus.edu.sg/api/v1/courses/"
            f"{course_id}/assignments/{assignment_id}/submissions/self",
            headers=headers,
            timeout=5.0,
        )
        response.raise_for_status()
        submission = response.json()
    except Exception:
        return {}

    return submission if isinstance(submission, dict) else {}


@router.get("/courses", response_model=list[dict[str, Any]])
async def list_canvas_courses(
    current_user: CurrentUser,
    force_refresh: bool = Query(False),
):
    token = current_user.canvas_token
    if not token:
        return []

    if not force_refresh:
        cached_data, synced_at = await get_canvas_cache(current_user.id, "courses")
        if cached_data is not None and is_cache_fresh(synced_at):
            return cached_data

    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://canvas.nus.edu.sg/api/v1/courses"
                "?enrollment_state=active&per_page=50",
                headers=headers,
                timeout=5.0,
            )

            response.raise_for_status()
            courses = response.json()
    except Exception:
        stale_data, _ = await get_canvas_cache(current_user.id, "courses")
        if stale_data is not None:
            return stale_data
        return []

    if not isinstance(courses, list):
        stale_data, _ = await get_canvas_cache(current_user.id, "courses")
        return stale_data if stale_data is not None else []

    result = []
    for c in courses:
        if "course_code" in c and "id" in c:
            result.append(
                {
                    "id": c["id"],
                    "course_code": c["course_code"],
                    "name": c.get("name") or c["course_code"],
                    "external_url": f"https://canvas.nus.edu.sg/courses/{c['id']}",
                }
            )

    await save_canvas_cache(current_user.id, "courses", result)
    return result


@router.get("/announcements", response_model=list[dict[str, Any]])
async def list_canvas_announcements(
    current_user: CurrentUser,
    force_refresh: bool = Query(False),
):
    token = current_user.canvas_token
    if not token:
        return []

    if not force_refresh:
        cached_data, synced_at = await get_canvas_cache(current_user.id, "announcements")
        if cached_data is not None and is_cache_fresh(synced_at):
            return cached_data

    courses = await list_canvas_courses(current_user, force_refresh=force_refresh)
    if not courses:
        stale_data, _ = await get_canvas_cache(current_user.id, "announcements")
        return stale_data if stale_data is not None else []

    context_codes = [f"course_{c['id']}" for c in courses]

    start_date_str = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    headers = {"Authorization": f"Bearer {token}"}

    params = [("context_codes[]", code) for code in context_codes]
    params.append(("start_date", start_date_str))
    params.append(("per_page", "50"))

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://canvas.nus.edu.sg/api/v1/announcements",
                headers=headers,
                params=params,
                timeout=5.0,
            )
            response.raise_for_status()
            announcements = response.json()
    except Exception:
        stale_data, _ = await get_canvas_cache(current_user.id, "announcements")
        if stale_data is not None:
            return stale_data
        return []

    if not isinstance(announcements, list):
        stale_data, _ = await get_canvas_cache(current_user.id, "announcements")
        return stale_data if stale_data is not None else []

    result = []
    for ann in announcements:
        context_code = ann.get("context_code") or ""
        course_id = (
            int(context_code.replace("course_", ""))
            if context_code.startswith("course_")
            else None
        )

        course_code = ""
        for c in courses:
            if c["id"] == course_id:
                course_code = c["course_code"]
                break

        title = ann.get("title", "")
        message = ann.get("message", "") or ""

        text = f"{title} {message}".lower()
        is_priority = any(
            k in text
            for k in [
                "exam",
                "quiz",
                "test",
                "midterm",
                "finals",
                "assessment",
                "due",
                "deadline",
                "submit",
                "submission",
                "extension",
                "cancelled",
                "postponed",
                "urgent",
                "important",
            ]
        )

        result.append(
            {
                "id": ann["id"],
                "course_id": course_id,
                "course_code": course_code,
                "title": title,
                "body": message,
                "posted_at": ann.get("posted_at"),
                "author": ann.get("author", {}).get("display_name") or "Instructor",
                "is_priority": is_priority,
                "external_url": (
                    f"https://canvas.nus.edu.sg/courses/{course_id}"
                    f"/discussion_topics/{ann['id']}"
                ),
            }
        )

    result.sort(key=lambda x: x["posted_at"] or "", reverse=True)
    await save_canvas_cache(current_user.id, "announcements", result)
    return result


async def fetch_course_assignments(
    client: httpx.AsyncClient, headers: dict, course: dict
):
    course_id = course["id"]
    url = f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/assignments"

    try:
        response = await client.get(
            url,
            headers=headers,
            params={
                "per_page": "30",
                "include[]": "submission",
            },
            timeout=5.0,
        )
        response.raise_for_status()
        assignments = response.json()
    except Exception:
        return []

    if not isinstance(assignments, list):
        return []

    result = []
    for asgn in assignments:
        assignment_id = asgn.get("id")
        if assignment_id is None:
            continue

        due_at = asgn.get("due_at")
        submission = asgn.get("submission") or {}
        if not has_canvas_submission(submission):
            submission = await fetch_assignment_submission(
                client, headers, course_id, assignment_id
            )
        has_submitted = bool(
            asgn.get("has_submitted_submissions") or has_canvas_submission(submission)
        )
        is_priority = False

        if due_at:
            try:
                due_date = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)

                is_priority = now <= due_date <= (now + timedelta(days=7))
            except Exception:
                pass
        result.append(
            {
                "id": assignment_id,
                "course_id": course["id"],
                "course_code": course["course_code"],
                "course_name": course.get("name") or course["course_code"],
                "title": asgn.get("name") or "Untitled Assignment",
                "due_at": due_at,
                "is_priority": is_priority,
                "external_url": asgn.get("html_url")
                or (
                    f"https://canvas.nus.edu.sg/courses/{course['id']}"
                    f"/assignments/{assignment_id}"
                ),
                "description": asgn.get("description", "") or "",
                "has_submitted": has_submitted,
            }
        )
    return result


@router.get("/assignments", response_model=list[dict[str, Any]])
async def list_canvas_assignments(
    current_user: CurrentUser,
    force_refresh: bool = Query(False),
):
    token = current_user.canvas_token
    if not token:
        return []

    if not force_refresh:
        cached_data, synced_at = await get_canvas_cache(current_user.id, "assignments")
        if cached_data is not None and is_cache_fresh(synced_at):
            return cached_data

    courses = await list_canvas_courses(current_user, force_refresh=force_refresh)
    if not courses:
        stale_data, _ = await get_canvas_cache(current_user.id, "assignments")
        return stale_data if stale_data is not None else []

    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient() as client:
            tasks = [
                fetch_course_assignments(client, headers, course) for course in courses
            ]
            all_results = await asyncio.gather(*tasks, return_exceptions=True)
    except Exception:
        stale_data, _ = await get_canvas_cache(current_user.id, "assignments")
        if stale_data is not None:
            return stale_data
        return []

    flat_list = [
        item for sublist in all_results if isinstance(sublist, list) for item in sublist
    ]

    flat_list.sort(key=lambda x: x["due_at"] or "9999-12-31T23:59:59Z")
    await save_canvas_cache(current_user.id, "assignments", flat_list)
    return flat_list


@router.get("/assignments/{assignment_id}", response_model=dict[str, Any])
async def get_canvas_assignment(
    assignment_id: int,
    course_id: int,
    current_user: CurrentUser,
):
    token = current_user.canvas_token
    if not token:
        raise HTTPException(status_code=400, detail="Connect Canvas in Settings first.")
    course = await require_canvas_course(current_user, course_id)
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/assignments/{assignment_id}",
            headers=headers,
            params=[("include[]", "submission")],
            timeout=10.0,
        )
    if not response.is_success:
        raise HTTPException(
            status_code=response.status_code,
            detail=canvas_error_detail(response, "Could not load this Canvas assignment."),
        )
    assignment = response.json()
    submission = assignment.get("submission") or {}
    if not has_canvas_submission(submission):
        async with httpx.AsyncClient() as client:
            submission = await fetch_assignment_submission(
                client, headers, course_id, assignment_id
            )
    return {
        "id": assignment_id,
        "course_id": course_id,
        "course_code": course["course_code"],
        "course_name": course.get("name") or course["course_code"],
        "title": assignment.get("name") or "Untitled Assignment",
        "description": assignment.get("description") or "",
        "due_at": assignment.get("due_at"),
        "points_possible": assignment.get("points_possible"),
        "submission_types": assignment.get("submission_types") or [],
        "allowed_extensions": assignment.get("allowed_extensions") or [],
        "has_submitted": has_canvas_submission(submission),
        "submission": submission,
        "external_url": assignment.get("html_url"),
    }


@router.post("/assignments/{assignment_id}/submit", response_model=dict[str, Any])
async def submit_canvas_assignment(
    assignment_id: int,
    course_id: int,
    data: CanvasSubmissionRequest,
    current_user: CurrentUser,
):
    token = current_user.canvas_token
    if not token:
        raise HTTPException(status_code=400, detail="Connect Canvas in Settings first.")
    await require_canvas_course(current_user, course_id)
    headers = {"Authorization": f"Bearer {token}"}
    submit_url = (
        f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}"
        f"/assignments/{assignment_id}/submissions"
    )

    async with httpx.AsyncClient(follow_redirects=True) as client:
        if data.type == "text_entry":
            if not data.content.strip():
                raise HTTPException(status_code=422, detail="Submission text is required.")
            payload: list[tuple[str, str]] = [
                ("submission[submission_type]", "online_text_entry"),
                ("submission[body]", data.content),
            ]
        elif data.type == "online_url":
            if not data.content.strip():
                raise HTTPException(status_code=422, detail="Submission URL is required.")
            payload = [
                ("submission[submission_type]", "online_url"),
                ("submission[url]", data.content),
            ]
        elif data.type == "file_upload":
            if not data.filename or not data.content:
                raise HTTPException(status_code=422, detail="A file is required.")
            try:
                file_bytes = base64.b64decode(data.content, validate=True)
            except Exception as exc:
                raise HTTPException(status_code=422, detail="The uploaded file is invalid.") from exc
            if len(file_bytes) > 25 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Files must be 25 MB or smaller.")
            upload_init = await client.post(
                f"{submit_url}/self/files",
                headers=headers,
                data={
                    "name": data.filename,
                    "size": str(len(file_bytes)),
                    "content_type": data.content_type or "application/octet-stream",
                },
                timeout=15.0,
            )
            if not upload_init.is_success:
                raise HTTPException(
                    status_code=upload_init.status_code,
                    detail=canvas_error_detail(upload_init, "Canvas could not start the file upload."),
                )
            upload_data = upload_init.json()
            upload_response = await client.post(
                upload_data["upload_url"],
                data=upload_data.get("upload_params") or {},
                files={
                    "file": (
                        data.filename,
                        file_bytes,
                        data.content_type or "application/octet-stream",
                    )
                },
                timeout=60.0,
            )
            if not upload_response.is_success:
                raise HTTPException(
                    status_code=upload_response.status_code,
                    detail="Canvas could not upload the selected file.",
                )
            uploaded_file = upload_response.json()
            file_id = uploaded_file.get("id")
            if not file_id:
                raise HTTPException(status_code=502, detail="Canvas did not return an uploaded file ID.")
            payload = [
                ("submission[submission_type]", "online_upload"),
                ("submission[file_ids][]", str(file_id)),
            ]
        else:
            raise HTTPException(status_code=422, detail="Unsupported Canvas submission type.")

        response = await client.post(
            submit_url,
            headers=headers,
            data=payload,
            timeout=30.0,
        )
    if not response.is_success:
        raise HTTPException(
            status_code=response.status_code,
            detail=canvas_error_detail(response, "Canvas rejected the submission."),
        )
    await db.execute(
        query="DELETE FROM canvas_api_cache WHERE user_id = :user_id AND cache_key = 'assignments'",
        values={"user_id": current_user.id},
    )
    return {"ok": True, "submission": response.json()}


async def fetch_course_grades(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    course: dict[str, Any],
) -> dict[str, Any]:
    course_id = course["id"]
    enrollment_request = client.get(
        f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/enrollments",
        headers=headers,
        params=[("user_id", "self"), ("type[]", "StudentEnrollment")],
        timeout=10.0,
    )
    submissions_request = client.get(
        f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/students/submissions",
        headers=headers,
        params=[("student_ids[]", "self"), ("include[]", "assignment"), ("per_page", "100")],
        timeout=15.0,
    )
    enrollment_response, submissions_response = await asyncio.gather(
        enrollment_request, submissions_request
    )
    enrollments = enrollment_response.json() if enrollment_response.is_success else []
    submissions = submissions_response.json() if submissions_response.is_success else []
    enrollment = enrollments[0] if isinstance(enrollments, list) and enrollments else {}
    grades = enrollment.get("grades") or {}
    assignment_rows = []
    if isinstance(submissions, list):
        for submission in submissions:
            assignment = submission.get("assignment") or {}
            assignment_rows.append(
                {
                    "id": assignment.get("id") or submission.get("assignment_id"),
                    "title": assignment.get("name") or "Untitled Assignment",
                    "score": submission.get("score"),
                    "grade": submission.get("grade"),
                    "points_possible": assignment.get("points_possible"),
                    "workflow_state": submission.get("workflow_state"),
                    "submitted_at": submission.get("submitted_at"),
                }
            )
    return {
        "course_id": course_id,
        "course_code": course["course_code"],
        "course_name": course.get("name") or course["course_code"],
        "current_score": grades.get("current_score"),
        "current_grade": grades.get("current_grade"),
        "final_score": grades.get("final_score"),
        "final_grade": grades.get("final_grade"),
        "assignments": assignment_rows,
    }


@router.get("/grades", response_model=list[dict[str, Any]])
async def list_canvas_grades(
    current_user: CurrentUser,
    course_id: int | None = None,
):
    token = current_user.canvas_token
    if not token:
        return []
    courses = await list_canvas_courses(current_user)
    if course_id is not None:
        courses = [course for course in courses if int(course["id"]) == course_id]
        if not courses:
            raise HTTPException(status_code=404, detail="Canvas course not found.")
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(fetch_course_grades(client, headers, course) for course in courses),
            return_exceptions=True,
        )
    return [result for result in results if isinstance(result, dict)]


@router.get("/files", response_model=list[dict[str, Any]])
async def list_canvas_files(course_id: int, current_user: CurrentUser):
    token = current_user.canvas_token
    if not token:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/files"
                "?per_page=50&sort=updated_at&order=desc",
                headers=headers,
                timeout=5.0,
            )
            response.raise_for_status()
            files = response.json()
        except Exception:
            return []

    if not isinstance(files, list):
        return []

    result = []
    for f in files:
        result.append(
            {
                "id": f["id"],
                "display_name": f["display_name"],
                "filename": f["filename"],
                "url": f["url"],
                "size": f["size"],
                "updated_at": f["updated_at"],
                "external_url": f.get("html_url")
                or f"https://canvas.nus.edu.sg/courses/{course_id}/files/{f['id']}",
            }
        )
    return result


def get_file_type(filename: str) -> str:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "file"
    if extension in {"jpg", "jpeg", "png", "gif", "webp", "svg"}:
        return "img"
    if extension in {"doc", "docx"}:
        return "doc"
    if extension in {"ppt", "pptx"}:
        return "ppt"
    if extension in {"xls", "xlsx", "csv"}:
        return "xls"
    if extension in {"zip", "rar", "7z", "tar", "gz"}:
        return "zip"
    return extension[:12]


def parse_canvas_file_datetime(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return fallback


async def fetch_course_files_for_sync(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    course: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
    try:
        response = await client.get(
            f"https://canvas.nus.edu.sg/api/v1/courses/{course['id']}/files"
            "?per_page=100&sort=updated_at&order=desc",
            headers=headers,
            timeout=10.0,
        )
        response.raise_for_status()
        files = response.json()
    except Exception:
        return None

    return course, files if isinstance(files, list) else []


@router.get("/cached-files", response_model=dict[str, Any])
async def list_cached_canvas_files(current_user: CurrentUser):
    synced_at = await db.fetch_val(
        query="""
            SELECT files_synced_at
            FROM canvas_sync_state
            WHERE user_id = :user_id
        """,
        values={"user_id": current_user.id},
    )
    course_rows = await db.fetch_all(
        query="""
            SELECT
                source_course_id AS canvas_course_id,
                module_code AS course_code,
                name,
                external_url
            FROM academic_modules
            WHERE user_id = :user_id
                AND source_type = 'canvas'
                AND source_course_id IS NOT NULL
            ORDER BY module_code ASC
        """,
        values={"user_id": current_user.id},
    )
    file_rows = await db.fetch_all(
        query="""
            SELECT
                canvas_file_id,
                canvas_course_id,
                module_code,
                filename,
                size_bytes,
                canvas_url,
                external_url,
                updated_at_canvas,
                synced_at
            FROM canvas_files
            WHERE user_id = :user_id
                AND COALESCE(hidden, FALSE) = FALSE
            ORDER BY updated_at_canvas DESC
        """,
        values={"user_id": current_user.id},
    )

    courses = [
        {
            "id": row["canvas_course_id"],
            "course_code": row["course_code"],
            "name": row["name"],
            "external_url": row["external_url"],
        }
        for row in course_rows
    ]
    files = [
        {
            "id": row["canvas_file_id"],
            "courseId": row["canvas_course_id"],
            "courseCode": row["module_code"],
            "display_name": row["filename"],
            "filename": row["filename"],
            "size": row["size_bytes"],
            "url": row["canvas_url"],
            "external_url": row["external_url"],
            "updated_at": row["updated_at_canvas"],
        }
        for row in file_rows
    ]
    return {"courses": courses, "files": files, "synced_at": synced_at}


@router.post("/sync-files", response_model=dict[str, Any])
async def sync_canvas_files(current_user: CurrentUser):
    token = current_user.canvas_token
    if not token:
        raise HTTPException(status_code=400, detail="Canvas account is not connected.")

    courses = await list_canvas_courses(current_user)
    if not courses:
        return await list_cached_canvas_files(current_user)

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(
                fetch_course_files_for_sync(client, headers, course)
                for course in courses
            )
        )

    successful_results = [result for result in results if result is not None]
    if not successful_results:
        return await list_cached_canvas_files(current_user)

    now = datetime.now(timezone.utc)
    cached_files = []
    for course, files in successful_results:
        for file in files:
            filename = (
                file.get("display_name") or file.get("filename") or "Untitled file"
            )
            updated_at = parse_canvas_file_datetime(
                file.get("updated_at") or file.get("created_at"),
                now,
            )
            created_at = parse_canvas_file_datetime(file.get("created_at"), updated_at)
            cached_files.append(
                {
                    "user_id": current_user.id,
                    "module_code": course["course_code"],
                    "canvas_course_id": str(course["id"]),
                    "canvas_file_id": str(file.get("id", "")),
                    "canvas_folder_id": (
                        str(file["folder_id"]) if file.get("folder_id") else None
                    ),
                    "filename": filename,
                    "content_type": file.get("content-type")
                    or "application/octet-stream",
                    "file_type": get_file_type(filename),
                    "size_bytes": int(file.get("size") or 0),
                    "canvas_url": file.get("url") or file.get("html_url") or "",
                    "external_url": file.get("html_url")
                    or (
                        f"https://canvas.nus.edu.sg/courses/{course['id']}"
                        f"/files/{file.get('id')}"
                    ),
                    "thumbnail_url": file.get("thumbnail_url"),
                    "locked": bool(file.get("locked")),
                    "hidden": bool(file.get("hidden")),
                    "created_at_canvas": created_at,
                    "updated_at_canvas": updated_at,
                }
            )

    async with db.transaction():
        current_course_ids = {str(course["id"]) for course in courses}
        cached_course_rows = await db.fetch_all(
            query="""
                SELECT DISTINCT canvas_course_id
                FROM canvas_files
                WHERE user_id = :user_id
            """,
            values={"user_id": current_user.id},
        )
        for row in cached_course_rows:
            if row["canvas_course_id"] not in current_course_ids:
                await db.execute(
                    query="""
                        DELETE FROM canvas_files
                        WHERE user_id = :user_id
                            AND canvas_course_id = :course_id
                    """,
                    values={
                        "user_id": current_user.id,
                        "course_id": row["canvas_course_id"],
                    },
                )

        for course in courses:
            existing_module = await db.fetch_one(
                query="""
                    SELECT id
                    FROM academic_modules
                    WHERE user_id = :user_id AND module_code = :module_code
                    ORDER BY id ASC
                    LIMIT 1
                """,
                values={
                    "user_id": current_user.id,
                    "module_code": course["course_code"],
                },
            )
            module_values = {
                "user_id": current_user.id,
                "module_code": course["course_code"],
                "name": course["name"],
                "source_course_id": str(course["id"]),
                "external_url": course["external_url"],
            }
            if existing_module:
                await db.execute(
                    query="""
                        UPDATE academic_modules
                        SET name = :name,
                            source_type = 'canvas',
                            source_course_id = :source_course_id,
                            external_url = :external_url
                        WHERE id = :module_id AND user_id = :user_id
                    """,
                    values={
                        "user_id": current_user.id,
                        "module_id": existing_module["id"],
                        "name": course["name"],
                        "source_course_id": str(course["id"]),
                        "external_url": course["external_url"],
                    },
                )
            else:
                await db.execute(
                    query="""
                        INSERT INTO academic_modules (
                            user_id, module_code, name, source_type,
                            source_course_id, external_url
                        )
                        VALUES (
                            :user_id, :module_code, :name, 'canvas',
                            :source_course_id, :external_url
                        )
                    """,
                    values=module_values,
                )

        for course, _ in successful_results:
            await db.execute(
                query="""
                    DELETE FROM canvas_files
                    WHERE user_id = :user_id
                        AND canvas_course_id = :course_id
                """,
                values={
                    "user_id": current_user.id,
                    "course_id": str(course["id"]),
                },
            )
        if cached_files:
            await db.execute_many(
                query="""
                    INSERT INTO canvas_files (
                        user_id, module_code, canvas_course_id, canvas_file_id,
                        canvas_folder_id, filename, content_type, file_type,
                        size_bytes, canvas_url, external_url, thumbnail_url,
                        locked, hidden, created_at_canvas, updated_at_canvas
                    )
                    VALUES (
                        :user_id, :module_code, :canvas_course_id, :canvas_file_id,
                        :canvas_folder_id, :filename, :content_type, :file_type,
                        :size_bytes, :canvas_url, :external_url, :thumbnail_url,
                        :locked, :hidden, :created_at_canvas, :updated_at_canvas
                    )
                """,
                values=cached_files,
            )
        await db.execute(
            query="""
                INSERT INTO canvas_sync_state (user_id, files_synced_at)
                VALUES (:user_id, NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET files_synced_at = EXCLUDED.files_synced_at
            """,
            values={"user_id": current_user.id},
        )

    return await list_cached_canvas_files(current_user)
