import resourceStates from "../src/features/economy/data/countryResourceStates.json" with { type: "json" };

export type StartingResourceRow = {
  country_key: string;
  resource_type_id: string;
  stockpile: number;
  production_per_period: number;
  domestic_use: number;
  export_limit: number;
  is_public: boolean;
  available?: number;
};

const states = resourceStates as Record<string, StartingResourceRow[]>;

export function startingResourcesForCountry(countryKey: string): StartingResourceRow[] {
  return (states[countryKey] ?? []).map((row) => ({
    ...row,
    available: Math.max(0, Math.min(row.export_limit, row.production_per_period - row.domestic_use)),
  }));
}

export function mergeStartingResources<T extends { resource_type_id: string }>(
  countryKey: string,
  databaseRows: readonly T[],
): Array<T | StartingResourceRow> {
  const merged = new Map<string, T | StartingResourceRow>(
    startingResourcesForCountry(countryKey).map((row) => [row.resource_type_id, row]),
  );
  for (const row of databaseRows) merged.set(row.resource_type_id, row);
  return [...merged.values()];
}
