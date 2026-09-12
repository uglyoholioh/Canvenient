"""The assistant brain: quick-capture parsing, grounded chat with actions,
and the "my day" briefing shared by the dashboard card and Telegram digest.

Design rules (see docs and the September 2026 assistant design discussion):
- Ground everything in `context` data; never let the model invent resources.
- The model proposes actions; the client confirms them — no AI write path.
- Every AI-dependent feature degrades to its deterministic part when the
  provider is unavailable.
"""

import base64
import json
import logging
from datetime import date, datetime, timedelta

import httpx
from database import db
from routes.canvas import list_canvas_announcements, list_canvas_assignments

from ai.context import chat_context, day_context
from ai.provider import AIUnavailable, generate_json

logger = logging.getLogger("canvenient.ai")

CANVAS_BASE = "https://canvas.nus.edu.sg/api/v1"
MAX_PDF_BYTES = 15 * 1024 * 1024
MAX_ATTACHMENT_CHARS = 12000
BRIEF_CACHE_TTL_MINUTES = 30
AI_ATTACHMENT_TYPES = {"note", "announcement", "assignment", "file"}

PARSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING"},
        "due_at": {"type": "STRING"},
        "priority": {"type": "STRING", "enum": ["high", "medium", "low"]},
        "category": {"type": "STRING"},
        "estimated_minutes": {"type": "INTEGER"},
    },
    "required": ["title"],
}

CHAT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "reply": {"type": "STRING"},
        "resources": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "type": {"type": "STRING", "enum": ["note", "announcement", "assignment", "file", "view"]},
                    "id": {"type": "INTEGER"},
                    "label": {"type": "STRING"},
                },
                "required": ["type", "label"],
            },
        },
        "actions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "kind": {"type": "STRING", "enum": ["create_task"]},
                    "title": {"type": "STRING"},
                    "due_at": {"type": "STRING"},
                    "priority": {"type": "STRING", "enum": ["high", "medium", "low"]},
                },
                "required": ["kind", "title"],
            },
        },
    },
    "required": ["reply", "resources", "actions"],
}

BRIEF_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "attention": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"text": {"type": "STRING"}},
                "required": ["text"],
            },
        },
    },
    "required": ["summary", "attention"],
}

PERSONA = (
    "You are Canvenient's assistant inside a university student's personal "
    "workspace app. You help the student organise their work and access their "
    "resources: briefing their day, finding notes/files/announcements, "
    "summarising documents, and proposing task actions. You are NOT a study "
    "tutor: if asked to teach or do academic work, briefly redirect to "
    "organising it instead (e.g. offer to break it into tasks)."
)

CHAT_SYSTEM = (
    PERSONA + "\n\nRules:\n"
    "- Ground every claim in the CONTEXT given below. Never invent tasks, "
    "classes, announcements, notes or files. If the answer is not in the "
    "context, say so plainly.\n"
    "- When you mention something the student could open, list it in "
    "resources using its exact id from the context (type 'view' needs no id: "
    "views are app sections like schedule, tasks, notes, canvas).\n"
    "- When the reply implies a concrete new task, propose it in actions "
    "(kind 'create_task'). The app will ask the student to confirm before "
    "anything is created. At most 3 actions.\n"
    "- Reply in 1-4 short sentences unless the student asked for a summary "
    "or briefing. No emojis. Output JSON only."
)

PARSE_SYSTEM = (
    PERSONA + "\n\nYou extract ONE task from the text the student captured. "
    "Resolve relative dates against today's date given below (e.g. 'next "
    "friday 5pm'). Return JSON only with: title (cleaned, concise, no dates "
    "unless part of the name), due_at ('YYYY-MM-DD HH:MM', 24h, or empty "
    "string if none), priority (high only if clearly urgent), category (one "
    "of the student's categories if it clearly fits, else empty), "
    "estimated_minutes (integer or 0). If the text is just a terse title "
    "with nothing to extract, return it as the title with everything else "
    "empty."
)

BRIEF_SYSTEM = (
    PERSONA + "\n\nWrite the student's briefing for today. The FACTS (classes, "
    "tasks, announcements) are listed separately and shown verbatim to the "
    "student — do not repeat them. Your job is judgement on top: summary (2-3 "
    "short sentences: what kind of day it is, the crunch points) and "
    "attention (at most 3 bullets: the thing most likely to slip, a conflict "
    "or gap worth acting on, something new in Canvas that needs a decision). "
    "Be direct and concrete; never invent facts. No emojis. Output JSON only."
)


