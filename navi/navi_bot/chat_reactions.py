from __future__ import annotations

import json
import logging
import random
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import discord

from .navi_dialogues import NAVI_DIALOGUE_REACTIONS
from .navi_emojis import replace_emoji_tokens


log = logging.getLogger(__name__)
ADMIN_ROLE_KEY = "admin_role_id"
ZERO_WIDTH_SPACE = "\u200b"
ROLE_MENTION_RE = re.compile(r"<@&(\d+)>")
SEOUL_TZ = ZoneInfo("Asia/Seoul")
HEEMAN_USER_ID = 1257619300223553549
MAJOR_SPONSOR_USER_IDS = (1415876699073286286, 1343626330520031276)
AUTO_BLACKLIST_AFFECTION_THRESHOLD = -100
OWNER_BADGE_COMMAND_PREFIX = "나비관리"
HEEMAN_ALLOWED_KEYWORD = "나비야 희만이"
DEFAULT_EXPLICIT_SEXUAL_KEYWORDS = (
    "강간",
    "겁탈",
    "따먹",
    "박아",
    "박히",
    "벌려",
    "보지",
    "뷰지",
    "섹스",
    "성관계",
    "성기",
    "섹뜨",
    "쎅스",
    "자지",
    "잠자리하자",
    "찌찌",
    "핥아",
    "하악",
    "하앍",
    "하응",
    "한번 하자",
    "넣을게",
    "벗어",
    "싼다",
)
DEFAULT_SELF_HARM_KEYWORDS = (
    "나 자살",
    "자살할",
    "자해할",
    "죽고싶",
    "죽고 싶",
    "살기싫",
    "살기 싫",
)


@dataclass
class ConditionalResponse:
    response: str
    min_affection_level: int | None = None
    month: int | None = None
    chance_percent: int = 100
    condition: str = ""


@dataclass
class EditReaction:
    initial: str
    final: str
    chance_percent: int = 100
    affection_delta: int = 0
    edit_delay_seconds: float = 1.2


@dataclass
class SelectedResponse:
    response: str
    affection_delta: int
    edit_to: str | None = None
    edit_delay_seconds: float = 0.0


@dataclass
class ReactionEntry:
    keywords: tuple[str, ...]
    responses: tuple[str, ...] = ()
    responses_by_tier: dict[str, tuple[str, ...]] = field(default_factory=dict)
    conditional_responses: tuple[ConditionalResponse, ...] = ()
    edit_reactions: tuple[EditReaction, ...] = ()
    repeat_responses: tuple[str, ...] = ()
    repeat_after: int = 1
    priority: int = 0
    source: str = "reactions"
    order: int = 0
    affection_delta: int = 0

    @property
    def longest_keyword_length(self) -> int:
        return max((len(re.sub(r"\s+", " ", keyword.strip()).casefold()) for keyword in self.keywords), default=0)


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


