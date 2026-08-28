import { useCallback, useEffect, useMemo, useState } from "react";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { UiIcon } from "../../../components/UiIcon";
import { fetchMilitaryOverview, militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import { ConflictWindow } from "./ConflictWindow";
import { WarReportWindow } from "./WarReportWindow";
import { OfficerCorpsPanel } from "./OfficerCorpsPanel";
import { militaryLabel } from "../militaryLabels";
import type { ConfigurationStatus, ForceKind, MilitaryAction, MilitaryFront, MilitaryOverview, MilitaryTemplate, WarReport } from "../types";

type MilitaryTab = "overview" | "thought" | "army" | "navy" | "airforce" | "production" | "fronts" | "actions";
type CommandObject = { id: string; kind: ForceKind | "FLEET"; name: string; type: string; status: string; strength: number; readiness: number; personnel: number; frontId: string | null; supportRole: string; placeholder?: boolean };

const ROOT = "/assets/ui/generated-icons";
const ICONS = {
  overview: `${ROOT}/laws/policing.png`, thought: `${ROOT}/laws/training.png`,
  army: `${ROOT}/world-control/army-map.png`, navy: `${ROOT}/world-control/navy-map.png`, airforce: `${ROOT}/world-control/air-map.png`,
  production: `${ROOT}/military/production.png`, fronts: `${ROOT}/military/front.png`, actions: `${ROOT}/military/operation.png`,
  victory: `${ROOT}/military/victory.png`, defeat: `${ROOT}/military/defeat.png`, occupation: `${ROOT}/military/occupation.png`,
} as const;
const TABS: Array<{ key: MilitaryTab; label: string }> = [
  { key: "overview", label: "군사 개요" }, { key: "thought", label: "군사사상" }, { key: "army", label: "육군" }, { key: "navy", label: "해군" },
  { key: "airforce", label: "공군" }, { key: "production", label: "편성·건조" }, { key: "fronts", label: "전선" }, { key: "actions", label: "작전" },
];
const READINESS_LABEL: Record<ConfigurationStatus, string> = { UNCONFIGURED: "동원 계획", PARTIAL: "부분 동원", READY: "전투 준비", DISABLED: "지휘 정지" };
const PLACEHOLDER_FORCES: Record<"army" | "navy" | "airforce", CommandObject[]> = {
  army: [
    { id: "plan-land-1", kind: "LAND_UNIT", name: "제1보병사단", type: "보병 편제", status: "동원 계획", strength: 100, readiness: 72, personnel: 0, frontId: null, supportRole: "지역 방위", placeholder: true },
    { id: "plan-land-2", kind: "LAND_UNIT", name: "제1기병여단", type: "기동 편제", status: "예비 계획", strength: 100, readiness: 48, personnel: 0, frontId: null, supportRole: "기동 예비대", placeholder: true },
    { id: "plan-land-3", kind: "LAND_UNIT", name: "수도 경비대", type: "경비 편제", status: "대기", strength: 100, readiness: 64, personnel: 0, frontId: null, supportRole: "수도 방위", placeholder: true },
  ],
  navy: [
    { id: "plan-navy-1", kind: "FLEET", name: "제1함대", type: "연안 경비", status: "함대 계획", strength: 100, readiness: 58, personnel: 0, frontId: null, supportRole: "해상 보급 지원", placeholder: true },
    { id: "plan-navy-2", kind: "FLEET", name: "수송지원전대", type: "수송 지원", status: "예비 계획", strength: 100, readiness: 42, personnel: 0, frontId: null, supportRole: "상륙·수송 지원", placeholder: true },
  ],
  airforce: [
    { id: "plan-air-1", kind: "AIR_WING", name: "제1전투비행단", type: "전투 비행단", status: "편성 계획", strength: 100, readiness: 61, personnel: 0, frontId: null, supportRole: "방공·제공권", placeholder: true },
    { id: "plan-air-2", kind: "AIR_WING", name: "정찰항공대", type: "정찰 비행단", status: "예비 계획", strength: 100, readiness: 53, personnel: 0, frontId: null, supportRole: "정찰 지원", placeholder: true },
  ],
};

function formatNumber(value: number | null): string { return (value ?? 0).toLocaleString("ko-KR"); }
function militaryQuery<T>(route: string): Promise<T> { return militaryMutation<T>(route, {}, "GET"); }
function emptyMilitaryOverview(countryKey: string): MilitaryOverview { return { countryKey, worldDate: "1932-01-01", readiness: "UNCONFIGURED", reasons: [], manpower: { available: null, reserved: 0 }, productionCapacity: { available: null, reserved: 0 }, templates: [], units: [], vessels: [], fleets: [], airWings: [], queues: [], conflicts: [] }; }
function forceIcon(kind: CommandObject["kind"]): string { return kind === "LAND_UNIT" ? ICONS.army : kind === "AIR_WING" ? ICONS.airforce : ICONS.navy; }
function mapForces(overview: MilitaryOverview, tab: "army" | "navy" | "airforce"): CommandObject[] {
  if (tab === "army") return overview.units.map((unit) => ({ id: unit.id, kind: "LAND_UNIT", name: unit.display_name, type: "육군 편성", status: militaryLabel(unit.status), strength: unit.max_manpower ? Math.round(unit.current_manpower / unit.max_manpower * 100) : 0, readiness: unit.equipment_readiness ?? 0, personnel: unit.current_manpower, frontId: unit.assigned_front_id, supportRole: unit.status === "ASSIGNED_TO_FRONT" ? "전선 전투" : "전략 예비" }));
  if (tab === "airforce") return overview.airWings.map((wing) => ({ id: wing.id, kind: "AIR_WING", name: wing.display_name, type: "항공 편성", status: militaryLabel(wing.status), strength: wing.max_personnel ? Math.round(wing.current_personnel / wing.max_personnel * 100) : 0, readiness: wing.readiness ?? 0, personnel: wing.current_personnel, frontId: wing.assigned_front_id, supportRole: "정찰·지상 지원" }));
  return overview.fleets.map((fleet) => ({ id: fleet.id, kind: "FLEET", name: fleet.display_name, type: "지원 함대", status: militaryLabel(fleet.status), strength: 100, readiness: fleet.status === "ACTIVE" ? 85 : 55, personnel: overview.vessels.filter((vessel) => vessel.fleet_id === fleet.id).length, frontId: fleet.assigned_front_id, supportRole: "수송·봉쇄 지원" }));
}
interface MilitaryWindowProps { countryKey: string; onClose: () => void; onOpenDiplomacy?: () => void }

export function MilitaryWindow({ countryKey, onClose, onOpenDiplomacy }: MilitaryWindowProps) {
  const [subWindow, setSubWindow] = useState<"conflicts" | "reports" | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MilitaryTab>("overview");
  const [overview, setOverview] = useState<MilitaryOverview | null>(null);
  const [reports, setReports] = useState<WarReport[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [pendingForm, setPendingForm] = useState<string | null>(null); const [formationNames, setFormationNames] = useState<Record<string, string>>({});
  const [frontsByConflict, setFrontsByConflict] = useState<Record<string, MilitaryFront[]>>({}); const [frontsLoading, setFrontsLoading] = useState(false);
  const [actionsByConflict, setActionsByConflict] = useState<Record<string, MilitaryAction[]>>({}); const [actionsLoading, setActionsLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [data, reportData] = await Promise.all([fetchMilitaryOverview(countryKey), militaryQuery<WarReport[]>(MILITARY_ROUTES.reports).catch(() => [])]); setOverview(data); setReports(reportData); }
    catch (requestError) {
      void requestError;
      setOverview(emptyMilitaryOverview(countryKey));
      setReports([]);
      setError(null);
    }
    finally { setLoading(false); }
  }, [countryKey]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadOverview();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadOverview]);
  useEffect(() => { const openReport = (event: Event) => { setSelectedReportId((event as CustomEvent<{ reportId?: string }>).detail?.reportId ?? null); setSubWindow("reports"); }; window.addEventListener("tlr:open-war-report", openReport); return () => window.removeEventListener("tlr:open-war-report", openReport); }, []);
  useEffect(() => {
    if (!overview || !["overview", "army", "navy", "airforce", "fronts", "actions"].includes(activeTab)) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFrontsLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void Promise.all(overview.conflicts.map(async (conflict) => { try { return [conflict.id, await militaryQuery<MilitaryFront[]>(`${MILITARY_ROUTES.fronts}?conflict_id=${conflict.id}`)] as const; } catch { return [conflict.id, []] as const; } })).then((entries) => { if (!cancelled) { setFrontsByConflict(Object.fromEntries(entries)); setFrontsLoading(false); } });
    return () => { cancelled = true; };
  }, [activeTab, overview]);
  useEffect(() => {
    if (!(["overview", "actions"] as MilitaryTab[]).includes(activeTab) || !overview) return; let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setActionsLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void Promise.all(overview.conflicts.map(async (conflict) => { try { return [conflict.id, await militaryQuery<MilitaryAction[]>(`${MILITARY_ROUTES.actions}?conflict_id=${conflict.id}`)] as const; } catch { return [conflict.id, []] as const; } })).then((entries) => { if (!cancelled) { setActionsByConflict(Object.fromEntries(entries)); setActionsLoading(false); } });
    return () => { cancelled = true; };
  }, [activeTab, overview]);

  const fronts = useMemo(() => Object.values(frontsByConflict).flat(), [frontsByConflict]);
  const templatesByKind = useMemo(() => { const map: Record<string, MilitaryTemplate[]> = { LAND_UNIT: [], VESSEL: [], AIR_WING: [] }; overview?.templates.forEach((template) => map[template.force_kind]?.push(template)); return map; }, [overview]);
  const handleForm = useCallback(async (template: MilitaryTemplate, requestedName: string) => { if (!overview || overview.readiness === "DISABLED" || template.configuration_status !== "READY") return; setPendingForm(template.id); try { await militaryMutation(MILITARY_ROUTES.forces, { template_id: template.id, display_name: requestedName.trim() || template.display_name, idempotency_key: crypto.randomUUID() }, "POST"); await loadOverview(); } catch { setError("편성 명령이 반려됐다. 인력과 생산력 배정을 확인하라."); } finally { setPendingForm(null); } }, [overview, loadOverview]);
  const updateForce = useCallback(async (force: CommandObject, update: { display_name?: string; assigned_front_id?: string | null }) => {
    if (force.placeholder) return;
    try { await militaryMutation(MILITARY_ROUTES.forces, { object_kind: force.kind, object_id: force.id, ...update }, "PATCH"); await loadOverview(); }
    catch { setError("편성 변경 명령이 반려됐다. 전선 참가 상태를 확인하라."); }
  }, [loadOverview]);

  if (subWindow === "conflicts") return <ConflictWindow countryKey={countryKey} onClose={() => setSubWindow(null)} />;
  if (subWindow === "reports") return <WarReportWindow initialReportId={selectedReportId} onClose={() => { setSelectedReportId(null); setSubWindow(null); }} />;
  const actions = <><button type="button" className="strategic-window__action" onClick={() => setSubWindow("conflicts")}><UiIcon name="menu/diplomacy" /><span>분쟁</span></button><button type="button" className="strategic-window__action" onClick={onOpenDiplomacy}><UiIcon name="menu/diplomacy" /><span>관계</span></button><button type="button" className="strategic-window__action" onClick={() => setSubWindow("reports")}><UiIcon name="menu/decisions" /><span>전쟁 보고서</span></button><button type="button" className="strategic-window__action" onClick={onClose}><UiIcon name="ui/close" /><span>닫기</span></button></>;

  return <StrategicWindow title="군사 사령부" eyebrow="MILITARY HIGH COMMAND" actions={actions} className="military-window" onClose={onClose}>
    <nav className="military-window__tabs" aria-label="군사 사령부 탭">{TABS.map((tab) => <button key={tab.key} type="button" className={`military-window__tab${activeTab === tab.key ? " military-window__tab--active" : ""}`} onClick={() => setActiveTab(tab.key)}><img src={ICONS[tab.key]} alt="" /><span>{tab.label}</span></button>)}</nav>
    <div className="military-window__body">
      {loading && <div className="military-window__state"><UiIcon name="loader" /><span>사령부 회선 접속 중…</span></div>}
      {!loading && error && <div className="military-window__state military-window__state--error"><UiIcon name="warning" /><span>{error}</span><button type="button" className="military-window__retry" onClick={() => void loadOverview()}>재접속</button></div>}
      {!loading && !error && overview && <><div className={`military-command-strip military-command-strip--${overview.readiness.toLowerCase()}`}><span>전군 태세</span><strong>{READINESS_LABEL[overview.readiness]}</strong><time>{overview.worldDate}</time></div>
        {activeTab === "overview" && <OverviewTab overview={overview} fronts={fronts} actionsByConflict={actionsByConflict} reports={reports} onSelectTab={setActiveTab} onOpenReports={() => setSubWindow("reports")} />}
        {activeTab === "thought" && <OfficerCorpsPanel countryKey={countryKey} />}
        {activeTab === "army" && <ForceCommandTab title="육군 편성 관리" mode="army" forces={mapForces(overview, "army")} fronts={fronts} onUpdate={updateForce} />}
        {activeTab === "navy" && <ForceCommandTab title="함대 자산 및 지원" mode="navy" forces={mapForces(overview, "navy")} fronts={fronts} onUpdate={updateForce} />}
        {activeTab === "airforce" && <ForceCommandTab title="항공 편성 및 지원" mode="airforce" forces={mapForces(overview, "airforce")} fronts={fronts} onUpdate={updateForce} />}
        {activeTab === "production" && <ProductionTab overview={overview} templates={templatesByKind} pendingForm={pendingForm} formationNames={formationNames} onNameChange={(id, value) => setFormationNames((current) => ({ ...current, [id]: value }))} onForm={handleForm} />}
        {activeTab === "fronts" && <FrontsTab overview={overview} frontsByConflict={frontsByConflict} loading={frontsLoading} onOpenConflicts={() => setSubWindow("conflicts")} />}
        {activeTab === "actions" && <ActionsTab overview={overview} actionsByConflict={actionsByConflict} loading={actionsLoading} onOpenConflicts={() => setSubWindow("conflicts")} />}
      </>}
    </div>
  </StrategicWindow>;
}

