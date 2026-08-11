from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


SEOUL_TZ = ZoneInfo("Asia/Seoul")
DISPLAY_FORMAT = "%Y-%m-%d %H:%M"


def now_kst() -> datetime:
    return datetime.now(SEOUL_TZ)


def to_db_time(value: datetime) -> str:
    return value.astimezone(SEOUL_TZ).isoformat(timespec="seconds")


def now_db_time() -> str:
    return to_db_time(now_kst())


def add_hours_db(hours: int) -> tuple[str, str]:
    start = now_kst()
    end = start + timedelta(hours=hours)
    return to_db_time(start), to_db_time(end)


def parse_db_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=SEOUL_TZ)
    return parsed.astimezone(SEOUL_TZ)


def format_kst(value: str | datetime | None) -> str:
    if value is None:
        return "-"
    if isinstance(value, str):
        value = parse_db_time(value)
    return value.astimezone(SEOUL_TZ).strftime(DISPLAY_FORMAT)


def parse_deadline(value: str) -> datetime:
    try:
        parsed = datetime.strptime(value.strip(), DISPLAY_FORMAT)
    except ValueError as exc:
        raise ValueError("마감시각은 YYYY-MM-DD HH:MM 형식으로 입력해 주세요.") from exc
    return parsed.replace(tzinfo=SEOUL_TZ)


def next_daily_time_db(time_text: str, *, now: datetime | None = None) -> str:
    current = now or now_kst()
    try:
        hour_text, minute_text = time_text.strip().split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
    except (ValueError, AttributeError) as exc:
        raise ValueError("업데이트시각은 HH:MM 형식으로 입력해 주세요. 예: 09:00") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError("업데이트시각은 00:00~23:59 사이여야 합니다.")

    target = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= current:
        target += timedelta(days=1)
    return to_db_time(target)


def remaining_text(end_time: str, *, now: datetime | None = None) -> str:
    current = now or now_kst()
    end = parse_db_time(end_time)
    seconds = int((end - current).total_seconds())
    if seconds <= 0:
        return "완료 대기 중"

    minutes = seconds // 60
    hours, minutes = divmod(minutes, 60)
    days, hours = divmod(hours, 24)

    parts: list[str] = []
    if days:
        parts.append(f"{days}일")
    if hours:
        parts.append(f"{hours}시간")
    if minutes or not parts:
        parts.append(f"{minutes}분")
    return " ".join(parts)


def elapsed_ratio(start_time: str, end_time: str, *, now: datetime | None = None) -> float:
    start = parse_db_time(start_time)
    end = parse_db_time(end_time)
    current = now or now_kst()
    total = (end - start).total_seconds()
    if total <= 0:
        return 1.0
    elapsed = (current - start).total_seconds()
    return max(0.0, min(1.0, elapsed / total))
