import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { CountryFlag } from "../../../components/CountryFlag";
import { PartySupportChart } from "../../../components/PartySupportChart";
import { UiIcon } from "../../../components/UiIcon";
import { getCountryPresentation } from "../../../data/countryPresentation";
import type { CountryNationalSpirit } from "../../../types/countryPresentation";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { getPartyDisplayColor } from "../../../utils/partyColors";
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
  type DiplomaticProposal,
  type DirectionalRelation,
  type ProposalType,
} from "../types";

type ForeignCountryWindowProps = {
  playerCountry: MapCountryIndex;
  targetCountry: MapCountryIndex;
  onClose: () => void;
};

type WorkspaceTab = "actions" | "incoming" | "outgoing" | "agreements" | "history";

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "외교 기능을 사용하려면 인증이 필요합니다.",
  COUNTRY_OWNERSHIP_REQUIRED: "현재 계정에 배정된 국가가 없습니다.",
  COUNTRY_OWNERSHIP_REVOKED: "국가 운영권이 회수되었습니다.",
  PLAY_ACCESS_BLOCKED: "현재 계정은 국가 기능을 사용할 수 없습니다.",
  SELF_TARGET: "자국이 아닌 외교 대상을 지도에서 선택하십시오.",
  DIPLOMACY_DATA_UNAVAILABLE: "외교 기록을 불러올 수 없습니다. 잠시 뒤 다시 시도하십시오.",
  DIPLOMACY_SERVER_NOT_CONFIGURED: "외교 데이터 서버가 설정되지 않았습니다.",
  DIPLOMACY_RESPONSE_INVALID: "외교 데이터 응답을 확인할 수 없습니다. 서버 설정을 점검하십시오.",
  DUPLICATE_PENDING_PROPOSAL: "동일한 제안이 이미 응답을 기다리고 있습니다.",
  AGREEMENT_EXISTS: "동일한 협정이 이미 발효 중입니다.",
  ACTION_COOLDOWN: "이 행동은 아직 다시 실행할 수 없습니다.",
};

function errorMessage(error: unknown): string {
  return error instanceof DiplomacyApiError
    ? ERROR_MESSAGES[error.code] ?? `외교 요청이 거부되었습니다. (${error.code})`
    : "외교 통신 중 예상하지 못한 오류가 발생했습니다.";
}

