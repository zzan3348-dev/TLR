import generatedStates from "./countryResourceStates.json";
import type { ResourceRecord } from "../types";

export const countryResourceStates = generatedStates as Readonly<
  Record<string, readonly ResourceRecord[]>
>;

export function getStartingResources(countryKey: string): ResourceRecord[] {
  return [...(countryResourceStates[countryKey] ?? [])].map((resource) => ({
    ...resource,
    available: Math.max(
      0,
      Math.min(
        resource.export_limit ?? 0,
        (resource.production_per_period ?? 0) - (resource.domestic_use ?? 0),
      ),
    ),
  }));
}
