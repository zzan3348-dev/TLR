import { UiIcon } from "./UiIcon";

export type StrategyIconName =
  | "country" | "politics" | "economy" | "military" | "diplomacy"
  | "intelligence" | "layers" | "handshake" | "province" | "faction"
  | "capital" | "fit" | "plus" | "minus"
  | "armyMap" | "navyMap" | "airMap";

type StrategyIconProps = { name: StrategyIconName; className?: string };

const ICON_MAP: Record<StrategyIconName, string> = {
  country: "hud/political-power",
  politics: "menu/politics",
  economy: "menu/economy",
  military: "sections/military",
  diplomacy: "menu/diplomacy",
  intelligence: "menu/intelligence",
  layers: "menu/layers",
  handshake: "menu/handshake",
  province: "menu/province-toggle",
  faction: "menu/faction-map",
  capital: "menu/capital",
  fit: "menu/fit",
  plus: "ui/open",
  minus: "ui/collapse",
  armyMap: "military/army-map",
  navyMap: "military/navy-map",
  airMap: "military/air-map",
};

export function StrategyIcon({ name, className }: StrategyIconProps) {
  return <UiIcon name={ICON_MAP[name]} className={className} />;
}
