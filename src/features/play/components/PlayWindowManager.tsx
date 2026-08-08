import { DecisionWindow } from "../../decisions/components/DecisionWindow";
import { ForeignCountryWindow } from "../../diplomacy/components/ForeignCountryWindow";
import { EconomyWindow } from "../../economy/components/EconomyWindow";
import { IntelligenceWindow } from "../../intelligence/components/IntelligenceWindow";
import { PoliticsPanel } from "../../politics/components/PoliticsPanel";
import { MilitaryWindow } from "../../military/components/MilitaryWindow";
import type { MapCountryIndex } from "../../../types/mapCountry";
import type { PlaySimulationState } from "../data/playSimulationState";
import type { PrimaryWindow } from "../types";

type PlayWindowManagerProps = {
  playerCountry: MapCountryIndex;
  inspectedCountry: MapCountryIndex | null;
  activeWindow: PrimaryWindow;
  simulationState: PlaySimulationState;
  onCloseWindow: () => void;
  onExitPlayMode: () => void;
};

export function PlayWindowManager({
  playerCountry,
  inspectedCountry,
  activeWindow,
  simulationState,
  onCloseWindow,
  onExitPlayMode,
}: PlayWindowManagerProps) {
  if (activeWindow === "politics") {
    return (
      <PoliticsPanel
        key={playerCountry.key}
        country={playerCountry}
        onClose={onCloseWindow}
        onExitPlayMode={onExitPlayMode}
      />
    );
  }

  if (activeWindow === "economy") {
    return (
      <EconomyWindow
        country={playerCountry}
        state={simulationState}
        onClose={onCloseWindow}
      />
    );
  }

  if (activeWindow === "diplomacy") {
    return (
      <ForeignCountryWindow
        playerCountry={playerCountry}
        targetCountry={inspectedCountry ?? playerCountry}
        onClose={onCloseWindow}
      />
    );
  }

  if (activeWindow === "intelligence") {
    return (
      <IntelligenceWindow country={playerCountry} onClose={onCloseWindow} />
    );
  }

  if (activeWindow === "decisions") {
    return <DecisionWindow country={playerCountry} onClose={onCloseWindow} />;
  }

  if (activeWindow === "military") {
    return <MilitaryWindow countryKey={playerCountry.key} onClose={onCloseWindow} />;
  }

  return null;
}