function OverviewTab({ overview, fronts, actionsByConflict, reports, onSelectTab, onOpenReports }: { overview: MilitaryOverview; fronts: MilitaryFront[]; actionsByConflict: Record<string, MilitaryAction[]>; reports: WarReport[]; onSelectTab: (tab: MilitaryTab) => void; onOpenReports: () => void }) {
  const activeForces = overview.units.length + overview.fleets.length + overview.airWings.length;
  const actionCount = Object.values(actionsByConflict).flat().filter((action) => !["RESOLVED", "REJECTED", "CANCELLED", "WITHDRAWN"].includes(action.status)).length;
  const metrics = [
    ["가용 인력", formatNumber(overview.manpower.available), ICONS.army], ["예비 인력", formatNumber(overview.manpower.reserved), ICONS.army],
    ["군사 생산력", formatNumber(overview.productionCapacity.available), ICONS.production], ["예약 생산력", formatNumber(overview.productionCapacity.reserved), ICONS.production],
    ["활성 편성", String(activeForces).padStart(2, "0"), ICONS.overview], ["활성 전선", String(fronts.filter((front) => front.status === "ACTIVE").length).padStart(2, "0"), ICONS.fronts],
    ["진행 작전", String(actionCount).padStart(2, "0"), ICONS.actions], ["진행 분쟁", String(overview.conflicts.length).padStart(2, "0"), ICONS.occupation],
  ];
  const recent = [...reports].sort((a, b) => b.report_world_date.localeCompare(a.report_world_date)).slice(0, 4);
  return <div className="military-overview">
    <section className="military-overview__metrics">{metrics.map(([label, value, icon]) => <article key={label}><img src={icon} alt="" /><span>{label}</span><strong>{value}</strong></article>)}</section>
    <div className="military-overview__war-grid">
      <section className="military-command-board"><header><img src={ICONS.occupation} alt="" /><div><small>ACTIVE CONFLICTS</small><h3>진행 중 분쟁</h3></div><button type="button" onClick={() => onSelectTab("fronts")}>전선 보기</button></header>
        {overview.conflicts.length ? overview.conflicts.map((conflict) => <button type="button" key={conflict.id} className="military-conflict-row" onClick={() => onSelectTab("fronts")}><span className="military-signal military-signal--red" /><strong>{conflict.display_name}</strong><span>{fronts.filter((front) => front.conflict_id === conflict.id).length}개 전선</span><b>{militaryLabel(conflict.status)}</b></button>) : <div className="military-peace-card"><strong>전시 경계 태세</strong><span>현재 교전국 00 · 동원 명령 00</span><div><i /><i /><i /><i /><i /></div></div>}
      </section>
      <section className="military-command-board"><header><img src={ICONS.fronts} alt="" /><div><small>ACTIVE FRONTS</small><h3>활성 전선</h3></div><button type="button" onClick={() => onSelectTab("fronts")}>전선 관리</button></header>
        {fronts.length ? fronts.slice(0, 4).map((front) => <button type="button" key={front.id} className="military-front-summary" onClick={() => focusFront(front)}><strong>{front.display_name}</strong><span>{front.front_kind === "LAND_LINE" ? "지상 전선" : "해군 지원 구역"}</span><b>{militaryLabel(front.status)}</b></button>) : <><div className="military-front-summary military-front-summary--plan"><strong>서부 방면 방위선</strong><span>전시 편성 계획</span><b>계획</b></div><div className="military-front-summary military-front-summary--plan"><strong>수도 방위 구역</strong><span>전략 예비대</span><b>대기</b></div></>}
      </section>
      <section className="military-command-board military-command-board--reports"><header><img src={ICONS.victory} alt="" /><div><small>WAR REPORTS</small><h3>최근 전쟁 보고</h3></div><button type="button" onClick={onOpenReports}>전체 기록</button></header>
        {recent.length ? recent.map((report) => <button type="button" key={report.id} className={`military-report-row military-report-row--${report.marker_tone?.toLowerCase() ?? "neutral"}`} onClick={() => window.dispatchEvent(new CustomEvent("tlr:open-war-report", { detail: { reportId: report.id } }))}><img src={report.marker_tone === "LOSS" ? ICONS.defeat : ICONS.victory} alt="" /><span><strong>{report.title}</strong><small>{report.report_world_date}</small></span><b>{report.marker_tone === "LOSS" ? "패배" : report.marker_tone === "WIN" ? "승리" : "판정"}</b></button>) : <><div className="military-report-row military-report-row--win"><img src={ICONS.victory} alt="" /><span><strong>모의전 승리 판정</strong><small>{overview.worldDate}</small></span><b>훈련</b></div><div className="military-report-row military-report-row--loss"><img src={ICONS.defeat} alt="" /><span><strong>방공 훈련 손실 분석</strong><small>{overview.worldDate}</small></span><b>훈련</b></div></>}
      </section>
    </div>
  </div>;
}

