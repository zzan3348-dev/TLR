import type { WorldMapHandle } from "./WorldMap";
import { StrategyIcon } from "./StrategyIcon";
import type { MapMode } from "../types/faction";

type MapControlsProps = {
  mapHandle: React.RefObject<WorldMapHandle | null>;
  mapMode: MapMode;
  onChangeMapMode: (mode: MapMode) => void;
  showProvinceBorders: boolean;
  onToggleProvinceBorders: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showCapitalLabels: boolean;
  onToggleCapitalLabels: () => void;
};

export function MapControls({
  mapHandle,
  mapMode,
  onChangeMapMode,
  showProvinceBorders,
  onToggleProvinceBorders,
  showLabels,
  onToggleLabels,
  showCapitalLabels,
  onToggleCapitalLabels,
}: MapControlsProps) {
  return (
    <div
      className="map-controls"
      role="group"
      aria-label="지도 도구"
    >
      <button
        type="button"
        onClick={() => onChangeMapMode(mapMode === "faction" ? "political" : "faction")}
        aria-label={
          mapMode === "faction"
            ? "정치지도로 돌아가기"
            : "세력지도 표시"
        }
        aria-pressed={mapMode === "faction"}
      >
        <StrategyIcon name="faction" />
        <small>
          {mapMode === "faction" ? "정치지도" : "세력지도"}
        </small>
      </button>
      {([[
        "army", "armyMap", "육군 지도",
      ], ["navy", "navyMap", "해군 지도"], ["air", "airMap", "공군 지도"]] as const).map(([mode, icon, label]) => (
        <button
          key={mode}
          type="button"
          className="map-controls__military"
          onClick={() => onChangeMapMode(mapMode === mode ? "political" : mode)}
          aria-label={`${label} 표시`}
          aria-pressed={mapMode === mode}
        >
          <StrategyIcon name={icon} />
          <small>{label}</small>
        </button>
      ))}
      <button
        type="button"
        onClick={onToggleProvinceBorders}
        aria-label={
          showProvinceBorders
            ? "프로빈스 경계 숨기기"
            : "프로빈스 경계 표시"
        }
        aria-pressed={showProvinceBorders}
      >
        <StrategyIcon name="province" />
        <small>프로빈스</small>
      </button>
      <button
        type="button"
        onClick={onToggleLabels}
        aria-label={showLabels ? "국명 숨기기" : "국명 표시"}
        aria-pressed={showLabels}
      >
        <StrategyIcon name="layers" />
        <small>{showLabels ? "국명" : "국명 꺼짐"}</small>
      </button>
      <button
        type="button"
        onClick={onToggleCapitalLabels}
        aria-label={showCapitalLabels ? "수도명 숨기기" : "수도명 표시"}
        aria-pressed={showCapitalLabels}
      >
        <StrategyIcon name="capital" />
        <small>{showCapitalLabels ? "수도명" : "수도명 꺼짐"}</small>
      </button>
      <button
        type="button"
        className="map-controls__fit"
        onClick={() => mapHandle.current?.resetView()}
        aria-label="전체 지도 보기"
      >
        <StrategyIcon name="fit" />
        <small>전체 지도</small>
      </button>
      <button
        type="button"
        onClick={() => mapHandle.current?.zoomIn()}
        aria-label="지도 확대"
      >
        <StrategyIcon name="plus" />
        <small>확대</small>
      </button>
      <button
        type="button"
        onClick={() => mapHandle.current?.zoomOut()}
        aria-label="지도 축소"
      >
        <StrategyIcon name="minus" />
        <small>축소</small>
      </button>
    </div>
  );
}
