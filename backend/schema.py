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
    CREATE TABLE IF NOT EXISTS classes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_code TEXT NOT NULL,
        module_name TEXT NOT NULL,
        lesson_type TEXT NOT NULL,
        class_no TEXT,
        day_of_week int NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        venue TEXT,
        rrule TEXT,
        exdates JSONB
    )
    """,
    """
    ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS class_date DATE
    """,
    """
    CREATE TABLE IF NOT EXISTS user_settings (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        canvas_token TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS exams (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_code TEXT NOT NULL,
        module_name TEXT NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS categories_user_id_idx
    ON categories (user_id)
    """,
    """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'academic_modules'
                AND column_name = 'code'
        ) AND NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'academic_modules'
                AND column_name = 'module_code'
        ) THEN
            ALTER TABLE academic_modules RENAME COLUMN code TO module_code;
        END IF;
    END $$;
    """,
    """
    CREATE TABLE IF NOT EXISTS academic_modules (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_code TEXT NOT NULL,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'canvas',
        source_course_id TEXT,
        external_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, module_code)
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS academic_modules_user_module_code_unique
    ON academic_modules (user_id, module_code)
    """,
    """
    CREATE INDEX IF NOT EXISTS academic_modules_user_id_idx
    ON academic_modules (user_id)
    """,
    """
    DELETE FROM academic_modules
    WHERE source_type <> 'canvas'
    """,
    """
    ALTER TABLE academic_modules
    ALTER COLUMN source_type SET DEFAULT 'canvas'
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'academic_modules_canvas_source_only'
                AND conrelid = 'academic_modules'::regclass
        ) THEN
            ALTER TABLE academic_modules
            ADD CONSTRAINT academic_modules_canvas_source_only
            CHECK (source_type = 'canvas');
        END IF;
    END $$;
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
        estimated_minutes INTEGER CHECK (
            estimated_minutes IS NULL OR estimated_minutes >= 0
        ),
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
    CREATE INDEX IF NOT EXISTS classes_user_id_idx
    ON classes (user_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS exams_user_id_idx
    ON exams (user_id)
    """,
    # comms & grps
    """
    CREATE TABLE IF NOT EXISTS communities (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS groups (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        c_id BIGINT REFERENCES communities(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS g_members (
        g_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        attendance TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (g_id, user_id)
    )
    """,
    # events
    """
    CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        c_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
        g_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
        module_code TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        venue TEXT,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ,
        is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS event_attendance(
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        e_id BIGINT REFERENCES events(id) ON DELETE CASCADE,
        is_attending BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (user_id, e_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS invites(
        id BIGSERIAL PRIMARY KEY,
        creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        c_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
        g_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications
    (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS telegram_links (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        chat_id BIGINT UNIQUE,
        linked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS telegram_pending_links (
        chat_id BIGINT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS telegram_processed_updates (
        update_id BIGINT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    #  canvas cache
    """
    CREATE TABLE IF NOT EXISTS canvas_announcements (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_id BIGINT NOT NULL REFERENCES academic_modules(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS canvas_folders (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_code TEXT NOT NULL,
        canvas_course_id TEXT NOT NULL,
        canvas_folder_id TEXT NOT NULL,
        parent_canvas_folder_id TEXT,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        files_count INT NOT NULL DEFAULT 0,
        folders_count INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS canvas_files (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_code TEXT NOT NULL,
        canvas_course_id TEXT NOT NULL,
        canvas_file_id TEXT NOT NULL,
        canvas_folder_id TEXT,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        file_type TEXT NOT NULL,
        size_bytes INT NOT NULL,
        canvas_url TEXT NOT NULL,
        external_url TEXT NOT NULL,
        thumbnail_url TEXT,
        locked BOOLEAN,
        hidden BOOLEAN,
        created_at_canvas TIMESTAMPTZ NOT NULL,
        updated_at_canvas TIMESTAMPTZ NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS canvas_sync_state (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        files_synced_at TIMESTAMPTZ
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS canvas_api_cache (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cache_key TEXT NOT NULL,
        data JSONB NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, cache_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ai_brief_cache (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        brief_data JSONB NOT NULL,
        context_snapshot JSONB NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    DO $$
    BEGIN
        IF to_regclass('canvas_courses') IS NOT NULL THEN
            INSERT INTO academic_modules (
                user_id,
                module_code,
                name,
                source_type,
                source_course_id,
                external_url
            )
            SELECT
                user_id,
                course_code,
                name,
                'canvas',
                canvas_course_id,
                external_url
            FROM canvas_courses
            ON CONFLICT (user_id, module_code)
            DO UPDATE SET
                name = EXCLUDED.name,
                source_type = 'canvas',
                source_course_id = EXCLUDED.source_course_id,
                external_url = EXCLUDED.external_url;

            DROP TABLE canvas_courses;
        END IF;
    END $$;
    """,
    """
    CREATE INDEX IF NOT EXISTS canvas_files_user_id_idx
    ON canvas_files (user_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS canvas_files_user_course_idx
    ON canvas_files (user_id, canvas_course_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS canvas_files_user_updated_idx
    ON canvas_files (user_id, updated_at_canvas DESC)
    """,
    # ── community / group resources ───────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS cg_announcements (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        c_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
        g_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        start_at TIMESTAMPTZ,
        end_at TIMESTAMPTZ,
        is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
        venue TEXT,
        tag TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cg_announcements_has_owner CHECK (
            c_id IS NOT NULL OR g_id IS NOT NULL
        )
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cg_files (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        c_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
        g_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        storage_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cg_files_has_owner CHECK (c_id IS NOT NULL OR g_id IS NOT NULL)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cg_forms (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        c_id BIGINT REFERENCES communities(id) ON DELETE CASCADE,
        g_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        form_type TEXT NOT NULL DEFAULT 'survey',
        fields JSONB NOT NULL DEFAULT '[]',
        closes_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cg_forms_has_owner CHECK (c_id IS NOT NULL OR g_id IS NOT NULL)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cg_form_responses (
        id BIGSERIAL PRIMARY KEY,
        form_id BIGINT NOT NULL REFERENCES cg_forms(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        response_data JSONB NOT NULL DEFAULT '{}',
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (form_id, user_id)
    )
    """,
    #  indexes for new tables
    """
    CREATE INDEX IF NOT EXISTS groups_c_id_idx ON groups(c_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS g_members_user_id_idx ON g_members(user_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS events_c_id_idx ON events(c_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS events_g_id_idx ON events(g_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS events_start_at_idx ON events(start_at)
    """,
    """
    CREATE INDEX IF NOT EXISTS cg_announcements_c_id_idx ON cg_announcements(c_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS cg_announcements_g_id_idx ON cg_announcements(g_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS cg_files_c_id_idx ON cg_files(c_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS cg_files_g_id_idx ON cg_files(g_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS cg_forms_c_id_idx ON cg_forms(c_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS cg_forms_g_id_idx ON cg_forms(g_id)
    """,
    """
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS event_type TEXT
    """,
    """
    ALTER TABLE event_attendance
    ADD COLUMN IF NOT EXISTS attended BOOLEAN DEFAULT NULL
    """,
    """
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default'
    """,
    """
    CREATE TABLE IF NOT EXISTS study_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
        module_id BIGINT REFERENCES academic_modules(id) ON DELETE SET NULL,
        category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 480),
        actual_seconds INTEGER NOT NULL DEFAULT 0 CHECK (actual_seconds >= 0),
        pause_count INTEGER NOT NULL DEFAULT 0 CHECK (pause_count >= 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS folders (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        parent_id BIGINT REFERENCES folders(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL,
        title TEXT NOT NULL DEFAULT 'Untitled',
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES folders(id) ON DELETE SET NULL
    """,
    """
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled'
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_one_active_per_user
    ON study_sessions (user_id) WHERE status = 'active'
    """,
    """
    CREATE INDEX IF NOT EXISTS study_sessions_user_ended_idx
    ON study_sessions (user_id, ended_at DESC)
    """,
]


async def initialize_schema() -> None:
    is_sqlite = "sqlite" in str(db.url).lower()
    for statement in SCHEMA_STATEMENTS:
        if is_sqlite:
            stmt_stripped = statement.strip()
            # Skip PL/pgSQL blocks, column type alters, constraints, and Postgres-specific views
            if (
                stmt_stripped.startswith("DO $$")
                or "ALTER COLUMN" in stmt_stripped
                or "ADD CONSTRAINT" in stmt_stripped
                or ("ON CONFLICT" in stmt_stripped and "DO UPDATE SET" in stmt_stripped)
                or "information_schema" in stmt_stripped
            ):
                continue
            
            # Format SQLite compatible SQL
            stmt = (
                statement.replace("BIGSERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
                .replace("TIMESTAMPTZ", "DATETIME")
                .replace("BYTEA", "BLOB")
                .replace("DEFAULT NOW()", "DEFAULT CURRENT_TIMESTAMP")
                .replace("JSONB", "JSON")
                .replace("ADD COLUMN IF NOT EXISTS", "ADD COLUMN")
            )
            try:
                await db.execute(query=stmt)
            except Exception:
                pass
        else:
            await db.execute(query=statement)


