import { developmentDefinitionById } from "../data/developmentDefinitions";
import { UiIcon } from "../../../components/UiIcon";
import type { CountryDevelopmentState } from "../types/development";

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
        {state.items.map((item) => {
          const definition = developmentDefinitionById.get(item.id);
          const level =
            item.level === null
              ? null
              : definition?.levels.find(
                  (candidate) => candidate.level === item.level,
                ) ?? null;
          const trend = TREND_LABELS[item.trend];
          return (
            <div key={item.id} className="development-row">
              <span className="development-row__icon" aria-hidden="true">
                <UiIcon name={DEVELOPMENT_ICON_BY_ID[item.id] ?? "sections/development"} />
              </span>
              <strong>{definition?.label ?? item.id}</strong>
              <b data-unset={!level}>{level?.name ?? "미설정"}</b>
              <span
                className="development-row__trend"
                data-trend={item.trend}
                aria-label={`추세: ${trend.label}`}
              >
                <UiIcon name={trend.icon} />
              </span>
              <span className="development-row__levels" aria-hidden="true">
                {(definition?.levels ?? []).map((candidate) => (
                  <i
                    key={candidate.level}
                    data-active={
                      item.level !== null &&
                      candidate.level <= item.level
                    }
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
