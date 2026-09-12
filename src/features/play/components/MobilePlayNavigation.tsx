import { useEffect, useState } from "react";
import { UiIcon } from "../../../components/UiIcon";
import type { MapMode } from "../../../types/faction";
import type { PrimaryWindow } from "../types";

type MobilePlayNavigationProps = {
  activeWindow: PrimaryWindow;
  onOpenWindow: (window: PrimaryWindow) => void;
  mapMode: MapMode;
  onChangeMapMode: (mode: MapMode) => void;
};

const MORE_WINDOWS: readonly { id: Exclude<PrimaryWindow, null>; label: string; icon: string; description: string }[] = [
  { id: "economy", label: "경제", icon: "menu/economy", description: "생산·재정·무역" },
  { id: "diplomacy", label: "외교", icon: "menu/diplomacy", description: "관계·협정·외교 행동" },
  { id: "intelligence", label: "첩보", icon: "menu/intelligence", description: "정보·방첩·작전" },
  { id: "research", label: "연구", icon: "menu/research", description: "연구 계획과 연구력" },
];

const MAP_MODES: readonly { id: MapMode; label: string; icon: string }[] = [
  { id: "political", label: "일반", icon: "menu/fit" },
  { id: "army", label: "육군", icon: "worldControl/army-map" },
  { id: "navy", label: "해군", icon: "worldControl/navy-map" },
  { id: "air", label: "공군", icon: "worldControl/air-map" },
];

export function MobilePlayNavigation({ activeWindow, onOpenWindow, mapMode, onChangeMapMode }: MobilePlayNavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen]);

  const open = (window: PrimaryWindow) => {
    setMoreOpen(false);
    onOpenWindow(window);
  };

  return (
    <>
      <nav className="mobile-play-nav" aria-label="모바일 플레이 메뉴">
        <button type="button" aria-pressed={activeWindow === null} onClick={() => open(null)}>
          <UiIcon name="menu/fit" /><small>지도</small>
        </button>
        <button type="button" aria-pressed={activeWindow === "politics"} onClick={() => open("politics")}>
          <UiIcon name="menu/politics" /><small>국가</small>
        </button>
        <button type="button" aria-pressed={activeWindow === "decisions"} onClick={() => open("decisions")}>
          <UiIcon name="menu/decisions" /><small>결정</small>
        </button>
        <button type="button" aria-pressed={activeWindow === "military"} onClick={() => open("military")}>
          <UiIcon name="sections/military" /><small>군사</small>
        </button>
        <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
          <UiIcon name="menu/intelligence" /><small>더보기</small>
        </button>
      </nav>

      {moreOpen ? (
        <aside className="mobile-more-sheet" aria-label="추가 플레이 메뉴">
          <header><div><small>COMMAND MENU</small><strong>더보기</strong></div><button type="button" onClick={() => setMoreOpen(false)}>닫기</button></header>
          <div className="mobile-more-sheet__windows">
            {MORE_WINDOWS.map((item) => (
              <button key={item.id} type="button" aria-pressed={activeWindow === item.id} onClick={() => open(item.id)}>
                <UiIcon name={item.icon} /><span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </div>
          <section>
            <h2>지도 모드</h2>
            <div className="mobile-more-sheet__map-modes">
              {MAP_MODES.map((item) => (
                <button key={item.id} type="button" aria-pressed={mapMode === item.id} onClick={() => { onChangeMapMode(item.id); setMoreOpen(false); }}>
                  <UiIcon name={item.icon} /><small>{item.label}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>
      ) : null}
    </>
  );
}
