import { useState } from "react";
import { mapCountries } from "../data/mapCountries";

export function AdminPlayPreviewSection() {
  const [countryKey, setCountryKey] = useState(mapCountries[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enter = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryKey }) });
      if (!response.ok) throw new Error("PREVIEW_START_FAILED");
      window.location.assign(`/play/${encodeURIComponent(countryKey)}?mode=admin-preview`);
    } catch { setError("관리자 테스트 세션을 시작하지 못했습니다."); setBusy(false); }
  };
  return <section className="directorate-diplomacy directorate-preview" aria-labelledby="directorate-preview-title">
    <header><div><span>READ-ONLY PLAY INSPECTION</span><h2 id="directorate-preview-title">플레이 화면 테스트</h2></div><strong>DB 배정 없음 · PRE_OPEN 허용</strong></header>
    <div className="directorate-preview__body">
      <label>테스트 국가<select value={countryKey} onChange={(event) => setCountryKey(event.target.value)}>{mapCountries.map((country) => <option key={country.key} value={country.key}>{country.name}</option>)}</select></label>
      <button type="button" disabled={busy || !countryKey} onClick={() => void enter()}>{busy ? "준비 중…" : "테스트 입장"}</button>
      <p>읽기 전용 미리보기입니다. 국가 배정·신청·개장 상태와 게임 데이터는 변경하지 않습니다.</p>
      {error ? <p className="directorate-diplomacy__error" role="alert">{error}</p> : null}
    </div>
  </section>;
}
