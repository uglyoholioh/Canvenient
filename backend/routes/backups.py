"""Backup listing and restore endpoints for the local database."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backup import backup_database, list_backups, restore_database
from database import db
from dependencies import CurrentUser
from migrations import run_migrations
from schema import initialize_schema

router = APIRouter(prefix="/backups", tags=["backups"])


class RestoreRequest(BaseModel):
    name: str


@router.get("")
async def list_database_backups(current_user: CurrentUser):
    return list_backups()


@router.post("/restore")
async def restore_database_backup(payload: RestoreRequest, current_user: CurrentUser):
    # A safety copy of the current state first, so a mistaken restore is itself
    # reversible.
    safety_copy = backup_database()
    if safety_copy is None:
        raise HTTPException(status_code=409, detail="No live database to restore from.")

    import hashlib
    import os

    await db.disconnect()
    try:
        _db_file = os.environ.get("DATABASE_URL", "").split("///", 1)[-1]

        def _h(f):
            if not os.path.exists(f):
                return "missing"
            with open(f, "rb") as fh:
                return hashlib.md5(fh.read()).hexdigest()[:8]

        print(
            f"[restore] target={_db_file} before_md5={_h(_db_file)} backup_md5={_h(os.path.join('backups', payload.name))}"
        )
        ok = restore_database(payload.name)
        print(f"[restore] ok={ok} after_md5={_h(_db_file)}")
        if not ok:
            raise HTTPException(status_code=404, detail="Backup not found.")
        await db.connect()
        await initialize_schema()
        await run_migrations()
    except HTTPException:
        await db.connect()
        raise
    except Exception as exc:
        await db.connect()
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}") from exc

    return {
        "restored": payload.name,
        "safety_backup": safety_copy.name if safety_copy else None,
    }
