import { UiIcon } from "../../../components/UiIcon";
import type { CountryDevelopmentState } from "../types/development";
import { resolveDevelopmentRows } from "../utils/developmentState";

type DevelopmentSectionProps = {
  state: CountryDevelopmentState;
};

const TREND_LABELS = {
  up: { icon: "ui/trend-up", label: "상승" },
  stable: { icon: "ui/trend-flat", label: "유지" },
  down: { icon: "ui/trend-down", label: "하락" },
} as const;

const DEVELOPMENT_ICON_BY_ID: Record<string, string> = {
  "academic-foundation": "development/academic-foundation",
  "research-facilities": "development/research-facilities",
  agriculture: "development/agriculture",
  health: "development/health",
  administration: "development/administration",
  "industry-specialization": "development/industry",
  "industrial-equipment": "development/equipment",
  "military-professionalism": "development/military",
};

export function DevelopmentSection({
  state,
}: DevelopmentSectionProps) {
  const rows = resolveDevelopmentRows(state);

  return (
    <section className="development-section">
      <header>
        <UiIcon name="sections/development" />
        <h2>사회 발전</h2>
      </header>
      <div className="development-section__poverty">
        <span>
          빈곤율
          <strong>
            {state.povertyRate === null
              ? "미설정"
              : `${state.povertyRate.toFixed(2)}%`}
          </strong>
        </span>
        <span>
          빈곤율 변화
          <strong
            data-direction={
              state.povertyChange === null
                ? "none"
                : state.povertyChange <= 0
                  ? "positive"
                  : "negative"
            }
          >
            {state.povertyChange === null
              ? "미설정"
              : `${state.povertyChange > 0 ? "+" : ""}${state.povertyChange.toFixed(2)}%`}
          </strong>
        </span>
      </div>
      <div className="development-section__rows">
        {rows.map(({ definition, item, level }) => {
          const trend = item ? TREND_LABELS[item.trend] : null;
          const tooltipId = `development-${state.countryId}-${definition.id}`;
          return (
            <div
              key={definition.id}
              className="development-row"
              tabIndex={0}
              aria-describedby={tooltipId}
            >
              <span className="development-row__icon" aria-hidden="true">
                <UiIcon
                  name={
                    DEVELOPMENT_ICON_BY_ID[definition.id] ??
                    "sections/development"
                  }
                />
              </span>
              <strong>{definition.label}</strong>
              <b data-unset={!level}>{level?.name ?? "미설정"}</b>
              <span
                className="development-row__trend"
                data-trend={item?.trend ?? "unset"}
                aria-label={trend ? `추세: ${trend.label}` : "추세: 미설정"}
              >
                {trend ? <UiIcon name={trend.icon} /> : <span>—</span>}
              </span>
              <span className="development-row__levels" aria-hidden="true">
                {definition.levels.map((candidate) => (
                  <i
                    key={candidate.level}
                    data-active={
                      item?.level !== null &&
                      item?.level !== undefined &&
                      candidate.level <= item.level
                    }
                  />
                ))}
              </span>
              <span
                id={tooltipId}
                className="development-row__tooltip"
                role="tooltip"
              >
                <strong>{definition.label}</strong>
                <span>현재 단계: {level?.name ?? "미설정"}</span>
                {trend ? <span>추세: {trend.label}</span> : null}
                {level?.modifiers.map((modifier) => (
                  <span key={`${modifier.key}-${modifier.value}`}>
                    {modifier.key}: {modifier.value > 0 ? "+" : ""}
                    {modifier.value}
                    {modifier.unit === "percent" ? "%" : ""}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
