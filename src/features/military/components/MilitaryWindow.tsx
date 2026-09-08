import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { mapCountries } from "../../../data/mapCountries";
import { fetchMilitaryOverview, militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import { OfficerCorpsPanel } from "./OfficerCorpsPanel";
import { FleetOrganizer } from "./FleetOrganizer";
import { DivisionDesigner } from "./DivisionDesigner";
import { ConflictWindow } from "./ConflictWindow";
import { WarReportWindow } from "./WarReportWindow";
import { militaryLabel } from "../militaryLabels";
import { productionProgress, militaryNumber, serviceForces } from "../headquartersModel";
import type { ForceKind, MilitaryFront, MilitaryOverview, MilitaryTemplate, WarReport } from "../types";
import "./headquarters.css";
import { MilitaryIcon, type MilitaryIconName } from "./MilitaryIcon";

type Tab = "overview" | "forces" | "production" | "thought" | "war";
const TABS: [Tab, string][] = [["overview", "개요"], ["forces", "전력"], ["production", "편성·생산"], ["thought", "군사사상"], ["war", "전쟁"]];
const SERVICES: [ForceKind, string][] = [["LAND_UNIT", "육군"], ["VESSEL", "해군"], ["AIR_WING", "공군"]];
const SERVICE_ICON: Record<ForceKind, MilitaryIconName> = { LAND_UNIT:"army", VESSEL:"navy", AIR_WING:"air" };
const TAB_ICON: Record<Tab, MilitaryIconName> = { overview:"doctrine", forces:"army", production:"production", thought:"doctrine", war:"offensive" };
const query = <T,>(url: string) => militaryMutation<T>(url, {}, "GET");
const HeadquartersAdmin = lazy(() => import("./HeadquartersAdmin").then((module) => ({ default: module.HeadquartersAdmin })));

export function MilitaryWindow({ countryKey, onClose }: { countryKey: string; onClose: () => void; onOpenDiplomacy?: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<MilitaryOverview | null>(null);
  const [reports, setReports] = useState<WarReport[]>([]);
  const [fronts, setFronts] = useState<MilitaryFront[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const generation = useRef(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    let current = true;
    void fetch("/api/admin/session", { credentials: "include" }).then((result) => { if (current) setIsAdmin(result.ok); }).catch(() => { if (current) setIsAdmin(false); });
    return () => { current = false; };
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(null);
    try {
      const data = await fetchMilitaryOverview(countryKey);
      if (generation.current !== current) return;
      setOverview(data);
      const [reportResult, frontResult] = await Promise.allSettled([
        query<WarReport[]>(MILITARY_ROUTES.reports),
        Promise.all(data.conflicts.map((war) => query<MilitaryFront[]>(`${MILITARY_ROUTES.fronts}?conflict_id=${war.id}`))),
      ]);
      if (generation.current !== current) return;
      setReports(reportResult.status === "fulfilled" ? reportResult.value : []);
      setFronts(frontResult.status === "fulfilled" ? frontResult.value.flat() : []);
      if (reportResult.status === "rejected" || frontResult.status === "rejected") setError("전선 또는 보고서를 불러오지 못했습니다. 다시 시도해 주세요.");
    } catch { if (generation.current === current) { setOverview(null); setError("군사 정보를 불러오지 못했습니다. 다시 시도해 주세요."); } }
    finally { if (generation.current === current) setLoading(false); }
  }, [countryKey]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => { generation.current += 1; };
  }, [load]);
  useEffect(() => {
    const open = (event: Event) => setReportId((event as CustomEvent<{ reportId: string }>).detail.reportId);
    window.addEventListener("tlr:open-war-report", open);
    return () => window.removeEventListener("tlr:open-war-report", open);
  }, []);
  if (reportId) return <WarReportWindow initialReportId={reportId} onClose={() => setReportId(null)} />;
  const name = mapCountries.find((country) => country.key === countryKey)?.name ?? countryKey;
  return <StrategicWindow title="군사 사령부" eyebrow={`${name}${overview ? ` · ${overview.worldDate}` : ""}`} className="military-hq" onClose={onClose} headerControls={<button className="hq-help-button" type="button" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}>도움말</button>}>
    {helpOpen && <div className="hq-help" role="note">전력에서 부대를 확인하고, 편성·생산에서 새 편성을 준비합니다. 전쟁에서는 전선을 선택한 뒤 지도에 작전 경로를 지정하고 초안을 제출하십시오. 전투 결과는 관리자 판정으로 반영되며 실시간 자동 이동은 없습니다.</div>}
    {isAdmin && <label className="hq-admin-switch"><input type="checkbox" checked={adminMode} onChange={(event) => setAdminMode(event.target.checked)} />관리자 모드</label>}
    <nav className="hq-tabs" aria-label="군사 사령부">{TABS.map(([key, label]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}><MilitaryIcon name={TAB_ICON[key]} />{label}</button>)}</nav>
    {error && <div role="alert" className="hq-error">{error} <button onClick={() => void load()}>다시 불러오기</button></div>}
    {loading && !overview ? <p role="status">군사 정보 불러오는 중…</p> : overview && <div className={`hq-content${tab === "war" && !adminMode ? " hq-content--war" : ""}`} aria-busy={loading}>
      {tab === "overview" && <Overview data={overview} reports={reports} onReport={setReportId} onWar={() => setTab("war")} />}
      {tab === "forces" && <Forces data={overview} fronts={fronts} reload={load} />}
      {tab === "production" && <Production data={overview} reload={load} />}
      {tab === "thought" && <OfficerCorpsPanel countryKey={countryKey} />}
      {tab === "war" && (adminMode && isAdmin ? <Suspense fallback={<p>관리자 기능 불러오는 중…</p>}><HeadquartersAdmin /></Suspense> : <ConflictWindow embedded countryKey={countryKey} onClose={() => setTab("overview")} />)}
    </div>}
  </StrategicWindow>;
}

