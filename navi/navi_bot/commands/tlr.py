from __future__ import annotations

from typing import Any
import uuid

import discord
from discord import app_commands
from discord.ext import commands

from ..affection_system import affection_score_text, affection_summary
from ..database import Database
from ..tlr_client import TlrApiError, TlrClient

STATUS_LABELS = {
    "SUBMITTED": "심사 대기",
    "UNDER_REVIEW": "심사 중",
    "APPROVED": "승인·자금 대기",
    "ACTIVE": "진행 중",
    "REJECTED": "반려",
    "COMPLETED": "완료",
    "CANCELLED": "취소",
}


def value(data: dict[str, Any] | None, key: str, fallback: str = "-") -> str:
    if not data or data.get(key) is None:
        return fallback
    raw = data[key]
    return f"{raw:,.2f}" if isinstance(raw, float) else f"{raw:,}" if isinstance(raw, int) else str(raw)


def error_text(error: TlrApiError) -> str:
    return {
        "TLR_PROFILE_NOT_LINKED": "TLR 사이트에서 Discord 로그인을 먼저 완료해 주세요.",
        "COUNTRY_OWNERSHIP_REQUIRED": "현재 배정된 TLR 국가가 없습니다.",
        "PLAY_ACCESS_BLOCKED": "TLR 플레이 접근이 제한된 계정입니다.",
        "TLR_ADMIN_PERMISSION_REQUIRED": "Discord 역할과 별개로 TLR NAVI 관리자 등록이 필요합니다.",
        "INSUFFICIENT_RESEARCH_POINTS": "연구력이 부족합니다.",
        "RESEARCH_PROJECT_NOT_ACTIVE": "진행 중인 연구만 추가 투입할 수 있습니다.",
        "RESEARCH_PROJECT_NOT_FOUND": "내 국가의 연구를 찾지 못했습니다.",
    }.get(error.code, f"TLR 요청 실패: `{error.code}`")


