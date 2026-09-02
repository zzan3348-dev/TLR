import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const adminDispatcher = readFileSync(new URL("../api/admin/actions.ts", import.meta.url), "utf8");

describe("admin API rewrites", () => {
  it("uses a dispatcher-specific query key for every admin action route", () => {
    const adminRewrites = vercelConfig.rewrites.filter(
      ({ destination }) => destination.startsWith("/api/admin/actions?"),
    );

    expect(adminRewrites.length).toBeGreaterThan(0);
    expect(adminRewrites.every(({ destination }) => destination.includes("adminRoute="))).toBe(true);
    expect(adminRewrites.every(({ destination }) => !destination.includes("domain="))).toBe(true);
  });

  it("reads the same dispatcher key in the serverless handler", () => {
    expect(adminDispatcher).toContain("request.query?.adminRoute");
    expect(adminDispatcher).not.toContain("request.query?.domain");
  });
});