function Overview({ data, reports, onReport, onWar }: { data: MilitaryOverview; reports: WarReport[]; onReport: (id: string) => void; onWar: () => void }) {
  const metrics = [["가용 인력", militaryNumber(data.manpower.available)], ["현역 인원", militaryNumber(data.manpower.active)], ["육군 사단", `${data.units.length}개`], ["함선", `${data.vessels.filter((v) => !["SUNK", "RETIRED"].includes(v.status)).length}척`], ["항공 편성", `${data.airWings.length}개`], ["군사 지출", militaryNumber(data.militaryExpenditure)]];
  return <div className="hq-overview">
    <div className="hq-metrics">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="hq-two-columns">
      <section className="hq-panel"><h3>전군 현황</h3>{SERVICES.map(([kind, label]) => {
        const forces = serviceForces(data, kind);
        return <div className="hq-service" key={kind}><MilitaryIcon name={SERVICE_ICON[kind]} /><strong>{label}</strong><span>{forces.length} {kind === "VESSEL" ? "척 (기록 포함)" : "편성"}</span><span>배속 {forces.filter((f) => f.frontId).length}</span></div>;
      })}</section>
      <section className="hq-panel"><h3>현재 전쟁</h3>{data.conflicts.length ? data.conflicts.map((war) => <button className="hq-row" key={war.id} onClick={onWar}><strong>{war.display_name}</strong><span>{militaryLabel(war.status)}</span></button>) : <p>현재 진행 중인 전쟁이 없습니다.</p>}</section>
    </div>
    <section className="hq-panel"><h3>최근 보고 및 생산 일정</h3>{!reports.length && !data.queues.length && <p>등록된 보고 및 생산 일정이 없습니다.</p>}
      {[...reports].sort((a, b) => b.report_world_date.localeCompare(a.report_world_date)).slice(0, 10).map((report) => <button className={`hq-row hq-tone-${report.marker_tone ?? "NEUTRAL"}`} key={report.id} onClick={() => onReport(report.id)}><time>{report.report_world_date}</time><strong>{report.title}</strong><span>보고서 열기</span></button>)}
      {data.queues.map((queue) => <div className="hq-row" key={queue.id}><time>{queue.completion_world_date}</time><strong>{queue.requested_name}</strong><span>{militaryLabel(queue.status)}</span></div>)}
    </section>
  </div>;
}

