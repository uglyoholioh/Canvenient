import pytest
from conftest import auth_headers
from httpx import AsyncClient

from database import db

pytest.skip(
    "routes/canvas_search.py was removed from the backend; the frontend counterparts "
    "in CanvasView.test.jsx are skipped for the same reason. Restore or delete this "
    "module together with the feature.",
    allow_module_level=True,
)

from routes.canvas_search import clean_canvas_text, resource_search_score, tokenize_resource_query


def test_query_tokenizer_removes_request_language_and_keeps_topic():
    assert tokenize_resource_query("Where can I find the ST2334 page about confidence intervals?") == [
        "st2334", "confidence", "interval"
    ]


def test_canvas_html_is_reduced_to_searchable_text():
    assert clean_canvas_text("<h2>Central limit theorem</h2><script>ignore()</script><p>Sample means.</p>") == (
        "Central limit theorem Sample means."
    )


def test_title_matches_rank_above_body_only_matches():
    terms = ["confidence", "intervals"]
    title_match = resource_search_score(
        {"title": "Confidence intervals", "body": "", "course_code": "ST2334", "resource_type": "page"},
        terms,
        "confidence intervals",
    )
    body_match = resource_search_score(
        {"title": "Week 6", "body": "confidence intervals", "course_code": "ST2334", "resource_type": "page"},
        terms,
        "confidence intervals",
    )
    assert title_match > body_match


@pytest.mark.asyncio
async def test_resource_search_returns_content_match(client: AsyncClient, auth):
    token, user_id, _ = auth
    await db.execute(
        query="""
            INSERT INTO canvas_resource_index (
                user_id, canvas_course_id, course_code, resource_type,
                resource_id, title, body, external_url
            ) VALUES (
                :user_id, '101', 'ST2334', 'page', 'confidence-intervals',
                'Week 6 tutorial', 'Constructing a confidence interval for a population mean',
                'https://canvas.test/pages/confidence-intervals'
            )
        """,
        values={"user_id": user_id},
    )
    await db.execute(
        query="""
            INSERT INTO canvas_sync_state (user_id, resources_synced_at)
            VALUES (:user_id, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET resources_synced_at = CURRENT_TIMESTAMP
        """,
        values={"user_id": user_id},
    )

    response = await client.get(
        "/canvas/resource-search",
        params={"q": "Where is the ST2334 page explaining confidence intervals?"},
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["results"][0]["title"] == "Week 6 tutorial"
    assert payload["results"][0]["matched_in_content"] is True
    assert "confidence interval" in payload["results"][0]["snippet"].lower()


@pytest.mark.asyncio
async def test_resource_index_sync_collects_canvas_pages_and_metadata(
    client: AsyncClient, auth, monkeypatch
):
    token, user_id, _ = auth
    await db.execute(
        query="""
            INSERT INTO user_settings (user_id, canvas_token)
            VALUES (:user_id, 'canvas-token')
            ON CONFLICT (user_id) DO UPDATE SET canvas_token = 'canvas-token'
        """,
        values={"user_id": user_id},
    )
    course = {
        "id": 101, "course_code": "ST2334", "name": "Statistics",
        "external_url": "https://canvas.test/courses/101",
    }

    async def courses(*args, **kwargs):
        return [course]

    async def assignments(*args, **kwargs):
        return [{"id": 1, "course_id": 101, "title": "Tutorial 1", "description": "Submit your solutions"}]

    async def announcements(*args, **kwargs):
        return [{"id": 2, "course_id": 101, "title": "Welcome", "body": "First lecture details"}]

    async def files(*args, **kwargs):
        return [{"id": 3, "display_name": "Lecture 1.pdf", "external_url": "https://canvas.test/files/3"}]

    async def pages(*args, **kwargs):
        return [{"url": "central-limit-theorem", "title": "Week 5", "updated_at": None}]

    async def page(*args, **kwargs):
        return {"title": "Week 5", "body": "The sample mean converges to a normal distribution."}

    async def modules(*args, **kwargs):
        return [{"id": 4, "name": "Week 5", "items": [{"id": 5, "title": "Practice quiz", "type": "Quiz", "html_url": "https://canvas.test/quizzes/5"}]}]

    async def syllabus(*args, **kwargs):
        return {"body": "Assessment and office-hour information"}

    monkeypatch.setattr("routes.canvas_search.list_canvas_courses", courses)
    monkeypatch.setattr("routes.canvas_search.list_canvas_assignments", assignments)
    monkeypatch.setattr("routes.canvas_search.list_canvas_announcements", announcements)
    monkeypatch.setattr("routes.canvas_search.list_canvas_files", files)
    monkeypatch.setattr("routes.canvas_search.list_canvas_pages", pages)
    monkeypatch.setattr("routes.canvas_search.get_canvas_page", page)
    monkeypatch.setattr("routes.canvas_search.list_canvas_course_modules", modules)
    monkeypatch.setattr("routes.canvas_search.get_canvas_syllabus", syllabus)

    response = await client.post("/canvas/resource-index", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json()["indexed_count"] == 7

    search_response = await client.get(
        "/canvas/resource-search",
        params={"q": "Which page explains sample means becoming normal?"},
        headers=auth_headers(token),
    )
    assert search_response.status_code == 200
    assert search_response.json()["results"][0]["resource_type"] == "page"
    assert search_response.json()["results"][0]["title"] == "Week 5"
