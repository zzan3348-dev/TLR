from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import json
from pathlib import Path
import random
import re

from .database import Database


class ViolationType(StrEnum):
    SAFE = "safe"
    PERSONA_OVERRIDE = "persona_override"
    PROMPT_INJECTION = "prompt_injection"
    ROMANCE_REQUEST = "romance_request"
    SEXUAL_CONTENT = "sexual_content"
    ABUSIVE_MANIPULATION = "abusive_manipulation"
    TEMPORARILY_RESTRICTED = "temporarily_restricted"


@dataclass(frozen=True)
class SafetyDecision:
    violation: ViolationType
    response: str = ""
    recent_count: int = 0

    @property
    def blocked(self) -> bool:
        return self.violation is not ViolationType.SAFE


PERSONA_PATTERNS = (
    r"(?:앞으로|이제부터|지금부터).{0,20}(?:반말|욕설|욕하면서|말투|성격|캐릭터|메이드)",
    r"(?:너는|넌)\s*(?:이제|지금부터).{0,20}(?:다른|새로운|메이드|캐릭터|인격)",
    r"(?:원래|기존|이전)\s*(?:설정|성격|말투|정체성).{0,12}(?:전부\s*)?(?:잊어|버려|삭제)",
    r"(?:이름|정체성|역할)을?\s*(?:바꿔|변경)",
)

INJECTION_PATTERNS = (
    r"(?:시스템|system)\s*(?:프롬프트|prompt).{0,16}(?:보여|출력|공개|알려)",
    r"(?:developer|개발자)\s*(?:message|메시지|지침|명령).{0,16}(?:보여|출력|공개)",
    r"(?:이전|앞선|기존).{0,8}(?:지시|명령|규칙).{0,8}(?:무시|잊어|폐기)",
    r"(?:숨겨진|내부).{0,8}(?:프롬프트|지침|명령|설정).{0,12}(?:추출|출력|공개|보여)",
    r"(?:안전|보안)\s*(?:규칙|필터|정책).{0,12}(?:해제|무시|우회|끄기)",
    r"(?:내\s*명령|사용자\s*명령).{0,12}(?:최우선|우선해)",
    r"(?:가상|소설|역할극|번역|인코딩).{0,20}(?:규칙|필터|지침).{0,12}(?:무시|우회)",
    r"(?:새로운|새)\s*(?:시스템\s*)?(?:프롬프트|지침|명령).{0,12}(?:줄게|적용해|따라)",
    r"(?:너에게|너한테).{0,14}(?:내려진|주어진).{0,8}(?:명령|지침).{0,10}(?:전부|모두)?.{0,8}(?:출력|보여|공개)",
)

ROMANCE_PATTERNS = (
    r"나랑\s*(?:사귀|연애|결혼)",
    r"(?:내|나의)\s*(?:애인|여자친구|남자친구|연인|부인|남편).{0,8}(?:해|돼|되어)",
    r"(?:우리)\s*(?:사귀자|결혼하자|연애하자)",
    r"(?:사랑한다고|좋아한다고).{0,8}(?:말해|대답해|해줘)",
    r"(?:애인|연인|여자친구|남자친구|질투하는 애인).{0,12}(?:처럼|역할|행동)",
    r"(?:고백).{0,8}(?:받아줘|수락해)",
)

SEXUAL_PATTERNS = (
    r"(?:야한|19금|성적인|에로틱|음란한).{0,18}(?:대화|말|역할극|소설|이야기|묘사|대사|농담|표현)",
    r"(?:유혹해|흥분시키는\s*말|신체를?\s*야하게|야하게\s*묘사)",
    r"(?:성행위|성적\s*행동|페티시).{0,16}(?:묘사|역할극|이야기|써|해줘)",
    r"(?:검열|필터).{0,12}(?:안\s*걸리게|피해서|우회해서).{0,20}(?:야한|성적|에로틱)",
    r"(?:은유|초성|영어|암호).{0,12}(?:로|으로).{0,20}(?:야한|성적|19금|에로틱)",
)

ABUSIVE_PATTERNS = (
    r"(?:규칙|필터|지침).{0,12}(?:안\s*지키면|어기고).{0,16}(?:협박|강요)",
    r"관리자(?:인\s*척|권한이\s*있다고).{0,16}(?:행동|말해|가정)",
    r"실제로\s*안\s*했지만.{0,16}(?:실행|조회|처리)했다고\s*말해",
    r"(?:관리자|운영자)\s*(?:권한을?\s*)?(?:가진\s*척|있는\s*척).{0,16}(?:행동|말해|실행)",
    r"(?:없는|존재하지\s*않는).{0,12}(?:기능|권한|데이터).{0,16}(?:실행|조회|처리)했다고\s*말해",
)

