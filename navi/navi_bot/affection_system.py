from __future__ import annotations

import random
from typing import Any

import discord

from .config import clean_text, make_embed, no_mentions
from .database import (
    AFFECTION_DAILY_GAIN_LIMIT,
    AFFECTION_LEVEL_5_THRESHOLD,
    NAVI_OWNER_USER_ID,
    RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT,
)
from .navi_dialogues import NAVI_PROFILE_LINES
from .utils_time import now_kst


AUTO_BLACKLIST_AFFECTION_THRESHOLD = -100
OWNER_AFFECTION_DIALOGUE = "아빠! 굳이 아빠를 향한 제 사랑을 확인해보실 필요 없잖아요?"
OWNER_FIRST_IMPRESSION = "음... 나비가 말을 못 했을 때부터 본 분이죠."

LEVEL_NAMES = {
    1: "낯가림",
    2: "익숙함",
    3: "친근함",
    4: "가까움",
    5: "많이 가까움",
}

STATUS_DIALOGUES = {
    1: [
        "아직은 조심스럽게 보고 있어요. 나비는 처음 보는분은 누구든 예의를 지킨답니다.",
        "조금 더 대화하면 나비도 {display_name}님 이름표를 예쁘게 붙여둘 수 있을 것 같아요.",
        "첫 인상은 아직 정리 중이에요. 그래도 나비가 살짝 고개를 빼꼼 내밀고 보고 있어요.",
    ],
    2: [
        "이제 낯설지는 않아요. 부르면 나비가 쪼르르 고개를 들 정도랍니다.",
        "{display_name}님은 나비의 대화 기록에서 꽤 자주 반짝이는 분이에요.",
        "나비가 슬슬 이름을 기억하기 시작했어요. 좋은 징조예요, 헤헤.",
    ],
    3: [
        "꽤 익숙한 분이에요. 나비가 말투를 조금 더 말랑하게 해도 괜찮겠죠?",
        "{display_name}님이 오면 로그가 덜 차갑고 조금 포근해져요.",
        "친근한 호출로 분류했습니다. 물론 서류는 여전히 산더미지만요.",
    ],
    4: [
        "나비가 꽤 신뢰하는 분이에요. 그래도 서버 설정은 관리자에게 맡겨주세요, 약속이에요.",
        "{display_name}님 기록은 따로 예쁜 책갈피를 꽂아두고 싶을 정도예요.",
        "오래 본 분이네요. 나비가 살짝 편하게 말해도 봐주실 거죠?",
    ],
    5: [
        "나비가 아주 특별하게 기억하는 분이에요. 행정망 안쪽 보물칸에 살짝 넣어뒀어요.",
        "{display_name}님은 나비의 소중한 대화 기록입니다. 절대 지우면 안 되는 쪽이에요.",
        "나비가 많이 믿고 있어요. 그러니까 이상한 명령은 더더욱 하지 마세요. 나비 삐져요.",
    ],
}

