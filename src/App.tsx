import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "./components/MapChrome";
import { FactionLegend } from "./components/FactionLegend";
import { MapControls } from "./components/MapControls";
import {
  CountryPlayFlow,
  type CountryPlayStep,
} from "./components/CountryPlayFlow";
import { ReadOnlyCountryPanel } from "./components/ReadOnlyCountryPanel";
import { TexturedActionButton } from "./components/TexturedActionButton";
import { IconCatalog } from "./components/IconCatalog";
import { TitleScreen, type TitleWindow } from "./components/TitleScreen";
import { DirectorateAccessModal } from "./components/DirectorateAccessModal";
import { DirectoratePanel } from "./components/DirectoratePanel";
import { AuthModal } from "./components/AuthModal";
import { AccessBlockedScreen } from "./components/AccessBlockedScreen";
import { WorldMap, type WorldMapHandle } from "./components/WorldMap";
import { mapCountries } from "./data/mapCountries";
import { PlayHud } from "./features/play/components/PlayHud";
import { PlayWindowManager } from "./features/play/components/PlayWindowManager";
import { DiplomacyNotificationQueue } from "./features/diplomacy/components/DiplomacyNotificationQueue";
import { loadEconomy } from "./features/economy/economyClient";
import type { EconomySnapshot } from "./features/economy/types";
import { getPlaySimulationState } from "./features/play/data/playSimulationState";
import {
  clearPlayCountryKey,
  readPlayCountryKey,
  storePlayCountryKey,
} from "./features/play/playSession";
import type { PrimaryWindow } from "./features/play/types";
import type {
  MapCountryComponent,
  MapCountryIndex,
} from "./types/mapCountry";
import type { MapMode } from "./types/faction";
import { useAuth } from "./auth/AuthProvider";
import { signOut } from "./services/authService";

const PROVINCE_STORAGE_KEY = "world-map-show-province-borders";

type SelectedMapTerritory = {
  country: MapCountryIndex;
  component: MapCountryComponent;
};

