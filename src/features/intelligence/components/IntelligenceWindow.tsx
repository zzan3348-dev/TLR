import type { MapCountryIndex } from "../../../types/mapCountry";
import { UiIcon } from "../../../components/UiIcon";
import { StrategicWindow } from "../../play/components/StrategicWindow";

type IntelligenceWindowProps = {
  country: MapCountryIndex;
  onClose: () => void;
};

const GROUPS = [
  { icon: "intelligence/agency", title: "정보", items: ["정치 정보망", "경제 정보망", "외교 정보망", "산업 정보망"] },
  { icon: "intelligence/defense", title: "방첩", items: ["국내 방첩망", "보안기관 협조", "신원검증", "대공작 체계"] },
  { icon: "intelligence/operation", title: "작전", items: ["기관 침투", "영향력 공작", "산업 첩보", "사보타주"] },
  { icon: "intelligence/training", title: "훈련", items: ["언어", "위장신분", "전문공작", "심리전"] },
] as const;

export function IntelligenceWindow({
  country,
  onClose,
}: IntelligenceWindowProps) {
  return (
    <StrategicWindow title="첩보" eyebrow={country.name} onClose={onClose}>
      <div className="intelligence-scoreboard">
        <span>
          기관 규모
          <strong>0 / 0</strong>
        </span>
        <span>
          방첩력
          <strong>0.00</strong>
        </span>
        <span>
          작전 슬롯
          <strong>0 / 0</strong>
        </span>
      </div>
      <div className="strategy-grid">
        {GROUPS.map((group) => (
          <section key={group.title} className="strategy-section">
            <h3><UiIcon name={group.icon} />{group.title}</h3>
            <div className="strategy-action-grid">
              {group.items.map((item) => (
                <button key={item} type="button" disabled>
                  <strong>{item}</strong>
                  <small>00일 후 완료</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </StrategicWindow>
  );
}
