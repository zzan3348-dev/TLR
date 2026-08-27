import { describe, expect, it } from "vitest";
import { withKoreanParticle } from "../server/koreanGrammar";

describe("withKoreanParticle", () => {
  it("받침에 맞는 한국어 조사를 붙인다", () => {
    expect(withKoreanParticle("독일", "이/가")).toBe("독일이");
    expect(withKoreanParticle("프랑스", "이/가")).toBe("프랑스가");
  });
});
