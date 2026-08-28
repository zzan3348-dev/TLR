import { useEffect, useMemo, useRef, useState } from "react";
import { StrategyIcon } from "../../../components/StrategyIcon";
import type { MapCamera, ViewportSize } from "../../../types/mapCountry";
import type { Province } from "../../../types/province";
import type { MapMode } from "../../../types/faction";
import type { MilitaryFront, MilitaryMapState, NormalizedPoint, WarReport } from "../types";

type Props = {
  mode: Extract<MapMode, "army" | "navy" | "air">;
  state: MilitaryMapState;
  camera: MapCamera;
  viewport: ViewportSize;
  mapWidth: number;
  mapHeight: number;
  onReportSelect: (report: WarReport) => void;
};

function worldPoint(point: NormalizedPoint, mapWidth: number, mapHeight: number): NormalizedPoint {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    ? { x: point.x * mapWidth, y: point.y * mapHeight }
    : point;
}

function project(point: NormalizedPoint, copy: number, props: Pick<Props, "camera" | "viewport" | "mapWidth" | "mapHeight">) {
  const world = worldPoint(point, props.mapWidth, props.mapHeight);
  return {
    x: props.viewport.width / 2 + (world.x + copy * props.mapWidth - props.camera.x) * props.camera.scale,
    y: props.viewport.height / 2 + (world.y - props.camera.y) * props.camera.scale,
  };
}

function pathFor(front: MilitaryFront, copy: number, props: Props): string {
  return front.geometry.map((point, index) => {
    const screen = project(point, copy, props);
    return `${index === 0 ? "M" : "L"}${screen.x.toFixed(1)} ${screen.y.toFixed(1)}`;
  }).join(" ");
}

function visibleFront(front: MilitaryFront, mode: Props["mode"], state: MilitaryMapState): boolean {
  if (mode === "army") return front.front_kind === "LAND_LINE";
  if (mode === "navy") return front.front_kind === "NAVAL_AREA";
  return (state.forceSummaries.find((summary) => summary.frontId === front.id)?.airWings ?? 0) > 0;
}

function frontMidpoint(front: MilitaryFront): NormalizedPoint | null {
  return front.geometry.length ? front.geometry[Math.floor(front.geometry.length / 2)] : null;
}

const decodeMapId = (data: Uint8ClampedArray, offset: number) => data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);

async function buildOccupationLayer(provinceIds: Set<string>, mapWidth: number, mapHeight: number): Promise<HTMLCanvasElement> {
  const [idMap, provinces] = await Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = "/maps/generated/world-1932-province-id-map.png"; }),
    fetch("/maps/generated/map-provinces.json").then((response) => response.json() as Promise<Province[]>),
  ]);
  const sourceCanvas = document.createElement("canvas"); sourceCanvas.width = mapWidth; sourceCanvas.height = mapHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const layer = document.createElement("canvas"); layer.width = mapWidth; layer.height = mapHeight;
  const context = layer.getContext("2d");
  if (!sourceContext || !context) return layer;
  sourceContext.drawImage(idMap, 0, 0, mapWidth, mapHeight);
  for (const province of provinces) {
    if (!provinceIds.has(province.id)) continue;
    const { x, y, width, height } = province.bounds;
    const source = sourceContext.getImageData(x, y, width, height);
    const target = context.createImageData(width, height);
    for (let offset = 0; offset < source.data.length; offset += 4) {
      if (decodeMapId(source.data, offset) !== province.mapId) continue;
      const pixel = offset / 4; const localX = pixel % width; const localY = Math.floor(pixel / width);
      const hatch = (localX + localY) % 14 < 4;
      target.data[offset] = 183; target.data[offset + 1] = hatch ? 46 : 72; target.data[offset + 2] = hatch ? 39 : 54; target.data[offset + 3] = hatch ? 184 : 112;
    }
    context.putImageData(target, x, y);
  }
  return layer;
}

function OccupationMapLayer(props: Pick<Props, "state" | "camera" | "viewport" | "mapWidth" | "mapHeight">) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layer, setLayer] = useState<HTMLCanvasElement | null>(null);
  const provinceIds = useMemo(() => new Set(props.state.occupations.flatMap((occupation) => occupation.province_ids ?? [])), [props.state.occupations]);
  const signature = useMemo(() => [...provinceIds].sort().join("|"), [provinceIds]);
  useEffect(() => {
    let active = true;
    if (!signature) return () => { active = false; };
    const selectedProvinceIds = new Set(signature.split("|"));
    void buildOccupationLayer(selectedProvinceIds, props.mapWidth, props.mapHeight).then((nextLayer) => { if (active) setLayer(nextLayer); }).catch(() => undefined);
    return () => { active = false; };
  }, [props.mapHeight, props.mapWidth, signature]);
  useEffect(() => {
    const target = canvasRef.current; if (!target || !layer) return;
    const dpr = window.devicePixelRatio || 1;
    target.width = Math.max(1, Math.round(props.viewport.width * dpr)); target.height = Math.max(1, Math.round(props.viewport.height * dpr));
    const context = target.getContext("2d"); if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, props.viewport.width, props.viewport.height);
    for (const copy of [-1, 0, 1]) {
      const x = props.viewport.width / 2 + (copy * props.mapWidth - props.camera.x) * props.camera.scale;
      const y = props.viewport.height / 2 - props.camera.y * props.camera.scale;
      context.drawImage(layer, x, y, props.mapWidth * props.camera.scale, props.mapHeight * props.camera.scale);
    }
  }, [layer, props.camera.scale, props.camera.x, props.camera.y, props.mapHeight, props.mapWidth, props.viewport.height, props.viewport.width]);
  if (provinceIds.size === 0) return null;
  return <canvas ref={canvasRef} className="military-occupation-layer" aria-hidden="true" />;
}