function readStoredProvinceSetting(): boolean {
  try {
    return localStorage.getItem(PROVINCE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function readStoredPlayCountry(): MapCountryIndex | null {
  const storedKey = readPlayCountryKey();
  return (
    mapCountries.find((country) => country.key === storedKey) ?? null
  );
}

export default function App() {
  const { profile, loading: authLoading, refresh: refreshAuth } = useAuth();
  const mapRef = useRef<WorldMapHandle>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const bgmEnabledRef = useRef(true);
  const [screen, setScreen] = useState<"title" | "map" | "admin">(
    window.location.pathname.startsWith("/play/") ? "map" : window.location.pathname === "/admin" || window.location.pathname === "/directorate" ? "admin" : "title",
  );
  const [isMapEntering, setIsMapEntering] = useState(false);
  const [titleWindow, setTitleWindow] = useState<TitleWindow>(null);
  const [selection, setSelection] = useState<SelectedMapTerritory | null>(null);
  const [countryPlayStep, setCountryPlayStep] =
    useState<CountryPlayStep>("closed");
  const [playCountry, setPlayCountry] = useState<MapCountryIndex | null>(
    readStoredPlayCountry,
  );
  const [activePlayWindow, setActivePlayWindow] =
    useState<PrimaryWindow>("politics");
  const [inspectedCountry, setInspectedCountry] =
    useState<MapCountryIndex | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("political");
  const [showProvinceBorders, setShowProvinceBorders] = useState(
    readStoredProvinceSetting,
  );
  const [showLabels, setShowLabels] = useState(true);
  const [isBgmEnabled, setIsBgmEnabled] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accessBlockedOpen, setAccessBlockedOpen] = useState(false);
  const [directorateAccessOpen, setDirectorateAccessOpen] = useState(false);
  const [economySnapshot, setEconomySnapshot] =
    useState<EconomySnapshot | null>(null);

  useEffect(() => {
    const audio = new Audio("/audio/tlr-bgm.mp3");
    bgmRef.current = audio;
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.6;

    const removeInteractionListeners = () => {
      window.removeEventListener("pointerdown", startPlayback);
      window.removeEventListener("keydown", startPlayback);
    };
    const startPlayback = () => {
      if (!bgmEnabledRef.current) {
        return;
      }
      void audio
        .play()
        .then(removeInteractionListeners)
        .catch(() => {
          // 브라우저 자동재생 정책이 허용할 때까지 다음 사용자 입력을 기다린다.
        });
    };

    startPlayback();
    window.addEventListener("pointerdown", startPlayback);
    window.addEventListener("keydown", startPlayback);

    return () => {
      removeInteractionListeners();
      audio.pause();
      audio.src = "";
      bgmRef.current = null;
    };
  }, []);

  const toggleBgm = useCallback(() => {
    setIsBgmEnabled((current) => {
      const next = !current;
      bgmEnabledRef.current = next;
      const audio = bgmRef.current;
      if (audio) {
        if (next) {
          void audio.play().catch(() => {
            // 브라우저 자동재생 제한 시 다음 사용자 입력에서 다시 재생을 시도한다.
          });
        } else {
          audio.pause();
        }
      }
      return next;
    });
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (authLoading) return;
    const match = window.location.pathname.match(/^\/play\/([^/]+)$/u);
    if (!match) return;
    const country = mapCountries.find(
      (candidate) => candidate.key === decodeURIComponent(match[1]),
    );
    if (!country) {
      window.history.replaceState({}, "", "/");
      setScreen("title");
      return;
    }
    if (profile?.accessStatus === "blocked") {
      setAccessBlockedOpen(true);
      return;
    }
    setPlayCountry(country);
    storePlayCountryKey(country.key);
    setScreen("map");
  }, [authLoading, profile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isMapEntering) {
      return;
    }
    const timer = window.setTimeout(() => setIsMapEntering(false), 760);
    return () => window.clearTimeout(timer);
  }, [isMapEntering]);

  const closePanel = useCallback(() => {
    setCountryPlayStep("closed");
    setSelection(null);
  }, []);

  const selectCountry = useCallback(
    (country: MapCountryIndex, component: MapCountryComponent) => {
      setSelection((current) =>
        current?.country.key === country.key &&
        current.component.componentId === component.componentId
          ? playCountry
            ? null
            : current
          : { country, component },
      );

      if (!playCountry) {
        return;
      }

      if (country.key === playCountry.key) {
        setInspectedCountry(null);
        setActivePlayWindow("politics");
        return;
      }

      setInspectedCountry(country);
      setActivePlayWindow("diplomacy");
    },
    [playCountry],
  );

  const updateProvinceBorders = useCallback((nextValue: boolean) => {
    setShowProvinceBorders(nextValue);
    try {
      localStorage.setItem(PROVINCE_STORAGE_KEY, String(nextValue));
    } catch {
      // 저장소가 차단된 환경에서도 현재 세션의 토글은 유지한다.
    }
  }, []);

  const confirmCountryPlay = useCallback(() => {
    if (!selection) {
      return;
    }
    if (profile?.accessStatus === "blocked") {
      setAccessBlockedOpen(true);
      return;
    }
    setPlayCountry(selection.country);
    setInspectedCountry(null);
    setActivePlayWindow("politics");
    storePlayCountryKey(selection.country.key);
    setCountryPlayStep("closed");
    setSelection(null);
    window.history.replaceState({}, "", `/play/${selection.country.key}`);
  }, [profile, selection]);

  const exitPlayMode = useCallback(() => {
    setPlayCountry(null);
    setInspectedCountry(null);
    setActivePlayWindow(null);
    setSelection(null);
    clearPlayCountryKey();
    setCountryPlayStep("closed");
    window.history.replaceState({}, "", "/");
  }, []);

  const closePlayWindow = useCallback(() => {
    setActivePlayWindow(null);
  }, []);

  useEffect(() => {
    if (!playCountry) {
      return;
    }

    const controller = new AbortController();
    const refreshEconomy = () => {
      void loadEconomy(playCountry.key, controller.signal)
        .then(setEconomySnapshot)
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setEconomySnapshot(null);
          }
        });
    };
    refreshEconomy();
    window.addEventListener("tlr:economy-updated", refreshEconomy);
    return () => {
      controller.abort();
      window.removeEventListener("tlr:economy-updated", refreshEconomy);
    };
  }, [playCountry]);

  const playSimulationState = playCountry
    ? getPlaySimulationState(playCountry, economySnapshot)
    : null;

  const highlightedCountry = selection?.country ?? null;
  const highlightedComponent =
    selection && highlightedCountry?.key === selection.country.key
      ? selection.component
      : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (countryPlayStep === "confirmation") {
        setCountryPlayStep("description");
      } else if (countryPlayStep === "description") {
        setCountryPlayStep("closed");
      } else if (isSettingsOpen) {
        setIsSettingsOpen(false);
      } else if (playCountry && selection) {
        setSelection(null);
      } else if (playCountry && activePlayWindow) {
        closePlayWindow();
      } else if (selection && !playCountry) {
        closePanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closePanel,
    closePlayWindow,
    activePlayWindow,
    countryPlayStep,
    isSettingsOpen,
    playCountry,
    selection,
  ]);

  if (new URLSearchParams(window.location.search).get("icons") === "1") {
    return <IconCatalog />;
  }

  if (accessBlockedOpen && profile?.accessStatus === "blocked") {
    return (
      <AccessBlockedScreen
        profile={profile}
        onLogout={async () => {
          await signOut();
          await refreshAuth();
          setAccessBlockedOpen(false);
          setScreen("title");
          window.history.replaceState({}, "", "/");
        }}
      />
    );
  }

  if (screen === "admin") {
    return <DirectoratePanel onBackToTitle={() => { setScreen("title"); window.history.replaceState({}, "", "/"); }} />;
  }

  if (screen === "title") {
    return (
      <>
        <TitleScreen
          activeWindow={titleWindow}
          authProfile={profile}
          authLoading={authLoading}
          onOpenCountrySelection={() => {
            setTitleWindow(null);
            setIsMapEntering(true);
            setScreen("map");
          }}
          onOpenWindow={setTitleWindow}
          onCloseWindow={() => setTitleWindow(null)}
          onLogin={() => {
            setTitleWindow(null);
            setAuthModalOpen(true);
          }}
          onLogout={async () => {
            await signOut();
            await refreshAuth();
          }}
          onOpenDirectorate={() => setDirectorateAccessOpen(true)}
          directorateAccessOpen={directorateAccessOpen}
        />
        <DirectorateAccessModal
          open={directorateAccessOpen}
          onClose={() => setDirectorateAccessOpen(false)}
          onAuthorized={() => {
            setDirectorateAccessOpen(false);
            setScreen("admin");
            window.history.replaceState({}, "", "/directorate");
          }}
        />
        <AuthModal
          open={authModalOpen}
          profile={profile}
          loading={authLoading}
          nextPath="/"
          onClose={() => setAuthModalOpen(false)}
          onSignOut={async () => {
            await signOut();
            await refreshAuth();
            setAuthModalOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <main
      className={`app-shell${isMapEntering ? " app-shell--map-entering" : ""}`}
      data-play-mode={playCountry !== null}
    >
      {isMapEntering ? (
        <div className="map-entry-transition" aria-hidden="true" />
      ) : null}
      <TopBar
        isSettingsOpen={isSettingsOpen}
        isBgmEnabled={isBgmEnabled}
        onToggleSettings={() => setIsSettingsOpen((current) => !current)}
        onCloseSettings={() => setIsSettingsOpen(false)}
        onToggleBgm={toggleBgm}
        onBackToTitle={() => {
          setIsSettingsOpen(false);
          setTitleWindow(null);
          setIsMapEntering(false);
          setScreen("title");
        }}
      />
      <section
        className="map-stage"
        aria-label="세계지도"
        data-panel-open={selection !== null}
        data-play-mode={playCountry !== null}
      >
        <WorldMap
          ref={mapRef}
          mapMode={mapMode}
          showProvinceBorders={showProvinceBorders}
          showLabels={showLabels}
          selectedCountry={highlightedCountry}
          selectedComponent={highlightedComponent}
          onCountrySelect={selectCountry}
        />
        {playCountry && playSimulationState ? (
          <PlayHud
            country={playCountry}
            state={playSimulationState}
            activeWindow={activePlayWindow}
            onOpenWindow={setActivePlayWindow}
            onExitPlayMode={exitPlayMode}
          />
        ) : null}
        <MapControls
          mapHandle={mapRef}
          mapMode={mapMode}
          onToggleFactionMode={() =>
            setMapMode((current) =>
              current === "faction" ? "political" : "faction",
            )
          }
          showProvinceBorders={showProvinceBorders}
          onToggleProvinceBorders={() =>
            updateProvinceBorders(!showProvinceBorders)
          }
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels((current) => !current)}
        />
        {mapMode === "faction" ? <FactionLegend /> : null}
        <ReadOnlyCountryPanel
          country={playCountry ? null : selection?.country ?? null}
          onClose={closePanel}
        />
        {selection && !playCountry && countryPlayStep === "closed" ? (
          <div className="map-selection-action">
            <TexturedActionButton
              tone="green"
              onClick={() => setCountryPlayStep("description")}
            >
              설정 읽어보기
            </TexturedActionButton>
          </div>
        ) : null}
        {playCountry && playSimulationState ? (
          <PlayWindowManager
            playerCountry={playCountry}
            inspectedCountry={inspectedCountry}
            activeWindow={activePlayWindow}
            simulationState={playSimulationState}
            onCloseWindow={closePlayWindow}
            onExitPlayMode={exitPlayMode}
          />
        ) : null}
        {playCountry ? <DiplomacyNotificationQueue country={playCountry} /> : null}
      </section>
      <CountryPlayFlow
        country={selection?.country ?? null}
        step={countryPlayStep}
        onClose={() => setCountryPlayStep("closed")}
        onRequestConfirmation={() =>
          setCountryPlayStep("confirmation")
        }
        onBack={() => setCountryPlayStep("description")}
        onConfirm={confirmCountryPlay}
      />
      <AuthModal
        open={authModalOpen}
        profile={profile}
        loading={authLoading}
        nextPath={selection ? `/play/${selection.country.key}` : "/"}
        onClose={() => setAuthModalOpen(false)}
        onSignOut={async () => {
          await signOut();
          await refreshAuth();
          setAuthModalOpen(false);
        }}
      />
    </main>
  );
}
