from __future__ import annotations

import re
import discord


CUSTOM_EMOJI_TOKEN_RE = re.compile(r":([A-Za-z][A-Za-z0-9_]{1,64}):")

EMOJI_ALIASES: dict[str, tuple[str, ...]] = {
    "navi_happy": ("navi_happy", "naviHappy", "nabiHappy", "NAVI_happy", "happy", "smile"),
    "navi_think": ("navi_think", "naviThink", "nabiThink", "NAVI_think", "think"),
    "navi_cry": ("navi_cry", "naviCry", "nabiCry", "NAVI_cry", "cry"),
    "navi_surprise": ("navi_surprise", "naviSurprise", "nabiSurprise", "NAVI_surprise", "surprise"),
    "navi_angry": ("navi_angry", "naviAngry", "nabiAngry", "NAVI_angry", "angry"),
    "navi_shy": ("navi_shy", "naviShy", "nabiShy", "NAVI_shy", "shy"),
    "navi_love": ("navi_love", "naviLove", "nabiLove", "NAVI_love", "love"),
    "navi_work": ("navi_work", "naviWork", "nabiWork", "NAVI_work", "work"),
}

LEGACY_EMOJI_MAP = {
    "xsiHappyNew": "navi_happy",
    "xsiThinkNew": "navi_think",
    "xsiCryNew": "navi_cry",
    "xsiSurpriseNew": "navi_surprise",
    "xsiAngryNew": "navi_angry",
    "bot_xsi_vomit": "navi_angry",
}

EMOJI_FALLBACKS = {
    "navi_happy": "✨",
    "navi_think": "🤔",
    "navi_cry": "🥺",
    "navi_surprise": "😳",
    "navi_angry": "💢",
    "navi_shy": "☺️",
    "navi_love": "💕",
    "navi_work": "🗂️",
}


def set_application_emoji_cache(bot: discord.Client, emojis: list[discord.Emoji]) -> None:
    setattr(bot, "_navi_application_emoji_cache", {str(emoji.name): str(emoji) for emoji in emojis})


async def refresh_application_emoji_cache(bot: discord.Client) -> dict[str, str]:
    emojis = await bot.fetch_application_emojis()
    cache = {str(emoji.name): str(emoji) for emoji in emojis}
    setattr(bot, "_navi_application_emoji_cache", cache)
    return cache


def _find_application_emoji(bot: discord.Client | None, name: str) -> str | None:
    if bot is None:
        return None
    cache = getattr(bot, "_navi_application_emoji_cache", None)
    if not isinstance(cache, dict):
        return None
    value = cache.get(name)
    return str(value) if value else None


def emoji_text(
    name: str,
    *,
    guild: discord.Guild | None = None,
    bot: discord.Client | None = None,
    fallback: str | None = None,
) -> str:
    canonical = LEGACY_EMOJI_MAP.get(name, name)
    aliases = (name, canonical, *EMOJI_ALIASES.get(canonical, ()))
    seen: set[str] = set()
    for alias in aliases:
        if alias in seen:
            continue
        seen.add(alias)
        found = _find_application_emoji(bot, alias)
        if found is not None:
            return found
    return fallback or EMOJI_FALLBACKS.get(canonical) or f":{name}:"


def replace_emoji_tokens(
    text: str,
    *,
    guild: discord.Guild | None = None,
    bot: discord.Client | None = None,
) -> str:
    if ":" not in text:
        return text

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in LEGACY_EMOJI_MAP and name not in EMOJI_ALIASES:
            return match.group(0)
        return emoji_text(name, guild=guild, bot=bot)

    return CUSTOM_EMOJI_TOKEN_RE.sub(replace, text)