export function MilitaryMapOverlay(props: Props) {
  const [reportFilter, setReportFilter] = useState<"RECENT" | "ALL" | "HIDDEN">("RECENT");
  const fronts = props.state.fronts.filter((front) => visibleFront(front, props.mode, props.state) && front.geometry.length >= 2);
  const latestReportTime = Math.max(0, ...props.state.reports.map((report) => Date.parse(report.report_world_date)));
  const recentThreshold = latestReportTime - 30 * 86_400_000;
  const reports = props.state.reports.filter((report) => report.marker !== null && reportFilter !== "HIDDEN" && (reportFilter === "ALL" || Date.parse(report.report_world_date) >= recentThreshold));
  const modeLabel = props.mode === "army" ? "육군 지도" : props.mode === "navy" ? "해군 지도" : "공군 지도";
  const modeIcon = `/assets/ui/generated-icons/world-control/${props.mode}-map.png`;
  const legendItems = props.mode === "army"
    ? ["전선 통제선", "점령 구역", "최근 교전 결과"]
    : props.mode === "navy"
      ? ["해상 수송 지원", "봉쇄·차단 구역", "상륙 지원"]
      : ["제공권 지원", "항공 정찰", "지상군 지원"];
  const copies = [-1, 0, 1] as const;
  return (
    <div className={`military-map-overlay military-map-overlay--${props.mode}`} aria-label={modeLabel}>
      {props.mode === "army" ? <OccupationMapLayer {...props} /> : null}
      <div className="military-map-overlay__mode-plate"><StrategyIcon name={props.mode === "army" ? "armyMap" : props.mode === "navy" ? "navyMap" : "airMap"} /><span>{modeLabel}</span><select aria-label="전투 결과 표시 범위" value={reportFilter} onChange={(event) => setReportFilter(event.target.value as typeof reportFilter)}><option value="RECENT">최근 30일</option><option value="ALL">전체 결과</option><option value="HIDDEN">결과 숨김</option></select></div>
      <svg className="military-map-overlay__fronts" viewBox={`0 0 ${props.viewport.width} ${props.viewport.height}`} aria-hidden="true">
        {copies.flatMap((copy) => fronts.map((front) => {
          const d = pathFor(front, copy, props);
          return <g key={`${front.id}:${copy}`} className="military-front-ribbon"><path className="military-front-ribbon__edge" d={d} /><path className="military-front-ribbon__core" d={d} /></g>;
        }))}
      </svg>
      {copies.flatMap((copy) => fronts.flatMap((front) => {
        const midpoint = frontMidpoint(front);
        if (!midpoint) return [];
        const screen = project(midpoint, copy, props);
        if (screen.x < -180 || screen.x > props.viewport.width + 180 || screen.y < -100 || screen.y > props.viewport.height + 100) return [];
        const summary = props.state.forceSummaries.find((item) => item.frontId === front.id);
        return [<div key={`label:${front.id}:${copy}`} className="military-front-counter" style={{ left: screen.x, top: screen.y }}>
          <strong>{front.display_name}</strong>
          <span><StrategyIcon name="armyMap" />{summary?.landUnits ?? 0}</span>
          <span><StrategyIcon name="navyMap" />{summary?.fleets ?? 0}</span>
          <span><StrategyIcon name="airMap" />{summary?.airWings ?? 0}</span>
        </div>];
      }))}
      {copies.flatMap((copy) => reports.flatMap((report) => {
        const screen = project(report.marker as NormalizedPoint, copy, props);
        if (screen.x < -40 || screen.x > props.viewport.width + 40 || screen.y < -40 || screen.y > props.viewport.height + 40) return [];
        const tone = report.marker_tone === "WIN" ? "win" : report.marker_tone === "LOSS" ? "loss" : "neutral";
        return [<button key={`report:${report.id}:${copy}`} type="button" className={`military-result-marker military-result-marker--${tone}`} style={{ left: screen.x, top: screen.y }} onClick={() => props.onReportSelect(report)} title={report.title} aria-label={`${report.title} 전쟁 보고서 열기`}><img src="/assets/ui/icons/military/battle-result.svg" alt="" /></button>];
      }))}
      <aside className="military-map-overlay__legend" aria-label={`${modeLabel} 범례`}>
        <header><img src={modeIcon} alt="" /><strong>{modeLabel} 관제</strong></header>
        {legendItems.map((item, index) => <span key={item}><i className={`military-map-overlay__legend-signal military-map-overlay__legend-signal--${index}`} />{item}<b>{index === 0 && fronts.length ? "활성" : "대기"}</b></span>)}
      </aside>
    </div>
  );
}
