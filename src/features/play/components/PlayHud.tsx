import { CountryFlag } from "../../../components/CountryFlag";
import { UiIcon } from "../../../components/UiIcon";
import { getCountryPresentation } from "../../../data/countryPresentation";
import type { MapCountryIndex } from "../../../types/mapCountry";
import {
  formatBillions,
  formatInteger,
  formatPercent,
  formatSigned,
  type PlaySimulationState,
} from "../data/playSimulationState";
import type { PrimaryWindow } from "../types";

type PlayHudProps = {
  country: MapCountryIndex;
  state: PlaySimulationState;
  activeWindow: PrimaryWindow;
  onOpenWindow: (window: PrimaryWindow) => void;
  onExitPlayMode: () => void;
};

type HudTone = "positive" | "negative" | "neutral" | "warning";

type HudDetailLine = {
  label: string;
  value: string;
  tone?: HudTone;
};

type HudMetricProps = {
  id: string;
  icon: string;
  label: string;
  value: string;
  tone?: HudTone;
  align?: "start" | "end";
  intro: string;
  lines: readonly HudDetailLine[];
  footer: string;
};

const WINDOW_BUTTONS: readonly {
  id: Exclude<PrimaryWindow, null>;
  label: string;
  icon: string;
}[] = [
  { id: "politics", label: "정치", icon: "menu/politics" },
  { id: "economy", label: "경제", icon: "menu/economy" },
  { id: "decisions", label: "디시전", icon: "menu/decisions" },
  { id: "diplomacy", label: "외교", icon: "menu/diplomacy" },
  { id: "intelligence", label: "첩보", icon: "menu/intelligence" },
];

