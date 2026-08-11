from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..affection_system import build_affection_embed, affection_summary
from ..database import Database


class SocialCommands(commands.Cog):
    def __init__(self, bot: commands.Bot, db: Database) -> None:
        self.bot = bot
        self.db = db

    @app_commands.command(name="호감도", description="NAVI가 나 또는 지정 유저를 어떻게 보고 있는지 확인합니다.")
    async def affection(self, interaction: discord.Interaction, 유저: discord.User | None = None) -> None:
        target = 유저 or interaction.user
        summary = affection_summary(self.db, user_id=target.id)
        embed = build_affection_embed(user=target, summary=summary, guild=interaction.guild, bot=self.bot)
        await interaction.response.send_message(embed=embed, ephemeral=True)
