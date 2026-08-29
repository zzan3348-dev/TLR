import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/services/authService";

describe("safeNextPath", () => {
  it("keeps relative paths for callback restoration", () => {
    expect(safeNextPath("/play/country-001")).toBe("/play/country-001");
    expect(safeNextPath("/claim-country/country-001")).toBe("/claim-country/country-001");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeNextPath("https://example.com")).toBe("/");
    expect(safeNextPath("//example.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