function ForceCommandTab({ title, mode, forces: realForces, fronts, onUpdate }: { title: string; mode: "army" | "navy" | "airforce"; forces: CommandObject[]; fronts: MilitaryFront[]; onUpdate: (force: CommandObject, update: { display_name?: string; assigned_front_id?: string | null }) => Promise<void> }) {
  const forces = realForces.length ? realForces : PLACEHOLDER_FORCES[mode];
  const [selectedId, setSelectedId] = useState(forces[0]?.id ?? ""); const [editing, setEditing] = useState(false); const [name, setName] = useState(""); const [frontId, setFrontId] = useState("");
  const selected = forces.find((force) => force.id === selectedId) ?? forces[0];
  if (!selected) return null;
  const selectForce = (force: CommandObject) => { setSelectedId(force.id); setName(force.name); setFrontId(force.frontId ?? ""); setEditing(false); };
  return <div className="military-force-command">
    <aside className="military-force-command__list"><header><img src={ICONS[mode]} alt="" /><div><small>ORDER OF BATTLE</small><h3>{title}</h3></div><b>{String(forces.length).padStart(2, "0")}</b></header>{forces.map((force) => <button type="button" key={force.id} className={force.id === selected.id ? "is-selected" : ""} onClick={() => selectForce(force)}><img src={forceIcon(force.kind)} alt="" /><span><strong>{force.name}</strong><small>{force.type} · {force.frontId ? "전선 배속" : force.status}</small></span><i style={{ "--readiness": `${force.readiness}%` } as React.CSSProperties} /></button>)}</aside>
    <section className="military-force-detail"><header><img src={forceIcon(selected.kind)} alt="" /><div><small>{selected.type}</small>{editing ? <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /> : <h3>{selected.name}</h3>}<span>{selected.placeholder ? "예비 편성안" : selected.status}</span></div><button type="button" onClick={() => { if (!editing) setName(selected.name); setEditing((value) => !value); }}>{editing ? "취소" : "이름 변경"}</button></header>
      <div className="military-force-gauges"><Gauge label={mode === "navy" ? "함선" : "현재 인원"} value={selected.strength} detail={mode === "navy" ? `${selected.personnel}척` : formatNumber(selected.personnel)} /><Gauge label="전투 준비도" value={selected.readiness} detail={`${selected.readiness}%`} /><Gauge label="보급·장비" value={Math.round((selected.readiness + selected.strength) / 2)} detail="정상" /></div>
      <dl className="military-force-facts"><div><dt>지원 역할</dt><dd>{selected.supportRole}</dd></div><div><dt>소속 전선</dt><dd>{fronts.find((front) => front.id === selected.frontId)?.display_name ?? "전략 예비"}</dd></div><div><dt>유지비</dt><dd>{selected.placeholder ? "예산 산정 대기" : "국가 군사예산 연동"}</dd></div><div><dt>작전 참가</dt><dd>{selected.frontId ? "전선 명령 우선" : "대기"}</dd></div></dl>
      <div className="military-force-assignment"><label><span>전선 배치</span><select value={frontId} onChange={(event) => setFrontId(event.target.value)}><option value="">전략 예비로 해제</option>{fronts.map((front) => <option key={front.id} value={front.id}>{front.display_name}</option>)}</select></label><button type="button" disabled={selected.placeholder} onClick={() => void onUpdate(selected, { assigned_front_id: frontId || null })}>배치 명령</button>{editing && <button type="button" disabled={selected.placeholder || !name.trim()} onClick={() => void onUpdate(selected, { display_name: name.trim() }).then(() => setEditing(false))}>명칭 확정</button>}</div>
      <footer><button type="button">전투 기록</button><button type="button" disabled={!selected.frontId} onClick={() => selected.frontId && focusFront(fronts.find((front) => front.id === selected.frontId))}>지도에서 보기</button></footer>
    </section>
  </div>;
}
function Gauge({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="military-gauge"><span>{label}</span><strong>{detail}</strong><div><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>; }

function ProductionTab({ overview, templates, pendingForm, formationNames, onNameChange, onForm }: { overview: MilitaryOverview; templates: Record<string, MilitaryTemplate[]>; pendingForm: string | null; formationNames: Record<string, string>; onNameChange: (id: string, value: string) => void; onForm: (template: MilitaryTemplate, name: string) => void }) {
  const [kind, setKind] = useState<ForceKind>("LAND_UNIT"); const list = templates[kind] ?? [];
  return <div className="military-production-console"><section className="military-production-catalog"><header><img src={ICONS.production} alt="" /><div><small>FORMATION & CONSTRUCTION</small><h3>신규 편성 명령</h3></div></header><div className="military-production-kind">{(["LAND_UNIT", "VESSEL", "AIR_WING"] as ForceKind[]).map((value) => <button key={value} type="button" className={kind === value ? "is-active" : ""} onClick={() => setKind(value)}><img src={value === "LAND_UNIT" ? ICONS.army : value === "VESSEL" ? ICONS.navy : ICONS.airforce} alt="" />{value === "LAND_UNIT" ? "육군" : value === "VESSEL" ? "해군" : "공군"}</button>)}</div>
      <div className="military-template-deck">{list.length ? list.map((template) => <article key={template.id}><img src={kind === "LAND_UNIT" ? ICONS.army : kind === "VESSEL" ? ICONS.navy : ICONS.airforce} alt="" /><h4>{template.display_name}</h4><dl><div><dt>생산능력</dt><dd>{formatNumber(template.production_capacity_required)}</dd></div><div><dt>{kind === "VESSEL" ? "승조원" : "필요 인력"}</dt><dd>{formatNumber(kind === "VESSEL" ? template.crew_required : template.manpower_required)}</dd></div><div><dt>소요 시간</dt><dd>{template.formation_days ?? 0}일</dd></div></dl><input aria-label="편성 명칭" value={formationNames[template.id] ?? template.display_name} onChange={(event) => onNameChange(template.id, event.target.value)} /><button type="button" disabled={template.configuration_status !== "READY" || pendingForm === template.id} onClick={() => onForm(template, formationNames[template.id] ?? template.display_name)}>{pendingForm === template.id ? "명령 전송 중" : "생산 명령"}</button></article>) : <article className="military-template-placeholder"><img src={kind === "LAND_UNIT" ? ICONS.army : kind === "VESSEL" ? ICONS.navy : ICONS.airforce} alt="" /><h4>{kind === "LAND_UNIT" ? "표준 보병사단" : kind === "VESSEL" ? "연안 경비전대" : "전투 비행단"}</h4><dl><div><dt>생산능력</dt><dd>00</dd></div><div><dt>필요 인력</dt><dd>0,000</dd></div><div><dt>소요 시간</dt><dd>00일</dd></div></dl><input aria-label="예시 편성 명칭" value="국가 편제 승인 대기" readOnly /><button type="button" disabled>계획 승인 대기</button></article>}</div></section>
    <section className="military-production-queue"><header><span><small>PRODUCTION QUEUE</small><h3>예약 생산열</h3></span><b>{overview.queues.length}</b></header>{overview.queues.length ? overview.queues.map((queue, index) => <article key={queue.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{queue.requested_name || "명칭 미설정"}</strong><small>{militaryLabel(queue.status)} · {queue.completion_world_date}</small><i><b style={{ width: queue.status === "IN_PROGRESS" ? "52%" : queue.status === "COMPLETED" ? "100%" : "8%" }} /></i></div><dl><dt>인력</dt><dd>{formatNumber(queue.manpower_reserved)}</dd><dt>생산력</dt><dd>{formatNumber(queue.production_capacity_reserved)}</dd></dl></article>) : [1, 2, 3].map((index) => <article key={index} className="is-empty"><span>{String(index).padStart(2, "0")}</span><div><strong>대기 슬롯</strong><small>새 편성 명령 수신 대기</small><i><b /></i></div></article>)}</section>
  </div>;
}

function FrontsTab({ overview, frontsByConflict, loading, onOpenConflicts }: { overview: MilitaryOverview; frontsByConflict: Record<string, MilitaryFront[]>; loading: boolean; onOpenConflicts: () => void }) {
  const fronts = Object.values(frontsByConflict).flat(); const [selectedId, setSelectedId] = useState(fronts[0]?.id ?? ""); const selected = fronts.find((front) => front.id === selectedId) ?? fronts[0];
  return <div className="military-front-console"><section className="military-front-console__list"><header><img src={ICONS.fronts} alt="" /><div><small>FRONT COMMAND</small><h3>전선 관제</h3></div><button type="button" onClick={onOpenConflicts}>전선 생성</button></header>{loading ? <div className="military-window__state"><UiIcon name="loader" /><span>전선 암호문 수신 중…</span></div> : fronts.length ? overview.conflicts.map((conflict) => <div key={conflict.id}><h4>{conflict.display_name}</h4>{(frontsByConflict[conflict.id] ?? []).map((front) => <button type="button" key={front.id} className={front.id === selected?.id ? "is-selected" : ""} onClick={() => setSelectedId(front.id)}><span className="military-signal military-signal--red" /><strong>{front.display_name}</strong><small>{front.front_kind === "LAND_LINE" ? "지상전선" : "해군 지원구역"}</small><b>{militaryLabel(front.status)}</b></button>)}</div>) : <div className="military-front-plan"><strong>전시 전선 계획</strong><p>서부 방면 · 수도 방위 · 해안 차단</p><div><i /><i /><i /><i /></div><button type="button" onClick={onOpenConflicts}>첫 전선 계획 작성</button></div>}</section>
    <section className="military-front-console__detail">{selected ? <><header><img src={ICONS.fronts} alt="" /><div><small>{selected.front_kind}</small><h3>{selected.display_name}</h3></div><button type="button" onClick={() => focusFront(selected)}>지도 집중</button></header><div className="military-front-diagram"><span>아군 전력</span><i /><b>{selected.geometry.length}개 통제점</b><i /><span>적군 전력</span></div><div className="military-support-grid"><article><img src={ICONS.army} alt="" /><span>육군 편성</span><strong>00</strong></article><article><img src={ICONS.navy} alt="" /><span>해군 지원</span><strong>대기</strong></article><article><img src={ICONS.airforce} alt="" /><span>공군 지원</span><strong>대기</strong></article><article><img src={ICONS.actions} alt="" /><span>진행 작전</span><strong>00</strong></article></div><footer><button type="button" onClick={() => focusFront(selected)}>지도에서 전선 보기</button><button type="button" onClick={onOpenConflicts}>편성·작전 배치</button></footer></> : <div className="military-front-map-placeholder"><img src={ICONS.fronts} alt="" /><strong>전선 도상 계획판</strong><span>분쟁 사령부에서 전쟁과 전선을 선택하십시오.</span></div>}</section>
  </div>;
}

function ActionsTab({ overview, actionsByConflict, loading, onOpenConflicts }: { overview: MilitaryOverview; actionsByConflict: Record<string, MilitaryAction[]>; loading: boolean; onOpenConflicts: () => void }) {
  const actions = Object.values(actionsByConflict).flat(); const states = ["진행 중", "제출 대기", "판정 대기", "완료·실패"];
  return <div className="military-operation-console"><header><img src={ICONS.actions} alt="" /><div><small>OPERATIONS ROOM</small><h3>작전 지휘실</h3><p>전쟁·전선·투입 편성·지원 전력·목표 지역을 묶어 작전안을 제출한다.</p></div><button type="button" onClick={onOpenConflicts}>새 작전 작성</button></header><div className="military-operation-stages">{states.map((state, index) => <span key={state}><b>{String(index + 1).padStart(2, "0")}</b>{state}</span>)}</div>{loading ? <div className="military-window__state"><UiIcon name="loader" /><span>작전 문서 수신 중…</span></div> : actions.length ? <section className="military-operation-list">{actions.map((action) => <article key={action.id}><img src={action.resolution?.outcome.includes("FAILURE") ? ICONS.defeat : action.resolution ? ICONS.victory : ICONS.actions} alt="" /><div><small>{overview.conflicts.find((conflict) => conflict.id === action.conflict_id)?.display_name ?? "분쟁 작전"}</small><h4>{action.title}</h4><p>{action.body}</p></div><span>{militaryLabel(action.status)}</span>{action.resolution && <b>{militaryLabel(action.resolution.outcome)}</b>}</article>)}</section> : <section className="military-operation-draft"><img src={ICONS.actions} alt="" /><div><small>OPERATION DRAFT</small><h4>작전 초안 작성대</h4><p>분쟁과 전선을 선택하면 육군 편성, 해군·공군 지원, 작전 개요와 지도 목표를 한 번에 지정할 수 있다.</p><ol><li>분쟁·전선 선택</li><li>투입 편성 선택</li><li>지원 전력 승인</li><li>지도 목표 지정</li><li>관리자 판정 제출</li></ol><button type="button" onClick={onOpenConflicts}>분쟁 사령부에서 작성</button></div></section>}</div>;
}
function focusFront(front?: MilitaryFront) { if (front) window.dispatchEvent(new CustomEvent("tlr:focus-military-front", { detail: { frontId: front.id, frontKind: front.front_kind, geometry: front.geometry } })); }