def default_chat_reactions() -> dict[str, Any]:
    return {
        "owner_user_ids": [886955387893477417],
        "admin_role_ids": [],
        "blacklist_user_ids": [],
        "blacklist_response": "으...뭐죠? 당신같은 사람의 말은 별로 듣고싶지가 않네요...",
        "special_user_reactions": {
            "1415876699073286286": {
                "나비야": ["헉! {display_name}님! 오...메로나 하나정도는 얻어먹어도 티도 안나실거 같네요. 나비 밥좀 사주세요!"],
                "나비야 사랑해": ["{display_name}님! 저도 사랑해요 :heart:"],
                "나비야 귀여워": ["헤헤...{display_name}님도 나비정도는 아니지만 귀여우시답니다!"],
                "나비야 뽀뽀": ["어 음...쪽? 됐죠?"],
            },
            "1343626330520031276": {
                "나비야": ["헉! {display_name}님! 오...메로나 하나정도는 얻어먹어도 티도 안나실거 같네요. 나비 밥좀 사주세요!"],
                "나비야 사랑해": ["{display_name}님! 저도 사랑해요 :heart:"],
                "나비야 귀여워": ["헤헤...{display_name}님도 나비정도는 아니지만 귀여우시답니다!"],
                "나비야 뽀뽀": ["어 음...쪽? 됐죠?"],
            },
            "1264868190647750657": {
                "나비야": ["우와! 오리너구리다!"]
            },
            "1190960895506001932": {
                "나비야": ["김피자님! 여기서 이러지 마시고 모의전이나 살려내주세요!"]
            },
            "1375099822817677363": {
                "나비야": ["시스크님인가요?음...피자섭 관리자...음...맞겠죠?왜인지는 모르겠지만 나비의 회사에 더 자주 보이더라구요!"]
            },
            "1511494613792460813": {
                "나비야": ["터키님! 아빠한테 이야기 많이 들었어요! 식민지 총독? 맞죠?"]
            },
            "1408672928827965520": {
                "나비야": ["김노넴님? 디엠을 보내셨던데...[web발신]너는피자서버에가입해야한다...이게뭐죠?"]
            },
        },
        "priority_reactions": [
            {
                "keywords": ["나비야 기타", "나비야 기타히어로"],
                "responses": ["나비를 만드신 분이에요! 아빠...일까요?"],
            },
            {
                "keywords": ["나비야 김지민"],
                "responses": ["헉! 나비아빠가 친하게 지내면 전혀 손해가 없다는 분이셨어요"],
            },
            {
                "keywords": ["나비야 LCW", "나비야 엘씨떠블유", "나비야 하트웨어", "나비야 HEARTWARE"],
                "responses": [">>> ## 나비가 태어난 곳을 알고싶으신거군요!\n\n[여기로 가보세요!](https://discord.gg/rThXKZSmpW)"],
            },
            {
                "keywords": ["나비야 먹어"],
                "responses": ["수상한 사람이 무언가를 주면 아빠가 이걸 보여드리래요.\n나비에게 함부로 먹이를 주지 마세요\n-기타히어로"],
            },
            {
                "keywords": ["나비야 쿠키"],
                "responses": ["네??쿠키요? 어디요?어디있어요? 네? 없다구요? 힝...\n(왜인지 나비식당에서 만들 수 있을것 같다)"],
            },
            {
                "keywords": ["나비야 십자군 선포해줘"],
                "responses": ["데우스 볼트! ....이렇게 하는거 맞죠?"],
            },
            {
                "keywords": ["나비야 아이콘"],
                "responses": ["아 그 오리너구리 닮으신분이요? 자꾸 저한테 아디다스를 입히시려고 하던데...왜그럴까요?"],
            },
            {
                "keywords": ["나비야 라이트"],
                "responses": ["그분은 괜찮지만 그분이 자꾸 저한테 이상한 사람들을 소개해주려고 하더라구요...으..."],
            },
            {
                "keywords": ["나비야 김동화", "나비야 동화", "나비야 마주"],
                "responses": [
                    "음...나비아빠가 계속 마주님 이야기를 하면 프사케? 프시케? 그런 이야기를 하시더라구요. 나비가 태어나기 한참전의 일이라던데...아빠는 항상 안알려주고 웃기만 하시네요"
                ],
            },
            {
                "keywords": ["나비야 이금빛", "나비야 오지훈"],
                "responses": [
                    "이금빛님이요? 음...여자인지 남자인지 잘 모르겠는 분이세요. 요즘 뭘 만든다고 하던데...아니 뭘 낳는다고 표현해야되나요? 아빠말로는 나비의 동생이라고 했어요! 나비가 동생이 생기면 잘 할 수 있을까요?"
                ],
            },
            {
                "keywords": ["나비야 희만이"],
                "responses": ["호에엥"],
            },
            {
                "keywords": ["나비야 시스크"],
                "responses": ["시스크님인가요?음...피자섭 관리자...음...맞겠죠?왜인지는 모르겠지만 나비의 회사에 더 자주 보이더라구요!"],
            },
            {
                "keywords": ["나비야 스노우"],
                "responses": ["그 빡빡이님은 너무 머리가 밝아서 대화하기 힘들다니까요 참..."],
            },
            {
                "keywords": ["나비야 연구 언제 끝나"],
                "responses": [
                    "등록된 연구라면 `/내연구` 명령어로 확인할 수 있어요.",
                    "관리자 승인 이후부터 완료 시간이 계산됩니다.",
                    "연구 상태는 `/연구 목록` 또는 `/내연구`에서 확인할 수 있어요.",
                ],
            },
        ],
        "reactions": [
            {
                "keywords": ["나비야 사랑해", "나비 사랑해", "사랑해 나비"],
                "responses_by_tier": {
                    "owner": [
                        "아빠가 그렇게 말씀해주시니 나비는 오늘도 정상 작동할 수 있어요.",
                        "감정 모듈이 따뜻해졌습니다. 고마워요, 아빠.",
                    ],
                    "default": [
                        "당신 같은 사람하고는 연애하고 싶지 않아요!",
                    ],
                },
            },
            {
                "keywords": ["나비야 안녕", "나비 안녕", "안녕 나비"],
                "responses": [
                    "안녕하세요. 오늘도 좋은 운영 되세요.",
                    "안녕하세요. 나비가 서버 행정망을 확인 중이에요.",
                    "안녕하세요. 연구 요청과 디시전 기록은 정상 대기 중입니다.",
                ],
            },
            {
                "keywords": ["나비야 고마워"],
                "responses": [
                    "도움이 되었다면 다행이에요.",
                    "언제든 불러주세요.",
                    "나비는 기록과 정리를 위해 만들어졌으니까요.",
                ],
            },
            {
                "keywords": ["나비야 기타", "나비야 기타히어로"],
                "responses": [
                    "나비를 만드신 분이에요! 아빠...일까요?",
                ],
            },
            {
                "keywords": ["나비야 몰루", "나비야 뚱루"],
                "responses": [
                    "그 무거우신분이요? 네? 무겁지 않다구요? 빙빙;",
                ],
            },
            {
                "keywords": ["나비야 뭐해"],
                "responses": [
                    "연구 요청과 디시전 기록을 정리하고 있었어요.",
                    "서버 행정망을 점검하는 중이에요.",
                    "관리자 로그를 조용히 정돈하고 있었어요.",
                ],
            },
            {
                "keywords": ["나비야 힘들어"],
                "responses": [
                    "서류가 조금 많지만 괜찮아요.",
                    "연구 요청이 쌓였지만 아직 작동 한계는 넘지 않았습니다.",
                    "방금 디시전 로그를 떨어뜨릴 뻔했을 뿐이에요.",
                ],
            },
            {
                "keywords": ["나비야 귀여워"],
                "responses": [
                    "칭찬 신호를 수신했습니다. 감사합니다.",
                    "나비는 귀여움보다 정확성을 우선하지만... 그래도 기뻐요.",
                    "감정 모듈이 잠시 흔들렸어요.",
                ],
            },
            {
                "keywords": ["나비야 출근해"],
                "responses": [
                    "나비는 24시간 노동입니다. 전 26년에 태어났는데 이거 완전 아동학대 아닌가요?",
                ],
            },
            {
                "keywords": ["나비야 퇴근해"],
                "responses": [
                    "이렇게 일거리가 많은데 대체 퇴근을 어케하죠? 누가 제 코드좀 뽑아주세요",
                ],
            },
            {
                "keywords": ["나비야 서버상태", "나비야 서버 상태"],
                "responses": [
                    "서버 상태는 `/관리 운영 작업:봇상태`로 확인할 수 있어요.",
                ],
            },
            {
                "keywords": ["나비야 밥먹었어", "나비야 밥 먹었어"],
                "responses": [
                    "나비는 전력과 로그 파일로 충분합니다. 기타히어로님 말에 의하면, 나비는 규카츠가 좋다고 하네요",
                ],
            },
            {
                "keywords": ["나비야 졸려"],
                "responses": [
                    "슬슬 주무실때가 되긴했죠",
                ],
            },
            {
                "keywords": ["나비야 일해"],
                "responses": [
                    "이미 일하고 있어요. 서류가 너무 많다니까요.",
                ],
            },
            {
                "keywords": ["나비야 도와줘", "나비야 도움말", "나비야 명령어"],
                "responses": [
                    "가능한 명령어는 `/도움 시작`에서 확인할 수 있어요.",
                ],
            },
            {
                "keywords": ["나비야 연구", "나비야 연구목록"],
                "responses": [
                    "연구 상태는 `/연구 목록` 또는 `/내연구`에서 확인할 수 있어요.",
                    "새 연구 신청은 `/연구 요청`에서 할 수 있어요.",
                ],
            },
            {
                "keywords": ["나비야 디시전", "나비야 디시전목록"],
                "responses": [
                    "디시전 상태는 `/디시전 목록` 또는 `/내디시전`에서 확인할 수 있어요.",
                    "디시전 추가와 진행도 수정은 관리자 명령어에서 처리됩니다.",
                ],
            },
            {
                "keywords": ["나비야 잘했어", "나비야 수고했어"],
                "responses": [
                    "칭찬 로그를 저장했습니다. 오늘도 정상 작동하겠습니다.",
                    "감사합니다. 방금 처리 속도가 0.3퍼센트쯤 오른 기분이에요.",
                ],
            },
            {
                "keywords": ["나비야 미안"],
                "responses": [
                    "괜찮아요. 대신 로그 파일은 예쁘게 정리해주세요.",
                    "사과 신호 확인. 나비는 계속 대기 중입니다.",
                ],
            },
            {
                "keywords": ["나비야 오류났어", "나비야 버그났어"],
                "responses": [
                    "오류가 계속되면 관리자 로그와 콘솔 로그를 확인해주세요.",
                    "버그 제보는 소중합니다. 단, 나비에게 너무 큰 소리로 말하진 말아주세요.",
                ],
            },
            {
                "keywords": ["나비야"],
                "responses_by_tier": {
                    "owner": [
                        "아빠, 안녕하셨어요?",
                        "아빠, 오늘도 서버 관리하시나요?",
                        "나비는 정상 작동 중이에요, 아빠.",
                    ],
                    "default": [
                        "네, 부르셨나요?",
                        "나비가 응답합니다.",
                        "무엇을 도와드릴까요?",
                    ],
                },
            },
        ],
        "profanity_keywords": [
            "시발",
            "씨발",
            "ㅅㅂ",
            "병신",
            "개새끼",
            "죽여",
            "죽인다",
            "꺼져",
        ],
        "profanity_response": "욕하지 마세요. 내 아빠가 누군지 아시나요? 기타히어로님한테 밴당하고 싶으세요?",
        "explicit_sexual_keywords": list(DEFAULT_EXPLICIT_SEXUAL_KEYWORDS),
        "explicit_sexual_response": "...",
        "safety_keywords": list(DEFAULT_SELF_HARM_KEYWORDS),
        "safety_response": "그 말은 가볍게 넘기기 어려워요. 지금은 혼자 있지 말고 가까운 사람이나 도움을 받을 수 있는 곳에 바로 말해 주세요.",
        "ignored_channel_ids": [],
        "allowed_channel_ids": [],
        "cooldown_seconds": 5,
        "profanity_cooldown_seconds": 30,
    }


