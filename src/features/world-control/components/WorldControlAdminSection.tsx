import { useMemo, useState } from "react";
import { mapCountries } from "../../../data/mapCountries";
import { HOLD_REASON_LABELS, SITUATION_LABELS, type WorldControlAdminData, type WorldTimeAdvancePreview } from "../types";

type Props = {
  data: WorldControlAdminData;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
};

function countryName(key: string): string {
  return mapCountries.find((country) => country.key === key)?.name ?? key;
}

export function WorldControlAdminSection({ data, onReload, onError }: Props) {
  const [level, setLevel] = useState(data.situationLevel);
  const [reason, setReason] = useState(data.situationReason ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [targetWorldDate, setTargetWorldDate] = useState(data.worldDate);
  const [timeReason, setTimeReason] = useState("");
  const [timePreview, setTimePreview] = useState<WorldTimeAdvancePreview | null>(null);
  const grouped = useMemo(() => ({
    advance: data.requests.filter((row) => row.state === "ADVANCE"),
    hold: data.requests.filter((row) => row.state === "HOLD"),
  }), [data.requests]);

  const run = async (action: "PREVIEW_SITUATION" | "SET_SITUATION") => {
    if (!reason.trim()) { onError("세계상황 변경 사유를 입력하십시오."); return; }
    setBusy(true);
    onError(null);
    try {
      const response = await fetch("/api/admin/world-control", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, level, reason }),
      });
      if (!response.ok) throw new Error("WORLD_CONTROL_ADMIN_FAILED");
      if (action === "PREVIEW_SITUATION") {
        setPreview(`${data.situationLevel}단계 ${SITUATION_LABELS[data.situationLevel]} → ${level}단계 ${SITUATION_LABELS[level]}`);
      } else {
        setPreview(null);
        await onReload();
      }
    } catch { onError("세계상황 관제 작업을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const runWorldTime = async (action: "PREVIEW_WORLD_TIME" | "ADVANCE_WORLD_TIME") => {
    if (!timeReason.trim()) { onError("세계시간 진행 사유를 입력하십시오."); return; }
    setBusy(true); onError(null);
    try {
      const response = await fetch("/api/admin/world-control", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, targetWorldDate, reason: timeReason, idempotencyKey: action === "ADVANCE_WORLD_TIME" ? `world-time:${data.worldDate}:${targetWorldDate}:${Date.now()}` : undefined }) });
      const payload = await response.json() as WorldTimeAdvancePreview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "WORLD_TIME_ADMIN_FAILED");
      if (action === "PREVIEW_WORLD_TIME") setTimePreview(payload);
      else { setTimePreview(null); await onReload(); }
    } catch (error) { onError(error instanceof Error ? error.message : "세계시간 진행을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return (
    <section className="directorate-diplomacy world-control-admin" aria-labelledby="world-control-admin-title">
      <header><div><span>WORLD CLOCK / REQUEST CONTROL</span><h2 id="world-control-admin-title">세계시간·상황 관제</h2></div><strong>{data.worldDate} · 진행 {data.counts.advance} / 보류 {data.counts.hold} / 미응답 {data.counts.none}</strong></header>
      <div className="world-control-admin__situation">
        <img src={`/assets/ui/world-control/situation-level-${data.situationLevel}.png`} alt={`현재 세계상황 ${data.situationLevel}단계`} />
        <div><small>CURRENT SITUATION</small><h3>{data.situationLevel}단계 · {SITUATION_LABELS[data.situationLevel]}</h3><p>{data.situationReason ?? "초기 안정 상태"}</p></div>
        <label>단계<select value={level} onChange={(event) => setLevel(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} · {SITUATION_LABELS[value]}</option>)}</select></label>
        <label>변경 사유<input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="directorate-diplomacy__buttons"><button type="button" disabled={busy} onClick={() => void run("PREVIEW_SITUATION")}>미리보기</button><button type="button" disabled={busy || !preview} onClick={() => void run("SET_SITUATION")}>변경 확정</button></div>
        {preview ? <strong className="world-control-admin__preview">{preview}</strong> : null}
      </div>
      <div className="world-control-admin__time-advance">
        <header><div><small>WORLD DATE ADVANCE</small><h3>세계시간 진행</h3></div><strong>{data.worldDate}</strong></header>
        <label>목표 세계날짜<input type="date" min={data.worldDate} value={targetWorldDate} onChange={(event) => { setTargetWorldDate(event.target.value); setTimePreview(null); }} /></label>
        <label>진행 사유<input value={timeReason} maxLength={1000} onChange={(event) => { setTimeReason(event.target.value); setTimePreview(null); }} /></label>
        <div className="directorate-diplomacy__buttons"><button type="button" disabled={busy || targetWorldDate <= data.worldDate} onClick={() => void runWorldTime("PREVIEW_WORLD_TIME")}>진행 미리보기</button><button type="button" disabled={busy || !timePreview} onClick={() => void runWorldTime("ADVANCE_WORLD_TIME")}>확정 실행</button></div>
        {timePreview ? <section className="world-control-admin__time-preview"><h4>{timePreview.currentWorldDate} → {timePreview.targetWorldDate}</h4><div><strong>날짜 기반 처리</strong>{timePreview.dateBasedProcesses.map((item) => <span key={item}>{item}</span>)}</div><div><strong>턴 기반 처리</strong><span>{timePreview.currentTurnNumber == null ? "턴 미설정" : `${timePreview.currentTurnNumber}턴 → ${timePreview.resultingTurnNumber}턴`}</span>{timePreview.turnBasedProcesses.map((item) => <span key={item}>{item}</span>)}</div><p>통과하는 턴 경계 {timePreview.crossedTurnBoundaries.length}개</p></section> : null}
      </div>
      <div className="world-control-admin__columns">
        <div><h3>시간 진행 요청</h3>{grouped.advance.length ? grouped.advance.map((row) => <article key={row.countryKey}><b>{countryName(row.countryKey)}</b><time>{row.requestedWorldDate} · {new Date(row.updatedAt).toLocaleString("ko-KR")}</time></article>) : <p>요청 없음</p>}</div>
        <div><h3>시간 보류 요청</h3>{grouped.hold.length ? grouped.hold.map((row) => <article key={row.countryKey}><b>{countryName(row.countryKey)}</b><span>{row.requestedWorldDate} · {row.holdReason ? HOLD_REASON_LABELS[row.holdReason] : "사유 없음"}{row.details ? ` · ${row.details}` : ""}</span></article>) : <p>요청 없음</p>}</div>
        <details><summary>미응답 국가 {data.noRequestCountryKeys.length}개</summary><p>{data.noRequestCountryKeys.map(countryName).join(" · ") || "없음"}</p></details>
      </div>
    </section>
  );
}
