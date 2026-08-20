import { useEffect, useMemo, useState } from "react";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { executeDecision, isColonialDecisionOverview, loadDecisions } from "../decisionsClient";
import { DECISION_CATEGORY_LABELS, type DecisionCategoryId, type DecisionOverview, type DecisionPartyOption, type DecisionView } from "../data/commonDecisions";
import { getColonialDecisionCategory } from "../data/colonialDecisions";
import { isEulFullMember } from "../data/eulParliament";
import { ColonialDecisionPanel } from "./ColonialDecisionPanel";
import { EulParliamentPanel } from "./EulParliamentPanel";

type DecisionWindowProps = { country: MapCountryIndex; onClose: () => void };
const CATEGORIES: DecisionCategoryId[] = ["political", "economy", "wartime"];

function targetOptions(decision: DecisionView, parties: DecisionPartyOption[]): DecisionPartyOption[] {
  return decision.targetSelector === "nonRulingParty" ? parties.filter((party) => !party.ruling) : parties;
}

function DecisionTooltip({ decision, unmet }: { decision: DecisionView; unmet: string[] }) {
  return <div className="decision-tooltip" role="tooltip"><strong>{decision.title}</strong><p>{decision.description}</p><dl><dt>비용</dt><dd>정치력 {decision.politicalPowerCost}</dd><dt>조건</dt><dd>{decision.conditions.map((value) => <span key={value}>{value}</span>)}</dd><dt>효과</dt><dd>{decision.effects.map((value) => <span key={value}>{value}</span>)}</dd>{decision.durationTurns ? <><dt>기간</dt><dd>{decision.durationTurns}턴</dd></> : null}<dt>재사용 대기</dt><dd>{decision.cooldownTurns}턴</dd></dl>{unmet.length ? <div className="decision-tooltip__blocked">{unmet.map((value) => <span key={value}>✕ {value}</span>)}</div> : <div className="decision-tooltip__ready">실행 가능</div>}</div>;
}

export function DecisionWindow(props: DecisionWindowProps) {
  if (isEulFullMember(props.country)) {
    return (
      <StrategicWindow title="유럽인민연방 연방의회" eyebrow={props.country.name} onClose={props.onClose} className="strategic-window--decisions strategic-window--eul">
        <EulParliamentPanel country={props.country} />
      </StrategicWindow>
    );
  }

  if (getColonialDecisionCategory(props.country.key)) {
    return (
      <StrategicWindow title="사건과 결정" eyebrow={props.country.name} onClose={props.onClose} className="strategic-window--decisions strategic-window--colonial-decisions">
        <ColonialDecisionPanel country={props.country} />
      </StrategicWindow>
    );
  }

  return <GenericDecisionWindow {...props} />;
}

function GenericDecisionWindow({ country, onClose }: DecisionWindowProps) {
  const [overview, setOverview] = useState<DecisionOverview | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Record<DecisionCategoryId, boolean>>({ political: false, economy: false, wartime: false });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function refreshDecisions() {
      setLoading(true);
      setError(null);
      try {
        const value = await loadDecisions(country.key, controller.signal);
        if (isColonialDecisionOverview(value)) throw new Error("INVALID_GENERIC_DECISION_RESPONSE");
        setOverview(value);
      } catch {
        if (!controller.signal.aborted) setError("결정 데이터를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void refreshDecisions();
    return () => controller.abort();
  }, [country.key]);
  const grouped = useMemo(() => CATEGORIES.map((category) => ({ category, decisions: overview?.decisions.filter((decision) => decision.category === category && decision.visible) ?? [] })), [overview]);
  const run = async (decision: DecisionView) => { setRunning(decision.id); setError(null); try { const value = await executeDecision(country.key, decision.id, targets[decision.id] || undefined); if (isColonialDecisionOverview(value)) throw new Error("INVALID_GENERIC_DECISION_RESPONSE"); setOverview(value); } catch { setError("조건을 만족하지 않아 결정을 실행할 수 없습니다."); } finally { setRunning(null); } };

  return (
    <StrategicWindow title="결정" eyebrow={country.name} onClose={onClose} className="strategic-window--decisions">
      <div className="decision-game-shell">
      <div className="decision-ledger__status"><span>정치력</span><strong>{overview?.politicalPower == null ? "미설정" : overview.politicalPower.toFixed(0)}</strong><span>세계 날짜</span><strong>{overview?.worldDate ?? "—"}</strong></div>
      {overview ? <section className="decision-game-hero decision-game-hero--general"><div className="decision-game-hero__emblem"><img src={overview.decisions[0]?.icon} alt="" /></div><div className="decision-game-hero__copy"><span>국가 결정 기록</span><h3>{country.name}</h3><p>국가의 정치·경제·전시 정책을 결정하고 현재 가능한 행동을 검토합니다.</p></div></section> : null}
      {loading ? <p className="decision-ledger__message">결정 목록 수신 중…</p> : null}{error ? <p className="decision-ledger__error">{error}</p> : null}
      {!loading && overview ? grouped.map(({ category, decisions }) => decisions.length ? <section className="decision-category" key={category}>
        <button className="decision-category__header" type="button" onClick={() => setCollapsed((value) => ({ ...value, [category]: !value[category] }))}><img src={decisions[0].icon} alt="" /><strong>{DECISION_CATEGORY_LABELS[category]}</strong><span>{collapsed[category] ? "＋" : "－"}</span></button>
        {!collapsed[category] ? <div className="decision-category__rows">{decisions.map((decision) => {
          const options = targetOptions(decision, overview.parties); const selected = options.find((party) => party.id === targets[decision.id]);
          const targetUnmet = decision.targetSelector && !selected ? ["대상 정당을 선택해야 함"] : decision.id === "ideology_repression" && selected && selected.support < 5 ? ["대상 정당 지지도 5% 이상 필요"] : [];
          const unmet = [...decision.unmetConditions.filter((value) => !value.includes("정당을 선택")), ...targetUnmet]; const available = unmet.length === 0;
          return <article className="decision-row" key={decision.id} data-available={available}><img className="decision-row__icon" src={decision.icon} alt="" /><div className="decision-row__copy"><strong>{decision.title}</strong>{decision.targetSelector ? <select value={targets[decision.id] ?? ""} onChange={(event) => setTargets((value) => ({ ...value, [decision.id]: event.target.value }))} aria-label={`${decision.title} 대상`}><option value="">대상 정당 선택</option>{options.map((party) => <option key={party.id} value={party.id}>{party.name} · {party.subIdeology} · {party.support.toFixed(1)}%</option>)}</select> : <small>{decision.description}</small>}</div><span className="decision-row__cost">정치력 {decision.politicalPowerCost}</span><button className="decision-row__execute" type="button" disabled={!available || running === decision.id} onClick={() => void run(decision)}>{running === decision.id ? "처리 중" : available ? "실행" : "잠김"}</button><span className="decision-row__details" tabIndex={0} aria-label={`${decision.title} 상세 정보`}><img src="/assets/ui/generated-icons/research/request.png" alt="" /><DecisionTooltip decision={decision} unmet={unmet} /></span></article>;
        })}</div> : null}
      </section> : null) : null}
      </div>
    </StrategicWindow>
  );
}
