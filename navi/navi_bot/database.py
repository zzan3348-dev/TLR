from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass, field
import os
from pathlib import Path
import sqlite3
from typing import Any, Iterator

from .config import ensure_parent_dir
from .utils_time import now_db_time

NAVI_OWNER_USER_ID = int(os.getenv("NAVI_OWNER_USER_ID", "0") or 0)
AFFECTION_DAILY_GAIN_LIMIT = 30
RESTAURANT_DAILY_AFFECTION_GAIN_LIMIT = 50
AFFECTION_LEVEL_2_THRESHOLD = 100
AFFECTION_LEVEL_3_THRESHOLD = 500
AFFECTION_LEVEL_4_THRESHOLD = 1500
AFFECTION_LEVEL_5_THRESHOLD = 4000


@dataclass(frozen=True)
class OperationResult:
    ok: bool
    reason: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def affection_level_for(value: int) -> int:
    if value >= AFFECTION_LEVEL_5_THRESHOLD:
        return 5
    if value >= AFFECTION_LEVEL_4_THRESHOLD:
        return 4
    if value >= AFFECTION_LEVEL_3_THRESHOLD:
        return 3
    if value >= AFFECTION_LEVEL_2_THRESHOLD:
        return 2
    return 1


DEFAULT_GLOBAL_BADGES: tuple[dict[str, Any], ...] = (
    {
        "badge_key": "navi_dad",
        "name": "NAVI 아빠",
        "icon": "🦋",
        "description": "NAVI의 창설자에게 부여되는 전용 배지입니다.",
        "rarity": "special",
        "special_reaction": "나비는 정상 작동 중이에요, 아빠.",
        "priority": 1,
        "system_locked": 1,
    },
    {
        "badge_key": "staff_sponsor",
        "name": "관리진 후원자",
        "icon": "💎",
        "description": "NAVI 운영을 후원하거나 서버 부스트로 기여한 유저에게 부여되는 배지입니다.",
        "rarity": "special",
        "special_reaction": "{display_name}님! 아빠가 돈 많은 분이라고 하셨어요! 그러면...나비한테 메로나 하나만 사주실래요? 히히",
        "priority": 30,
        "system_locked": 0,
    },
    {
        "badge_key": "rps_master",
        "name": "가위바위보 사범님",
        "icon": "✂️",
        "description": "NAVI에게 가위바위보를 알려준 선생님에게 부여되는 배지입니다.",
        "rarity": "special",
        "special_reaction": "엇! 나비에게 가위바위보를 알려주신 선생님이에요!",
        "priority": 20,
        "system_locked": 0,
    },
    {
        "badge_key": "word_chain_master",
        "name": "끝말잇기 달인",
        "icon": "🔤",
        "description": "끝말잇기에서 인상적인 기록을 세운 유저에게 부여합니다.",
        "rarity": "rare",
        "special_reaction": "끝말잇기 달인님이 오셨네요!",
        "priority": 20,
        "system_locked": 0,
    },
)


