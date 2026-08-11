import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CountryFlag } from "../../../components/CountryFlag";
import { PartySupportChart } from "../../../components/PartySupportChart";
import { UiIcon } from "../../../components/UiIcon";
import { mapCountries } from "../../../data/mapCountries";
import { getCountryPresentation } from "../../../data/countryPresentation";
import { getFaction } from "../../../data/factions";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { getPartyDisplayColor } from "../../../utils/partyColors";
import {
  PoliticsLeaderInfo,
  PoliticsNationalSpirits,
} from "../../politics/components/PoliticsPanel";
import { PoliticsWindowShell } from "../../politics/components/PoliticsWindowShell";
import {
  announceDiplomacyUpdate,
  createProposal,
  DiplomacyApiError,
  loadDiplomacyOverview,
  runRelationAction,
} from "../diplomacyClient";
import {
  PROPOSAL_LABELS,
  type DiplomacyOverview,
  type DiplomaticAgreement,
  type ProposalType,
} from "../types";

type ForeignCountryWindowProps = {
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
  onClose: () => void;
};

type RelationAction = "IMPROVE_RELATIONS" | "WORSEN_RELATIONS" | "DECLARE_WAR";

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "외교 기능을 사용하려면 인증이 필요합니다.",
  COUNTRY_OWNERSHIP_REQUIRED: "현재 계정에 배정된 국가가 없습니다.",
  COUNTRY_OWNERSHIP_REVOKED: "국가 운영권이 회수되었습니다.",
  PLAY_ACCESS_BLOCKED: "현재 계정은 국가 기능을 사용할 수 없습니다.",
  SELF_TARGET: "자국이 아닌 외교 대상을 지도에서 선택하십시오.",
  DIPLOMACY_DATA_UNAVAILABLE: "외교 기록을 불러올 수 없습니다. 잠시 뒤 다시 시도하십시오.",
  DIPLOMACY_SERVER_NOT_CONFIGURED: "외교 데이터 서버가 설정되지 않았습니다.",
  DIPLOMACY_RESPONSE_INVALID: "외교 데이터 응답을 확인할 수 없습니다.",
  DUPLICATE_PENDING_PROPOSAL: "동일한 제안이 이미 응답을 기다리고 있습니다.",
  AGREEMENT_EXISTS: "동일한 협정이 이미 발효 중입니다.",
  ACTION_COOLDOWN: "이 행동은 아직 다시 실행할 수 없습니다.",
  WAR_ALREADY_ACTIVE: "이미 두 국가가 참여 중인 무력분쟁이 존재합니다.",
};

const ACTIONS: readonly {
  id: RelationAction | ProposalType;
  label: string;
  icon: string;
  proposal: boolean;
}[] = [
  { id: "IMPROVE_RELATIONS", label: "관계 개선", icon: "diplomacy/improve-relations", proposal: false },
  { id: "WORSEN_RELATIONS", label: "관계 악화", icon: "diplomacy/worsen-relations", proposal: false },
  { id: "NON_AGGRESSION", label: PROPOSAL_LABELS.NON_AGGRESSION, icon: "diplomacy/non-aggression", proposal: true },
  { id: "TRADE_AGREEMENT", label: PROPOSAL_LABELS.TRADE_AGREEMENT, icon: "diplomacy/trade-agreement", proposal: true },
  { id: "FACTION_INVITATION", label: PROPOSAL_LABELS.FACTION_INVITATION, icon: "diplomacy/faction-invitation", proposal: true },
  { id: "MILITARY_ACCESS", label: PROPOSAL_LABELS.MILITARY_ACCESS, icon: "diplomacy/military-access", proposal: true },
  { id: "INDEPENDENCE_GUARANTEE", label: PROPOSAL_LABELS.INDEPENDENCE_GUARANTEE, icon: "diplomacy/independence-guarantee", proposal: true },
  { id: "DECLARE_WAR", label: "선전포고", icon: "diplomacy/declare-war", proposal: false },
];

const AGREEMENT_LABELS: Record<DiplomaticAgreement["agreement_type"], string> = {
  ...PROPOSAL_LABELS,
  FACTION_MEMBERSHIP: "세력 회원국",
};

