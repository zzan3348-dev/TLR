import { afterEach, describe, expect, it } from "vitest";
import type { ApiRequest, ApiResponse } from "../server/types";
import { requireNaviService } from "../server/naviAuth";
import { listNaviCountries, naviCountryByKey } from "../server/naviCountries";

function responseRecorder() {
  const record: { status: number; body: unknown } = { status: 200, body: null };
  const response: ApiResponse = {
    status(code) { record.status = code; return response; },
    json(body) { record.body = body; },
    setHeader() { return undefined; },
    end() { return undefined; },
  };
  return { record, response };
}

function request(token: string, discordUserId?: string): ApiRequest {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...(discordUserId ? { "x-discord-user-id": discordUserId } : {}),
    },
  };
}

describe("NAVI service authentication", () => {
  const token = "navi-test-token-0123456789-0123456789";

  afterEach(() => {
    delete process.env.TLR_NAVI_SERVICE_TOKEN;
  });

  it("accepts the dedicated token and a Discord snowflake", () => {
    process.env.TLR_NAVI_SERVICE_TOKEN = token;
    const { response } = responseRecorder();
    expect(requireNaviService(request(token, "123456789012345678"), response)).toEqual({
      discordUserId: "123456789012345678",
    });
  });

  it("rejects spoofed tokens and malformed Discord ids", () => {
    process.env.TLR_NAVI_SERVICE_TOKEN = token;
    const invalidToken = responseRecorder();
    expect(requireNaviService(request("wrong-token", "123456789012345678"), invalidToken.response)).toBeNull();
    expect(invalidToken.record.status).toBe(401);

    const invalidId = responseRecorder();
    expect(requireNaviService(request(token, "not-a-discord-id"), invalidId.response)).toBeNull();
    expect(invalidId.record.status).toBe(400);
  });
});

describe("NAVI country catalog", () => {
  it("uses the current TLR catalog and stable country keys", () => {
    const countries = listNaviCountries();
    expect(countries.length).toBeGreaterThan(0);
    expect(countries.every((country) => /^country-\d{3}$/u.test(country.key))).toBe(true);
    expect(naviCountryByKey("country-001")?.name).toBe("컬럼비아 개척연방");
  });
});
