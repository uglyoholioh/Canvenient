"""Thin Gemini REST client for the assistant layer.

The model and API key come from the environment (`AI_MODEL`, `MODEL_API_KEY`)
so the provider can be swapped without code changes. All call sites treat
`AIUnavailable` as a signal to degrade gracefully or surface a 503 — a missing
key or a provider outage must never take a feature down harder than that.
"""

import json
import logging
import os

import httpx

logger = logging.getLogger("canvenient.ai")

API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-2.5-flash"
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_ATTEMPTS = 2
RETRIABLE_STATUS_CODES = {429, 500, 503}


class AIUnavailable(Exception):
    """The AI provider is unreachable, misconfigured, or returned unusable output."""


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
    return cleaned.strip()


async def generate_json(
    system: str,
    prompt: str,
    response_schema: dict | None = None,
    extra_parts: list[dict] | None = None,
) -> dict:
    """Generate a JSON object and return it parsed.

    `extra_parts` are appended to the user turn verbatim (e.g. an inline_data
    PDF part for document questions). Raises `AIUnavailable` on any failure.
    """
    api_key = os.getenv("MODEL_API_KEY")
    if not api_key:
        raise AIUnavailable("MODEL_API_KEY is not configured")

    url = f"{API_BASE}/{os.getenv('AI_MODEL', DEFAULT_MODEL)}:generateContent"
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}

    generation_config: dict = {
        "responseMimeType": "application/json",
        "temperature": 0.4,
    }
    if response_schema:
        generation_config["responseSchema"] = response_schema

    user_parts: list[dict] = [{"text": prompt}]
    if extra_parts:
        user_parts.extend(extra_parts)

    payload = {
        "contents": [{"role": "user", "parts": user_parts}],
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": generation_config,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        last_error: AIUnavailable | None = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.RequestError as err:
                last_error = AIUnavailable(f"AI provider unreachable: {err}")
                continue

            if response.status_code == 200:
                return _extract_json(response)

            last_error = AIUnavailable(
                f"AI provider error {response.status_code}: {response.text[:200]}"
            )
            if response.status_code not in RETRIABLE_STATUS_CODES:
                break

    raise last_error or AIUnavailable("AI provider did not respond")


def _extract_json(response: httpx.Response) -> dict:
    try:
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError, ValueError) as err:
        raise AIUnavailable("AI returned an unusable response shape") from err
    try:
        parsed = json.loads(_strip_code_fences(text))
    except json.JSONDecodeError as err:
        raise AIUnavailable("AI returned non-JSON output") from err
    if not isinstance(parsed, dict):
        raise AIUnavailable("AI returned JSON that is not an object")
    return parsed
