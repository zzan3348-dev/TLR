from __future__ import annotations

from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import sqlite3
import tempfile
from pathlib import Path
import unittest

from navi_bot.commands_word_chain import WordChainStore
from navi_bot.database import DEFAULT_GLOBAL_BADGES, Database
from navi_bot.navi_dialogues import (
    DIALOGUE_DATA_PATH,
    NAVI_DIALOGUE_DATA,
    NAVI_DIALOGUE_REACTIONS,
    NAVI_PROFILE_LINES,
)
from navi_bot.restaurant_render import render_restaurant_scene
from navi_bot.utils_time import now_kst, to_db_time


class NewDatabaseTests(unittest.TestCase):
    def test_fresh_database_has_only_navi_state(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            path = Path(directory) / "new_navi.sqlite3"
            database = Database(str(path))
            database.init_db()
            with closing(sqlite3.connect(path)) as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'",
                    )
                }
            forbidden = {
                "nations",
                "research_requests",
                "research_tasks",
                "decisions",
                "country_economies",
                "intelligence_operations",
            }
            self.assertFalse(tables & forbidden)
            self.assertIn("restaurant_profiles", tables)
            self.assertIn("word_chain_words", tables)
            self.assertIn("global_user_affection", tables)
            self.assertIn("llm_daily_usage", tables)
            self.assertIn("llm_user_keywords", tables)

    def test_llm_usage_is_global_persistent_daily_and_atomic(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            path = Path(directory) / "new-navi.sqlite3"
            database = Database(str(path))
            database.init_db()
            with ThreadPoolExecutor(max_workers=10) as executor:
                results = list(
                    executor.map(
                        lambda _: database.try_consume_llm_usage(100, usage_date="2026-08-23"),
                        range(10),
                    )
                )
            self.assertEqual(sum(1 for consumed, _ in results if consumed), 5)
            self.assertEqual(database.get_llm_daily_usage(100, usage_date="2026-08-23"), 5)
            self.assertEqual(database.try_consume_llm_usage(200, usage_date="2026-08-23"), (True, 1))

            restarted = Database(str(path))
            restarted.init_db()
            self.assertEqual(restarted.get_llm_daily_usage(100, usage_date="2026-08-23"), 5)
            self.assertEqual(restarted.try_consume_llm_usage(100, usage_date="2026-08-24"), (True, 1))
            self.assertEqual(restarted.refund_llm_usage(100, usage_date="2026-08-24"), 0)

    def test_llm_memory_keeps_two_keywords_per_user(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            database = Database(str(Path(directory) / "new-navi.sqlite3"))
            database.init_db()
            database.remember_llm_keyword(100, "민트초코 좋아함")
            database.remember_llm_keyword(100, "고양이 집사")
            result = database.remember_llm_keyword(100, "야간 활동")
            self.assertEqual(result["replaced"], "민트초코 좋아함")
            self.assertEqual(database.list_llm_keywords(100), ["야간 활동", "고양이 집사"])
            database.remember_llm_keyword(200, "별도 기억")
            self.assertEqual(database.list_llm_keywords(200), ["별도 기억"])
            self.assertTrue(database.forget_llm_keyword(100, "고양이 집사"))
            self.assertEqual(database.list_llm_keywords(100), ["야간 활동"])

    def test_maintenance_prunes_only_expired_temporary_data(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            path = Path(directory) / "new_navi.sqlite3"
            database = Database(str(path))
            database.init_db()
            now = now_kst()
            old_time = to_db_time(now - timedelta(days=45))
            current_time = to_db_time(now)
            old_date = (now.date() - timedelta(days=45)).isoformat()
            current_date = now.date().isoformat()
            with closing(sqlite3.connect(path)) as connection:
                connection.execute(
                    "INSERT INTO chat_message_claims(message_id,created_at) VALUES(?,?)",
                    (1, old_time),
                )
                connection.execute(
                    "INSERT INTO chat_message_claims(message_id,created_at) VALUES(?,?)",
                    (2, current_time),
                )
                connection.execute(
                    "INSERT INTO llm_daily_usage(user_id,usage_date,request_count,last_used_at) VALUES(?,?,?,?)",
                    (1, old_date, 3, old_time),
                )
                connection.execute(
                    "INSERT INTO llm_daily_usage(user_id,usage_date,request_count,last_used_at) VALUES(?,?,?,?)",
                    (2, current_date, 1, current_time),
                )
                connection.execute(
                    "INSERT INTO navi_safety_violations(user_id,guild_id,violation_type,created_at) VALUES(?,?,?,?)",
                    (1, None, "prompt_injection", old_time),
                )
                connection.execute(
                    "INSERT INTO navi_safety_violations(user_id,guild_id,violation_type,created_at) VALUES(?,?,?,?)",
                    (2, None, "prompt_injection", current_time),
                )
                connection.execute(
                    "INSERT INTO navi_llm_restrictions(user_id,restricted_until,reason,updated_at) VALUES(?,?,?,?)",
                    (1, old_time, "expired", old_time),
                )
                connection.execute(
                    "INSERT INTO global_user_affection(user_id,affection,created_at,updated_at) VALUES(?,?,?,?)",
                    (99, 777, old_time, old_time),
                )
                connection.commit()

            result = database.run_maintenance()

            self.assertEqual(result["deleted_claims"], 1)
            self.assertEqual(result["deleted_usage"], 1)
            self.assertEqual(result["deleted_safety"], 1)
            self.assertEqual(result["deleted_restrictions"], 1)
            with closing(sqlite3.connect(path)) as connection:
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM chat_message_claims").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM llm_daily_usage").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM navi_safety_violations").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM navi_llm_restrictions").fetchone()[0], 0)
                affection = connection.execute(
                    "SELECT affection FROM global_user_affection WHERE user_id=99",
                ).fetchone()[0]
            self.assertEqual(affection, 777)

    def test_static_word_asset_seeds_a_new_database(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            path = Path(directory) / "new_navi.sqlite3"
            database = Database(str(path))
            database.init_db()
            store = WordChainStore(database)
            store.ensure_seed_words()
            self.assertTrue(store.has_words())
            with closing(sqlite3.connect(path)) as connection:
                count = connection.execute("SELECT COUNT(*) FROM word_chain_words").fetchone()[0]
            self.assertGreater(count, 100)

    def test_tlr_dialogue_pack_is_utf8_and_has_no_lcw_routes(self) -> None:
        self.assertEqual(len(NAVI_DIALOGUE_DATA["reactions"]), 1200)
        self.assertEqual(len(NAVI_DIALOGUE_REACTIONS), 1200)
        self.assertTrue(NAVI_PROFILE_LINES)
        dialogue_text = repr(NAVI_DIALOGUE_REACTIONS)
        self.assertNotIn("LCW", dialogue_text)
        self.assertNotIn("discord.gg", dialogue_text)
        raw_dialogue_text = DIALOGUE_DATA_PATH.read_text(encoding="utf-8")
        for legacy_token in ("lovepoint", "loveloss", "lovelevel"):
            self.assertNotIn(legacy_token, raw_dialogue_text)

    def test_legacy_static_badge_titles_are_preserved_without_user_grants(self) -> None:
        badges = {badge["badge_key"]: badge for badge in DEFAULT_GLOBAL_BADGES}
        self.assertEqual(badges["navi_dad"]["name"], "NAVI 아빠")
        self.assertEqual(badges["staff_sponsor"]["name"], "관리진 후원자")
        self.assertEqual(badges["rps_master"]["name"], "가위바위보 사범님")
        self.assertIn("word_chain_master", badges)

    def test_restaurant_assets_render_from_the_new_project(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
            output = Path(directory) / "restaurant-preview.png"
            result = render_restaurant_scene(
                "backalley_shop",
                "customer_01_happy_young_man",
                output,
            )
            self.assertTrue(result.rendered)
            self.assertEqual(result.missing_assets, ())
            self.assertGreater(output.stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
