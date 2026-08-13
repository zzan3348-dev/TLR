import { describe, expect, it } from "vitest";
import type { MapCountryLabel } from "../src/types/mapCountry";
import {
  doLabelBoundsOverlap,
  getRotatedLabelBounds,
  layoutMapLabels,
} from "../src/utils/mapLabelRenderer";

const createLabel = (
  countryId: number,
  overrides: Partial<MapCountryLabel> = {},
): MapCountryLabel => ({
  countryId,
  componentId: `country-${String(countryId).padStart(3, "0")}-component-001`,
  labelGroupId: `country-${String(countryId).padStart(3, "0")}-group-001`,
  text: `국가 ${countryId}`,
  layoutMode: "straight",
  pathType: "quadratic",
  start: { x: 420, y: 250 },
  control: { x: 500, y: 250 },
  end: { x: 580, y: 250 },
  x: 500,
  y: 250,
  angle: 0,
  curvature: 0,
  fontSize: 40,
  letterSpacing: 2,
  maxWidth: 160,
  groupPixelCount: 10_000,
  priority: 10,
  minZoom: 1,
  maxZoom: null,
  visible: true,
  fitRatio: 1,
  ownershipFitRatio: 0.72,
  candidateScore: 1,
  mode: "auto",
  hiddenReason: null,
  ...overrides,
});

const baseLayoutOptions = {
  camera: { x: 500, y: 250, scale: 1.5 },
  viewport: { width: 1000, height: 500 },
  mapWidth: 1000,
  fitScale: 1,
  selectedCountryId: null,
  selectedComponentId: null,
};

