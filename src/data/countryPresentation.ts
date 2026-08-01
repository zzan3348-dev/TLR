import rawCountryPresentation from "./countryPresentation.json";
import type { MapCountryIndex } from "../types/mapCountry";
import type {
  CountryPresentationData,
  CountryPresentationOverrides,
} from "../types/countryPresentation";

const presentationOverrides = rawCountryPresentation as Record<
  string,
  CountryPresentationOverrides
>;

const DEFAULT_TEST_LEADER_PORTRAIT_PATH =
  "/assets/ui/leader-placeholder.png";

export function getCountryPresentation(
  country: MapCountryIndex,
): CountryPresentationData {
  const overrides = presentationOverrides[country.key] ?? {};
  const title =
    country.name.trim() ||
    country.shortName.trim() ||
    country.mapLabel.trim() ||
    "미지정 국가";
  const secondaryName =
    country.nativeName.trim() || country.englishName.trim();

  return {
    country,
    title,
    secondaryNames: secondaryName
      .split(/\n+/u)
      .map((name) => name.trim())
      .filter(Boolean),
    subtitle: overrides.subtitle?.trim() ?? "",
    capital: overrides.capital?.trim() ?? "",
    status: overrides.status?.trim() ?? "",
    flagPath: overrides.flagPath ?? country.flagPath,
    leader: {
      name: overrides.leader?.name?.trim() ?? "",
      portraitPath:
        overrides.leader?.portraitPath ??
        DEFAULT_TEST_LEADER_PORTRAIT_PATH,
      title: overrides.leader?.title?.trim() ?? "",
    },
    politics: {
      government: overrides.politics?.government?.trim() ?? "",
      ideology: overrides.politics?.ideology?.trim() ?? "",
      rulingParty: overrides.politics?.rulingParty?.trim() ?? "",
      faction: overrides.politics?.faction?.trim() ?? "",
      symbolPath: overrides.politics?.symbolPath ?? null,
      parties: overrides.politics?.parties ?? [],
    },
    motto: overrides.motto?.trim() ?? "",
    description: overrides.description?.trim() ?? "",
    nationalSpirits: overrides.nationalSpirits ?? [],
    gallery: overrides.gallery ?? [],
    details: overrides.details ?? [],
  };
}
