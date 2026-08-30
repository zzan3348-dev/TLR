from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
import random
import re
import time
from typing import Awaitable, Callable

import aiohttp


log = logging.getLogger(__name__)

OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it:free"
DEFAULT_FALLBACK_MODELS = (
    "google/gemma-4-26b-a4b-it:free",
    "z-ai/glm-5.2:free",
)
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
    fallback_used: bool
    fallbacks_tried: int
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
    """프롬프트나 secret을 포함하지 않는 최종 OpenRouter 오류."""

    def __init__(
        self,
        *,
        status_code: int | None,
        error_code: str,
        error_type: str,
        attempts: int,
        fallback_count: int,
    ) -> None:
        super().__init__("OpenRouter request failed")
        self.status_code = status_code
        self.error_code = error_code
        self.error_type = error_type
        self.attempts = attempts
        self.retry_count = max(0, attempts - 1)
        self.fallback_count = fallback_count
        self.diagnostic_logged = False


class NaviLLMClient:
    """OpenRouter chat/completions 어댑터와 제한 재시도 정책."""

    structured_logging = True

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_OPENROUTER_MODEL,
        fallback_models: tuple[str, ...] = DEFAULT_FALLBACK_MODELS,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.model = str(model or DEFAULT_OPENROUTER_MODEL).strip() or DEFAULT_OPENROUTER_MODEL
        unique_models = [self.model]
        for fallback in fallback_models[:2]:
            clean = str(fallback or "").strip()
            if clean and clean not in unique_models:
                unique_models.append(clean)
        if any(not model_id.endswith(":free") for model_id in unique_models[1:]):
            raise ValueError("NAVI OpenRouter fallback models must all be free model IDs")
        self.models = tuple(unique_models)
        self.timeout_seconds = max(10.0, float(timeout_seconds))
        self.max_tokens = max(1, int(max_tokens))
        self._session: aiohttp.ClientSession | None = None
        self._sleep: Callable[[float], Awaitable[None]] = asyncio.sleep
        self._jitter: Callable[[float, float], float] = random.uniform

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

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
                "[NAVI_LLM] result=failed user_id=%s guild_id=%s primary=%s status=%s "
                "attempts=%s retries=%s fallbacks_tried=%s fallback_used=false actual_model=none "
                "error_code=%s error_type=%s latency_ms=%s",
                user_id,
                guild_id,
                self.model,
                exc.status_code if exc.status_code is not None else "none",
                exc.attempts,
                exc.retry_count,
                exc.fallback_count,
                exc.error_code,
                exc.error_type,
                latency_ms,
            )
            raise

        latency_ms = int((time.monotonic() - started) * 1000)
        log.info(
            "[NAVI_LLM] result=success user_id=%s guild_id=%s primary=%s status=200 "
            "attempts=%s retries=%s fallbacks_tried=%s fallback_used=%s actual_model=%s "
            "last_status=%s last_error_code=%s last_error_type=%s latency_ms=%s",
            user_id,
            guild_id,
            self.model,
            result.attempts,
            result.retry_count,
            result.fallbacks_tried,
            str(result.fallback_used).lower(),
            result.actual_model,
            result.last_status if result.last_status is not None else "none",
            result.last_error_code,
            result.last_error_type,
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
        if not self.api_key:
            raise NaviLLMError(
                status_code=None,
                error_code="missing_api_key",
                error_type="configuration_error",
                attempts=0,
                fallback_count=len(self.models) - 1,
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
                fallback_index = _model_index(self.models, completion.actual_model)
                return NaviLLMResult(
                    text=completion.text,
                    actual_model=completion.actual_model,
                    attempts=attempt,
                    retry_count=attempt - 1,
                    fallback_used=fallback_index > 0,
                    fallbacks_tried=max(
                        fallback_index,
                        len(self.models) - 1 if last_failure is not None else 0,
                    ),
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
                "[NAVI_LLM] result=retry user_id=%s guild_id=%s primary=%s status=%s "
                "attempt=%s next_attempt=%s error_code=%s error_type=%s delay_ms=%s",
                user_id if user_id is not None else "none",
                guild_id if guild_id is not None else "none",
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
            fallback_count=len(self.models) - 1,
        )

    async def _request_once(
        self,
        *,
        system_prompt: str,
        message: str,
        max_tokens: int,
    ) -> NaviLLMCompletion:
        session = await self._get_session()
        payload = build_openrouter_payload(
            models=self.models,
            system_prompt=system_prompt,
            message=message,
            max_tokens=max_tokens,
        )
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
                if response.status != 200:
                    error_code, error_type = await _read_openrouter_error(response)
                    raise NaviLLMAttemptError(
                        status_code=response.status,
                        error_code=error_code,
                        error_type=error_type,
                        retryable=response.status in RETRYABLE_HTTP_STATUSES,
                    )
                try:
                    data = await response.json(content_type=None)
                except (aiohttp.ClientError, ValueError, TypeError) as exc:
                    raise NaviLLMAttemptError(
                        status_code=200,
                        error_code=type(exc).__name__,
                        error_type="invalid_json",
                        retryable=True,
                    ) from exc
        except NaviLLMAttemptError:
            raise
        except asyncio.TimeoutError as exc:
            raise NaviLLMAttemptError(
                status_code=None,
                error_code="request_timeout",
                error_type="timeout",
                retryable=True,
            ) from exc
        except aiohttp.ClientError as exc:
            raise NaviLLMAttemptError(
                status_code=None,
                error_code=type(exc).__name__,
                error_type="network_error",
                retryable=True,
            ) from exc
        return parse_openrouter_completion(data, primary_model=self.model)

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()


def build_openrouter_payload(
    *,
    models: tuple[str, ...],
    system_prompt: str,
    message: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict[str, object]:
    return {
        "models": list(models),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "temperature": 0.8,
        "max_tokens": int(max_tokens),
    }


def parse_openrouter_completion(data: object, *, primary_model: str) -> NaviLLMCompletion:
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


async def _read_openrouter_error(response: aiohttp.ClientResponse) -> tuple[str, str]:
    try:
        data = await response.json(content_type=None)
    except (aiohttp.ClientError, ValueError, TypeError):
        await response.read()
        data = None
    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        error_code = str(error.get("code") or response.status)
        error_type = str(error.get("type") or _http_error_type(response.status))
    else:
        error_code = str(response.status)
        error_type = _http_error_type(response.status)
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


def _model_index(models: tuple[str, ...], actual_model: str) -> int:
    normalized_actual = _normalize_model_id(actual_model)
    for index, model_id in enumerate(models):
        if _normalize_model_id(model_id) == normalized_actual:
            return index
    return 0


def _normalize_model_id(model_id: str) -> str:
    return str(model_id or "").removesuffix(":free")


def _complete_sentence_prefix(text: str) -> str:
    matches = list(re.finditer(r"[.!?。！？]+[\"'”’」』】)]*(?=\s|$)", str(text or "")))
    return str(text or "")[: matches[-1].end()].rstrip() if matches else ""
