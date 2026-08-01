import { UiIcon } from "./UiIcon";

export type StrategyIconName =
  | "country" | "politics" | "economy" | "military" | "diplomacy"
  | "intelligence" | "layers" | "handshake" | "province" | "faction"
  | "fit" | "plus" | "minus";

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
  fit: "menu/fit",
  plus: "ui/open",
  minus: "ui/collapse",
};

export function StrategyIcon({ name, className }: StrategyIconProps) {
  return <UiIcon name={ICON_MAP[name]} className={className} />;
}
