import { describe, expect, it } from "vitest";
import { getMapLabelScreenScale } from "../src/data/mapLabelDisplayOverrides";

describe("map label display overrides", () => {
  it("러시아 두 국가의 상대 크기를 의도대로 보정한다", () => {
    expect(getMapLabelScreenScale(3)).toBe(0.84);
    expect(getMapLabelScreenScale(4)).toBe(1.18);
    expect(getMapLabelScreenScale(999)).toBe(1);
  });
});
