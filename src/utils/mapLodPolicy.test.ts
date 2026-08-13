import { describe, expect, it } from "vitest";
import { normalizedMapZoom, smoothLodVisibility } from "./mapLodPolicy";

describe("map semantic zoom policy", () => {
  it("normalizes fit and maximum zoom to a stable 0..1 range", () => {
    expect(normalizedMapZoom(0.5, 0.5)).toBe(0);
    expect(normalizedMapZoom(8, 0.5)).toBeCloseTo(1);
    expect(normalizedMapZoom(2, 0.5)).toBeGreaterThan(0);
    expect(normalizedMapZoom(2, 0.5)).toBeLessThan(1);
  });

  it("fades content smoothly only around its LOD threshold", () => {
    expect(smoothLodVisibility(0.1, 0.2, 0.1)).toBe(0);
    expect(smoothLodVisibility(0.25, 0.2, 0.1)).toBeCloseTo(0.5);
    expect(smoothLodVisibility(0.3, 0.2, 0.1)).toBe(1);
  });
});
