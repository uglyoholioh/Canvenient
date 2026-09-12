"""Scheduled Telegram daily digest.

A single background loop ticks every minute, finds linked users whose digest
time has passed today and who have not been sent one yet, and pushes a
plain-text briefing. `last_digest_date` is only advanced after a successful
send, so a failed send retries on the next tick rather than being lost.
"""

import asyncio
import logging
from datetime import datetime

from database import db
from telegram_bot import send_message

from ai.assistant import build_brief_text

logger = logging.getLogger("canvenient.ai")

TICK_SECONDS = 60
DEFAULT_DIGEST_TIME = "08:00"


async def _due_links(now: datetime) -> list[dict]:
    rows = await db.fetch_all(
        query="""
            SELECT user_id, chat_id, digest_time, last_digest_date
            FROM telegram_links
            WHERE digest_enabled AND chat_id IS NOT NULL
        """
    )
    today = now.date().isoformat()
    now_hhmm = now.strftime("%H:%M")
    due = []
    for row in rows:
        last = row["last_digest_date"]
        last_str = last.isoformat() if hasattr(last, "isoformat") else str(last or "")
        if last_str[:10] >= today:
            continue
        digest_time = str(row["digest_time"] or DEFAULT_DIGEST_TIME)[:5]
        if digest_time <= now_hhmm:
            due.append(row)
    return due


async def run_digest_tick() -> int:
    due = await _due_links(datetime.now())
    sent = 0
    for row in due:
        try:
            text = await build_brief_text(row["user_id"])
            await send_message(row["chat_id"], text)
        except Exception:
            logger.warning("digest send failed for user %s", row["user_id"], exc_info=True)
            continue
        await db.execute(
            query="UPDATE telegram_links SET last_digest_date = :today WHERE user_id = :user_id",
            values={"today": datetime.now().date().isoformat(), "user_id": row["user_id"]},
        )
        sent += 1
    return sent


async def digest_scheduler() -> None:
    while True:
        try:
            await run_digest_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("digest tick failed")
        await asyncio.sleep(TICK_SECONDS)
