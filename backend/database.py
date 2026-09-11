import os
from pathlib import Path

from databases import Database
from databases.backends.sqlite import SQLiteBackend, SQLitePool
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in .env")


def _sqlite_db_path(url: str) -> Path | None:
    if "sqlite" not in url.lower():
        return None
    return Path(url.split("///", 1)[-1])


class PragmaSQLitePool(SQLitePool):
    """Acquires aiosqlite connections with the PRAGMAs Canvenient needs.

    databases 0.9 opens a fresh SQLite connection for every query, so
    per-connection settings must be (re)applied on each acquire. WAL itself is
    persistent, but re-issuing journal_mode is idempotent and converts a
    restored pre-WAL backup file back to WAL on first use.
    """

    async def acquire(self):
        connection = await super().acquire()
        # busy_timeout first: the WAL switch below can contend for locks.
        await connection.execute("PRAGMA busy_timeout = 5000")
        await connection.execute("PRAGMA foreign_keys = ON")
        await connection.execute("PRAGMA journal_mode = WAL")
        return connection


class PragmaSQLiteBackend(SQLiteBackend):
    def __init__(self, url, **options):
        super().__init__(url, **options)
        self._pool = PragmaSQLitePool(url, **options)


class CanvenientDatabase(Database):
    SUPPORTED_BACKENDS = {
        **Database.SUPPORTED_BACKENDS,
        "sqlite": f"{__name__}:PragmaSQLiteBackend",
    }

    async def disconnect(self) -> None:
        await super().disconnect()
        db_path = _sqlite_db_path(DATABASE_URL)
        if db_path is None:
            return
        # SQLite removes WAL sidecars on a clean close, but a crashed session
        # can leave them behind. A file-level restore (backups.restore_database
        # copies over the live file) must never find stale sidecars to replay
        # onto the restored file, so a controlled shutdown sweeps them.
        for suffix in ("-wal", "-shm"):
            sidecar = db_path.with_name(db_path.name + suffix)
            try:
                sidecar.unlink(missing_ok=True)
            except OSError:
                pass


if "sqlite" in DATABASE_URL.lower():
    db = CanvenientDatabase(DATABASE_URL)
else:
    db = Database(DATABASE_URL, min_size=1, max_size=3)
