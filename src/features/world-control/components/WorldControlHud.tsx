import { useCallback, useEffect, useState } from "react";
import { UiIcon } from "../../../components/UiIcon";
import type { MapMode } from "../../../types/faction";
import {
  HOLD_REASON_LABELS,
  SITUATION_LABELS,
  WORLD_MAP_MODES,
  type WorldControlOverview,
  type WorldTimeHoldReason,
} from "../types";
import { loadWorldControl, submitWorldTimeRequest } from "../worldControlClient";

type WorldControlHudProps = {
  countryKey: string;
  mapMode: MapMode;
  onChangeMapMode: (mode: MapMode) => void;
};

function formatWorldDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${year}년 ${month}월 ${day}일`;
}

export function WorldControlHud({ countryKey, mapMode, onChangeMapMode }: WorldControlHudProps) {
  const [data, setData] = useState<WorldControlOverview | null>(null);
  const [openPanel, setOpenPanel] = useState<"date" | "situation" | "hold" | null>(null);
  const [holdReason, setHoldReason] = useState<WorldTimeHoldReason>("MILITARY_OPERATION");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await loadWorldControl(countryKey, signal));
      setMessage(null);
    } catch {
      if (!signal?.aborted) setMessage("세계시간 기록을 불러오지 못했습니다.");
    }
  }, [countryKey]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorldControl(countryKey, controller.signal)
      .then((next) => {
        setData(next);
        setMessage(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("세계시간 기록을 불러오지 못했습니다.");
      });
    const listener = () => void reload();
    window.addEventListener("tlr:world-control-updated", listener);
    return () => {
      controller.abort();
      window.removeEventListener("tlr:world-control-updated", listener);
    };
  }, [countryKey, reload]);

  const submit = async (action: "ADVANCE" | "HOLD" | "CANCEL") => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await submitWorldTimeRequest(countryKey, action, holdReason, details);
      setData(next);
      setOpenPanel(action === "HOLD" ? "date" : null);
      setMessage(action === "CANCEL" ? "시간 요청을 취소했습니다." : action === "ADVANCE" ? "시간 진행 요청을 보냈습니다." : "시간 보류 요청을 보냈습니다.");
      window.dispatchEvent(new CustomEvent("tlr:world-control-updated"));
    } catch {
      setMessage("요청을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const requestLabel = data?.request.state === "ADVANCE"
    ? "진행 요청 중"
    : data?.request.state === "HOLD"
      ? "보류 요청 중"
      : data ? "요청 없음" : "확인 중";

  return (
    <section className="world-control-hud" aria-label="세계시간과 지도 상황">
      <div className="world-control-hud__clock">
        <button type="button" className="world-control-hud__request" disabled={busy || !data} onClick={() => setOpenPanel("hold")} aria-label="세계시간 보류 요청">
          <UiIcon name="worldControl/hold-time" alt="" />
        </button>
        <button type="button" className="world-control-hud__date" aria-expanded={openPanel === "date"} onClick={() => setOpenPanel(openPanel === "date" ? null : "date")}>
          <span>{data ? formatWorldDate(data.worldDate) : "—"}</span>
          <small>{requestLabel}</small>
        </button>
        <button type="button" className="world-control-hud__request" disabled={busy || !data} onClick={() => void submit("ADVANCE")} aria-label="세계시간 진행 요청">
          <UiIcon name="worldControl/advance-time" alt="" />
        </button>
      </div>

      <div className="world-control-hud__map-modes" role="group" aria-label="군종 지도 모드">
        {WORLD_MAP_MODES.map(({ mode, label, icon }) => (
          <button key={mode} type="button" aria-label={label} aria-pressed={mapMode === mode} onClick={() => onChangeMapMode(mapMode === mode ? "political" : mode)}>
            <UiIcon name={icon} alt={label} />
          </button>
        ))}
      </div>

      <button type="button" className="world-control-hud__situation" disabled={!data} data-level={data?.situationLevel} aria-label={data ? `세계상황 ${data.situationLevel}단계 ${SITUATION_LABELS[data.situationLevel] ?? ""}` : "세계상황 확인 중"} onClick={() => setOpenPanel(openPanel === "situation" ? null : "situation")}>
        {data ? <img src={`/assets/ui/world-control/situation-level-${data.situationLevel}.png`} alt="" /> : null}
        <strong>{data?.situationLevel ?? "—"}</strong>
      </button>

      {openPanel === "hold" ? (
        <form className="world-control-popover world-control-popover--hold" onSubmit={(event) => { event.preventDefault(); void submit("HOLD"); }}>
          <header><strong>세계시간 보류 요청</strong><button type="button" onClick={() => setOpenPanel(null)}>닫기</button></header>
          <p>보류는 관리자에게 사유를 전달하며 세계시간을 직접 멈추지 않습니다.</p>
          <label>사유<select value={holdReason} onChange={(event) => setHoldReason(event.target.value as WorldTimeHoldReason)}>{Object.entries(HOLD_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>상세 내용<textarea value={details} maxLength={500} onChange={(event) => setDetails(event.target.value)} placeholder="필요한 경우에만 입력" /></label>
          <button type="submit" disabled={busy}>보류 요청 보내기</button>
        </form>
      ) : null}

      {openPanel === "date" && data ? (
        <div className="world-control-popover world-control-popover--detail">
          <header><strong>세계시간 상세</strong><button type="button" onClick={() => setOpenPanel(null)}>닫기</button></header>
          <dl><div><dt>현재 날짜</dt><dd>{formatWorldDate(data.worldDate)}</dd></div><div><dt>우리 국가 요청</dt><dd>{requestLabel}</dd></div></dl>
          {data.request.state === "HOLD" && data.request.holdReason ? <p>{HOLD_REASON_LABELS[data.request.holdReason]}{data.request.details ? ` · ${data.request.details}` : ""}</p> : null}
          <h3>우리 국가 일정</h3>
          {data.schedules.length ? <ul>{data.schedules.map((schedule) => <li key={schedule.id}><span>{schedule.title}</span><time>{schedule.dueWorldDate}</time></li>)}</ul> : <p>등록된 연구·첩보 일정이 없습니다.</p>}
          {data.request.state !== "NONE" ? <button type="button" disabled={busy} onClick={() => void submit("CANCEL")}>현재 요청 취소</button> : null}
        </div>
      ) : null}

      {openPanel === "situation" && data ? (
        <div className="world-control-popover world-control-popover--situation">
          <header><strong>세계상황 {data.situationLevel}단계 · {SITUATION_LABELS[data.situationLevel]}</strong><button type="button" onClick={() => setOpenPanel(null)}>닫기</button></header>
          <img src={`/assets/ui/world-control/situation-level-${data.situationLevel}.png`} alt={`${SITUATION_LABELS[data.situationLevel]} 상태 표정`} />
          <p>{data.situationReason ?? "세계상황은 안정적으로 유지되고 있습니다."}</p>
          <small>최근 변경: {data.situationChangedWorldDate ?? "초기 상태"}</small>
        </div>
      ) : null}
      {message ? <p className="world-control-hud__message" role="status"><span>{message}</span>{!data ? <button type="button" onClick={() => void reload()}>다시 시도</button> : null}</p> : null}
    </section>
  );
}
