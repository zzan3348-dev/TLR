import mapCountryData from "./mapCountries.json" with { type: "json" };
import { countryFactionMemberships } from "./countryFactionMemberships.js";
import { countryEnglishNames } from "./countryEnglishNames.js";
import { countryNativeNames } from "./countryNativeNames.js";
import type {
  FlagFit,
  FlagBlendMode,
  FlagFocusMode,
  MapCountryIndex,
  MapCountryGroupingSettings,
  MapCountryLabelGroupSettings,
  MapCountryLabelSettings,
  MapLabelLayoutMode,
  MapLabelMode,
} from "../types/mapCountry.js";

const isFlagFit = (value: string): value is FlagFit =>
  value === "cover" || value === "contain" || value === "stretch";

const isFlagFocusMode = (value: string): value is FlagFocusMode =>
  value === "selected-component" ||
  value === "selected-display-group" ||
  value === "all-territories";

const isFlagBlendMode = (value: string): value is FlagBlendMode =>
  value === "source-over" ||
  value === "multiply" ||
  value === "overlay" ||
  value === "soft-light";

const isLabelMode = (value: string): value is MapLabelMode =>
  value === "auto" || value === "manual" || value === "hidden";

const isLabelLayoutMode = (value: string): value is MapLabelLayoutMode =>
  value === "straight" || value === "arc-up" || value === "arc-down";

export const mapCountries: readonly MapCountryIndex[] = mapCountryData.map(
  (country): MapCountryIndex => {
    const rawFlagFocusMode =
      "flagFocusMode" in country &&
      typeof country.flagFocusMode === "string"
        ? country.flagFocusMode
        : "";
    const rawFlagBlendMode =
      "flagBlendMode" in country &&
      typeof country.flagBlendMode === "string"
        ? country.flagBlendMode
        : "";
    const labelData = country.label;
    const rawGrouping: Partial<MapCountryGroupingSettings> | null =
      "grouping" in country &&
      country.grouping &&
      typeof country.grouping === "object"
        ? (country.grouping as Partial<MapCountryGroupingSettings>)
        : null;
    const grouping: MapCountryGroupingSettings = {
      mode: rawGrouping?.mode === "manual" ? "manual" : "auto",
      archipelagoMode: rawGrouping?.archipelagoMode === true,
      mergeDistance:
        typeof rawGrouping?.mergeDistance === "number"
          ? rawGrouping.mergeDistance
          : 130,
      smallIslandMergeDistance:
        typeof rawGrouping?.smallIslandMergeDistance === "number"
          ? rawGrouping.smallIslandMergeDistance
          : 190,
      largeOverseasSplitDistance:
        typeof rawGrouping?.largeOverseasSplitDistance === "number"
          ? rawGrouping.largeOverseasSplitDistance
          : 520,
      labelEnvelopeBuffer:
        typeof rawGrouping?.labelEnvelopeBuffer === "number"
          ? rawGrouping.labelEnvelopeBuffer
          : 0,
      manualGroups: Array.isArray(rawGrouping?.manualGroups)
        ? rawGrouping.manualGroups.map((group) => ({
            id: group.id,
            physicalComponentIds: [...group.physicalComponentIds],
          }))
        : [],
      excludedPhysicalComponentIds: Array.isArray(
        rawGrouping?.excludedPhysicalComponentIds,
      )
        ? [...rawGrouping.excludedPhysicalComponentIds]
        : [],
    };
    const label: MapCountryLabelSettings = {
      enabled: labelData.enabled,
      componentId: labelData.componentId,
      mode: isLabelMode(labelData.mode) ? labelData.mode : "auto",
      text: labelData.text,
      x: labelData.x,
      y: labelData.y,
      angle: labelData.angle,
      fontSize: labelData.fontSize,
      letterSpacing: labelData.letterSpacing,
      minZoom: labelData.minZoom,
      priority: labelData.priority,
    };
    const labelGroups: MapCountryLabelGroupSettings[] =
      (
        country.labelGroups as readonly MapCountryLabelGroupSettings[]
      ).map((group) => ({
        ...group,
        mode: isLabelMode(group.mode) ? group.mode : "auto",
        layoutMode:
          group.layoutMode && isLabelLayoutMode(group.layoutMode)
            ? group.layoutMode
            : null,
      }));
    return {
      ...country,
      internalName:
        "internalName" in country &&
        typeof country.internalName === "string"
          ? country.internalName
          : "",
      nativeName:
        countryNativeNames[country.id] ??
        ("nativeName" in country && typeof country.nativeName === "string"
          ? country.nativeName
          : ""),
      englishName: countryEnglishNames[country.id] ?? "",
      shortLabel:
        "shortLabel" in country && typeof country.shortLabel === "string"
          ? country.shortLabel
          : "",
      allowShortMapLabel:
        "allowShortMapLabel" in country
          ? country.allowShortMapLabel !== false
          : true,
      label,
      labelGroups,
      grouping,
      flagFit: isFlagFit(country.flagFit) ? country.flagFit : "cover",
      flagFocusMode: isFlagFocusMode(rawFlagFocusMode)
        ? rawFlagFocusMode
        : "selected-display-group",
      flagBlendMode: isFlagBlendMode(rawFlagBlendMode)
        ? rawFlagBlendMode
        : "source-over",
      factionMembership: countryFactionMemberships[country.id] ?? null,
    };
  },
);
