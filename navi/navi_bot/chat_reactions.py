from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import random
import re
import time
from typing import Any

import discord

from .navi_dialogues import NAVI_DIALOGUE_REACTIONS


@dataclass
class ChatReactionResult:
    tier: str
    keyword: str
    response: str
    reaction_type: str
    cooldown_seconds: int
    affection_delta: int = 0
    edit_to: str | None = None
    edit_delay_seconds: float = 0.0


class ChatReactionManager:
    """사용자별 옛 운영 데이터 없이 정적 대사팩만 평가한다."""

    def __init__(self, path: Path, config: object, db: object | None = None, *, bot: discord.Client | None = None) -> None:
        self.path = path
        self.config = config
        self.db = db
        self.bot = bot
        self.owner_user_ids: set[int] = set()
        self.blacklist_user_ids: set[int] = set()
        self.blacklist_response = "지금은 대화하고 싶지 않아요."
        self.cooldown_seconds = 5
        self.entries: list[dict[str, Any]] = []
        self._cooldowns: dict[int, float] = {}

    def load(self) -> None:
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("chat_reactions.json 최상위 값은 객체여야 합니다.")
        self.owner_user_ids = {int(value) for value in raw.get("owner_user_ids", []) if str(value).isdigit()}
        self.blacklist_user_ids = {int(value) for value in raw.get("blacklist_user_ids", []) if str(value).isdigit()}
        if self.db is not None:
            try:
                with self.db._connect() as connection:
                    rows = connection.execute("SELECT user_id FROM navi_chat_blacklist WHERE enabled=1").fetchall()
                self.blacklist_user_ids.update(int(row["user_id"]) for row in rows)
            except Exception:
                pass
        self.blacklist_response = str(raw.get("blacklist_response") or self.blacklist_response)
        self.cooldown_seconds = max(1, int(raw.get("cooldown_seconds") or 5))
        priority = raw.get("priority_reactions") if isinstance(raw.get("priority_reactions"), list) else []
        self.entries = [*priority, *NAVI_DIALOGUE_REACTIONS]

    def add_blacklist_user(self, user_id: int, *, source: str = "manual", reason: str | None = None, added_by: int | None = None) -> bool:
        self.blacklist_user_ids.add(int(user_id))
        if self.db is None:
            return True
        return bool(self.db.add_chat_blacklist_user(user_id, source=source, reason=reason, added_by=added_by))

    def remove_blacklist_user(self, user_id: int, *, added_by: int | None = None) -> bool:
        self.blacklist_user_ids.discard(int(user_id))
        if self.db is None:
            return True
        return bool(self.db.remove_chat_blacklist_user(user_id, added_by=added_by))

    def evaluate_message(self, message: discord.Message, *, affection_level: int | None = None) -> ChatReactionResult | None:
        user_id = int(message.author.id)
        text = self._normalize(message.content)
        if user_id in self.blacklist_user_ids and "나비" in text:
            return ChatReactionResult("blacklist", "나비", self.blacklist_response, "blacklist", self.cooldown_seconds)
        if not self._cooldown_ready(user_id):
            return None
        tier = f"affection_{max(1, min(5, int(affection_level or 1)))}"
        candidates: list[tuple[int, dict[str, Any], str]] = []
        for entry in self.entries:
            if not isinstance(entry, dict):
                continue
            keywords = entry.get("keywords") or []
            for keyword in keywords:
                normalized = self._normalize(keyword)
                if normalized and normalized in text:
                    candidates.append((len(normalized), entry, str(keyword)))
                    break
        if not candidates:
            return None
        _, entry, keyword = max(candidates, key=lambda candidate: candidate[0])
        tier_map = entry.get("responses_by_tier") if isinstance(entry.get("responses_by_tier"), dict) else {}
        responses = tier_map.get(tier) or entry.get("responses") or entry.get("replies") or []
        if not responses:
            return None
        response = self._format(random.choice(list(responses)), message.author)
        self._cooldowns[user_id] = time.monotonic()
        return ChatReactionResult(
            tier=tier,
            keyword=keyword,
            response=response,
            reaction_type=str(entry.get("key") or "dialogue"),
            cooldown_seconds=self.cooldown_seconds,
            affection_delta=int(entry.get("affection_delta", entry.get("delta", 0)) or 0),
        )

    def _cooldown_ready(self, user_id: int) -> bool:
        previous = self._cooldowns.get(user_id)
        return previous is None or time.monotonic() - previous >= self.cooldown_seconds

    @staticmethod
    def _normalize(value: object) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip().casefold())

    @staticmethod
    def _format(template: object, author: discord.abc.User) -> str:
        display_name = discord.utils.escape_mentions(str(getattr(author, "display_name", author.name)))
        return str(template).replace("{display_name}", display_name).replace("{mention}", f"<@{author.id}>")
