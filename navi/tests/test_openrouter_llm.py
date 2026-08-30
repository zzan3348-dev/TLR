from __future__ import annotations

import asyncio
import unittest

from navi_bot.navi_llm import (
    DEFAULT_OPENROUTER_MODEL,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    NaviLLMClient,
    NaviLLMError,
    build_openrouter_payload,
)


class OpenRouterLLMTests(unittest.TestCase):
    def test_payload_uses_requested_model_and_four_hundred_token_limit(self) -> None:
        payload = build_openrouter_payload(
            model=DEFAULT_OPENROUTER_MODEL,
            system_prompt="너는 NAVI다.",
            message="안녕",
        )
        self.assertEqual(OPENROUTER_CHAT_COMPLETIONS_URL, "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(payload["model"], "google/gemma-4-31b-it:free")
        self.assertEqual(payload["max_tokens"], 400)
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "안녕"})

    def test_missing_api_key_raises_without_starting_a_request(self) -> None:
        client = NaviLLMClient(api_key="")
        with self.assertRaises(NaviLLMError):
            asyncio.run(client.generate(system_prompt="NAVI", message="안녕"))

    def test_length_limited_answer_is_retried_as_a_complete_reply(self) -> None:
        class RetryClient(NaviLLMClient):
            def __init__(self) -> None:
                super().__init__(api_key="test")
                self.calls = 0

            async def _request_once(
                self,
                *,
                system_prompt: str,
                message: str,
                max_tokens: int,
            ) -> tuple[str, str]:
                self.calls += 1
                if self.calls == 1:
                    return "네에, 나비가 대답해드릴게요! 그런데 이 문장이", "length"
                return "네에, 나비 여기 있어요! 오늘도 잘 작동 중이랍니다.", "stop"

        async def exercise() -> tuple[str, int]:
            client = RetryClient()
            result = await client.generate_reply(
                user_id=1,
                username="tester",
                guild_id=2,
                system_prompt="NAVI",
                message="오늘 뭐해?",
            )
            return result, client.calls

        result, calls = asyncio.run(exercise())
        self.assertEqual(calls, 2)
        self.assertTrue(result.endswith("."))
        self.assertNotIn("이 문장이", result)


if __name__ == "__main__":
    unittest.main()
