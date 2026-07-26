"""
Shared pytest configuration and fixtures for CanVenient backend tests.
Uses SQLite test database via DATABASE_URL override.
"""

import os
import sys
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Set test database URL before importing database module
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["JWT_SECRET"] = os.getenv("JWT_SECRET", "test-secret-key-for-orbital-ci")

# Ensure backend root is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from database import db
from schema import initialize_schema


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Connect to test database and run schema initialization once for test session."""
    await db.connect()
    await initialize_schema()
    yield
    await db.disconnect()
    # Remove SQLite test file on teardown if it exists
    if os.path.exists("./test.db"):
        try:
            os.remove("./test.db")
        except OSError:
            pass


def unique_email() -> str:
    """Generate a unique test email address."""
    return f"orbital_test_{uuid.uuid4().hex[:8]}@u.nus.edu"


TEST_PASSWORD = "Password123!"


@pytest_asyncio.fixture
async def client():
    """Function-scoped AsyncClient using ASGITransport for testing FastAPI endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth(client: AsyncClient):
    """Registers a fresh unique user and yields (token, user_id, email). Cleaned up after test."""
    email = unique_email()
    resp = await client.post("/auth/register", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 201, f"Failed user registration fixture: {resp.text}"
    data = resp.json()
    token = data["access_token"]
    user_id = data["user"]["id"]

    yield token, user_id, email

    # Teardown user
    try:
        await db.execute("DELETE FROM users WHERE id = :id", values={"id": user_id})
    except Exception:
        pass


def auth_headers(token: str) -> dict:
    """Helper to generate Authorization header dictionary."""
    return {"Authorization": f"Bearer {token}"}
