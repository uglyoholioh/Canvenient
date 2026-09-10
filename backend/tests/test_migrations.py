"""
Tests for the sequential migration runner (backend/migrations.py).
"""

import pytest
from httpx import AsyncClient

from database import db
from migrations import run_migrations

pytestmark = pytest.mark.asyncio


async def _column_exists(table: str, column: str) -> bool:
    row = await db.fetch_one(
        query=f"SELECT name FROM pragma_table_info('{table}') WHERE name = :column",
        values={"column": column},
    )
    return row is not None


async def test_migrations_apply_once_in_order(client: AsyncClient):
    await db.execute("CREATE TABLE IF NOT EXISTS _mig_test (id INTEGER PRIMARY KEY, name TEXT)")

    plan = [
        ("0001_test_add_column", ["ALTER TABLE _mig_test ADD COLUMN priority TEXT DEFAULT 'medium'"]),
        ("0002_test_backfill", ["UPDATE _mig_test SET priority = 'high'"]),
    ]

    applied = await run_migrations(plan)
    assert applied == ["0001_test_add_column", "0002_test_backfill"]
    assert await _column_exists("_mig_test", "priority")

    recorded = await db.fetch_all("SELECT name FROM _migrations ORDER BY name")
    assert [r["name"] for r in recorded] == ["0001_test_add_column", "0002_test_backfill"]

    # A second run is a no-op.
    applied_again = await run_migrations(plan)
    assert applied_again == []

    # Earlier entries stay skipped even when new ones are appended.
    extended = plan + [("0003_test_later", ["ALTER TABLE _mig_test ADD COLUMN flag INTEGER DEFAULT 0"])]
    applied_third = await run_migrations(extended)
    assert applied_third == ["0003_test_later"]

    await db.execute("DROP TABLE _mig_test")
    await db.execute(
        "DELETE FROM _migrations WHERE name IN "
        "('0001_test_add_column', '0002_test_backfill', '0003_test_later')"
    )


async def test_failed_migration_rolls_back_and_does_not_record(client: AsyncClient):
    await db.execute("CREATE TABLE IF NOT EXISTS _mig_fail (id INTEGER PRIMARY KEY)")

    plan = [
        ("0009_fail_add_column", [
            "ALTER TABLE _mig_fail ADD COLUMN ok_col TEXT",
            "THIS IS NOT VALID SQL",
        ]),
    ]

    with pytest.raises(Exception):
        await run_migrations(plan)

    # The good statement rolled back with the failed transaction…
    assert not await _column_exists("_mig_fail", "ok_col")
    # …and nothing was recorded, so a fixed migration can be applied later.
    recorded = await db.fetch_one(
        "SELECT name FROM _migrations WHERE name = :name", {"name": "0009_fail_add_column"}
    )
    assert recorded is None

    await db.execute("DROP TABLE _mig_fail")
