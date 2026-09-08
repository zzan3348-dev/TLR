import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("generated military artwork", () => {
  const names = ["army","navy","air","production","doctrine","offensive","defensive","objective","delete"];
  it.each(names)("%s is an independent square RGBA PNG, not a renamed SVG", (name) => {
    const bytes = readFileSync(new URL(`../public/assets/ui/military-art/${name}.png`, import.meta.url));
    expect(bytes.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20));
    expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(256);
    expect(bytes[25]).toBe(6);
  });
  it("renders raster image sources instead of drawing or masking icons", () => {
    const source = readFileSync(new URL("../src/features/military/components/MilitaryIcon.tsx", import.meta.url), "utf8");
    expect(source).toContain("<img");
    expect(source).toContain("/assets/ui/military-art/");
    expect(source).not.toContain("<svg");
    expect(source).not.toContain("<canvas");
  });
});
