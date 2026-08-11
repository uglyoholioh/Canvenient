"""
Telegram Webhook tests — Webhook updates, Update Idempotency (deduplication), and Secret token verification.
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_telegram_webhook_start_command(client: AsyncClient):
    """Test receiving a /start command from Telegram webhook generates a connection code."""
    with patch("routes.telegram.send_message") as mock_send:
        payload = {
            "update_id": 900001,
            "message": {
                "chat": {"id": 12345678},
                "text": "/start",
            },
        }
        resp = await client.post("/telegram/webhook", json=payload)
        assert resp.status_code == 204
        assert mock_send.called
        chat_id, text = mock_send.call_args[0]
        assert chat_id == 12345678
        assert "Your Canvenient connection code is:" in text


async def test_telegram_webhook_update_idempotency(client: AsyncClient):
    """Test duplicate update_id is ignored (deduplicated) and returns 204 without re-executing."""
    with patch("routes.telegram.send_message") as mock_send:
        payload = {
            "update_id": 900002,
            "message": {
                "chat": {"id": 87654321},
                "text": "/start",
            },
        }
        resp1 = await client.post("/telegram/webhook", json=payload)
        assert resp1.status_code == 204
        assert mock_send.call_count == 1

        resp2 = await client.post("/telegram/webhook", json=payload)
        assert resp2.status_code == 204
        assert mock_send.call_count == 1