describe("mapLabelRenderer", () => {
  it("회전된 라벨의 화면 경계와 겹침을 계산한다", () => {
    const horizontal = getRotatedLabelBounds(100, 100, 80, 20, 0);
    const vertical = getRotatedLabelBounds(100, 100, 80, 20, 90);

    expect(horizontal).toEqual({ left: 60, top: 90, right: 140, bottom: 110 });
    expect(vertical.right - vertical.left).toBeCloseTo(20);
    expect(vertical.bottom - vertical.top).toBeCloseTo(80);
    expect(
      doLabelBoundsOverlap(horizontal, {
        left: 139,
        top: 90,
        right: 180,
        bottom: 110,
      }),
    ).toBe(true);
  });

  it("최소 줌 미만인 라벨을 숨긴다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [createLabel(1, { minZoom: 2 })],
    });

    expect(placements).toHaveLength(0);
  });

  it("국명은 화면상 범위 안에서만 완만하게 조절되고 무한히 커지지 않는다", () => {
    const placements = [1.5, 2, 4, 8].map((scale) => {
      const [placement] = layoutMapLabels({
        ...baseLayoutOptions,
        camera: { x: 500, y: 250, scale },
        labels: [createLabel(1, { fontSize: 80 })],
      });
      return placement;
    });

    const sizes = placements.map(({ screenFontSize }) => screenFontSize);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.25);
    expect(Math.max(...sizes)).toBeLessThan(90);
    expect(placements.every(({ x }) => Math.abs(x - 500) < 0.001)).toBe(
      true,
    );
  });

  it("선택된 국가 라벨은 기본 크기보다 최대 6%만 확대한다", () => {
    const camera = { x: 500, y: 250, scale: 4 };
    const labels = [createLabel(1, { fontSize: 80 })];
    const [normalPlacement] = layoutMapLabels({
      ...baseLayoutOptions,
      camera,
      labels,
    });
    const [selectedPlacement] = layoutMapLabels({
      ...baseLayoutOptions,
      camera,
      labels,
      selectedCountryId: 1,
      selectedComponentId: "country-001-component-001",
    });

    expect(selectedPlacement.screenFontSize).toBe(
      normalPlacement.screenFontSize,
    );
    expect(selectedPlacement.selected).toBe(true);
    expect(selectedPlacement.x).toBeCloseTo(normalPlacement.x);
    expect(selectedPlacement.y).toBeCloseTo(normalPlacement.y);
  });

  it("곡선 중점이 달라도 저장된 월드 앵커를 확대 기준으로 유지한다", () => {
    const labels = [
      createLabel(1, {
        x: 500,
        y: 250,
        start: { x: 420, y: 300 },
        control: { x: 500, y: 300 },
        end: { x: 580, y: 300 },
      }),
    ];
    const [normalPlacement] = layoutMapLabels({
      ...baseLayoutOptions,
      labels,
    });
    const [zoomedPlacement] = layoutMapLabels({
      ...baseLayoutOptions,
      camera: { x: 500, y: 250, scale: 6 },
      labels,
    });

    expect(normalPlacement.x).toBeCloseTo(500);
    expect(normalPlacement.y).toBeCloseTo(250);
    expect(zoomedPlacement.x).toBeCloseTo(500);
    expect(zoomedPlacement.y).toBeCloseTo(250);
  });

  it("겹치는 라벨은 우선순위가 높은 라벨만 유지한다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [
        createLabel(1, { priority: 5 }),
        createLabel(2, { priority: 20 }),
      ],
    });

    expect(placements.map(({ label }) => label.countryId)).toEqual([2]);
  });

  it("일부만 겹치는 라벨은 위치를 옮기지 않고 글자 크기를 줄여 복구한다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [
        createLabel(1, { priority: 20 }),
        createLabel(2, {
          priority: 10,
          y: 285,
          start: { x: 420, y: 285 },
          control: { x: 500, y: 285 },
          end: { x: 580, y: 285 },
        }),
      ],
    });

    expect(placements).toHaveLength(2);
    expect(placements[0].label.countryId).toBe(1);
    expect(placements[1].screenFontSize).toBe(
      placements[0].screenFontSize,
    );
    expect(placements[1].label.y).toBe(285);
  });

  it("영토 적합도 때문에 숨겨진 라벨은 충분히 확대하면 다시 표시한다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      camera: { x: 500, y: 250, scale: 4 },
      labels: [
        createLabel(1, {
          visible: false,
          hiddenReason: "insufficient-territory-fit",
          minZoom: 2,
        }),
      ],
    });

    expect(placements).toHaveLength(1);
    expect(placements[0].screenFontSize).toBeGreaterThanOrEqual(36);
    expect(placements[0].screenFontSize).toBeLessThanOrEqual(44);
  });

  it("국명은 최소 줌 직후부터 갑자기 켜지지 않고 서서히 나타난다", () => {
    const [starting] = layoutMapLabels({
      ...baseLayoutOptions,
      camera: { x: 500, y: 250, scale: 1.08 },
      labels: [createLabel(1)],
    });
    const [visible] = layoutMapLabels({
      ...baseLayoutOptions,
      camera: { x: 500, y: 250, scale: 1.35 },
      labels: [createLabel(1)],
    });

    expect(starting.visibilityOpacity).toBeGreaterThan(0);
    expect(starting.visibilityOpacity).toBeLessThan(0.1);
    expect(visible.visibilityOpacity).toBe(1);
  });

  it("선택된 국가 라벨을 충돌보다 우선하고 월드 래핑 복사본을 배치한다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      camera: { x: 0, y: 250, scale: 1.5 },
      mapWidth: 500,
      labels: [
        createLabel(1, {
          x: 0,
          priority: 50,
          start: { x: -80, y: 250 },
          control: { x: 0, y: 250 },
          end: { x: 80, y: 250 },
        }),
        createLabel(2, {
          x: 0,
          priority: 1,
          start: { x: -80, y: 250 },
          control: { x: 0, y: 250 },
          end: { x: 80, y: 250 },
        }),
      ],
      selectedCountryId: 2,
      selectedComponentId: "country-002-component-001",
    });

    expect(placements[0].label.countryId).toBe(2);
    expect(placements.some(({ copy }) => copy === 0)).toBe(true);
  });

  it("같은 국가의 여러 영토 중 클릭한 컴포넌트 라벨만 표시하고 강조한다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [
        createLabel(1, {
          componentId: "country-001-component-001",
          y: 200,
          start: { x: 420, y: 200 },
          control: { x: 500, y: 200 },
          end: { x: 580, y: 200 },
        }),
        createLabel(1, {
          componentId: "country-001-component-002",
          y: 300,
          start: { x: 420, y: 300 },
          control: { x: 500, y: 300 },
          end: { x: 580, y: 300 },
        }),
      ],
      selectedCountryId: 1,
      selectedComponentId: "country-001-component-002",
    });

    expect(
      placements.some(
        ({ label }) => label.componentId === "country-001-component-001",
      ),
    ).toBe(false);
    expect(
      placements.find(
        ({ label }) => label.componentId === "country-001-component-002",
      )?.selected,
    ).toBe(true);
  });
});