function Forces({ data, fronts, reload }: { data: MilitaryOverview; fronts: MilitaryFront[]; reload: () => Promise<void> }) {
  const [kind, setKind] = useState<ForceKind>("LAND_UNIT");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const forces = serviceForces(data, kind);
  const filtered = forces.filter((force) => force.name.includes(search) && (!status || force.status === status));
  const selected = filtered.find((force) => force.id === selectedId) ?? filtered[0];
  const update = async (payload: Record<string, unknown>) => {
    if (!selected || pending) return;
    setPending(true); setError(null);
    try { await militaryMutation(MILITARY_ROUTES.forces, { object_kind: kind, object_id: selected.id, ...payload }, "PATCH"); await reload(); }
    catch { setError("변경하지 못했습니다. 권한과 편성 상태를 확인해 주세요."); }
    finally { setPending(false); }
  };
  return <><div className="hq-subtabs">{SERVICES.map(([key, label]) => <button key={key} aria-pressed={kind === key} onClick={() => { setKind(key); setSelectedId(""); setStatus(""); }}><MilitaryIcon name={SERVICE_ICON[key]} />{label}</button>)}</div>
    {kind === "VESSEL" && <FleetOrganizer data={data} reload={reload} />}
    {error && <p role="alert">{error}</p>}<div className="hq-force-layout">
      <aside className="hq-panel hq-force-list"><label>편성 검색<input value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">전체</option>{[...new Set(forces.map((f) => f.status))].map((value) => <option key={value} value={value}>{militaryLabel(value)}</option>)}</select></label>
        {filtered.map((force) => <button key={force.id} className="hq-row hq-force-art-row" aria-pressed={selected?.id === force.id} onClick={() => setSelectedId(force.id)}><MilitaryIcon name={SERVICE_ICON[kind]} /><span><strong>{force.name}</strong><small>{force.templateName} · {militaryLabel(force.status)}</small></span></button>)}{!filtered.length && <p>해당 전력이 없습니다.</p>}
      </aside>
      <section className="hq-panel">{selected ? <><h3>{selected.name}</h3><p>{selected.templateName}</p><dl className="hq-facts">
        <dt>상태</dt><dd>{militaryLabel(selected.status)}</dd><dt>현재 / 최대 인원</dt><dd>{militaryNumber(selected.personnel)} / {militaryNumber(selected.maximum)}</dd>
        <dt>충원율</dt><dd>{selected.personnel !== null && selected.maximum ? `${(selected.personnel / selected.maximum * 100).toFixed(1)}%` : "미설정"}</dd>
        <dt>준비도</dt><dd>{militaryNumber(selected.readiness)}{selected.readiness !== null ? "%" : ""}</dd><dt>훈련 수준</dt><dd>{militaryNumber(selected.training)}</dd>
        <dt>소속 전선</dt><dd>{fronts.find((front) => front.id === selected.frontId)?.display_name ?? "미배속"}</dd>
        {kind === "VESSEL" && <><dt>소속 함대</dt><dd>{data.fleets.find((fleet) => fleet.id === selected.fleetId)?.display_name ?? "미배속"}</dd></>}
      </dl><form className="hq-edit" key={selected.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void update({ display_name: form.get("name"), assigned_front_id: form.get("front") || null }); }}>
        <label>명칭<input name="name" defaultValue={selected.name} maxLength={80} required /></label><label>전선 배속<select name="front" defaultValue={selected.frontId ?? ""}><option value="">미배속</option>{fronts.filter((f) => f.status === "ACTIVE").map((front) => <option key={front.id} value={front.id}>{front.display_name}</option>)}</select></label>
        <button disabled={pending || ["SUNK", "RETIRED", "DISBANDED"].includes(selected.status)}>변경 저장</button>
      </form></> : <p>편성을 선택해 주세요.</p>}</section>
    </div></>;
}

