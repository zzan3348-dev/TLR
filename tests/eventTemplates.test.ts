import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_IMAGE_CROP,
  normalizeEventImageCrop,
  type SuperEventData,
  type EventTemplateType,
} from "../src/features/events/types";
import {
  advanceSuperEventQueue,
  appendSuperEvent,
} from "../src/features/events/superEventQueue";
import {
  extractYouTubeVideoId,
  resolveSuperEventMusicSource,
} from "../src/features/events/audio/musicSourceResolver";

describe("이벤트 템플릿 유형", () => {
  it("문서형, 신문형, 슈퍼이벤트를 독립 유형으로 유지한다", () => {
    const types: EventTemplateType[] = ["document", "newspaper", "super"];
    expect(types).toEqual(["document", "newspaper", "super"]);
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

  it("슈퍼이벤트 큐를 중복 없이 FIFO 순서로 처리한다", () => {
    const first: SuperEventData = {
      id: "first",
      title: "첫 번째",
      buttonText: "확인",
    };
    const second: SuperEventData = {
      id: "second",
      title: "두 번째",
      buttonText: "확인",
    };

    const queue = appendSuperEvent(appendSuperEvent([], first), second);
    expect(appendSuperEvent(queue, first)).toEqual(queue);
    expect(advanceSuperEventQueue(queue)).toEqual([second]);
  });

  it("슈퍼이벤트 음악의 일반 URL과 YouTube URL을 구분한다", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(resolveSuperEventMusicSource({
      sourceType: "url",
      source: "/audio/event.ogg",
    })).toEqual({ kind: "native", source: "/audio/event.ogg" });

    const youtube = resolveSuperEventMusicSource({
      sourceType: "youtube",
      source: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      startTime: 12,
    }, "https://tlr.example");
    expect(youtube?.kind).toBe("youtube");
    expect(youtube && "embedUrl" in youtube ? youtube.embedUrl : "").toContain("start=12");
  });
});
