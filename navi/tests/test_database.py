from __future__ import annotations

from contextlib import closing
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