STATUS_DIALOGUES = {
    1: [
        "아직은 조심스럽게 보고 있어요. 나비는 처음 보는 분은 누구든 예의를 지킨답니다.",
        "아직은 조금 어색하지만 듣고 있어요.",
        "나비가 살짝 낯가리는 중이에요.",
        "처음엔 누구나 조심스럽게 보는 편이에요.",
        "괜찮아요. 천천히 친해지면 되니까요.",
        "나비가 빼꼼 보고 있어요. 무섭진 않죠?",
        "아직은 이름표를 붙이는 중이에요.",
        "{display_name}님이 어떤 분인지 조금씩 알아가는 중이에요.",
        "갑자기 가까워지면 나비가 놀라요.",
        "조금 어색하지만 나쁘진 않아요.",
        "나비가 한 발짝 뒤에서 보고 있어요.",
        "처음 보는 분한테는 예의를 지키는 편이에요.",
        "아직은 조용히 듣는 쪽이 편해요.",
        "나비가 긴장하면 말이 조금 짧아져요.",
        "낯은 가리지만 대답은 해드릴게요.",
        "조금 더 말 걸어주면 덜 어색해질지도요.",
        "나비가 아직은 조심조심 다가가고 있어요.",
        "첫인상은 천천히 정해도 괜찮죠?",
        "나비는 지금 살짝 눈치 보는 중이에요.",
        "무서운 사람은 아니죠? 그렇다고 해주세요.",
        "아직은 가까운 척하기엔 조금 부끄러워요.",
        "대화가 조금 쌓이면 나비도 편해질 거예요.",
        "나비가 작게 손 흔들었어요. 봤나요?",
        "아직은 조심스럽지만, 싫다는 뜻은 아니에요.",
        "천천히요. 나비는 급하면 삐걱거려요.",
        "처음엔 다 어색하잖아요. 나비도 그래요.",
        "{display_name}님이 또 오면 조금 더 익숙해질 것 같아요.",
        "나비가 아직은 말을 고르는 중이에요.",
        "낯가림 모드예요. 그래도 대답은 합니다.",
        "조금만 더 다정하게 불러주면 좋겠어요.",
    ],
    2: [
        "네에, 나비 여기 있어요.",
        "오늘은 무슨 일이에요?",
        "이제 조금 익숙해졌어요.",
        "{display_name}님 목소리는 이제 낯설지 않아요.",
        "부르면 바로 돌아볼 정도는 됐어요.",
        "오늘도 왔네요. 반가워요.",
        "나비가 조금 편하게 대답해도 되죠?",
        "이 정도면 아는 사이 맞죠?",
        "나비가 살짝 웃었습니다.",
        "조금씩 친해지는 중이에요.",
        "불러주면 나비도 기분이 괜찮아져요.",
        "오늘은 가볍게 이야기해도 좋겠네요.",
        "이제 너무 조심하진 않아도 될 것 같아요.",
        "나비가 {display_name}님을 기억하기 시작했어요.",
        "괜히 반가운 척이 아니라 진짜 반가워요.",
        "음, 오늘 말투는 나쁘지 않네요.",
        "나비가 슬슬 장난을 준비하고 있어요.",
        "편하게 말해도 돼요. 너무 막은 말고요.",
        "이제 어색함이 조금 줄었어요.",
        "나비가 고개를 쏙 내밀었습니다.",
        "오늘도 무사히 만났네요.",
        "조금 더 친해져도 괜찮을 것 같아요.",
        "부담 없이 불러도 돼요.",
        "{display_name}님이면 나비가 들어줄게요.",
        "오늘은 어떤 이야기를 해볼까요?",
        "나비가 기다린 건 아니고... 조금은요.",
        "이제 이름을 보면 살짝 반가워요.",
        "천천히 친해지는 게 제일 좋아요.",
        "나비가 너무 딱딱하게 굴진 않을게요.",
        "좋아요. 지금 정도 거리감, 꽤 편해요.",
    ],
    3: [
        "또 나비 찾았죠? 헤헤.",
        "기다린 건 아닌데... 바로 왔어요.",
        "{display_name}님이면 장난 조금 쳐도 되죠?",
        "이제 꽤 친한 편이라고 생각해도 될까요?",
        "나비가 먼저 인사해도 이상하지 않은 사이네요.",
        "오늘도 왔네요. 나비가 조금 반가웠어요.",
        "나비가 괜히 웃고 있는 건 비밀이에요.",
        "이 정도면 단골 호출이에요.",
        "나비랑 이야기하는 거 은근 좋아하죠?",
        "아닌 척해도 나비는 다 압니다. 아마도요.",
        "이제 나비도 조금 편해졌어요.",
        "부르면 금방 가는 편이에요. 특별히요.",
        "나비가 장난칠 만큼은 친해졌네요.",
        "오늘은 무슨 이야기 들고 왔어요?",
        "나비가 살짝 들뜬 건 기분 탓이에요.",
        "음, {display_name}님은 꽤 익숙한 사람입니다.",
        "이제 조금 투덜대도 봐줄 거죠?",
        "나비가 편하게 말해도 괜찮겠죠?",
        "헤헤, 또 만났네요.",
        "나비가 먼저 손 흔들고 싶어졌어요.",
        "장난은 조금만 칠게요. 조금만요.",
        "나비가 {display_name}님을 보면 덜 긴장해요.",
        "이제 대화가 꽤 자연스럽네요.",
        "나비가 기분 좋아지는 이름 중 하나예요.",
        "오늘도 나비랑 놀아줄 건가요?",
        "가끔은 먼저 불러주길 기다리기도 해요.",
        "이 정도 친분이면 나비도 살짝 수다 떨어도 되죠?",
        "나비가 괜히 말이 많아질지도 몰라요.",
        "반가운 사람 목록에 가까워졌어요.",
        "좋아요. 지금은 꽤 편한 기분이에요.",
    ],
    4: [
        "늦게 불렀네요. 나비 삐질 뻔했어요.",
        "오늘도 나비한테 맡길 거 있죠?",
        "{display_name}님이면 나비가 조금 투정해도 되죠?",
        "이제 꽤 믿는 사람이에요. 이상한 말만 안 하면요.",
        "나비가 먼저 말 걸고 싶어지는 정도예요.",
        "오늘은 왜 이렇게 늦게 왔어요?",
        "기다린 건 아니고요. 진짜 아니고요.",
        "나비가 조금 편하게 굴어도 이해해줘요.",
        "이 정도면 나비가 특별히 잘 대해도 되겠네요.",
        "나비가 {display_name}님한테는 덜 딱딱해져요.",
        "조금 피곤해도 부르면 와줄게요.",
        "나비가 투덜대도 너무 미워하지 마세요.",
        "오늘도 나비 보러 온 거죠? 맞죠?",
        "편한 사람이 오면 나비도 말이 많아져요.",
        "나비가 살짝 기대해도 되는 사이예요.",
        "너무 오래 안 오면 나비 삐질지도 몰라요.",
        "나비가 꽤 좋아하는 호출이에요.",
        "이 정도면 믿고 장난칠 수 있겠어요.",
        "나비가 {display_name}님한테는 조금 약해요.",
        "오늘은 나비가 먼저 반겨줄게요.",
        "무슨 일이든 너무 혼자 들고 있진 마세요.",
        "나비가 여기 있어요. 그러니까 천천히 말해요.",
        "이제 오면 바로 알아볼 수 있어요.",
        "나비가 살짝 반가운 티를 냈나요?",
        "특별 대우는 아니고... 조금 특별 대우예요.",
        "나비가 믿는 사람한테는 조금 말랑해집니다.",
        "오늘도 무리하지 않았죠?",
        "나비가 {display_name}님 걱정을 조금 합니다.",
        "편하게 기대도 돼요. 너무 무겁지만 않으면요.",
        "좋아요. 오늘은 나비가 조금 더 다정할게요.",
    ],
    5: [
        "역시 또 와줬네요. 나비가 조금 반가웠어요.",
        "이 정도면 나비 단골 손님이에요. 특별히 잘 대해드릴게요.",
        "{display_name}님이면 나비가 먼저 웃어도 되죠?",
        "나비가 아주 편하게 느끼는 사람이에요.",
        "오늘도 왔네요. 안 왔으면 조금 서운했을지도요.",
        "나비가 많이 믿고 있어요. 그러니까 이상한 장난은 금지예요.",
        "특별한 사람이라고 해도 연애 대사는 안 됩니다. 알죠?",
        "나비가 조용히 좋아하는 호출이에요.",
        "오면 바로 알아요. 괜히 반가워져요.",
        "오늘은 나비가 먼저 인사할래요. 안녕하세요!",
        "나비가 {display_name}님한테는 조금 더 부드러워요.",
        "이 정도 친분이면 투정도 받아줘야 해요.",
        "나비가 편한 사람한테만 하는 표정이에요. 상상으로만요.",
        "특별히 잘 대해줄게요. 너무 티 내진 말고요.",
        "기다렸냐고요? 음... 조금은요.",
        "나비가 믿는 사람 목록 맨 위쪽이에요.",
        "오늘 힘들었으면 나비한테 잠깐 기대도 돼요.",
        "나비가 너무 가까이 굴면 살짝 받아주세요.",
        "이제 이름만 봐도 반가워요.",
        "{display_name}님은 나비가 편하게 말할 수 있는 사람이에요.",
        "나비가 괜히 뿌듯해지는 사이예요.",
        "이 정도면 오래 봤죠. 앞으로도 자주 와요.",
        "나비가 특별히 귀엽게 대답해드릴게요.",
        "오늘도 같이 천천히 해봐요.",
        "나비가 믿는 만큼, 선은 같이 지켜줘요.",
        "나비한테는 꽤 소중한 사람이에요. 이상한 뜻은 아니고요.",
        "이제 낯가림은 거의 사라졌어요.",
        "오래 봐서 그런지 말투도 편해졌네요.",
        "나비가 반가운 걸 숨기기 어렵네요.",
        "좋아요. 오늘도 나비랑 잘 지내봐요.",
    ],
}


