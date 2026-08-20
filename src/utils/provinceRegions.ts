import type { ProvinceRegion } from "../types/province";

export function getRegionProvinceIds(
  regions: readonly ProvinceRegion[],
  regionId: string,
): readonly string[] {
  return regions.find((region) => region.id === regionId)?.provinceIds ?? [];
}

export function isProvinceInRegion(
  regions: readonly ProvinceRegion[],
  provinceId: string,
  regionId: string,
): boolean {
  return getRegionProvinceIds(regions, regionId).includes(provinceId);
}

export function getRegionsContainingProvince(
  regions: readonly ProvinceRegion[],
  provinceId: string,
): ProvinceRegion[] {
  return regions.filter((region) => region.provinceIds.includes(provinceId));
}

export function normalizeProvinceRegion(region: ProvinceRegion): ProvinceRegion {
  return {
    id: region.id.trim().toLowerCase(),
    name: region.name.trim(),
    provinceIds: [...new Set(region.provinceIds)].sort(),
  };
}
