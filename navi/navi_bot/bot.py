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
from .commands.admin import AdminCommands
from .commands.help import HelpCommands
from .commands.social import SocialCommands
from .commands.tlr import TlrCommands
from .commands_restaurant import RestaurantCommands, is_restaurant_owner_grant_command, handle_restaurant_owner_grant_command
from .commands_word_chain import WordChainCommands
from .config import Config, no_mentions
from .database import Database, NAVI_OWNER_USER_ID
from .llm_chat import (
    EMPTY_MENTION_REPLY,
    GeminiProvider,
    LLM_COOLDOWN_SECONDS,
    LLMChatService,
    is_direct_bot_mention,
    parse_memory_command,
    strip_bot_mentions,
)
from .navi_safety import NaviSafety
from .navi_llm import NaviLLMClient
from .tlr_client import TlrApiError, TlrClient

log = logging.getLogger(__name__)

AWAKENING_GUILD_ID = 1535589795617833021
AWAKENING_CHANNEL_ID = 1535589796301373444
AWAKENING_SETTING_KEY = "awakening_announcement_channel_1535589796301373444_v1"
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
        self.navi_safety = NaviSafety(
            self.db,
            Path(__file__).with_name("assets") / "navi_safety_reactions.json",
        )
        self.llm_chat: LLMChatService | None = None
        if config.llm_provider == "ai_gateway" and config.ai_gateway_api_key:
            self.llm_chat = LLMChatService(
                provider=NaviLLMClient(
                    api_key=config.ai_gateway_api_key,
                    model=config.llm_model,
                    timeout_seconds=config.llm_timeout_seconds,
                    max_tokens=400,
                ),
                db=self.db,
                safety=self.navi_safety,
                cooldown_seconds=LLM_COOLDOWN_SECONDS,
            )
        elif config.llm_provider == "gemini" and config.gemini_api_key:
            self.llm_chat = LLMChatService(
                provider=GeminiProvider(
                    api_key=config.gemini_api_key,
                    model=config.gemini_model,
                    timeout_seconds=config.llm_timeout_seconds,
                ),
                db=self.db,
                safety=self.navi_safety,
            )
        elif config.llm_provider not in {"ai_gateway", "gemini"}:
            log.error("지원하지 않는 NAVI LLM provider입니다: %s", config.llm_provider)
        else:
            log.warning("NAVI LLM 비활성화: %s API 키가 설정되지 않았습니다.", config.llm_provider)

    async def setup_hook(self) -> None:
        self.db.init_db()
        self.chat_reactions.load()
        await self.tlr.start()
        await self.add_cog(AdminCommands(self, self.db))
        await self.add_cog(HelpCommands())
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
        self.maintain_database.start()

    async def close(self) -> None:
        self.poll_tlr_events.cancel()
        self.maintain_database.cancel()
        if self.llm_chat is not None:
            await self.llm_chat.close()
        await self.tlr.close()
        await super().close()

    async def on_ready(self) -> None:
        log.info("NEW NAVI 로그인 완료: %s (%s)", self.user, getattr(self.user, "id", None))
        await self._send_awakening_announcement()

    async def _send_awakening_announcement(self) -> None:
        if self.db.get_setting_value(AWAKENING_SETTING_KEY) == "sent":
            return
        channel = self.get_channel(AWAKENING_CHANNEL_ID)
        if channel is None:
            try:
                channel = await self.fetch_channel(AWAKENING_CHANNEL_ID)
            except discord.HTTPException:
                log.exception(
                    "부활 메시지 채널을 가져오지 못했습니다: guild=%s channel=%s",
                    AWAKENING_GUILD_ID,
                    AWAKENING_CHANNEL_ID,
                )
                return
        if channel is None:
            log.warning("부활 메시지 채널을 찾지 못했습니다: %s", AWAKENING_CHANNEL_ID)
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
        if self.user is not None and is_direct_bot_mention(message, self.user.id):
            if not self.db.claim_chat_message(message.id):
                return
            prompt = strip_bot_mentions(message.content, self.user.id)
            if not prompt:
                await message.reply(EMPTY_MENTION_REPLY, allowed_mentions=no_mentions(), mention_author=False)
                return
            memory_command = parse_memory_command(prompt)
            if memory_command is not None:
                safety_decision = self.navi_safety.screen_input(
                    user_id=message.author.id,
                    guild_id=getattr(message.guild, "id", None),
                    text=prompt,
                )
                if safety_decision.blocked:
                    await message.reply(
                        safety_decision.response,
                        allowed_mentions=no_mentions(),
                        mention_author=False,
                    )
                    return
                await self._handle_llm_memory_command(message, memory_command.action, memory_command.keyword)
                return
            if self.llm_chat is None:
                await message.reply(
                    "으음... 아직 대화 기능을 준비하지 못했어요. 잠시 뒤에 다시 불러주세요.",
                    allowed_mentions=no_mentions(),
                    mention_author=False,
                )
                return
            async with message.channel.typing():
                reply = await self.llm_chat.generate_reply(
                    user_id=message.author.id,
                    username=str(getattr(message.author, "display_name", None) or message.author.name),
                    guild_id=getattr(message.guild, "id", None),
                    message=prompt,
                    is_owner=bool(NAVI_OWNER_USER_ID and message.author.id == NAVI_OWNER_USER_ID),
                )
            await message.reply(reply.text, allowed_mentions=no_mentions(), mention_author=False)
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

    async def _handle_llm_memory_command(self, message: discord.Message, action: str, keyword: str) -> None:
        user_id = int(message.author.id)
        if action == "list":
            memories = self.db.list_llm_keywords(user_id)
            response = (
                "아직 기억해둔 키워드가 없어요. `@NAVI 기억해: 내용`으로 알려주세요."
                if not memories
                else "나비가 기억하는 키워드는 이 두 칸이에요.\n" + "\n".join(
                    f"{index}. {value}" for index, value in enumerate(memories, start=1)
                )
            )
        elif action == "clear":
            count = self.db.clear_llm_keywords(user_id)
            response = "기억해둔 키워드를 전부 지웠어요." if count else "지울 기억이 없네요."
        elif action == "remember":
            result = self.db.remember_llm_keyword(user_id, keyword, limit=2)
            if result["replaced"]:
                response = f"기억 두 칸이 꽉 차서 `{result['replaced']}` 대신 `{result['keyword']}`을 기억할게요."
            else:
                response = f"네에, `{result['keyword']}` 기억해둘게요. 한 사람당 두 개까지 기억할 수 있어요."
        elif action == "forget":
            removed = self.db.forget_llm_keyword(user_id, keyword)
            response = f"`{keyword}`은 잊었어요." if removed else f"`{keyword}`은 기억에서 찾지 못했어요."
        else:
            response = "기억 명령을 이해하지 못했어요."
        await message.reply(response, allowed_mentions=no_mentions(), mention_author=False)

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

    @tasks.loop(hours=6)
    async def maintain_database(self) -> None:
        try:
            result = await asyncio.to_thread(self.db.run_maintenance)
        except Exception:
            log.exception("NAVI SQLite 정기 최적화 실패")
            return
        log.info(
            "NAVI SQLite 정기 최적화 완료: claims=%s usage=%s safety=%s restrictions=%s "
            "storage_mb=%.2f->%.2f checkpoint_busy=%s",
            result["deleted_claims"],
            result["deleted_usage"],
            result["deleted_safety"],
            result["deleted_restrictions"],
            result["before_bytes"] / (1024 * 1024),
            result["after_bytes"] / (1024 * 1024),
            result["checkpoint_busy"],
        )

    @maintain_database.before_loop
    async def before_maintain_database(self) -> None:
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
        if action == "SUBMITTED" and self._notification_channel_id():
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
        channel_id = self._notification_channel_id()
        if not channel_id:
            return
        channel = self.get_channel(channel_id)
        if channel is None:
            channel = await self.fetch_channel(channel_id)
        if isinstance(channel, discord.abc.Messageable):
            await channel.send(text, allowed_mentions=no_mentions())

    def _notification_channel_id(self) -> int | None:
        return self.db.get_int_setting("notification_channel_id") or self.config.notification_channel_id


async def run_bot(config: Config) -> None:
    bot = NaviBot(config)
    await bot.start(config.token)
