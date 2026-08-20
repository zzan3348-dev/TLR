import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import provinces from "../src/data/mapProvinces.json";
import type { ProvinceRegion } from "../src/types/province";
import {
  getRegionProvinceIds,
  getRegionsContainingProvince,
  isProvinceInRegion,
  normalizeProvinceRegion,
} from "../src/utils/provinceRegions";

const regions: ProvinceRegion[] = [
  { id: "paris_metro", name: "파리 대도시권", provinceIds: ["fra_021", "fra_022"] },
  { id: "seine_basin", name: "센 강 유역", provinceIds: ["fra_022", "fra_023"] },
];

describe("provinceRegions", () => {
  it("Region ID로 프로빈스를 조회하고 역방향 포함 관계를 찾는다", () => {
    expect(getRegionProvinceIds(regions, "paris_metro")).toEqual(["fra_021", "fra_022"]);
    expect(isProvinceInRegion(regions, "fra_022", "paris_metro")).toBe(true);
    expect(getRegionsContainingProvince(regions, "fra_022").map((region) => region.id)).toEqual([
      "paris_metro",
      "seine_basin",
    ]);
  });

  it("저장 전 ID·이름·중복 프로빈스를 정규화한다", () => {
    expect(normalizeProvinceRegion({
      id: "  PARIS_METRO ",
      name: "  파리 대도시권  ",
      provinceIds: ["fra_022", "fra_021", "fra_022"],
    })).toEqual({
      id: "paris_metro",
      name: "파리 대도시권",
      provinceIds: ["fra_021", "fra_022"],
    });
  });

  it("생성된 모든 프로빈스 ID가 고유하며 seed가 ID 맵의 같은 mapId를 가리킨다", () => {
    expect(provinces.length).toBeGreaterThan(4_000);
    expect(new Set(provinces.map((province) => province.id)).size).toBe(provinces.length);
    expect(new Set(provinces.map((province) => province.mapId)).size).toBe(provinces.length);
    expect(provinces.every((province) => /^country-\d{3}-p-[a-z0-9-]+$/u.test(province.id))).toBe(true);

    const idMap = PNG.sync.read(readFileSync("public/maps/generated/world-1932-province-id-map.png"));
    for (const province of provinces) {
      const offset = (province.seed.y * idMap.width + province.seed.x) * 4;
      const mapId = idMap.data[offset] | (idMap.data[offset + 1] << 8) | (idMap.data[offset + 2] << 16);
      expect(mapId).toBe(province.mapId);
    }
  });
});
