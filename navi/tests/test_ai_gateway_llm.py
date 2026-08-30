from __future__ import annotations

import asyncio
from pathlib import Path
import tempfile
import unittest

from navi_bot.database import Database
from navi_bot.llm_chat import LLMChatService
from navi_bot.navi_llm import (
    AI_GATEWAY_CHAT_COMPLETIONS_URL,
    DEFAULT_AI_GATEWAY_MODEL,
    NaviLLMAttemptError,
    NaviLLMClient,
    NaviLLMCompletion,
    NaviLLMError,
    _http_error_type,
    build_ai_gateway_payload,
    parse_ai_gateway_completion,
)


def completion(text: str = "네에, 정상 작동 중이에요!", model: str = DEFAULT_AI_GATEWAY_MODEL) -> NaviLLMCompletion:
    return NaviLLMCompletion(text=text, finish_reason="stop", actual_model=model)


def failure(status: int | None, error_type: str, *, retryable: bool) -> NaviLLMAttemptError:
    return NaviLLMAttemptError(
        status_code=status,
        error_code=str(status or error_type),
        error_type=error_type,
        retryable=retryable,
    )


class SequenceClient(NaviLLMClient):
    def __init__(self, outcomes: list[NaviLLMCompletion | NaviLLMAttemptError]) -> None:
        super().__init__(api_key="test", timeout_seconds=30)
        self.outcomes = list(outcomes)
        self.calls = 0
        self.delays: list[float] = []
        self._jitter = lambda _start, _end: 1.0

        async def no_sleep(delay: float) -> None:
            self.delays.append(delay)

        self._sleep = no_sleep

    async def _request_once(
        self,
        *,
        system_prompt: str,
        message: str,
        max_tokens: int,
    ) -> NaviLLMCompletion:
        _ = (system_prompt, message, max_tokens)
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, NaviLLMAttemptError):
            raise outcome
        return outcome


