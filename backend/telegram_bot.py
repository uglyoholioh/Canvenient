import asyncio
import os

import httpx

from database import db
from telegram_formatting import HELP_TEXT, format_items


async def send_message(chat_id: int, text: str, retries: int = 3) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}

    async with httpx.AsyncClient(timeout=10) as client:
        for attempt in range(retries):
            try:
                response = await client.post(url, json=payload)
                if response.status_code == 429:
                    data = (
                        response.json()
                        if response.headers.get("content-type", "").startswith("application/json")
                        else {}
                    )
                    retry_after = data.get("parameters", {}).get("retry_after", 1)
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()
                return
            except (httpx.HTTPStatusError, httpx.RequestError) as err:
                if attempt == retries - 1:
                    raise err
                await asyncio.sleep(0.5 * (2 ** attempt))


async def _tasks(user_id: int, interval: str | None = None) -> list:
    condition = ""
    if interval == "today":
        condition = "AND COALESCE(due_at_override, source_due_at) < CURRENT_DATE + INTERVAL '1 day'"
    elif interval == "week":
        condition = "AND COALESCE(due_at_override, source_due_at) < NOW() + INTERVAL '7 days'"
    return await db.fetch_all(
        query=f"""
            SELECT id, title, COALESCE(due_at_override, source_due_at) AS due_at
            FROM tasks
            WHERE user_id = :user_id AND status <> 'done' {condition}
            ORDER BY due_at ASC NULLS LAST LIMIT 10
        """,
        values={"user_id": user_id},
    )


async def _events(user_id: int, interval: str) -> list:
    end = "CURRENT_DATE + INTERVAL '1 day'" if interval == "today" else "NOW() + INTERVAL '7 days'"
    return await db.fetch_all(
        query=f"""
            SELECT DISTINCT e.id, e.title, e.start_at
            FROM events e
            LEFT JOIN g_members gm ON gm.g_id = e.g_id
            LEFT JOIN groups g ON g.c_id = e.c_id
            LEFT JOIN g_members cm ON cm.g_id = g.id
            WHERE (e.user_id = :user_id OR gm.user_id = :user_id OR cm.user_id = :user_id)
              AND e.start_at >= CURRENT_DATE AND e.start_at < {end}
            ORDER BY e.start_at ASC LIMIT 10
        """,
        values={"user_id": user_id},
    )


async def handle_command(user_id: int, text: str) -> str:
    parts = text.strip().split()
    command = parts[0].split("@", 1)[0].lower() if parts else "/help"
    if command in {"/start", "/help"}:
        return HELP_TEXT
    if command == "/tasks":
        return format_items("Pending tasks", await _tasks(user_id), [])
    if command == "/deadlines":
        return format_items("Upcoming deadlines", await _tasks(user_id, "week"), [])
    if command in {"/today", "/week"}:
        interval = command[1:]
        return format_items(
            "Today" if interval == "today" else "Next 7 days",
            await _tasks(user_id, interval),
            await _events(user_id, interval),
        )
    if command == "/done":
        if len(parts) != 2 or not parts[1].lstrip("#").isdigit():
            return "Usage: /done <task id> (for example, /done 12)"
        task_id = int(parts[1].lstrip("#"))
        row = await db.fetch_one(
            query="""
                UPDATE tasks SET status = 'done', completed_at = NOW(), updated_at = NOW()
                WHERE id = :task_id AND user_id = :user_id AND status <> 'done'
                RETURNING title
            """,
            values={"task_id": task_id, "user_id": user_id},
        )
        return f"Completed: {row['title']} ✅" if row else "Task not found or already completed."
    return f"Unknown command.\n\n{HELP_TEXT}"
