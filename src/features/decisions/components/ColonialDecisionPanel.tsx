import { useEffect, useMemo, useState } from "react";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { executeDecision, loadDecisions } from "../decisionsClient";
import {
  COLONIAL_EFFECT_LABELS,
  COLONIAL_STAGE_LABELS,
  formatColonialEffect,
  type ColonialDecisionOverview,
  type ColonialDecisionView,
  type ColonialEffect,
} from "../data/colonialDecisions";

type ColonialDecisionPanelProps = { country: MapCountryIndex };

function isColonialOverview(value: unknown): value is ColonialDecisionOverview {
  return Boolean(value && typeof value === "object" && "mode" in value && value.mode === "colonial");
}

function effectTone(effect: ColonialEffect): "good" | "bad" | "neutral" {
  if (effect.value === 0) return "neutral";
  if (effect.key === "poverty_rate") return effect.value < 0 ? "good" : "bad";
  return effect.value > 0 ? "good" : "bad";
}

function DecisionTooltip({ decision }: { decision: ColonialDecisionView }) {
  const effects = [...(decision.immediateEffects ?? []), ...(decision.temporaryEffects ?? [])];
  return (
    <div className="decision-game-tooltip" role="tooltip">
      <strong>{decision.title}</strong>
      <p>{decision.description}</p>
      <dl>
        <dt>비용</dt><dd>정치력 {decision.politicalPowerCost}</dd>
        {decision.conditions?.length ? <><dt>조건</dt><dd>{decision.conditions.map((condition) => <span key={condition.label}>{condition.label}</span>)}</dd></> : null}
        {effects.length ? <><dt>효과</dt><dd>{effects.map((effect, index) => <span className={`decision-effect--${effectTone(effect)}`} key={`${effect.key}-${index}`}>{formatColonialEffect(effect)}</span>)}</dd></> : null}
        {decision.durationTurns ? <><dt>기간</dt><dd>{decision.durationTurns}턴</dd></> : null}
        <dt>재사용</dt><dd>{decision.cooldownTurns ? `${decision.cooldownTurns}턴` : "즉시"}</dd>
      </dl>
      {decision.unmetConditions.length ? <div className="decision-tooltip__blocked">{decision.unmetConditions.map((condition) => <span key={condition}>× {condition}</span>)}</div> : <div className="decision-tooltip__ready">실행 가능</div>}
    </div>
  );
}