class AIGatewayLLMTests(unittest.TestCase):
    def test_http_statuses_have_distinct_diagnostic_types(self) -> None:
        self.assertEqual(
            {status: _http_error_type(status) for status in (401, 402, 404, 408, 429, 500, 502, 503)},
            {
                401: "authentication_error",
                402: "credit_error",
                404: "model_not_found",
                408: "request_timeout",
                429: "rate_limit",
                500: "provider_internal_error",
                502: "bad_gateway",
                503: "provider_unavailable",
            },
        )

    def test_payload_uses_one_vercel_gateway_model_without_fallback_array(self) -> None:
        payload = build_ai_gateway_payload(
            model=DEFAULT_AI_GATEWAY_MODEL,
            system_prompt="너는 NAVI다.",
            message="안녕",
        )
        self.assertEqual(AI_GATEWAY_CHAT_COMPLETIONS_URL, "https://ai-gateway.vercel.sh/v1/chat/completions")
        self.assertEqual(payload["model"], "google/gemma-4-31b-it")
        self.assertEqual(payload["max_tokens"], 400)
        self.assertNotIn("models", payload)
        self.assertNotIn("provider", payload)

    def test_normal_primary_completion(self) -> None:
        async def exercise() -> tuple[str, int, str]:
            client = SequenceClient([completion()])
            result = await client._generate_with_retries(system_prompt="NAVI", message="안녕")
            return result.text, result.attempts, result.actual_model

        text, attempts, actual_model = asyncio.run(exercise())
        self.assertEqual(text, "네에, 정상 작동 중이에요!")
        self.assertEqual(attempts, 1)
        self.assertEqual(actual_model, DEFAULT_AI_GATEWAY_MODEL)

    def test_success_log_contains_only_actual_model_and_latency_details(self) -> None:
        async def exercise() -> str:
            client = SequenceClient([completion()])
            with self.assertLogs("navi_bot.navi_llm", level="INFO") as captured:
                await client.generate_reply(
                    user_id=123,
                    username="tester",
                    guild_id=456,
                    system_prompt="비공개 시스템 프롬프트",
                    message="비공개 사용자 메시지",
                )
            return "\n".join(captured.output)

        output = asyncio.run(exercise())
        self.assertIn("actual_model=google/gemma-4-31b-it", output)
        self.assertIn("latency_ms=", output)
        self.assertNotIn("user_id", output)
        self.assertNotIn("guild_id", output)
        self.assertNotIn("비공개", output)

    def test_timeout_is_retried_with_backoff(self) -> None:
        async def exercise() -> tuple[int, list[float]]:
            client = SequenceClient([failure(None, "timeout", retryable=True), completion()])
            await client.generate(system_prompt="NAVI", message="안녕")
            return client.calls, client.delays

        calls, delays = asyncio.run(exercise())
        self.assertEqual(calls, 2)
        self.assertEqual(delays, [1.0])

    def test_429_retries_same_gateway_model(self) -> None:
        async def exercise() -> tuple[int, int, str]:
            client = SequenceClient(
                [
                    failure(429, "rate_limit", retryable=True),
                    completion(),
                ]
            )
            result = await client._generate_with_retries(system_prompt="NAVI", message="안녕")
            return client.calls, result.retry_count, result.actual_model

        calls, retries, actual_model = asyncio.run(exercise())
        self.assertEqual((calls, retries), (2, 1))
        self.assertEqual(actual_model, DEFAULT_AI_GATEWAY_MODEL)

    def test_502_and_503_are_retried_through_gateway(self) -> None:
        for status, error_type in ((502, "bad_gateway"), (503, "provider_unavailable")):
            with self.subTest(status=status):
                async def exercise() -> tuple[int, str]:
                    client = SequenceClient(
                        [
                            failure(status, error_type, retryable=True),
                            completion(),
                        ]
                    )
                    result = await client._generate_with_retries(system_prompt="NAVI", message="안녕")
                    return client.calls, result.actual_model

                self.assertEqual(asyncio.run(exercise()), (2, DEFAULT_AI_GATEWAY_MODEL))

    def test_nonretryable_http_errors_stop_after_one_attempt(self) -> None:
        for status, error_type in (
            (400, "bad_request"),
            (401, "authentication_error"),
            (402, "credit_error"),
            (404, "model_not_found"),
        ):
            with self.subTest(status=status):
                async def exercise() -> tuple[int, int, int | None]:
                    client = SequenceClient([failure(status, error_type, retryable=False)])
                    with self.assertRaises(NaviLLMError) as raised:
                        await client.generate(system_prompt="NAVI", message="안녕")
                    return client.calls, raised.exception.attempts, raised.exception.status_code

                self.assertEqual(asyncio.run(exercise()), (1, 1, status))

    def test_empty_choices_is_a_retryable_failure(self) -> None:
        with self.assertRaises(NaviLLMAttemptError) as raised:
            parse_ai_gateway_completion({"choices": []}, primary_model=DEFAULT_AI_GATEWAY_MODEL)
        self.assertEqual(raised.exception.error_type, "empty_choices")
        self.assertTrue(raised.exception.retryable)

    def test_empty_content_is_a_retryable_failure(self) -> None:
        payload = {
            "model": DEFAULT_AI_GATEWAY_MODEL,
            "choices": [{"message": {"content": "   "}, "finish_reason": "stop"}],
        }
        with self.assertRaises(NaviLLMAttemptError) as raised:
            parse_ai_gateway_completion(payload, primary_model=DEFAULT_AI_GATEWAY_MODEL)
        self.assertEqual(raised.exception.error_type, "empty_content")

    def test_gateway_success_returns_normal_discord_reply(self) -> None:
        async def exercise() -> tuple[str, int]:
            with tempfile.TemporaryDirectory() as directory:
                database = Database(str(Path(directory) / "new-navi.sqlite3"))
                database.init_db()
                client = SequenceClient([completion()])
                service = LLMChatService(provider=client, db=database)
                reply = await service.generate_reply(
                    user_id=55,
                    username="tester",
                    guild_id=1,
                    message="오늘 뭐해?",
                )
                return reply.status, database.get_llm_daily_usage(55)

        self.assertEqual(asyncio.run(exercise()), ("success", 1))

    def test_all_attempts_fail_before_user_error_and_usage_is_refunded(self) -> None:
        async def exercise() -> tuple[str, int, int]:
            with tempfile.TemporaryDirectory() as directory:
                database = Database(str(Path(directory) / "new-navi.sqlite3"))
                database.init_db()
                client = SequenceClient(
                    [
                        failure(429, "rate_limit", retryable=True),
                        failure(503, "provider_unavailable", retryable=True),
                        failure(502, "bad_gateway", retryable=True),
                    ]
                )
                service = LLMChatService(provider=client, db=database)
                reply = await service.generate_reply(
                    user_id=66,
                    username="tester",
                    guild_id=1,
                    message="오늘 뭐해?",
                )
                return reply.status, client.calls, database.get_llm_daily_usage(66)

        self.assertEqual(asyncio.run(exercise()), ("error", 3, 0))

    def test_duplicate_message_claim_does_not_allow_a_second_call(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Database(str(Path(directory) / "new-navi.sqlite3"))
            database.init_db()
            self.assertTrue(database.claim_chat_message(999))
            self.assertFalse(database.claim_chat_message(999))

    def test_fast_repeat_mention_is_stopped_by_cooldown_without_usage(self) -> None:
        async def exercise() -> tuple[list[str], int, int]:
            with tempfile.TemporaryDirectory() as directory:
                database = Database(str(Path(directory) / "new-navi.sqlite3"))
                database.init_db()
                client = SequenceClient([completion()])
                service = LLMChatService(provider=client, db=database, cooldown_seconds=3)
                first = await service.generate_reply(
                    user_id=77,
                    username="tester",
                    guild_id=1,
                    message="안녕",
                )
                second = await service.generate_reply(
                    user_id=77,
                    username="tester",
                    guild_id=1,
                    message="또 안녕",
                )
                return [first.status, second.status], client.calls, database.get_llm_daily_usage(77)

        self.assertEqual(asyncio.run(exercise()), (["success", "cooldown"], 1, 1))


if __name__ == "__main__":
    unittest.main()
