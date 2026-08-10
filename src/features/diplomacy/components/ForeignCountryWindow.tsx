import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CountryFlag } from "../../../components/CountryFlag";
import { PartySupportChart } from "../../../components/PartySupportChart";
import { UiIcon } from "../../../components/UiIcon";
import { mapCountries } from "../../../data/mapCountries";
import { getCountryPresentation } from "../../../data/countryPresentation";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { PoliticsWindowShell } from "../../politics/components/PoliticsWindowShell";
import {
  announceDiplomacyUpdate,
  createProposal,
  DiplomacyApiError,
  loadDiplomacyOverview,
  respondToProposal,
  runRelationAction,
} from "../diplomacyClient";
import {
  PROPOSAL_LABELS,
  STATUS_LABELS,
  type DiplomacyOverview,
  type DiplomaticAgreement,
  type DiplomaticProposal,
  type ProposalType,
} from "../types";

type ForeignCountryWindowProps = {
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
  onClose: () => void;
};

type AuxiliaryView = "incoming" | "outgoing" | "agreements" | "history";
type RelationAction = "IMPROVE_RELATIONS" | "WORSEN_RELATIONS";

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
};

const ACTIONS: readonly {
  id: RelationAction | ProposalType;
  label: string;
  icon: string;
  proposal: boolean;
}[] = [
  { id: "IMPROVE_RELATIONS", label: "관계 개선", icon: "diplomacy/relations", proposal: false },
  { id: "WORSEN_RELATIONS", label: "관계 악화", icon: "diplomacy/relations", proposal: false },
  { id: "NON_AGGRESSION", label: PROPOSAL_LABELS.NON_AGGRESSION, icon: "diplomacy/treaty", proposal: true },
  { id: "TRADE_AGREEMENT", label: PROPOSAL_LABELS.TRADE_AGREEMENT, icon: "diplomacy/trade", proposal: true },
  { id: "FACTION_INVITATION", label: PROPOSAL_LABELS.FACTION_INVITATION, icon: "menu/handshake", proposal: true },
  { id: "MILITARY_ACCESS", label: PROPOSAL_LABELS.MILITARY_ACCESS, icon: "sections/military", proposal: true },
  { id: "INDEPENDENCE_GUARANTEE", label: PROPOSAL_LABELS.INDEPENDENCE_GUARANTEE, icon: "diplomacy/guarantee", proposal: true },
];

