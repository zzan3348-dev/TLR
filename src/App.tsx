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
import { WarDeclarationAlert } from "./features/military/components/WarDeclarationAlert";
import { EventTestPage } from "./features/events/components/EventTestPage";
import { loadEconomy } from "./features/economy/economyClient";
import type { EconomySnapshot } from "./features/economy/types";
import { getPlaySimulationState } from "./features/play/data/playSimulationState";
import {
  clearPlayCountryKey,
  storePlayCountryKey,
} from "./features/play/playSession";
import type { PrimaryWindow } from "./features/play/types";
import type {
  MapCountryComponent,
  MapCountryIndex,
} from "./types/mapCountry";
import type { MapMode } from "./types/faction";
import { useAuth } from "./auth/AuthProvider";
import { signOut, submitCountryApplication } from "./services/authService";

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

export default function App() {
  const { profile, loading: authLoading, refresh: refreshAuth } = useAuth();
  const mapRef = useRef<WorldMapHandle>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const bgmEnabledRef = useRef(true);
  const verifiedPlayCountryRef = useRef<string | null>(null);
  const [screen, setScreen] = useState<"title" | "map" | "admin">(
    window.location.pathname.startsWith("/play/") ? "map" : window.location.pathname === "/admin" || window.location.pathname === "/directorate" ? "admin" : "title",
  );
  const [isMapEntering, setIsMapEntering] = useState(false);
  const [titleWindow, setTitleWindow] = useState<TitleWindow>(null);
  const [selection, setSelection] = useState<SelectedMapTerritory | null>(null);
  const [countryPlayStep, setCountryPlayStep] =
    useState<CountryPlayStep>("closed");
  const [playCountry, setPlayCountry] = useState<MapCountryIndex | null>(null);
  const [applicationCountry, setApplicationCountry] = useState<MapCountryIndex | null>(null);
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
  const [showCapitalLabels, setShowCapitalLabels] = useState(true);
  const [isBgmEnabled, setIsBgmEnabled] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authNextPath, setAuthNextPath] = useState("/");
  const [accessBlockedOpen, setAccessBlockedOpen] = useState(false);
  const [directorateAccessOpen, setDirectorateAccessOpen] = useState(false);
  const [economySnapshot, setEconomySnapshot] =
    useState<EconomySnapshot | null>(null);
  const [countryApplicationBusy, setCountryApplicationBusy] = useState(false);
  const [countryApplicationError, setCountryApplicationError] = useState<string | null>(null);

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

  const enterCountryPlay = useCallback((country: MapCountryIndex) => {
    verifiedPlayCountryRef.current = country.key;
    setPlayCountry(country);
    setInspectedCountry(null);
    setActivePlayWindow("politics");
    storePlayCountryKey(country.key);
    setCountryPlayStep("closed");
    setSelection(null);
    setCountryApplicationError(null);
    window.history.replaceState({}, "", `/play/${country.key}`);
  }, []);

  const applyForCountry = useCallback(async (country: MapCountryIndex) => {
    setCountryApplicationBusy(true);
    setCountryApplicationError(null);
    setApplicationCountry(country);
    try {
      const result = await submitCountryApplication(country.key);
      if (!result.ok) {
        const messages: Record<string, string> = {
          COUNTRY_ALREADY_ASSIGNED: "이미 다른 국가가 Discord 계정에 배정되어 있습니다.",
          COUNTRY_ALREADY_CLAIMED: "이미 다른 Discord 계정에 배정된 국가입니다.",
        };
        setCountryApplicationError(messages[result.error ?? ""] ?? "국가 신청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }
      await refreshAuth();
      setCountryPlayStep("complete");
      return true;
    } finally {
      setCountryApplicationBusy(false);
    }
  }, [refreshAuth]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (authLoading) return;
    const match = window.location.pathname.match(/^\/(play|claim-country)\/([^/]+)$/u);
    if (!match) return;
    const country = mapCountries.find(
      (candidate) => candidate.key === decodeURIComponent(match[2]),
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
    if (!profile) {
      verifiedPlayCountryRef.current = null;
      setPlayCountry(null);
      clearPlayCountryKey();
      setAuthNextPath(`/claim-country/${country.key}`);
      setAuthModalOpen(true);
      setScreen("title");
      return;
    }
    setScreen("map");
    if (match[1] === "claim-country") {
      window.history.replaceState({}, "", "/");
      void applyForCountry(country);
      return;
    }
    if (profile.siteStatus !== "open" || !profile.countryKey) {
      verifiedPlayCountryRef.current = null;
      setPlayCountry(null);
      clearPlayCountryKey();
      const waitingCountry = profile.application
        ? mapCountries.find((candidate) => candidate.key === profile.application?.countryKey) ?? country
        : country;
      setApplicationCountry(waitingCountry);
      if (profile.application) setCountryPlayStep("complete");
      window.history.replaceState({}, "", "/");
      return;
    }
    const assignedCountry = mapCountries.find((candidate) => candidate.key === profile.countryKey);
    if (!assignedCountry || verifiedPlayCountryRef.current === assignedCountry.key) return;
    enterCountryPlay(assignedCountry);
  }, [applyForCountry, authLoading, enterCountryPlay, profile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* 개장 전에는 기존 세션이나 조작된 클라이언트 상태로도 플레이 HUD를 유지하지 않는다. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (authLoading || !playCountry) return;
    if (!profile || profile.siteStatus !== "open" || profile.countryKey !== playCountry.key) {
      verifiedPlayCountryRef.current = null;
      setPlayCountry(null);
      setInspectedCountry(null);
      setActivePlayWindow(null);
      clearPlayCountryKey();
      window.history.replaceState({}, "", "/");
    }
  }, [authLoading, playCountry, profile]);
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
    if (!profile) {
      setAuthNextPath(`/claim-country/${selection.country.key}`);
      setAuthModalOpen(true);
      return;
    }
    void applyForCountry(selection.country);
  }, [applyForCountry, profile, selection]);

  const closePlayWindow = useCallback(() => {
    setActivePlayWindow(null);
  }, []);

  useEffect(() => {
    const focusMilitaryFront = (event: Event) => {
      const kind = (event as CustomEvent<{ frontKind?: string }>).detail?.frontKind;
      setMapMode(kind === "NAVAL_AREA" ? "navy" : "army");
    };
    window.addEventListener("tlr:focus-military-front", focusMilitaryFront);
    return () => window.removeEventListener("tlr:focus-military-front", focusMilitaryFront);
  }, []);

  useEffect(() => {
    const requestAuthentication = () => {
      setAuthNextPath(playCountry ? `/play/${playCountry.key}` : "/");
      void refreshAuth().finally(() => setAuthModalOpen(true));
    };
    window.addEventListener("tlr:auth-required", requestAuthentication);
    return () => window.removeEventListener("tlr:auth-required", requestAuthentication);
  }, [playCountry, refreshAuth]);

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

  if (window.location.pathname === "/event-test") {
    return <EventTestPage />;
  }

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
            setAuthNextPath("/");
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
          nextPath={authNextPath}
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
          showCapitalLabels={showCapitalLabels}
          selectedCountry={highlightedCountry}
          selectedComponent={highlightedComponent}
          onCountrySelect={selectCountry}
          onWarReportSelect={(report) => {
            if (!playCountry) return;
            setActivePlayWindow("military");
            window.setTimeout(() => window.dispatchEvent(new CustomEvent("tlr:open-war-report", { detail: { reportId: report.id } })), 0);
          }}
        />
        {playCountry && playSimulationState ? (
          <PlayHud
            country={playCountry}
            state={playSimulationState}
            activeWindow={activePlayWindow}
            onOpenWindow={setActivePlayWindow}
            mapMode={mapMode}
            onChangeMapMode={setMapMode}
          />
        ) : null}
        <MapControls
          mapHandle={mapRef}
          mapMode={mapMode}
          onChangeMapMode={setMapMode}
          showProvinceBorders={showProvinceBorders}
          onToggleProvinceBorders={() =>
            updateProvinceBorders(!showProvinceBorders)
          }
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels((current) => !current)}
          showCapitalLabels={showCapitalLabels}
          onToggleCapitalLabels={() =>
            setShowCapitalLabels((current) => !current)
          }
          showMilitaryModes={!playCountry}
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
            onOpenWindow={setActivePlayWindow}
          />
        ) : null}
        {playCountry ? <DiplomacyNotificationQueue country={playCountry} /> : null}
        {playCountry ? <WarDeclarationAlert /> : null}
      </section>
      <CountryPlayFlow
        country={selection?.country ?? applicationCountry}
        step={countryPlayStep}
        onClose={() => { setCountryPlayStep("closed"); setApplicationCountry(null); }}
        onRequestConfirmation={() =>
          setCountryPlayStep("confirmation")
        }
        onBack={() => setCountryPlayStep("description")}
        onConfirm={confirmCountryPlay}
        busy={countryApplicationBusy}
        error={countryApplicationError}
      />
      <AuthModal
        open={authModalOpen}
        profile={profile}
        loading={authLoading}
        nextPath={authNextPath}
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