export function ColonialDecisionPanel({ country }: ColonialDecisionPanelProps) {
  const [overview, setOverview] = useState<ColonialDecisionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadDecisions(country.key, controller.signal)
      .then((value) => {
        if (!isColonialOverview(value)) throw new Error("INVALID_COLONIAL_DECISION_RESPONSE");
        setOverview(value);
      })
      .catch(() => { if (!controller.signal.aborted) setError("결정 데이터를 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [country.key]);

  const variant = country.key === "country-051" ? "large" : country.key === "country-058" ? "political" : "general";
  const policyByDecision = useMemo(() => new Map((overview?.category.policies ?? []).flatMap((policy) => [[policy.increaseDecisionId, policy], [policy.decreaseDecisionId, policy]])), [overview]);

  const run = async (decision: ColonialDecisionView) => {
    setRunning(decision.id);
    setError(null);
    try {
      const value = await executeDecision(country.key, decision.id);
      if (!isColonialOverview(value)) throw new Error("INVALID_COLONIAL_DECISION_RESPONSE");
      setOverview(value);
    } catch {
      setError("조건을 만족하지 않아 결정을 실행할 수 없습니다.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="decision-game-shell decision-game-shell--colonial">
      <div className="decision-game-status">
        <span>정치력</span><strong>{overview?.politicalPower == null ? "미설정" : overview.politicalPower.toFixed(0)}</strong>
        <span>세계 날짜</span><strong>{overview?.worldDate ?? "—"}</strong>
      </div>
      {loading ? <p className="decision-ledger__message">관제 기록 수신 중…</p> : null}
      {error ? <p className="decision-ledger__error">{error}</p> : null}
      {overview ? <>
        <section className={`decision-game-hero decision-game-hero--${variant}`}>
          {overview.category.headerImage ? <img className="decision-game-hero__image" src={overview.category.headerImage} alt="" /> : <div className="decision-game-hero__emblem"><img src={overview.decisions[0]?.icon} alt="" /></div>}
          <div className="decision-game-hero__copy">
            <span>국가 고유 결정</span>
            <h3>{overview.category.title}</h3>
            <p>{overview.category.description}</p>
            <div className="decision-game-hero__effects">{overview.category.baseEffects.map((effect, index) => <b className={`decision-effect--${effectTone(effect)}`} key={`${effect.key}-${index}`}>{formatColonialEffect(effect)}</b>)}</div>
          </div>
        </section>

        {overview.category.policies?.length ? <section className="decision-policy-board">
          <header><span>통치 정책 단계</span><small>단계 변경은 즉시 적용됩니다</small></header>
          <div>{overview.category.policies.map((policy) => {
            const level = overview.state.policyLevels[policy.id] ?? policy.initialLevel;
            return <article key={policy.id}><strong>{policy.title}</strong><div className="decision-policy-board__stages" aria-label={`${policy.title} ${COLONIAL_STAGE_LABELS[level] ?? level}`}><span>{COLONIAL_STAGE_LABELS[level] ?? level}</span>{Array.from({ length: policy.maximumLevel + 1 }, (_, index) => <i data-active={index <= level} key={index} />)}</div></article>;
          })}</div>
        </section> : null}

        <section className="decision-game-category">
          <button className="decision-game-category__header" type="button" onClick={() => setCollapsed((value) => !value)}>
            <span className="decision-game-category__medallion"><img src={overview.decisions[0]?.icon} alt="" /></span>
            <strong>{overview.category.title}</strong>
            <span className="decision-game-category__lamp" data-active={!collapsed} />
            <span className="decision-game-category__toggle">{collapsed ? "+" : "−"}</span>
          </button>
          {!collapsed ? <div className="decision-game-rows">{overview.decisions.map((decision) => {
            const policy = policyByDecision.get(decision.id);
            const level = policy ? overview.state.policyLevels[policy.id] ?? policy.initialLevel : null;
            const available = decision.available && running !== decision.id;
            return <article className="decision-game-row" data-available={available} key={decision.id} tabIndex={0}>
              <img className="decision-game-row__icon" src={decision.icon} alt="" />
              <div className="decision-game-row__copy"><strong>{decision.title}</strong>{policy && level != null ? <small>{policy.title} · {COLONIAL_STAGE_LABELS[level] ?? level}</small> : <small>{decision.description}</small>}</div>
              <span className="decision-game-row__cost">◆ {decision.politicalPowerCost}</span>
              <span className="decision-game-row__lamp" data-active={available} />
              <button className="decision-game-row__execute" type="button" disabled={!available} aria-label={`${decision.title} 실행`} onClick={() => void run(decision)}><span>{running === decision.id ? "…" : ""}</span></button>
              <DecisionTooltip decision={decision} />
            </article>;
          })}</div> : null}
        </section>
        {overview.activeModifiers.length ? <section className="decision-active-modifiers"><header>현재 적용 중</header>{overview.activeModifiers.map((modifier) => <div key={`${modifier.decisionId}-${modifier.label}`}><span>{COLONIAL_EFFECT_LABELS[modifier.label as keyof typeof COLONIAL_EFFECT_LABELS] ?? modifier.label}</span><b>{modifier.value > 0 ? "+" : ""}{modifier.value}{modifier.unit === "percentage_point" ? "%p" : "%"}</b><small>{modifier.turnsRemaining}턴</small></div>)}</section> : null}
      </> : null}
    </div>
  );
}
