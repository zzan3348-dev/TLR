from __future__ import annotations

import asyncio
import logging
import re

import aiohttp


log = logging.getLogger(__name__)

OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it:free"
DEFAULT_MAX_TOKENS = 400


class NaviLLMError(RuntimeError):
    """외부 LLM 오류를 Discord 응답과 분리하기 위한 내부 예외다."""


class NaviLLMClient:
    """OpenRouter의 OpenAI 호환 chat/completions API 어댑터."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_OPENROUTER_MODEL,
        timeout_seconds: float = 20.0,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.model = str(model or DEFAULT_OPENROUTER_MODEL).strip() or DEFAULT_OPENROUTER_MODEL
        self.timeout_seconds = float(timeout_seconds)
        self.max_tokens = max(1, int(max_tokens))
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def generate(self, *, system_prompt: str, message: str) -> str:
        if not self.api_key:
            raise NaviLLMError("OpenRouter API key is not configured")

        text, finish_reason = await self._request_once(
            system_prompt=system_prompt,
            message=message,
            max_tokens=self.max_tokens,
        )
        if finish_reason == "length":
            compact_prompt = (
                system_prompt
                + "\n\n답변을 처음부터 다시 작성하라. 1~3문장, 300자 이내로 끝내고 "
                "마지막 문장을 반드시 완성하라."
            )
            text, finish_reason = await self._request_once(
                system_prompt=compact_prompt,
                message=message,
                max_tokens=min(self.max_tokens, 300),
            )
        if finish_reason == "length":
            complete = _complete_sentence_prefix(text)
            if not complete:
                raise NaviLLMError("OpenRouter output ended before a complete sentence")
            return complete
        return text

    async def generate_reply(
        self,
        *,
        user_id: int,
        username: str,
        guild_id: int | None,
        system_prompt: str,
        message: str,
    ) -> str:
        # 식별자는 상위 서비스의 메타데이터 로그에만 쓰며 OpenRouter payload에는 넣지 않는다.
        _ = (user_id, username, guild_id)
        return await self.generate(system_prompt=system_prompt, message=message)

    async def _request_once(
        self,
        *,
        system_prompt: str,
        message: str,
        max_tokens: int,
    ) -> tuple[str, str]:
        session = await self._get_session()
        payload = build_openrouter_payload(
            model=self.model,
            system_prompt=system_prompt,
            message=message,
            max_tokens=max_tokens,
        )
        data: object | None = None
        for attempt in range(3):
            try:
                async with session.post(
                    OPENROUTER_CHAT_COMPLETIONS_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "X-Title": "TLR NEW NAVI",
                    },
                    json=payload,
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        break
                    await response.read()
                    retryable = response.status == 429 or response.status >= 500
                    if retryable and attempt < 2:
                        await asyncio.sleep(1.5 * (attempt + 1))
                        continue
                    raise NaviLLMError(f"OpenRouter HTTP {response.status}")
            except (aiohttp.ClientError, TimeoutError) as exc:
                if attempt < 2:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise NaviLLMError(type(exc).__name__) from exc
        if data is None:
            raise NaviLLMError("OpenRouter returned no response")

        try:
            choice = data["choices"][0]  # type: ignore[index]
            content = choice["message"]["content"]
            finish_reason = str(choice.get("finish_reason") or "")
        except (KeyError, IndexError, TypeError) as exc:
            raise NaviLLMError("OpenRouter returned no completion") from exc

        text = _content_text(content).strip()
        if not text:
            raise NaviLLMError("OpenRouter returned empty text")
        return text, finish_reason

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()


def build_openrouter_payload(
    *,
    model: str,
    system_prompt: str,
    message: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict[str, object]:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "temperature": 0.8,
        "max_tokens": int(max_tokens),
    }


def _content_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text") or "")
            for item in content
            if isinstance(item, dict) and item.get("type") in {None, "text"}
        )
    return ""


def _complete_sentence_prefix(text: str) -> str:
    matches = list(re.finditer(r"[.!?。！？]+[\"'”’」』】)]*(?=\s|$)", str(text or "")))
    return str(text or "")[: matches[-1].end()].rstrip() if matches else ""
