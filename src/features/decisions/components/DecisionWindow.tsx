import type { MapCountryIndex } from "../../../types/mapCountry";
import { UiIcon } from "../../../components/UiIcon";
import { StrategicWindow } from "../../play/components/StrategicWindow";

type DecisionWindowProps = {
  country: MapCountryIndex;
  onClose: () => void;
};

const DECISIONS = [
  "행정 정비",
  "산업 조사",
  "외교 보고서",
  "사회 안정 계획",
] as const;

export function DecisionWindow({
  country,
  onClose,
}: DecisionWindowProps) {
  return (
    <StrategicWindow
      title="국가 과제 / 디시전"
      eyebrow={country.name}
      onClose={onClose}
    >
      <section className="major-objective-card">
        <small>현재 주요 국가과제</small>
        <h3>국가 운영 체계 정비</h3>
        <p>
          국가별 과제가 지정되면 이 자리에서 진행 상황을 관리합니다.
        </p>
        <div className="objective-progress">
          <span style={{ width: "0%" }} />
        </div>
        <b>진행도 0.00% · 단계 0 / 0</b>
      </section>
      <section className="strategy-section">
        <h3>파생 디시전</h3>
        <div className="strategy-action-grid">
          {DECISIONS.map((decision, index) => (
            <button key={decision} type="button" disabled>
              <UiIcon name={["decision/objective", "decision/available", "decision/locked", "decision/cost"][index] ?? "decision/objective"} />
              <strong>{decision}</strong>
              <small>비용: 정치력 00</small>
            </button>
          ))}
        </div>
      </section>
    </StrategicWindow>
  );
}