async def parse_task_text(user, text: str) -> dict:
    """Turn natural language into one structured task proposal."""
    categories = await db.fetch_all(
        query="SELECT id, name FROM categories WHERE user_id = :user_id ORDER BY name",
        values={"user_id": user.id},
    )
    category_names = [c["name"] for c in categories]
    now = datetime.now()
    prompt = (
        f"Today is {now.strftime('%A %Y-%m-%d')}, {now.strftime('%H:%M')} local time.\n"
        f"Student's categories: {category_names}\n"
        f"Captured text: {text.strip()[:2000]}"
    )
    raw = await generate_json(PARSE_SYSTEM, prompt, PARSE_SCHEMA)
    return _normalize_parse(raw, categories, text)


def _normalize_parse(raw: dict, categories: list, fallback_text: str) -> dict:
    title = str(raw.get("title") or "").strip() or fallback_text.strip()[:120]
    due_at = None
    raw_due = str(raw.get("due_at") or "").strip()
    if raw_due:
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                due_at = datetime.strptime(raw_due, fmt).isoformat()
                break
            except ValueError:
                continue
    priority = raw.get("priority")
    if priority not in ("high", "medium", "low"):
        priority = None
    category_id = None
    category_name = str(raw.get("category") or "").strip().lower()
    if category_name:
        for cat in categories:
            if cat["name"].strip().lower() == category_name:
                category_id, category_name = cat["id"], cat["name"]
                break
        else:
            category_name = None
    minutes = raw.get("estimated_minutes")
    return {
        "title": title,
        "due_at": due_at,
        "priority": priority,
        "category_id": category_id,
        "category_name": category_name,
        "estimated_minutes": minutes if isinstance(minutes, int) and minutes > 0 else None,
    }


async def _attachment_for(user, attachment: dict | None) -> tuple[dict, list[dict]]:
    """Resolve an attachment reference to (prompt block, extra inline parts)."""
    if not attachment:
        return {}, []
    kind, res_id = attachment.get("type"), attachment.get("id")
    try:
        if kind == "note":
            row = await db.fetch_one(
                query="SELECT title, content FROM notes WHERE id = :id AND user_id = :user_id",
                values={"id": res_id, "user_id": user.id},
            )
            if row:
                return {
                    "type": "note",
                    "label": row["title"],
                    "text": (row["content"] or "")[:MAX_ATTACHMENT_CHARS],
                }, []
        elif kind == "announcement":
            announcements = await list_canvas_announcements(user, force_refresh=False)
            match = next((a for a in announcements if a.get("id") == res_id), None)
            if match:
                return {
                    "type": "announcement",
                    "label": f"{match.get('course_code', '')}: {match.get('title', '')}".strip(": "),
                    "text": (match.get("body") or "")[:MAX_ATTACHMENT_CHARS],
                }, []
        elif kind == "assignment":
            assignments = await list_canvas_assignments(user, force_refresh=False)
            match = next((a for a in assignments if a.get("id") == res_id), None)
            if match:
                return {
                    "type": "assignment",
                    "label": f"{match.get('course_code', '')}: {match.get('title', '')}".strip(": "),
                    "text": (match.get("description") or "")[:MAX_ATTACHMENT_CHARS],
                }, []
        elif kind == "file":
            file_block, parts = await _canvas_file_attachment(user, res_id)
            if file_block:
                return file_block, parts
    except Exception as err:
        logger.warning("assistant attachment %s/%s failed: %s", kind, res_id, err)
    return {}, []


