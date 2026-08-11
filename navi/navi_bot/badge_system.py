from __future__ import annotations

import io
import logging
import os
import re
from typing import Any

import discord

from .config import clean_text, no_mentions
from .database import Database, NAVI_OWNER_USER_ID


log = logging.getLogger(__name__)

OWNER_COMMAND_PREFIX = "나비관리"
BOOST_BADGE_GUILD_ID = int(os.getenv("BOOST_BADGE_GUILD_ID", "0") or 0)
BOOST_BADGE_KEY = os.getenv("BOOST_BADGE_KEY", "staff_sponsor").strip() or "staff_sponsor"
BOOST_BADGE_REMOVE_ON_UNBOOST = os.getenv("BOOST_BADGE_REMOVE_ON_UNBOOST", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def is_owner_badge_command(content: str) -> bool:
    return str(content or "").strip().startswith(OWNER_COMMAND_PREFIX)


def parse_owner_args(raw: str) -> dict[str, str]:
    args: dict[str, str] = {}
    pattern = re.compile(r"(\S+?):(?:\"([^\"]*)\"|'([^']*)'|(.+?))(?=\s+\S+?:|$)", re.DOTALL)
    for match in pattern.finditer(raw):
        key = match.group(1).strip()
        value = next((group for group in match.groups()[1:] if group is not None), "")
        args[key] = value.strip()
    return args


def parse_bool(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on", "y", "확인", "예"}


def parse_user_id(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d{15,25}", value)
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def parse_priority(value: str | None, *, default: int = 100) -> int:
    if value is None or str(value).strip() == "":
        return default
    return int(str(value).strip())


def badge_line(badge: dict[str, Any]) -> str:
    icon = clean_text(badge.get("icon"), fallback="")
    name = clean_text(badge.get("name"))
    key = clean_text(badge.get("badge_key"))
    rarity = clean_text(badge.get("rarity"), fallback="common")
    priority = badge.get("priority", 100)
    locked = " / 잠금" if int(badge.get("system_locked") or 0) else ""
    return f"{icon} `{key}` {name} ({rarity}, 우선순위 {priority}{locked})".strip()


async def send_owner_reply(message: discord.Message, content: str, *, file: discord.File | None = None) -> None:
    kwargs: dict[str, Any] = {
        "allowed_mentions": no_mentions(),
        "mention_author": False,
    }
    if file is not None:
        kwargs["file"] = file
    await message.reply(content, **kwargs)


async def resolve_display_name(bot: discord.Client, user_id: int) -> str:
    user = bot.get_user(int(user_id))
    if user is None:
        try:
            user = await bot.fetch_user(int(user_id))
        except (discord.NotFound, discord.Forbidden, discord.HTTPException):
            return str(user_id)
    return getattr(user, "display_name", None) or getattr(user, "name", str(user_id))


async def handle_badge_owner_command(bot: discord.Client, db: Database, message: discord.Message) -> bool:
    content = str(message.content or "").strip()
    if not is_owner_badge_command(content):
        return False

    if int(message.author.id) != NAVI_OWNER_USER_ID:
        log.info("[NAVI_BADGE_OWNER_CMD] ignored_non_owner user_id=%s", message.author.id)
        return True

    payload = content[len(OWNER_COMMAND_PREFIX) :].strip()
    if not payload:
        await send_owner_reply(message, "사용법: `나비관리 배지목록` 또는 `나비관리 배지지급 유저:<id> 키:<badge_key>`")
        return True

    action, _, raw_args = payload.partition(" ")
    args = parse_owner_args(raw_args)
    log.info("[NAVI_BADGE_OWNER_CMD] user_id=%s action=%s", message.author.id, action)

    try:
        if action == "배지생성":
            badge_key = args.get("키")
            name = args.get("이름")
            if not badge_key or not name:
                await send_owner_reply(message, "필수값이 부족합니다. `키:<badge_key>`와 `이름:<name>`을 넣어주세요.")
                return True
            result = db.create_global_badge(
                badge_key=badge_key,
                name=name,
                icon=args.get("아이콘"),
                description=args.get("설명"),
                rarity=args.get("등급", "common"),
                special_reaction=args.get("반응"),
                priority=parse_priority(args.get("우선순위"), default=100),
                system_locked=parse_bool(args.get("잠금") or args.get("시스템잠금")),
                created_by=message.author.id,
            )
            if not result.ok:
                await send_owner_reply(message, "배지를 생성하지 못했습니다. 이미 있거나 필수값이 부족합니다.")
                return True
            await send_owner_reply(message, f"배지를 생성했습니다: {badge_line(result.data['badge'])}")
            return True

        if action == "배지수정":
            badge_key = args.get("키")
            if not badge_key:
                await send_owner_reply(message, "수정할 배지 `키:<badge_key>`를 넣어주세요.")
                return True
            fields: dict[str, Any] = {}
            mapping = {
                "이름": "name",
                "아이콘": "icon",
                "설명": "description",
                "등급": "rarity",
                "반응": "special_reaction",
            }
            for src, dst in mapping.items():
                if src in args:
                    fields[dst] = args[src]
            if "우선순위" in args:
                fields["priority"] = parse_priority(args["우선순위"])
            if "잠금" in args or "시스템잠금" in args:
                fields["system_locked"] = parse_bool(args.get("잠금") or args.get("시스템잠금"))
                log.info("[NAVI_BADGE_OWNER_CMD] system_locked_edit badge_key=%s", badge_key)
            result = db.update_global_badge(badge_key, **fields)
            if not result.ok:
                await send_owner_reply(message, "배지를 수정하지 못했습니다. 키가 없거나 수정할 값이 없습니다.")
                return True
            await send_owner_reply(message, f"배지를 수정했습니다: {badge_line(result.data['badge'])}")
            return True

        if action == "배지삭제":
            badge_key = args.get("키")
            if not badge_key:
                await send_owner_reply(message, "삭제할 배지 `키:<badge_key>`를 넣어주세요.")
                return True
            if not parse_bool(args.get("확인")):
                await send_owner_reply(message, "`확인:true`를 붙여야 배지를 삭제합니다.")
                return True
            result = db.delete_global_badge(badge_key)
            if not result.ok:
                await send_owner_reply(message, "배지를 삭제하지 못했습니다. 없거나 시스템 잠금 배지입니다.")
                return True
            await send_owner_reply(message, f"배지를 삭제했습니다. 회수된 지급 기록: {result.data.get('revoked_count', 0)}개")
            return True

        if action == "배지지급":
            user_id = parse_user_id(args.get("유저"))
            badge_key = args.get("키")
            if user_id is None or not badge_key:
                await send_owner_reply(message, "필수값이 부족합니다. `유저:<id/mention>`와 `키:<badge_key>`를 넣어주세요.")
                return True
            result = db.grant_global_badge(
                user_id=user_id,
                badge_key=badge_key,
                granted_by=message.author.id,
                granted_reason=args.get("사유"),
                source="manual",
            )
            if not result.ok:
                await send_owner_reply(message, f"배지를 지급하지 못했습니다. 이유: `{clean_text(result.reason)}`")
                return True
            display = await resolve_display_name(bot, user_id)
            suffix = "이미 보유 중입니다." if result.reason == "already" else "지급했습니다."
            await send_owner_reply(message, f"{clean_text(display)}님에게 `{clean_text(badge_key)}` 배지를 {suffix}")
            return True

        if action == "배지회수":
            user_id = parse_user_id(args.get("유저"))
            badge_key = args.get("키")
            if user_id is None or not badge_key:
                await send_owner_reply(message, "필수값이 부족합니다. `유저:<id/mention>`와 `키:<badge_key>`를 넣어주세요.")
                return True
            result = db.revoke_global_badge(user_id=user_id, badge_key=badge_key)
            if not result.ok:
                await send_owner_reply(message, f"배지를 회수하지 못했습니다. 이유: `{clean_text(result.reason)}`")
                return True
            display = await resolve_display_name(bot, user_id)
            await send_owner_reply(message, f"{clean_text(display)}님에게서 `{clean_text(badge_key)}` 배지를 회수했습니다.")
            return True

        if action == "배지목록":
            badges = db.list_global_badges()
            if not badges:
                await send_owner_reply(message, "등록된 전역 배지가 없습니다.")
                return True
            lines = ["전역 배지 목록", ""]
            lines.extend(badge_line(badge) for badge in badges)
            text = "\n".join(lines)
            if len(text) <= 1800:
                await send_owner_reply(message, text)
            else:
                data = io.BytesIO(text.encode("utf-8"))
                await send_owner_reply(message, "배지가 많아서 TXT로 보냈습니다.", file=discord.File(data, filename="navi_badges.txt"))
            return True

        if action == "유저배지":
            user_id = parse_user_id(args.get("유저"))
            if user_id is None:
                await send_owner_reply(message, "조회할 `유저:<id/mention>`를 넣어주세요.")
                return True
            profile = db.get_user_badge_profile(user_id)
            display = await resolve_display_name(bot, user_id)
            active = profile["active_badge"]
            lines = [
                f"{clean_text(display)}님의 배지",
                f"대표배지: {badge_line(active) if active else '없음'}",
                "",
            ]
            badges = profile["badges"]
            if badges:
                lines.extend(badge_line(badge) for badge in badges)
            else:
                lines.append("보유 배지가 없습니다.")
            await send_owner_reply(message, "\n".join(lines))
            return True

        if action == "대표배지":
            user_id = parse_user_id(args.get("유저"))
            badge_key = args.get("키")
            if user_id is None or not badge_key:
                await send_owner_reply(message, "필수값이 부족합니다. `유저:<id/mention>`와 `키:<badge_key>`를 넣어주세요.")
                return True
            result = db.set_active_badge(user_id=user_id, badge_key=badge_key)
            if not result.ok:
                await send_owner_reply(message, "대표배지를 설정하지 못했습니다. 해당 유저가 그 배지를 보유하고 있는지 확인해 주세요.")
                return True
            display = await resolve_display_name(bot, user_id)
            await send_owner_reply(message, f"{clean_text(display)}님의 대표배지를 `{clean_text(badge_key)}`로 설정했습니다.")
            return True

        if action == "부스트동기화":
            result = await sync_boost_badges(bot, db)
            await send_owner_reply(
                message,
                "부스트 배지 동기화 완료\n"
                f"지급: {result['granted']} / 이미 보유: {result['already']} / 실패: {result['failed']} / 부스터: {result['boosters']}",
            )
            return True

        await send_owner_reply(message, "알 수 없는 배지 관리 작업입니다. `배지목록`, `배지지급`, `배지회수` 등을 사용해 주세요.")
        return True
    except ValueError:
        await send_owner_reply(message, "숫자 값 형식이 잘못되었습니다. 우선순위 같은 값은 숫자로 입력해 주세요.")
        return True
    except Exception:
        log.exception("[NAVI_BADGE_OWNER_CMD] failed action=%s", action)
        await send_owner_reply(message, "배지 관리 처리 중 오류가 발생했습니다. 로그를 확인해 주세요.")
        return True


async def sync_boost_badges(bot: discord.Client, db: Database) -> dict[str, int]:
    guild = bot.get_guild(BOOST_BADGE_GUILD_ID)
    if guild is None:
        try:
            guild = await bot.fetch_guild(BOOST_BADGE_GUILD_ID)
        except (discord.NotFound, discord.Forbidden, discord.HTTPException):
            return {"boosters": 0, "granted": 0, "already": 0, "failed": 1}

    members: list[discord.Member] = [member for member in getattr(guild, "members", []) if member.premium_since is not None]
    if not members:
        try:
            fetched: list[discord.Member] = []
            async for member in guild.fetch_members(limit=None):
                if member.premium_since is not None:
                    fetched.append(member)
            members = fetched
        except (discord.Forbidden, discord.HTTPException):
            log.warning("[NAVI_BADGE_OWNER_CMD] boost sync could not fetch members; cached_members=%s", len(members))

    result = {"boosters": len(members), "granted": 0, "already": 0, "failed": 0}
    for member in members:
        granted = db.grant_global_badge(
            user_id=int(member.id),
            badge_key=BOOST_BADGE_KEY,
            granted_by=NAVI_OWNER_USER_ID,
            granted_reason="서버 부스트 기여",
            source="boost",
        )
        if not granted.ok:
            result["failed"] += 1
        elif granted.reason == "already":
            result["already"] += 1
        else:
            result["granted"] += 1
    return result


async def handle_boost_member_update(db: Database, before: discord.Member, after: discord.Member) -> None:
    if int(after.guild.id) != BOOST_BADGE_GUILD_ID:
        return
    before_boosting = before.premium_since is not None
    after_boosting = after.premium_since is not None
    if before_boosting == after_boosting:
        return
    if after_boosting:
        result = db.grant_global_badge(
            user_id=int(after.id),
            badge_key=BOOST_BADGE_KEY,
            granted_by=NAVI_OWNER_USER_ID,
            granted_reason="서버 부스트 기여",
            source="boost",
        )
        if result.ok:
            log.info("[NAVI_BADGE_GRANT] user_id=%s badge_key=%s source=boost", after.id, BOOST_BADGE_KEY)
    elif BOOST_BADGE_REMOVE_ON_UNBOOST:
        db.revoke_global_badge(user_id=int(after.id), badge_key=BOOST_BADGE_KEY)
