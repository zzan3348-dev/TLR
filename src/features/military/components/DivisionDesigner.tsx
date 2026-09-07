import { useEffect, useState } from "react";
import { militaryMutation } from "../militaryClient";
import { militaryNumber } from "../headquartersModel";
import type { BattalionDefinition, MilitaryOverview, MilitaryTemplate } from "../types";

const emptyLine = () => Array<string | null>(25).fill(null);
const emptySupport = () => Array<string | null>(5).fill(null);
export function DivisionDesigner({ data, reload }: { data: MilitaryOverview; reload: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<BattalionDefinition[]>([]);
  const [template, setTemplate] = useState<MilitaryTemplate | null>(null);
  const [name, setName] = useState("");
  const [line, setLine] = useState(emptyLine);
  const [support, setSupport] = useState(emptySupport);
  const [slot, setSlot] = useState<{ kind: "LINE" | "SUPPORT"; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    void militaryMutation<BattalionDefinition[]>("templates", {}, "GET").then((rows) => { if (active) setCatalog(rows); }).catch(() => { if (active) setError("대대 목록을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, []);
  const select = (row: MilitaryTemplate | null, duplicate = false) => {
    setTemplate(duplicate ? null : row); setName(row ? `${row.display_name}${duplicate ? " 사본" : ""}` : "");
    setLine(row?.battalion_slots?.length === 25 ? [...row.battalion_slots] : emptyLine());
    setSupport(row?.support_slots?.length === 5 ? [...row.support_slots] : emptySupport()); setSlot(null); setError(null);
  };
  const place = (id: string | null) => {
    if (!slot) return;
    const update = (current: Array<string | null>) => current.map((entry, i) => i === slot.index ? id : entry);
    if (slot.kind === "LINE") setLine(update); else setSupport(update);
    setSlot(null);
  };
  const used = [...line, ...support].filter((id): id is string => id !== null).map((id) => catalog.find((row) => row.id === id));
  const sum = (key: "manpower_required" | "production_capacity_required" | "upkeep") => used.length && used.every((row) => row?.[key] != null) ? used.reduce((total, row) => total + Number(row?.[key]), 0) : null;
  const save = async () => {
    if (pending || !name.trim()) return;
    setPending(true); setError(null);
    try {
      const saved = await militaryMutation<MilitaryTemplate>("templates", { id: template?.id, expected_version: template?.version, display_name: name.trim(), battalion_slots: line, support_slots: support }, template?.country_key === data.countryKey && template.configuration_status === "PARTIAL" ? "PATCH" : "POST");
      setTemplate(saved); await reload();
    } catch { setError("편제를 저장하지 못했습니다. 다른 국가의 편제 또는 변경된 버전인지 확인해 주세요."); }
    finally { setPending(false); }
  };
  return <div className="hq-designer">
    <aside className="hq-panel"><h3>저장된 사단 편제</h3><button onClick={() => select(null)}>새 편제</button>{data.templates.filter((row) => row.force_kind === "LAND_UNIT").map((row) => <button key={row.id} className="hq-row" aria-pressed={template?.id === row.id} onClick={() => select(row)}>{row.display_name}</button>)}</aside>
    <section className="hq-panel"><label>편제 이름 <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><h3>전투 대대</h3><div className="hq-battalion-grid">{line.map((id, index) => <button key={index} aria-label={`${Math.floor(index / 5) + 1}행 ${index % 5 + 1}열 대대`} onClick={() => setSlot({ kind: "LINE", index })}><BattalionSlot row={catalog.find((row) => row.id === id)} occupied={id !== null} /></button>)}</div>
      <h3>지원 중대</h3><div className="hq-support-grid">{support.map((id, index) => <button key={index} aria-label={`지원 ${index + 1}`} onClick={() => setSlot({ kind: "SUPPORT", index })}><BattalionSlot row={catalog.find((row) => row.id === id)} occupied={id !== null} /></button>)}</div>
      {slot && <div className="hq-slot-picker" role="dialog" aria-label="대대 선택"><button onClick={() => setSlot(null)}>닫기</button><button onClick={() => place(null)}>비우기</button>{catalog.filter((row) => row.category === slot.kind).map((row) => <button key={row.id} onClick={() => place(row.id)}>{row.display_name}</button>)}{!catalog.some((row) => row.category === slot.kind) && <p>등록된 병과가 없습니다.</p>}</div>}
    </section><aside className="hq-panel"><h3>편제 요약</h3><dl className="hq-facts"><dt>인원 합계</dt><dd>{militaryNumber(sum("manpower_required"))}</dd><dt>생산능력 합계</dt><dd>{militaryNumber(sum("production_capacity_required"))}</dd><dt>유지비 합계</dt><dd>{militaryNumber(sum("upkeep"))}</dd><dt>승인된 편성 기간</dt><dd>{militaryNumber(template?.formation_days)}일</dd></dl><p>편제 변경 후 생산 비용과 기간의 승인이 필요합니다.</p>{error && <p role="alert">{error}</p>}<button onClick={() => void save()} disabled={pending || !name.trim()}>저장</button> <button disabled={!template} onClick={() => select(template, true)}>복제</button></aside>
  </div>;
}
function BattalionSlot({ row, occupied }: { row?: BattalionDefinition; occupied: boolean }) {
  if (!occupied) return <span>빈 슬롯</span>;
  return <>{row?.icon_path ? <img src={row.icon_path} alt="" /> : <small>아이콘 미설정</small>}<span>{row?.display_name ?? "병과 미설정"}</span></>;
}
