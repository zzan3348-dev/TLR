import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { initialMapCapitals, mergeMapCapitals } from "../data/mapCapitals";
import { mapCountries } from "../data/mapCountries";
import type { MapCapitalRecord } from "../types/mapMarker";

const MAP_WIDTH = 5616;
const MAP_HEIGHT = 2160;

export function MapCapitalAdminSection() {
  const [capitals, setCapitals] = useState<readonly MapCapitalRecord[]>(initialMapCapitals);
  const [countryKey, setCountryKey] = useState(mapCountries[0]?.key ?? "");
  const [drafts, setDrafts] = useState<
    Record<string, Partial<MapCapitalRecord>>
  >({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/admin/map-capitals", { credentials: "include" })
      .then(async (response) => response.ok ? response.json() : { capitals: [] })
      .then((payload: { capitals?: Array<{ country_key: string; name: string; map_x: number | null; map_y: number | null; enabled: boolean }> }) => {
        const remote = (payload.capitals ?? []).map((capital) => ({
          countryKey: capital.country_key,
          name: capital.name,
          x: capital.map_x,
          y: capital.map_y,
          enabled: capital.enabled,
        }));
        setCapitals(mergeMapCapitals(initialMapCapitals, remote));
      })
      .catch(() => undefined);
  }, []);

  const current = useMemo(
    () => capitals.find((capital) => capital.countryKey === countryKey) ?? null,
    [capitals, countryKey],
  );
  const draft = drafts[countryKey];
  const name = draft?.name ?? current?.name ?? "";
  const x = draft?.x !== undefined ? draft.x : current?.x ?? null;
  const y = draft?.y !== undefined ? draft.y : current?.y ?? null;
  const enabled = draft?.enabled ?? current?.enabled ?? true;
  const updateDraft = (next: Partial<MapCapitalRecord>) => {
    setDrafts((previous) => ({
      ...previous,
      [countryKey]: { ...previous[countryKey], ...next },
    }));
  };

  const choosePoint = (event: MouseEvent<HTMLImageElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    updateDraft({
      x: Math.round(((event.clientX - bounds.left) / bounds.width) * MAP_WIDTH),
      y: Math.round(((event.clientY - bounds.top) / bounds.height) * MAP_HEIGHT),
    });
  };

  const save = async () => {
    if (!name.trim() || x === null || y === null) {
      setMessage("수도명과 지도 위치를 지정하십시오.");
      return;
    }
    const response = await fetch("/api/admin/map-capitals", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryKey, name, x, y, enabled }),
    });
    if (!response.ok) {
      setMessage("저장하지 못했습니다.");
      return;
    }
    const next = { countryKey, name: name.trim(), x, y, enabled };
    setCapitals((previous) => mergeMapCapitals(previous, [next]));
    setDrafts((previous) => {
      const { [countryKey]: _removed, ...rest } = previous;
      void _removed;
      return rest;
    });
    setMessage("수도 위치가 저장되었습니다.");
  };

  const remove = async () => {
    const response = await fetch("/api/admin/map-capitals", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryKey }),
    });
    if (!response.ok) {
      setMessage("삭제하지 못했습니다.");
      return;
    }
    setCapitals((previous) => previous.filter((capital) => capital.countryKey !== countryKey));
    setDrafts((previous) => ({
      ...previous,
      [countryKey]: { name: "", x: null, y: null, enabled: true },
    }));
    setMessage("수도 정보가 제거되었습니다.");
  };

  return (
    <section className="directorate-card capital-admin">
      <header>
        <span>STRATEGIC CARTOGRAPHY</span>
        <h2>수도 좌표 관제</h2>
      </header>
      <div className="capital-admin__fields">
        <label>국가<select value={countryKey} onChange={(event) => { setCountryKey(event.target.value); setMessage(""); }}>{mapCountries.map((country) => <option key={country.key} value={country.key}>{country.name}</option>)}</select></label>
        <label>수도명<input value={name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
        <label>X<input type="number" value={x ?? ""} onChange={(event) => updateDraft({ x: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label>Y<input type="number" value={y ?? ""} onChange={(event) => updateDraft({ y: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label className="capital-admin__check"><input type="checkbox" checked={enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} />표시</label>
      </div>
      <div className="capital-admin__map">
        <img src="/maps/world-1932.png" alt="수도 위치 지정용 세계지도" draggable={false} onClick={choosePoint} />
        {x !== null && y !== null ? <span style={{ left: `${(x / MAP_WIDTH) * 100}%`, top: `${(y / MAP_HEIGHT) * 100}%` }}>★</span> : null}
      </div>
      <div className="capital-admin__actions"><button type="button" onClick={save}>좌표 저장</button><button type="button" onClick={remove}>수도 제거</button><output>{message}</output></div>
    </section>
  );
}
