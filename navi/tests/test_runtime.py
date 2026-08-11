from __future__ import annotations

import asyncio
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from navi_bot.bot import NaviBot
from navi_bot.affection_system import affection_score_text
from navi_bot.commands.social import SocialCommands
from navi_bot.commands.tlr import TlrCommands
from navi_bot.commands_restaurant import RestaurantCommands
from navi_bot.commands_word_chain import WordChainCommands
from navi_bot.config import Config
from navi_bot.chat_reactions import ChatReactionManager
from navi_bot.navi_emojis import EMOJI_ALIASES, EMOJI_FALLBACKS


class RuntimeTests(unittest.TestCase):
    def test_lcw_call_uses_the_new_text_without_an_invite_link(self) -> None:
        manager = ChatReactionManager(
            Path(__file__).parents[1] / "navi_bot" / "assets" / "chat_reactions.json",
            object(),
        )
        manager.load()
        message = SimpleNamespace(
            content="나비야 LCW",
            author=SimpleNamespace(id=123456789012345678, name="tester", display_name="tester"),
        )
        result = manager.evaluate_message(message, affection_level=1)
        self.assertIsNotNone(result)
        self.assertEqual(result.response, "음...좋은곳이였죠. 아마도요")
        self.assertNotIn("discord.gg", result.response)

    def test_awakening_image_is_packaged(self) -> None:
        image = Path(__file__).parents[1] / "navi_bot" / "assets" / "navi-awakening.png"
        self.assertTrue(image.is_file())
        self.assertGreater(image.stat().st_size, 1000)

    def test_affection_uses_one_unicode_heart_and_signed_numbers(self) -> None:
        self.assertEqual(affection_score_text(5), "❤️ +5")
        self.assertEqual(affection_score_text(0), "❤️ 0")
        self.assertEqual(affection_score_text(-5), "❤️ -5")
        legacy_keys = {
            key
            for key in (*EMOJI_ALIASES, *EMOJI_FALLBACKS)
            if key.startswith(("lovepoint", "loveloss", "lovelevel"))
        }
        self.assertEqual(legacy_keys, set())

    def test_all_new_slash_commands_register_without_conflicts(self) -> None:
        async def register() -> set[str]:
            with tempfile.TemporaryDirectory() as temp_dir:
                config = Config(
                    token="test-only",
                    application_id=1,
                    tlr_base_url="https://example.invalid",
                    tlr_service_token="x" * 32,
                    database_path=str(Path(temp_dir) / "new-navi.sqlite3"),
                )
                bot = NaviBot(config)
                bot.db.init_db()
                await bot.add_cog(TlrCommands(bot, bot.tlr, bot.db, config.tlr_base_url))
                await bot.add_cog(SocialCommands(bot, bot.db))
                await bot.add_cog(RestaurantCommands(bot, bot.db, config))
                await bot.add_cog(WordChainCommands(bot, bot.db))
                names = {command.name for command in bot.tree.get_commands()}
                await bot.close()
                return names

        registered = asyncio.run(register())
        self.assertEqual(
            registered,
            {
                "경제",
                "끝말잇기",
                "나비식당",
                "내국가",
                "내디시전",
                "내연구",
                "대표배지",
                "배지목록",
                "상태창",
                "연구심사",
                "연구요청",
                "연구력추가투입",
                "호감도",
            },
        )
        self.assertNotIn("연구추가투입", registered)


if __name__ == "__main__":
    unittest.main()
