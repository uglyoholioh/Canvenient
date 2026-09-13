"""Backup listing and restore endpoints for the local database."""

import hashlib
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backup import backup_database, backup_dir_for, list_backups, restore_database
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

    await db.disconnect()
    try:
        # Integrity logging covers only files inside the backups directory
        # (same containment rule restore_database enforces): the
        # request-supplied name is reduced to a bare filename, resolved, and
        # required to sit inside the backup dir before it is ever opened.
        backup_dir = backup_dir_for()
        backup_file = None
        integrity = "unavailable"
        if backup_dir is not None:
            candidate = (backup_dir / Path(payload.name).name).resolve()
            if candidate.parent == backup_dir.resolve() and candidate.is_file():
                backup_file = candidate
                with open(candidate, "rb") as fh:
                    integrity = hashlib.sha256(fh.read()).hexdigest()[:8]

        print(f"[restore] backup={backup_file or 'unavailable'} integrity={integrity}")
        ok = restore_database(payload.name)
        print(f"[restore] ok={ok}")
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
