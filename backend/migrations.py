"""Sequential, once-only schema migrations for existing installs.

`schema.py` handles fresh installs and additive `CREATE TABLE IF NOT EXISTS`
changes, but it cannot evolve tables that already exist on a user's machine.
Add one `(name, statements)` entry to `MIGRATIONS` for each such change; the
runner applies it exactly once per database, tracked in `_migrations`, and
raises on failure so a half-applied schema never serves silently.

Rules:
- Append new migrations to the END of the list; never reorder, edit, or
  delete an entry that has shipped.
- Statements must be dialect-safe (see sql_dialect) — they run on both
  PostgreSQL servers and the SQLite desktop sidecar.
"""

from database import db

MIGRATIONS: list[tuple[str, list[str]]] = [
    (
        "0001_canvas_sync_error_tracking",
        [
            "ALTER TABLE canvas_sync_state ADD COLUMN last_sync_error TEXT",
            "ALTER TABLE canvas_sync_state ADD COLUMN last_sync_error_at TIMESTAMPTZ",
        ],
    ),
    (
        "0002_telegram_daily_digest",
        [
            "ALTER TABLE telegram_links ADD COLUMN digest_time TEXT NOT NULL DEFAULT '08:00'",
            "ALTER TABLE telegram_links ADD COLUMN digest_enabled BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE telegram_links ADD COLUMN last_digest_date DATE",
        ],
    ),
]


async def run_migrations(migrations: list[tuple[str, list[str]]] | None = None) -> list[str]:
    """Apply unapplied migrations in order; returns the names applied now."""
    entries = MIGRATIONS if migrations is None else migrations
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    done = {row["name"] for row in await db.fetch_all("SELECT name FROM _migrations")}

    applied_now = []
    for name, statements in entries:
        if name in done:
            continue
        async with db.transaction():
            for statement in statements:
                await db.execute(statement)
            await db.execute("INSERT INTO _migrations (name) VALUES (:name)", {"name": name})
        applied_now.append(name)
    return applied_now
