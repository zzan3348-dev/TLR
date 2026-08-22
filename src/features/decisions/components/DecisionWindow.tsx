import { useEffect, useMemo, useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { executeDecision, isColonialDecisionOverview, loadDecisions } from "../decisionsClient";
import {
  DECISION_CATEGORY_LABELS,
  type DecisionCategoryId,
  type DecisionOverview,
  type DecisionPartyOption,
  type DecisionView,
} from "../data/commonDecisions";
import { getColonialDecisionCategory } from "../data/colonialDecisions";
import { ColonialDecisionPanel } from "./ColonialDecisionPanel";

type DecisionWindowProps = { country: MapCountryIndex; onClose: () => void };
type HoveredDecision = { decision: DecisionView; unmet: string[]; x: number; y: number };

const CATEGORIES: DecisionCategoryId[] = ["political", "economy", "wartime"];
const TOOLTIP_WIDTH = 382;
const TOOLTIP_MARGIN = 14;

const STATUS_LABEL: Record<DecisionView["status"], string> = {
  ready: "실행 가능",
  running: "실행 중",
  locked: "조건 잠김",
  insufficient: "정치력 부족",
  cooldown: "재사용 대기",
  completed: "완료",
};

function targetOptions(decision: DecisionView, parties: DecisionPartyOption[]): DecisionPartyOption[] {
  return decision.targetSelector === "nonRulingParty" ? parties.filter((party) => !party.ruling) : parties;
}

function tooltipPosition(rect: DOMRect) {
  const estimatedHeight = 430;
  const fitsRight = rect.right + TOOLTIP_MARGIN + TOOLTIP_WIDTH <= window.innerWidth;
  const x = fitsRight
    ? rect.right + TOOLTIP_MARGIN
    : Math.max(TOOLTIP_MARGIN, rect.left - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
  const y = Math.min(
    Math.max(TOOLTIP_MARGIN, rect.top - 8),
    Math.max(TOOLTIP_MARGIN, window.innerHeight - estimatedHeight - TOOLTIP_MARGIN),
  );
  return { x, y };
}

function DecisionTooltip({ hovered }: { hovered: HoveredDecision }) {
  const { decision, unmet } = hovered;
  const executionFailures = unmet.filter((value) =>
    value.includes("정치력") || value.includes("재사용") || value.includes("실행 중"),
  );
  const conditionFailures = unmet.filter((value) => !executionFailures.includes(value));

  return createPortal(
    <aside
      className="generic-decision-tooltip"
      role="tooltip"
      style={{ left: hovered.x, top: hovered.y }}
    >
      <header>
        <strong>{decision.title}</strong>
        <span data-status={decision.status}>{STATUS_LABEL[decision.status]}</span>
      </header>
      <p>{decision.description}</p>
      <section>
        <h4>비용</h4>
        <div className="generic-decision-tooltip__cost">사용되는 정치력 <b>{decision.politicalPowerCost}</b></div>
      </section>
      <section>
        <h4>요구 조건</h4>
        {decision.conditions.map((condition) => (
          <div className="generic-decision-tooltip__condition" data-state={conditionFailures.length ? "pending" : "met"} key={condition}>
            <i aria-hidden="true" />{condition}
          </div>
        ))}
        {conditionFailures.map((condition) => (
          <div className="generic-decision-tooltip__condition" data-state="unmet" key={condition}>
            <i aria-hidden="true" />{condition}
          </div>
        ))}
      </section>
      <section>
        <h4>효과</h4>
        {decision.effects.map((effect) => <div className="generic-decision-tooltip__effect" key={effect}>{effect}</div>)}
      </section>
      <dl>
        {decision.durationTurns ? <><dt>소요 기간</dt><dd>{decision.durationTurns}턴</dd></> : null}
        <dt>재사용 대기</dt><dd>{decision.cooldownTurns}턴</dd>
        {decision.progress ? <><dt>진행 상황</dt><dd>{decision.progress.elapsedTurns}/{decision.progress.totalTurns}턴 · {decision.progress.turnsRemaining}턴 남음</dd></> : null}
      </dl>
      {executionFailures.map((failure) => <div className="generic-decision-tooltip__warning" key={failure}>{failure}</div>)}
    </aside>,
    document.body,
  );
}

export function DecisionWindow(props: DecisionWindowProps) {
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
  const [hovered, setHovered] = useState<HoveredDecision | null>(null);
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

  const grouped = useMemo(
    () => CATEGORIES.map((category) => ({
      category,
        decisions: overview?.decisions?.filter((decision) => decision.category === category && decision.visible) ?? [],
    })),
    [overview],
  );

  const run = async (decision: DecisionView) => {
    setRunning(decision.id);
    setHovered(null);
    setError(null);
    try {
      const value = await executeDecision(country.key, decision.id, targets[decision.id] || undefined);
      if (isColonialDecisionOverview(value)) throw new Error("INVALID_GENERIC_DECISION_RESPONSE");
      setOverview(value);
    } catch {
      setError("조건을 만족하지 않아 결정을 실행할 수 없습니다.");
    } finally {
      setRunning(null);
    }
  };

  const showTooltip = (decision: DecisionView, unmet: string[], rect: DOMRect) => {
    setHovered({ decision, unmet, ...tooltipPosition(rect) });
  };

  return (
    <StrategicWindow title="사건과 결정" eyebrow={country.name} onClose={onClose} className="strategic-window--decisions strategic-window--generic-decisions">
      <div className="generic-decision-shell">
        <div className="generic-decision-status">
          <span>정치력</span><strong>{overview?.politicalPower == null ? "미설정" : overview.politicalPower.toFixed(0)}</strong>
          <span>세계 날짜</span><strong>{overview?.worldDate ?? "—"}</strong>
        </div>
        {loading ? <p className="decision-ledger__message">결정 목록 수신 중…</p> : null}
        {error ? <p className="decision-ledger__error">{error}</p> : null}
        {!loading && overview ? grouped.map(({ category, decisions }) => decisions.length ? (
          <section className="generic-decision-category" key={category}>
            <button
              className="generic-decision-category__header"
              type="button"
              aria-expanded={!collapsed[category]}
              onClick={() => setCollapsed((value) => ({ ...value, [category]: !value[category] }))}
            >
              <img src={decisions[0].icon} alt="" />
              <strong>{DECISION_CATEGORY_LABELS[category]}</strong>
              <span className="generic-decision-category__toggle" data-collapsed={collapsed[category]} aria-hidden="true" />
            </button>
            {!collapsed[category] ? <div className="generic-decision-category__rows">{decisions.map((decision) => {
              const options = targetOptions(decision, overview.parties);
              const selected = options.find((party) => party.id === targets[decision.id]);
              const targetUnmet = decision.targetSelector && !selected
                ? ["대상 정당을 선택해야 함"]
                : decision.id === "ideology_repression" && selected && selected.support < 5
                  ? ["대상 정당 지지도 5% 이상 필요"]
                  : [];
              const unmet = [...decision.unmetConditions.filter((value) => !value.includes("정당을 선택")), ...targetUnmet];
              let status = decision.status;
              if (targetUnmet.length) status = "locked";
              else if (status === "locked" && unmet.length === 0) status = "ready";
              const available = status === "ready" && unmet.length === 0;
              const tooltipDecision = status === decision.status ? decision : { ...decision, status };
              const onMouseEnter = (event: MouseEvent<HTMLElement>) => showTooltip(tooltipDecision, unmet, event.currentTarget.getBoundingClientRect());
              const onFocus = (event: FocusEvent<HTMLElement>) => showTooltip(tooltipDecision, unmet, event.currentTarget.getBoundingClientRect());

              return (
                <article
                  className="generic-decision-row"
                  key={decision.id}
                  data-status={status}
                  tabIndex={0}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={onFocus}
                  onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(null); }}
                >
                  <div className="generic-decision-row__icon"><img src={decision.icon} alt="" /></div>
                  <div className="generic-decision-row__main">
                    <strong>{decision.title}</strong>
                    {decision.targetSelector ? (
                      <select
                        value={targets[decision.id] ?? ""}
                        onChange={(event) => setTargets((value) => ({ ...value, [decision.id]: event.target.value }))}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${decision.title} 대상`}
                      >
                        <option value="">대상 정당 선택</option>
                        {options.map((party) => <option key={party.id} value={party.id}>{party.name} · {party.subIdeology} · {party.support.toFixed(1)}%</option>)}
                      </select>
                    ) : null}
                  </div>
                  <span className="generic-decision-row__state">{running === decision.id ? "처리 중" : STATUS_LABEL[status]}</span>
                  <span className="generic-decision-row__cost"><i aria-hidden="true" />{decision.politicalPowerCost}</span>
                  <button
                    className="generic-decision-row__execute"
                    type="button"
                    disabled={!available || running === decision.id}
                    onClick={(event) => { event.stopPropagation(); void run(decision); }}
                    aria-label={`${decision.title} 실행`}
                  />
                  {decision.progress ? <div className="generic-decision-row__progress" aria-label={`진행률 ${Math.round(decision.progress.fraction * 100)}%`}><span style={{ width: `${Math.max(0, Math.min(100, decision.progress.fraction * 100))}%` }} /></div> : null}
                </article>
              );
            })}</div> : null}
          </section>
        ) : null) : null}
        {overview?.activeModifiers.length ? (
          <section className="generic-decision-modifiers">
            <header>진행 중인 국가 결정 효과</header>
            {overview.activeModifiers.map((modifier) => (
              <div key={`${modifier.decisionId}-${modifier.label}`}><strong>{modifier.label}</strong><span>{modifier.turnsRemaining}턴 남음</span></div>
            ))}
          </section>
        ) : null}
      </div>
      {hovered ? <DecisionTooltip hovered={hovered} /> : null}
    </StrategicWindow>
  );
}
