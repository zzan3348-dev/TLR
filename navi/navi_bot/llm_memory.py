from __future__ import annotations

from dataclasses import dataclass
import re


MAX_LLM_KEYWORDS = 3
MAX_KEYWORD_LENGTH = 30


@dataclass(frozen=True)
class InterestObservation:
    keyword: str
    strong: bool


_SENSITIVE_TERMS = (
    "비밀번호",
    "패스워드",
    "인증번호",
    "인증코드",
    "보안코드",
    "otp",
    "api key",
    "api키",
    "토큰",
    "전화번호",
    "휴대폰번호",
    "핸드폰번호",
    "집주소",
    "주소",
    "주민번호",
    "주민등록번호",
    "계좌",
    "카드번호",
    "계정정보",
    "로그인",
    "아이디와 비밀번호",
    "병명",
    "질병",
    "건강정보",
    "진단",
    "복용약",
    "상담내용",
    "개인사정",
)

_GENERIC_KEYWORDS = {
    "거",
    "그거",
    "그것",
    "이거",
    "이것",
    "뭔가",
    "여러 가지",
    "다",
    "전부",
}


def normalize_interest_keyword(value: object) -> str:
    keyword = " ".join(str(value or "").strip().split())
    keyword = keyword.strip("`'\"“”‘’[](){}<>.,!?。！？~ㅋㅋㅎㅎ ")
    keyword = re.sub(r"^(?:나는|난|저는|전|내가|제가)\s+", "", keyword)
    keyword = re.sub(r"\s+(?:진짜|정말|엄청|되게|아주)$", "", keyword)
    return keyword[:MAX_KEYWORD_LENGTH].strip()


def is_safe_interest_keyword(value: object) -> bool:
    keyword = normalize_interest_keyword(value)
    folded = keyword.casefold()
    if not keyword or folded in _GENERIC_KEYWORDS:
        return False
    if len(keyword) > MAX_KEYWORD_LENGTH or len(keyword.split()) > 5:
        return False
    if any(term in folded for term in _SENSITIVE_TERMS):
        return False
    if re.search(r"https?://|www\.|\S+@\S+\.\S+|<@!?\d+>", keyword, re.IGNORECASE):
        return False
    if len(re.findall(r"\d", keyword)) >= 5:
        return False
    return True


def extract_interest_observations(text: object) -> tuple[InterestObservation, ...]:
    """명확한 취미·관심사 표현만 추출한다.

    원문이나 문장 전체를 저장하지 않는다. 강한 명시 표현은 한 번에도
    승격할 수 있고, 비교적 약한 근황 표현은 DB에서 반복 횟수를 확인한다.
    """

    normalized = " ".join(str(text or "").strip().split())[:1200]
    if not normalized or re.search(r"(?:이제|더는|더 이상)\s+안\s+좋아", normalized):
        return ()

    candidates: list[InterestObservation] = []
    strong_patterns = (
        re.compile(
            r"(?:나는|난|저는|전|내가|제가)\s+"
            r"(?:(?:진짜|정말|엄청|되게|아주)\s+)?"
            r"(.+?)(?:을|를)?\s+"
            r"(?:(?:진짜|정말|엄청|되게|아주)\s+)?"
            r"(?:좋아해(?:요)?|좋아함|좋아합니다)(?:[.!?ㅋㅎ\s]*)$"
        ),
        re.compile(
            r"(?:제일|가장)\s+좋아하는\s+"
            r"(?:밴드|가수|게임|음식|취미|운동|장르|노래)(?:가|은|는)?\s+"
            r"(.+?)(?:이야|예요|이에요|입니다|임)?(?:[.!?ㅋㅎ\s]*)$"
        ),
        re.compile(
            r"주말마다\s+(.+?)\s+(?:그려(?:요)?|그림|해(?:요)?|함|합니다|하는\s*중)(?:[.!?ㅋㅎ\s]*)$"
        ),
    )
    weak_patterns = (
        re.compile(
            r"요즘\s+(?:계속|자주)\s+(.+?)\s+"
            r"(?:듣고\s*(?:있음|있어요|있어)|들어(?:요)?|하고\s*(?:있음|있어요|있어)|해(?:요)?)(?:[.!?ㅋㅎ\s]*)$"
        ),
    )

    for pattern in strong_patterns:
        match = pattern.search(normalized)
        if match:
            candidates.append(InterestObservation(match.group(1), True))
    for pattern in weak_patterns:
        match = pattern.search(normalized)
        if match:
            keyword = re.sub(r"\s+노래$", "", match.group(1)).strip()
            candidates.append(InterestObservation(keyword, False))

    unique: dict[str, InterestObservation] = {}
    for candidate in candidates:
        keyword = normalize_interest_keyword(candidate.keyword)
        if not is_safe_interest_keyword(keyword):
            continue
        key = keyword.casefold()
        previous = unique.get(key)
        if previous is None or candidate.strong:
            unique[key] = InterestObservation(keyword, candidate.strong)
    return tuple(unique.values())
