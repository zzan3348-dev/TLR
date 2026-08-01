import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  OWNERSHIP,
  classifySourcePixels,
  generateCleanRasterLayers,
  restoreCleanOwnership,
} from "../scripts/clean-ownership.mjs";

const config = {
  seaColor: "#0A1828",
};

describe("clean ownership", () => {
  it("보호 국가의 어두운 대표색을 프로빈스선보다 먼저 국가로 분류한다", () => {
    const source = new PNG({ width: 1, height: 1, colorType: 6 });
    source.data.set([45, 44, 45, 255]);
    const result = classifySourcePixels(
      source,
      [{ id: 30, color: "#2D2C2D" }],
      {
        seaColor: "#0A1828",
        seaTolerance: 14,
        whiteChannelMinimum: 235,
        darkChannelMaximum: 35,
        darkLineMaximum: 72,
        countryMatchTolerance: 14,
        protectedCountryIds: [30],
        protectedCountryMatchTolerance: 3,
      },
    );

    expect(result.classifications[0]).toBe(30);
  });

  it("두꺼운 내부선을 동일 국가 소유권으로 끝까지 복원한다", () => {
    const source = new Uint16Array([
      1,
      OWNERSHIP.DARK_LINE,
      OWNERSHIP.DARK_LINE,
      OWNERSHIP.DARK_LINE,
      1,
    ]);
    const result = restoreCleanOwnership(source, 5, 1);

    expect([...result.ownership]).toEqual([1, 1, 1, 1, 1]);
    expect(result.unresolvedPixelCount).toBe(0);
  });

  it("국제 국경선을 빈 픽셀로 남기지 않고 양국 중 하나에 배분한다", () => {
    const source = new Uint16Array([
      1,
      OWNERSHIP.DARK_LINE,
      OWNERSHIP.DARK_LINE,
      2,
    ]);
    const result = restoreCleanOwnership(source, 4, 1);

    expect(result.ownership[1]).toBeGreaterThan(0);
    expect(result.ownership[2]).toBeGreaterThan(0);
    expect(result.unresolvedPixelCount).toBe(0);
  });

  it("clean ID 차이로만 국가 국경을 만들고 동일 국가 내부선은 만들지 않는다", () => {
    const source = new PNG({ width: 5, height: 1, colorType: 6 });
    const classifications = new Uint16Array([
      1,
      OWNERSHIP.DARK_LINE,
      OWNERSHIP.DARK_LINE,
      OWNERSHIP.DARK_LINE,
      1,
    ]);
    const ownership = new Uint16Array([1, 1, 1, 1, 1]);
    const layers = generateCleanRasterLayers(
      source,
      classifications,
      ownership,
      [{ id: 1, color: "#AA3322" }],
      config,
    );

    expect(layers.internalLinePixelsInCountryLayer).toBe(0);
    expect(
      [...layers.countryLines.data].some(
        (channel, index) => index % 4 === 3 && channel > 0,
      ),
    ).toBe(false);
  });

  it("국가 국경선을 주변 픽셀로 팽창시키지 않는다", () => {
    const source = new PNG({ width: 5, height: 1, colorType: 6 });
    const classifications = new Uint16Array([1, 1, 1, 2, 2]);
    const ownership = new Uint16Array([1, 1, 1, 2, 2]);
    const layers = generateCleanRasterLayers(
      source,
      classifications,
      ownership,
      [
        { id: 1, color: "#AA3322" },
        { id: 2, color: "#3366AA" },
      ],
      config,
    );

    expect(layers.countryBoundaryPixels).toBe(4);
    expect(
      [...layers.countryLines.data].filter(
        (channel, index) => index % 4 === 3 && channel > 0,
      ),
    ).toEqual([176, 176, 176, 176]);
  });
});