class InvestmentConfirmView(discord.ui.View):
    def __init__(self, client: TlrClient, user_id: int, project_id: str, amount: float) -> None:
        super().__init__(timeout=120)
        self.client = client
        self.user_id = user_id
        self.project_id = project_id
        self.amount = amount
        self.idempotency_key = f"navi:{user_id}:{uuid.uuid4()}"

    @discord.ui.button(label="확정", style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("요청한 사용자만 확정할 수 있습니다.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            result = await self.client.confirm_investment(
                self.user_id,
                self.project_id,
                self.amount,
                idempotency_key=self.idempotency_key,
            )
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        for item in self.children:
            item.disabled = True
        await interaction.edit_original_response(view=self)
        await interaction.followup.send(
            f"추가 투입이 반영되었습니다. 새 완료일: `{result.get('scheduledCompletionWorldDate', '-')}`",
            ephemeral=True,
        )

    @discord.ui.button(label="취소", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("요청한 사용자만 취소할 수 있습니다.", ephemeral=True)
            return
        for item in self.children:
            item.disabled = True
        await interaction.response.edit_message(content="연구력 추가 투입을 취소했습니다.", embed=None, view=self)


class StatusView(discord.ui.View):
    def __init__(self, user_id: int, pages: list[discord.Embed]) -> None:
        super().__init__(timeout=180)
        self.user_id = user_id
        self.pages = pages

    async def show(self, interaction: discord.Interaction, index: int) -> None:
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("본인의 상태창만 조작할 수 있습니다.", ephemeral=True)
            return
        await interaction.response.edit_message(embed=self.pages[index], view=self)

    @discord.ui.button(label="국가", style=discord.ButtonStyle.primary)
    async def country(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.show(interaction, 0)

    @discord.ui.button(label="NAVI", style=discord.ButtonStyle.secondary)
    async def navi(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.show(interaction, 1)

    @discord.ui.button(label="배지", style=discord.ButtonStyle.secondary)
    async def badges(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.show(interaction, 2)


class TlrCommands(commands.Cog):
    def __init__(self, bot: commands.Bot, client: TlrClient, db: Database, base_url: str) -> None:
        self.bot = bot
        self.client = client
        self.db = db
        self.base_url = base_url.rstrip("/")

    @app_commands.command(name="내국가", description="TLR에서 현재 플레이 국가를 조회합니다.")
    async def my_country(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            data = await self.client.me(interaction.user.id)
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        country, economy = data["country"], data.get("economy")
        embed = discord.Embed(title=country["name"], description=f"세계일: `{data['worldDate']}`", color=0x68A8FF)
        embed.add_field(name="국가 ID", value=f"`{country['key']}`")
        embed.add_field(name="연구력", value=value(economy, "research_points"))
        embed.add_field(name="진행 중 연구", value=str(len(data.get("activeResearch", []))))
        if country.get("flagPath"):
            embed.set_thumbnail(url=f"{self.base_url}{country['flagPath']}")
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="TLR에서 자세히 보기", url=f"{self.base_url}{country['playPath']}"))
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

    @app_commands.command(name="연구요청", description="내 TLR 국가의 새 연구를 요청합니다.")
    @app_commands.describe(연구명="연구 이름", 연구내용="연구 설명", 연구목표="달성 목표", 연구분야="general/industry/military/society", 최초투입연구력="승인 시 투입할 연구력")
    async def research_request(
        self, interaction: discord.Interaction, 연구명: str, 연구내용: str,
        연구목표: str, 연구분야: str, 최초투입연구력: app_commands.Range[float, 1, 1_000_000],
    ) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            result = await self.client.submit_research(interaction.user.id, {
                "title": 연구명,
                "description": 연구내용,
                "objective": 연구목표,
                "categoryId": 연구분야.lower(),
                "prerequisites": "",
                "initialInvestment": float(최초투입연구력),
                "idempotencyKey": f"navi:submission:{interaction.id}",
            })
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        await interaction.followup.send(f"연구 요청이 접수되었습니다. ID: `{result['projectId']}`", ephemeral=True)

    @app_commands.command(name="내연구", description="TLR 연구 요청과 진행 상황을 조회합니다.")
    async def my_research(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            data = await self.client.research(interaction.user.id)
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        embed = discord.Embed(title="TLR 연구 현황", description=f"연구력 `{data['balance']:,.0f}` · 세계일 `{data['worldDate']}`", color=0x68A8FF)
        projects = data.get("projects", [])[:10]
        if not projects:
            embed.add_field(name="연구", value="등록된 연구가 없습니다.", inline=False)
        for project in projects:
            status = STATUS_LABELS.get(project["status"], project["status"])
            embed.add_field(
                name=f"{project['title']} · {status}",
                value=f"ID `{project['id']}`\n완료일 `{project.get('scheduled_completion_world_date') or '-'}`",
                inline=False,
            )
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="연구력추가투입", description="TLR 서버 계산 결과를 미리 본 뒤 연구력을 추가 투입합니다.")
    async def invest(self, interaction: discord.Interaction, 연구_id: str, 연구력: app_commands.Range[float, 1, 1_000_000]) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            data = await self.client.preview_investment(interaction.user.id, 연구_id, float(연구력))
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        preview = data["preview"]
        embed = discord.Embed(title="추가 연구력 투입 미리보기", color=0xF59E0B)
        embed.add_field(name="현재 완료일", value=preview["currentCompletionDate"])
        embed.add_field(name="투입 후 완료일", value=preview["projectedCompletionDate"])
        embed.add_field(name="단축", value=f"{preview['daysSaved']:,}일")
        embed.add_field(
            name="연구력",
            value=f"{preview['balanceBefore']:,.0f} → {preview['balanceAfter']:,.0f}",
        )
        await interaction.followup.send(
            embed=embed,
            view=InvestmentConfirmView(self.client, interaction.user.id, 연구_id, float(연구력)),
            ephemeral=True,
        )

    @app_commands.command(name="연구심사", description="TLR 권한을 다시 확인한 뒤 연구를 승인·반려합니다.")
    @app_commands.choices(작업=[
        app_commands.Choice(name="승인", value="APPROVE"),
        app_commands.Choice(name="반려", value="REJECT"),
        app_commands.Choice(name="취소", value="CANCEL"),
        app_commands.Choice(name="즉시완료", value="FORCE_COMPLETE"),
    ])
    async def admin_review(
        self, interaction: discord.Interaction, 작업: app_commands.Choice[str], 연구_id: str,
        기간_일: app_commands.Range[int, 1, 3650] | None = None, 메모: str = "",
    ) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        payload: dict[str, Any] = {"action": 작업.value, "projectId": 연구_id, "note": 메모}
        if 기간_일 is not None:
            payload["durationDays"] = 기간_일
        try:
            result = await self.client.admin_research(interaction.user.id, payload)
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        await interaction.followup.send(f"연구 심사 결과: `{result.get('status', 'OK')}`", ephemeral=True)

    @app_commands.command(name="경제", description="TLR에서 내 국가 경제 현황을 조회합니다.")
    async def economy(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            data = await self.client.economy(interaction.user.id)
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        economy = data.get("economy")
        embed = discord.Embed(title="TLR 경제 현황", description=f"세계일 `{data['worldDate']}` · `{data['readiness']}`", color=0x10B981)
        for label, key in (("GDP", "gdp"), ("성장률", "nominal_growth_rate"), ("물가상승률", "inflation_rate"), ("실업률", "unemployment_rate")):
            embed.add_field(name=label, value=value(economy, key))
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="내디시전", description="TLR의 내 국가 디시전 현황을 조회합니다.")
    async def decisions(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            data = await self.client.decisions(interaction.user.id)
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        await interaction.followup.send(data.get("message") or "현재 디시전이 없습니다.", ephemeral=True)

    @app_commands.command(name="상태창", description="TLR 국가, NAVI 관계, 배지 장식장을 확인합니다.")
    async def status(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            data = await self.client.me(interaction.user.id)
        except TlrApiError as error:
            await interaction.followup.send(error_text(error), ephemeral=True)
            return
        summary = affection_summary(self.db, user_id=interaction.user.id)
        badge_profile = self.db.get_user_badge_profile(interaction.user.id)
        country, economy = data["country"], data.get("economy")
        country_page = discord.Embed(title=country["name"], description=f"TLR 국가 · 세계일 {data['worldDate']}", color=0x68A8FF)
        country_page.add_field(name="연구력", value=value(economy, "research_points"))
        country_page.add_field(name="진행 연구", value=str(len(data.get("activeResearch", []))))
        relation_page = discord.Embed(title="NAVI 관계", color=0xEC4899)
        relation_page.add_field(
            name="호감도",
            value=affection_score_text(int((summary.get("profile") or {}).get("affection", 0))),
        )
        relation_page.add_field(
            name="식당 오늘 획득",
            value=affection_score_text(int(summary.get("restaurant_daily_affection_gain", 0))),
        )
        badges = badge_profile["badges"]
        badge_page = discord.Embed(title="배지 장식장", description="\n".join(f"{badge.get('icon') or '🏷️'} {badge['name']}" for badge in badges) or "보유 배지가 없습니다.", color=0x8B5CF6)
        pages = [country_page, relation_page, badge_page]
        await interaction.followup.send(embed=pages[0], view=StatusView(interaction.user.id, pages), ephemeral=True)

    @app_commands.command(name="배지목록", description="NAVI 전역 배지 목록을 확인합니다.")
    async def badge_list(self, interaction: discord.Interaction) -> None:
        badges = self.db.list_global_badges()
        text = "\n".join(f"{badge.get('icon') or '🏷️'} **{badge['name']}** · `{badge['badge_key']}`" for badge in badges)
        await interaction.response.send_message(text or "등록된 배지가 없습니다.", ephemeral=True)

    @app_commands.command(name="대표배지", description="보유 배지 중 대표 배지를 설정합니다.")
    async def active_badge(self, interaction: discord.Interaction, 배지_key: str) -> None:
        result = self.db.set_active_badge(user_id=interaction.user.id, badge_key=배지_key)
        message = "대표 배지를 설정했습니다." if result.ok else "보유하지 않은 배지입니다."
        await interaction.response.send_message(message, ephemeral=True)
