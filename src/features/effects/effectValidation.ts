import { mapCountries } from "../../data/mapCountries";
import { resolveNationalSpiritDefinition } from "./nationalSpiritRegistry";
import type { EventEffect } from "./types";

const COUNTRY_IDS = new Set(mapCountries.map(({ key }) => key));

export function validateEventEffects(effects: readonly EventEffect[]): void {
  for (const effect of effects) {
    if (!effect.targetCountryIds.length) throw new Error("EVENT_EFFECT_TARGET_REQUIRED");
    for (const countryId of effect.targetCountryIds) {
      if (!COUNTRY_IDS.has(countryId)) throw new Error(`UNKNOWN_EVENT_EFFECT_COUNTRY:${countryId}`);
      if (effect.type !== "modify_country_value" && !resolveNationalSpiritDefinition(effect.spiritId, countryId)) {
        throw new Error(`UNKNOWN_NATIONAL_SPIRIT:${countryId}:${effect.spiritId}`);
      }
    }
    if (effect.type === "modify_country_value" && !Number.isFinite(effect.amount)) {
      throw new Error("INVALID_EVENT_EFFECT_AMOUNT");
    }
    if (effect.type === "add_national_spirit" && effect.duration != null && (!Number.isInteger(effect.duration) || effect.duration <= 0)) {
      throw new Error("INVALID_NATIONAL_SPIRIT_DURATION");
    }
  }
}