function signedTone(value: number | null): HudTone {
  if (value == null) return "neutral";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function PlayHud({
  country,
  state,
  activeWindow,
  onOpenWindow,
  onExitPlayMode,
}: PlayHudProps) {
  const presentation = getCountryPresentation(country);
  const unusedProduction =
    state.productionCapacity.total != null && state.productionCapacity.used != null
      ? Math.max(
          state.productionCapacity.total - state.productionCapacity.used,
          0,
        )
      : null;
  const productionSummary =
    state.productionCapacity.used != null && state.productionCapacity.total != null
      ? `${state.productionCapacity.used}/${state.productionCapacity.total}`
      : "미설정";

  return (
    <header className="play-hud" aria-label="플레이 모드 HUD">
      <button
        type="button"
        className="play-hud__flag"
        onClick={() => onOpenWindow("politics")}
        aria-label={`${presentation.title} 정치창 열기`}
      >
        <CountryFlag country={country} flagPath={presentation.flagPath} />
        <span>{presentation.title}</span>
      </button>

      <div className="play-hud__stats" aria-label="국가 주요 수치">
        <HudMetric
          id="political-power"
          icon="hud/political-power"
          label="정치력"
          value={state.politicalPower.toFixed(2)}
          intro="정부가 법률·인사·국가과제와 외교 행동에 사용할 수 있는 정치 자원입니다."
          lines={[
            {
              label: "현재 정치력",
              value: state.politicalPower.toFixed(2),
            },
            {
              label: "이번 정산 변화",
              value: formatSigned(state.politicalPowerChange),
              tone: signedTone(state.politicalPowerChange),
            },
            { label: "법률 효과", value: "+0.00", tone: "neutral" },
            { label: "국가과제 효과", value: "+0.00", tone: "neutral" },
          ]}
          footer="정치력은 법률 변경, 디시전, 외교 행동의 비용으로 사용됩니다."
        />
        <HudMetric
          id="stability"
          icon="hud/stability"
          label="안정도"
          value={formatPercent(state.stability)}
          intro="현 정부와 국가 질서에 대한 사회의 지지 수준입니다."
          lines={[
            { label: "현재 안정도", value: formatPercent(state.stability) },
            { label: "기본 수치", value: "0.00%", tone: "neutral" },
            { label: "정당·법률 효과", value: "+0.00%", tone: "neutral" },
            { label: "최근 사회 변화", value: "+0.00%", tone: "neutral" },
          ]}
          footer="안정도는 정치력 획득과 행정·생산 효율에 영향을 줍니다."
        />
        <HudMetric
          id="war-support"
          icon="hud/war-support"
          label="전쟁 지지도"
          value={formatPercent(state.warSupport)}
          tone="warning"
          intro="국민이 장기적인 군사 동원과 전쟁 수행을 감수할 의지입니다."
          lines={[
            {
              label: "현재 전쟁 지지도",
              value: formatPercent(state.warSupport),
            },
            { label: "기본 수치", value: "0.00%", tone: "neutral" },
            { label: "법률 효과", value: "+0.00%", tone: "neutral" },
            { label: "전쟁 상태 효과", value: "+0.00%", tone: "neutral" },
          ]}
          footer="전쟁 지지도는 동원, 전시법과 장기전 대응에 영향을 줍니다."
        />
        <HudMetric
          id="manpower"
          icon="hud/manpower"
          label="동원가능인력"
          value={formatInteger(state.manpower)}
          intro="현재 추가로 동원하거나 국가사업에 투입할 수 있는 인력입니다."
          lines={[
            { label: "가용 인력", value: formatInteger(state.manpower) },
            { label: "사용 중인 인력", value: "0", tone: "neutral" },
            { label: "육군·해군·공군", value: "0 / 0 / 0" },
            { label: "월간 증가", value: "+0", tone: "neutral" },
          ]}
          footer="징병제와 인구 구조가 동원 가능한 전체 인력을 결정합니다."
        />
        <HudMetric
          id="production"
          icon="hud/production"
          label="생산능력"
          value={productionSummary}
          intro="민간·군수·소비재 생산에 배분할 수 있는 국가 산업 역량입니다."
          lines={[
            {
              label: "사용 중",
              value: state.productionCapacity.used?.toString() ?? "미설정",
            },
            {
              label: "전체 생산능력",
              value: state.productionCapacity.total?.toString() ?? "미설정",
            },
            { label: "미배치", value: unusedProduction?.toString() ?? "미설정" },
            { label: "무역 제공", value: "0", tone: "neutral" },
          ]}
          footer="생산능력은 산업시설과 경제법, 무역 상태의 영향을 받습니다."
        />
        <HudMetric
          id="gdp"
          icon="hud/gdp"
          label="GDP"
          value={formatBillions(state.gdp)}
          align="end"
          intro="국내에서 생산된 상품과 서비스의 연간 총가치입니다."
          lines={[
            { label: "현재 GDP", value: formatBillions(state.gdp) },
            {
              label: "명목 성장률",
              value: `${formatSigned(state.nominalGrowth)}%`,
              tone: signedTone(state.nominalGrowth),
            },
            {
              label: "실질 성장률",
              value: `${formatSigned(state.realGrowth)}%`,
              tone: signedTone(state.realGrowth),
            },
            {
              label: "인플레이션",
              value: formatPercent(state.inflation),
            },
          ]}
          footer="GDP는 경제 규모와 국가의 민간 소비·재정 기반을 나타냅니다."
        />
        <HudMetric
          id="national-debt"
          icon="hud/national-debt"
          label="국가부채"
          value={formatBillions(state.debt)}
          align="end"
          intro="정부가 상환해야 할 누적 채무와 그 부담을 표시합니다."
          lines={[
            { label: "현재 국가부채", value: formatBillions(state.debt) },
            {
              label: "GDP 대비 부채",
              value: formatPercent(state.debtToGdp),
            },
            { label: "국채금리", value: "0.00%", tone: "neutral" },
            { label: "신용등급", value: "N/A" },
          ]}
          footer="부채가 증가하면 국채 이자와 재정정책의 부담이 커집니다."
        />
      </div>

      <nav className="play-hud__nav" aria-label="인게임 창">
        {WINDOW_BUTTONS.map((button) => (
          <button
            key={button.id}
            type="button"
            aria-label={`${button.label}창 열기`}
            aria-pressed={activeWindow === button.id}
            onClick={() => onOpenWindow(button.id)}
          >
            <UiIcon name={button.icon} />
            <small>{button.label}</small>
          </button>
        ))}
        <span className="play-hud__divider" aria-hidden="true" />
        <button
          type="button"
          className="play-hud__exit"
          onClick={onExitPlayMode}
        >
          <UiIcon name="menu/exit" />
          <small>국가선택</small>
        </button>
      </nav>
    </header>
  );
}

function HudMetric({
  id,
  icon,
  label,
  value,
  tone = "neutral",
  align = "start",
  intro,
  lines,
  footer,
}: HudMetricProps) {
  const tooltipId = `hud-tooltip-${id}`;

  return (
    <div
      className="play-hud__metric"
      data-tone={tone}
      data-tooltip-align={align}
    >
      <UiIcon name={icon} />
      <b>{value}</b>
      <small>{label}</small>
      <div id={tooltipId} className="play-hud__tooltip" role="tooltip">
        <strong>{label}</strong>
        <p>{intro}</p>
        <dl>
          {lines.map((line) => (
            <div key={line.label}>
              <dt>{line.label}</dt>
              <dd data-tone={line.tone ?? "neutral"}>{line.value}</dd>
            </div>
          ))}
        </dl>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
