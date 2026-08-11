from __future__ import annotations

import asyncio
import logging

from dotenv import load_dotenv

from navi_bot.bot import run_bot
from navi_bot.config import Config


def main() -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(run_bot(Config.from_env()))


if __name__ == "__main__":
    main()
