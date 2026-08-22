from __future__ import annotations

from dataclasses import dataclass
import os
import re
from pathlib import Path

import discord

NAVI_COLOR = discord.Color.from_rgb(104, 168, 255)


@dataclass(frozen=True)
class Config:
    token: str
    application_id: int
    tlr_base_url: str
    tlr_service_token: str
    database_path: str
    guild_id: int | None = None
    notification_channel_id: int | None = None
    navi_coin_emoji: str = "🪙"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.7-flash"
    llm_timeout_seconds: float = 20.0

    @classmethod
    def from_env(cls) -> "Config":
        token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
        application_id = int(os.getenv("DISCORD_APPLICATION_ID", "0"))
        tlr_base_url = os.getenv("TLR_API_BASE_URL", "").strip().rstrip("/")
        tlr_service_token = os.getenv("TLR_NAVI_SERVICE_TOKEN", "").strip()
        if not token or application_id <= 0:
            raise RuntimeError("DISCORD_BOT_TOKEN과 DISCORD_APPLICATION_ID가 필요합니다.")
        if not tlr_base_url or len(tlr_service_token) < 32:
            raise RuntimeError("TLR_API_BASE_URL과 32자 이상의 TLR_NAVI_SERVICE_TOKEN이 필요합니다.")
        return cls(
            token=token,
            application_id=application_id,
            tlr_base_url=tlr_base_url,
            tlr_service_token=tlr_service_token,
            database_path=os.getenv("NAVI_DATABASE_PATH", "data/new_navi.sqlite3").strip(),
            guild_id=_optional_int("DISCORD_GUILD_ID"),
            notification_channel_id=_optional_int("NAVI_NOTIFICATION_CHANNEL_ID"),
            navi_coin_emoji=os.getenv("NAVI_COIN_EMOJI", "🪙").strip() or "🪙",
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.7-flash").strip() or "gemini-3.7-flash",
            llm_timeout_seconds=max(5.0, float(os.getenv("NAVI_LLM_TIMEOUT_SECONDS", "20"))),
        )


def _optional_int(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else None


def ensure_parent_dir(path: str) -> None:
    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def mention_user(user_id: int) -> str:
    return f"<@{int(user_id)}>"


def allowed_mentions_for(*user_ids: int) -> discord.AllowedMentions:
    return discord.AllowedMentions(users=[discord.Object(id=int(user_id)) for user_id in user_ids], roles=False, everyone=False)


def no_mentions() -> discord.AllowedMentions:
    return discord.AllowedMentions.none()


def clean_text(value: object | None, *, fallback: str = "-", limit: int = 2000) -> str:
    if value is None:
        return fallback
    text = re.sub(r"[\u200b-\u200d\ufeff]", "", str(value)).strip()
    return discord.utils.escape_mentions(text[:limit]) if text else fallback


def make_embed(content: str, *, color: discord.Color | int | None = None, image_url: str | None = None) -> discord.Embed:
    embed = discord.Embed(description=clean_text(content, fallback="", limit=4096), color=color or NAVI_COLOR)
    embed.set_author(name="나비")
    embed.set_footer(text="TLR · NEW NAVI")
    if image_url:
        embed.set_image(url=image_url)
    return embed


async def safe_defer_interaction(interaction: discord.Interaction, *, ephemeral: bool = True) -> bool:
    if interaction.response.is_done():
        return True
    try:
        await interaction.response.defer(ephemeral=ephemeral, thinking=True)
        return True
    except (discord.NotFound, discord.HTTPException):
        return False