const AUXILIARY: readonly { id: AuxiliaryView; label: string; icon: string }[] = [
  { id: "incoming", label: "수신", icon: "diplomacy/message" },
  { id: "outgoing", label: "발신", icon: "diplomacy/direction-arrow" },
  { id: "agreements", label: "협정", icon: "diplomacy/treaty" },
  { id: "history", label: "기록", icon: "diplomacy/archive" },
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

function ProposalRow({ proposal, actorKey, busy, onAction }: {
  proposal: DiplomaticProposal;
  actorKey: string;
  busy: boolean;
  onAction: (proposal: DiplomaticProposal, action: "ACCEPT" | "REJECT" | "WITHDRAW") => void;
}) {
  const incoming = proposal.receiver_country_key === actorKey;
  return (
    <article className="diplomacy-compact-record" data-status={proposal.status.toLowerCase()}>
      <div className="diplomacy-compact-record__flags">
        <Flag countryKey={proposal.proposer_country_key} />
        <span aria-hidden="true">›</span>
        <Flag countryKey={proposal.receiver_country_key} />
      </div>
      <div><strong>{PROPOSAL_LABELS[proposal.proposal_type]}</strong><small>{STATUS_LABELS[proposal.status]} · {proposal.sent_world_date}</small></div>
      {proposal.status === "PENDING" ? (
        <footer>
          {incoming && proposal.review_route === "PLAYER" ? <><button type="button" disabled={busy} onClick={() => onAction(proposal, "ACCEPT")}>수락</button><button type="button" disabled={busy} onClick={() => onAction(proposal, "REJECT")}>거절</button></> : null}
          {!incoming ? <button type="button" disabled={busy} onClick={() => onAction(proposal, "WITHDRAW")}>철회</button> : null}
        </footer>
      ) : null}
    </article>
  );
}

function StatusBoard({ overview, playerCountry, targetCountry }: {
  overview: DiplomacyOverview;
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
}) {
  const agreements = overview.agreements.filter((agreement) => agreement.status === "ACTIVE" || agreement.status === "SCHEDULED");
  return (
    <section className="diplomacy-status-board" aria-label="외교 상태">
      <header><UiIcon name="menu/diplomacy" /><strong>외교 상태</strong></header>
      <div className="diplomacy-status-list">
        {agreements.length ? agreements.map((agreement) => (
          <article key={agreement.id}>
            <UiIcon name={agreement.agreement_type === "TRADE_AGREEMENT" ? "diplomacy/trade" : "diplomacy/treaty"} />
            <div><strong>{AGREEMENT_LABELS[agreement.agreement_type]}</strong><small>{agreement.status === "ACTIVE" ? "발효 중" : "발효 예정"}</small></div>
            <span><Flag countryKey={agreement.country_a_key} /><Flag countryKey={agreement.country_b_key} /></span>
          </article>
        )) : <p className="diplomacy-status-empty">체결된 협정 없음</p>}
      </div>
      <dl className="diplomacy-relation-strip">
        <div><dt>{playerCountry.name} →</dt><dd>{overview.relations.outgoing.available ? signed(overview.relations.outgoing.score) : "—"}</dd></div>
        <div><dt>{targetCountry.name} →</dt><dd>{overview.relations.incoming.available ? signed(overview.relations.incoming.score) : "—"}</dd></div>
      </dl>
    </section>
  );
}

function DiplomacyNationalSpirits({ targetCountry }: { targetCountry: MapCountryIndex }) {
  const spirits = getCountryPresentation(targetCountry).nationalSpirits;
  return (
    <>
      <header><strong>국민정신</strong><span>{spirits.length}</span></header>
      <div className="foreign-diplomacy__spirits">
        {spirits.map((spirit) => (
          <article key={spirit.id} tabIndex={0}>
            {spirit.imagePath ? <img src={spirit.imagePath} alt="" draggable={false} /> : null}
            <div role="tooltip">
              <strong>{spirit.name}</strong>
              <p>{spirit.description}</p>
              {spirit.effects.map((effect) => <span key={effect.text} data-tone={effect.tone}>{effect.text}</span>)}
            </div>
          </article>
        ))}
      </div>
    </>
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

function AuxiliaryPanel({ view, overview, playerCountry, busy, onClose, onProposalAction }: {
  view: AuxiliaryView;
  overview: DiplomacyOverview;
  playerCountry: MapCountryIndex;
  busy: boolean;
  onClose: () => void;
  onProposalAction: (proposal: DiplomaticProposal, action: "ACCEPT" | "REJECT" | "WITHDRAW") => void;
}) {
  const title = AUXILIARY.find((item) => item.id === view)?.label ?? "외교 기록";
  const proposals = overview.proposals.filter((proposal) => view === "incoming" ? proposal.receiver_country_key === playerCountry.key : proposal.proposer_country_key === playerCountry.key);
  return (
    <section className="diplomacy-auxiliary-panel" aria-label={title}>
      <header><strong>{title}</strong><button type="button" onClick={onClose} aria-label={`${title} 닫기`}><UiIcon name="ui/close" /></button></header>
      <div>
        {(view === "incoming" || view === "outgoing") ? (proposals.length ? proposals.map((proposal) => <ProposalRow key={proposal.id} proposal={proposal} actorKey={playerCountry.key} busy={busy} onAction={onProposalAction} />) : <p>기록 없음</p>) : null}
        {view === "agreements" ? (overview.agreements.length ? overview.agreements.map((agreement) => <article className="diplomacy-compact-record" key={agreement.id}><UiIcon name="diplomacy/treaty" /><div><strong>{AGREEMENT_LABELS[agreement.agreement_type]}</strong><small>{agreement.starts_world_date} — {agreement.ends_world_date ?? "기한 없음"}</small></div><span>{agreement.status}</span></article>) : <p>협정 없음</p>) : null}
        {view === "history" ? (overview.history.length ? overview.history.map((entry) => <article className="diplomacy-compact-record" key={entry.id}><UiIcon name="diplomacy/archive" /><div><strong>{entry.reason}</strong><small>{entry.world_date} · {entry.previous_score} → {entry.next_score}</small></div><span data-tone={entry.change_amount >= 0 ? "positive" : "negative"}>{signed(entry.change_amount)}</span></article>) : <p>기록 없음</p>) : null}
      </div>
    </section>
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
  const [auxiliary, setAuxiliary] = useState<AuxiliaryView | null>(null);
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

  const proposalAction = (proposal: DiplomaticProposal, action: "ACCEPT" | "REJECT" | "WITHDRAW") => {
    void execute(() => respondToProposal(playerCountry.key, proposal.id, action));
  };

  const auxiliaryCount = (view: AuxiliaryView): number => {
    if (!overview) return 0;
    if (view === "incoming") return overview.proposals.filter((proposal) => proposal.receiver_country_key === playerCountry.key).length;
    if (view === "outgoing") return overview.proposals.filter((proposal) => proposal.proposer_country_key === playerCountry.key).length;
    if (view === "agreements") return overview.agreements.length;
    return overview.history.length;
  };

  const diplomacyBody = (
    <div className="foreign-diplomacy__law-replacement">
      <header><div><strong>외교</strong><span>{playerCountry.name} 외무 기록</span></div></header>
      {error ? <div className="diplomacy-error" role="alert">{error}<button type="button" onClick={() => void reload()}>재시도</button></div> : null}
      {playerCountry.key === targetCountry.key ? <div className="diplomacy-state diplomacy-state--empty"><strong>외교 대상 선택</strong><p>지도에서 자국이 아닌 국가를 선택하십시오.</p></div> : null}
      {loading && !overview ? <div className="diplomacy-state"><span className="diplomacy-signal" />외교 기록 수신 중</div> : null}
      {overview && playerCountry.key !== targetCountry.key ? <div className="foreign-diplomacy__main"><StatusBoard overview={overview} playerCountry={playerCountry} targetCountry={targetCountry} /><section className="diplomacy-action-stack" aria-label="외교 행동"><header><UiIcon name="diplomacy/dispatch" /><strong>외교 행동</strong></header>{ACTIONS.map((action) => { const availability = overview.actions[action.id]; return <button key={action.id} type="button" disabled={busy || !availability?.available} title={availability?.reason ?? undefined} onClick={() => runAction(action.id, action.proposal)}><UiIcon name={action.icon} /><span>{action.label}</span><b>{availability?.available ? "›" : "—"}</b></button>; })}</section></div> : null}
      {overview && auxiliary ? <AuxiliaryPanel view={auxiliary} overview={overview} playerCountry={playerCountry} busy={busy} onClose={() => setAuxiliary(null)} onProposalAction={proposalAction} /> : null}
    </div>
  );

  return <>
    <PoliticsWindowShell
      ariaLabel={`${presentation.title} 외교`}
      style={panelStyle}
      flag={<CountryFlag country={targetCountry} flagPath={presentation.flagPath} className="politics-template__flag-underlay" />}
      portraitPath={presentation.leader.portraitPath}
      closeLabel="외교창 닫기"
      regions={{
        ideology: <><UiIcon name="diplomacy/dispatch" /><small>{presentation.politics.ideology || "비동맹"}</small></>,
        identity: <><small>외교 대상국</small><h1 title={presentation.title}>{presentation.title}</h1><p>{presentation.secondaryNames[0] || presentation.politics.government || "국가 표기 미설정"}</p><strong>{presentation.politics.faction || "세력에 소속되지 않음"}</strong></>,
        nationalSpirits: <DiplomacyNationalSpirits targetCountry={targetCountry} />,
        leaderCaption: <div className="foreign-diplomacy__leader-caption"><strong>{presentation.leader.name || "지도자 미설정"}</strong><span>{presentation.leader.title}</span></div>,
        partySupport: <><div className="politics-template__party-heading"><UiIcon name="diplomacy/relations" /><div><strong>{partyName}</strong><span>{ideology}</span></div></div><PartySupportChart parties={presentation.politics.parties} /></>,
        governmentSystem: <nav className="foreign-diplomacy__aux-nav" aria-label="외교 보조 기록">{AUXILIARY.slice(0, 2).map((item) => <button key={item.id} type="button" aria-pressed={auxiliary === item.id} onClick={() => setAuxiliary(auxiliary === item.id ? null : item.id)}><UiIcon name={item.icon} /><span>{item.label}</span><b>{auxiliaryCount(item.id)}</b></button>)}</nav>,
        powerBase: <nav className="foreign-diplomacy__aux-nav" aria-label="외교 협정과 기록">{AUXILIARY.slice(2).map((item) => <button key={item.id} type="button" aria-pressed={auxiliary === item.id} onClick={() => setAuxiliary(auxiliary === item.id ? null : item.id)}><UiIcon name={item.icon} /><span>{item.label}</span><b>{auxiliaryCount(item.id)}</b></button>)}</nav>,
        lawScroll: diplomacyBody,
      }}
      onClose={onClose}
    />
    {overview && composer ? <ProposalComposer proposalType={composer} overview={overview} busy={busy} onClose={() => setComposer(null)} onSubmit={(duration) => sendProposal(composer, duration)} /> : null}
  </>;
}
