"""Fresh AI layer for Canvenient's assistant features.

Deliberately independent of the legacy `routes/ai.py` implementation. The
package is organised as:

- `provider`  — a thin Gemini REST client (model/key from the environment).
- `context`   — server-side builders that pull the student's real data.
- `assistant` — the behaviours: quick-capture parsing, chat with actions,
                and the "my day" briefing used by both the app and Telegram.
- `digest`    — the scheduled Telegram daily digest.
"""
