import { useState } from "react";
import { UiIcon } from "../../../components/UiIcon";
import type { MapCountryIndex } from "../../../types/mapCountry";
import {
  formatBillions,
  formatPercent,
  formatSigned,
  type PlaySimulationState,
} from "../../play/data/playSimulationState";
import {
  PlaceholderLineGraph,
  StrategicWindow,
} from "../../play/components/StrategicWindow";

type EconomyTab = "overview" | "society" | "trade";

type EconomyWindowProps = {
  country: MapCountryIndex;
  state: PlaySimulationState;
  onClose: () => void;
};

const ECONOMY_TABS: readonly { id: EconomyTab; label: string }[] = [
  { id: "overview", label: "경제 개요" },
  { id: "society", label: "사회" },
  { id: "trade", label: "무역" },
];

const RESOURCES = ["철강", "석유", "석탄", "식량", "희귀광물"] as const;

export function EconomyWindow({
  country,
  state,
  onClose,
}: EconomyWindowProps) {
  const [activeTab, setActiveTab] = useState<EconomyTab>("overview");
  const [automaticTrade, setAutomaticTrade] = useState(false);

  return (
    <StrategicWindow
      title="경제"
      eyebrow={country.name}
      onClose={onClose}
      actions={
        <div className="strategic-window__tabs" role="tablist">
          {ECONOMY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      {activeTab === "overview" ? (
        <EconomyOverview state={state} />
      ) : activeTab === "society" ? (
        <SocietyOverview state={state} />
      ) : (
        <TradeOverview
          automaticTrade={automaticTrade}
          onAutomaticTradeChange={setAutomaticTrade}
        />
      )}
    </StrategicWindow>
  );
}

function EconomyOverview({ state }: { state: PlaySimulationState }) {
  return (
    <>
      <div className="strategy-grid strategy-grid--economy">
        <MetricCard
          label="GDP"
          value={formatBillions(state.gdp)}
          detail={
            `명목 ${formatSigned(state.nominalGrowth)}% / 실질 ${formatSigned(state.realGrowth)}%`
          }
          values={state.graphs.gdp}
        />
        <MetricCard
          label="인플레이션"
          value={formatPercent(state.inflation)}
          detail="최근 경제 정산 기준"
          values={state.graphs.inflation}
        />
        <MetricCard
          label="국가부채"
          value={formatBillions(state.debt)}
          detail={`GDP 대비 ${formatPercent(state.debtToGdp)}`}
          values={state.graphs.debtRatio}
        />
        <MetricCard
          label="국채금리"
          value="0.00%"
          detail="신용등급 N/A"
          values={state.graphs.debtRatio}
        />
      </div>
      <div className="economy-ledger">
        <LedgerItem label="연간 수입" value="$00.00B" />
        <LedgerItem label="연간 지출" value="$00.00B" />
        <LedgerItem label="유동준비금" value="$00.00B" />
        <LedgerItem label="경제위기 신호" value="없음" />
      </div>
      <section className="strategy-section">
        <h3>예산</h3>
        <div className="budget-layout">
          <div className="budget-ring" aria-label="예산 사용률 0%">
            <span>00.00%</span>
          </div>
          <div className="budget-rows">
            {["행정", "국방", "산업", "복지", "교육"].map((item) => (
              <label key={item}>
                <span>{item}</span>
                <input type="range" min="0" max="100" value="0" readOnly />
                <b>00.00%</b>
              </label>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function SocietyOverview({ state }: { state: PlaySimulationState }) {
  return (
    <>
      <div className="society-summary">
        <LedgerItem label="총인구" value="0" />
        <LedgerItem label="노동가능인구" value="0" />
        <LedgerItem label="1인당 GDP" value="$0.00" />
        <LedgerItem label="실업률" value={formatPercent(state.unemploymentRate)} />
      </div>
      <div className="strategy-grid">
        <MetricCard
          label="빈곤율"
          value={formatPercent(state.povertyRate)}
          detail="최근 변화 +0.00%"
          values={state.graphs.poverty}
        />
        <MetricCard
          label="사회 변화"
          value="0.00"
          detail="입력된 사회 변화 없음"
          values={[0, 0, 0, 0, 0, 0]}
        />
      </div>
      <section className="strategy-section">
        <h3>최근 사회 변화</h3>
        <div className="empty-strategy-log">
          <span>기록 0 / 0</span>
          <p>국가별 수치가 지정되면 이 기록에 최근 사회 변화가 표시됩니다.</p>
        </div>
      </section>
    </>
  );
}

function TradeOverview({
  automaticTrade,
  onAutomaticTradeChange,
}: {
  automaticTrade: boolean;
  onAutomaticTradeChange: (value: boolean) => void;
}) {
  return (
    <>
      <section className="strategy-section">
        <header className="trade-heading">
          <h3>자원 현황</h3>
          <label>
            <input
              type="checkbox"
              checked={automaticTrade}
              onChange={(event) => onAutomaticTradeChange(event.target.checked)}
            />
            자동 무역 조정
          </label>
        </header>
        <div className="trade-table" role="table" aria-label="국가 자원 현황">
          <div role="row" className="trade-table__header">
            <span>자원</span><span>생산</span><span>수입</span><span>수출</span><span>소비</span><span>순잉여</span><span>비축</span>
          </div>
          {RESOURCES.map((resource) => (
            <div role="row" key={resource}>
              <strong>{resource}</strong>
              {Array.from({ length: 6 }, (_, index) => <span key={index}>0.00</span>)}
            </div>
          ))}
        </div>
      </section>
      <section className="strategy-section">
        <h3>교역 상대국</h3>
        <div className="trade-partners">
          <span>등록된 교역 상대국 없음</span>
          <b>교역 선호도 0.00</b>
          <small>엠바고 0건</small>
        </div>
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  values,
}: {
  label: string;
  value: string;
  detail: string;
  values: readonly number[];
}) {
  return (
    <article className="strategy-metric-card">
      <header>
        <UiIcon name={label === "GDP" ? "hud/gdp" : label.includes("인플") ? "economy/inflation" : label.includes("부채") ? "economy/debt" : "economy/credit"} />
        <span>{label}</span>
        <strong>{value}</strong>
      </header>
      <PlaceholderLineGraph values={values} />
      <small>{detail}</small>
    </article>
  );
}

function LedgerItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}
      <strong>{value}</strong>
    </span>
  );
}
