"""AI provider client for the assistant layer.

Two provider shapes are supported, selected by `AI_PROVIDER`:

- "gemini" (default): Google Generative Language REST API; the model and key
  come from `AI_MODEL` / `MODEL_API_KEY`; JSON is enforced with
  `responseSchema`; `extra_parts` supports inline PDF documents.
- "zai": Z.ai's OpenAI-compatible chat completions API (`AI_BASE_URL`
  defaults to https://api.z.ai/api/paas/v4, `AI_MODEL` to `glm-4.5-flash`);
  JSON is enforced with `response_format: json_object` plus a schema hint in
  the prompt, and thinking is disabled for latency. `extra_parts` (PDF
  attachments) are not supported on this shape and raise `AIUnavailable`.

All call sites treat `AIUnavailable` as a signal to degrade gracefully or
surface a 503 — a missing key or a provider outage must never take a feature
down harder than that.
"""

import json
import logging
import os

import httpx

logger = logging.getLogger("canvenient.ai")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
ZAI_API_BASE = "https://api.z.ai/api/paas/v4"
DEFAULT_MODELS = {"gemini": "gemini-2.5-flash", "zai": "glm-4.5-flash"}
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_ATTEMPTS = 2
RETRIABLE_STATUS_CODES = {429, 500, 503}
ZAI_MAX_TOKENS = 2048


class AIUnavailable(Exception):
    """The AI provider is unreachable, misconfigured, or returned unusable output."""


def _provider() -> str:
    return os.getenv("AI_PROVIDER", "gemini").strip().lower()


def _api_key() -> str | None:
    return os.getenv("MODEL_API_KEY")


def _model() -> str:
    provider = _provider()
    return os.getenv("AI_MODEL") or DEFAULT_MODELS.get(provider, DEFAULT_MODELS["gemini"])


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
    PDF part for document questions; Gemini only). Raises `AIUnavailable` on
    any failure.
    """
    api_key = _api_key()
    if not api_key:
        raise AIUnavailable("MODEL_API_KEY is not configured")

    if _provider() == "zai":
        return await _generate_json_zai(api_key, system, prompt, response_schema, extra_parts)
    return await _generate_json_gemini(api_key, system, prompt, response_schema, extra_parts)


async def _generate_json_gemini(
    api_key: str,
    system: str,
    prompt: str,
    response_schema: dict | None,
    extra_parts: list[dict] | None,
) -> dict:
    url = f"{GEMINI_API_BASE}/{_model()}:generateContent"
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
        for _attempt in range(MAX_ATTEMPTS):
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.RequestError as err:
                last_error = AIUnavailable(f"AI provider unreachable: {err}")
                continue

            if response.status_code == 200:
                return _extract_json(response)

            last_error = AIUnavailable(f"AI provider error {response.status_code}: {response.text[:200]}")
            if response.status_code not in RETRIABLE_STATUS_CODES:
                break

    raise last_error or AIUnavailable("AI provider did not respond")


def _zai_payload(system: str, prompt: str, response_schema: dict | None) -> dict:
    user_content = prompt
    if response_schema:
        user_content += (
            "\n\nReturn JSON only, matching this schema (uppercase type values "
            f"mean string/number/boolean/array/object):\n{json.dumps(response_schema)}"
        )
    return {
        "model": _model(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.4,
        "max_tokens": ZAI_MAX_TOKENS,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
    }


def _extract_zai_json(response: httpx.Response) -> dict:
    try:
        text = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as err:
        raise AIUnavailable("AI returned an unusable response shape") from err
    if not isinstance(text, str) or not text.strip():
        raise AIUnavailable("AI returned an empty response")
    try:
        parsed = json.loads(_strip_code_fences(text))
    except json.JSONDecodeError as err:
        raise AIUnavailable("AI returned non-JSON output") from err
    if not isinstance(parsed, dict):
        raise AIUnavailable("AI returned JSON that is not an object")
    return parsed


async def _generate_json_zai(
    api_key: str,
    system: str,
    prompt: str,
    response_schema: dict | None,
    extra_parts: list[dict] | None,
) -> dict:
    if extra_parts:
        raise AIUnavailable("PDF attachments are not supported by the configured AI provider")
    url = f"{os.getenv('AI_BASE_URL') or ZAI_API_BASE}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = _zai_payload(system, prompt, response_schema)

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        last_error: AIUnavailable | None = None
        for _attempt in range(MAX_ATTEMPTS):
            try:
                response = await client.post(url, headers=headers, json=payload)
            except httpx.RequestError as err:
                last_error = AIUnavailable(f"AI provider unreachable: {err}")
                continue

            if response.status_code == 200:
                return _extract_zai_json(response)

            last_error = AIUnavailable(f"AI provider error {response.status_code}: {response.text[:200]}")
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
