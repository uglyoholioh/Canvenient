import httpx
import pytest
from unittest.mock import patch
from httpx import AsyncClient, Response
from conftest import auth_headers

pytestmark = pytest.mark.asyncio

CANVAS_META_URL = "https://canvas.nus.edu.sg/api/v1/files/4242"
CANVAS_DOWNLOAD_URL = "https://canvas.nus.edu.sg/files/4242/download?download_frd=1"
SAMPLE_PDF_BYTES = b"%PDF-1.4 fake pdf bytes for testing"


async def save_canvas_token(client: AsyncClient, headers: dict):
    resp = await client.patch(
        "/auth/profile",
        json={"name": "PDF Tester", "canvas_token": "canvas-pat-123", "theme": "graphite"},
        headers=headers,
    )
    assert resp.status_code == 200


def make_response(status_code: int, url: str, json=None, content: bytes = b"", headers: dict | None = None):
    """Build an httpx Response that behaves like a real one (raise_for_status works)."""
    if json is not None:
        response = Response(status_code, json=json, headers=headers or {})
    else:
        response = Response(status_code, content=content, headers=headers or {})
    response._request = httpx.Request("GET", url)
    return response


class FakeCanvasClient:
    """Replaces httpx.AsyncClient inside routes.canvas only; routes by URL."""

    def __init__(self, handler):
        self.handler = handler
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, **kwargs):
        self.calls.append((str(url), kwargs))
        return self.handler(str(url), kwargs)


def patch_canvas_client(handler):
    return patch(
        "routes.canvas.httpx.AsyncClient",
        lambda **kwargs: FakeCanvasClient(handler),
    )


async def test_file_content_requires_auth(client: AsyncClient):
    resp = await client.get("/canvas/files/4242/content")
    assert resp.status_code == 401


async def test_file_content_requires_canvas_token(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)

    resp = await client.get("/canvas/files/4242/content", headers=headers)
    assert resp.status_code == 400
    assert "Canvas token" in resp.json()["detail"]


async def test_file_content_success(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    calls = []

    def handler(url, kwargs):
        calls.append((url, kwargs))
        if url == CANVAS_META_URL:
            return make_response(
                200,
                url,
                json={
                    "id": 4242,
                    "display_name": "lecture 03.pdf",
                    "filename": "lecture_03.pdf",
                    "url": CANVAS_DOWNLOAD_URL,
                    "size": len(SAMPLE_PDF_BYTES),
                    "content-type": "application/pdf",
                },
            )
        return make_response(
            200,
            url,
            content=SAMPLE_PDF_BYTES,
            headers={"content-type": "application/pdf"},
        )

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files/4242/content", headers=headers)

    assert resp.status_code == 200
    assert resp.content == SAMPLE_PDF_BYTES
    assert resp.headers["content-type"].startswith("application/pdf")
    assert "lecture%2003.pdf" in resp.headers["content-disposition"]
    # The download request must not carry the bearer header: S3 rejects
    # duplicate auth mechanisms on presigned URLs.
    meta_call, download_call = calls
    assert meta_call[0] == CANVAS_META_URL
    assert download_call[0] == CANVAS_DOWNLOAD_URL
    assert not download_call[1].get("headers")


async def test_file_content_canvas_401(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    def handler(url, kwargs):
        return make_response(401, url, json={"errors": [{"message": "Invalid access token."}]})

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files/4242/content", headers=headers)

    assert resp.status_code == 401
    assert "invalid or expired" in resp.json()["detail"]


async def test_file_content_canvas_404(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    def handler(url, kwargs):
        return make_response(404, url, json={"message": "Resource not found."})

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files/4242/content", headers=headers)

    assert resp.status_code == 404
    assert "no longer exists" in resp.json()["detail"]


async def test_file_content_canvas_error_maps_to_502(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    def handler(url, kwargs):
        return make_response(500, url, json={"message": "Canvas exploded."})

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files/4242/content", headers=headers)

    assert resp.status_code == 502
    assert "Canvas" in resp.json()["detail"]


async def test_file_content_oversize_rejected(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    def handler(url, kwargs):
        return make_response(
            200,
            url,
            json={
                "id": 4242,
                "display_name": "huge.zip",
                "url": CANVAS_DOWNLOAD_URL,
                "size": 200 * 1024 * 1024,
            },
        )

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files/4242/content", headers=headers)

    assert resp.status_code == 413


async def test_files_listing_includes_content_type(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    def handler(url, kwargs):
        return make_response(
            200,
            url,
            json=[
                {
                    "id": 4242,
                    "display_name": "lecture 03.pdf",
                    "filename": "lecture_03.pdf",
                    "url": CANVAS_DOWNLOAD_URL,
                    "size": 1024,
                    "updated_at": "2026-09-01T10:00:00Z",
                    "folder_id": 77,
                    "content-type": "application/pdf",
                }
            ],
        )

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files", params={"course_id": 321}, headers=headers)

    assert resp.status_code == 200
    files = resp.json()
    assert files and files[0]["content_type"] == "application/pdf"


def canvas_file(index: int) -> dict:
    return {
        "id": index,
        "display_name": f"file {index}.pdf",
        "filename": f"file_{index}.pdf",
        "url": CANVAS_DOWNLOAD_URL,
        "size": 1024,
        "updated_at": "2026-09-01T10:00:00Z",
        "folder_id": 77,
        "content-type": "application/pdf",
    }


async def test_files_listing_follows_canvas_pagination(client: AsyncClient, auth):
    token, _, _ = auth
    headers = auth_headers(token)
    await save_canvas_token(client, headers)

    def handler(url, kwargs):
        # Canvas pages of 100: a full first page plus a short second page.
        if "page=2" in url:
            return make_response(200, url, json=[canvas_file(101), canvas_file(102)])
        return make_response(200, url, json=[canvas_file(i) for i in range(1, 101)])

    with patch_canvas_client(handler):
        resp = await client.get("/canvas/files", params={"course_id": 321}, headers=headers)

    assert resp.status_code == 200
    files = resp.json()
    assert len(files) == 102
    assert {f["id"] for f in files[-2:]} == {101, 102}
