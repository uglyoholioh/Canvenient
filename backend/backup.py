"""Launch-time backups of the SQLite database.

The packaged desktop app keeps all user data in a single SQLite file, so a
bad migration, agent mishap, or disk error could destroy everything at once.
Before the backend connects on each launch, a timestamped copy of the
database is taken via SQLite's online-backup API and a rolling window of the
most recent copies is kept. Backup failures never block startup.
"""

import os
import shutil
import sqlite3
from datetime import datetime, timezone
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
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
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


def list_backups(database_url: str | None = None) -> list[dict]:
    """Available backup copies for the current database, newest first."""
    url = database_url if database_url is not None else (os.getenv("DATABASE_URL") or "")
    db_path = sqlite_path_from_url(url)
    if db_path is None:
        return []
    backup_dir = db_path.parent / "backups"
    if not backup_dir.is_dir():
        return []
    result = []
    for file in backup_dir.glob(f"{db_path.stem}-*.db"):
        if not file.is_file():
            continue
        result.append({
            "name": file.name,
            "size_bytes": file.stat().st_size,
            "modified_at": datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc).isoformat(),
        })
    return sorted(result, key=lambda b: b["modified_at"], reverse=True)


def backup_dir_for(database_url: str | None = None) -> Path | None:
    db_path = sqlite_path_from_url(database_url or os.getenv("DATABASE_URL") or "")
    return db_path.parent / "backups" if db_path else None


def restore_database(backup_name: str, database_url: str | None = None) -> bool:
    """Copy a backup over the live database file.

    The caller MUST have disconnected the database first. Returns False when
    the name is not a plain filename inside the backups directory.
    """
    url = database_url if database_url is not None else (os.getenv("DATABASE_URL") or "")
    db_path = sqlite_path_from_url(url)
    backup_dir = backup_dir_for(url)
    if db_path is None or backup_dir is None:
        return False
    candidate = (backup_dir / Path(backup_name).name).resolve()
    if candidate.parent != backup_dir.resolve() or not candidate.is_file():
        return False
    shutil.copyfile(candidate, db_path)
    return True
