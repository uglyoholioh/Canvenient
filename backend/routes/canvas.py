from asyncio import coroutines
import httpx
from fastapi import APIRouter, HTTPException, status
from dependencies import CurrentUser
from typing import Any
from datetime import datetime, timedelta, timezone
import asyncio

router = APIRouter(prefix="/canvas", tags=["canvas"])


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
            f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self",
            headers=headers,
            timeout=5.0,
        )
        response.raise_for_status()
        submission = response.json()
    except Exception:
        return {}

    return submission if isinstance(submission, dict) else {}

@router.get("/courses", response_model=list[dict[str, Any]])
async def list_canvas_courses(current_user: CurrentUser):
    token = current_user.canvas_token
    if not token:
        return []
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://canvas.nus.edu.sg/api/v1/courses?enrollment_state=active&per_page=50",
                headers = headers,
                timeout = 5.0
            )

            response.raise_for_status()
            courses = response.json()
    except Exception:
        return []

    if not isinstance(courses, list):
        return []

    result = []
    for c in courses:
        if "course_code" in c and "id" in c:
            result.append({
                "id": c["id"],
                "course_code": c["course_code"],
                "name": c.get("name") or c["course_code"],
                "external_url": f"https://canvas.nus.edu.sg/courses/{c['id']}"
            })
    return result


@router.get("/announcements", response_model=list[dict[str, Any]])
async def list_canvas_announcements(current_user: CurrentUser):
    token = current_user.canvas_token
    if not token:
        return []

    courses = await list_canvas_courses(current_user)
    if not courses:
        return []

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
        return []

    if not isinstance(announcements, list):
        return []

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
                "exam", "quiz", "test", "midterm", "finals", "assessment",
                "due", "deadline", "submit", "submission", "extension",
                "cancelled", "postponed", "urgent", "important"
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
                "external_url": f"https://canvas.nus.edu.sg/courses/{course_id}/discussion_topics/{ann['id']}",
            }
        )

    result.sort(key=lambda x: x["posted_at"] or "", reverse=True)
    return result

async def fetch_course_assignments(client: httpx.AsyncClient, headers: dict, course: dict):
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
            timeout=5.0
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
            asgn.get("has_submitted_submissions")
            or has_canvas_submission(submission)
        )
        is_priority = False

        if due_at:
            try:
                due_date = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)

                is_priority = now <= due_date <= (now + timedelta(days=7))
            except Exception:
                pass
        result.append({
            "id": assignment_id,
            "course_id": course["id"],
            "course_code": course["course_code"],
            "course_name": course.get("name") or course["course_code"],
            "title": asgn.get("name") or "Untitled Assignment",
            "due_at": due_at,
            "is_priority": is_priority,
            "external_url": asgn.get("html_url") or f"https://canvas.nus.edu.sg/courses/{course['id']}/assignments/{assignment_id}",
            "description": asgn.get("description", "") or "",
            "has_submitted": has_submitted
        })
    return result

@router.get("/assignments", response_model=list[dict[str, Any]])
async def list_canvas_assignments(current_user: CurrentUser):
    token = current_user.canvas_token
    if not token:
        return []

    courses = await list_canvas_courses(current_user)
    if not courses:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        tasks = [
            fetch_course_assignments(client, headers, course)
            for course in courses
        ]
        all_results = await asyncio.gather(*tasks, return_exceptions=True)

    flat_list = [
        item
        for sublist in all_results
        if isinstance(sublist, list)
        for item in sublist
    ]

    flat_list.sort(key=lambda x: x["due_at"] or "9999-12-31T23:59:59Z")
    
    return flat_list


@router.get("/files", response_model=list[dict[str, Any]])
async def list_canvas_files(course_id: int, current_user: CurrentUser):
    token = current_user.canvas_token
    if not token:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://canvas.nus.edu.sg/api/v1/courses/{course_id}/files?per_page=50&sort=updated_at&order=desc",
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
