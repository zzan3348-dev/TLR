import { describe, expect, it } from "vitest";
import type {
  MapCountryComponent,
  MapCountryIndex,
} from "../src/types/mapCountry";
import {
  getDimmedWorldFilter,
  resolvePresentationComponents,
} from "../src/utils/selectionPresentationRenderer";

const component = (
  countryId: number,
  componentId: string,
): MapCountryComponent => ({
  countryId,
  componentId,
  displayGroupId: componentId.replace("-component-", "-group-"),
  physicalComponentIds: [],
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  centroid: { x: 50, y: 50 },
  pixelCount: 1000,
  representative: { x: 50, y: 50 },
  maskPath: `/${componentId}.png`,
  labelEnvelopePath: null,
  labelEnvelopeBuffer: 0,
  archipelago: false,
  wrapsX: false,
  groupedTerritoryCount: 1,
});

const country = (
  flagFocusMode: MapCountryIndex["flagFocusMode"],
): MapCountryIndex => ({
  id: 1,
  key: "country-001",
  color: "#AA3322",
  internalName: "",
  name: "테스트 국가",
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
  flagFocusMode,
  flagBlendMode: "source-over",
});

describe("selectionPresentationRenderer", () => {
  const selected = component(1, "country-001-component-001");
  const otherTerritory = component(1, "country-001-component-002");
  const foreignTerritory = component(2, "country-002-component-001");

  it("기본 display-group 설정과 무관하게 같은 국가 전체 영토를 강조한다", () => {
    expect(
      resolvePresentationComponents(
        country("selected-display-group"),
        selected,
        [selected, otherTerritory, foreignTerritory],
      ),
    ).toEqual([selected, otherTerritory]);
  });

  it("all-territories 모드에서는 같은 국가의 모든 그룹을 강조한다", () => {
    expect(
      resolvePresentationComponents(
        country("all-territories"),
        selected,
        [selected, otherTerritory, foreignTerritory],
      ),
    ).toEqual([selected, otherTerritory]);
  });

  it("진행도에 따라 비선택 세계 필터 강도를 보간한다", () => {
    expect(getDimmedWorldFilter(0)).toBe(
      "brightness(0.8) saturate(0.86) contrast(1.09)",
    );
    expect(getDimmedWorldFilter(1)).toContain("brightness(0.432)");
    expect(getDimmedWorldFilter(1)).toContain("saturate(0.4128)");
  });
});
