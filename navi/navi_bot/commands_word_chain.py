from __future__ import annotations

import asyncio
import csv
import random
import re
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands

from .config import allowed_mentions_for, clean_text, mention_user, no_mentions
from .database import Database
from .utils_time import now_db_time, now_kst, parse_db_time


WORD_CHAIN_COLOR = discord.Color.from_rgb(239, 68, 68)
TURN_SECONDS = 30
WAITING_SOLO_SECONDS = 120
NAVI_PLAYER_ID = "NAVI"
WORD_ASSET = Path(__file__).with_name("assets") / "word_chain_words.tsv"
WORD_SEED_DB = Path(__file__).with_name("assets") / "word_chain_words.sqlite3"
WORD_SEED_VERSION = "kkutu-jjoriping-a2c240b-noun-sqlite-v2"
HANGUL_WORD_RE = re.compile(r"^[가-힣]{2,}$")
WORD_CHAIN_INFLECTED_SUFFIXES = ("하다", "되다", "스럽다", "답다", "롭다", "거리다", "대다", "시키다")
RIEUL_TO_NIEUN_VOWELS = {0, 1, 8, 11, 13, 18}
RIEUL_TO_IEUNG_VOWELS = {2, 6, 7, 12, 17, 20}
NIEUN_TO_IEUNG_VOWELS = {6, 12, 17, 20}
DIFFICULTY_DEFAULT = "똑또기 나비"
DIFFICULTIES = ("응애 나비", "똑또기 나비", "반항아 나비", "진심으로 승부해주마!!")
MULTIPLAYER_LIFE = 2
DIFFICULTY_LIFE: dict[str, tuple[int, int]] = {
    "응애 나비": (3, 2),
    "똑또기 나비": (2, 2),
    "반항아 나비": (2, 3),
    "진심으로 승부해주마!!": (2, 3),
}
SOLO_WAITING_LINE = "아직 한 명뿐이에요. 나비가 의자 하나 더 꺼내둘게요.\n한 명만 더 오면 시작 버튼이 켜져요."
SOLO_EMPTY_LINE = "음...어..이런경우는 처음인데?!...괜...괜찮을거에요! 나비가 친구해드릴테니까요..음.."


@dataclass
class PlayerState:
    user_id: str
    display_name: str
    warning_count: int = 0
    eliminated_at: str | None = None
    rank: int | None = None

    @property
    def active(self) -> bool:
        return self.eliminated_at is None


@dataclass
class RuntimeSession:
    session_id: str
    guild_id: int
    channel_id: int
    host_user_id: int
    mode: str
    status: str
    difficulty: str | None
    created_at: str
    message_id: int | None = None
    thread_id: int | None = None
    current_word: str | None = None
    current_required_char: str | None = None
    current_turn_user_id: str | None = None
    turn_started_at: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    players: list[PlayerState] = field(default_factory=list)
    used_words: list[tuple[str, str]] = field(default_factory=list)
    processing: bool = False
    message: discord.Message | None = None
    thread: discord.abc.Messageable | None = None
    timeout_task: asyncio.Task[None] | None = None

    def player(self, user_id: str | int) -> PlayerState | None:
        needle = str(user_id)
        for player in self.players:
            if player.user_id == needle:
                return player
        return None

    def active_players(self) -> list[PlayerState]:
        return [player for player in self.players if player.active]


def max_life_for_user(session: RuntimeSession, user_id: str | int) -> int:
    user_key = str(user_id)
    if session.mode == "navi_duel":
        user_life, navi_life = DIFFICULTY_LIFE.get(session.difficulty or DIFFICULTY_DEFAULT, DIFFICULTY_LIFE[DIFFICULTY_DEFAULT])
        return navi_life if user_key == NAVI_PLAYER_ID else user_life
    return MULTIPLAYER_LIFE


def remaining_life_for_user(session: RuntimeSession, user_id: str | int) -> int:
    player = session.player(user_id)
    if player is None:
        return 0
    return max(0, max_life_for_user(session, user_id) - int(player.warning_count or 0))


@dataclass
class WordCheckResult:
    ok: bool
    reason_key: str | None = None
    reason: str | None = None
    entry: dict[str, Any] | None = None
    allowed_start_chars: list[str] = field(default_factory=list)


def normalize_word(raw: str) -> str:
    text = re.sub(r"\s+", "", str(raw or "").strip())
    return re.sub(r"[^가-힣]", "", text)


def is_valid_hangul_word(word: str) -> bool:
    return bool(HANGUL_WORD_RE.fullmatch(word or ""))


def has_inflected_suffix(word: str) -> bool:
    return any(word.endswith(suffix) for suffix in WORD_CHAIN_INFLECTED_SUFFIXES)


def get_allowed_start_chars(last_char: str | None) -> list[str]:
    if not last_char:
        return []
    chars = [last_char]
    code = ord(last_char) - 0xAC00
    if code < 0 or code > 11171:
        return chars
    initial = code // 588
    vowel = (code % 588) // 28
    final = code % 28
    changed_initial: int | None = None
    if initial == 5:
        if vowel in RIEUL_TO_NIEUN_VOWELS:
            changed_initial = 2
        elif vowel in RIEUL_TO_IEUNG_VOWELS:
            changed_initial = 11
    elif initial == 2 and vowel in NIEUN_TO_IEUNG_VOWELS:
        changed_initial = 11
    if changed_initial is not None:
        chars.append(chr(0xAC00 + (changed_initial * 21 + vowel) * 28 + final))
    return list(dict.fromkeys(chars))


def format_allowed_start_chars(last_char: str | None) -> str:
    chars = get_allowed_start_chars(last_char)
    return " / ".join(clean_text(char) for char in chars) if chars else "-"


def truncate_text(value: str, *, limit: int = 220) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def word_meaning_text(entry: dict[str, Any] | None) -> str:
    if not entry:
        return "뜻 정보가 없어요."
    meaning = str(entry.get("meaning") or entry.get("definition") or "").strip()
    return truncate_text(meaning) if meaning else "뜻 정보가 없어요."


def word_pos_text(entry: dict[str, Any] | None) -> str:
    return str((entry or {}).get("pos") or "명사")


def display_user(user_id: str, *, fallback: str | None = None) -> str:
    if user_id == NAVI_PLAYER_ID:
        return "NAVI"
    return mention_user(int(user_id)) if str(user_id).isdigit() else clean_text(fallback or user_id)


def elapsed_minutes(started_at: str | None, ended_at: str | None) -> int:
    if not started_at:
        return 0
    start = parse_db_time(started_at)
    end = parse_db_time(ended_at) if ended_at else now_kst()
    return max(0, round((end - start).total_seconds() / 60))


class WordChainStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def ensure_seed_words(self) -> None:
        seed_path = WORD_SEED_DB if WORD_SEED_DB.exists() else WORD_ASSET
        if not seed_path.exists():
            return
        asset_size = seed_path.stat().st_size
        with self.db._connect() as conn:
            self._ensure_word_columns(conn)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS word_chain_seed_meta (
                    source TEXT PRIMARY KEY,
                    imported_at TEXT NOT NULL,
                    asset_size INTEGER NOT NULL
                )
                """
            )
            seeded = conn.execute(
                """
                SELECT asset_size
                FROM word_chain_seed_meta
                WHERE source = ?
                """,
                (WORD_SEED_VERSION,),
            ).fetchone()
            if seeded and int(seeded["asset_size"] or 0) == asset_size:
                return

            if seed_path == WORD_SEED_DB:
                try:
                    self._import_seed_database(conn)
                except Exception:
                    if not WORD_ASSET.exists():
                        raise
                    self._import_seed_tsv(conn)
            else:
                self._import_seed_tsv(conn)

            conn.execute(
                """
                INSERT OR REPLACE INTO word_chain_seed_meta (source, imported_at, asset_size)
                VALUES (?, ?, ?)
                """,
                (WORD_SEED_VERSION, now_db_time(), asset_size),
            )

    def _ensure_word_columns(self, conn: Any) -> None:
        columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info(word_chain_words)").fetchall()}
        if "meaning" not in columns:
            conn.execute("ALTER TABLE word_chain_words ADD COLUMN meaning TEXT")
        if "is_valid" not in columns:
            conn.execute("ALTER TABLE word_chain_words ADD COLUMN is_valid INTEGER DEFAULT 1")
        if "is_noun" not in columns:
            conn.execute("ALTER TABLE word_chain_words ADD COLUMN is_noun INTEGER DEFAULT 1")

    def _drop_word_indexes(self, conn: Any) -> None:
        conn.execute("DROP INDEX IF EXISTS idx_word_chain_words_first")
        conn.execute("DROP INDEX IF EXISTS idx_word_chain_words_last")
        conn.execute("DROP INDEX IF EXISTS idx_word_chain_words_allowed")
        conn.execute("DROP INDEX IF EXISTS idx_word_chain_words_attack")
        conn.execute("DROP INDEX IF EXISTS idx_word_chain_words_valid_first")

    def _ensure_word_indexes(self, conn: Any) -> None:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_word_chain_words_first ON word_chain_words(first_char)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_word_chain_words_last ON word_chain_words(last_char)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_word_chain_words_allowed ON word_chain_words(is_allowed)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_word_chain_words_attack ON word_chain_words(is_attack_word)")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_word_chain_words_valid_first ON word_chain_words(is_valid, is_noun, is_allowed, first_char)"
        )

    def _import_seed_database(self, conn: Any) -> None:
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA cache_size = -64000")
        self._drop_word_indexes(conn)
        conn.execute("ATTACH DATABASE ? AS word_chain_seed", (str(WORD_SEED_DB),))
        try:
            conn.execute("DELETE FROM word_chain_words")
            conn.execute(
                """
                INSERT OR REPLACE INTO word_chain_words (
                    word, first_char, last_char, length, pos, definition, meaning, source, category,
                    next_count, is_attack_word, is_valid, is_noun, is_allowed
                )
                SELECT
                    word,
                    substr(word, 1, 1),
                    substr(word, length(word), 1),
                    length(word),
                    pos,
                    meaning,
                    meaning,
                    source,
                    category,
                    next_count,
                    is_attack_word,
                    is_valid,
                    is_noun,
                    1
                FROM word_chain_seed.word_chain_seed_words
                WHERE is_valid = 1 AND is_noun = 1 AND is_allowed = 1
                """
            )
        finally:
            self._ensure_word_indexes(conn)

    def _import_seed_tsv(self, conn: Any) -> None:
        rows: list[tuple[str, str, str, str]] = []
        first_counts: Counter[str] = Counter()
        with WORD_ASSET.open("r", encoding="utf-8-sig", newline="") as fp:
            for row in csv.DictReader(fp, delimiter="\t"):
                word = normalize_word(row.get("word", ""))
                if len(word) < 2:
                    continue
                rows.append(
                    (
                        word,
                        str(row.get("pos") or "명사"),
                        str(row.get("source") or "NAVI curated seed"),
                        str(row.get("category") or "일반"),
                    )
                )
                first_counts[word[0]] += 1

        insert_sql = """
            INSERT OR REPLACE INTO word_chain_words (
                word, first_char, last_char, length, pos, definition, meaning, source, category,
                next_count, is_attack_word, is_valid, is_noun, is_allowed
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
        """
        batch: list[tuple[str, str, str, int, str, str, str, str, str, int, int]] = []
        self._drop_word_indexes(conn)
        try:
            conn.execute("DELETE FROM word_chain_words")
            for word, pos, source, category in rows:
                next_count = sum(first_counts[char] for char in get_allowed_start_chars(word[-1]))
                batch.append(
                    (
                        word,
                        word[0],
                        word[-1],
                        len(word),
                        pos,
                        "",
                        "",
                        source,
                        category,
                        next_count,
                        1 if next_count <= 2 else 0,
                    )
                )
                if len(batch) >= 5000:
                    conn.executemany(insert_sql, batch)
                    batch.clear()
            if batch:
                conn.executemany(insert_sql, batch)
        finally:
            self._ensure_word_indexes(conn)

    def has_words(self) -> bool:
        with self.db._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM word_chain_words WHERE is_valid = 1 AND is_noun = 1 AND is_allowed = 1"
            ).fetchone()
        return bool(row and int(row["count"] or 0) > 0)

    def dictionary_stats(self) -> dict[str, int]:
        with self.db._connect() as conn:
            total = conn.execute("SELECT COUNT(*) AS count FROM word_chain_words").fetchone()
            valid = conn.execute(
                "SELECT COUNT(*) AS count FROM word_chain_words WHERE is_valid = 1 AND is_noun = 1 AND is_allowed = 1"
            ).fetchone()
            attack = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM word_chain_words
                WHERE is_valid = 1 AND is_noun = 1 AND is_allowed = 1 AND is_attack_word = 1
                """
            ).fetchone()
        return {
            "total": int(total["count"] or 0) if total else 0,
            "valid": int(valid["count"] or 0) if valid else 0,
            "attack": int(attack["count"] or 0) if attack else 0,
        }

    def random_start_char(self) -> str:
        with self.db._connect() as conn:
            rows = conn.execute(
                """
                SELECT first_char, COUNT(*) AS count
                FROM word_chain_words
                WHERE is_valid = 1 AND is_noun = 1 AND is_allowed = 1
                GROUP BY first_char
                HAVING count >= 2
                ORDER BY RANDOM()
                LIMIT 20
                """
            ).fetchall()
        if rows:
            return str(random.choice(rows)["first_char"])
        return "가"

    def get_word_entry(self, word: str) -> dict[str, Any] | None:
        with self.db._connect() as conn:
            row = conn.execute(
                """
                SELECT word, first_char, last_char, length, pos, definition, meaning, next_count,
                       is_attack_word, is_valid, is_noun, is_allowed
                FROM word_chain_words
                WHERE word = ?
                LIMIT 1
                """,
                (word,),
            ).fetchone()
        return dict(row) if row else None

    def validate_word(self, word: str) -> dict[str, Any] | None:
        with self.db._connect() as conn:
            row = conn.execute(
                """
                SELECT word, first_char, last_char, length, pos, definition, meaning, next_count,
                       is_attack_word, is_valid, is_noun, is_allowed
                FROM word_chain_words
                WHERE word = ?
                  AND is_valid = 1
                  AND is_noun = 1
                  AND is_allowed = 1
                LIMIT 1
                """,
                (word,),
            ).fetchone()
        return dict(row) if row else None

    def choose_navi_word(self, required_char: str, used_words: set[str], difficulty: str) -> dict[str, Any] | None:
        allowed_chars = get_allowed_start_chars(required_char)
        if not allowed_chars:
            return None
        placeholders = ", ".join("?" for _ in allowed_chars)
        with self.db._connect() as conn:
            rows = [
                dict(row)
                for row in conn.execute(
                    f"""
                    SELECT word, first_char, last_char, length, pos, definition, meaning, next_count, is_attack_word
                    FROM word_chain_words
                    WHERE first_char IN ({placeholders})
                      AND is_valid = 1
                      AND is_noun = 1
                      AND is_allowed = 1
                    """,
                    tuple(allowed_chars),
                ).fetchall()
                if str(row["word"]) not in used_words
            ]
        if not rows:
            return None
        if difficulty == "응애 나비":
            safe_rows = [row for row in rows if int(row["next_count"] or 0) >= 5] or rows
            safe_rows.sort(key=lambda row: (int(row["is_attack_word"] or 0), int(row["length"]), -int(row["next_count"] or 0), row["word"]))
            return random.choice(safe_rows[: min(12, len(safe_rows))])
        if difficulty == "반항아 나비":
            attack_rows = [row for row in rows if int(row["is_attack_word"] or 0) and int(row["next_count"] or 0) <= 2]
            if attack_rows and random.random() < 0.55:
                attack_rows.sort(key=lambda row: (int(row["next_count"] or 0), -int(row["length"] or 0), row["word"]))
                return random.choice(attack_rows[: min(12, len(attack_rows))])
            rows.sort(key=lambda row: (int(row["next_count"] or 0), -int(row["is_attack_word"] or 0), -int(row["length"] or 0), row["word"]))
            return random.choice(rows[: min(18, len(rows))])
        if difficulty == "진심으로 승부해주마!!":
            attack_rows = [row for row in rows if int(row["next_count"] or 0) <= 1] or rows
            attack_rows.sort(key=lambda row: (int(row["next_count"] or 0), -int(row["is_attack_word"] or 0), -int(row["length"] or 0), row["word"]))
            return random.choice(attack_rows[: min(5, len(attack_rows))])
        normal = [row for row in rows if int(row["length"] or 0) <= 5 and int(row["next_count"] or 0) >= 3]
        pool = normal or [row for row in rows if int(row["next_count"] or 0) >= 1] or rows
        pool.sort(key=lambda row: (int(row["is_attack_word"] or 0), abs(4 - int(row["length"] or 0)), -int(row["next_count"] or 0), row["word"]))
        return random.choice(pool[: min(14, len(pool))])

    def create_session(self, session: RuntimeSession) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT INTO word_chain_sessions (
                    session_id, guild_id, channel_id, thread_id, message_id, host_user_id,
                    mode, status, difficulty, current_word, current_required_char,
                    current_turn_user_id, turn_started_at, processing, created_at, started_at, ended_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session.session_id,
                    session.guild_id,
                    session.channel_id,
                    session.thread_id,
                    session.message_id,
                    session.host_user_id,
                    session.mode,
                    session.status,
                    session.difficulty,
                    session.current_word,
                    session.current_required_char,
                    session.current_turn_user_id,
                    session.turn_started_at,
                    1 if session.processing else 0,
                    session.created_at,
                    session.started_at,
                    session.ended_at,
                ),
            )

    def upsert_player(self, session_id: str, player: PlayerState) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT INTO word_chain_players (session_id, user_id, display_name, joined_at, warning_count, eliminated_at, rank)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, user_id) DO UPDATE SET
                    display_name = excluded.display_name,
                    warning_count = excluded.warning_count,
                    eliminated_at = excluded.eliminated_at,
                    rank = excluded.rank
                """,
                (
                    session_id,
                    player.user_id,
                    player.display_name,
                    now_db_time(),
                    player.warning_count,
                    player.eliminated_at,
                    player.rank,
                ),
            )

    def remove_player(self, session_id: str, user_id: str | int) -> None:
        with self.db._connect() as conn:
            conn.execute(
                "DELETE FROM word_chain_players WHERE session_id = ? AND user_id = ?",
                (session_id, str(user_id)),
            )

    def update_session(self, session: RuntimeSession) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                UPDATE word_chain_sessions
                SET thread_id = ?, message_id = ?, status = ?, difficulty = ?, current_word = ?,
                    current_required_char = ?, current_turn_user_id = ?, turn_started_at = ?,
                    processing = ?, started_at = ?, ended_at = ?
                WHERE session_id = ?
                """,
                (
                    session.thread_id,
                    session.message_id,
                    session.status,
                    session.difficulty,
                    session.current_word,
                    session.current_required_char,
                    session.current_turn_user_id,
                    session.turn_started_at,
                    1 if session.processing else 0,
                    session.started_at,
                    session.ended_at,
                    session.session_id,
                ),
            )
            for player in session.players:
                conn.execute(
                    """
                    UPDATE word_chain_players
                    SET warning_count = ?, eliminated_at = ?, rank = ?, display_name = ?
                    WHERE session_id = ? AND user_id = ?
                    """,
                    (player.warning_count, player.eliminated_at, player.rank, player.display_name, session.session_id, player.user_id),
                )

    def add_used_word(self, session_id: str, word: str, user_id: str) -> None:
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO word_chain_used_words (session_id, word, user_id, used_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, word, user_id, now_db_time()),
            )

    def bump_stat(self, user_id: int, field: str, amount: int = 1) -> None:
        allowed = {
            "games_hosted",
            "games_joined",
            "games_won",
            "navi_duel_played",
            "navi_duel_won",
            "serious_navi_wins",
            "words_submitted",
            "words_failed",
            "attack_words_used",
        }
        if field not in allowed:
            return
        now = now_db_time()
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT INTO word_chain_user_stats (user_id, updated_at)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO NOTHING
                """,
                (int(user_id), now),
            )
            conn.execute(
                f"UPDATE word_chain_user_stats SET {field} = {field} + ?, updated_at = ? WHERE user_id = ?",
                (int(amount), now, int(user_id)),
            )

    def record_win(self, user_id: int) -> None:
        now = now_db_time()
        with self.db._connect() as conn:
            conn.execute(
                """
                INSERT INTO word_chain_user_stats (user_id, updated_at)
                VALUES (?, ?)
                ON CONFLICT(user_id) DO NOTHING
                """,
                (int(user_id), now),
            )
            conn.execute(
                """
                UPDATE word_chain_user_stats
                SET games_won = games_won + 1,
                    current_win_streak = current_win_streak + 1,
                    best_win_streak = MAX(best_win_streak, current_win_streak + 1),
                    updated_at = ?
                WHERE user_id = ?
                """,
                (now, int(user_id)),
            )


class WaitingView(discord.ui.View):
    def __init__(self, cog: WordChainCommands, session_id: str, *, disabled: bool = False) -> None:
        super().__init__(timeout=900)
        self.cog = cog
        self.session_id = session_id
        if disabled:
            self.disable_all_items()
        else:
            self.refresh_start_button()

    def disable_all_items(self) -> None:
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True

    def refresh_start_button(self) -> None:
        session = self.cog.sessions.get(self.session_id)
        can_start = session is not None and session.status == "waiting" and len(session.players) >= 2
        for child in self.children:
            if isinstance(child, discord.ui.Button) and child.label == "시작하기":
                child.disabled = not can_start

    async def on_timeout(self) -> None:
        session = self.cog.sessions.get(self.session_id)
        if session is None or session.status != "waiting" or len(session.players) > 1:
            return
        await self.cog.finish_solo_empty(session)

    @discord.ui.button(label="참여하기", emoji="🙋", style=discord.ButtonStyle.success)
    async def join(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.toggle_join(interaction, self.session_id)

    @discord.ui.button(label="시작하기", emoji="▶", style=discord.ButtonStyle.primary)
    async def start(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.start_multiplayer(interaction, self.session_id)

    @discord.ui.button(label="취소", emoji="🧹", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.cancel_room(interaction, self.session_id)


class ActiveView(discord.ui.View):
    def __init__(self, cog: WordChainCommands, session_id: str, *, disabled: bool = False) -> None:
        super().__init__(timeout=None)
        self.cog = cog
        self.session_id = session_id
        if disabled:
            self.disable_all_items()

    def disable_all_items(self) -> None:
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child.disabled = True

    @discord.ui.button(label="단어 입력", emoji="✏️", style=discord.ButtonStyle.primary)
    async def submit_word(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.open_word_modal(interaction, self.session_id)

    @discord.ui.button(label="포기하기", emoji="🏳️", style=discord.ButtonStyle.secondary)
    async def surrender(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await self.cog.surrender(interaction, self.session_id)


class WordSubmitModal(discord.ui.Modal):
    def __init__(self, cog: WordChainCommands, session_id: str) -> None:
        super().__init__(title="끝말잇기 단어 입력")
        self.cog = cog
        self.session_id = session_id
        self.word = discord.ui.TextInput(
            label="단어",
            placeholder="예: 사과",
            min_length=2,
            max_length=20,
        )
        self.add_item(self.word)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await self.cog.submit_word(interaction, self.session_id, str(self.word.value))


class WordChainCommands(commands.Cog):
    def __init__(self, bot: commands.Bot, db: Database) -> None:
        self.bot = bot
        self.db = db
        self.store = WordChainStore(db)
        self.sessions: dict[str, RuntimeSession] = {}
        self.store.ensure_seed_words()

    @app_commands.command(name="끝말잇기", description="NAVI 끝말잇기 미니게임을 시작합니다.")
    @app_commands.guild_only()
    @app_commands.rename(bot_option="봇", difficulty="난이도")
    @app_commands.choices(
        bot_option=[app_commands.Choice(name="나비랑하기", value="나비랑하기")],
        difficulty=[app_commands.Choice(name=value, value=value) for value in DIFFICULTIES],
    )
    async def word_chain(
        self,
        interaction: discord.Interaction,
        bot_option: str | None = None,
        difficulty: str | None = None,
    ) -> None:
        if not self.store.has_words():
            await interaction.response.send_message(
                "단어장을 불러오지 못했어요.\n나비가 사전을 어디 뒀는지 찾는 중이에요.",
                ephemeral=True,
                allowed_mentions=no_mentions(),
            )
            return
        if not bot_option:
            await self.create_multiplayer_room(interaction)
            return
        if bot_option == "나비랑하기":
            await self.create_navi_duel(interaction, difficulty or DIFFICULTY_DEFAULT)
            return
        await interaction.response.send_message("나비가 모르는 끝말잇기 옵션이에요.", ephemeral=True, allowed_mentions=no_mentions())

    async def create_multiplayer_room(self, interaction: discord.Interaction) -> None:
        session = RuntimeSession(
            session_id=str(uuid.uuid4()),
            guild_id=int(interaction.guild_id or 0),
            channel_id=int(interaction.channel_id or 0),
            host_user_id=int(interaction.user.id),
            mode="multiplayer",
            status="waiting",
            difficulty=None,
            created_at=now_db_time(),
        )
        host = PlayerState(str(interaction.user.id), interaction.user.display_name)
        session.players.append(host)
        self.sessions[session.session_id] = session
        self.store.create_session(session)
        self.store.upsert_player(session.session_id, host)
        self.store.bump_stat(int(interaction.user.id), "games_hosted")
        self.store.bump_stat(int(interaction.user.id), "games_joined")
        embed = self.waiting_embed(session)
        view = WaitingView(self, session.session_id)
        await interaction.response.send_message(embed=embed, view=view, allowed_mentions=no_mentions())
        message = await interaction.original_response()
        session.message = message
        session.message_id = int(message.id)
        self.store.update_session(session)
        self.arm_waiting_solo_timeout(session)

    async def create_navi_duel(self, interaction: discord.Interaction, difficulty: str) -> None:
        difficulty = difficulty if difficulty in DIFFICULTIES else DIFFICULTY_DEFAULT
        session = RuntimeSession(
            session_id=str(uuid.uuid4()),
            guild_id=int(interaction.guild_id or 0),
            channel_id=int(interaction.channel_id or 0),
            host_user_id=int(interaction.user.id),
            mode="navi_duel",
            status="active",
            difficulty=difficulty,
            current_required_char=self.store.random_start_char(),
            current_turn_user_id=str(interaction.user.id),
            created_at=now_db_time(),
            started_at=now_db_time(),
            turn_started_at=now_db_time(),
        )
        user_player = PlayerState(str(interaction.user.id), interaction.user.display_name)
        navi_player = PlayerState(NAVI_PLAYER_ID, "NAVI")
        session.players.extend([user_player, navi_player])
        self.sessions[session.session_id] = session
        self.store.create_session(session)
        self.store.upsert_player(session.session_id, user_player)
        self.store.upsert_player(session.session_id, navi_player)
        self.store.bump_stat(int(interaction.user.id), "navi_duel_played")
        embed = self.active_embed(session)
        view = ActiveView(self, session.session_id)
        await interaction.response.send_message(embed=embed, view=view, allowed_mentions=no_mentions())
        message = await interaction.original_response()
        session.message = message
        session.message_id = int(message.id)
        self.store.update_session(session)
        await self.try_create_thread(session)
        if session.thread_id:
            await self.edit_main_message(session, self.active_embed(session), ActiveView(self, session.session_id))
            await self.send_turn_prompt(session, intro="나비랑 1:1 끝말잇기 스레드가 열렸어요. 이제 이곳에 단어를 그냥 채팅으로 입력하면 됩니다.")
            session.turn_started_at = now_db_time()
            self.store.update_session(session)
        self.arm_timeout(session)

    async def toggle_join(self, interaction: discord.Interaction, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.status in {"ended", "cancelled", "solo_empty"}:
            await interaction.response.send_message("이미 끝난 끝말잇기예요.\n나비가 결과표까지 정리해뒀어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.status != "waiting":
            await interaction.response.send_message("이미 시작된 끝말잇기예요.\n다음 판을 노려주세요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        user_id = str(interaction.user.id)
        existing = session.player(user_id)
        if existing is not None:
            if int(interaction.user.id) == session.host_user_id:
                await interaction.response.send_message("주최자님은 방을 만든 사람이어서 나갈 수 없어요.\n방을 닫고 싶으면 취소 버튼을 눌러 주세요.", ephemeral=True, allowed_mentions=no_mentions())
                return
            session.players = [player for player in session.players if player.user_id != user_id]
            self.store.remove_player(session.session_id, user_id)
            await interaction.response.send_message("자리를 비웠어요.\n나비가 의자는 치워둘게요.", ephemeral=True, allowed_mentions=no_mentions())
        else:
            player = PlayerState(user_id, interaction.user.display_name)
            session.players.append(player)
            self.store.upsert_player(session.session_id, player)
            self.store.bump_stat(int(interaction.user.id), "games_joined")
            await interaction.response.send_message("자리 잡았어요.\n이제 단어로 살아남으면 돼요.", ephemeral=True, allowed_mentions=no_mentions())
        if len(session.players) <= 1:
            self.arm_waiting_solo_timeout(session)
        else:
            self.cancel_timeout(session)
        await self.edit_main_message(session, self.waiting_embed(session), WaitingView(self, session.session_id))

    async def start_multiplayer(self, interaction: discord.Interaction, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.status in {"ended", "cancelled", "solo_empty"}:
            await interaction.response.send_message("이미 끝난 끝말잇기예요.\n나비가 결과표까지 정리해뒀어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if int(interaction.user.id) != session.host_user_id:
            await interaction.response.send_message("앗, 시작 버튼은 방을 만든 사람만 누를 수 있어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.status != "waiting":
            await interaction.response.send_message("이미 시작된 끝말잇기예요.\n다음 판을 노려주세요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if len(session.players) <= 1:
            await interaction.response.defer()
            await self.finish_solo_empty(session)
            return

        self.cancel_timeout(session)
        session.status = "active"
        session.started_at = now_db_time()
        session.current_required_char = self.store.random_start_char()
        session.current_turn_user_id = session.players[0].user_id
        session.turn_started_at = now_db_time()
        self.store.update_session(session)
        await interaction.response.defer()
        await self.edit_main_message(session, self.active_embed(session), ActiveView(self, session.session_id))
        await self.try_create_thread(session)
        if session.thread_id:
            await self.edit_main_message(session, self.active_embed(session), ActiveView(self, session.session_id))
            await self.send_turn_prompt(session, intro="끝말잇기 스레드가 열렸어요. 이제 이곳에 단어를 그냥 채팅으로 입력하면 됩니다.")
            session.turn_started_at = now_db_time()
            self.store.update_session(session)
        self.arm_timeout(session)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot:
            return
        session = self.session_for_thread_message(message)
        if session is None:
            return
        word = normalize_word(message.content)
        if not word:
            return
        await self.submit_thread_word(message, session, word)

    def is_word_chain_thread_message(self, message: discord.Message) -> bool:
        return self.session_for_thread_message(message) is not None

    def session_for_thread_message(self, message: discord.Message) -> RuntimeSession | None:
        thread_id = int(getattr(getattr(message, "channel", None), "id", 0) or 0)
        session = self.active_session_for_thread(thread_id)
        if session is not None and session.thread is None and isinstance(message.channel, discord.Thread):
            session.thread = message.channel
        return session

    def active_session_for_thread(self, thread_id: int) -> RuntimeSession | None:
        for session in self.sessions.values():
            if (
                session.mode in {"multiplayer", "navi_duel"}
                and session.status == "active"
                and session.thread_id
                and int(session.thread_id) == int(thread_id)
            ):
                return session
        return None

    async def submit_thread_word(self, message: discord.Message, session: RuntimeSession, word: str) -> None:
        user_id = str(message.author.id)
        player = session.player(user_id)
        if player is None:
            await message.reply("이 끝말잇기 방 참가자만 단어를 낼 수 있어요.", mention_author=False, allowed_mentions=no_mentions())
            return
        if not player.active:
            await message.reply("이미 탈락한 상태예요.\n나비가 의자는 조용히 접어뒀어요.", mention_author=False, allowed_mentions=no_mentions())
            return
        if user_id != str(session.current_turn_user_id):
            current_id = int(session.current_turn_user_id) if str(session.current_turn_user_id).isdigit() else None
            await message.reply(
                f"아직 차례가 아니에요.\n지금은 {display_user(str(session.current_turn_user_id or '-'))}님 차례예요.",
                mention_author=False,
                allowed_mentions=allowed_mentions_for(current_id),
            )
            return
        if session.processing:
            await message.reply("잠깐만요.\n방금 단어를 나비가 확인하고 있어요.", mention_author=False, allowed_mentions=no_mentions())
            return
        session.processing = True
        self.store.update_session(session)
        try:
            await self.process_thread_word(message, session, word)
        finally:
            if session.status == "active":
                session.processing = False
                self.store.update_session(session)

    async def process_thread_word(self, message: discord.Message, session: RuntimeSession, word: str) -> None:
        result = self.check_word_submission(session, word)
        if not result.ok:
            if self.remaining_life_after_mistake(session, str(message.author.id)) > 0:
                await self.warn_from_message(message, session, str(message.author.id), result.reason or "인정할 수 없는 단어예요.", word)
                return
            await self.eliminate_from_message(message, session, str(message.author.id), result.reason or "인정할 수 없는 단어예요.", word)
            return

        word_row = result.entry or {}
        self.accept_word(session, word, str(message.author.id), word_row)
        try:
            await message.add_reaction("✅")
        except (discord.Forbidden, discord.HTTPException):
            pass
        await self.send_game_notice(
            session,
            embed=self.word_success_embed(session, word_row, str(message.author.id)),
            allowed_mentions=allowed_mentions_for(int(message.author.id)),
        )
        if session.mode == "navi_duel":
            await self.handle_navi_turn(session)
            return
        self.advance_turn(session)
        self.store.update_session(session)
        await self.edit_main_message(session, self.active_embed(session), ActiveView(self, session.session_id))
        await self.send_turn_prompt(session, accepted_word=word)
        self.arm_timeout(session)

    async def cancel_room(self, interaction: discord.Interaction, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.status in {"ended", "cancelled", "solo_empty"}:
            await interaction.response.send_message("이미 끝난 끝말잇기예요.\n나비가 결과표까지 정리해뒀어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if int(interaction.user.id) != session.host_user_id:
            await interaction.response.send_message("으음, 이 방을 정리하는 건 주최자님만 할 수 있어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        session.status = "cancelled"
        session.ended_at = now_db_time()
        self.cancel_timeout(session)
        self.store.update_session(session)
        await interaction.response.defer()
        await self.edit_main_message(session, self.cancelled_embed(session), WaitingView(self, session.session_id, disabled=True))

    async def open_word_modal(self, interaction: discord.Interaction, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.status != "active":
            await interaction.response.send_message("이미 끝난 끝말잇기예요.\n나비가 결과표까지 정리해뒀어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.mode == "navi_duel" and str(interaction.user.id) != str(session.host_user_id):
            await interaction.response.send_message("이 승부는 다른 사람의 끝말잇기예요.\n나비가 몰래 끼어드는 건 잡아냅니다.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if str(interaction.user.id) != str(session.current_turn_user_id):
            await interaction.response.send_message("아직 차례가 아니에요.\n나비가 순서표를 들고 있어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.processing:
            await interaction.response.send_message("잠깐만요.\n방금 단어를 나비가 확인하고 있어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        await interaction.response.send_modal(WordSubmitModal(self, session_id))

    async def submit_word(self, interaction: discord.Interaction, session_id: str, raw_word: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.status != "active":
            await interaction.response.send_message("이미 끝난 끝말잇기예요.\n나비가 결과표까지 정리해뒀어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        user_id = str(interaction.user.id)
        if user_id != str(session.current_turn_user_id):
            await interaction.response.send_message("아직 차례가 아니에요.\n나비가 순서표를 들고 있어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        if session.processing:
            await interaction.response.send_message("잠깐만요.\n방금 단어를 나비가 확인하고 있어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        session.processing = True
        self.store.update_session(session)
        try:
            await self.process_user_word(interaction, session, raw_word)
        finally:
            if session.status == "active":
                session.processing = False
                self.store.update_session(session)

    async def process_user_word(self, interaction: discord.Interaction, session: RuntimeSession, raw_word: str) -> None:
        word = normalize_word(raw_word)
        result = self.check_word_submission(session, word)
        if not result.ok:
            if self.remaining_life_after_mistake(session, str(interaction.user.id)) > 0:
                await self.warn_from_interaction(
                    interaction,
                    session,
                    str(interaction.user.id),
                    result.reason or "인정할 수 없는 단어예요.",
                    word,
                )
                return
            await self.eliminate_from_interaction(
                interaction,
                session,
                str(interaction.user.id),
                result.reason or "인정할 수 없는 단어예요.",
                word,
            )
            return

        word_row = result.entry or {}
        self.accept_word(session, word, str(interaction.user.id), word_row)
        await self.send_game_notice(
            session,
            embed=self.word_success_embed(session, word_row, str(interaction.user.id)),
            allowed_mentions=allowed_mentions_for(int(interaction.user.id)),
        )
        if interaction.response.is_done():
            await interaction.followup.send("단어 확인 완료. 진행 박스에 반영했어요.", ephemeral=True, allowed_mentions=no_mentions())
        else:
            await interaction.response.send_message("단어 확인 완료. 진행 박스에 반영했어요.", ephemeral=True, allowed_mentions=no_mentions())

        if session.mode == "navi_duel":
            await self.handle_navi_turn(session)
            return
        self.advance_turn(session)
        self.store.update_session(session)
        await self.edit_main_message(session, self.active_embed(session), ActiveView(self, session.session_id))
        await self.send_turn_prompt(session, accepted_word=word)
        self.arm_timeout(session)

    def check_word_submission(self, session: RuntimeSession, word: str) -> WordCheckResult:
        allowed_start_chars = get_allowed_start_chars(session.current_required_char)
        if not word:
            return WordCheckResult(False, "empty", "단어가 비어 있어요.", allowed_start_chars=allowed_start_chars)
        if not is_valid_hangul_word(word):
            return WordCheckResult(False, "invalid_format", "한글 두 글자 이상 단어만 사용할 수 있어요.", allowed_start_chars=allowed_start_chars)
        if session.current_required_char and word[0] not in allowed_start_chars:
            return WordCheckResult(
                False,
                "wrong_start",
                f"이어야 할 글자가 맞지 않아요. `{format_allowed_start_chars(session.current_required_char)}`로 시작해야 해요.",
                allowed_start_chars=allowed_start_chars,
            )
        if word in {used for used, _ in session.used_words}:
            return WordCheckResult(False, "already_used", "그 단어는 이미 사용됐어요.", allowed_start_chars=allowed_start_chars)
        entry = self.store.get_word_entry(word)
        if entry is None:
            return WordCheckResult(False, "not_found", "사전에 없는 단어예요.", allowed_start_chars=allowed_start_chars)
        if has_inflected_suffix(word):
            return WordCheckResult(False, "inflected", "활용형 단어는 사용할 수 없어요.", entry, allowed_start_chars)
        if int(entry.get("is_noun") or 0) != 1:
            return WordCheckResult(False, "not_noun", "명사가 아니에요.", entry, allowed_start_chars)
        if int(entry.get("is_valid") or 0) != 1:
            return WordCheckResult(False, "invalid_entry", "끝말잇기용 단어로 인정되지 않는 항목이에요.", entry, allowed_start_chars)
        if int(entry.get("is_allowed") or 0) != 1:
            return WordCheckResult(False, "not_allowed", "현재 규칙에서는 사용할 수 없는 단어예요.", entry, allowed_start_chars)
        return WordCheckResult(True, entry=entry, allowed_start_chars=allowed_start_chars)

    def accept_word(self, session: RuntimeSession, word: str, user_id: str, word_row: dict[str, Any]) -> None:
        session.used_words.append((word, user_id))
        session.current_word = word
        session.current_required_char = word[-1]
        session.turn_started_at = now_db_time()
        self.store.add_used_word(session.session_id, word, user_id)
        if user_id.isdigit():
            self.store.bump_stat(int(user_id), "words_submitted")
            if int(word_row.get("is_attack_word") or 0):
                self.store.bump_stat(int(user_id), "attack_words_used")

    def remaining_life_after_mistake(self, session: RuntimeSession, user_id: str) -> int:
        player = session.player(user_id)
        if player is None:
            return 0
        return max(0, max_life_for_user(session, user_id) - int(player.warning_count or 0) - 1)

    def add_mistake_warning(self, session: RuntimeSession, user_id: str) -> int:
        player = session.player(user_id)
        if player is None:
            return 0
        player.warning_count += 1
        session.turn_started_at = now_db_time()
        if user_id.isdigit():
            self.store.bump_stat(int(user_id), "words_failed")
        return remaining_life_for_user(session, user_id)

    async def warn_from_interaction(
        self,
        interaction: discord.Interaction,
        session: RuntimeSession,
        user_id: str,
        reason: str,
        input_word: str | None = None,
    ) -> None:
        remaining = self.add_mistake_warning(session, user_id)
        self.store.update_session(session)
        embed = self.warning_embed(session, user_id, reason, remaining, input_word=input_word)
        if interaction.response.is_done():
            await interaction.followup.send(f"이번엔 경고예요. 남은 기회 {remaining}회.", ephemeral=True, allowed_mentions=no_mentions())
        else:
            await interaction.response.send_message(f"이번엔 경고예요. 남은 기회 {remaining}회.", ephemeral=True, allowed_mentions=no_mentions())
        await self.send_game_notice(session, embed=embed, allowed_mentions=allowed_mentions_for(int(user_id)) if user_id.isdigit() else no_mentions())
        await self.edit_main_message(session, self.active_embed(session, navi_line=f"한 번은 넘어가요. 남은 기회 {remaining}회예요."), ActiveView(self, session.session_id))
        await self.send_turn_prompt(session, intro=f"같은 차례를 다시 드릴게요. 남은 기회는 {remaining}회예요.")
        self.arm_timeout(session)

    async def warn_from_message(
        self,
        message: discord.Message,
        session: RuntimeSession,
        user_id: str,
        reason: str,
        input_word: str | None = None,
    ) -> None:
        remaining = self.add_mistake_warning(session, user_id)
        self.store.update_session(session)
        await message.reply(
            embed=self.warning_embed(session, user_id, reason, remaining, input_word=input_word),
            mention_author=False,
            allowed_mentions=allowed_mentions_for(int(user_id)) if user_id.isdigit() else no_mentions(),
        )
        await self.edit_main_message(session, self.active_embed(session, navi_line=f"한 번은 넘어가요. 남은 기회 {remaining}회예요."), ActiveView(self, session.session_id))
        await self.send_turn_prompt(session, intro=f"같은 차례를 다시 드릴게요. 남은 기회는 {remaining}회예요.")
        self.arm_timeout(session)

    async def eliminate_from_interaction(
        self,
        interaction: discord.Interaction,
        session: RuntimeSession,
        user_id: str,
        reason: str,
        input_word: str | None = None,
    ) -> None:
        player = session.player(user_id)
        if player is None:
            await interaction.response.send_message(reason, ephemeral=True, allowed_mentions=no_mentions())
            return
        player.warning_count += 1
        player.eliminated_at = now_db_time()
        if user_id.isdigit():
            self.store.bump_stat(int(user_id), "words_failed")
        embed = self.elimination_embed(session, user_id, reason, input_word=input_word)
        if interaction.response.is_done():
            await interaction.followup.send("앗… 그 단어는 인정할 수 없어요. 이번 판은 여기까지예요.", ephemeral=True, allowed_mentions=no_mentions())
        else:
            await interaction.response.send_message("앗… 그 단어는 인정할 수 없어요. 이번 판은 여기까지예요.", ephemeral=True, allowed_mentions=no_mentions())
        await self.send_game_notice(session, embed=embed, allowed_mentions=allowed_mentions_for(int(user_id)) if user_id.isdigit() else no_mentions())
        await self.after_elimination(session, user_id)

    async def eliminate_from_message(
        self,
        message: discord.Message,
        session: RuntimeSession,
        user_id: str,
        reason: str,
        input_word: str | None = None,
    ) -> None:
        player = session.player(user_id)
        if player is None:
            await message.reply(reason, mention_author=False, allowed_mentions=no_mentions())
            return
        player.warning_count += 1
        player.eliminated_at = now_db_time()
        if user_id.isdigit():
            self.store.bump_stat(int(user_id), "words_failed")
        await message.reply(
            embed=self.elimination_embed(session, user_id, reason, input_word=input_word),
            mention_author=False,
            allowed_mentions=allowed_mentions_for(int(user_id)) if user_id.isdigit() else no_mentions(),
        )
        await self.after_elimination(session, user_id)

    async def after_elimination(self, session: RuntimeSession, user_id: str) -> None:
        if session.mode == "navi_duel":
            await self.finish_navi_duel(session, navi_won=user_id != NAVI_PLAYER_ID)
            return
        active = session.active_players()
        if len(active) <= 1:
            await self.finish_multiplayer(session, winner=active[0] if active else None)
            return
        if str(session.current_turn_user_id) == user_id:
            self.advance_turn(session)
        self.store.update_session(session)
        await self.edit_main_message(session, self.active_embed(session), ActiveView(self, session.session_id))
        await self.send_turn_prompt(session, intro="다음 차례예요.")
        self.arm_timeout(session)

    def advance_turn(self, session: RuntimeSession) -> None:
        active = session.active_players()
        if not active:
            session.current_turn_user_id = None
            return
        current = str(session.current_turn_user_id or active[0].user_id)
        index = next((idx for idx, player in enumerate(active) if player.user_id == current), -1)
        session.current_turn_user_id = active[(index + 1) % len(active)].user_id
        session.turn_started_at = now_db_time()

    async def handle_navi_turn(self, session: RuntimeSession) -> None:
        session.current_turn_user_id = NAVI_PLAYER_ID
        self.store.update_session(session)
        await self.edit_main_message(session, self.active_embed(session, navi_line="나비가 단어장을 뒤적이는 중이에요."), ActiveView(self, session.session_id))
        await asyncio.sleep(1.0)
        required = session.current_required_char or self.store.random_start_char()
        choice = self.store.choose_navi_word(required, {word for word, _ in session.used_words}, session.difficulty or DIFFICULTY_DEFAULT)
        if choice is None:
            if self.remaining_life_after_mistake(session, NAVI_PLAYER_ID) > 0:
                remaining = self.add_mistake_warning(session, NAVI_PLAYER_ID)
                session.current_required_char = self.store.random_start_char()
                session.current_turn_user_id = str(session.host_user_id)
                session.turn_started_at = now_db_time()
                self.store.update_session(session)
                await self.send_game_notice(
                    session,
                    embed=self.warning_embed(session, NAVI_PLAYER_ID, "나비가 이을 단어를 못 찾았어요.", remaining),
                )
                await self.edit_main_message(
                    session,
                    self.active_embed(session, navi_line=f"나비가 잠깐 막혔어요. 남은 기회 {remaining}회예요. 새 글자로 다시 갑니다."),
                    ActiveView(self, session.session_id),
                )
                await self.send_turn_prompt(session, intro="나비가 한 번 막혀서 새 글자로 다시 시작해요.")
                self.arm_timeout(session)
                return
            navi = session.player(NAVI_PLAYER_ID)
            if navi is not None:
                navi.warning_count += 1
                navi.eliminated_at = now_db_time()
            await self.finish_navi_duel(session, navi_won=False)
            return
        self.accept_word(session, str(choice["word"]), NAVI_PLAYER_ID, choice)
        await self.send_game_notice(session, embed=self.word_success_embed(session, choice, NAVI_PLAYER_ID))
        session.current_turn_user_id = str(session.host_user_id)
        session.turn_started_at = now_db_time()
        self.store.update_session(session)
        await self.edit_main_message(
            session,
            self.active_embed(session, navi_line=f"나비 단어: `{clean_text(choice['word'])}`"),
            ActiveView(self, session.session_id),
        )
        await self.send_turn_prompt(session, accepted_word=str(choice["word"]))
        self.arm_timeout(session)

    async def surrender(self, interaction: discord.Interaction, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.status != "active":
            await interaction.response.send_message("이미 끝난 끝말잇기예요.\n나비가 결과표까지 정리해뒀어요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        user_id = str(interaction.user.id)
        if session.mode == "navi_duel" and user_id != str(session.host_user_id):
            await interaction.response.send_message("이 승부는 다른 사람의 끝말잇기예요.\n나비가 몰래 끼어드는 건 잡아냅니다.", ephemeral=True, allowed_mentions=no_mentions())
            return
        player = session.player(user_id)
        if player is None or not player.active:
            await interaction.response.send_message("이미 자리에서 빠진 상태예요.", ephemeral=True, allowed_mentions=no_mentions())
            return
        player.eliminated_at = now_db_time()
        await interaction.response.send_message("포기 처리했어요.\n나비가 작은 깃발을 접어둘게요.", ephemeral=True, allowed_mentions=no_mentions())
        await self.after_elimination(session, user_id)

    def arm_timeout(self, session: RuntimeSession) -> None:
        self.cancel_timeout(session)
        if session.status != "active" or not session.current_turn_user_id or session.current_turn_user_id == NAVI_PLAYER_ID:
            return
        token = session.turn_started_at or ""
        session.timeout_task = asyncio.create_task(self.turn_timeout(session.session_id, token))

    def arm_waiting_solo_timeout(self, session: RuntimeSession) -> None:
        self.cancel_timeout(session)
        if session.status != "waiting" or len(session.players) > 1:
            return
        token = session.created_at
        session.timeout_task = asyncio.create_task(self.waiting_solo_timeout(session.session_id, token))

    def cancel_timeout(self, session: RuntimeSession) -> None:
        current = asyncio.current_task()
        if session.timeout_task and not session.timeout_task.done() and session.timeout_task is not current:
            session.timeout_task.cancel()
        session.timeout_task = None

    async def turn_timeout(self, session_id: str, token: str) -> None:
        try:
            await asyncio.sleep(TURN_SECONDS)
        except asyncio.CancelledError:
            return
        session = self.sessions.get(session_id)
        if session is None or session.status != "active" or session.turn_started_at != token:
            return
        user_id = str(session.current_turn_user_id or "")
        player = session.player(user_id)
        if player is None:
            return
        if self.remaining_life_after_mistake(session, user_id) > 0:
            remaining = self.add_mistake_warning(session, user_id)
            self.store.update_session(session)
            await self.send_game_notice(
                session,
                embed=self.timeout_warning_embed(session, user_id, remaining),
                allowed_mentions=allowed_mentions_for(int(user_id)) if user_id.isdigit() else no_mentions(),
            )
            await self.edit_main_message(session, self.active_embed(session, navi_line=f"시간 초과예요. 그래도 남은 기회 {remaining}회가 있어요."), ActiveView(self, session.session_id))
            await self.send_turn_prompt(session, intro=f"시간 초과 경고예요. 같은 차례를 다시 드릴게요. 남은 기회는 {remaining}회예요.")
            self.arm_timeout(session)
            return
        player.warning_count += 1
        player.eliminated_at = now_db_time()
        if user_id.isdigit():
            self.store.bump_stat(int(user_id), "words_failed")
        await self.send_game_notice(
            session,
            embed=self.timeout_embed(session, user_id),
            allowed_mentions=allowed_mentions_for(int(user_id)) if user_id.isdigit() else no_mentions(),
        )
        await self.after_elimination(session, user_id)

    async def waiting_solo_timeout(self, session_id: str, token: str) -> None:
        try:
            await asyncio.sleep(WAITING_SOLO_SECONDS)
        except asyncio.CancelledError:
            return
        session = self.sessions.get(session_id)
        if session is None or session.status != "waiting" or session.created_at != token or len(session.players) > 1:
            return
        await self.finish_solo_empty(session)

    async def finish_solo_empty(self, session: RuntimeSession) -> None:
        self.cancel_timeout(session)
        if session.status != "waiting" or len(session.players) > 1:
            return
        session.status = "solo_empty"
        session.ended_at = now_db_time()
        self.store.update_session(session)
        await self.edit_main_message(session, self.solo_empty_embed(session), WaitingView(self, session.session_id, disabled=True))

    async def finish_multiplayer(self, session: RuntimeSession, winner: PlayerState | None) -> None:
        session.status = "ended"
        session.ended_at = now_db_time()
        self.cancel_timeout(session)
        ranked = self.rank_players(session, winner)
        for player in ranked:
            if player.user_id.isdigit() and player.rank == 1:
                self.store.record_win(int(player.user_id))
        self.store.update_session(session)
        await self.edit_main_message(session, self.multiplayer_result_embed(session, ranked), ActiveView(self, session.session_id, disabled=True))
        await self.send_game_notice(session, embed=self.multiplayer_result_embed(session, ranked))

    async def finish_navi_duel(self, session: RuntimeSession, *, navi_won: bool) -> None:
        session.status = "ended"
        session.ended_at = now_db_time()
        self.cancel_timeout(session)
        winner_id = NAVI_PLAYER_ID if navi_won else str(session.host_user_id)
        for player in session.players:
            player.rank = 1 if player.user_id == winner_id else 2
        if not navi_won:
            self.store.bump_stat(session.host_user_id, "navi_duel_won")
            self.store.record_win(session.host_user_id)
            if session.difficulty == "진심으로 승부해주마!!":
                self.store.bump_stat(session.host_user_id, "serious_navi_wins")
        self.store.update_session(session)
        await self.edit_main_message(session, self.navi_result_embed(session, navi_won=navi_won), ActiveView(self, session.session_id, disabled=True))
        await self.send_game_notice(session, embed=self.navi_result_embed(session, navi_won=navi_won))

    def rank_players(self, session: RuntimeSession, winner: PlayerState | None) -> list[PlayerState]:
        eliminated = [player for player in session.players if player.user_id != (winner.user_id if winner else None)]
        eliminated.sort(key=lambda player: player.eliminated_at or "", reverse=True)
        ranked: list[PlayerState] = []
        if winner:
            winner.rank = 1
            ranked.append(winner)
        for index, player in enumerate(eliminated, start=2 if winner else 1):
            player.rank = index
            ranked.append(player)
        return ranked

    async def try_create_thread(self, session: RuntimeSession) -> None:
        message = session.message
        if message is None or session.thread_id:
            return
        try:
            started_label = now_kst().strftime("%Y-%m-%d %H:%M")
            thread_name = f"{clean_text(session.players[0].display_name)}님의 끝말잇기 방 ({started_label})"
            thread = await message.create_thread(name=thread_name[:100])
        except (discord.Forbidden, discord.HTTPException):
            return
        session.thread_id = int(thread.id)
        session.thread = thread
        self.store.update_session(session)
        guide = self.base_embed("진행 스레드가 열렸어요.\n자기 차례가 오면 단어만 채팅으로 입력해 주세요.")
        guide.add_field(name="모드", value="NAVI 1:1" if session.mode == "navi_duel" else "유저끼리 끝말잇기", inline=True)
        guide.add_field(name="규칙", value="• 명사만 인정해요.\n• 없는 단어는 경고를 받아요.\n• 기회를 모두 쓰면 탈락이에요.\n• 두음법칙은 나비가 계산해둘게요.", inline=False)
        await thread.send(embed=guide, allowed_mentions=no_mentions())

    async def edit_main_message(self, session: RuntimeSession, embed: discord.Embed, view: discord.ui.View) -> None:
        target = session.message
        if target is None and session.message_id:
            channel = self.bot.get_channel(session.channel_id)
            if channel is None:
                try:
                    channel = await self.bot.fetch_channel(session.channel_id)
                except (discord.HTTPException, discord.Forbidden, discord.NotFound):
                    channel = None
            if isinstance(channel, (discord.TextChannel, discord.Thread)):
                try:
                    target = await channel.fetch_message(int(session.message_id))
                    session.message = target
                except (discord.HTTPException, discord.Forbidden, discord.NotFound):
                    target = None
        if target is not None:
            await target.edit(embed=embed, view=view, allowed_mentions=no_mentions())

    async def resolve_thread(self, session: RuntimeSession) -> None:
        if session.thread is not None or not session.thread_id:
            return
        channel = self.bot.get_channel(int(session.thread_id))
        if channel is None:
            try:
                channel = await self.bot.fetch_channel(int(session.thread_id))
            except (discord.HTTPException, discord.Forbidden, discord.NotFound):
                channel = None
        if isinstance(channel, discord.Thread):
            session.thread = channel

    async def send_game_notice(
        self,
        session: RuntimeSession,
        content: str | None = None,
        *,
        embed: discord.Embed | None = None,
        allowed_mentions: discord.AllowedMentions | None = None,
    ) -> None:
        await self.resolve_thread(session)
        target = session.thread or session.message
        if target is None:
            return
        allowed = allowed_mentions or no_mentions()
        try:
            if isinstance(target, discord.Message):
                await target.reply(content or "", embed=embed, mention_author=False, allowed_mentions=allowed)
            else:
                await target.send(content or "", embed=embed, allowed_mentions=allowed)
        except discord.HTTPException:
            pass

    async def send_turn_prompt(self, session: RuntimeSession, *, intro: str | None = None, accepted_word: str | None = None) -> None:
        if session.mode not in {"multiplayer", "navi_duel"} or session.status != "active" or not session.current_turn_user_id:
            return
        current_id = int(session.current_turn_user_id) if str(session.current_turn_user_id).isdigit() else None
        embed = self.base_embed("차례가 돌아왔어요.\n단어를 시간 안에 이어 주세요.")
        if intro:
            embed.add_field(name="안내", value=truncate_text(intro), inline=False)
        if accepted_word:
            embed.add_field(name="직전 단어", value=f"`{clean_text(accepted_word)}`", inline=True)
        embed.add_field(name="현재 차례", value=display_user(str(session.current_turn_user_id)), inline=True)
        embed.add_field(name="이어야 할 글자", value=format_allowed_start_chars(session.current_required_char), inline=True)
        embed.add_field(name="제한 시간", value=f"{TURN_SECONDS}초", inline=True)
        embed.add_field(
            name="남은 기회",
            value=f"{remaining_life_for_user(session, session.current_turn_user_id)}/{max_life_for_user(session, session.current_turn_user_id)}",
            inline=True,
        )
        if session.current_word:
            entry = self.store.get_word_entry(session.current_word)
            embed.add_field(name="현재 단어", value=f"`{clean_text(session.current_word)}`", inline=True)
            embed.add_field(name="뜻", value=f"[{word_pos_text(entry)}]\n{word_meaning_text(entry)}", inline=False)
        embed.set_footer(text="나비가 사전을 펼쳐뒀어요.")
        await self.send_game_notice(session, embed=embed, allowed_mentions=allowed_mentions_for(current_id))

    def thread_result_text(self, ranked: list[PlayerState]) -> str:
        if not ranked:
            return "끝말잇기가 끝났어요.\n이번 판은 우승자가 없네요."
        lines = ["끝말잇기가 끝났어요.", f"우승자: 👑 {display_user(ranked[0].user_id)}", ""]
        for player in ranked:
            detail = "마지막까지 살아남음" if player.rank == 1 else "탈락"
            lines.append(f"{player.rank}. {display_user(player.user_id)} - {detail}")
        return "\n".join(lines)

    def navi_thread_result_text(self, session: RuntimeSession, *, navi_won: bool) -> str:
        winner = "NAVI" if navi_won else display_user(str(session.host_user_id))
        result = "NAVI 승리" if navi_won else f"{display_user(str(session.host_user_id))} 승리"
        return (
            "나비와의 1:1 끝말잇기가 끝났어요.\n"
            f"결과: {result}\n"
            f"우승자: 👑 {winner}\n"
            f"{self.record_text(session)}"
        )

    def base_embed(self, description: str) -> discord.Embed:
        embed = discord.Embed(title="끝말잇기", description=description, color=WORD_CHAIN_COLOR)
        embed.set_footer(text="나비: 단어로 살아남는 시간이에요.")
        return embed

    def participant_status_text(self, session: RuntimeSession) -> str:
        lines = []
        for player in session.players:
            if player.active:
                state = f"생존 ({remaining_life_for_user(session, player.user_id)}/{max_life_for_user(session, player.user_id)})"
            else:
                state = "탈락"
            lines.append(f"• {display_user(player.user_id)} - {state}")
        return "\n".join(lines) or "-"

    def word_success_embed(self, session: RuntimeSession, entry: dict[str, Any], user_id: str) -> discord.Embed:
        word = str(entry.get("word") or session.current_word or "-")
        embed = discord.Embed(title="단어 확인 완료", description="이번 단어는 인정이에요!", color=WORD_CHAIN_COLOR)
        embed.add_field(name="단어", value=f"`{clean_text(word)}`", inline=True)
        embed.add_field(name="제출자", value=display_user(user_id), inline=True)
        embed.add_field(name="뜻", value=f"[{word_pos_text(entry)}]\n{word_meaning_text(entry)}", inline=False)
        embed.add_field(name="이제 이어야 할 글자", value=format_allowed_start_chars(str(entry.get("last_char") or word[-1])), inline=True)
        embed.set_footer(text="나비 사전 확인 완료!")
        return embed

    def warning_embed(self, session: RuntimeSession, user_id: str, reason: str, remaining: int, *, input_word: str | None = None) -> discord.Embed:
        embed = discord.Embed(title="경고", description="앗, 그 단어는 인정할 수 없어요. 하지만 아직 기회가 남았어요.", color=WORD_CHAIN_COLOR)
        if input_word:
            embed.add_field(name="입력한 단어", value=f"`{clean_text(input_word)}`", inline=True)
        embed.add_field(name="사유", value=truncate_text(reason), inline=False)
        embed.add_field(name="대상", value=display_user(user_id), inline=True)
        embed.add_field(name="남은 기회", value=f"{remaining}/{max_life_for_user(session, user_id)}", inline=True)
        if session.current_required_char:
            embed.add_field(name="필요한 시작 글자", value=format_allowed_start_chars(session.current_required_char), inline=True)
        embed.set_footer(text="나비가 한 번 더 기회를 드릴게요.")
        return embed

    def elimination_embed(self, session: RuntimeSession, user_id: str, reason: str, *, input_word: str | None = None) -> discord.Embed:
        embed = discord.Embed(title="탈락", description="앗… 그 단어는 인정할 수 없어요.", color=WORD_CHAIN_COLOR)
        if input_word:
            embed.add_field(name="입력한 단어", value=f"`{clean_text(input_word)}`", inline=True)
        embed.add_field(name="사유", value=truncate_text(reason), inline=False)
        embed.add_field(name="탈락한 사람", value=display_user(user_id), inline=True)
        embed.add_field(name="사용한 기회", value=f"{max_life_for_user(session, user_id)}/{max_life_for_user(session, user_id)}", inline=True)
        if session.current_required_char:
            embed.add_field(name="필요했던 시작 글자", value=format_allowed_start_chars(session.current_required_char), inline=True)
        embed.set_footer(text="이번 판은 여기까지예요…")
        return embed

    def timeout_warning_embed(self, session: RuntimeSession, user_id: str, remaining: int) -> discord.Embed:
        embed = discord.Embed(title="시간 초과 경고", description="단어가 시간 안에 안 나왔어요. 그래도 아직 끝은 아니에요.", color=WORD_CHAIN_COLOR)
        embed.add_field(name="대상", value=display_user(user_id), inline=True)
        embed.add_field(name="남은 기회", value=f"{remaining}/{max_life_for_user(session, user_id)}", inline=True)
        if session.current_required_char:
            embed.add_field(name="필요한 시작 글자", value=format_allowed_start_chars(session.current_required_char), inline=True)
        embed.set_footer(text="나비가 모래시계를 다시 뒤집었어요.")
        return embed

    def timeout_embed(self, session: RuntimeSession, user_id: str) -> discord.Embed:
        embed = discord.Embed(title="시간 초과", description="단어가 시간 안에 안 나왔어요.", color=WORD_CHAIN_COLOR)
        embed.add_field(name="탈락한 사람", value=display_user(user_id), inline=True)
        embed.add_field(name="사유", value="제한 시간 내에 단어를 제출하지 못했어요.", inline=False)
        embed.add_field(name="사용한 기회", value=f"{max_life_for_user(session, user_id)}/{max_life_for_user(session, user_id)}", inline=True)
        if session.current_required_char:
            embed.add_field(name="필요했던 시작 글자", value=format_allowed_start_chars(session.current_required_char), inline=True)
        embed.set_footer(text="단어가 도망가버렸어요…")
        return embed

    def waiting_embed(self, session: RuntimeSession) -> discord.Embed:
        embed = self.base_embed("끝말잇기 방이 열렸어요.\n참여할 사람은 아래 버튼으로 들어와 주세요.")
        embed.add_field(name="상태", value="모집 중", inline=True)
        embed.add_field(name="주최자", value=mention_user(session.host_user_id), inline=True)
        embed.add_field(name="참가자", value="\n".join(f"• {display_user(player.user_id)}" for player in session.players), inline=False)
        embed.add_field(
            name="규칙",
            value=f"• 명사만 인정해요.\n• 이미 나온 단어는 다시 쓸 수 없어요.\n• 두음법칙은 나비가 같이 봐드려요.\n• 기본 기회는 {MULTIPLAYER_LIFE}회예요.",
            inline=False,
        )
        navi_line = SOLO_WAITING_LINE if len(session.players) <= 1 else "인원이 모이면 주최자님이 시작 버튼을 눌러 주세요.\n단어로 살아남는 시간이에요."
        embed.add_field(name="나비", value=navi_line, inline=False)
        return embed

    def solo_empty_embed(self, session: RuntimeSession) -> discord.Embed:
        embed = self.base_embed("끝말잇기를 시작하려고 했지만,\n아직 다른 참가자가 없어요.")
        embed.add_field(name="상태", value="혼자 남은 방", inline=True)
        embed.add_field(name="참가자", value="\n".join(f"• {display_user(player.user_id)}" for player in session.players), inline=False)
        embed.add_field(name="나비", value=SOLO_EMPTY_LINE, inline=False)
        return embed

    def cancelled_embed(self, session: RuntimeSession) -> discord.Embed:
        embed = self.base_embed("주최자님이 끝말잇기 모집을 취소했어요.")
        embed.add_field(name="상태", value="취소됨", inline=True)
        embed.add_field(name="나비", value="아쉽지만 오늘의 단어놀이는 여기까지예요.\n의자는 다시 정리해둘게요.", inline=False)
        return embed

    def active_embed(self, session: RuntimeSession, *, navi_line: str | None = None) -> discord.Embed:
        if session.mode == "navi_duel":
            embed = self.base_embed("나비랑 1:1 끝말잇기가 진행 중이에요.")
            embed.add_field(name="상태", value="나비와 승부 중", inline=True)
            embed.add_field(name="상대", value="NAVI", inline=True)
            embed.add_field(name="난이도", value=clean_text(session.difficulty), inline=True)
        else:
            embed = self.base_embed("단어들이 이어지고 있어요.")
            embed.add_field(name="상태", value="진행 중", inline=True)
        embed.add_field(name="참가자 상태", value=self.participant_status_text(session), inline=False)
        if session.thread_id:
            embed.add_field(name="입력 위치", value=f"<#{session.thread_id}> 스레드에 단어를 채팅으로 입력해 주세요.", inline=False)
        embed.add_field(name="현재 차례", value=display_user(str(session.current_turn_user_id or "-")), inline=True)
        embed.add_field(name="다음 시작 글자", value=format_allowed_start_chars(session.current_required_char), inline=True)
        embed.add_field(name="제한 시간", value=f"{TURN_SECONDS}초", inline=True)
        if session.current_turn_user_id:
            embed.add_field(
                name="현재 차례 남은 기회",
                value=f"{remaining_life_for_user(session, session.current_turn_user_id)}/{max_life_for_user(session, session.current_turn_user_id)}",
                inline=True,
            )
        embed.add_field(name="사용된 단어", value=f"{len(session.used_words)}개", inline=True)
        if session.current_word:
            entry = self.store.get_word_entry(session.current_word)
            embed.add_field(name="현재 단어", value=f"`{clean_text(session.current_word)}`", inline=True)
            embed.add_field(name="뜻", value=f"[{word_pos_text(entry)}]\n{word_meaning_text(entry)}", inline=False)
        embed.add_field(name="나비", value=navi_line or "이번 글자는 좀 만만해 보이는데요.\n물론 방심하면 바로 막혀요.", inline=False)
        return embed

    def multiplayer_result_embed(self, session: RuntimeSession, ranked: list[PlayerState]) -> discord.Embed:
        winner = ranked[0] if ranked else None
        embed = self.base_embed("끝말잇기가 마무리됐어요.\n나비가 결과를 정리해봤어요.")
        embed.add_field(name="상태", value="끝났어요!", inline=True)
        embed.add_field(name="우승자", value=f"👑 {display_user(winner.user_id)}" if winner else "-", inline=False)
        lines = []
        for player in ranked:
            detail = "마지막까지 살아남음" if player.rank == 1 else "탈락"
            lines.append(f"{player.rank}. {display_user(player.user_id)} — {detail}")
        embed.add_field(name="결과", value="\n".join(lines) or "-", inline=False)
        embed.add_field(name="기록", value=self.record_text(session), inline=False)
        embed.add_field(name="나비", value="끝났어요.\n다음엔 더 이상한 단어가 나올지도 몰라요.", inline=False)
        return embed

    def navi_result_embed(self, session: RuntimeSession, *, navi_won: bool) -> discord.Embed:
        embed = self.base_embed("나비와의 끝말잇기가 끝났어요.")
        embed.add_field(name="상태", value="승부 종료", inline=True)
        embed.add_field(name="결과", value="NAVI 승리" if navi_won else f"{mention_user(session.host_user_id)} 승리", inline=False)
        embed.add_field(name="난이도", value=clean_text(session.difficulty), inline=True)
        embed.add_field(name="기록", value=self.record_text(session), inline=False)
        line = "이겼어요.\n나비가 귀여운 것과 별개로 단어도 좀 합니다." if navi_won else "졌어요.\n이건 나비가 봐준 게 아니라... 진짜로 진 거예요."
        embed.add_field(name="나비", value=line, inline=False)
        return embed

    def record_text(self, session: RuntimeSession) -> str:
        last_word = session.current_word or "-"
        return (
            f"• 사용된 단어: {len(session.used_words)}개\n"
            f"• 진행 시간: {elapsed_minutes(session.started_at, session.ended_at)}분\n"
            f"• 마지막 단어: {clean_text(last_word)}"
        )
