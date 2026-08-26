import { mapCountries } from "../../data/mapCountries";
import { resolveNationalSpiritDefinition } from "./nationalSpiritRegistry";
import type { CountryStatKey, EventEffect } from "./types";

export type FormattedEventEffect = {
  id: string;
  countryId: string;
  countryName: string;
  text: string;
  tone: "positive" | "negative" | "spirit-add" | "spirit-remove";
};

const STAT_LABELS: Record<CountryStatKey, string> = {
  stability: "안정도",
  warSupport: "전쟁 지지도",
  politicalPower: "정치력",
  productionCapacity: "생산능력",
  nationalIncome: "국가수익",
  foreignReserves: "외환보유고",
  researchPower: "연구력",
  povertyRate: "빈곤율",
};

function countryName(countryId: string): string {
  return mapCountries.find(({ key }) => key === countryId)?.name ?? countryId;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function statTone(statKey: CountryStatKey, amount: number): "positive" | "negative" {
  // 빈곤율은 내려갈수록 유리하고, 나머지 국가 수치는 올라갈수록 유리하다.
  return statKey === "povertyRate"
    ? (amount <= 0 ? "positive" : "negative")
    : (amount >= 0 ? "positive" : "negative");
}

export function formatEventEffects(effects: readonly EventEffect[]): FormattedEventEffect[] {
  return effects.flatMap((effect, effectIndex) => effect.targetCountryIds.map((countryId) => {
    if (effect.type === "modify_country_value") {
      return {
        id: `${effectIndex}-${countryId}`,
        countryId,
        countryName: countryName(countryId),
        text: `${STAT_LABELS[effect.statKey]} ${signed(effect.amount)}`,
        tone: statTone(effect.statKey, effect.amount),
      };
    }
    const spirit = resolveNationalSpiritDefinition(effect.spiritId, countryId);
    const spiritName = spirit?.name ?? effect.spiritId;
    if (effect.type === "add_national_spirit") {
      const duration = effect.duration == null ? "" : ` · ${effect.duration}일`;
      return {
        id: `${effectIndex}-${countryId}`,
        countryId,
        countryName: countryName(countryId),
        text: `국민정신 「${spiritName}」 추가${duration}`,
        tone: "spirit-add" as const,
      };
    }
    return {
      id: `${effectIndex}-${countryId}`,
      countryId,
      countryName: countryName(countryId),
      text: `국민정신 「${spiritName}」 제거`,
      tone: "spirit-remove" as const,
    };
  }));
}
