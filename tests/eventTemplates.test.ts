import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_IMAGE_CROP,
  normalizeEventImageCrop,
  type EventTemplateType,
} from "../src/features/events/types";

describe("이벤트 템플릿 유형", () => {
  it("문서형과 신문형을 독립 유형으로 유지한다", () => {
    const types: EventTemplateType[] = ["document", "newspaper"];
    expect(types).toEqual(["document", "newspaper"]);
  });

  it("이미지 크롭 기본값과 편집 범위를 정규화한다", () => {
    expect(normalizeEventImageCrop()).toEqual(DEFAULT_EVENT_IMAGE_CROP);
    expect(normalizeEventImageCrop({ x: 20, y: 70, scale: 1.4 })).toEqual({
      x: 20,
      y: 70,
      scale: 1.4,
    });
    expect(normalizeEventImageCrop({ x: -20, y: 170, scale: 0.2 })).toEqual({
      x: 0,
      y: 100,
      scale: 1,
    });
  });
});
