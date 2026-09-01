import { useCallback, useEffect, useState } from "react";
import { mapCountries } from "../data/mapCountries";
import { PROPOSAL_LABELS, type DiplomaticProposal } from "../features/diplomacy/types";
import type { TradeAgreement, TradeProposal } from "../features/economy/types";
import { MilitaryAdminSection, type MilitaryAdminData } from "../features/military/components/MilitaryAdminSection";
import { ResearchAdminSection, type ResearchAdminData } from "../features/research/components/ResearchAdminSection";
import { IntelligenceAdminSection } from "../features/intelligence/components/IntelligenceAdminSection";
import type { IntelligenceAdminData } from "../features/intelligence/types";
import { MapCapitalAdminSection } from "./MapCapitalAdminSection";
import { ProvinceRegionAdminSection } from "./ProvinceRegionAdminSection";
import { WorldControlAdminSection } from "../features/world-control/components/WorldControlAdminSection";
import type { WorldControlAdminData } from "../features/world-control/types";
import { SiteStatusAdminSection } from "./SiteStatusAdminSection";
import { CountryExpulsionAdminSection } from "./CountryExpulsionAdminSection";
import { AdminPlayPreviewSection } from "./AdminPlayPreviewSection";
import { AdminMembershipSection } from "./AdminMembershipSection";
import { ContentStudio, DecisionCatalog } from "../features/management/components/ContentStudio";

type DirectoratePanelProps = { onBackToTitle: () => void };
type AdminSessionState = "checking" | "authorized" | "not-found";
type ManagementView = "dashboard" | "event-studio" | "decision-studio" | "world-control" | "provinces" | "capitals" | "research" | "intelligence" | "military" | "economy" | "diplomacy" | "system";

const MANAGEMENT_NAV: Array<{ group: string; items: Array<{ id: ManagementView; label: string; hint: string }> }> = [
  { group: "운영", items: [{ id: "dashboard", label: "운영 대시보드", hint: "상태와 대기열" }, { id: "world-control", label: "세계상황·시간 요청", hint: "날짜 요청 관제" }, { id: "diplomacy", label: "외교 검토", hint: "제안 큐" }, { id: "economy", label: "경제·무역", hint: "계약과 데이터" }] },
  { group: "콘텐츠 스튜디오", items: [{ id: "event-studio", label: "Event Studio", hint: "제작·미리보기·게시" }, { id: "decision-studio", label: "Decision Studio", hint: "실제 정의 점검" }] },
  { group: "세계 편집", items: [{ id: "provinces", label: "프로빈스·Region", hint: "영토 그룹" }, { id: "capitals", label: "수도 데이터", hint: "지도 기준점" }, { id: "military", label: "군사 관제", hint: "전쟁·편성" }, { id: "intelligence", label: "첩보 관제", hint: "작전·자산" }, { id: "research", label: "연구 관제", hint: "프로젝트 심사" }] },
  { group: "시스템", items: [{ id: "system", label: "접근·개장·테스트", hint: "권한과 운영" }] },
];

const actions = [
  ["REVOKE_COUNTRY_OWNERSHIP", "국가 운영권 회수", "현재 점유만 해제"],
  ["DENY_COUNTRY_ACCESS", "국가 접근 거부", "대상 국가 재접근 제한"],
  ["SUSPEND_ALL_PLAY", "전체 플레이 중지", "공개 열람과 로그인은 허용"],
  ["BLOCK_ACCOUNT", "계정 차단", "보호 기능 접근 차단"],
] as const;

function countryName(key: string): string {
  return mapCountries.find((country) => country.key === key)?.name ?? key;
}