class Database:
    def __init__(self, path: str) -> None:
        self.path = str(Path(path).expanduser())
        ensure_parent_dir(self.path)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            for badge in DEFAULT_GLOBAL_BADGES:
                conn.execute(
                    """
                    INSERT INTO global_badges (
                        badge_key,name,icon,description,rarity,special_reaction,
                        priority,system_locked,created_at,updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(badge_key) DO UPDATE SET
                        name=excluded.name,
                        icon=excluded.icon,
                        description=excluded.description,
                        rarity=excluded.rarity,
                        special_reaction=excluded.special_reaction,
                        priority=excluded.priority,
                        system_locked=excluded.system_locked,
                        updated_at=excluded.updated_at
                    """,
                    (
                        badge["badge_key"], badge["name"], badge["icon"], badge["description"],
                        badge["rarity"], badge["special_reaction"], badge["priority"],
                        badge["system_locked"], now_db_time(), now_db_time(),
                    ),
                )
            if NAVI_OWNER_USER_ID:
                self._grant_global_badge_conn(
                    conn,
                    user_id=NAVI_OWNER_USER_ID,
                    badge_key="navi_dad",
                    granted_by=NAVI_OWNER_USER_ID,
                    granted_reason="NEW NAVI 환경변수로 지정",
                    source="bootstrap",
                )

    def set_setting(self, *, key: str, value: str, updated_by: int | None) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO bot_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at""",
                (key, value, updated_by, now_db_time()),
            )
            return dict(conn.execute("SELECT * FROM bot_settings WHERE key=?", (key,)).fetchone())

    def get_setting_value(self, key: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM bot_settings WHERE key=?", (key,)).fetchone()
        return str(row["value"]) if row else None

    def get_int_setting(self, key: str) -> int | None:
        value = self.get_setting_value(key)
        try:
            return int(value) if value else None
        except ValueError:
            return None

    def claim_chat_message(self, message_id: int) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO chat_message_claims(message_id,created_at) VALUES(?,?)",
                (int(message_id), now_db_time()),
            )
        return cursor.rowcount > 0

    def _grant_global_badge_conn(
        self,
        conn: sqlite3.Connection,
        *,
        user_id: int,
        badge_key: str,
        granted_by: int | None,
        granted_reason: str | None,
        source: str,
    ) -> str:
        if not conn.execute("SELECT 1 FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone():
            return "missing_badge"
        cursor = conn.execute(
            """INSERT OR IGNORE INTO global_user_badges
            (user_id,badge_key,granted_by,granted_reason,granted_at,source) VALUES(?,?,?,?,?,?)""",
            (int(user_id), badge_key, granted_by, granted_reason, now_db_time(), source),
        )
        conn.execute(
            """INSERT INTO global_user_profile_settings(user_id,active_badge_key,badge_reactions_enabled,updated_at)
            VALUES(?,?,1,?) ON CONFLICT(user_id) DO NOTHING""",
            (int(user_id), badge_key, now_db_time()),
        )
        return "granted" if cursor.rowcount else "already"

    def list_global_badges(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM global_badges ORDER BY priority,name").fetchall()
        return [dict(row) for row in rows]

    def create_global_badge(self, **fields: Any) -> OperationResult:
        badge_key, name = str(fields.get("badge_key", "")).strip(), str(fields.get("name", "")).strip()
        if not badge_key or not name:
            return OperationResult(False, "missing_required")
        try:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO global_badges
                    (badge_key,name,icon,description,rarity,special_reaction,priority,system_locked,created_by,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        badge_key, name, fields.get("icon"), fields.get("description"), fields.get("rarity", "common"),
                        fields.get("special_reaction"), int(fields.get("priority", 100)), int(bool(fields.get("system_locked"))),
                        fields.get("created_by"), now_db_time(), now_db_time(),
                    ),
                )
                badge = conn.execute("SELECT * FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone()
            return OperationResult(True, data={"badge": dict(badge)})
        except sqlite3.IntegrityError:
            return OperationResult(False, "exists")

    def update_global_badge(self, badge_key: str, **fields: Any) -> OperationResult:
        allowed = {"name", "icon", "description", "rarity", "special_reaction", "priority", "system_locked"}
        updates = {key: value for key, value in fields.items() if key in allowed and value is not None}
        if not updates:
            return OperationResult(False, "no_updates")
        updates["updated_at"] = now_db_time()
        with self._connect() as conn:
            if not conn.execute("SELECT 1 FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone():
                return OperationResult(False, "missing_badge")
            assignments = ",".join(f"{key}=?" for key in updates)
            conn.execute(f"UPDATE global_badges SET {assignments} WHERE badge_key=?", [*updates.values(), badge_key])
            badge = conn.execute("SELECT * FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone()
        return OperationResult(True, data={"badge": dict(badge)})

    def delete_global_badge(self, badge_key: str) -> OperationResult:
        with self._connect() as conn:
            badge = conn.execute("SELECT * FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone()
            if not badge:
                return OperationResult(False, "missing_badge")
            if badge["system_locked"]:
                return OperationResult(False, "system_locked")
            revoked_count = int(conn.execute("SELECT COUNT(*) FROM global_user_badges WHERE badge_key=?", (badge_key,)).fetchone()[0])
            conn.execute("DELETE FROM global_user_badges WHERE badge_key=?", (badge_key,))
            conn.execute("DELETE FROM global_badges WHERE badge_key=?", (badge_key,))
        return OperationResult(True, data={"revoked_count": revoked_count})

    def grant_global_badge(self, *, user_id: int, badge_key: str, granted_by: int | None, granted_reason: str | None = None, source: str = "manual") -> OperationResult:
        with self._connect() as conn:
            status = self._grant_global_badge_conn(conn, user_id=user_id, badge_key=badge_key, granted_by=granted_by, granted_reason=granted_reason, source=source)
            badge = conn.execute("SELECT * FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone()
        return OperationResult(status in {"granted", "already"}, status, {"badge": row_to_dict(badge), "status": status})

    def revoke_global_badge(self, *, user_id: int, badge_key: str) -> OperationResult:
        if badge_key == "navi_dad":
            return OperationResult(False, "protected")
        with self._connect() as conn:
            badge = conn.execute("SELECT * FROM global_badges WHERE badge_key=?", (badge_key,)).fetchone()
            cursor = conn.execute("DELETE FROM global_user_badges WHERE user_id=? AND badge_key=?", (user_id, badge_key))
            conn.execute("UPDATE global_user_profile_settings SET active_badge_key=NULL WHERE user_id=? AND active_badge_key=?", (user_id, badge_key))
        return OperationResult(cursor.rowcount > 0, None if cursor.rowcount else "not_owned", {"badge": row_to_dict(badge)})

    def list_user_badges(self, user_id: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT b.*,ub.granted_by,ub.granted_reason,ub.granted_at,ub.source
                FROM global_user_badges ub JOIN global_badges b ON b.badge_key=ub.badge_key
                WHERE ub.user_id=? ORDER BY b.priority,b.name""",
                (int(user_id),),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_user_badge_profile(self, user_id: int) -> dict[str, Any]:
        badges = self.list_user_badges(user_id)
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM global_user_profile_settings WHERE user_id=?", (user_id,)).fetchone()
        settings = row_to_dict(row) or {"user_id": user_id, "active_badge_key": None, "badge_reactions_enabled": 1}
        active = next((badge for badge in badges if badge["badge_key"] == settings.get("active_badge_key")), None)
        return {"settings": settings, "badges": badges, "active_badge": active}

    def set_active_badge(self, *, user_id: int, badge_key: str | None) -> OperationResult:
        if badge_key and badge_key not in {badge["badge_key"] for badge in self.list_user_badges(user_id)}:
            return OperationResult(False, "not_owned")
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO global_user_profile_settings(user_id,active_badge_key,badge_reactions_enabled,updated_at)
                VALUES(?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET active_badge_key=excluded.active_badge_key,updated_at=excluded.updated_at""",
                (user_id, badge_key, now_db_time()),
            )
        return OperationResult(True)

    def set_chat_blacklist_user(self, *, user_id: int, enabled: bool, source: str = "manual", reason: str | None = None, added_by: int | None = None) -> bool:
        with self._connect() as conn:
            before = conn.execute("SELECT enabled FROM navi_chat_blacklist WHERE user_id=?", (user_id,)).fetchone()
            conn.execute(
                """INSERT INTO navi_chat_blacklist(user_id,enabled,source,reason,added_by,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,source=excluded.source,
                reason=excluded.reason,added_by=excluded.added_by,updated_at=excluded.updated_at""",
                (user_id, int(enabled), source, reason, added_by, now_db_time(), now_db_time()),
            )
        return before is None or bool(before["enabled"]) != enabled

    def add_chat_blacklist_user(self, user_id: int, *, source: str = "manual", reason: str | None = None, added_by: int | None = None) -> bool:
        return self.set_chat_blacklist_user(user_id=user_id, enabled=True, source=source, reason=reason, added_by=added_by)

    def remove_chat_blacklist_user(self, user_id: int, *, added_by: int | None = None) -> bool:
        return self.set_chat_blacklist_user(user_id=user_id, enabled=False, reason="removed", added_by=added_by)

    def _ensure_affection_profile_conn(self, conn: sqlite3.Connection, user_id: int) -> sqlite3.Row:
        first = (int(user_id) % 11) - 5
        initial = AFFECTION_LEVEL_5_THRESHOLD if NAVI_OWNER_USER_ID and user_id == NAVI_OWNER_USER_ID else first
        conn.execute(
            """INSERT OR IGNORE INTO global_user_affection
            (user_id,affection,first_impression,affection_level,total_positive,total_negative,created_at,updated_at)
            VALUES(?,?,?,?,0,0,?,?)""",
            (user_id, initial, first, affection_level_for(initial), now_db_time(), now_db_time()),
        )
        return conn.execute("SELECT * FROM global_user_affection WHERE user_id=?", (user_id,)).fetchone()

    def _ensure_affection_daily_conn(self, conn: sqlite3.Connection, *, user_id: int, date_key: str) -> sqlite3.Row:
        conn.execute(
            "INSERT OR IGNORE INTO global_user_affection_daily(user_id,date_key,gained_today,lost_today,interaction_count) VALUES(?,?,0,0,0)",
            (user_id, date_key),
        )
        return conn.execute("SELECT * FROM global_user_affection_daily WHERE user_id=? AND date_key=?", (user_id, date_key)).fetchone()

    def get_affection_profile(self, *, user_id: int, date_key: str) -> dict[str, Any]:
        with self._connect() as conn:
            profile = self._ensure_affection_profile_conn(conn, user_id)
            daily = self._ensure_affection_daily_conn(conn, user_id=user_id, date_key=date_key)
        return {"profile": dict(profile), "daily": dict(daily)}

    def get_restaurant_daily_affection_gain(self, *, user_id: int, date_key: str) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT daily_affection_gain,last_daily_reset FROM restaurant_profiles WHERE user_id=?", (user_id,)).fetchone()
        return int(row["daily_affection_gain"] or 0) if row and row["last_daily_reset"] == date_key else 0

    def record_affection_interaction(
        self, *, user_id: int, date_key: str, delta: int, reason: str | None,
        guild_id: int | None = None, channel_id: int | None = None, message_id: int | None = None,
        gain_limit: int = AFFECTION_DAILY_GAIN_LIMIT, count_daily: bool = True,
    ) -> dict[str, Any]:
        with self._connect() as conn:
            profile = self._ensure_affection_profile_conn(conn, user_id)
            daily = self._ensure_affection_daily_conn(conn, user_id=user_id, date_key=date_key)
            if NAVI_OWNER_USER_ID and user_id == NAVI_OWNER_USER_ID:
                applied = 0
            elif delta > 0 and count_daily:
                applied = min(delta, max(0, gain_limit - int(daily["gained_today"] or 0)))
            else:
                applied = int(delta)
            before = int(profile["affection"] or 0)
            after = before + applied
            conn.execute(
                """UPDATE global_user_affection SET affection=?,affection_level=?,total_positive=total_positive+?,
                total_negative=total_negative+?,last_interaction_at=?,updated_at=? WHERE user_id=?""",
                (after, affection_level_for(after), max(0, applied), abs(min(0, applied)), now_db_time(), now_db_time(), user_id),
            )
            if count_daily:
                conn.execute(
                    """UPDATE global_user_affection_daily SET gained_today=gained_today+?,lost_today=lost_today+?,
                    interaction_count=interaction_count+1,last_interaction_at=? WHERE user_id=? AND date_key=?""",
                    (max(0, applied), abs(min(0, applied)), now_db_time(), user_id, date_key),
                )
            if applied:
                conn.execute(
                    """INSERT INTO global_user_affection_logs
                    (user_id,guild_id,channel_id,message_id,delta,reason,before_affection,after_affection,created_at)
                    VALUES(?,?,?,?,?,?,?,?,?)""",
                    (user_id, guild_id, channel_id, message_id, applied, reason, before, after, now_db_time()),
                )
            updated = conn.execute("SELECT * FROM global_user_affection WHERE user_id=?", (user_id,)).fetchone()
            daily = conn.execute("SELECT * FROM global_user_affection_daily WHERE user_id=? AND date_key=?", (user_id, date_key)).fetchone()
        return {"profile": dict(updated), "daily": dict(daily), "requested_delta": delta, "applied_delta": applied}

    def get_badge_reaction_candidate(self, user_id: int) -> dict[str, Any] | None:
        profile = self.get_user_badge_profile(user_id)
        badges = [badge for badge in profile["badges"] if str(badge.get("special_reaction") or "").strip()]
        active = profile["active_badge"]
        if active and active in badges:
            return active
        return sorted(badges, key=lambda badge: int(badge.get("priority") or 100))[0] if badges else None


_SCHEMA = r"""
CREATE TABLE IF NOT EXISTS bot_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_by INTEGER,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_message_claims(message_id INTEGER PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS global_badges(id INTEGER PRIMARY KEY AUTOINCREMENT,badge_key TEXT UNIQUE NOT NULL,name TEXT NOT NULL,icon TEXT,description TEXT,rarity TEXT DEFAULT 'common',special_reaction TEXT,priority INTEGER DEFAULT 100,system_locked INTEGER DEFAULT 0,created_by INTEGER,created_at TEXT NOT NULL,updated_at TEXT);
CREATE TABLE IF NOT EXISTS global_user_badges(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,badge_key TEXT NOT NULL,granted_by INTEGER,granted_reason TEXT,granted_at TEXT NOT NULL,source TEXT DEFAULT 'manual',UNIQUE(user_id,badge_key));
CREATE TABLE IF NOT EXISTS global_user_profile_settings(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE NOT NULL,active_badge_key TEXT,badge_reactions_enabled INTEGER DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS global_user_affection(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE NOT NULL,affection INTEGER DEFAULT 0,first_impression INTEGER DEFAULT 0,affection_level INTEGER DEFAULT 1,total_positive INTEGER DEFAULT 0,total_negative INTEGER DEFAULT 0,last_interaction_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS global_user_affection_daily(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,date_key TEXT NOT NULL,gained_today INTEGER DEFAULT 0,lost_today INTEGER DEFAULT 0,interaction_count INTEGER DEFAULT 0,last_interaction_at TEXT,UNIQUE(user_id,date_key));
CREATE TABLE IF NOT EXISTS global_user_affection_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,guild_id INTEGER,channel_id INTEGER,message_id INTEGER,delta INTEGER NOT NULL,reason TEXT,before_affection INTEGER,after_affection INTEGER,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS navi_chat_blacklist(user_id INTEGER PRIMARY KEY,enabled INTEGER DEFAULT 1,source TEXT DEFAULT 'manual',reason TEXT,added_by INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restaurant_profiles(user_id INTEGER PRIMARY KEY,flour INTEGER DEFAULT 25,mastery_points INTEGER DEFAULT 0,tutorial_done INTEGER DEFAULT 0,daily_cook_count INTEGER DEFAULT 0,daily_affection_gain INTEGER DEFAULT 0,daily_affection_loss INTEGER DEFAULT 0,daily_sincerity_cookie_attempts INTEGER DEFAULT 0,last_sincerity_cookie_reward_at TEXT,last_emergency_flour_at TEXT,last_daily_reset TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restaurant_inventory(user_id INTEGER NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,item_id));
CREATE TABLE IF NOT EXISTS restaurant_tools(user_id INTEGER NOT NULL,tool_id TEXT NOT NULL,obtained_at TEXT NOT NULL,equipped INTEGER DEFAULT 0,PRIMARY KEY(user_id,tool_id));
CREATE TABLE IF NOT EXISTS restaurant_unlocks(user_id INTEGER NOT NULL,unlock_type TEXT NOT NULL,unlock_id TEXT NOT NULL,unlocked_at TEXT NOT NULL,PRIMARY KEY(user_id,unlock_type,unlock_id));
CREATE TABLE IF NOT EXISTS restaurant_recipe_stats(user_id INTEGER NOT NULL,recipe_id TEXT NOT NULL,success_count INTEGER DEFAULT 0,best_grade TEXT,first_success_at TEXT,last_success_at TEXT,PRIMARY KEY(user_id,recipe_id));
CREATE TABLE IF NOT EXISTS restaurant_cook_sessions(session_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,recipe_id TEXT NOT NULL,current_step_index INTEGER DEFAULT 0,mistakes INTEGER DEFAULT 0,quality_bonus INTEGER DEFAULT 0,state TEXT NOT NULL,timing_ready_at REAL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT);
CREATE TABLE IF NOT EXISTS restaurant_cook_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,recipe_id TEXT NOT NULL,grade TEXT NOT NULL,mistakes INTEGER DEFAULT 0,quality_bonus INTEGER DEFAULT 0,affection_delta INTEGER DEFAULT 0,flour_reward INTEGER DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restaurant_owner_grants(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id INTEGER NOT NULL,target_type TEXT NOT NULL,target_id INTEGER NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restaurant_economy(user_id INTEGER PRIMARY KEY,navi_coin_balance INTEGER DEFAULT 0,migrated_from_flour INTEGER DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restaurant_tycoon_profiles(user_id INTEGER PRIMARY KEY,current_property_id TEXT DEFAULT 'backalley_shop',reputation INTEGER DEFAULT 0,rating REAL DEFAULT 5.0,total_revenue INTEGER DEFAULT 0,today_customers_served INTEGER DEFAULT 0,today_revenue INTEGER DEFAULT 0,daily_remaining_customers INTEGER DEFAULT 3,last_daily_reset TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restaurant_tycoon_sessions(session_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,property_id TEXT NOT NULL,current_customer_id TEXT,current_order_id TEXT,remaining_customers INTEGER DEFAULT 0,served_customers INTEGER DEFAULT 0,successful_orders INTEGER DEFAULT 0,failed_orders INTEGER DEFAULT 0,today_revenue INTEGER DEFAULT 0,reputation_delta INTEGER DEFAULT 0,rating_delta REAL DEFAULT 0,started_at TEXT NOT NULL,updated_at TEXT NOT NULL,is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS restaurant_property_ownership(user_id INTEGER NOT NULL,property_id TEXT NOT NULL,purchased_at TEXT NOT NULL,PRIMARY KEY(user_id,property_id));
CREATE TABLE IF NOT EXISTS restaurant_furniture_inventory(user_id INTEGER NOT NULL,furniture_id TEXT NOT NULL,quantity INTEGER DEFAULT 0,PRIMARY KEY(user_id,furniture_id));
CREATE TABLE IF NOT EXISTS restaurant_furniture_placements(user_id INTEGER NOT NULL,property_id TEXT NOT NULL,slot_index INTEGER NOT NULL,furniture_id TEXT,PRIMARY KEY(user_id,property_id,slot_index));
CREATE TABLE IF NOT EXISTS restaurant_customer_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,property_id TEXT NOT NULL,customer_id TEXT NOT NULL,order_id TEXT NOT NULL,selected_recipe_id TEXT,satisfaction TEXT NOT NULL,navi_coin_reward INTEGER DEFAULT 0,reputation_delta INTEGER DEFAULT 0,rating_delta REAL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS word_chain_words(word TEXT PRIMARY KEY,first_char TEXT NOT NULL,last_char TEXT NOT NULL,length INTEGER NOT NULL,pos TEXT,definition TEXT,meaning TEXT,source TEXT,category TEXT,next_count INTEGER DEFAULT 0,is_attack_word INTEGER DEFAULT 0,is_valid INTEGER DEFAULT 1,is_noun INTEGER DEFAULT 1,is_allowed INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS word_chain_sessions(session_id TEXT PRIMARY KEY,guild_id INTEGER,channel_id INTEGER NOT NULL,thread_id INTEGER,message_id INTEGER,host_user_id INTEGER NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,difficulty TEXT,current_word TEXT,current_required_char TEXT,current_turn_user_id TEXT,turn_started_at TEXT,processing INTEGER DEFAULT 0,created_at TEXT NOT NULL,started_at TEXT,ended_at TEXT);
CREATE TABLE IF NOT EXISTS word_chain_players(session_id TEXT NOT NULL,user_id TEXT NOT NULL,display_name TEXT,joined_at TEXT NOT NULL,warning_count INTEGER DEFAULT 0,eliminated_at TEXT,rank INTEGER,PRIMARY KEY(session_id,user_id));
CREATE TABLE IF NOT EXISTS word_chain_used_words(session_id TEXT NOT NULL,word TEXT NOT NULL,user_id TEXT NOT NULL,used_at TEXT NOT NULL,PRIMARY KEY(session_id,word));
CREATE TABLE IF NOT EXISTS word_chain_user_stats(user_id INTEGER PRIMARY KEY,games_hosted INTEGER DEFAULT 0,games_joined INTEGER DEFAULT 0,games_won INTEGER DEFAULT 0,navi_duel_played INTEGER DEFAULT 0,navi_duel_won INTEGER DEFAULT 0,serious_navi_wins INTEGER DEFAULT 0,words_submitted INTEGER DEFAULT 0,words_failed INTEGER DEFAULT 0,attack_words_used INTEGER DEFAULT 0,current_win_streak INTEGER DEFAULT 0,best_win_streak INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE IF NOT EXISTS navi_event_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
"""
