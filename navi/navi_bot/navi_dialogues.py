from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DIALOGUE_DATA_PATH = Path(__file__).resolve().parent / "assets" / "navi_dialogues.json"


def _load_dialogue_data() -> dict[str, Any]:
    return json.loads(DIALOGUE_DATA_PATH.read_text(encoding="utf-8-sig"))


def _text_tuple(value: object) -> tuple[str, ...]:
    if isinstance(value, str):
        values = [value]
    elif isinstance(value, (list, tuple)):
        values = value
    else:
        return ()
    return tuple(str(item).strip() for item in values if str(item).strip())


def _int_value(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _level_key(value: object) -> str:
    level = max(1, min(5, _int_value(value, default=1)))
    return f"affection_{level}"


def _build_reaction(raw: dict[str, Any]) -> dict[str, Any] | None:
    keywords = _text_tuple(raw.get("keywords"))
    responses = _text_tuple(raw.get("replies") or raw.get("responses"))
    responses_by_tier: dict[str, tuple[str, ...]] = {}
    conditional_responses: list[dict[str, Any]] = []
    edit_reactions: list[dict[str, Any]] = []

    raw_responses_by_tier = raw.get("responses_by_tier")
    if isinstance(raw_responses_by_tier, dict):
        for tier, tier_responses in raw_responses_by_tier.items():
            pool = _text_tuple(tier_responses)
            if pool:
                responses_by_tier[str(tier)] = pool

    raw_level_replies = raw.get("level_replies")
    if isinstance(raw_level_replies, dict):
        for level, level_responses in raw_level_replies.items():
            pool = _text_tuple(level_responses)
            if pool:
                responses_by_tier[_level_key(level)] = pool

    if responses and "default" not in responses_by_tier:
        responses_by_tier["default"] = responses

    raw_conditional_responses = raw.get("conditional_responses")
    if isinstance(raw_conditional_responses, list):
        for item in raw_conditional_responses:
            if isinstance(item, dict):
                response = str(item.get("response") or "").strip()
                if response:
                    conditional_responses.append(dict(item, response=response))

    raw_edit_reactions = raw.get("edit_reactions")
    if isinstance(raw_edit_reactions, list):
        for item in raw_edit_reactions:
            if isinstance(item, dict):
                initial = str(item.get("initial") or "").strip()
                final = str(item.get("final") or "").strip()
                if initial and final:
                    edit_reactions.append(dict(item, initial=initial, final=final))

    if not keywords or not (responses or any(responses_by_tier.values()) or conditional_responses or edit_reactions):
        return None

    return {
        "key": str(raw.get("key") or ""),
        "keywords": list(keywords),
        "responses": list(responses),
        "responses_by_tier": {key: list(value) for key, value in responses_by_tier.items()},
        "conditional_responses": conditional_responses,
        "edit_reactions": edit_reactions,
        "affection_delta": _int_value(raw.get("delta", raw.get("affection_delta")), default=0),
    }


def _build_profile_lines(raw: object) -> dict[int, tuple[str, ...]]:
    if not isinstance(raw, dict):
        return {}
    lines: dict[int, tuple[str, ...]] = {}
    for level, choices in raw.items():
        pool = _text_tuple(choices)
        if pool:
            lines[max(1, min(5, _int_value(level, default=1)))] = pool
    return lines


NAVI_DIALOGUE_DATA: dict[str, Any] = _load_dialogue_data()
NAVI_DIALOGUE_REACTIONS: list[dict[str, Any]] = [
    reaction
    for raw_reaction in NAVI_DIALOGUE_DATA.get("reactions", [])
    if isinstance(raw_reaction, dict)
    for reaction in [_build_reaction(raw_reaction)]
    if reaction is not None
]
NAVI_PROFILE_LINES: dict[int, tuple[str, ...]] = _build_profile_lines(
    NAVI_DIALOGUE_DATA.get("profile_lines")
)
NAVI_AFFECTION_GAIN_SUFFIXES: dict[str, tuple[str, ...]] = {
    str(amount): _text_tuple(lines)
    for amount, lines in (NAVI_DIALOGUE_DATA.get("affection_gain_suffixes") or {}).items()
}
NAVI_AFFECTION_LOSS_SUFFIXES: dict[str, tuple[str, ...]] = {
    str(amount): _text_tuple(lines)
    for amount, lines in (NAVI_DIALOGUE_DATA.get("affection_loss_suffixes") or {}).items()
}
