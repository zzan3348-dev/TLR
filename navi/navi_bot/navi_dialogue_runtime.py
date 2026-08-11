from __future__ import annotations

import json
import random
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


DEFAULT_DATA_PATH = Path(__file__).resolve().parent / "assets" / "navi_dialogues.json"


def load_dialogues(path: str | Path = DEFAULT_DATA_PATH) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def get_affection_level(score: int, data: dict[str, Any]) -> int:
    thresholds = {int(k): int(v) for k, v in data["affection_level_thresholds"].items()}
    level = 1
    for candidate, threshold in sorted(thresholds.items()):
        if score >= threshold:
            level = candidate
    return level


def kst_date_key(now: datetime | None = None) -> str:
    now = now or datetime.now(ZoneInfo("Asia/Seoul"))
    return now.astimezone(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d")


def normalize_text(value: object) -> str:
    return " ".join(str(value or "").strip().lower().split())


def keyword_matches(message: str, keyword: str) -> bool:
    if keyword in {"*", "__any__"}:
        return message == normalize_text("나비야")
    if message == keyword:
        return True
    if keyword == normalize_text("나비야"):
        return False
    if len(keyword) < 6:
        return False
    if message.startswith(keyword):
        return True
    return f" {keyword} " in f" {message} "


def find_reaction(message: str, data: dict[str, Any]) -> dict[str, Any] | None:
    normalized = normalize_text(message)
    best: tuple[tuple[int, int], dict[str, Any]] | None = None
    for order, reaction in enumerate(data["reactions"]):
        for keyword in reaction["keywords"]:
            normalized_keyword = normalize_text(keyword)
            if not keyword_matches(normalized, normalized_keyword):
                continue
            score = (len(normalized_keyword), -order)
            if best is None or score > best[0]:
                best = (score, reaction)
    return best[1] if best else None


def level_reply_pool(reaction: dict[str, Any], level: int) -> list[str]:
    level_replies = reaction.get("level_replies") or {}
    for candidate in range(level, 0, -1):
        pool = level_replies.get(str(candidate))
        if pool:
            return pool
    return reaction.get("replies", [])


def choose_reply(reaction: dict[str, Any], current_level: int, rng: random.Random | None = None) -> str:
    rng = rng or random
    pool = level_reply_pool(reaction, current_level)
    if not pool:
        return ""
    return rng.choice(pool)


def suffix_pool(delta: int, data: dict[str, Any], gain_already_shown: bool = False) -> list[str]:
    if delta > 0:
        if gain_already_shown:
            return []
        key = str(delta if delta in {1, 2, 3, 4, 5, 10} else min(delta, 10))
        return data["affection_gain_suffixes"].get(key, [])
    if delta < 0:
        loss = abs(delta)
        key = str(loss if loss in {1, 2, 3, 4, 5, 10} else min(loss, 10))
        return data["affection_loss_suffixes"].get(key, [])
    return []


def choose_suffix(delta: int, data: dict[str, Any], gain_already_shown: bool = False, rng: random.Random | None = None) -> str:
    rng = rng or random
    pool = suffix_pool(delta, data, gain_already_shown=gain_already_shown)
    return rng.choice(pool) if pool else ""


def render_response(
    message: str,
    affection_score_before: int,
    data: dict[str, Any],
    *,
    gain_already_shown: bool = False,
    rng: random.Random | None = None,
) -> tuple[str, dict[str, Any] | None]:
    reaction = find_reaction(message, data)
    if reaction is None:
        return "", None
    level = get_affection_level(affection_score_before, data)
    body = choose_reply(reaction, level, rng=rng)
    suffix = choose_suffix(reaction.get("delta", 0), data, gain_already_shown=gain_already_shown, rng=rng)
    return (body + (" " + suffix if suffix else "")).strip(), reaction
