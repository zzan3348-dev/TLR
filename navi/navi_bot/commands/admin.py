from __future__ import annotations

from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

from ..config import clean_text, no_mentions, safe_defer_interaction
from ..database import Database, NAVI_OWNER_USER_ID


CHAT_CHANNEL_ACTIONS = [
    app_commands.Choice(name="허용 채널 추가", value="allow_add"),
    app_commands.Choice(name="허용 채널 해제", value="allow_remove"),
    app_commands.Choice(name="제외 채널 추가", value="ignore_add"),
    app_commands.Choice(name="제외 채널 해제", value="ignore_remove"),
    app_commands.Choice(name="모든 채널 허용", value="allow_all"),
    app_commands.Choice(name="현재 설정", value="status"),
]

BLACKLIST_ACTIONS = [
    app_commands.Choice(name="추가", value="add"),
    app_commands.Choice(name="해제", value="remove"),
    app_commands.Choice(name="목록", value="list"),
]


class AdminCommands(commands.Cog):
    """국가 운영과 분리된 NAVI 자체 관리·채팅 설정 명령."""

    def __init__(self, bot: commands.Bot, db: Database) -> None:
        self.bot = bot
        self.db = db

    async def _reply(self, interaction: discord.Interaction, content: str) -> None:
        await interaction.followup.send(content, ephemeral=True, allowed_mentions=no_mentions())

    def _guild_key(self, interaction: discord.Interaction, key: str) -> str:
        return f"guild:{int(interaction.guild_id or 0)}:{key}"

    def _is_admin(self, interaction: discord.Interaction) -> bool:
        user_id = int(interaction.user.id)
        if NAVI_OWNER_USER_ID and user_id == NAVI_OWNER_USER_ID:
            return True
        guild = interaction.guild
        if guild is None:
            return False
        if int(guild.owner_id or 0) == user_id:
            return True
        permissions = getattr(interaction.user, "guild_permissions", None)
        if permissions is not None and permissions.administrator:
            return True
        role_id = self.db.get_int_setting(self._guild_key(interaction, "admin_role_id"))
        if role_id is None:
            role_id = self.db.get_int_setting("admin_role_id")
        return bool(role_id and any(int(getattr(role, "id", 0)) == role_id for role in getattr(interaction.user, "roles", [])))

    async def _ensure_admin(self, interaction: discord.Interaction) -> bool:
        if self._is_admin(interaction):
            return True
        await self._reply(interaction, "이 명령은 NAVI 오너, 서버 오너, Discord 관리자 또는 지정 관리자 역할만 사용할 수 있습니다.")
        return False

    @app_commands.command(name="관리자채널", description="연구 요청과 NAVI 운영 알림을 받을 관리자 채널을 지정합니다.")
    @app_commands.guild_only()
    @app_commands.rename(channel="채널")
    async def admin_channel(self, interaction: discord.Interaction, channel: discord.TextChannel) -> None:
        await safe_defer_interaction(interaction, ephemeral=True)
        if not await self._ensure_admin(interaction):
            return
        self.db.set_setting(key=self._guild_key(interaction, "admin_channel_id"), value=str(channel.id), updated_by=interaction.user.id)
        self.db.set_setting(key="notification_channel_id", value=str(channel.id), updated_by=interaction.user.id)
        await self._reply(interaction, f"관리자 채널을 <#{channel.id}>로 지정했습니다.")

    @app_commands.command(name="관리자역할", description="NAVI 관리 명령을 사용할 역할을 지정하거나 해제합니다.")
    @app_commands.guild_only()
    @app_commands.rename(role="역할", clear="해제")
    async def admin_role(
        self,
        interaction: discord.Interaction,
        role: Optional[discord.Role] = None,
        clear: bool = False,
    ) -> None:
        await safe_defer_interaction(interaction, ephemeral=True)
        if not await self._ensure_admin(interaction):
            return
        if clear:
            self.db.set_setting(key=self._guild_key(interaction, "admin_role_id"), value="", updated_by=interaction.user.id)
            self.db.set_setting(key="admin_role_id", value="", updated_by=interaction.user.id)
            self.bot.chat_reactions._admin_role_ids_cache_expires_at = 0.0
            await self._reply(interaction, "관리자 역할 설정을 해제했습니다.")
            return
        if role is None:
            await self._reply(interaction, "설정할 역할을 선택하거나 `해제:true`를 입력해 주세요.")
            return
        self.db.set_setting(key=self._guild_key(interaction, "admin_role_id"), value=str(role.id), updated_by=interaction.user.id)
        self.db.set_setting(key="admin_role_id", value=str(role.id), updated_by=interaction.user.id)
        self.bot.chat_reactions._admin_role_ids_cache_expires_at = 0.0
        await self._reply(interaction, f"관리자 역할을 `{clean_text(role.name)}`으로 지정했습니다.")

    @app_commands.command(name="대사채널", description="NAVI가 대답할 채널과 대답하지 않을 채널을 설정합니다.")
    @app_commands.guild_only()
    @app_commands.rename(action="작업", channel="채널")
    @app_commands.choices(action=CHAT_CHANNEL_ACTIONS)
    async def dialogue_channel(
        self,
        interaction: discord.Interaction,
        action: str,
        channel: Optional[discord.TextChannel] = None,
    ) -> None:
        await safe_defer_interaction(interaction, ephemeral=True)
        if not await self._ensure_admin(interaction):
            return
        manager = self.bot.chat_reactions
        if action == "status":
            allowed = ", ".join(f"<#{value}>" for value in sorted(manager.allowed_channel_ids)) or "모든 채널"
            ignored = ", ".join(f"<#{value}>" for value in sorted(manager.ignored_channel_ids)) or "없음"
            await self._reply(interaction, f"대사 허용: {allowed}\n대사 제외: {ignored}")
            return
        if action == "allow_all":
            manager.allowed_channel_ids.clear()
        elif channel is None:
            await self._reply(interaction, "이 작업에는 채널을 지정해야 합니다.")
            return
        elif action == "allow_add":
            manager.allowed_channel_ids.add(channel.id)
            manager.ignored_channel_ids.discard(channel.id)
        elif action == "allow_remove":
            manager.allowed_channel_ids.discard(channel.id)
        elif action == "ignore_add":
            manager.ignored_channel_ids.add(channel.id)
            manager.allowed_channel_ids.discard(channel.id)
        elif action == "ignore_remove":
            manager.ignored_channel_ids.discard(channel.id)
        else:
            await self._reply(interaction, "알 수 없는 작업입니다.")
            return
        self.db.set_setting(
            key="navi_chat_allowed_channel_ids",
            value=",".join(str(value) for value in sorted(manager.allowed_channel_ids)),
            updated_by=interaction.user.id,
        )
        self.db.set_setting(
            key="navi_chat_ignored_channel_ids",
            value=",".join(str(value) for value in sorted(manager.ignored_channel_ids)),
            updated_by=interaction.user.id,
        )
        await self._reply(interaction, "NAVI 대사 채널 기준을 저장했습니다.")

    @app_commands.command(name="블랙리스트", description="NAVI 잡담 블랙리스트를 관리합니다.")
    @app_commands.guild_only()
    @app_commands.rename(action="작업", user="유저")
    @app_commands.choices(action=BLACKLIST_ACTIONS)
    async def blacklist(
        self,
        interaction: discord.Interaction,
        action: str,
        user: Optional[discord.User] = None,
    ) -> None:
        await safe_defer_interaction(interaction, ephemeral=True)
        if not await self._ensure_admin(interaction):
            return
        manager = self.bot.chat_reactions
        if action == "list":
            user_ids = manager.list_blacklist_users()
            text = "현재 블랙리스트가 비어 있습니다." if not user_ids else "\n".join(f"- <@{user_id}> (`{user_id}`)" for user_id in user_ids)
            await self._reply(interaction, text)
            return
        if user is None:
            await self._reply(interaction, "추가 또는 해제할 유저를 지정해 주세요.")
            return
        if action == "add":
            changed = manager.add_blacklist_user(user.id, source="manual", reason="admin_command", added_by=interaction.user.id)
            await self._reply(interaction, f"{clean_text(user)}님을 블랙리스트에 {'추가했습니다' if changed else '이미 등록돼 있습니다'}.")
            return
        if action == "remove":
            changed = manager.remove_blacklist_user(user.id, added_by=interaction.user.id)
            await self._reply(interaction, f"{clean_text(user)}님의 블랙리스트를 {'해제했습니다' if changed else '찾지 못했습니다'}.")
            return
        await self._reply(interaction, "알 수 없는 작업입니다.")

    @app_commands.command(name="나비상태", description="NAVI의 대사·관리 채널 설정과 연결 상태를 확인합니다.")
    @app_commands.guild_only()
    async def navi_status(self, interaction: discord.Interaction) -> None:
        await safe_defer_interaction(interaction, ephemeral=True)
        if not await self._ensure_admin(interaction):
            return
        manager = self.bot.chat_reactions
        status = manager.status()
        admin_channel_id = self.db.get_int_setting(self._guild_key(interaction, "admin_channel_id"))
        allowed = ", ".join(f"<#{value}>" for value in sorted(manager.allowed_channel_ids)) or "모든 채널"
        ignored = ", ".join(f"<#{value}>" for value in sorted(manager.ignored_channel_ids)) or "없음"
        await self._reply(
            interaction,
            (
                "NAVI는 정상 응답 중입니다.\n"
                f"대사 항목: {status['reaction_entry_count']}개 / 키워드: {status['keyword_count']}개\n"
                f"관리자 채널: {f'<#{admin_channel_id}>' if admin_channel_id else '미지정'}\n"
                f"대사 허용: {allowed}\n대사 제외: {ignored}"
            ),
        )
