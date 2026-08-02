const lawIcons: Record<string, string> = {
  "party-system": "law/party-system", "religion-policy": "law/religion-policy",
  "trade-unions": "law/trade-unions", immigration: "law/immigration",
  "forced-labor": "law/forced-labor", assembly: "law/assembly", press: "law/press",
  franchise: "law/franchise", service: "law/service", training: "law/training",
  officers: "law/officers", exemptions: "law/exemptions", trade: "law/trade",
  "income-tax": "law/income-tax", "minimum-wage": "law/minimum-wage",
  "working-hours": "law/working-hours", unemployment: "law/unemployment", pensions: "law/pensions",
  healthcare: "law/healthcare", education: "law/education", "penal-system": "law/penal-system",
  policing: "law/policing", "industry-regulation": "law/industry-regulation",
  "womens-rights": "law/womens-rights", "industry-ownership": "law/industry-ownership",
  "land-system": "law/land-system", "ethnic-policy": "law/ethnic-policy", censorship: "law/censorship",
};

// The generated stage assets contain five states per law. Keep the renderer
// bounded to the files that actually ship so an extended definition cannot
// request a non-existent `*-6.png` asset.
const MAX_GENERATED_STAGE = 5;

const stageAliases: Record<string, string> = {
  // Ethnic-policy uses the same border/registration visual language as the
  // immigration law family. It is intentionally an alias, not a random icon.
  "ethnic-policy": "immigration",
  censorship: "press",
};
export function getLawIcon(lawId: string): string {
  const generatedFallbacks: Record<string, string> = {
    "ethnic-policy": "registration-system",
  };
  const generatedId = generatedFallbacks[lawId] ?? lawId;
  return lawIcons[lawId]
    ? `/assets/ui/generated-icons/laws/${generatedId}.png`
    : "sections/political";
}

const lawStageGroups: Record<string, string> = {
  "party-system": "political", "religion-policy": "political", "trade-unions": "political",
  immigration: "political", "forced-labor": "political", assembly: "political", press: "political",
  franchise: "political", censorship: "political",
  trade: "economy", "income-tax": "economy", "minimum-wage": "economy", "working-hours": "economy",
  unemployment: "economy", pensions: "economy", "industry-ownership": "economy", "land-system": "economy",
  service: "military", officers: "military", training: "military", exemptions: "military",
  healthcare: "social", education: "social", "penal-system": "social", policing: "social",
  "industry-regulation": "social", "womens-rights": "social", "ethnic-policy": "social",
};

export function getLawStageIcon(lawId: string, order: number): string {
  const resolvedId = stageAliases[lawId] ?? lawId;
  const group = lawStageGroups[resolvedId] ?? "political";
  const stage = Math.max(1, Math.min(MAX_GENERATED_STAGE, order + 1));
  return `/assets/ui/generated-icons/stages/${group}/${resolvedId}-${stage}.png`;
}
