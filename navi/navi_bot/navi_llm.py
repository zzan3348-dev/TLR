from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
import random
import re
import time
from typing import Awaitable, Callable

from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI


log = logging.getLogger(__name__)

AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1"
AI_GATEWAY_CHAT_COMPLETIONS_URL = f"{AI_GATEWAY_BASE_URL}/chat/completions"
DEFAULT_AI_GATEWAY_MODEL = "google/gemma-4-31b-it"
DEFAULT_MAX_TOKENS = 400
DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_ATTEMPTS = 3
RETRYABLE_HTTP_STATUSES = frozenset({408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524})


@dataclass(frozen=True)
class NaviLLMCompletion:
    text: str
    finish_reason: str
    actual_model: str


@dataclass(frozen=True)
class NaviLLMResult:
    text: str
    actual_model: str
    attempts: int
    retry_count: int
    last_status: int | None = None
    last_error_code: str = "none"
    last_error_type: str = "none"


class NaviLLMAttemptError(RuntimeError):
    def __init__(
        self,
        *,
        status_code: int | None,
        error_code: str,
        error_type: str,
        retryable: bool,
    ) -> None:
        super().__init__(error_type)
        self.status_code = status_code
        self.error_code = error_code
        self.error_type = error_type
        self.retryable = retryable


class NaviLLMError(RuntimeError):
    """프롬프트나 secret을 포함하지 않는 최종 AI Gateway 오류."""

    def __init__(
        self,
        *,
        status_code: int | None,
        error_code: str,
        error_type: str,
        attempts: int,
    ) -> None:
        super().__init__("Vercel AI Gateway request failed")
        self.status_code = status_code
        self.error_code = error_code
        self.error_type = error_type
        self.attempts = attempts
        self.retry_count = max(0, attempts - 1)
        self.diagnostic_logged = False


class NaviLLMClient:
    """Vercel AI Gateway chat/completions 어댑터와 제한 재시도 정책."""

    structured_logging = True

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_AI_GATEWAY_MODEL,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.model = str(model or DEFAULT_AI_GATEWAY_MODEL).strip() or DEFAULT_AI_GATEWAY_MODEL
        self.timeout_seconds = max(10.0, float(timeout_seconds))
        self.max_tokens = max(1, int(max_tokens))
        self._client: AsyncOpenAI | None = None
        self._sleep: Callable[[float], Awaitable[None]] = asyncio.sleep
        self._jitter: Callable[[float, float], float] = random.uniform

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=AI_GATEWAY_BASE_URL,
                timeout=self.timeout_seconds,
                max_retries=0,
            )
        return self._client

    async def generate(self, *, system_prompt: str, message: str) -> str:
        result = await self._generate_with_retries(system_prompt=system_prompt, message=message)
        return result.text

    async def generate_reply(
        self,
        *,
        user_id: int,
        username: str,
        guild_id: int | None,
        system_prompt: str,
        message: str,
    ) -> str:
        _ = username
        started = time.monotonic()
        try:
            result = await self._generate_with_retries(
                system_prompt=system_prompt,
                message=message,
                user_id=user_id,
                guild_id=guild_id,
            )
        except NaviLLMError as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            exc.diagnostic_logged = True
            log.error(
                "[NAVI_LLM] result=failed model=%s status=%s attempts=%s retries=%s "
                "error_code=%s error_type=%s latency_ms=%s",
                self.model,
                exc.status_code if exc.status_code is not None else "none",
                exc.attempts,
                exc.retry_count,
                exc.error_code,
                exc.error_type,
                latency_ms,
            )
            raise

        latency_ms = int((time.monotonic() - started) * 1000)
        log.info(
            "[NAVI_LLM] result=success actual_model=%s latency_ms=%s",
            result.actual_model,
            latency_ms,
        )
        return result.text

    async def _generate_with_retries(
        self,
        *,
        system_prompt: str,
        message: str,
        user_id: int | None = None,
        guild_id: int | None = None,
    ) -> NaviLLMResult:
        _ = (user_id, guild_id)
        if not self.api_key:
            raise NaviLLMError(
                status_code=None,
                error_code="missing_api_key",
                error_type="configuration_error",
                attempts=0,
            )

        deadline = time.monotonic() + self.timeout_seconds
        last_failure: NaviLLMAttemptError | None = None
        attempts_made = 0
        for attempt in range(1, MAX_ATTEMPTS + 1):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                last_failure = NaviLLMAttemptError(
                    status_code=None,
                    error_code="total_timeout",
                    error_type="timeout",
                    retryable=True,
                )
                break
            attempts_made = attempt
            attempt_timeout = min(12.0, remaining)
            try:
                completion = await asyncio.wait_for(
                    self._request_once(
                        system_prompt=system_prompt,
                        message=message,
                        max_tokens=self.max_tokens,
                    ),
                    timeout=attempt_timeout,
                )
            except asyncio.TimeoutError:
                failure = NaviLLMAttemptError(
                    status_code=None,
                    error_code="attempt_timeout",
                    error_type="timeout",
                    retryable=True,
                )
            except NaviLLMAttemptError as exc:
                failure = exc
            else:
                return NaviLLMResult(
                    text=completion.text,
                    actual_model=completion.actual_model,
                    attempts=attempt,
                    retry_count=attempt - 1,
                    last_status=last_failure.status_code if last_failure else None,
                    last_error_code=last_failure.error_code if last_failure else "none",
                    last_error_type=last_failure.error_type if last_failure else "none",
                )

            last_failure = failure
            if not failure.retryable or attempt >= MAX_ATTEMPTS:
                break
            delay = (1.0 if attempt == 1 else 2.1) * self._jitter(0.85, 1.15)
            if time.monotonic() + delay >= deadline:
                break
            log.warning(
                "[NAVI_LLM] result=retry model=%s status=%s "
                "attempt=%s next_attempt=%s error_code=%s error_type=%s delay_ms=%s",
                self.model,
                failure.status_code if failure.status_code is not None else "none",
                attempt,
                attempt + 1,
                failure.error_code,
                failure.error_type,
                int(delay * 1000),
            )
            await self._sleep(delay)

        failure = last_failure or NaviLLMAttemptError(
            status_code=None,
            error_code="unknown",
            error_type="unknown_error",
            retryable=False,
        )
        raise NaviLLMError(
            status_code=failure.status_code,
            error_code=failure.error_code,
            error_type=failure.error_type,
            attempts=attempts_made,
        )

    async def _request_once(
        self,
        *,
        system_prompt: str,
        message: str,
        max_tokens: int,
    ) -> NaviLLMCompletion:
        client = self._get_client()
        payload = build_ai_gateway_payload(
            model=self.model,
            system_prompt=system_prompt,
            message=message,
            max_tokens=max_tokens,
        )
        try:
            response = await client.chat.completions.create(**payload)
        except APITimeoutError as exc:
            raise NaviLLMAttemptError(
                status_code=None,
                error_code="request_timeout",
                error_type="timeout",
                retryable=True,
            ) from exc
        except APIStatusError as exc:
            status_code = int(exc.status_code)
            error_code, error_type = _read_ai_gateway_error(status_code, exc.body)
            raise NaviLLMAttemptError(
                status_code=status_code,
                error_code=error_code,
                error_type=error_type,
                retryable=status_code in RETRYABLE_HTTP_STATUSES,
            ) from exc
        except APIConnectionError as exc:
            raise NaviLLMAttemptError(
                status_code=None,
                error_code=type(exc).__name__,
                error_type="network_error",
                retryable=True,
            ) from exc
        data = response.model_dump(mode="json")
        return parse_ai_gateway_completion(data, primary_model=self.model)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()


