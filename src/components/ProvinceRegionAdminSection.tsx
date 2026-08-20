import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { MAP_ASSET_VERSION } from "../data/mapAssetVersion";
import type { Province, ProvinceRegion } from "../types/province";
import { normalizeProvinceRegion } from "../utils/provinceRegions";

type MapAssets = {
  fill: HTMLImageElement;
  lines: HTMLImageElement;
  idContext: CanvasRenderingContext2D;
  width: number;
  height: number;
};

type Camera = { zoom: number; panX: number; panY: number };
type PointerStart = { x: number; y: number; panX: number; panY: number; moved: boolean };

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`지도 에셋 로드 실패: ${src}`));
  image.src = `${src}?v=${encodeURIComponent(MAP_ASSET_VERSION)}`;
});

const decodeMapId = (pixel: Uint8ClampedArray) => pixel[0] | (pixel[1] << 8) | (pixel[2] << 16);

export function ProvinceRegionAdminSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<PointerStart | null>(null);
  const [assets, setAssets] = useState<MapAssets | null>(null);
  const [provinces, setProvinces] = useState<readonly Province[]>([]);
  const [regions, setRegions] = useState<ProvinceRegion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [camera, setCamera] = useState<Camera>({ zoom: 1, panX: 0, panY: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
  const [message, setMessage] = useState("지도 준비 중");

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadImage("/maps/generated/world-1932-fill.png"),
      loadImage("/maps/generated/world-1932-province-lines.png"),
      loadImage("/maps/generated/world-1932-province-id-map.png"),
      fetch(`/maps/generated/map-provinces.json?v=${encodeURIComponent(MAP_ASSET_VERSION)}`).then((response) => response.json() as Promise<Province[]>),
      fetch("/api/admin/province-regions", { credentials: "include" }).then(async (response) => response.ok ? response.json() as Promise<{ regions?: ProvinceRegion[] }> : { regions: [] }),
    ]).then(([fill, lines, idMap, provinceData, regionPayload]) => {
      if (!active) return;
      const idCanvas = document.createElement("canvas");
      idCanvas.width = idMap.naturalWidth;
      idCanvas.height = idMap.naturalHeight;
      const idContext = idCanvas.getContext("2d", { willReadFrequently: true });
      if (!idContext) throw new Error("프로빈스 ID Canvas를 만들 수 없습니다.");
      idContext.drawImage(idMap, 0, 0);
      const overlay = document.createElement("canvas");
      overlay.width = idMap.naturalWidth;
      overlay.height = idMap.naturalHeight;
      overlayRef.current = overlay;
      setAssets({ fill, lines, idContext, width: idMap.naturalWidth, height: idMap.naturalHeight });
      setProvinces(provinceData);
      setRegions(regionPayload.regions ?? []);
      setMessage(`프로빈스 ${provinceData.length.toLocaleString("ko-KR")}개 준비됨`);
    }).catch(() => active && setMessage("프로빈스 지도를 불러오지 못했습니다."));
    return () => { active = false; };
  }, []);

  const provinceByMapId = useMemo(() => new Map(provinces.map((province) => [province.mapId, province])), [provinces]);
  const provinceById = useMemo(() => new Map(provinces.map((province) => [province.id, province])), [provinces]);
  const selectedSignature = useMemo(() => [...selectedIds].sort().join("|"), [selectedIds]);

  useEffect(() => {
    if (!assets || !overlayRef.current) return;
    const overlay = overlayRef.current;
    const context = overlay.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, overlay.width, overlay.height);
    for (const provinceId of selectedIds) {
      const province = provinceById.get(provinceId);
      if (!province) continue;
      const { x, y, width, height } = province.bounds;
      const source = assets.idContext.getImageData(x, y, width, height);
      const target = context.createImageData(width, height);
      for (let offset = 0; offset < source.data.length; offset += 4) {
        if (decodeMapId(source.data.subarray(offset, offset + 4)) !== province.mapId) continue;
        target.data[offset] = 218;
        target.data[offset + 1] = 184;
        target.data[offset + 2] = 69;
        target.data[offset + 3] = 150;
      }
      context.putImageData(target, x, y);
    }
  }, [assets, provinceById, selectedIds]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#050b0f";
    context.fillRect(0, 0, width, height);
    const fit = Math.min(width / assets.width, height / assets.height);
    const scale = fit * camera.zoom;
    const originX = (width - assets.width * scale) / 2 + camera.panX;
    const originY = (height - assets.height * scale) / 2 + camera.panY;
    context.imageSmoothingEnabled = false;
    context.drawImage(assets.fill, originX, originY, assets.width * scale, assets.height * scale);
    if (overlayRef.current && selectedSignature) context.drawImage(overlayRef.current, originX, originY, assets.width * scale, assets.height * scale);
    context.drawImage(assets.lines, originX, originY, assets.width * scale, assets.height * scale);
  }, [assets, camera, selectedSignature]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const screenToMap = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !assets) return null;
    const bounds = canvas.getBoundingClientRect();
    const fit = Math.min(bounds.width / assets.width, bounds.height / assets.height);
    const scale = fit * camera.zoom;
    const originX = (bounds.width - assets.width * scale) / 2 + camera.panX;
    const originY = (bounds.height - assets.height * scale) / 2 + camera.panY;
    return {
      x: Math.floor((clientX - bounds.left - originX) / scale),
      y: Math.floor((clientY - bounds.top - originY) / scale),
    };
  };

  const findProvince = (x: number, y: number) => {
    if (!assets || x < 0 || y < 0 || x >= assets.width || y >= assets.height) return null;
    for (let radius = 0; radius <= 4; radius += 1) {
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (radius > 0 && Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue;
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleY < 0 || sampleX >= assets.width || sampleY >= assets.height) continue;
          const mapId = decodeMapId(assets.idContext.getImageData(sampleX, sampleY, 1, 1).data);
          const province = provinceByMapId.get(mapId);
          if (province) return province;
        }
      }
    }
    return null;
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, panX: camera.panX, panY: camera.panY, moved: false };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = pointerRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 3) start.moved = true;
    if (start.moved) setCamera((current) => ({ ...current, panX: start.panX + dx, panY: start.panY + dy }));
  };
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || start.moved) return;
    const point = screenToMap(event.clientX, event.clientY);
    if (!point) return;
    const province = findProvince(point.x, point.y);
    if (!province) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(province.id)) next.delete(province.id); else next.add(province.id);
      return next;
    });
  };
  const zoomMap = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
    setCamera((current) => ({ ...current, zoom: Math.min(12, Math.max(1, current.zoom * factor)) }));
  };

  const resetDraft = () => {
    setEditingId(null);
    setName("");
    setRegionId("");
    setSelectedIds(new Set());
    setMessage("새 지역을 선택하십시오.");
  };
  const editRegion = (region: ProvinceRegion) => {
    setEditingId(region.id);
    setName(region.name);
    setRegionId(region.id);
    setSelectedIds(new Set(region.provinceIds));
    setMessage(`${region.name} 불러옴`);
  };
  const saveRegion = async () => {
    const normalized = normalizeProvinceRegion({ id: regionId, name, provinceIds: [...selectedIds] });
    const response = await fetch("/api/admin/province-regions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });
    if (!response.ok) {
      setMessage("이름·ID·선택 프로빈스를 확인하십시오.");
      return;
    }
    setRegions((previous) => [...previous.filter((region) => region.id !== normalized.id), normalized].sort((a, b) => a.name.localeCompare(b.name, "ko")));
    setEditingId(normalized.id);
    setRegionId(normalized.id);
    setMessage("지역을 저장했습니다.");
  };
  const deleteRegion = async () => {
    if (!editingId) return;
    const response = await fetch("/api/admin/province-regions", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId }),
    });
    if (!response.ok) {
      setMessage("지역을 삭제하지 못했습니다.");
      return;
    }
    setRegions((previous) => previous.filter((region) => region.id !== editingId));
    resetDraft();
    setMessage("지역을 삭제했습니다.");
  };

  return (
    <section className="directorate-card province-region-admin">
      <header>
        <div><span>PROVINCE CONTROL / REGION REGISTRY</span><h2>프로빈스 지역 편집기</h2></div>
        <strong>{message}</strong>
      </header>
      <div className="province-region-admin__layout">
        <div className="province-region-admin__map-shell">
          <canvas
            ref={canvasRef}
            aria-label="프로빈스 선택 지도"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={() => { pointerRef.current = null; }}
            onWheel={zoomMap}
          />
          <div className="province-region-admin__map-controls">
            <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: Math.min(12, current.zoom * 1.3) }))}>＋</button>
            <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: Math.max(1, current.zoom / 1.3) }))}>－</button>
            <button type="button" onClick={() => setCamera({ zoom: 1, panX: 0, panY: 0 })}>전체</button>
          </div>
        </div>
        <aside className="province-region-admin__panel">
          <div className="province-region-admin__existing">
            <h3>저장된 지역</h3>
            <div>{regions.map((region) => <button type="button" className={editingId === region.id ? "is-active" : ""} key={region.id} onClick={() => editRegion(region)}><b>{region.name}</b><small>{region.id} · {region.provinceIds.length}개</small></button>)}</div>
          </div>
          <label>지역 이름<input value={name} onChange={(event) => { setName(event.target.value); if (!regionId) setRegionId(`region_${Date.now().toString(36)}`); }} placeholder="파리 대도시권" /></label>
          <label>Region ID<input value={regionId} onChange={(event) => setRegionId(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/gu, ""))} placeholder="paris_metro" /></label>
          <div className="province-region-admin__selection">
            <h3>선택된 프로빈스 <b>{selectedIds.size}개</b></h3>
            <ol>{[...selectedIds].sort().map((id) => <li key={id}>{id}</li>)}</ol>
          </div>
          <div className="province-region-admin__actions">
            <button type="button" onClick={() => setSelectedIds(new Set())}>선택 초기화</button>
            <button type="button" className="is-primary" onClick={() => void saveRegion()}>지역으로 저장</button>
            <button type="button" onClick={resetDraft}>새 지역</button>
            <button type="button" className="is-danger" disabled={!editingId} onClick={() => void deleteRegion()}>지역 삭제</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