function Production({ data, reload }: { data: MilitaryOverview; reload: () => Promise<void> }) {
  const [designer, setDesigner] = useState(false);
  const [kind, setKind] = useState<ForceKind>("LAND_UNIT");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = data.templates.filter((template) => template.force_kind === kind);
  const form = async (template: MilitaryTemplate, name: string) => {
    setPending(true); setError(null);
    try { await militaryMutation(MILITARY_ROUTES.forces, { template_id: template.id, display_name: name, idempotency_key: crypto.randomUUID() }, "POST"); await reload(); }
    catch { setError("생산을 시작하지 못했습니다. 인력·생산능력과 편제 설정을 확인해 주세요."); }
    finally { setPending(false); }
  };
  return <><div className="hq-metrics"><div><span>가용 인력</span><strong>{militaryNumber(data.manpower.available)}</strong></div><div><span>사용 가능 생산능력</span><strong>{militaryNumber(data.productionCapacity.available)}</strong></div><div><span>생산 중</span><strong>{data.queues.length}</strong></div></div>
    <div className="hq-subtabs">{SERVICES.map(([key, label]) => <button key={key} aria-pressed={kind === key && !designer} onClick={() => { setKind(key); setDesigner(false); }}><MilitaryIcon name={SERVICE_ICON[key]} />{label}</button>)}<button aria-pressed={designer} onClick={() => setDesigner(true)}><MilitaryIcon name="production" />사단 편제 설계</button></div>{error && <p role="alert">{error}</p>}
    {designer ? <DivisionDesigner data={data} reload={reload} /> :
    <div className="hq-two-columns"><section className="hq-panel"><h3>{kind === "VESSEL" ? "개별 함선 건조" : "신규 편성"}</h3>{templates.map((template) => <form className="hq-template" key={template.id} onSubmit={(event) => { event.preventDefault(); void form(template, String(new FormData(event.currentTarget).get("name"))); }}>
      <strong>{template.display_name}</strong><dl className="hq-facts"><dt>필요 인력</dt><dd>{militaryNumber(kind === "VESSEL" ? template.crew_required : template.manpower_required)}</dd><dt>생산능력 점유</dt><dd>{militaryNumber(template.production_capacity_required)}</dd><dt>기간</dt><dd>{militaryNumber(template.formation_days)}일</dd></dl><label>편성 명칭<input name="name" aria-label={`${template.display_name} 명칭`} defaultValue={template.display_name} required maxLength={80} /></label><button disabled={pending || template.configuration_status !== "READY"}>생산 시작</button>
    </form>)}{!templates.length && <p>등록된 편제가 없습니다.</p>}</section>
      <section className="hq-panel"><h3>생산 일정</h3>{data.queues.map((queue) => { const progress = productionProgress(queue, data.worldDate); return <article className="hq-template" key={queue.id}><strong>{queue.requested_name}</strong><p>{queue.requested_world_date} → {queue.completion_world_date}</p><progress max={100} value={progress ?? undefined} aria-label={`${queue.requested_name} 진행률`} /><span>{progress === null ? "일정 확인 필요" : `${progress.toFixed(1)}%`}</span><small>{militaryLabel(queue.status)} · 생산능력 {militaryNumber(queue.production_capacity_reserved)}</small></article>; })}{!data.queues.length && <p>진행 중인 생산이 없습니다.</p>}</section>
    </div>}</>;
}