def build_ai_gateway_payload(
    *,
    model: str,
    system_prompt: str,
    message: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict[str, object]:
    return {
        "model": str(model),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "temperature": 0.8,
        "max_tokens": int(max_tokens),
    }


def parse_ai_gateway_completion(data: object, *, primary_model: str) -> NaviLLMCompletion:
    if not isinstance(data, dict):
        raise _invalid_response("invalid_response")
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise _invalid_response("empty_choices")
    choice = choices[0]
    if not isinstance(choice, dict):
        raise _invalid_response("invalid_choice")
    message = choice.get("message")
    if not isinstance(message, dict):
        raise _invalid_response("missing_message")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise _invalid_response("empty_content")

    text = content.strip()
    finish_reason = str(choice.get("finish_reason") or "")
    if finish_reason == "length":
        complete = _complete_sentence_prefix(text)
        if not complete:
            raise _invalid_response("truncated_output")
        text = complete
    actual_model = str(data.get("model") or primary_model).strip() or primary_model
    return NaviLLMCompletion(text=text, finish_reason=finish_reason, actual_model=actual_model)


def _read_ai_gateway_error(status_code: int, body: object) -> tuple[str, str]:
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        error_code = str(error.get("code") or status_code)
        error_type = str(error.get("type") or _http_error_type(status_code))
    else:
        error_code = str(status_code)
        error_type = _http_error_type(status_code)
    return error_code[:80], error_type[:80]


def _http_error_type(status: int) -> str:
    return {
        400: "bad_request",
        401: "authentication_error",
        402: "credit_error",
        404: "model_not_found",
        408: "request_timeout",
        429: "rate_limit",
        500: "provider_internal_error",
        502: "bad_gateway",
        503: "provider_unavailable",
        504: "gateway_timeout",
    }.get(int(status), "provider_error" if int(status) >= 500 else "http_error")


def _invalid_response(error_type: str) -> NaviLLMAttemptError:
    return NaviLLMAttemptError(
        status_code=200,
        error_code=error_type,
        error_type=error_type,
        retryable=True,
    )


def _complete_sentence_prefix(text: str) -> str:
    matches = list(re.finditer(r"[.!?。！？]+[\"'”’」』】)]*(?=\s|$)", str(text or "")))
    return str(text or "")[: matches[-1].end()].rstrip() if matches else ""