function emptyDiplomacyOverview(
  actorCountryKey: string,
  targetCountryKey: string,
): DiplomacyOverview {
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
    proposals: [],
    agreements: [],
    history: [],
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

function ForeignNationalSpirits({ spirits }: { spirits: readonly CountryNationalSpirit[] }) {
  const [tooltip, setTooltip] = useState<{ spirit: CountryNationalSpirit; x: number; y: number } | null>(null);
  const showTooltip = (spirit: CountryNationalSpirit, event: PointerEvent<HTMLButtonElement>) => {
    const width = Math.min(330, window.innerWidth - 24);
    const height = Math.min(390, window.innerHeight - 24);
    setTooltip({
      spirit,
      x: Math.max(12, Math.min(event.clientX + 14, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(event.clientY + 14, window.innerHeight - height - 12)),
    });
  };
  return (
    <>
      <header><strong>국민정신</strong><span>{spirits.length}</span></header>
      <div>
        {spirits.slice(0, 8).map((spirit) => spirit.imagePath ? (
          <button
            key={spirit.id}
            type="button"
            aria-label={spirit.name}
            onPointerEnter={(event) => showTooltip(spirit, event)}
            onPointerMove={(event) => showTooltip(spirit, event)}
            onPointerLeave={() => setTooltip(null)}
            onFocus={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setTooltip({ spirit, x: Math.min(bounds.right + 12, window.innerWidth - 342), y: Math.max(12, bounds.top) });
            }}
            onBlur={() => setTooltip(null)}
          >
            <img src={spirit.imagePath} alt="" draggable={false} />
          </button>
        ) : null)}
      </div>
      {tooltip ? createPortal(
        <aside className="national-spirit-tooltip politics-national-spirit-tooltip diplomacy-national-spirit-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          <h3>{tooltip.spirit.name}</h3>
          <p>{tooltip.spirit.description}</p>
          <ul>{tooltip.spirit.effects.map((effect) => <li key={`${effect.tone}:${effect.text}`} data-tone={effect.tone}>{effect.text}</li>)}</ul>
        </aside>,
        document.body,
      ) : null}
    </>
  );
}

function RelationBlock({ label, source, target, relation }: {
  label: string;
  source: string;
  target: string;
  relation: DirectionalRelation;
}) {
  return (
    <div className="diplomacy-relation" data-tone={relation.score === null ? "unknown" : relation.score >= 0 ? "positive" : "negative"}>
      <span>{label}</span>
      <div className="diplomacy-relation__route">
        <b>{source}</b>
        <img src="/assets/ui/icons/diplomacy/direction-arrow.svg" alt="에서" draggable={false} />
        <b>{target}</b>
      </div>
      <strong>{relation.available ? signed(relation.score) : "자료 없음"}</strong>
      {relation.available ? (
        <details>
          <summary>관계 요인</summary>
          <dl>
            <div><dt>기본 관계</dt><dd>{signed(relation.baseScore)}</dd></div>
            {relation.modifiers.map((modifier) => (
              <div key={modifier.id}><dt>{modifier.title}</dt><dd>{signed(modifier.value)}</dd></div>
            ))}
          </dl>
        </details>
      ) : <small>이 방향의 외교 관계 데이터가 아직 등록되지 않았습니다.</small>}
    </div>
  );
}

function ProposalRow({ proposal, actorKey, busy, onAction }: {
  proposal: DiplomaticProposal;
  actorKey: string;
  busy: boolean;
  onAction: (proposal: DiplomaticProposal, action: "ACCEPT" | "REJECT" | "WITHDRAW") => void;
}) {
  const incoming = proposal.receiver_country_key === actorKey;
  return (
    <article className="diplomacy-proposal-row" data-status={proposal.status.toLowerCase()}>
      <div>
        <strong>{PROPOSAL_LABELS[proposal.proposal_type]}</strong>
        <span>{STATUS_LABELS[proposal.status]}</span>
      </div>
      <small>{proposal.sent_world_date} 발신 · {proposal.response_deadline_world_date} 응답 기한</small>
      <p>{proposal.review_route === "ADMIN" ? "관제국 검토 대기" : incoming ? "직접 응답 필요" : "상대국 응답 대기"}</p>
      {proposal.status === "PENDING" ? (
        <footer>
          {incoming && proposal.review_route === "PLAYER" ? (
            <>
              <button type="button" disabled={busy} onClick={() => onAction(proposal, "ACCEPT")}>수락</button>
              <button type="button" disabled={busy} onClick={() => onAction(proposal, "REJECT")}>거절</button>
            </>
          ) : null}
          {!incoming ? <button type="button" disabled={busy} onClick={() => onAction(proposal, "WITHDRAW")}>제안 철회</button> : null}
        </footer>
      ) : null}
    </article>
  );
}

function DiplomacyWorkspace({ playerCountry, targetCountry }: { playerCountry: MapCountryIndex; targetCountry: MapCountryIndex }) {
  const [overview, setOverview] = useState<DiplomacyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("actions");
  const [proposalType, setProposalType] = useState<ProposalType>("NON_AGGRESSION");
  const [duration, setDuration] = useState(365);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await loadDiplomacyOverview(playerCountry.key, targetCountry.key, signal);
      setOverview(data);
      setError(null);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      if (
        requestError instanceof DiplomacyApiError &&
        requestError.code === "DIPLOMACY_SERVER_NOT_CONFIGURED"
      ) {
        setOverview(
          emptyDiplomacyOverview(playerCountry.key, targetCountry.key),
        );
        setError(null);
      } else {
        setError(errorMessage(requestError));
        setOverview(null);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [playerCountry.key, targetCountry.key]);

  useEffect(() => {
    const controller = new AbortController();
    const initialReload = window.setTimeout(() => {
      void reload(controller.signal);
    }, 0);
    const refresh = () => void reload();
    window.addEventListener("tlr:diplomacy-updated", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialReload);
      window.removeEventListener("tlr:diplomacy-updated", refresh);
    };
  }, [reload]);

  const execute = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      announceDiplomacyUpdate();
      await reload();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const relationAction = (actionType: "IMPROVE_RELATIONS" | "WORSEN_RELATIONS") => {
    void execute(() => runRelationAction(playerCountry.key, targetCountry.key, actionType));
  };

  const sendProposal = () => {
    if (!overview) return;
    const startsWorldDate = addDays(overview.worldDate, 1);
    void execute(() => createProposal(playerCountry.key, {
      targetCountryKey: targetCountry.key,
      proposalType,
      startsWorldDate,
      endsWorldDate: duration > 0 ? addDays(startsWorldDate, duration) : null,
      deadlineWorldDate: addDays(overview.worldDate, 14),
      terms: { durationDays: duration || null },
    }));
  };

  const proposalAction = (proposal: DiplomaticProposal, action: "ACCEPT" | "REJECT" | "WITHDRAW") => {
    void execute(() => respondToProposal(playerCountry.key, proposal.id, action));
  };

  if (playerCountry.key === targetCountry.key) {
    return <div className="diplomacy-state diplomacy-state--empty"><UiIcon name="menu/diplomacy" /><strong>외교 대상 선택</strong><p>지도에서 자국이 아닌 국가를 선택하십시오.</p></div>;
  }
  if (loading && !overview) return <div className="diplomacy-state"><span className="diplomacy-signal" />외교 기록 수신 중</div>;

  return (
    <div className="diplomacy-workspace">
      {error ? <div className="diplomacy-error" role="alert">{error}<button type="button" onClick={() => void reload()}>다시 시도</button></div> : null}
      {overview ? (
        <>
          <section className="diplomacy-relations" aria-label="방향별 외교 관계">
            <RelationBlock label="우리의 인식" source={playerCountry.name} target={targetCountry.name} relation={overview.relations.outgoing} />
            <RelationBlock label="상대의 인식" source={targetCountry.name} target={playerCountry.name} relation={overview.relations.incoming} />
          </section>
          <nav className="diplomacy-tabs" aria-label="외교 기록 구분">
            {([
              ["actions", "외교 행동"], ["incoming", "수신 제안"], ["outgoing", "발신 제안"],
              ["agreements", "협정"], ["history", "기록"],
            ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
          </nav>
          <div className="diplomacy-tab-panel">
            {tab === "actions" ? (
              <div className="diplomacy-actions-live">
                <div className="diplomacy-action-pair">
                  <button type="button" disabled={busy || !overview.actions.IMPROVE_RELATIONS.available} onClick={() => relationAction("IMPROVE_RELATIONS")}>
                    <UiIcon name="diplomacy/relations" /><span><strong>관계 개선</strong><small>{overview.actions.IMPROVE_RELATIONS.reason ?? "우리의 대외 인식을 개선합니다."}</small></span>
                  </button>
                  <button type="button" disabled={busy || !overview.actions.WORSEN_RELATIONS.available} onClick={() => relationAction("WORSEN_RELATIONS")}>
                    <UiIcon name="diplomacy/relations" /><span><strong>관계 악화</strong><small>{overview.actions.WORSEN_RELATIONS.reason ?? "우리의 대외 인식을 악화시킵니다."}</small></span>
                  </button>
                </div>
                <div className="diplomacy-proposal-composer">
                  <div>
                    <label>제안 종류<select value={proposalType} onChange={(event) => setProposalType(event.target.value as ProposalType)}>{Object.entries(PROPOSAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>유효 기간<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={180}>180일</option><option value={365}>1년</option><option value={730}>2년</option><option value={0}>기한 없음</option></select></label>
                  </div>
                  <p>{overview.targetReviewRoute === "PLAYER" ? "상대 국가 운영자에게 직접 전달됩니다." : "운영자가 없는 국가이므로 관제국 검토 대기열로 전달됩니다."}</p>
                  <button type="button" disabled={busy || !overview.actions[proposalType]?.available} onClick={sendProposal}>외교 제안 발신</button>
                  {!overview.actions[proposalType]?.available ? <small>{overview.actions[proposalType]?.reason}</small> : null}
                </div>
              </div>
            ) : null}
            {tab === "incoming" ? overview.proposals.filter((row) => row.receiver_country_key === playerCountry.key).map((row) => <ProposalRow key={row.id} proposal={row} actorKey={playerCountry.key} busy={busy} onAction={proposalAction} />) : null}
            {tab === "outgoing" ? overview.proposals.filter((row) => row.proposer_country_key === playerCountry.key).map((row) => <ProposalRow key={row.id} proposal={row} actorKey={playerCountry.key} busy={busy} onAction={proposalAction} />) : null}
            {tab === "agreements" ? overview.agreements.map((row) => <article className="diplomacy-record" key={row.id}><strong>{row.agreement_type === "FACTION_MEMBERSHIP" ? "세력 회원국" : PROPOSAL_LABELS[row.agreement_type]}</strong><span>{row.status}</span><small>{row.starts_world_date} — {row.ends_world_date ?? "기한 없음"}</small></article>) : null}
            {tab === "history" ? overview.history.map((row) => <article className="diplomacy-record" key={row.id}><strong>{row.reason}</strong><span data-tone={row.change_amount >= 0 ? "positive" : "negative"}>{signed(row.change_amount)}</span><small>{row.world_date} · {row.previous_score} → {row.next_score}</small></article>) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ForeignCountryWindow({ playerCountry, targetCountry, onClose }: ForeignCountryWindowProps) {
  const presentation = getCountryPresentation(targetCountry);
  const primaryParty = presentation.politics.parties[0] ?? null;
  const partyName = primaryParty?.name || presentation.politics.rulingParty || "정당 미설정";
  const ideology = primaryParty?.ideology || presentation.politics.ideology || "사상 미설정";
  const panelStyle = useMemo(() => ({
    "--country-accent": targetCountry.color,
    "--primary-party-color": primaryParty ? getPartyDisplayColor(primaryParty, 0) : "#54615f",
  }) as CSSProperties, [primaryParty, targetCountry.color]);

  return (
    <PoliticsWindowShell
      ariaLabel={`${presentation.title} 외교`}
      style={panelStyle}
      flag={<CountryFlag country={targetCountry} flagPath={presentation.flagPath} className="politics-template__flag-underlay" />}
      portraitPath={presentation.leader.portraitPath}
      regions={{
        ideology: <>{presentation.politics.symbolPath ? <img src={presentation.politics.symbolPath} alt="" draggable={false} /> : null}<small>{presentation.politics.faction || "비동맹"}</small></>,
        identity: <><small>외교 대상국</small><h1>{presentation.title}</h1><p>{presentation.secondaryNames[0] || "외국어 표기 미설정"}</p><strong>{partyName}</strong></>,
        nationalSpirits: <ForeignNationalSpirits spirits={presentation.nationalSpirits} />,
        leaderCaption: <strong>{presentation.leader.name || "지도자 미설정"}</strong>,
        partySupport: <><div className="politics-template__party-heading">{presentation.politics.symbolPath ? <img src={presentation.politics.symbolPath} alt="" draggable={false} /> : null}<div><strong>{partyName}</strong><span>{ideology}</span></div></div><PartySupportChart parties={presentation.politics.parties} /></>,
        governmentSystem: <span>{presentation.politics.government || "정부 형태 미설정"}</span>,
        powerBase: <><span>{presentation.politics.faction || "비동맹"}</span><span>실시간 외교 기록 연결</span></>,
        lawScroll: <><header><div><strong>외교국 기록실</strong><span>관계·제안·협정·사건 기록</span></div><span className="diplomacy-template__target-label">대상: {presentation.title}</span></header><div className="politics-template__law-scroll"><DiplomacyWorkspace playerCountry={playerCountry} targetCountry={targetCountry} /></div></>,
      }}
      onClose={onClose}
    />
  );
}
