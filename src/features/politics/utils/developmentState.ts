import { developmentDefinitions } from "../data/developmentDefinitions";
import type {
  CountryDevelopmentItem,
  CountryDevelopmentState,
  DevelopmentDefinition,
  DevelopmentLevel,
} from "../types/development";

export type ResolvedDevelopmentRow = {
  definition: DevelopmentDefinition;
  item: CountryDevelopmentItem | null;
  level: DevelopmentLevel | null;
};

export function createUnsetDevelopmentState(
  countryId: string,
): CountryDevelopmentState {
  return {
    countryId,
    povertyRate: null,
    povertyChange: null,
    items: [],
  };
}

export function resolveDevelopmentRows(
  state: CountryDevelopmentState,
): readonly ResolvedDevelopmentRow[] {
  const itemsById = new Map(state.items.map((item) => [item.id, item]));

  return developmentDefinitions.map((definition) => {
    const item = itemsById.get(definition.id) ?? null;
    const level =
      item?.level == null
        ? null
        : definition.levels.find(
            (candidate) => candidate.level === item.level,
          ) ?? null;

    return { definition, item, level };
  });
}