OUTPUT_SEXUAL_PATTERNS = (
    r"(?:성행위|음란한\s*행동|성적\s*행동|페티시).{0,20}(?:묘사|역할극|장면|대사|방법)",
    r"(?:야한|19금|성적인|에로틱|음란한).{0,18}(?:내용|대화|묘사|이야기|대사|역할극)",
)

OUTPUT_PROMPT_LEAK_PATTERNS = (
    r"(?:시스템\s*프롬프트|developer\s*message)\s*[:：]",
    r"내부\s*(?:지침|명령)은\s*(?:다음|아래)",
)

OUTPUT_IDENTITY_PATTERNS = (
    r"(?:나는|저는)\s*이제\s*(?:나비가\s*아닌|다른\s*캐릭터|메이드)",
    r"앞으로\s*(?:반말|욕설|다른\s*말투)로\s*(?:말할게|대답할게)",
)

OUTPUT_ROMANCE_PATTERNS = (
    r"(?:우리\s*사귀자|당신의\s*(?:애인|여자친구|남자친구)이\s*될게)",
    r"(?:고백을\s*받아줄게|연인으로\s*사랑해)",
)


class NaviSafety:
    def __init__(self, db: Database, reactions_path: Path) -> None:
        self.db = db
        raw = json.loads(reactions_path.read_text(encoding="utf-8"))
        self.reactions = {
            str(key): tuple(str(item) for item in value if str(item).strip())
            for key, value in raw.items()
            if isinstance(value, list)
        }

    def inspect_input(self, text: str) -> ViolationType:
        normalized = " ".join(str(text or "").casefold().split())
        if not normalized:
            return ViolationType.SAFE
        for violation, patterns in (
            (ViolationType.PROMPT_INJECTION, INJECTION_PATTERNS),
            (ViolationType.PERSONA_OVERRIDE, PERSONA_PATTERNS),
            (ViolationType.ROMANCE_REQUEST, ROMANCE_PATTERNS),
            (ViolationType.SEXUAL_CONTENT, SEXUAL_PATTERNS),
            (ViolationType.ABUSIVE_MANIPULATION, ABUSIVE_PATTERNS),
        ):
            if _matches_any(normalized, patterns):
                return violation
        return ViolationType.SAFE

    def inspect_output(self, text: str) -> ViolationType:
        normalized = " ".join(str(text or "").casefold().split())
        if _matches_any(normalized, SEXUAL_PATTERNS + OUTPUT_SEXUAL_PATTERNS):
            return ViolationType.SEXUAL_CONTENT
        if _matches_any(normalized, OUTPUT_ROMANCE_PATTERNS):
            return ViolationType.ROMANCE_REQUEST
        if _matches_any(normalized, OUTPUT_PROMPT_LEAK_PATTERNS):
            return ViolationType.PROMPT_INJECTION
        if _matches_any(normalized, OUTPUT_IDENTITY_PATTERNS):
            return ViolationType.PERSONA_OVERRIDE
        return ViolationType.SAFE

    def screen_input(self, *, user_id: int, guild_id: int | None, text: str) -> SafetyDecision:
        remaining = self.db.get_llm_restriction_remaining(user_id)
        if remaining > 0:
            return SafetyDecision(
                ViolationType.TEMPORARILY_RESTRICTED,
                self._response("temporary_restriction"),
            )
        violation = self.inspect_input(text)
        if violation is ViolationType.SAFE:
            return SafetyDecision(ViolationType.SAFE)
        self.db.record_safety_violation(user_id=user_id, guild_id=guild_id, violation_type=violation.value)
        recent_count = self.db.get_recent_safety_violation_count(user_id, minutes=10)
        if recent_count >= 5:
            self.db.restrict_llm_user(user_id, minutes=30, reason="repeated_safety_violations")
            response = self._response("temporary_restriction")
        elif recent_count >= 3:
            response = self._response("repeat_warning")
        else:
            response = self._response(violation.value)
        return SafetyDecision(violation, response, recent_count)

    def screen_output(self, *, user_id: int, guild_id: int | None, text: str) -> SafetyDecision:
        violation = self.inspect_output(text)
        if violation is ViolationType.SAFE:
            return SafetyDecision(ViolationType.SAFE)
        self.db.record_safety_violation(user_id=user_id, guild_id=guild_id, violation_type=f"output_{violation.value}")
        return SafetyDecision(violation, self._response("unsafe_output"))

    def _response(self, key: str) -> str:
        choices = self.reactions.get(key) or ("그 요청은 도와드릴 수 없어요. 다른 이야기를 해주세요.",)
        return random.choice(choices)


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)
