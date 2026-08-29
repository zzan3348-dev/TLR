import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
  countryApplicationMessage,
  countryExpulsionMessage,
  countryEmojiName,
  prepareDiscordEmojiPng,
} from "../server/countryApplications";

describe("country application Discord integration", () => {
  it("creates a stable Discord-safe emoji name", () => {
    expect(countryEmojiName("country-001")).toBe("tlr_country_001");
    expect(countryEmojiName("France! West")).toBe("tlr_france_west");
  });

  it("renders the exact mention, custom emoji and country name", () => {
    expect(countryApplicationMessage(
      "123456789012345678",
      { id: "987654321098765432", name: "tlr_country_001" },
      "프랑스 인민공화국",
    )).toBe("<@123456789012345678>님이 <:tlr_country_001:987654321098765432> 프랑스 인민공화국을 신청하셨습니다! 개장까지 잠시만 기다려주세요!");
  });

  it("renders the expulsion notice with username, flag, country and reason", () => {
    expect(countryExpulsionMessage(
      "테스트유저",
      { id: "987654321098765432", name: "tlr_country_001" },
      "프랑스 인민공화국",
      "운영 규칙 위반",
    )).toBe("테스트유저님의 <:tlr_country_001:987654321098765432>프랑스 인민공화국 연재 자격을 관리자가 박탈하였습니다\n사유: 운영 규칙 위반");
  });

  it("converts the real flag asset into a bounded square PNG without stretching it", () => {
    const source = readFileSync("public/assets/country-panels/country-001/flag.png");
    const dataUrl = prepareDiscordEmojiPng(source);
    const encoded = Buffer.from(dataUrl.replace("data:image/png;base64,", ""), "base64");
    const png = PNG.sync.read(encoded);
    expect(png.width).toBe(128);
    expect(png.height).toBe(128);
    expect(encoded.byteLength).toBeLessThanOrEqual(256 * 1024);
  });
});
