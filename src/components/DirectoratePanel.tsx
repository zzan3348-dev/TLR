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

type DirectoratePanelProps = { onBackToTitle: () => void };
type AdminSessionState = "checking" | "authorized" | "not-found";

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
  const [state, setState] = useState<AdminSessionState>("checking");
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
    let active = true;
    void fetch("/api/admin/session", { credentials: "include" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setState("not-found");
          return;
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
  }, [loadQueue]);

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
      <SiteStatusAdminSection />
      <CountryExpulsionAdminSection />
      <MapCapitalAdminSection />
      <ProvinceRegionAdminSection />
      {worldControlData ? <WorldControlAdminSection data={worldControlData} onReload={loadQueue} onError={setQueueError} /> : null}
      {researchData ? <ResearchAdminSection data={researchData} busyId={busyId} onAction={reviewResearch} /> : null}
      {intelligenceData ? <IntelligenceAdminSection data={intelligenceData} onReload={loadQueue} onError={setQueueError} /> : null}
      {militaryData ? <MilitaryAdminSection data={militaryData} onReload={loadQueue} onError={setQueueError} /> : null}
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
      <section className="directorate-page__grid">
        {actions.map(([id, title, description]) => (
          <article key={id} className="directorate-action">
            <span className="directorate-action__id">{id}</span><h2>{title}</h2><p>{description}</p>
            <button type="button" disabled>관제 기록 준비됨</button>
          </article>
        ))}
      </section>
      <section className="directorate-diplomacy" aria-labelledby="directorate-diplomacy-title">
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
      </section>
      <p className="directorate-page__note">모든 외교 조치는 서버에서 상태와 권한을 다시 검증하고 외교 사건 기록에 남습니다.</p>
    </main>
  );
}
