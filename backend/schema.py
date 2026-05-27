from database import db


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        hashed_password BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (LOWER(email))
    """,
    """
    CREATE TABLE IF NOT EXISTS categories (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#2F7A72',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, name)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS categories_user_id_idx
    ON categories (user_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS academic_modules (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'manual',
        source_course_id TEXT,
        external_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, code)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS academic_modules_user_id_idx
    ON academic_modules (user_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS tasks (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_id BIGINT REFERENCES academic_modules(id) ON DELETE SET NULL,
        category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority_manual TEXT NOT NULL DEFAULT 'medium',
        estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
        source_type TEXT NOT NULL DEFAULT 'manual',
        source_id TEXT,
        source_due_at TIMESTAMPTZ,
        due_at_override TIMESTAMPTZ,
        external_url TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS tasks_user_id_idx
    ON tasks (user_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS tasks_user_id_status_idx
    ON tasks (user_id, status)
    """,
    """
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        canvas_token TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
]


async def initialize_schema() -> None:
    for statement in SCHEMA_STATEMENTS:
        await db.execute(query=statement)
