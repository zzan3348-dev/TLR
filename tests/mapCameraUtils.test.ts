import { describe, expect, it } from "vitest";
import {
  cameraForWorldAnchor,
  getFitScale,
  normalizeCamera,
  screenPointToWorldPoint,
  shortestWrappedDelta,
  zoomCameraAtPoint,
} from "../src/utils/mapCameraUtils";

const viewport = { width: 1000, height: 500 };
const image = { width: 2000, height: 1000 };

describe("mapCameraUtils", () => {
  it("전체 지도가 보이는 최소 배율을 계산한다", () => {
    expect(getFitScale(viewport, image)).toBe(0.5);
  });

  it("카메라 X를 순환시키고 Y를 지도 안으로 제한한다", () => {
    expect(
      normalizeCamera(
        { x: 2200, y: -100, scale: 1 },
        viewport,
        image,
        0.5,
      ),
    ).toEqual({ x: 200, y: 250, scale: 1 });
  });

  it("화면 좌표를 순환된 원본 지도 좌표로 변환한다", () => {
    expect(
      screenPointToWorldPoint(
        { x: 0, y: 250 },
        { x: 100, y: 500, scale: 0.5 },
        viewport,
        image,
      ),
    ).toEqual({ x: 1100, y: 500 });
  });

  it("커서 아래 월드 좌표를 유지하며 확대한다", () => {
    const camera = { x: 1000, y: 500, scale: 0.5 };
    const zoomed = zoomCameraAtPoint(
      camera,
      { x: 750, y: 250 },
      1,
      viewport,
      image,
      0.5,
    );
    const before = screenPointToWorldPoint(
      { x: 750, y: 250 },
      camera,
      viewport,
      image,
    );
    const after = screenPointToWorldPoint(
      { x: 750, y: 250 },
      zoomed,
      viewport,
      image,
    );
    expect(after).toEqual(before);
  });

  it("동서 경계를 가로지르는 최단 카메라 이동량을 구한다", () => {
    expect(shortestWrappedDelta(1950, 50, 2000)).toBe(100);
  });

  it("핀치 중심의 월드 좌표를 유지하면서 확대·이동한다", () => {
    const anchor = { x: 900, y: 400 };
    const camera = cameraForWorldAnchor(
      anchor,
      { x: 600, y: 300 },
      1.5,
      viewport,
      image,
      0.5,
    );
    expect(
      screenPointToWorldPoint(
        { x: 600, y: 300 },
        camera,
        viewport,
        image,
      ),
    ).toEqual(anchor);
  });
});