async def _canvas_file_attachment(user, file_id) -> tuple[dict, list[dict]]:
    token = user.canvas_token
    if not token:
        return {}, []
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        meta = await client.get(f"{CANVAS_BASE}/files/{file_id}", headers=headers)
        if meta.status_code != 200:
            return {}, []
        meta_json = meta.json()
        url = meta_json.get("url")
        if not url:
            return {}, []
        content = await client.get(url, headers=headers)
        if content.status_code != 200 or len(content.content or b"") > MAX_PDF_BYTES:
            return {}, []
    mime = content.headers.get("content-type", meta_json.get("content-type", "")).split(";")[0]
    label = meta_json.get("filename") or "Canvas file"
    if mime == "application/pdf":
        data = base64.b64encode(content.content).decode()
        return (
            {"type": "file", "label": label, "text": "(the attached PDF)"},
            [{"inline_data": {"mime_type": "application/pdf", "data": data}}],
        )
    if mime.startswith("text/"):
        return (
            {"type": "file", "label": label, "text": content.text[:MAX_ATTACHMENT_CHARS]},
            [],
        )
    return {}, []


def _sanitize_chat(raw: dict, context: dict) -> dict:
    """Keep only resources/actions that reference real context entries."""
    known: dict[str, set] = {
        "note": {n["id"] for n in context.get("notes", [])},
        "announcement": {a["id"] for a in context.get("new_announcements", []) if a.get("id")},
        "assignment": {a["id"] for a in context.get("assignments", []) if a.get("id")},
        "file": {f["id"] for f in context.get("files", [])},
    }
    resources = []
    for res in raw.get("resources") or []:
        if not isinstance(res, dict) or len(resources) >= 8:
            continue
        rtype, rid = res.get("type"), res.get("id")
        if rtype == "view":
            resources.append({"type": "view", "id": None, "label": str(res.get("label") or "")[:80]})
        elif rtype in known and rid is not None:
            try:
                rid = int(rid)
            except (TypeError, ValueError):
                continue
            if rid in known[rtype]:
                resources.append({"type": rtype, "id": rid, "label": str(res.get("label") or "")[:80]})

    actions = []
    for act in raw.get("actions") or []:
        if not isinstance(act, dict) or len(actions) >= 3:
            continue
        if act.get("kind") != "create_task":
            continue
        title = str(act.get("title") or "").strip()[:120]
        if not title:
            continue
        due_at = None
        raw_due = str(act.get("due_at") or "").strip()
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                due_at = datetime.strptime(raw_due, fmt).isoformat()
                break
            except ValueError:
                continue
        priority = act.get("priority")
        actions.append(
            {
                "kind": "create_task",
                "title": title,
                "due_at": due_at,
                "priority": priority if priority in ("high", "medium", "low") else None,
            }
        )

    return {
        "reply": str(raw.get("reply") or "").strip(),
        "resources": resources,
        "actions": actions,
    }


async def chat_turn(user, messages: list[dict], attachment: dict | None = None) -> dict:
    """One grounded assistant turn. Messages are [{role, content}], oldest first."""
    context = await chat_context(user)
    attachment_block, extra_parts = await _attachment_for(user, attachment)

    history = []
    for msg in messages[-12:]:
        role = "user" if msg.get("role") == "user" else "model"
        history.append({"role": role, "parts": [{"text": str(msg.get("content") or "")[:4000]}]})

    sections = [f"CONTEXT (JSON):\n{json.dumps(context, default=str)}"]
    if attachment_block:
        sections.append(
            f"ATTACHED {attachment_block['type'].upper()} — \"{attachment_block['label']}\":\n"
            f"{attachment_block['text']}"
        )
    sections.append("Conversation:\n" + "\n".join(
        f"{'Student' if m['role'] == 'user' else 'You'}: {m['parts'][0]['text']}" for m in history
    ))

    raw = await generate_json(CHAT_SYSTEM, "\n\n".join(sections), CHAT_SCHEMA, extra_parts)
    return _sanitize_chat(raw, context)


async def build_brief(user, force: bool = False) -> dict:
    """Deterministic day facts + AI judgement, cached for a short window."""
    if not force:
        cached = await _cache_get(user.id, "brief", BRIEF_CACHE_TTL_MINUTES)
        if cached is not None:
            return cached

    facts = await day_context(user)
    summary, attention, ai_ok = "", [], False
    try:
        raw = await generate_json(
            BRIEF_SYSTEM,
            "FACTS (JSON):\n" + json.dumps(facts, default=str),
            BRIEF_SCHEMA,
        )
        summary = str(raw.get("summary") or "").strip()
        attention = [
            {"text": str(item.get("text") or "").strip()[:240]}
            for item in (raw.get("attention") or [])[:3]
            if isinstance(item, dict) and str(item.get("text") or "").strip()
        ]
        ai_ok = True
    except AIUnavailable:
        logger.info("brief synthesis unavailable; returning deterministic facts only")

    payload = {**facts, "summary": summary, "attention": attention, "ai_ok": ai_ok}
    await _cache_put(user.id, "brief", payload)
    return payload


