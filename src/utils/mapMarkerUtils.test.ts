import { describe, expect, it } from "vitest";
import type { MapMarker } from "../types/mapMarker";
import { projectMapMarkers } from "./mapMarkerUtils";

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

function project(scale: number, cameraX = 1024) {
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
  it("keeps a capital at a fixed screen-space size across zoom levels", () => {
    const middle = project(4);
    const maximum = project(16);
    expect(middle.size).toBe(16);
    expect(maximum.size).toBe(16);
    expect(maximum.x).not.toBe(middle.x);
  });

  it("changes only position, not size, while panning", () => {
    const before = project(4, 1024);
    const after = project(4, 1050);
    expect(after.size).toBe(before.size);
    expect(after.x).toBeLessThan(before.x);
  });

  it("uses visibility thresholds instead of scaling marker size", () => {
    const hidden = projectMapMarkers({
      markers: [marker], camera: { x: 1024, y: 394, scale: 1 },
      viewport: { width: 1200, height: 700 }, mapWidth: 2048, fitScale: 1,
      selectedCountryKey: null, mobile: false,
    });
    expect(hidden).toHaveLength(0);
    expect(project(4).markerOpacity).toBeGreaterThan(0);
    expect(project(4).size).toBe(16);
  });
});
