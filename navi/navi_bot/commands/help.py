from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..config import no_mentions


class HelpCommands(commands.Cog):
    help_group = app_commands.Group(name="도움", description="NEW NAVI 기능과 운영 명령을 안내합니다.")

    @help_group.command(name="시작", description="NEW NAVI에서 사용할 수 있는 기능을 확인합니다.")
    async def start(self, interaction: discord.Interaction) -> None:
        content = (
            "## NEW NAVI 도움\n"
            "캐릭터: `/호감도`, `/상태창`, `/배지목록`, `/대표배지`\n"
            "미니게임: `/나비식당`, `/끝말잇기`\n"
            "TLR: `/내국가`, `/경제`, `/연구요청`, `/내연구`, `/연구력추가투입`, `/내디시전`\n"
            "관리: `/관리자채널`, `/관리자역할`, `/대사채널`, `/블랙리스트`, `/나비상태`\n\n"
            "일반 채팅에서 `나비야`로 부르면 호감도·오너·특수 유저·배지·조건부 대사 기준에 맞춰 대답합니다.\n"
            "봇을 직접 멘션하면 하루 5회 AI 대화를 사용할 수 있어요. `@NAVI 기억해: 내용`으로 대표 관심사 키워드 세 개를 기억시킬 수 있습니다."
        )
        await interaction.response.send_message(content, ephemeral=True, allowed_mentions=no_mentions())
