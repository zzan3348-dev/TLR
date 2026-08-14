import { describe, expect, it } from "vitest";
import type { MapMarker } from "../src/types/mapMarker";
import { projectMapMarkers } from "../src/utils/mapMarkerUtils";

const marker: MapMarker = {
  id: "capital:test",
  type: "CAPITAL",
  countryKey: "country-test",
  name: "시험 수도",
  position: { x: 1100, y: 390 },
  enabled: true,
  priority: 100,
  selectable: true,
};

function project(scale: number, cameraX = 1100) {
  return projectMapMarkers({
    markers: [marker],
    camera: { x: cameraX, y: 394, scale },
    viewport: { width: 1200, height: 700 },
    mapWidth: 2048,
    fitScale: 1,
    selectedCountryKey: null,
    mobile: false,
  })[0];
}

describe("projectMapMarkers", () => {
  it("줌과 이동 중에도 수도 아이콘의 화면 크기를 고정한다", () => {
    const middle = project(4);
    const maximum = project(16);
    const panned = project(4, 1126);

    expect(middle.size).toBe(16);
    expect(maximum.size).toBe(16);
    expect(panned.size).toBe(16);
    expect(maximum.x).toBe(middle.x);
    expect(panned.x).toBeLessThan(middle.x);
  });
});
