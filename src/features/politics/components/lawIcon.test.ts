import { describe, expect, it } from "vitest";
import { getLawStageIcon } from "./lawIcon";

describe("law stage icon mapping", () => {
  it("uses the final generated stage instead of requesting stage six", () => {
    expect(getLawStageIcon("education", 99)).toBe(
      "/assets/ui/generated-icons/stages/social/education-5.png",
    );
  });

  it("keeps semantically related aliases in their own law families", () => {
    expect(getLawStageIcon("ethnic-policy", 0)).toBe(
      "/assets/ui/generated-icons/stages/political/immigration-1.png",
    );
    expect(getLawStageIcon("censorship", 2)).toBe(
      "/assets/ui/generated-icons/stages/political/press-3.png",
    );
  });
});
