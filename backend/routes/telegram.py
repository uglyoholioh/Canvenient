import os
import secrets

from fastapi import APIRouter, Header, HTTPException, Response, status

from database import db
from dependencies import CurrentUser
from models.telegram import TelegramClaim, TelegramLinkOut, TelegramWebhookUpdate
from telegram_bot import handle_command, send_message
from telegram_formatting import generate_connection_code

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/claim", response_model=TelegramLinkOut)
async def claim_link(payload: TelegramClaim, current_user: CurrentUser):
    code = payload.code.strip().upper()
    async with db.transaction():
        pending = await db.fetch_one(
            query="""
                SELECT chat_id FROM telegram_pending_links
                WHERE code = :code AND expires_at > NOW() AND failed_attempts < 5
                FOR UPDATE
            """,
            values={"code": code},
        )
        if not pending:
            raise HTTPException(status_code=400, detail="Invalid or expired Telegram code.")

        chat_id = pending["chat_id"]
        await db.execute(
            query="DELETE FROM telegram_links WHERE user_id = :user_id OR chat_id = :chat_id",
            values={"user_id": current_user.id, "chat_id": chat_id},
        )
        await db.execute(
            query="""
                INSERT INTO telegram_links (user_id, chat_id, linked_at)
                VALUES (:user_id, :chat_id, NOW())
            """,
            values={"user_id": current_user.id, "chat_id": chat_id},
        )
        await db.execute(
            query="DELETE FROM telegram_pending_links WHERE chat_id = :chat_id",
            values={"chat_id": chat_id},
        )

    try:
        await send_message(chat_id, "Telegram linked to Canvenient ✅ Send /help to get started.")
    except Exception:
        pass

    return TelegramLinkOut(
        linked=True,
        bot_username=os.getenv("TELEGRAM_BOT_USERNAME"),
    )


@router.get("/link", response_model=TelegramLinkOut)
async def get_link_status(current_user: CurrentUser):
    row = await db.fetch_one(
        query="SELECT chat_id FROM telegram_links WHERE user_id = :user_id",
        values={"user_id": current_user.id},
    )
    return TelegramLinkOut(
        linked=bool(row and row["chat_id"] is not None),
        bot_username=os.getenv("TELEGRAM_BOT_USERNAME"),
    )


@router.delete("/link", status_code=status.HTTP_204_NO_CONTENT)
async def unlink(current_user: CurrentUser):
    await db.execute(
        query="DELETE FROM telegram_links WHERE user_id = :user_id",
        values={"user_id": current_user.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def webhook(
    update: TelegramWebhookUpdate,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    expected_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET")
    if expected_secret and not secrets.compare_digest(
        x_telegram_bot_api_secret_token or "", expected_secret
    ):
        raise HTTPException(status_code=403, detail="Invalid webhook secret.")

    message = update.message or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = message.get("text", "")
    if not chat_id or not text.startswith("/"):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        command = text.strip().split()[0].split("@", 1)[0].lower()
        if command in {"/start", "/link"}:
            code = generate_connection_code()
            await db.execute(
                query="""
                    INSERT INTO telegram_pending_links (chat_id, code, expires_at)
                    VALUES (:chat_id, :code, NOW() + INTERVAL '15 minutes')
                    ON CONFLICT (chat_id) DO UPDATE SET
                        code = EXCLUDED.code,
                        expires_at = EXCLUDED.expires_at,
                        failed_attempts = 0,
                        created_at = NOW()
                """,
                values={"chat_id": chat_id, "code": code},
            )
            reply = (
                f"Your Canvenient connection code is:\n\n{code}\n\n"
                "Enter it under Settings → Telegram within 15 minutes. "
                "Never share this code with anyone."
            )
        else:
            link = await db.fetch_one(
                query="SELECT user_id FROM telegram_links WHERE chat_id = :chat_id",
                values={"chat_id": chat_id},
            )
            reply = (
                await handle_command(link["user_id"], text)
                if link
                else "Send /start to receive a Canvenient connection code."
            )

        await send_message(chat_id, reply)
    except Exception as err:
        print(f"[Telegram Webhook Error]: {err}")
        try:
            await send_message(chat_id, f"⚠️ Error processing command: {err}")
        except Exception:
            pass

    return Response(status_code=status.HTTP_204_NO_CONTENT)