function errorMessage(error: unknown): string {
  return error instanceof DiplomacyApiError
    ? ERROR_MESSAGES[error.code] ?? `외교 요청이 거부되었습니다. (${error.code})`
    : "외교 통신 중 예상하지 못한 오류가 발생했습니다.";
}

function emptyDiplomacyOverview(actorCountryKey: string, targetCountryKey: string): DiplomacyOverview {
  const unavailable = { available: false, reason: "외교 데이터 입력 대기" };
  return {
    actorCountryKey,
    targetCountryKey,
    worldDate: "1932-01-01",
    targetReviewRoute: "ADMIN",
    relations: {
      outgoing: { available: false, baseScore: null, score: null, modifiers: [] },
      incoming: { available: false, baseScore: null, score: null, modifiers: [] },
    },
    actions: {
      IMPROVE_RELATIONS: unavailable,
      WORSEN_RELATIONS: unavailable,
      NON_AGGRESSION: unavailable,
      TRADE_AGREEMENT: unavailable,
      FACTION_INVITATION: unavailable,
      MILITARY_ACCESS: unavailable,
      INDEPENDENCE_GUARANTEE: unavailable,
      DECLARE_WAR: unavailable,
      SEND_MESSAGE: unavailable,
      INTELLIGENCE_NETWORK: unavailable,
    },
    proposals: [], agreements: [], history: [],
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function signed(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function countryByKey(key: string): MapCountryIndex | null {
  return mapCountries.find((country) => country.key === key) ?? null;
}

function Flag({ countryKey }: { countryKey: string }) {
  const country = countryByKey(countryKey);
  if (!country) return null;
  const presentation = getCountryPresentation(country);
  return <CountryFlag country={country} flagPath={presentation.flagPath} className="diplomacy-mini-flag" />;
}

function StatusBoard({ overview, playerCountry, targetCountry }: {
  overview: DiplomacyOverview;
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
}) {
  const agreements = overview.agreements.filter((agreement) => agreement.status === "ACTIVE" || agreement.status === "SCHEDULED");
  const playerFaction = playerCountry.factionMembership;
  const targetFaction = targetCountry.factionMembership;
  const sharedFaction = playerFaction?.status === "member"
    && targetFaction?.status === "member"
    && playerFaction.factionId === targetFaction.factionId
    ? getFaction(playerFaction.factionId)
    : null;
  return (
    <section className="diplomacy-status-board" aria-label="외교 상태">
      <header><UiIcon name="menu/diplomacy" /><strong>외교 상태</strong></header>
      <div className="diplomacy-status-list">
        {sharedFaction ? (
          <article className="diplomacy-status-list__alliance">
            <UiIcon name="diplomacy/faction-invitation" />
            <div><strong>{sharedFaction.name} · 동맹</strong></div>
            <span><Flag countryKey={playerCountry.key} /><Flag countryKey={targetCountry.key} /></span>
          </article>
        ) : null}
        {agreements.map((agreement) => (
          <article key={agreement.id}>
            <UiIcon name={agreement.agreement_type === "TRADE_AGREEMENT" ? "diplomacy/trade" : "diplomacy/treaty"} />
            <div><strong>{AGREEMENT_LABELS[agreement.agreement_type]}</strong></div>
            <span><Flag countryKey={agreement.country_a_key} /><Flag countryKey={agreement.country_b_key} /></span>
          </article>
        ))}
        {!sharedFaction && !agreements.length ? <p className="diplomacy-status-empty">체결된 협정 없음</p> : null}
      </div>
      <dl className="diplomacy-relation-strip">
        <div><dt>{playerCountry.name} →</dt><dd>{overview.relations.outgoing.available ? signed(overview.relations.outgoing.score) : "—"}</dd></div>
        <div><dt>{targetCountry.name} →</dt><dd>{overview.relations.incoming.available ? signed(overview.relations.incoming.score) : "—"}</dd></div>
      </dl>
    </section>
  );
}

function ProposalComposer({ proposalType, overview, busy, onClose, onSubmit }: {
  proposalType: ProposalType;
  overview: DiplomacyOverview;
  busy: boolean;
  onClose: () => void;
  onSubmit: (duration: number) => void;
}) {
  const [duration, setDuration] = useState(365);
  return (
    <div className="diplomacy-secondary-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="diplomacy-secondary-popup" role="dialog" aria-modal="true" aria-label={`${PROPOSAL_LABELS[proposalType]} 조건`}>
        <header><div><small>외교문서 작성</small><strong>{PROPOSAL_LABELS[proposalType]}</strong></div><button type="button" onClick={onClose} aria-label="제안 창 닫기"><UiIcon name="ui/close" /></button></header>
        <label>유효 기간<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={180}>180일</option><option value={365}>1년</option><option value={730}>2년</option><option value={0}>기한 없음</option></select></label>
        <p>{overview.targetReviewRoute === "PLAYER" ? "상대국 운영자에게 전달" : "관제국 검토 대기열로 전달"}</p>
        <footer><button type="button" onClick={onClose}>취소</button><button type="button" disabled={busy} onClick={() => onSubmit(duration)}>제안 발신</button></footer>
      </section>
    </div>
  );
}

export function ForeignCountryWindow({ playerCountry, targetCountry, onClose }: ForeignCountryWindowProps) {
  const presentation = getCountryPresentation(targetCountry);
  const primaryParty = presentation.politics.parties[0] ?? null;
  const partyName = primaryParty?.name || presentation.politics.rulingParty || "미설정";
  const ideology = primaryParty?.ideology || presentation.politics.ideology || "미설정";
  const [overview, setOverview] = useState<DiplomacyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState<ProposalType | null>(null);
  const panelStyle = useMemo(() => ({ "--country-accent": targetCountry.color }) as CSSProperties, [targetCountry.color]);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await loadDiplomacyOverview(playerCountry.key, targetCountry.key, signal);
      setOverview(data); setError(null);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setOverview(emptyDiplomacyOverview(playerCountry.key, targetCountry.key));
      setError(requestError instanceof DiplomacyApiError && requestError.code === "DIPLOMACY_SERVER_NOT_CONFIGURED"
        ? null
        : errorMessage(requestError));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [playerCountry.key, targetCountry.key]);

  useEffect(() => {
    const controller = new AbortController();
    const initialReload = window.setTimeout(() => void reload(controller.signal), 0);
    const refresh = () => void reload();
    window.addEventListener("tlr:diplomacy-updated", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialReload);
      window.removeEventListener("tlr:diplomacy-updated", refresh);
    };
  }, [reload]);

  const execute = async (operation: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError(null);
    try { await operation(); after?.(); announceDiplomacyUpdate(); await reload(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };

  const runAction = (id: RelationAction | ProposalType, proposal: boolean) => {
    if (proposal) { setComposer(id as ProposalType); return; }
    if (id === "DECLARE_WAR" && !window.confirm(`${presentation.title}에 선전포고하시겠습니까? 이 행동은 즉시 무력분쟁을 생성합니다.`)) return;
    void execute(() => runRelationAction(playerCountry.key, targetCountry.key, id as RelationAction));
  };

  const sendProposal = (proposalType: ProposalType, duration: number) => {
    if (!overview) return;
    const startsWorldDate = addDays(overview.worldDate, 1);
    void execute(() => createProposal(playerCountry.key, {
      targetCountryKey: targetCountry.key,
      proposalType,
      startsWorldDate,
      endsWorldDate: duration > 0 ? addDays(startsWorldDate, duration) : null,
      deadlineWorldDate: addDays(overview.worldDate, 14),
      terms: { durationDays: duration || null },
    }), () => setComposer(null));
  };

  const primaryPartyColor = primaryParty ? getPartyDisplayColor(primaryParty, 0) : "#54615f";
  const activeAgreements = overview?.agreements.filter((agreement) => agreement.status === "ACTIVE" || agreement.status === "SCHEDULED") ?? [];

  return (
    <>
      <PoliticsWindowShell
        ariaLabel={`${presentation.title} 외교`}
        style={{ ...panelStyle, "--primary-party-color": primaryPartyColor } as CSSProperties}
        flag={<CountryFlag country={targetCountry} flagPath={presentation.flagPath} className="politics-template__flag-underlay" />}
        portraitPath={presentation.leader.portraitPath}
        regions={{
          ideology: (
            <>
              {presentation.politics.symbolPath ? <img src={presentation.politics.symbolPath} alt="" draggable={false} /> : null}
              <small>{ideology}</small>
            </>
          ),
          identity: (
            <>
              <small>외교 대상국</small>
              <h1 title={presentation.title}>{presentation.title}</h1>
              <p title={presentation.secondaryNames[0] || undefined}>{presentation.secondaryNames[0] || "국가 표기 미설정"}</p>
              <strong title={partyName}>{partyName}</strong>
            </>
          ),
          nationalSpirits: (
            <>
              <header><strong>국민정신</strong><span>{presentation.nationalSpirits.length}</span></header>
              <PoliticsNationalSpirits spirits={presentation.nationalSpirits} />
            </>
          ),
          leaderCaption: <PoliticsLeaderInfo leader={presentation.leader} />,
          partySupport: (
            <>
              <div className="politics-template__party-heading">
                {presentation.politics.symbolPath ? <img src={presentation.politics.symbolPath} alt="" draggable={false} /> : null}
                <div><strong title={partyName}>{partyName}</strong><span title={ideology}>{ideology}</span></div>
              </div>
              <PartySupportChart parties={presentation.politics.parties} />
            </>
          ),
          governmentSystem: (
            <div className="diplomacy-template__relation-summary">
              <span>{playerCountry.name} → {signed(overview?.relations.outgoing.score ?? null)}</span>
              <span>{presentation.title} → {signed(overview?.relations.incoming.score ?? null)}</span>
            </div>
          ),
          powerBase: (
            <>
              <span>{activeAgreements[0] ? AGREEMENT_LABELS[activeAgreements[0].agreement_type] : "체결 협정 없음"}</span>
              <span>{overview?.targetReviewRoute === "PLAYER" ? "상대국 관제" : "관리자 관제"}</span>
              <span>{loading ? "통신 중" : "외교망 연결"}</span>
            </>
          ),
          lawScroll: (
            <>
              <header className="diplomacy-template__split-heading">
                <div><strong>외교 관계</strong></div>
              </header>
              <div className="diplomacy-template__split">
                {error ? <div className="diplomacy-error" role="alert">{error}<button type="button" onClick={() => void reload()}>재시도</button></div> : null}
                {loading && !overview ? <div className="diplomacy-state"><span className="diplomacy-signal" />외교 기록 수신 중</div> : null}
                {overview ? (
                  <>
                    <section className="diplomacy-template__relations-column" aria-label="대상국 외교 관계">
                      <header><UiIcon name="diplomacy/treaty" /><div><strong>외교 현황</strong></div></header>
                      <div className="diplomacy-template__relations-content">
                        <StatusBoard overview={overview} playerCountry={playerCountry} targetCountry={targetCountry} />
                      </div>
                    </section>
                    <section className="diplomacy-template__requests-column" aria-label="외교 요청">
                      <header><UiIcon name="diplomacy/message" /><div><strong>외교 행동</strong></div></header>
                      <div className="politics-template__law-scroll diplomacy-template__actions">
                    <div className="diplomacy-template__action-list">
                      {ACTIONS.map((action) => {
                        const availability = overview.actions[action.id];
                        return (
                          <button
                            key={action.id}
                            type="button"
                            className={action.id === "DECLARE_WAR" ? "diplomacy-template__action--danger" : undefined}
                            disabled={busy || !availability?.available}
                            title={availability?.reason ?? undefined}
                            onClick={() => runAction(action.id, action.proposal)}
                          >
                            <UiIcon name={action.icon} />
                            <span><strong>{action.label}</strong></span>
                            <i>{availability?.available ? "선택" : "—"}</i>
                          </button>
                        );
                      })}
                    </div>
                      </div>
                    </section>
                  </>
                ) : null}
              </div>
            </>
          ),
        }}
        onClose={onClose}
      />
      {overview && composer ? <ProposalComposer proposalType={composer} overview={overview} busy={busy} onClose={() => setComposer(null)} onSubmit={(duration) => sendProposal(composer, duration)} /> : null}
    </>
  );
}
