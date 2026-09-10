"""
Tests for launch-time SQLite backups (backend/backup.py).
"""

import sqlite3

import pytest

from backup import backup_database, sqlite_path_from_url

pytestmark = pytest.mark.asyncio


def _make_db(path, rows=1):
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT)")
    for i in range(rows):
        conn.execute("INSERT INTO tasks (title) VALUES (?)", (f"task {i}",))
    conn.commit()
    conn.close()


async def test_backup_copies_database(tmp_path):
    db_file = tmp_path / "canvenient.db"
    _make_db(db_file, rows=3)

    dest = backup_database(f"sqlite:///{db_file}")

    assert dest is not None and dest.exists()
    assert dest.parent.name == "backups"
    assert dest.name.startswith("canvenient-")
    with sqlite3.connect(dest) as check:
        count = check.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    assert count == 3
    # Original untouched
    with sqlite3.connect(db_file) as check:
        assert check.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 3


async def test_backup_prunes_old_copies(tmp_path):
    db_file = tmp_path / "canvenient.db"
    _make_db(db_file)
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    # Seed 5 existing backups (with sortable timestamps), retention is 3.
    for i in range(5):
        (backup_dir / f"canvenient-2026010{i}-000000.db").write_bytes(b"old")

    dest = backup_database(f"sqlite:///{db_file}", retention=3)

    remaining = sorted(backup_dir.glob("canvenient-*.db"))
    assert len(remaining) == 3
    assert remaining[-1] == dest  # the fresh backup survives
    assert not (backup_dir / "canvenient-20260100-000000.db").exists()


async def test_backup_skips_non_sqlite_and_missing_db(tmp_path):
    assert backup_database("postgresql://localhost:5432/postgres") is None
    assert backup_database(f"sqlite:///{tmp_path / 'missing.db'}") is None


def test_sqlite_path_parsing():
    assert sqlite_path_from_url("sqlite:///./canvenient.db") is not None
    assert sqlite_path_from_url("sqlite+aiosqlite:///./test.db") is not None
    assert sqlite_path_from_url("postgresql://localhost/db") is None