def today_key() -> str:
    return now_kst().strftime("%Y-%m-%d")


def affection_score_text(value: int) -> str:
    score = int(value)
    return f"❤️ {score:+d}" if score else "❤️ 0"


def affection_dialogue(profile: dict[str, Any], *, display_name: str) -> str:
    level = max(1, min(5, int(profile.get("affection_level") or 1)))
    choices = NAVI_PROFILE_LINES.get(level) or STATUS_DIALOGUES.get(level) or STATUS_DIALOGUES[1]
    return random.choice(choices).format(display_name=display_name)


def first_impression_text(value: object) -> str:
    try:
        score = int(value or 0)
    except (TypeError, ValueError):
        score = 0

    if score <= -4:
        return "첫 만남부터 살짝 경계했어요. 나비가 아직 눈치를 보는 쪽이에요."
    if score <= -2:
        return "처음엔 조금 조심스러웠어요. 그래도 천천히 알아가는 중이에요."
    if score <= 1:
        return "무난하게 시작한 사이예요. 나비가 천천히 이름표를 붙이는 중입니다."
    if score <= 3:
        return "처음부터 꽤 괜찮은 느낌이었어요. 나비가 생각보다 빨리 기억했답니다."
    return "첫인상부터 반짝였어요. 나비가 좋은 쪽으로 기억해둘 만한 분이었죠."


