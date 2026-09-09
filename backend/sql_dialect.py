"""SQL expression helpers for queries that must run on both PostgreSQL and SQLite.

Server deployments use PostgreSQL while the packaged desktop sidecar always
runs SQLite, which implements neither NOW(), INTERVAL, date_trunc, nor
split_part, and has no :: cast syntax. Queries interpolate these expressions
so a single query body works on both dialects. All interval arguments are
code-controlled literals, never user input.
"""

from database import db


def is_sqlite(db_instance=db) -> bool:
    return "sqlite" in str(db_instance.url).lower()


def now_expr(db_instance=db) -> str:
    return "datetime('now')" if is_sqlite(db_instance) else "NOW()"


def now_plus_expr(interval: str, db_instance=db) -> str:
    if is_sqlite(db_instance):
        return f"datetime('now', '+{interval}')"
    return f"NOW() + INTERVAL '{interval}'"


def today_expr(db_instance=db) -> str:
    return "date('now')" if is_sqlite(db_instance) else "CURRENT_DATE"


def today_plus_expr(interval: str, db_instance=db) -> str:
    if is_sqlite(db_instance):
        return f"date('now', '+{interval}')"
    return f"CURRENT_DATE + INTERVAL '{interval}'"


def week_start_expr(db_instance=db) -> str:
    """Monday 00:00 of the current week, comparable against timestamp columns."""
    if is_sqlite(db_instance):
        return "datetime('now', '-6 days', 'weekday 1')"
    return "date_trunc('week', NOW())"
