from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
from typing import Any
import uuid

import aiohttp


@dataclass(frozen=True)
class TlrApiError(RuntimeError):
    code: str
    status: int

    def __str__(self) -> str:
        return self.code


class TlrClient:
    def __init__(self, base_url: str, service_token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_token = service_token
        self._session: aiohttp.ClientSession | None = None

    async def start(self) -> None:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=20)
            self._session = aiohttp.ClientSession(timeout=timeout)

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _request(
        self,
        method: str,
        route: str,
        *,
        discord_user_id: int | str | None = None,
        payload: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        await self.start()
        assert self._session is not None
        headers = {"Authorization": f"Bearer {self.service_token}"}
        if discord_user_id is not None:
            headers["X-Discord-User-Id"] = str(discord_user_id)
        try:
            async with self._session.request(
                method,
                f"{self.base_url}/api/navi/{route}",
                headers=headers,
                json=payload,
                params=params,
            ) as response:
                raw_body = await response.text()
                try:
                    data = json.loads(raw_body)
                except (json.JSONDecodeError, UnicodeDecodeError) as error:
                    raise TlrApiError("TLR_INVALID_RESPONSE", response.status) from error
                if not isinstance(data, dict):
                    raise TlrApiError("TLR_INVALID_RESPONSE", response.status)
                if not response.ok:
                    raise TlrApiError(str(data.get("error") or "TLR_REQUEST_FAILED"), response.status)
                return data
        except TlrApiError:
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError) as error:
            raise TlrApiError("TLR_UNAVAILABLE", 0) from error

    async def me(self, discord_user_id: int) -> dict[str, Any]:
        return await self._request("GET", "me", discord_user_id=discord_user_id)

    async def research(self, discord_user_id: int) -> dict[str, Any]:
        return await self._request("GET", "research", discord_user_id=discord_user_id)

    async def submit_research(self, discord_user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "research", discord_user_id=discord_user_id, payload=payload)

    async def preview_investment(self, discord_user_id: int, project_id: str, amount: float) -> dict[str, Any]:
        return await self._request(
            "POST", "research-investments", discord_user_id=discord_user_id,
            payload={"action": "PREVIEW", "projectId": project_id, "amount": amount},
        )

    async def confirm_investment(
        self,
        discord_user_id: int,
        project_id: str,
        amount: float,
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST", "research-investments", discord_user_id=discord_user_id,
            payload={
                "action": "CONFIRM",
                "projectId": project_id,
                "amount": amount,
                "idempotencyKey": idempotency_key or f"navi:{discord_user_id}:{uuid.uuid4()}",
            },
        )

    async def admin_research(self, discord_user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "admin-research", discord_user_id=discord_user_id, payload=payload)

    async def economy(self, discord_user_id: int) -> dict[str, Any]:
        return await self._request("GET", "economy", discord_user_id=discord_user_id)

    async def decisions(self, discord_user_id: int) -> dict[str, Any]:
        return await self._request("GET", "decisions", discord_user_id=discord_user_id)

    async def events(self, after: int) -> dict[str, Any]:
        return await self._request("GET", "events", params={"after": str(after)})

    async def latest_event_cursor(self) -> dict[str, Any]:
        return await self._request("GET", "events", params={"latest": "true"})
