import secrets
from datetime import datetime, timezone


HELP_TEXT = """Canvenient commands:
/today - today's schedule and tasks
/week - the next 7 days
/deadlines - upcoming deadlines
/tasks - pending tasks
/done <task id> - complete a task
/help - show this message"""


def generate_connection_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "CV-" + "".join(secrets.choice(alphabet) for _ in range(8))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _format_time(value: datetime) -> str:
    return _as_utc(value).astimezone().strftime("%a %d %b, %H:%M")


def format_items(title: str, tasks: list, events: list) -> str:
    lines = [title]
    if events:
        lines.append("\nEvents")
        lines.extend(
            f"• {_format_time(row['start_at'])} — {row['title']}" for row in events
        )
    if tasks:
        lines.append("\nTasks")
        for row in tasks:
            due_at = row["due_at"]
            due = f" — {_format_time(due_at)}" if due_at else ""
            lines.append(f"• #{row['id']} {row['title']}{due}")
    if not tasks and not events:
        lines.append("\nNothing scheduled. You're all clear!")
    return "\n".join(lines)
