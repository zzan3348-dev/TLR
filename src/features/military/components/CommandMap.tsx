import { useRef, useState } from "react";
import { WorldMap, type WorldMapHandle } from "../../../components/WorldMap";
import type { MapMode } from "../../../types/faction";

export function CommandMap({ countryKey }: { countryKey: string }) {
  const map = useRef<WorldMapHandle>(null);
  const [mode, setMode] = useState<MapMode>("army");
  return <section className="hq-map" aria-label="전쟁 지도" data-country={countryKey}>
    <WorldMap ref={map} militaryInteractionScope="headquarters" mapMode={mode} showProvinceBorders showLabels showCapitalLabels selectedCountry={null} selectedComponent={null} onCountrySelect={() => undefined} onWarReportSelect={(report) => window.dispatchEvent(new CustomEvent("tlr:open-war-report", { detail: { reportId: report.id } }))} />
    <div className="hq-map-tools">{(["army", "navy", "air"] as const).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "army" ? "육군" : value === "navy" ? "해군" : "공군"}</button>)}<button aria-label="지도 확대" onClick={() => map.current?.zoomIn()}>+</button><button aria-label="지도 축소" onClick={() => map.current?.zoomOut()}>−</button><button onClick={() => map.current?.resetView()}>전체 지도</button></div>
  </section>;
}