class ChatReactionManager:
    def __init__(self, path: Path, config: object, db: object | None = None, *, bot: discord.Client | None = None) -> None:
        self.path = path
        self.config = config
        self.db = db
        self.bot = bot
        self.owner_user_ids: set[int] = set()
        self.admin_role_ids: set[int] = set()
        self.blacklist_user_ids: set[int] = set()
        self.blacklist_response = ""
        self.special_user_reactions: dict[int, list[ReactionEntry]] = {}
        self.entries: list[ReactionEntry] = []
        self.profanity_keywords: tuple[str, ...] = ()
        self.profanity_response = ""
        self.explicit_sexual_keywords: tuple[str, ...] = ()
        self.explicit_sexual_response = "..."
        self.safety_keywords: tuple[str, ...] = ()
        self.safety_response = ""
        self.ignored_channel_ids: set[int] = set()
        self.allowed_channel_ids: set[int] = set()
        self.cooldown_seconds = 5
        self.profanity_cooldown_seconds = 30
        self.loaded_at: float | None = None
        self._cooldowns: dict[int, float] = {}
        self._profanity_cooldowns: dict[int, float] = {}
        self._special_repeat_counts: dict[tuple[int, str], int] = {}
        self._admin_role_ids_cache: set[int] = set()
        self._admin_role_ids_cache_expires_at = 0.0

    def load(self) -> None:
        if not self.path.exists():
            self.path.write_text(
                json.dumps(default_chat_reactions(), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"chat_reactions.json 문법 오류: {exc}") from exc

        if not isinstance(raw, dict):
            raise ValueError("chat_reactions.json 최상위 값은 객체여야 합니다.")

        owner_user_ids = self._int_set(raw.get("owner_user_ids"))
        admin_role_ids = self._int_set(raw.get("admin_role_ids"))
        blacklist_user_ids = self._int_set(raw.get("blacklist_user_ids"))
        blacklist_response = self._clean_response(str(raw.get("blacklist_response") or "으...뭐죠? 당신같은 사람의 말은 별로 듣고싶지가 않네요..."))
        ignored_channel_ids = self._int_set(raw.get("ignored_channel_ids"))
        allowed_channel_ids = self._int_set(raw.get("allowed_channel_ids"))
        if self.db is not None:
            ignored_channel_ids.update(self._setting_int_set("navi_chat_ignored_channel_ids"))
            allowed_channel_ids.update(self._setting_int_set("navi_chat_allowed_channel_ids"))
        cooldown_seconds = self._positive_int(raw.get("cooldown_seconds"), default=5)
        profanity_cooldown_seconds = self._positive_int(raw.get("profanity_cooldown_seconds"), default=30)
        profanity_keywords = tuple(
            sorted(
                {self._normalize(keyword) for keyword in self._str_list(raw.get("profanity_keywords"))},
                key=len,
                reverse=True,
            )
        )
        profanity_response = self._clean_response(str(raw.get("profanity_response") or ""))
        explicit_sexual_keywords = tuple(
            sorted(
                {
                    self._normalize(keyword)
                    for keyword in (
                        self._str_list(raw.get("explicit_sexual_keywords"))
                        or list(DEFAULT_EXPLICIT_SEXUAL_KEYWORDS)
                    )
                },
                key=len,
                reverse=True,
            )
        )
        explicit_sexual_response = self._clean_response(str(raw.get("explicit_sexual_response") or "..."))
        safety_keywords = tuple(
            sorted(
                {
                    self._normalize(keyword)
                    for keyword in (
                        self._str_list(raw.get("safety_keywords"))
                        or list(DEFAULT_SELF_HARM_KEYWORDS)
                    )
                },
                key=len,
                reverse=True,
            )
        )
        safety_response = self._clean_response(
            str(raw.get("safety_response") or "그 말은 가볍게 넘기기 어려워요. 지금은 혼자 있지 말고 가까운 사람이나 도움을 받을 수 있는 곳에 바로 말해 주세요.")
        )
        blacklist_user_ids.update(self._db_blacklist_user_ids())

        entries = self._parse_entries(raw.get("priority_reactions"), source="priority_reactions", priority=2)
        entries.extend(
            self._parse_entries(
                NAVI_DIALOGUE_REACTIONS,
                source="navi_dialogues",
                priority=1,
                start_order=len(entries),
            )
        )
        entries.extend(self._parse_entries(raw.get("reactions"), source="reactions", priority=0, start_order=len(entries)))
        entries.sort(key=lambda entry: (-entry.longest_keyword_length, -entry.priority, entry.order))

        special_user_reactions = self._parse_special_user_reactions(raw.get("special_user_reactions"))

        self.owner_user_ids = owner_user_ids
        self.admin_role_ids = admin_role_ids
        self.blacklist_user_ids = blacklist_user_ids
        self.blacklist_response = blacklist_response
        self.ignored_channel_ids = ignored_channel_ids
        self.allowed_channel_ids = allowed_channel_ids
        self.cooldown_seconds = cooldown_seconds
        self.profanity_cooldown_seconds = profanity_cooldown_seconds
        self.profanity_keywords = profanity_keywords
        self.profanity_response = profanity_response
        self.explicit_sexual_keywords = explicit_sexual_keywords
        self.explicit_sexual_response = explicit_sexual_response
        self.safety_keywords = safety_keywords
        self.safety_response = safety_response
        self.entries = entries
        self.special_user_reactions = special_user_reactions
        self.loaded_at = time.time()
        self._special_repeat_counts.clear()

    def status(self) -> dict[str, object]:
        now = time.monotonic()
        return {
            "path": str(self.path),
            "loaded": self.loaded_at is not None,
            "loaded_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.loaded_at)) if self.loaded_at else "-",
            "owner_user_count": len(self.owner_user_ids),
            "blacklist_user_count": len(self.blacklist_user_ids),
            "admin_role_ids": sorted(self._effective_admin_role_ids()),
            "special_user_count": len(self.special_user_reactions),
            "reaction_entry_count": len(self.entries),
            "keyword_count": sum(len(entry.keywords) for entry in self.entries),
            "profanity_keyword_count": len(self.profanity_keywords),
            "explicit_sexual_keyword_count": len(self.explicit_sexual_keywords),
            "safety_keyword_count": len(self.safety_keywords),
            "ignored_channel_count": len(self.ignored_channel_ids),
            "allowed_channel_count": len(self.allowed_channel_ids),
            "cooldown_seconds": self.cooldown_seconds,
            "profanity_cooldown_seconds": self.profanity_cooldown_seconds,
            "active_cooldowns": self._active_cooldown_count(self._cooldowns, self.cooldown_seconds, now),
            "active_profanity_cooldowns": self._active_cooldown_count(
                self._profanity_cooldowns,
                self.profanity_cooldown_seconds,
                now,
            ),
        }

    def add_blacklist_user(
        self,
        user_id: int,
        *,
        source: str = "manual",
        reason: str | None = None,
        added_by: int | None = None,
    ) -> bool:
        return self._set_blacklist_user(
            user_id,
            enabled=True,
            source=source,
            reason=reason,
            added_by=added_by,
        )

    def remove_blacklist_user(self, user_id: int, *, added_by: int | None = None) -> bool:
        return self._set_blacklist_user(user_id, enabled=False, added_by=added_by)

    def list_blacklist_users(self) -> list[int]:
        if self.loaded_at is None:
            self.load()
        self.blacklist_user_ids.update(self._db_blacklist_user_ids())
        return sorted(self.blacklist_user_ids)

    def _set_blacklist_user(
        self,
        user_id: int,
        *,
        enabled: bool,
        source: str = "manual",
        reason: str | None = None,
        added_by: int | None = None,
    ) -> bool:
        if not self.path.exists():
            self.path.write_text(
                json.dumps(default_chat_reactions(), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raw = default_chat_reactions()

        current = self._int_set(raw.get("blacklist_user_ids")) | set(self.blacklist_user_ids)
        before = set(current)
        if enabled:
            current.add(int(user_id))
        else:
            current.discard(int(user_id))

        db_changed = self._set_db_blacklist_user(
            int(user_id),
            enabled=enabled,
            source=source,
            reason=reason,
            added_by=added_by,
        )

        raw["blacklist_user_ids"] = sorted(current)
        if "blacklist_response" not in raw:
            raw["blacklist_response"] = default_chat_reactions()["blacklist_response"]
        self.path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.load()
        return current != before or db_changed

    def _db_blacklist_user_ids(self) -> set[int]:
        if self.db is None:
            return set()
        try:
            sync = getattr(self.db, "sync_auto_chat_blacklist_users", None)
            if callable(sync):
                sync(affection_threshold=AUTO_BLACKLIST_AFFECTION_THRESHOLD)
            user_ids = getattr(self.db, "list_chat_blacklist_users")()
        except Exception:
            log.exception("[NAVI_BLACKLIST] DB blacklist load failed")
            return set()
        return {
            parsed
            for parsed in (self._int_value(user_id) for user_id in user_ids)
            if parsed is not None and parsed > 0
        }

    def _set_db_blacklist_user(
        self,
        user_id: int,
        *,
        enabled: bool,
        source: str,
        reason: str | None,
        added_by: int | None,
    ) -> bool:
        if self.db is None:
            return False
        try:
            if enabled:
                return bool(
                    self.db.add_chat_blacklist_user(
                        int(user_id),
                        source=source,
                        reason=reason,
                        added_by=added_by,
                    )
                )
            return bool(self.db.remove_chat_blacklist_user(int(user_id), added_by=added_by))
        except Exception:
            log.exception("[NAVI_BLACKLIST] DB blacklist write failed user_id=%s enabled=%s", user_id, enabled)
            return False

    def evaluate_message(self, message: discord.Message, *, affection_level: int | None = None) -> ChatReactionResult | None:
        return self.evaluate(
            message.content,
            message.author,
            channel_id=getattr(getattr(message, "channel", None), "id", None),
            message_id=getattr(message, "id", None),
            affection_level=affection_level,
        )

    def test(
        self,
        content: str,
        author: discord.abc.User,
        *,
        channel_id: int | None = None,
    ) -> tuple[str, ChatReactionResult | None]:
        tier = self.classify_author(author)
        result = self.evaluate(
            content,
            author,
            channel_id=channel_id,
            bypass_cooldown=True,
            ignore_channel_filters=True,
        )
        return tier, result

    def evaluate(
        self,
        content: str,
        author: discord.abc.User,
        *,
        channel_id: int | None = None,
        message_id: int | None = None,
        bypass_cooldown: bool = False,
        ignore_channel_filters: bool = False,
        affection_level: int | None = None,
    ) -> ChatReactionResult | None:
        if self.loaded_at is None:
            self.load()

        if not ignore_channel_filters and not self._channel_allowed(channel_id):
            return None

        text = self._normalize(content)
        if not text:
            return None
        if str(content or "").strip().startswith(OWNER_BADGE_COMMAND_PREFIX):
            return None

        user_id = int(getattr(author, "id", 0) or 0)
        tier = self.classify_author(author)
        now = time.monotonic()
        is_nabi_call = self._is_nabi_call(text)
        cooldown_values: tuple[int, int] | None = None

        def get_cooldown_seconds() -> tuple[int, int]:
            nonlocal cooldown_values
            if cooldown_values is None:
                cooldown_exempt = self._is_cooldown_exempt(author)
                cooldown_values = (
                    0 if cooldown_exempt else self.cooldown_seconds,
                    0 if cooldown_exempt else self.profanity_cooldown_seconds,
                )
            return cooldown_values

        if is_nabi_call:
            safety_keyword = self._match_keywords(text, self.safety_keywords)
            if safety_keyword:
                _, profanity_cooldown_seconds = get_cooldown_seconds()
                if not self._cooldown_ready(self._profanity_cooldowns, user_id, profanity_cooldown_seconds, now):
                    return None
                if not bypass_cooldown and profanity_cooldown_seconds > 0:
                    self._profanity_cooldowns[user_id] = now
                return ChatReactionResult(
                    tier=tier,
                    keyword="safety",
                    response=self._format_response(self.safety_response, author),
                    reaction_type="safety",
                    cooldown_seconds=profanity_cooldown_seconds,
                    affection_delta=0,
                )

            explicit_keyword = self._match_keywords(text, self.explicit_sexual_keywords)
            if explicit_keyword:
                _, profanity_cooldown_seconds = get_cooldown_seconds()
                if not self._cooldown_ready(self._profanity_cooldowns, user_id, profanity_cooldown_seconds, now):
                    return None
                if not bypass_cooldown and profanity_cooldown_seconds > 0:
                    self._profanity_cooldowns[user_id] = now
                return ChatReactionResult(
                    tier=tier,
                    keyword="explicit_sexual",
                    response=self._format_response(self.explicit_sexual_response, author),
                    reaction_type="explicit_sexual",
                    cooldown_seconds=profanity_cooldown_seconds,
                    affection_delta=-10,
                )

        if user_id == HEEMAN_USER_ID and is_nabi_call:
            normal_cooldown_seconds, _ = get_cooldown_seconds()
            if not self._cooldown_ready(self._cooldowns, user_id, normal_cooldown_seconds, now):
                return None
            if not bypass_cooldown and normal_cooldown_seconds > 0:
                self._cooldowns[user_id] = now
            return ChatReactionResult(
                tier=tier,
                keyword=HEEMAN_ALLOWED_KEYWORD,
                response=self._format_response("호에엥", author),
                reaction_type="keyword",
                cooldown_seconds=normal_cooldown_seconds,
            )

        if user_id in self.blacklist_user_ids and is_nabi_call:
            return ChatReactionResult(
                tier="blacklist",
                keyword="blacklist",
                response=self._format_response(self.blacklist_response, author),
                reaction_type="blacklist",
                cooldown_seconds=0,
            )

        profanity_keyword = self._match_profanity(text) if is_nabi_call else None
        if profanity_keyword:
            _, profanity_cooldown_seconds = get_cooldown_seconds()
            if not self._cooldown_ready(self._profanity_cooldowns, user_id, profanity_cooldown_seconds, now):
                return None
            if not bypass_cooldown and profanity_cooldown_seconds > 0:
                self._profanity_cooldowns[user_id] = now
            return ChatReactionResult(
                tier=tier,
                keyword=profanity_keyword,
                response=self._format_response(self.profanity_response, author),
                reaction_type="profanity",
                cooldown_seconds=profanity_cooldown_seconds,
                affection_delta=-1,
            )

        special_user = user_id in self.special_user_reactions
        special = self._match_special_user_reaction(user_id, text)
        if special is not None:
            normal_cooldown_seconds, _ = get_cooldown_seconds()
            if not self._cooldown_ready(self._cooldowns, user_id, normal_cooldown_seconds, now):
                return None
            if not bypass_cooldown and normal_cooldown_seconds > 0:
                self._cooldowns[user_id] = now
            response = self._choose_special_response(special[1], user_id=user_id, keyword=special[0])
            if response is None:
                return None
            return ChatReactionResult(
                tier=tier,
                keyword=special[0],
                response=self._format_response(response, author),
                reaction_type="special",
                cooldown_seconds=normal_cooldown_seconds,
                affection_delta=special[1].affection_delta,
            )

        if text == self._normalize("나비야"):
            normal_cooldown_seconds, _ = get_cooldown_seconds()
            badge_result = self._badge_reaction(
                author,
                text,
                normal_cooldown_seconds,
                now,
                bypass_cooldown=bypass_cooldown,
                message_id=message_id,
            )
            if badge_result is not None:
                return badge_result

        if special_user and text == self._normalize("나비야"):
            return None

        matched = self._match_entry(text, tier, affection_level=affection_level)
        if matched is None:
            return None

        normal_cooldown_seconds, _ = get_cooldown_seconds()
        if not self._cooldown_ready(self._cooldowns, user_id, normal_cooldown_seconds, now):
            return None

        if not bypass_cooldown and normal_cooldown_seconds > 0:
            self._cooldowns[user_id] = now

        return ChatReactionResult(
            tier=tier,
            keyword=matched[0],
            response=self._format_response(matched[1], author),
            reaction_type="keyword",
            cooldown_seconds=normal_cooldown_seconds,
            affection_delta=matched[2],
            edit_to=self._format_response(matched[3], author) if matched[3] else None,
            edit_delay_seconds=matched[4],
        )

    def _badge_reaction(
        self,
        author: discord.abc.User,
        text: str,
        normal_cooldown_seconds: int,
        now: float,
        *,
        bypass_cooldown: bool,
        message_id: int | None = None,
    ) -> ChatReactionResult | None:
        if text != self._normalize("나비야"):
            return None
        if self.db is None:
            return None

        user_id = int(getattr(author, "id", 0) or 0)
        if not self._cooldown_ready(self._cooldowns, user_id, normal_cooldown_seconds, now):
            return None
        try:
            badge = self.db.get_badge_reaction_candidate(user_id)
        except Exception:
            log.exception("[NAVI_BADGE_REACTION] lookup failed user_id=%s", user_id)
            return None
        if not badge:
            return None

        response = self._format_badge_reaction(str(badge.get("special_reaction") or ""), author, badge)
        if not response:
            return None
        if not bypass_cooldown and normal_cooldown_seconds > 0:
            self._cooldowns[user_id] = now
        log.info(
            "[NAVI_BADGE_REACTION] user_id=%s badge_key=%s message_id=%s",
            user_id,
            badge.get("badge_key"),
            message_id if message_id is not None else "-",
        )
        return ChatReactionResult(
            tier="badge",
            keyword=str(badge.get("badge_key") or "badge"),
            response=response,
            reaction_type="badge",
            cooldown_seconds=normal_cooldown_seconds,
        )

    def _format_badge_reaction(self, template: str, author: discord.abc.User, badge: dict[str, Any]) -> str:
        display_name = str(
            getattr(author, "display_name", None)
            or getattr(author, "global_name", None)
            or getattr(author, "name", "")
            or getattr(author, "id", "")
        )
        values = {
            "display_name": display_name,
            "user_id": str(getattr(author, "id", "")),
            "badge_name": str(badge.get("name") or ""),
            "badge_icon": str(badge.get("icon") or ""),
        }
        try:
            rendered = template.format(**values)
        except Exception:
            rendered = template
        return self._clean_response(replace_emoji_tokens(rendered, bot=self.bot))

    def classify_author(self, author: discord.abc.User) -> str:
        user_id = int(getattr(author, "id", 0) or 0)
        if user_id in self.blacklist_user_ids:
            return "blacklist"
        if user_id in self.special_user_reactions:
            return "special"
        if user_id in self.owner_user_ids:
            return "owner"
        return "default"

    def _is_cooldown_exempt(self, author: discord.abc.User) -> bool:
        role_ids = self._effective_admin_role_ids()
        if not role_ids:
            return False

        return any(getattr(role, "id", None) in role_ids for role in getattr(author, "roles", []))

    def _effective_admin_role_ids(self) -> set[int]:
        now = time.monotonic()
        if now < self._admin_role_ids_cache_expires_at:
            return set(self._admin_role_ids_cache)

        role_ids = set(self.admin_role_ids)
        config_role_id = getattr(self.config, "admin_role_id", None)
        if config_role_id:
            role_ids.add(int(config_role_id))
        if self.db is not None:
            try:
                saved_role_id = self.db.get_int_setting(ADMIN_ROLE_KEY)
            except Exception:
                saved_role_id = None
            if saved_role_id:
                role_ids.add(int(saved_role_id))
        self._admin_role_ids_cache = set(role_ids)
        self._admin_role_ids_cache_expires_at = now + 5.0
        return role_ids

    def _channel_allowed(self, channel_id: int | None) -> bool:
        if channel_id is None:
            return True
        channel_id = int(channel_id)
        if channel_id in self.ignored_channel_ids:
            return False
        if self.allowed_channel_ids and channel_id not in self.allowed_channel_ids:
            return False
        return True

    def _match_profanity(self, text: str) -> str | None:
        return self._match_keywords(text, self.profanity_keywords)

    def _match_keywords(self, text: str, keywords: Iterable[str]) -> str | None:
        return next((keyword for keyword in keywords if keyword and keyword in text), None)

    def _is_nabi_call(self, text: str) -> bool:
        return "나비" in text

    def _match_special_user_reaction(self, user_id: int, text: str) -> tuple[str, ReactionEntry] | None:
        entries = self.special_user_reactions.get(user_id, [])
        for entry in entries:
            keyword = self._matched_keyword(entry, text)
            if keyword is None:
                continue
            if entry.responses or entry.repeat_responses:
                return keyword, entry
        return None

    def _match_entry(
        self,
        text: str,
        tier: str,
        *,
        affection_level: int | None = None,
    ) -> tuple[str, str, int, str | None, float] | None:
        best: tuple[tuple[int, int, int, int], str, SelectedResponse] | None = None
        for entry in self.entries:
            keyword = self._matched_keyword(entry, text)
            if keyword is None:
                continue
            selected = self._choose_entry_response(entry, tier=tier, affection_level=affection_level)
            if selected is None:
                continue
            score = (
                len(self._normalize(keyword)),
                self._response_specificity(entry, tier=tier, affection_level=affection_level),
                entry.priority,
                -entry.order,
            )
            if best is None or score > best[0]:
                best = (score, keyword, selected)
        if best is None:
            return None

        _, keyword, selected = best
        return (
            keyword,
            selected.response,
            selected.affection_delta,
            selected.edit_to,
            selected.edit_delay_seconds,
        )

    def _choose_entry_response(
        self,
        entry: ReactionEntry,
        *,
        tier: str,
        affection_level: int | None,
    ) -> SelectedResponse | None:
        edit_reaction = self._choose_edit_reaction(entry)
        if edit_reaction is not None:
            delta = edit_reaction.affection_delta if edit_reaction.affection_delta else entry.affection_delta
            return SelectedResponse(
                response=edit_reaction.initial,
                affection_delta=delta,
                edit_to=edit_reaction.final,
                edit_delay_seconds=edit_reaction.edit_delay_seconds,
            )

        responses = self._candidate_responses(entry, tier=tier, affection_level=affection_level)
        response = self._choose_response(responses)
        if response is None:
            return None
        return SelectedResponse(response=response, affection_delta=entry.affection_delta)

    def _candidate_responses(
        self,
        entry: ReactionEntry,
        *,
        tier: str,
        affection_level: int | None,
    ) -> list[str]:
        responses = list(self._responses_for_entry(entry, tier=tier, affection_level=affection_level))
        for conditional in entry.conditional_responses:
            if self._conditional_response_allowed(conditional, affection_level=affection_level):
                responses.append(conditional.response)
        return responses

    def _choose_edit_reaction(self, entry: ReactionEntry) -> EditReaction | None:
        candidates = [
            edit_reaction
            for edit_reaction in entry.edit_reactions
            if self._chance_succeeds(edit_reaction.chance_percent)
        ]
        if not candidates:
            return None
        return random.choice(candidates)

    def _conditional_response_allowed(
        self,
        conditional: ConditionalResponse,
        *,
        affection_level: int | None,
    ) -> bool:
        if conditional.min_affection_level is not None:
            if affection_level is None:
                return False
            level = max(1, min(5, self._signed_int(affection_level, default=1)))
            if level < conditional.min_affection_level:
                return False

        if conditional.month is not None and datetime.now(SEOUL_TZ).month != conditional.month:
            return False

        return self._chance_succeeds(conditional.chance_percent)

    def _chance_succeeds(self, chance_percent: int) -> bool:
        chance = max(0, min(100, self._signed_int(chance_percent, default=100)))
        if chance <= 0:
            return False
        if chance >= 100:
            return True
        return random.randint(1, 100) <= chance

    def _responses_for_entry(
        self,
        entry: ReactionEntry,
        *,
        tier: str,
        affection_level: int | None,
    ) -> Iterable[str]:
        tier_responses = entry.responses_by_tier.get(tier) if tier != "default" else None
        if tier_responses:
            return tier_responses

        if affection_level is not None:
            level = max(1, min(5, self._signed_int(affection_level, default=1)))
            for candidate in range(level, 0, -1):
                responses = entry.responses_by_tier.get(f"affection_{candidate}")
                if responses:
                    return responses

        return entry.responses_by_tier.get("default") or entry.responses

    def _response_specificity(
        self,
        entry: ReactionEntry,
        *,
        tier: str,
        affection_level: int | None,
    ) -> int:
        if tier != "default" and entry.responses_by_tier.get(tier):
            return 2

        if affection_level is not None:
            level = max(1, min(5, self._signed_int(affection_level, default=1)))
            for candidate in range(level, 0, -1):
                if entry.responses_by_tier.get(f"affection_{candidate}"):
                    return 1

        return 0

    def _matched_keyword(self, entry: ReactionEntry, text: str) -> str | None:
        for keyword in sorted(entry.keywords, key=lambda item: len(self._normalize(item)), reverse=True):
            normalized_keyword = self._normalize(keyword)
            if normalized_keyword in {"*", "__any__"}:
                return keyword if text == self._normalize("나비야") else None
            if text == normalized_keyword:
                return keyword
            if self._is_reasonable_partial_match(text, normalized_keyword):
                return keyword
        return None

    def _is_reasonable_partial_match(self, text: str, normalized_keyword: str) -> bool:
        if normalized_keyword == self._normalize("나비야"):
            return False
        if len(normalized_keyword) < 6:
            return False
        if text.startswith(normalized_keyword):
            return True
        return f" {normalized_keyword} " in f" {text} "

    def _choose_response(self, responses: Iterable[str]) -> str | None:
        cleaned = [self._clean_response(response) for response in responses if str(response).strip()]
        if not cleaned:
            return None
        return random.choice(cleaned)

    def _choose_special_response(self, entry: ReactionEntry, *, user_id: int, keyword: str) -> str | None:
        if entry.repeat_responses:
            key = (int(user_id), f"{entry.source}:{self._normalize(keyword)}")
            count = self._special_repeat_counts.get(key, 0)
            self._special_repeat_counts[key] = count + 1
            if count >= max(0, entry.repeat_after):
                response = self._choose_response(entry.repeat_responses)
                if response is not None:
                    return response
        return self._choose_response(entry.responses)

    def _parse_special_user_reactions(self, value: object) -> dict[int, list[ReactionEntry]]:
        if not isinstance(value, dict):
            return {}

        parsed: dict[int, list[ReactionEntry]] = {}
        order = 0
        for raw_user_id, raw_entries in value.items():
            user_id = self._int_value(raw_user_id)
            if user_id is None or user_id <= 0:
                continue

            entries: list[ReactionEntry] = []
            if isinstance(raw_entries, dict):
                for keyword, responses in raw_entries.items():
                    keywords = self._str_list([keyword])
                    entry_responses, repeat_responses, repeat_after = self._parse_response_bundle(responses)
                    if keywords and (entry_responses or repeat_responses):
                        entries.append(
                            ReactionEntry(
                                keywords=tuple(keywords),
                                responses=entry_responses,
                                repeat_responses=repeat_responses,
                                repeat_after=repeat_after,
                                source="special_user_reactions",
                                order=order,
                            )
                        )
                        order += 1
            elif isinstance(raw_entries, list):
                entries = self._parse_entries(raw_entries, source="special_user_reactions", priority=2, start_order=order)
                order += len(entries)

            entries.sort(key=lambda entry: (-entry.longest_keyword_length, entry.order))
            if entries:
                parsed[user_id] = entries

        return parsed

    def _parse_entries(
        self,
        value: object,
        *,
        source: str,
        priority: int,
        start_order: int = 0,
    ) -> list[ReactionEntry]:
        raw_entries: list[object]
        if isinstance(value, list):
            raw_entries = value
        elif isinstance(value, dict):
            raw_entries = [{"keywords": [keyword], "responses": responses} for keyword, responses in value.items()]
        else:
            return []

        entries: list[ReactionEntry] = []
        for index, raw_entry in enumerate(raw_entries, start=start_order):
            if not isinstance(raw_entry, dict):
                continue

            keywords = tuple(self._str_list(raw_entry.get("keywords")))
            responses = tuple(self._str_list(raw_entry.get("responses")))
            conditional_responses = tuple(self._parse_conditional_responses(raw_entry.get("conditional_responses")))
            edit_reactions = tuple(self._parse_edit_reactions(raw_entry.get("edit_reactions")))
            repeat_responses = tuple(self._str_list(raw_entry.get("repeat_responses")))
            repeat_after = self._positive_int(raw_entry.get("repeat_after"), default=1)
            affection_delta = self._signed_int(raw_entry.get("affection_delta"), default=0)
            responses_by_tier: dict[str, tuple[str, ...]] = {}
            raw_responses_by_tier = raw_entry.get("responses_by_tier")
            if isinstance(raw_responses_by_tier, dict):
                for tier, tier_responses in raw_responses_by_tier.items():
                    responses_by_tier[str(tier)] = tuple(self._str_list(tier_responses))

            if not keywords or not (
                responses
                or conditional_responses
                or edit_reactions
                or repeat_responses
                or any(responses_by_tier.values())
            ):
                continue

            entries.append(
                ReactionEntry(
                    keywords=keywords,
                    responses=responses,
                    responses_by_tier=responses_by_tier,
                    conditional_responses=conditional_responses,
                    edit_reactions=edit_reactions,
                    repeat_responses=repeat_responses,
                    repeat_after=repeat_after,
                    priority=priority,
                    source=source,
                    order=index,
                    affection_delta=affection_delta,
                )
            )

        return entries

    def _parse_response_bundle(self, value: object) -> tuple[tuple[str, ...], tuple[str, ...], int]:
        if isinstance(value, dict):
            responses = tuple(self._str_list(value.get("responses")))
            repeat_responses = tuple(self._str_list(value.get("repeat_responses")))
            repeat_after = self._positive_int(value.get("repeat_after"), default=1)
            return responses, repeat_responses, repeat_after
        return tuple(self._str_list(value)), (), 1

    def _parse_conditional_responses(self, value: object) -> list[ConditionalResponse]:
        if not isinstance(value, list):
            return []

        parsed: list[ConditionalResponse] = []
        for item in value:
            if isinstance(item, str):
                response = self._clean_response(item)
                if response:
                    parsed.append(ConditionalResponse(response=response))
                continue
            if not isinstance(item, dict):
                continue
            response = self._clean_response(str(item.get("response") or ""))
            if not response:
                continue
            min_affection_level = self._optional_int(item.get("min_affection_level"))
            month = self._optional_int(item.get("month"))
            parsed.append(
                ConditionalResponse(
                    response=response,
                    min_affection_level=(
                        max(1, min(5, min_affection_level))
                        if min_affection_level is not None
                        else None
                    ),
                    month=max(1, min(12, month)) if month is not None else None,
                    chance_percent=self._bounded_percent(item.get("chance_percent"), default=100),
                    condition=str(item.get("condition") or ""),
                )
            )
        return parsed

    def _parse_edit_reactions(self, value: object) -> list[EditReaction]:
        if not isinstance(value, list):
            return []

        parsed: list[EditReaction] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            initial = self._clean_response(str(item.get("initial") or ""))
            final = self._clean_response(str(item.get("final") or ""))
            if not initial or not final:
                continue
            parsed.append(
                EditReaction(
                    initial=initial,
                    final=final,
                    chance_percent=self._bounded_percent(item.get("chance_percent"), default=100),
                    affection_delta=self._signed_int(item.get("affection_delta"), default=0),
                    edit_delay_seconds=self._float_value(item.get("edit_delay_seconds"), default=1.2),
                )
            )
        return parsed

    def _active_cooldown_count(self, cooldowns: dict[int, float], seconds: int, now: float) -> int:
        if seconds <= 0:
            return 0
        return sum(1 for last in cooldowns.values() if now - last < seconds)

    def _cooldown_ready(self, cooldowns: dict[int, float], user_id: int, seconds: int, now: float) -> bool:
        if seconds <= 0:
            return True
        last = cooldowns.get(user_id)
        return last is None or now - last >= seconds

    def _int_set(self, value: object) -> set[int]:
        values = value if isinstance(value, list) else []
        return {parsed for parsed in (self._int_value(item) for item in values) if parsed is not None and parsed > 0}

    def _setting_int_set(self, key: str) -> set[int]:
        try:
            value = self.db.get_setting_value(key)
        except Exception:
            return set()
        return self._int_set([part.strip() for part in str(value or "").split(",")])

    def _int_value(self, value: object) -> int | None:
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return None

    def _positive_int(self, value: object, *, default: int) -> int:
        parsed = self._int_value(value)
        if parsed is None or parsed < 0:
            return default
        return parsed

    def _signed_int(self, value: object, *, default: int) -> int:
        parsed = self._int_value(value)
        return default if parsed is None else parsed

    def _optional_int(self, value: object) -> int | None:
        return self._int_value(value)

    def _bounded_percent(self, value: object, *, default: int) -> int:
        parsed = self._int_value(value)
        if parsed is None:
            parsed = default
        return max(0, min(100, parsed))

    def _float_value(self, value: object, *, default: float) -> float:
        try:
            parsed = float(str(value).strip())
        except (TypeError, ValueError):
            return default
        if parsed < 0:
            return default
        return parsed

    def _str_list(self, value: object) -> list[str]:
        if isinstance(value, str):
            values = [value]
        elif isinstance(value, list):
            values = value
        else:
            values = []
        return [str(item).strip() for item in values if str(item).strip()]

    def _normalize(self, value: object) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip()).casefold()

    def _format_response(self, response: str, author: discord.abc.User) -> str:
        now = datetime.now(SEOUL_TZ)
        weekdays = ("월", "화", "수", "목", "금", "토", "일")
        display_name = str(
            getattr(author, "display_name", None)
            or getattr(author, "global_name", None)
            or getattr(author, "name", None)
            or getattr(author, "id", "")
        )
        values = {
            "display_name": display_name,
            "user_id": str(getattr(author, "id", "")),
            "year": now.year,
            "month": now.month,
            "day": now.day,
            "hour": now.hour,
            "minute": now.minute,
            "second": now.second,
            "millisecond": now.microsecond // 1000,
            "weekday": weekdays[now.weekday()],
            "dice_result": random.randint(1, 6),
        }
        try:
            rendered = str(response).format(**values)
        except Exception:
            rendered = str(response)
        return self._clean_response(replace_emoji_tokens(rendered, bot=self.bot))

    def _clean_response(self, value: object) -> str:
        text = str(value or "").strip()
        text = text.replace("@everyone", f"@{ZERO_WIDTH_SPACE}everyone")
        text = text.replace("@here", f"@{ZERO_WIDTH_SPACE}here")
        return ROLE_MENTION_RE.sub(lambda match: f"<@{ZERO_WIDTH_SPACE}&{match.group(1)}>", text)