export function DirectoratePanel({ onBackToTitle }: DirectoratePanelProps) {
  const visualPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("management-ui-preview") === "1";
  const [state, setState] = useState<AdminSessionState>(visualPreview ? "authorized" : "checking");
  const [queue, setQueue] = useState<DiplomaticProposal[]>([]);
  const [tradeQueue, setTradeQueue] = useState<TradeProposal[]>([]);
  const [tradeAgreements, setTradeAgreements] = useState<TradeAgreement[]>([]);
  const [economies, setEconomies] = useState<Array<{ country_key: string; gdp: number | null; base_production_capacity: number | null }>>([]);
  const [worldDate, setWorldDate] = useState("");
  const [militaryData, setMilitaryData] = useState<MilitaryAdminData | null>(null);
  const [researchData, setResearchData] = useState<ResearchAdminData | null>(null);
  const [intelligenceData, setIntelligenceData] = useState<IntelligenceAdminData | null>(null);
  const [worldControlData, setWorldControlData] = useState<WorldControlAdminData | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ManagementView>("dashboard");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const loadQueue = useCallback(async () => {
    const [diplomacyResponse, economyResponse, militaryResponse, researchResponse, intelligenceResponse, worldControlResponse] = await Promise.all([
      fetch("/api/admin/diplomacy", { credentials: "include" }),
      fetch("/api/admin/economy", { credentials: "include" }),
      fetch("/api/admin/military", { credentials: "include" }),
      fetch("/api/admin/research", { credentials: "include" }),
      fetch("/api/admin/intelligence", { credentials: "include" }),
      fetch("/api/admin/world-control", { credentials: "include" }),
    ]);
    if (!diplomacyResponse.ok || !economyResponse.ok || !militaryResponse.ok || !researchResponse.ok) throw new Error("ADMIN_REVIEW_QUEUE_FAILED");
    const diplomacyPayload = await diplomacyResponse.json() as { worldDate: string; queue: DiplomaticProposal[] };
    const economyPayload = await economyResponse.json() as { worldDate: string; queue: TradeProposal[]; agreements: TradeAgreement[]; economies: Array<{ country_key: string; gdp: number | null; base_production_capacity: number | null }> };
    const militaryPayload = await militaryResponse.json() as MilitaryAdminData;
    const researchPayload = await researchResponse.json() as ResearchAdminData;
    const intelligencePayload = intelligenceResponse.ok ? await intelligenceResponse.json() as IntelligenceAdminData : null;
    const worldControlPayload = worldControlResponse.ok ? await worldControlResponse.json() as WorldControlAdminData : null;
    setQueue(diplomacyPayload.queue);
    setTradeQueue(economyPayload.queue);
    setTradeAgreements(economyPayload.agreements);
    setEconomies(economyPayload.economies);
    setMilitaryData(militaryPayload);
    setResearchData(researchPayload);
    setIntelligenceData(intelligencePayload);
    setWorldControlData(worldControlPayload);
    setWorldDate(diplomacyPayload.worldDate || economyPayload.worldDate || militaryPayload.worldDate);
  }, []);

  useEffect(() => {
    if (visualPreview) return;
    let active = true;
    void fetch("/api/admin/session", { credentials: "include" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          const discordLogin = await fetch("/api/admin/discord-login", { method: "POST", credentials: "include" });
          if (!discordLogin.ok) { setState("not-found"); return; }
        }
        setState("authorized");
        try {
          await loadQueue();
        } catch {
          if (active) setQueueError("외교 검토 큐를 불러오지 못했습니다.");
        }
      })
      .catch(() => { if (active) setState("not-found"); });
    return () => { active = false; };
  }, [loadQueue, visualPreview]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const review = async (proposalId: string, action: "ACCEPT" | "REJECT" | "CANCEL") => {
    setBusyId(proposalId);
    setQueueError(null);
    try {
      const response = await fetch("/api/admin/diplomacy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, action }),
      });
      if (!response.ok) throw new Error("ADMIN_DIPLOMACY_REVIEW_FAILED");
      await loadQueue();
    } catch {
      setQueueError("제안 검토에 실패했습니다. 상태를 다시 확인하십시오.");
    } finally {
      setBusyId(null);
    }
  };

  const reviewResearch = async (body: Record<string, unknown>, actionId: string) => {
    setBusyId(actionId);
    setQueueError(null);
    try {
      const response = await fetch("/api/admin/research", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("ADMIN_RESEARCH_REVIEW_FAILED");
      await loadQueue();
    } catch { setQueueError("연구 심사 상태를 변경하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  const reviewTrade = async (proposalId: string, action: "ACCEPT" | "REJECT") => {
    setBusyId(proposalId);
    setQueueError(null);
    try {
      const response = await fetch("/api/admin/economy", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, action }),
      });
      if (!response.ok) throw new Error("ADMIN_TRADE_REVIEW_FAILED");
      await loadQueue();
    } catch { setQueueError("무역 제안 검토에 실패했습니다. 최신 상태를 다시 확인해 주세요."); }
    finally { setBusyId(null); }
  };

  const controlAgreement = async (agreementId: string, action: "SUSPEND_AGREEMENT" | "RESTORE_AGREEMENT" | "TERMINATE_AGREEMENT") => {
    setBusyId(agreementId);
    setQueueError(null);
    try {
      const response = await fetch("/api/admin/economy", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, action }),
      });
      if (!response.ok) throw new Error("ADMIN_AGREEMENT_CONTROL_FAILED");
      await loadQueue();
    } catch { setQueueError("무역 계약 상태를 변경하지 못했습니다."); }
    finally { setBusyId(null); }
  };

  if (state === "checking") return <main className="directorate-page directorate-page--checking" aria-label="관제망 확인 중" />;
  if (state === "not-found") return <main className="directorate-page directorate-page--not-found"><span>404</span></main>;
  return (
    <main className="directorate-page">
      <header className="directorate-page__header">
        <div><p>THE LONG REVOLUTION</p><h1>DIRECTORATE CONTROL NETWORK</h1></div>
        <button type="button" onClick={onBackToTitle}>CLOSE</button>
      </header>
      <section className="directorate-page__status">
        <span className="directorate-page__status-light" /> BOOTSTRAP DIRECTORATE / CONTROL CHANNEL OPEN
      </section>
      <div className="management-console">
        <aside className="management-console__nav" aria-label="관리자 콘솔 메뉴">
          <div><strong>MANAGEMENT</strong><button type="button" onClick={() => setPaletteOpen(true)}>검색 <kbd>Ctrl K</kbd></button></div>
          {MANAGEMENT_NAV.map((group) => <section key={group.group}><h2>{group.group}</h2>{group.items.map((item) => <button type="button" data-active={activeView === item.id} onClick={() => setActiveView(item.id)} key={item.id}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</section>)}
        </aside>
        <section className="management-console__main">
          {activeView === "dashboard" ? <section className="management-dashboard"><header><div><span>OPERATOR OVERVIEW</span><h2>운영 대시보드</h2></div><strong>{worldDate || "세계날짜 확인 중"}</strong></header><div className="management-dashboard__metrics"><article><span>외교 검토</span><strong>{queue.length}</strong><button type="button" onClick={() => setActiveView("diplomacy")}>열기</button></article><article><span>무역 검토</span><strong>{tradeQueue.length}</strong><button type="button" onClick={() => setActiveView("economy")}>열기</button></article><article><span>연구 프로젝트</span><strong>{researchData?.projects.length ?? 0}</strong><button type="button" onClick={() => setActiveView("research")}>열기</button></article><article><span>세계시간 요청</span><strong>{worldControlData ? worldControlData.counts.advance + worldControlData.counts.hold : 0}</strong><button type="button" onClick={() => setActiveView("world-control")}>열기</button></article></div><div className="management-dashboard__quick"><h3>빠른 작업</h3><button type="button" onClick={() => setActiveView("event-studio")}>새 이벤트 제작</button><button type="button" onClick={() => setActiveView("provinces")}>Region 편집</button><button type="button" onClick={() => setActiveView("system")}>플레이 테스트</button><button type="button" onClick={() => setActiveView("world-control")}>세계시간 요청 검토</button></div><p>세계날짜는 달력이며 턴은 별도 운영·정산 주기입니다. 날짜 요청 화면에서 턴을 직접 증가시키지 않습니다.</p></section> : null}
          {activeView === "event-studio" ? <ContentStudio /> : null}
          {activeView === "decision-studio" ? <DecisionCatalog /> : null}
          {activeView === "system" ? <><SiteStatusAdminSection /><AdminPlayPreviewSection /><AdminMembershipSection /><CountryExpulsionAdminSection /></> : null}
          {activeView === "capitals" ? <MapCapitalAdminSection /> : null}
          {activeView === "provinces" ? <ProvinceRegionAdminSection /> : null}
          {activeView === "world-control" && worldControlData ? <><WorldControlAdminSection data={worldControlData} onReload={loadQueue} onError={setQueueError} /><section className="management-turn-separation"><article><span>WORLD TIME</span><h3>세계날짜</h3><strong>{worldControlData.worldDate}</strong><p>이벤트·연구·첩보·건조의 달력 기준</p></article><article><span>TURN</span><h3>턴 관리</h3><strong>{worldControlData.turn.configured ? `${worldControlData.turn.number}턴 · ${worldControlData.turn.status}` : "턴 스케줄 미설정"}</strong><p>{worldControlData.turn.configured ? `${worldControlData.turn.startWorldDate} — ${worldControlData.turn.endWorldDate ?? "종료 경계 미설정"}` : "날짜에서 턴을 임의 추정하지 않습니다."}</p></article></section></> : null}
          {activeView === "research" && researchData ? <ResearchAdminSection data={researchData} busyId={busyId} onAction={reviewResearch} /> : null}
          {activeView === "intelligence" && intelligenceData ? <IntelligenceAdminSection data={intelligenceData} onReload={loadQueue} onError={setQueueError} /> : null}
          {activeView === "military" && militaryData ? <MilitaryAdminSection data={militaryData} onReload={loadQueue} onError={setQueueError} /> : null}
          {activeView === "economy" ? <>
      <section className="directorate-diplomacy" aria-labelledby="directorate-economy-title">
        <header>
          <div><span>ECONOMIC OFFICE / DATA READINESS</span><h2 id="directorate-economy-title">경제 데이터·계약 관제</h2></div>
          <strong>경제 입력 {economies.length}국 · 계약 {tradeAgreements.length}건</strong>
        </header>
        <div className="directorate-diplomacy__queue">
          {economies.map((economy) => <article key={economy.country_key}><div><small>COUNTRY ECONOMY</small><h3>{countryName(economy.country_key)}</h3><p>GDP {economy.gdp ?? "미설정"} · 생산능력 {economy.base_production_capacity ?? "미설정"}</p></div></article>)}
          {tradeAgreements.map((agreement) => (
            <article key={agreement.id}>
              <div><small>{agreement.status} · {agreement.starts_world_date} — {agreement.ends_world_date}</small><h3>{countryName(agreement.country_a_key)} ↔ {countryName(agreement.country_b_key)}</h3><p>{agreement.lines.length}개 항목 · 다음 정산 {agreement.next_settlement_world_date ?? "없음"}</p></div>
              <div className="directorate-diplomacy__buttons">
                {agreement.status === "SUSPENDED" || agreement.status === "BREACHED" ? <button type="button" disabled={busyId === agreement.id} onClick={() => void controlAgreement(agreement.id, "RESTORE_AGREEMENT")}>복구</button> : <button type="button" disabled={busyId === agreement.id} onClick={() => void controlAgreement(agreement.id, "SUSPEND_AGREEMENT")}>정지</button>}
                <button type="button" disabled={busyId === agreement.id} onClick={() => void controlAgreement(agreement.id, "TERMINATE_AGREEMENT")}>종료</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="directorate-diplomacy" aria-labelledby="directorate-trade-title">
        <header>
          <div><span>TRADE OFFICE / ADMIN REVIEW</span><h2 id="directorate-trade-title">AI 무역 검토 큐</h2></div>
          <strong>{worldDate || "—"} · {tradeQueue.length}건</strong>
        </header>
        {tradeQueue.length === 0 ? <p className="directorate-diplomacy__empty">대기 중인 무역 제안이 없습니다.</p> : null}
        <div className="directorate-diplomacy__queue">
          {tradeQueue.map((proposal) => (
            <article key={proposal.id}>
              <div>
                <small>{proposal.proposed_start_world_date} — {proposal.proposed_end_world_date}</small>
                <h3>{countryName(proposal.proposer_country_key)} → {countryName(proposal.receiver_country_key)}</h3>
                <p>{proposal.lines.length}개 교환 항목 · 응답 기한 {proposal.response_deadline_world_date}</p>
              </div>
              <div className="directorate-diplomacy__buttons">
                <button type="button" disabled={busyId === proposal.id} onClick={() => void reviewTrade(proposal.id, "ACCEPT")}>승인</button>
                <button type="button" disabled={busyId === proposal.id} onClick={() => void reviewTrade(proposal.id, "REJECT")}>거절</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      </> : null}
      {activeView === "system" ? <section className="directorate-page__grid">
        {actions.map(([id, title, description]) => (
          <article key={id} className="directorate-action">
            <span className="directorate-action__id">{id}</span><h2>{title}</h2><p>{description}</p>
            <button type="button" disabled>관제 기록 준비됨</button>
          </article>
        ))}
      </section> : null}
      {activeView === "diplomacy" ? <section className="directorate-diplomacy" aria-labelledby="directorate-diplomacy-title">
        <header>
          <div><span>FOREIGN OFFICE / ADMIN REVIEW</span><h2 id="directorate-diplomacy-title">AI 외교 검토 큐</h2></div>
          <strong>{worldDate || "—"} · {queue.length}건</strong>
        </header>
        {queueError ? <p className="directorate-diplomacy__error" role="alert">{queueError}</p> : null}
        {queue.length === 0 ? <p className="directorate-diplomacy__empty">대기 중인 외교 제안이 없습니다.</p> : null}
        <div className="directorate-diplomacy__queue">
          {queue.map((proposal) => (
            <article key={proposal.id}>
              <div>
                <small>{PROPOSAL_LABELS[proposal.proposal_type]} · {proposal.sent_world_date}</small>
                <h3>{countryName(proposal.proposer_country_key)} → {countryName(proposal.receiver_country_key)}</h3>
                <p>응답 기한 {proposal.response_deadline_world_date}</p>
              </div>
              <div className="directorate-diplomacy__buttons">
                <button type="button" disabled={busyId === proposal.id} onClick={() => void review(proposal.id, "ACCEPT")}>승인</button>
                <button type="button" disabled={busyId === proposal.id} onClick={() => void review(proposal.id, "REJECT")}>거절</button>
                <button type="button" disabled={busyId === proposal.id} onClick={() => void review(proposal.id, "CANCEL")}>취소</button>
              </div>
            </article>
          ))}
        </div>
      </section> : null}
      {queueError ? <p className="directorate-diplomacy__error" role="alert">{queueError}</p> : null}
        </section>
      </div>
      {paletteOpen ? <div className="management-palette" role="dialog" aria-modal="true" aria-label="관리자 명령 검색"><div><header><strong>COMMAND PALETTE</strong><button type="button" onClick={() => setPaletteOpen(false)}>×</button></header>{MANAGEMENT_NAV.flatMap((group) => group.items).map((item) => <button type="button" key={item.id} onClick={() => { setActiveView(item.id); setPaletteOpen(false); }}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div></div> : null}
    </main>
  );
}