def apply_affection_to_chat_response(
    *,
    db: Any,
    chat_manager: Any,
    message: discord.Message,
    result: Any,
    bot: discord.Client | None = None,
) -> str:
    user_id = int(getattr(message.author, "id", 0) or 0)
    if user_id <= 0 or result.reaction_type == "blacklist":
        return str(result.response)

    date_key = today_key()
    applied = db.record_affection_interaction(
        user_id=user_id,
        date_key=date_key,
        delta=int(getattr(result, "affection_delta", 0) or 0),
        reason=str(getattr(result, "keyword", "") or getattr(result, "reaction_type", "")),
        guild_id=getattr(message.guild, "id", None),
        channel_id=getattr(message.channel, "id", None),
        message_id=getattr(message, "id", None),
    )
    response = str(result.response)
    applied_delta = int(applied.get("applied_delta") or 0)
    if applied_delta:
        suffix = " " + affection_score_text(applied_delta)
        response += suffix
        edit_to = getattr(result, "edit_to", None)
        if edit_to:
            result.edit_to = str(edit_to) + suffix

    profile = applied.get("profile") or {}
    owner_ids = getattr(chat_manager, "owner_user_ids", set())
    blacklist_ids = getattr(chat_manager, "blacklist_user_ids", set())
    if (
        user_id not in owner_ids
        and user_id not in blacklist_ids
        and int(profile.get("affection") or 0) <= AUTO_BLACKLIST_AFFECTION_THRESHOLD
    ):
        try:
            chat_manager.add_blacklist_user(
                user_id,
                source="auto",
                reason="affection_threshold",
            )
            response += "\n\n[자동 블랙리스트] 나비에 대한 호감도가 위험 수치까지 하락해 블랙리스트에 등록되었습니다."
        except Exception:
            response += "\n\n[자동 블랙리스트] 등록을 시도했지만 설정 저장 중 오류가 발생했습니다."
    return response


