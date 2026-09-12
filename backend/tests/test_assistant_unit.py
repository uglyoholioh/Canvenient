"""Pure-logic tests for the assistant layer (no DB, no asyncio mark)."""

import pytest

from ai.assistant import _normalize_parse, _sanitize_chat
from ai.provider import (
    AIUnavailable,
    _extract_json,
    _extract_zai_json,
    _strip_code_fences,
    _zai_payload,
)

# --- provider helpers -------------------------------------------------------


def test_strip_code_fences():
    assert _strip_code_fences('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert _strip_code_fences('  {"a": 1}  ') == '{"a": 1}'


def test_extract_json_parses_gemini_shape():
    class FakeResponse:
        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": '{"reply": "hi"}'}]}}]}

    assert _extract_json(FakeResponse()) == {"reply": "hi"}


def test_zai_payload_disables_thinking_and_requests_json():
    payload = _zai_payload("system prompt", "user prompt", {"type": "OBJECT", "properties": {}})
    assert payload["model"] and payload["messages"][0]["role"] == "system"
    assert payload["thinking"] == {"type": "disabled"}
    assert payload["response_format"] == {"type": "json_object"}
    assert '"type": "OBJECT"' in payload["messages"][1]["content"]


def test_extract_zai_json_parses_chat_completions_shape():
    class FakeResponse:
        def json(self):
            return {"choices": [{"message": {"content": '{"reply": "hi"}'}}]}

    assert _extract_zai_json(FakeResponse()) == {"reply": "hi"}


def test_extract_zai_json_rejects_empty_and_non_object():
    class EmptyResponse:
        def json(self):
            return {"choices": [{"message": {"content": ""}}]}

    class ArrayResponse:
        def json(self):
            return {"choices": [{"message": {"content": "[1, 2]"}}]}

    with pytest.raises(AIUnavailable):
        _extract_zai_json(EmptyResponse())
    with pytest.raises(AIUnavailable):
        _extract_zai_json(ArrayResponse())


# --- parse normalisation (pure) ---------------------------------------------


def test_normalize_parse_full():
    categories = [{"id": 3, "name": "Coursework"}]
    parsed = _normalize_parse(
        {
            "title": "MA2002 Problem Set 4",
            "due_at": "2026-09-18 17:00",
            "priority": "high",
            "category": "coursework",
            "estimated_minutes": 90,
        },
        categories,
        "raw text",
    )
    assert parsed["title"] == "MA2002 Problem Set 4"
    assert parsed["due_at"] == "2026-09-18T17:00:00"
    assert parsed["priority"] == "high"
    assert parsed["category_id"] == 3
    assert parsed["category_name"] == "Coursework"
    assert parsed["estimated_minutes"] == 90


def test_normalize_parse_falls_back_on_garbage():
    parsed = _normalize_parse(
        {"title": "", "due_at": "not-a-date", "priority": "extreme", "category": "nope"},
        [{"id": 1, "name": "Admin"}],
        "buy milk",
    )
    assert parsed["title"] == "buy milk"
    assert parsed["due_at"] is None
    assert parsed["priority"] is None
    assert parsed["category_id"] is None
    assert parsed["estimated_minutes"] is None


# --- chat sanitisation (pure) -----------------------------------------------


def _chat_context():
    return {
        "notes": [{"id": 5, "title": "Lecture notes", "snippet": ""}],
        "files": [{"id": 555, "name": "slides.pdf", "course": "CS2103", "type": "pdf"}],
        "new_announcements": [{"id": 7, "course": "CS2103", "title": "Quiz", "posted_at": None}],
        "assignments": [{"id": 9, "course": "CS2103", "title": "PS4", "due_at": None}],
    }


def test_sanitize_chat_keeps_only_real_resources():
    raw = {
        "reply": "Here are your notes.",
        "resources": [
            {"type": "note", "id": 5, "label": "Lecture notes"},
            {"type": "note", "id": 6, "label": "Hallucinated"},
            {"type": "file", "id": "555", "label": "slides.pdf"},
            {"type": "view", "label": "schedule"},
            {"type": "assignment", "id": 123, "label": "Rogue"},
        ],
        "actions": [
            {"kind": "create_task", "title": "Review slides", "due_at": "2026-09-20 17:00", "priority": "high"},
            {"kind": "delete_everything"},
            {"kind": "create_task", "title": "  "},
            {"kind": "create_task", "title": "Read chapter 5", "due_at": "bogus", "priority": "extreme"},
        ],
    }
    cleaned = _sanitize_chat(raw, _chat_context())
    assert [(r["type"], r["id"]) for r in cleaned["resources"]] == [
        ("note", 5),
        ("file", 555),
        ("view", None),
    ]
    assert len(cleaned["actions"]) == 2
    assert cleaned["actions"][0]["due_at"] == "2026-09-20T17:00:00"
    assert cleaned["actions"][0]["priority"] == "high"
    assert cleaned["actions"][1]["due_at"] is None
    assert cleaned["actions"][1]["priority"] is None
