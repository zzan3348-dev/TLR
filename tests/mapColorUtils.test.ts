import { describe, expect, it } from "vitest";
import type { MapCountryIndex, RgbaColor } from "../src/types/mapCountry";
import {
  colorDistance,
  findNearestCountry,
  isExcludedMapColor,
  rgbToHex,
  screenPointToImagePoint,
} from "../src/utils/mapColorUtils";

const rgba = (r: number, g: number, b: number, a = 255): RgbaColor => ({
  r,
  g,
  b,
  a,
});

describe("mapColorUtils", () => {
  it("contain 여백을 제외하고 원본 이미지 좌표로 변환한다", () => {
    const topPadding = screenPointToImagePoint(
      { x: 500, y: 50 },
      { width: 1000, height: 1000 },
      { width: 2000, height: 1000 },
    );
    const center = screenPointToImagePoint(
      { x: 500, y: 500 },
      { width: 1000, height: 1000 },
      { width: 2000, height: 1000 },
    );

    expect(topPadding).toBeNull();
    expect(center).toEqual({ x: 1000, y: 500 });
  });

  it("바다·국경·순백색·투명 픽셀을 제외한다", () => {
    expect(isExcludedMapColor(rgba(10, 24, 40))).toBe(true);
    expect(isExcludedMapColor(rgba(20, 20, 20))).toBe(true);
    expect(isExcludedMapColor(rgba(255, 255, 255))).toBe(true);
    expect(isExcludedMapColor(rgba(90, 120, 80, 0))).toBe(true);
    expect(isExcludedMapColor(rgba(213, 216, 216))).toBe(false);
    expect(isExcludedMapColor(rgba(153, 21, 32))).toBe(false);
  });

  it("RGB 변환과 색상 거리를 계산한다", () => {
    expect(rgbToHex(rgba(10, 24, 40))).toBe("#0A1828");
    expect(colorDistance(rgba(10, 10, 10), rgba(13, 14, 10))).toBe(5);
  });

  it("허용 거리 안의 가장 가까운 고정 인덱스를 찾는다", () => {
    const countries: MapCountryIndex[] = [
      {
        id: 1,
        key: "country-001",
        color: "#991520",
        internalName: "",
        name: "",
        nativeName: "",
        englishName: "",
        shortName: "",
        mapLabel: "",
        shortLabel: "",
        allowShortMapLabel: true,
        label: {
          enabled: true,
          componentId: null,
          mode: "auto",
          text: null,
          x: null,
          y: null,
          angle: null,
          fontSize: null,
          letterSpacing: null,
          minZoom: null,
          priority: null,
        },
        labelRepeat: {
          enabled: true,
          minimumPixelArea: 2200,
          minimumRelativeArea: 0.08,
          minimumBoundsWidth: 80,
          minimumBoundsHeight: 28,
          maxAutomaticLabels: 4,
        },
        labelGroups: [],
        grouping: {
          mode: "auto",
          archipelagoMode: false,
          mergeDistance: 130,
          smallIslandMergeDistance: 190,
          largeOverseasSplitDistance: 520,
          labelEnvelopeBuffer: 0,
          manualGroups: [],
          excludedPhysicalComponentIds: [],
        },
        flagPath: null,
        flagFit: "cover",
        flagOpacity: 0.82,
        flagFocusMode: "selected-display-group",
        flagBlendMode: "source-over",
      },
      {
        id: 2,
        key: "country-002",
        color: "#143272",
        internalName: "",
        name: "",
        nativeName: "",
        englishName: "",
        shortName: "",
        mapLabel: "",
        shortLabel: "",
        allowShortMapLabel: true,
        label: {
          enabled: true,
          componentId: null,
          mode: "auto",
          text: null,
          x: null,
          y: null,
          angle: null,
          fontSize: null,
          letterSpacing: null,
          minZoom: null,
          priority: null,
        },
        labelRepeat: {
          enabled: true,
          minimumPixelArea: 2200,
          minimumRelativeArea: 0.08,
          minimumBoundsWidth: 80,
          minimumBoundsHeight: 28,
          maxAutomaticLabels: 4,
        },
        labelGroups: [],
        grouping: {
          mode: "auto",
          archipelagoMode: false,
          mergeDistance: 130,
          smallIslandMergeDistance: 190,
          largeOverseasSplitDistance: 520,
          labelEnvelopeBuffer: 0,
          manualGroups: [],
          excludedPhysicalComponentIds: [],
        },
        flagPath: null,
        flagFit: "cover",
        flagOpacity: 0.82,
        flagFocusMode: "selected-display-group",
        flagBlendMode: "source-over",
      },
    ];

    expect(findNearestCountry(rgba(151, 22, 33), countries)?.id).toBe(1);
    expect(findNearestCountry(rgba(80, 80, 80), countries)).toBeNull();
  });
});
