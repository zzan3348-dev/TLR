import { describe, expect, it } from "vitest";
import type { MapCountryComponent } from "../src/types/mapCountry";
import {
  decodeMapId,
  findComponentForPoint,
  pointInWrappedBounds,
} from "../src/utils/mapSelectionUtils";

const wrappedComponent: MapCountryComponent = {
  countryId: 3,
  componentId: "country-003-component-001",
  displayGroupId: "country-003-group-001",
  physicalComponentIds: ["country-003-physical-00001"],
  bounds: { x: 1950, y: 100, width: 120, height: 80 },
  centroid: { x: 2010, y: 140 },
  pixelCount: 500,
  representative: { x: 1960, y: 120 },
  maskPath: "/mask.png",
  labelEnvelopePath: null,
  labelEnvelopeBuffer: 0,
  archipelago: false,
  wrapsX: true,
  groupedTerritoryCount: 2,
};

describe("mapSelectionUtils", () => {
  it("RGB로 인코딩된 국가 ID를 복원한다", () => {
    expect(decodeMapId(44, 1, 0)).toBe(300);
  });

  it("동서 경계를 넘는 연결요소의 양쪽 좌표를 인식한다", () => {
    expect(
      pointInWrappedBounds({ x: 1980, y: 130 }, wrappedComponent, 2000),
    ).toBe(true);
    expect(
      pointInWrappedBounds({ x: 20, y: 130 }, wrappedComponent, 2000),
    ).toBe(true);
  });

  it("클릭 좌표를 포함하는 가장 작은 연결요소를 선택한다", () => {
    const larger = {
      ...wrappedComponent,
      componentId: "country-003-component-002",
      bounds: { x: 1900, y: 80, width: 200, height: 140 },
    };
    expect(
      findComponentForPoint(
        3,
        { x: 20, y: 130 },
        [larger, wrappedComponent],
        2000,
      )?.componentId,
    ).toBe(wrappedComponent.componentId);
  });
});