async def build_brief_text(user_id: int) -> str:
    """Plain-text briefing for Telegram. AI lines are appended when available."""
    from models.user import UserSummary  # local import: avoid cycle at module load

    row = await db.fetch_one(
        query="SELECT id, email, name, canvas_token FROM users WHERE id = :user_id",
        values={"user_id": user_id},
    )
    if not row:
        return "Your day — (profile unavailable)"
    user = UserSummary(
        id=row["id"], email=row["email"], name=row["name"] or "", canvas_token=row["canvas_token"] or ""
    )
    facts = await day_context(user)
    lines = [f"Your day — {facts['today']}", ""]

    if facts["classes"]:
        lines.append("Classes:")
        for c in facts["classes"]:
            lines.append(f"• {c['code']} {c['type']} {c['start']}–{c['end']}{' @ ' + c['venue'] if c['venue'] else ''}")
        lines.append("")
    if facts["tasks"]:
        due = [t for t in facts["tasks"] if t["due_at"]]
        overdue = [t for t in due if t["overdue"]]
        if overdue or due:
            lines.append("Tasks:")
            for t in (overdue + [t for t in due if not t["overdue"]])[:6]:
                flag = " (OVERDUE)" if t["overdue"] else ""
                lines.append(f"• {t['title']}{flag}")
            lines.append("")
    if facts["new_announcements"]:
        lines.append("New in Canvas:")
        for a in facts["new_announcements"][:5]:
            lines.append(f"• [{a['course']}] {a['title']}")
        lines.append("")

    try:
        raw = await generate_json(
            BRIEF_SYSTEM,
            "FACTS (JSON):\n" + json.dumps(facts, default=str),
            BRIEF_SCHEMA,
        )
        bullets = [str(i.get("text") or "").strip() for i in (raw.get("attention") or [])[:3]]
        bullets = [b for b in bullets if b]
        if bullets:
            lines.append("Worth your attention:")
            lines.extend(f"• {b}" for b in bullets)
    except AIUnavailable:
        pass

    text = "\n".join(lines).strip()
    return text[:3800] if text else "Nothing scheduled — enjoy the quiet day."


async def _cache_get(user_id: int, key: str, max_age_minutes: int) -> dict | None:
    try:
        row = await db.fetch_one(
            query="SELECT payload, synced_at FROM assistant_cache WHERE user_id = :user_id AND key = :key",
            values={"user_id": user_id, "key": key},
        )
        if not row:
            return None
        synced = row["synced_at"]
        if hasattr(synced, "tzinfo") and synced.tzinfo is None:
            synced = synced.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if synced and datetime.now(synced.tzinfo if synced.tzinfo else None) - synced > timedelta(minutes=max_age_minutes):
            return None
        payload = row["payload"]
        return json.loads(payload) if isinstance(payload, str) else payload
    except Exception:
        return None


async def _cache_put(user_id: int, key: str, payload: dict) -> None:
    try:
        stored = json.dumps(payload, default=str)
        if db.url and "sqlite" in str(db.url).lower():
            await db.execute(
                query="""
                    INSERT INTO assistant_cache (user_id, key, payload, synced_at)
                    VALUES (:user_id, :key, :payload, CURRENT_TIMESTAMP)
                    ON CONFLICT (user_id, key)
                    DO UPDATE SET payload = EXCLUDED.payload, synced_at = CURRENT_TIMESTAMP
                """,
                values={"user_id": user_id, "key": key, "payload": stored},
            )
        else:
            await db.execute(
                query="""
                    INSERT INTO assistant_cache (user_id, key, payload, synced_at)
                    VALUES (:user_id, :key, :payload, NOW())
                    ON CONFLICT (user_id, key)
                    DO UPDATE SET payload = EXCLUDED.payload, synced_at = NOW()
                """,
                values={"user_id": user_id, "key": key, "payload": stored},
            )
    except Exception:
        logger.warning("assistant cache write failed", exc_info=True)
