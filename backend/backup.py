"""Launch-time backups of the SQLite database.

The packaged desktop app keeps all user data in a single SQLite file, so a
bad migration, agent mishap, or disk error could destroy everything at once.
Before the backend connects on each launch, a timestamped copy of the
database is taken via SQLite's online-backup API and a rolling window of the
most recent copies is kept. Backup failures never block startup.
"""

import os
import sqlite3
from datetime import datetime
from pathlib import Path

BACKUP_RETENTION = 10


def sqlite_path_from_url(database_url: str) -> Path | None:
    if "sqlite" not in database_url.lower():
        return None
    return Path(database_url.split("///", 1)[-1])


def backup_database(database_url: str | None = None, retention: int = BACKUP_RETENTION) -> Path | None:
    """Copy the SQLite database into <db dir>/backups/, keeping the newest `retention`.

    Returns the backup path, or None when the URL is not SQLite, the database
    file does not exist yet, or the backup failed (which must never block
    startup).
    """
    url = database_url if database_url is not None else (os.getenv("DATABASE_URL") or "")
    db_path = sqlite_path_from_url(url)
    if db_path is None or not db_path.exists():
        return None

    backup_dir = db_path.parent / "backups"
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = backup_dir / f"{db_path.stem}-{stamp}.db"

        source = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        target = sqlite3.connect(dest)
        try:
            source.backup(target)
        finally:
            source.close()
            target.close()
    except (sqlite3.Error, OSError):
        dest = locals().get("dest")
        if dest is not None:
            try:
                dest.unlink(missing_ok=True)
            except OSError:
                pass
        return None

    # Prune old backups, newest `retention` survive (name sort == time sort).
    try:
        for old in sorted(backup_dir.glob(f"{db_path.stem}-*.db"))[:-retention]:
            old.unlink(missing_ok=True)
    except OSError:
        pass
    return dest
