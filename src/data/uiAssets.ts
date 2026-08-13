export const uiIconAssets = {
  hud: {
    politicalPower: "/assets/ui/generated-icons/status/political-power.png",
    stability: "/assets/ui/generated-icons/status/stability.png",
    warSupport: "/assets/ui/generated-icons/status/war-support.png",
    manpower: "/assets/ui/generated-icons/status/manpower.png",
    researchPower: "/assets/ui/icons/hud/research-power.svg",
    production: "/assets/ui/generated-icons/status/production.png",
    gdp: "/assets/ui/generated-icons/status/gdp.png",
    nationalDebt: "/assets/ui/generated-icons/status/national-debt.png",
  },
  menu: {
    politics: "/assets/ui/icons/menu/politics.svg",
    economy: "/assets/ui/icons/menu/economy.svg",
    decisions: "/assets/ui/icons/menu/decisions.svg",
    diplomacy: "/assets/ui/icons/menu/diplomacy.svg",
    intelligence: "/assets/ui/icons/menu/intelligence.svg",
    research: "/assets/ui/icons/menu/research.svg",
    exit: "/assets/ui/icons/menu/exit.svg",
    handshake: "/assets/ui/icons/menu/handshake.svg",
    layers: "/assets/ui/icons/menu/layers.svg",
    provinceToggle: "/assets/ui/icons/menu/province-toggle.svg",
    factionMap: "/assets/ui/icons/menu/faction-map.svg",
    capital: "/assets/ui/icons/menu/capital.svg",
    fit: "/assets/ui/icons/menu/fit.svg",
    zoomIn: "/assets/ui/icons/menu/zoom-in.svg",
    zoomOut: "/assets/ui/icons/menu/zoom-out.svg",
  },
  research: {
    laboratory: "/assets/ui/generated-icons/research/laboratory.png",
    request: "/assets/ui/generated-icons/research/request.png",
    investment: "/assets/ui/generated-icons/research/investment.png",
  },
  ui: {
    close: "/assets/ui/icons/ui/close.svg",
    expand: "/assets/ui/icons/ui/expand.svg",
    collapse: "/assets/ui/icons/ui/collapse.svg",
    open: "/assets/ui/icons/ui/open.svg",
    lock: "/assets/ui/icons/ui/lock.svg",
    check: "/assets/ui/icons/ui/check.svg",
    warning: "/assets/ui/icons/ui/warning.svg",
    trendUp: "/assets/ui/icons/ui/trend-up.svg",
    trendDown: "/assets/ui/icons/ui/trend-down.svg",
    trendFlat: "/assets/ui/icons/ui/trend-flat.svg",
  },
  sections: {
    political: "/assets/ui/icons/sections/political.svg",
    military: "/assets/ui/icons/sections/military.svg",
    economy: "/assets/ui/icons/sections/economy.svg",
    social: "/assets/ui/icons/sections/social.svg",
    development: "/assets/ui/icons/sections/development.svg",
  },
  stage: {
    one: "/assets/ui/icons/stage/1.svg",
    two: "/assets/ui/icons/stage/2.svg",
    three: "/assets/ui/icons/stage/3.svg",
    four: "/assets/ui/icons/stage/4.svg",
    five: "/assets/ui/icons/stage/5.svg",
  },
} as const;

const byName: Record<string, string> = {};
for (const group of Object.values(uiIconAssets)) {
  for (const [key, value] of Object.entries(group)) byName[key] = value;
}

const referenceLawKeys = new Set([
  "party-system", "religion-policy", "trade-unions", "immigration", "forced-labor", "assembly", "press", "franchise",
  "service", "officers", "training", "exemptions", "trade", "income-tax", "minimum-wage", "working-hours",
  "unemployment", "pensions", "healthcare", "education", "penal-system", "policing", "industry-regulation", "womens-rights",
]);

const generatedLawKeys = new Set([
  ...referenceLawKeys,
  "industry-ownership", "land-system", "ethnic-policy", "censorship",
  "permit-system", "registration-system", "assembly-open", "open-borders", "closed-borders",
]);
const generatedLawAliases: Record<string, string> = {
  "ethnic-policy": "registration-system",
};

export function getUiIconPath(name: string): string | null {
  if (name.startsWith("/")) return name;
  const parts = name.split("/");
  if (parts.length === 2) {
    const [group, key] = parts;
    if (group === "law" && generatedLawKeys.has(key)) {
      return `/assets/ui/generated-icons/laws/${generatedLawAliases[key] ?? key}.png`;
    }
    const groupValue = uiIconAssets[group as keyof typeof uiIconAssets];
    const camelKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (groupValue && camelKey in groupValue) return groupValue[camelKey as keyof typeof groupValue];
    if (/^[a-z0-9-]+$/.test(group) && /^[a-z0-9-]+$/.test(key)) return `/assets/ui/icons/${group}/${key}.svg`;
  }
  return byName[name] ?? null;
}
