import { describe, expect, it } from "vitest";
import type { MapCountryLabel } from "../src/types/mapCountry";
import {
  doLabelBoundsOverlap,
  getMapAnchoredCountryLabelScreenMetrics,
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
  it("국명 도형 전체에 같은 지도 배율을 적용한다", () => {
    const label = createLabel(1, { fontSize: 80 });
    const metrics = getMapAnchoredCountryLabelScreenMetrics(label, 1.5);

    expect(metrics.fontSize).toBeCloseTo(120);
    expect(metrics.layoutScale).toBeCloseTo(1.5);
  });

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

  it("국명은 줌마다 영토와 같은 비율로 투영된다", () => {
    const placements = [1.5, 2, 4, 8].map((scale) => {
      const [placement] = layoutMapLabels({
        ...baseLayoutOptions,
        camera: { x: 500, y: 250, scale },
        labels: [createLabel(1, { fontSize: 80 })],
      });
      return placement;
    });

    const normalizedSizes = placements.map(
      ({ screenFontSize }, index) => screenFontSize / [1.5, 2, 4, 8][index],
    );
    expect(normalizedSizes.every((size) => size === normalizedSizes[0])).toBe(
      true,
    );
    expect(normalizedSizes[0]).toBeCloseTo(80);
    expect(placements.every(({ x }) => Math.abs(x - 500) < 0.001)).toBe(
      true,
    );
  });

  it("줌 단계가 달라도 국명 전체와 각 글자의 지도상 크기는 변하지 않는다", () => {
    const placements = [1.5, 3, 5.5, 8].map((scale) => {
      const [placement] = layoutMapLabels({
        ...baseLayoutOptions,
        camera: { x: 500, y: 250, scale },
        labels: [createLabel(1, { text: "독일민주공화국", fontSize: 72, letterSpacing: 3 })],
      });
      return placement;
    });
    const first = placements[0];
    const scales = [1.5, 3, 5.5, 8];

    placements.forEach((placement, placementIndex) => {
      const scale = scales[placementIndex];
      expect(placement.width / scale).toBeCloseTo(first.width / scales[0], 5);
      expect(placement.height / scale).toBeCloseTo(first.height / scales[0], 5);
      expect(placement.glyphs).toHaveLength(first.glyphs.length);
      placement.glyphs.forEach((glyph, index) => {
        expect(glyph.width / scale).toBeCloseTo(
          first.glyphs[index].width / scales[0],
          5,
        );
        expect(glyph.height / scale).toBeCloseTo(
          first.glyphs[index].height / scales[0],
          5,
        );
        expect((glyph.x - placement.x) / scale).toBeCloseTo(
          (first.glyphs[index].x - first.x) / scales[0],
          5,
        );
        expect((glyph.y - placement.y) / scale).toBeCloseTo(
          (first.glyphs[index].y - first.y) / scales[0],
          5,
        );
      });
    });
  });

  it("화면 비율과 fitScale이 달라도 동일 카메라 배율에서는 같은 크기다", () => {
    const [wide] = layoutMapLabels({
      ...baseLayoutOptions,
      viewport: { width: 1600, height: 900 },
      fitScale: 0.5,
      camera: { x: 500, y: 250, scale: 1.5 },
      labels: [createLabel(1, { fontSize: 80 })],
    });
    const [compact] = layoutMapLabels({
      ...baseLayoutOptions,
      viewport: { width: 800, height: 450 },
      fitScale: 1,
      camera: { x: 500, y: 250, scale: 1.5 },
      labels: [createLabel(1, { fontSize: 80 })],
    });

    expect(wide.screenFontSize).toBeCloseTo(compact.screenFontSize);
    expect(wide.glyphs[0].width).toBeCloseTo(compact.glyphs[0].width);
    expect(wide.glyphs[0].height).toBeCloseTo(compact.glyphs[0].height);
  });

  it("지도를 이동하면 국명 전체가 동일한 화면 거리만큼 이동한다", () => {
    const [before] = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [createLabel(1)],
    });
    const [after] = layoutMapLabels({
      ...baseLayoutOptions,
      camera: { x: 450, y: 230, scale: 1.5 },
      labels: [createLabel(1)],
    });

    expect(after.x - before.x).toBeCloseTo(75);
    expect(after.y - before.y).toBeCloseTo(30);
    expect(after.screenFontSize).toBe(before.screenFontSize);
  });

  it("선택된 국가 라벨도 기본 크기에서 확대하지 않는다", () => {
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

  it("겹쳐도 국가마다 최소 한 개의 국명을 유지한다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [
        createLabel(1, { priority: 5 }),
        createLabel(2, { priority: 20 }),
      ],
    });

    expect(placements.map(({ label }) => label.countryId)).toEqual([2, 1]);
  });

  it("같은 국가의 여러 고정 라벨을 화면 충돌 때문에 숨기지 않는다", () => {
    const placements = layoutMapLabels({
      ...baseLayoutOptions,
      labels: [
        createLabel(1, { priority: 20 }),
        createLabel(1, {
          componentId: "country-001-component-002",
          priority: 10,
          y: 255,
          start: { x: 420, y: 255 },
          control: { x: 500, y: 255 },
          end: { x: 580, y: 255 },
        }),
      ],
    });

    expect(placements).toHaveLength(2);
    expect(placements.every(({ label }) => label.countryId === 1)).toBe(true);
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
    expect(placements[0].screenFontSize).toBeCloseTo(160);
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