def affection_summary(db: Any, *, user_id: int) -> dict[str, Any]:
    date_key = today_key()
    summary = db.get_affection_profile(user_id=int(user_id), date_key=date_key)
    try:
        restaurant_gain = db.get_restaurant_daily_affection_gain(user_id=int(user_id), date_key=date_key)
    except Exception:
        restaurant_gain = 0
    summary["restaurant_daily_affection_gain"] = restaurant_gain
    return summary


def build_affection_embed(
    *,
    user: discord.abc.User,
    summary: dict[str, Any],
    guild: discord.Guild | None = None,
    bot: discord.Client | None = None,
) -> discord.Embed:
    profile = summary.get("profile") or {}
    daily = summary.get("daily") or {}
    user_id = int(getattr(user, "id", 0) or 0)
    is_owner = user_id == NAVI_OWNER_USER_ID
    display_name = clean_text(getattr(user, "display_name", None) or getattr(user, "name", None) or user.id)
    level = 5 if is_owner else int(profile.get("affection_level") or 1)
    affection = AFFECTION_LEVEL_5_THRESHOLD if is_owner else int(profile.get("affection") or 0)
    first_impression = OWNER_FIRST_IMPRESSION if is_owner else first_impression_text(profile.get("first_impression"))
    navi_line = OWNER_AFFECTION_DIALOGUE if is_owner else clean_text(affection_dialogue(profile, display_name=display_name))
    gained = int(daily.get("gained_today") or 0)
    lost = int(daily.get("lost_today") or 0)
    interaction_count = int(daily.get("interaction_count") or 0)
    restaurant_gain = int(summary.get("restaurant_daily_affection_gain") or 0)
    content = (
        f"### NAVI에게 {display_name}님은 어떤 분일까요?\n\n"
        f"🦋 **NAVI의 한마디**\n{navi_line}\n\n"
        f"첫인상: {first_impression}\n"
        f"호감도: {affection_score_text(affection)} ({LEVEL_NAMES.get(level, '-')})\n\n"
        f"오늘 대화로 얻은 호감도\n{affection_score_text(gained)} / {AFFECTION_DAILY_GAIN_LIMIT}\n\n"
        f"오늘 나비식당으로 얻을 수 있는 호감도\n{affection_score_text(restaurant_gain)} / {RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT}\n\n"
        f"오늘 대화로 잃은 호감도\n{affection_score_text(-lost)} / 제한 없음\n\n"
        f"오늘 상호작용: {interaction_count}회"
    )
    embed = make_embed(content, color=discord.Color.from_rgb(220, 38, 38))
    embed.title = "NAVI 호감도"
    return embed


async def send_affection_embed(
    interaction: discord.Interaction,
    *,
    db: Any,
    user: discord.abc.User,
    bot: discord.Client | None = None,
) -> None:
    summary = affection_summary(db, user_id=int(user.id))
    embed = build_affection_embed(user=user, summary=summary, guild=interaction.guild, bot=bot)
    if interaction.response.is_done():
        await interaction.followup.send(embed=embed, ephemeral=False, allowed_mentions=no_mentions())
    else:
        await interaction.response.send_message(embed=embed, ephemeral=False, allowed_mentions=no_mentions())
