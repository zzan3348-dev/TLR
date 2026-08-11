from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import discord
from discord.ext import commands, tasks

from .affection_system import affection_summary, apply_affection_to_chat_response
from .badge_system import handle_badge_owner_command, handle_boost_member_update, is_owner_badge_command
from .chat_reactions import ChatReactionManager
from .commands.social import SocialCommands
from .commands.tlr import TlrCommands
from .commands_restaurant import RestaurantCommands, is_restaurant_owner_grant_command, handle_restaurant_owner_grant_command
from .commands_word_chain import WordChainCommands
from .config import Config, no_mentions
from .database import Database
from .tlr_client import TlrApiError, TlrClient

log = logging.getLogger(__name__)

AWAKENING_CHANNEL_NAME = "자유지대"
AWAKENING_SETTING_KEY = "awakening_announcement_v1"
AWAKENING_IMAGE_PATH = Path(__file__).with_name("assets") / "navi-awakening.png"
AWAKENING_MESSAGE = "@here\n\n음냐..뭔가 오래 잔 느낌이네요"


class NaviBot(commands.Bot):
    def __init__(self, config: Config) -> None:
        intents = discord.Intents.default()
        intents.message_content = True  # 대사·호감도 반응과 소유자 관리 명령에 필요
        intents.members = True  # 서버 부스트 배지 동기화에 필요
        super().__init__(command_prefix="!", intents=intents, application_id=config.application_id)
        self.config = config
        self.db = Database(config.database_path)
        self.tlr = TlrClient(config.tlr_base_url, config.tlr_service_token)
        self.chat_reactions = ChatReactionManager(
            Path(__file__).with_name("assets") / "chat_reactions.json",
            config,
            self.db,
            bot=self,
        )

    async def setup_hook(self) -> None:
        self.db.init_db()
        self.chat_reactions.load()
        await self.tlr.start()
        await self.add_cog(TlrCommands(self, self.tlr, self.db, self.config.tlr_base_url))
        await self.add_cog(SocialCommands(self, self.db))
        await self.add_cog(RestaurantCommands(self, self.db, self.config))
        await self.add_cog(WordChainCommands(self, self.db))
        if self.config.guild_id:
            guild = discord.Object(id=self.config.guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            log.info("테스트 서버 Slash Command 동기화 완료: %s", self.config.guild_id)
        else:
            await self.tree.sync()
            log.info("전역 Slash Command 동기화 완료")
        self.poll_tlr_events.start()

    async def close(self) -> None:
        self.poll_tlr_events.cancel()
        await self.tlr.close()
        await super().close()

    async def on_ready(self) -> None:
        log.info("NEW NAVI 로그인 완료: %s (%s)", self.user, getattr(self.user, "id", None))
        await self._send_awakening_announcement()

    async def _send_awakening_announcement(self) -> None:
        if self.db.get_setting_value(AWAKENING_SETTING_KEY) == "sent":
            return
        channel = next(
            (
                text_channel
                for guild in self.guilds
                for text_channel in guild.text_channels
                if AWAKENING_CHANNEL_NAME in text_channel.name
            ),
            None,
        )
        if channel is None:
            log.warning("부활 메시지 채널을 찾지 못했습니다: %s", AWAKENING_CHANNEL_NAME)
            return
        if not AWAKENING_IMAGE_PATH.is_file():
            log.error("부활 메시지 이미지를 찾지 못했습니다: %s", AWAKENING_IMAGE_PATH)
            return
        try:
            await channel.send(
                AWAKENING_MESSAGE,
                file=discord.File(AWAKENING_IMAGE_PATH, filename=AWAKENING_IMAGE_PATH.name),
                allowed_mentions=discord.AllowedMentions(
                    everyone=True,
                    users=False,
                    roles=False,
                    replied_user=False,
                ),
            )
        except discord.HTTPException:
            log.exception("부활 메시지 전송 실패: channel=%s", channel.id)
            return
        self.db.set_setting(key=AWAKENING_SETTING_KEY, value="sent", updated_by=None)
        log.info("부활 메시지 전송 완료: channel=%s", channel.id)

    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        await handle_boost_member_update(self.db, before, after)

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or (self.user and message.author.id == self.user.id):
            return
        word_chain = self.get_cog("WordChainCommands")
        if word_chain and getattr(word_chain, "is_word_chain_thread_message", lambda _: False)(message):
            return
        if is_owner_badge_command(message.content):
            if self.db.claim_chat_message(message.id):
                await handle_badge_owner_command(self, self.db, message)
            return
        if is_restaurant_owner_grant_command(message.content):
            if self.db.claim_chat_message(message.id):
                await handle_restaurant_owner_grant_command(self, self.db, message)
            return
        affection_level: int | None = None
        if "나비" in (message.content or ""):
            try:
                affection_level = int((affection_summary(self.db, user_id=message.author.id).get("profile") or {}).get("affection_level") or 1)
            except Exception:
                log.exception("대사 응답 전 호감도 조회 실패")
        result = self.chat_reactions.evaluate_message(message, affection_level=affection_level)
        if result is None or not self.db.claim_chat_message(message.id):
            return
        response = apply_affection_to_chat_response(
            db=self.db,
            chat_manager=self.chat_reactions,
            message=message,
            result=result,
            bot=self,
        )
        sent = await message.reply(response, allowed_mentions=no_mentions(), mention_author=False)
        if result.edit_to:
            if result.edit_delay_seconds > 0:
                await asyncio.sleep(result.edit_delay_seconds)
            await sent.edit(content=result.edit_to, allowed_mentions=no_mentions())

    @tasks.loop(seconds=30)
    async def poll_tlr_events(self) -> None:
        saved_cursor = self.db.get_int_setting("tlr_event_cursor")
        if saved_cursor is None:
            try:
                payload = await self.tlr.latest_event_cursor()
            except TlrApiError as error:
                log.warning("TLR 이벤트 cursor 초기화 실패: %s", error.code)
                return
            self.db.set_setting(
                key="tlr_event_cursor",
                value=str(int(payload.get("nextCursor", 0))),
                updated_by=None,
            )
            return
        cursor = saved_cursor
        try:
            payload = await self.tlr.events(cursor)
        except TlrApiError as error:
            log.warning("TLR 이벤트 조회 실패: %s", error.code)
            return
        events = payload.get("events", [])
        for event in events:
            try:
                await self._deliver_event(event)
            except discord.HTTPException:
                log.exception("연구 이벤트 전달 실패 event=%s", event.get("id"))
        next_cursor = int(payload.get("nextCursor", cursor))
        if next_cursor > cursor:
            self.db.set_setting(key="tlr_event_cursor", value=str(next_cursor), updated_by=None)

    @poll_tlr_events.before_loop
    async def before_poll_tlr_events(self) -> None:
        await self.wait_until_ready()

    async def _deliver_event(self, event: dict[str, Any]) -> None:
        action = str(event.get("action") or "RESEARCH_EVENT")
        project_id = str(event.get("project_id") or "-")
        country_key = str(event.get("country_key") or "-")
        text = (
            f"TLR 연구 이벤트 · **{action}**\n"
            f"국가 `{country_key}` · 연구 `{project_id}`\n"
            f"{self.config.tlr_base_url}/play/{country_key}"
        )
        if action == "SUBMITTED" and self.config.notification_channel_id:
            await self._send_notification_channel(text)
        discord_user_id = event.get("discordUserId")
        if discord_user_id and action != "SUBMITTED":
            try:
                user = self.get_user(int(discord_user_id)) or await self.fetch_user(int(discord_user_id))
                await user.send(text, allowed_mentions=no_mentions())
            except discord.HTTPException:
                log.info("연구 이벤트 DM 전달 실패 user=%s event=%s", discord_user_id, event.get("id"))
                await self._send_notification_channel(text)

    async def _send_notification_channel(self, text: str) -> None:
        if not self.config.notification_channel_id:
            return
        channel = self.get_channel(self.config.notification_channel_id)
        if channel is None:
            channel = await self.fetch_channel(self.config.notification_channel_id)
        if isinstance(channel, discord.abc.Messageable):
            await channel.send(text, allowed_mentions=no_mentions())


async def run_bot(config: Config) -> None:
    bot = NaviBot(config)
    await bot.start(config.token)
