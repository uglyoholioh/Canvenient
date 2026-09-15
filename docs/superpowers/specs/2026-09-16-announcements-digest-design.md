# Canvas announcements AI digest

Date: 2026-09-16
Status: awaiting review
Related request: round-2 item 9 — "for 9 we must deliberately plan it out as well".

## Goal

Turn the daily Telegram brief's raw announcement-title list ("New in Canvas")
into a real digest: unread announcements summarized per course in one or two
lines, with needs-action flags — and an on-demand command. Deliberately
planned so cost, cadence, and failure modes are explicit decisions, not
afterthoughts.

## What already exists (verified)

- `backend/ai/digest.py`: a scheduler ticks every minute, finds Telegram-linked
  users past their `digest_time` with `last_digest_date < today`, sends
  `build_brief_text(...)`, and advances the watermark only after a successful
  send.
- `backend/ai/assistant.py::build_brief_text`: the brief already has a
  "New in Canvas" section listing up to five announcement titles from
  `day_context`'s `new_announcements`.
- `canvas_announcements` (per-module `data JSONB`, `synced_at`) and
  `dismissed_canvas_announcements (user_id, announcement_id)` tables.
- `assistant_cache (user_id, key, payload JSONB, synced_at)` — existing cache
  for AI outputs.
- The assistant runs off Oli's `MODEL_API_KEY`; when absent, AI features
  degrade — this feature must degrade the same way.

## Deliberate decisions

**Surface: Telegram only, this round.** The Mac app already renders
announcements natively; a My Day digest card would duplicate it. Revisit only
if wanted.

**Cadence: the existing daily brief, not a new schedule.** The announcements
section inside `build_brief_text` gets smarter; no second message, no new
scheduler, no new notification channel.

**Unread definition: per-user watermark.** New column
`telegram_links.last_announcement_seen_at TIMESTAMPTZ NULL`. Unread =
announcement `posted_at > watermark` and not dismissed. On first run the
watermark seeds to "now minus 7 days" so the first digest isn't a firehose but
still catches the recent past. After a *successful* digest build (AI or
fallback), the watermark advances to build time — same retry semantics as
`last_digest_date`.

**AI treatment: one bounded call.** When unread > 0 and `MODEL_API_KEY` is
set: latest 20 unread announcements, each truncated to ~500 chars of title +
first paragraph, one prompt asking for per-course 1–2 line summaries plus a
`needs action` flag when the text mentions deadlines, quizzes, or required
readings. Output cached in `assistant_cache` under
`announce_digest:{user_id}:{yyyy-mm-dd}`; rebuilds only when new unread
arrived after `synced_at` (i.e. announcements synced post-digest today).

**On-demand: `/announcements` Telegram command.** Runs the same build
immediately; reads the day's cache first so repeat invocations are free. Does
*not* advance the watermark (only the scheduled digest does).

**Failure: strictly no regression.** No key, call failure, timeout, or
malformed output → fall back to the current titles-only list. The digest is
never delayed by the AI step (timeout ~15s, then fallback); a failed watermark
advance retries next tick exactly like today.

## Changes

- `telegram_links`: add `last_announcement_seen_at` (migration, nullable).
- `backend/ai/announcements.py` (new, pure-ish): `select_unread(user_id)`,
  `build_prompt(items)`, `digest_text(user_id) -> {ai: bool, text, items}` —
  selection rules, truncation, cache, and fallback live here so both the brief
  and `/announcements` share one path.
- `backend/ai/assistant.py`: `build_brief_text` replaces the titles-only
  section with `digest_text` output (keeps "New in Canvas" heading).
- `backend/telegram_bot.py`: add `/announcements` to `handle_command` +
  HELP_TEXT.
- `backend/ai/digest.py`: after a successful send, advance
  `last_announcement_seen_at` alongside `last_digest_date`.

## Cost

Worst case: one LLM call per linked user per day (~bounded prompt, small
output), plus free cache hits for `/announcements` reruns. Zero cost when no
unread announcements or no key.

## Testing

- Unread selection: dismissed excluded; watermark boundary (posted_at equal to
  watermark counts as read); 7-day seed on first run; cap at 20.
- Prompt build: truncation, per-course grouping, needs-action instruction.
- Fallback path with no key / forced LLM error (titles-only, watermark still
  advances after send).
- Cache hit/rebuild logic; `/announcements` idempotence within a day.
- Digest scheduler test extended: watermark column advances with the send.
