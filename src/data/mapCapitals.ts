import rawCapitals from "./mapCapitals.json";
import type { MapCapitalRecord, MapMarker } from "../types/mapMarker";

export const initialMapCapitals = rawCapitals as MapCapitalRecord[];

export function mergeMapCapitals(
  base: readonly MapCapitalRecord[],
  overrides: readonly MapCapitalRecord[],
): MapCapitalRecord[] {
  const merged = new Map(base.map((capital) => [capital.countryKey, capital]));
  for (const capital of overrides) merged.set(capital.countryKey, capital);
  return [...merged.values()];
}

export function capitalsToMarkers(
  capitals: readonly MapCapitalRecord[],
): MapMarker[] {
  return capitals.flatMap((capital) => {
    if (
      !capital.enabled ||
      !capital.name.trim() ||
      capital.x === null ||
      capital.y === null ||
      !Number.isFinite(capital.x) ||
      !Number.isFinite(capital.y)
    ) return [];
    return [{
      id: `capital:${capital.countryKey}`,
      type: "CAPITAL" as const,
      countryKey: capital.countryKey,
      name: capital.name,
      position: { x: capital.x, y: capital.y },
      enabled: true,
      priority: 100,
      selectable: true,
    }];
  });
}
