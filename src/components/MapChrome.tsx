import { useEffect, useRef } from "react";

type TopBarProps = {
  isSettingsOpen: boolean;
  isBgmEnabled: boolean;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  onToggleBgm: () => void;
  onBackToTitle: () => void;
};

export function TopBar({
  isSettingsOpen,
  isBgmEnabled,
  onToggleSettings,
  onCloseSettings,
  onToggleBgm,
  onBackToTitle,
}: TopBarProps) {
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    const handleOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target)
      ) {
        onCloseSettings();
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [isSettingsOpen, onCloseSettings]);

  return (
    <header className="top-bar">
      <button
        type="button"
        className="map-back-button"
        onClick={onBackToTitle}
        aria-label="타이틀 화면으로 돌아가기"
      >
        타이틀
      </button>
      <div className="settings-anchor" ref={settingsRef}>
        <button
          type="button"
          className="menu-button"
          onClick={onToggleSettings}
          aria-label={isSettingsOpen ? "지도 설정 닫기" : "지도 설정 열기"}
          aria-expanded={isSettingsOpen}
          aria-controls="map-settings-menu"
        >
          <span className="menu-button__line" aria-hidden="true" />
          <span className="menu-button__line" aria-hidden="true" />
          <span className="menu-button__line" aria-hidden="true" />
        </button>
        <div
          id="map-settings-menu"
          className="settings-menu"
          data-open={isSettingsOpen}
          aria-hidden={!isSettingsOpen}
          inert={!isSettingsOpen}
        >
          <div className="settings-menu__heading">
            <strong>음향 설정</strong>
          </div>
          <label className="settings-toggle">
            <span className="settings-toggle__copy">
              <strong>배경 음악</strong>
              <small>{isBgmEnabled ? "BGM 재생 중" : "BGM 꺼짐"}</small>
            </span>
            <input
              type="checkbox"
              checked={isBgmEnabled}
              onChange={onToggleBgm}
            />
            <span className="settings-toggle__track" aria-hidden="true">
              <span />
            </span>
          </label>
        </div>
      </div>
    </header>
  );
}
