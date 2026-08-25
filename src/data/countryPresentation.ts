import rawCountryPresentation from "./countryPresentation.json";
import rawCountryParties from "./countryParties.json";
import rawLeaderEffects from "./leaderEffects.json";
import rawNationalSpirits from "./generated/countryNationalSpirits.json";
import type { MapCountryIndex } from "../types/mapCountry";
import type {
  CountryLeaderEffect,
  CountryNationalSpirit,
  CountryPoliticsPresentation,
  CountryPresentationData,
  CountryPresentationOverrides,
} from "../types/countryPresentation";

const presentationOverrides = rawCountryPresentation as unknown as Record<
  string,
  CountryPresentationOverrides
>;

const leaderEffectOverrides = rawLeaderEffects as Record<
  string,
  { name: string; effects: CountryLeaderEffect[] }
>;

const partyOverrides = rawCountryParties as unknown as Record<
  string,
  Omit<CountryPoliticsPresentation, "faction">
>;

const nationalSpiritOverrides = rawNationalSpirits as Record<
  string,
  CountryNationalSpirit[]
>;

const DEFAULT_TEST_LEADER_PORTRAIT_PATH =
  "/assets/ui/leader-placeholder.png";

export function getCountryPresentation(
  country: MapCountryIndex,
): CountryPresentationData {
  const overrides = presentationOverrides[country.key] ?? {};
  const partyData = partyOverrides[country.key];
  const leaderData = leaderEffectOverrides[country.key];
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
      name:
        leaderData?.name?.trim() || overrides.leader?.name?.trim() || "",
      portraitPath:
        overrides.leader?.portraitPath ??
        DEFAULT_TEST_LEADER_PORTRAIT_PATH,
      title: overrides.leader?.title?.trim() ?? "",
      effects: leaderData?.effects ?? overrides.leader?.effects ?? [],
    },
    politics: {
      government:
        partyData?.government?.trim() ??
        overrides.politics?.government?.trim() ??
        "",
      ideologyCategory: partyData?.ideologyCategory ?? "자유주의",
      subIdeology: partyData?.subIdeology?.trim() ?? "",
      rulingParty:
        partyData?.rulingParty?.trim() ??
        overrides.politics?.rulingParty?.trim() ??
        "",
      faction: overrides.politics?.faction?.trim() ?? "",
      symbolPath:
        partyData?.symbolPath ?? overrides.politics?.symbolPath ?? null,
      parties: partyData?.parties ?? [],
    },
    motto: overrides.motto?.trim() ?? "",
    description: overrides.description?.trim() ?? "",
    nationalSpirits:
      nationalSpiritOverrides[country.key] ?? overrides.nationalSpirits ?? [],
    gallery: overrides.gallery ?? [],
    details: overrides.details ?? [],
  };
}
