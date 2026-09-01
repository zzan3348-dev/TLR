import type { EventEffect } from "../../effects/types";

const STAT_LABELS = {
  stability: "안정도", warSupport: "전쟁 지지도", politicalPower: "정치력", productionCapacity: "생산 능력",
  nationalIncome: "국가 수입", foreignReserves: "외환 보유고", researchPower: "연구력", povertyRate: "빈곤율",
} as const;

export function EffectBuilder({ value, countries, spirits, onChange }: {
  value: readonly EventEffect[];
  countries: Array<{ key: string; name: string }>;
  spirits: Array<{ registryId: string; countryKey: string; name: string }>;
  onChange: (value: EventEffect[]) => void;
}) {
  const update = (index: number, effect: EventEffect) => onChange(value.map((item, itemIndex) => itemIndex === index ? effect : item));
  const remove = (index: number) => onChange(value.filter((_, itemIndex) => itemIndex !== index));
  const add = () => onChange([...value, { type: "modify_country_value", targetCountryIds: [], statKey: "stability", amount: 0 }]);
  return (
    <section className="management-builder management-builder--effects" aria-label="선택지 효과">
      <header><div><span>SHARED BUILDER</span><h3>선택 시 효과</h3></div></header>
      <div className="management-builder__rows">
        {value.map((effect, index) => {
          const target = effect.targetCountryIds[0] ?? "";
          return <div className="management-builder__effect" key={`${effect.type}-${index}`}>
            <select aria-label="효과 종류" value={effect.type} onChange={(event) => {
              const type = event.target.value as EventEffect["type"];
              if (type === "modify_country_value") update(index, { type, targetCountryIds: target ? [target] : [], statKey: "stability", amount: 0 });
              else update(index, { type, targetCountryIds: target ? [target] : [], spiritId: "", ...(type === "add_national_spirit" ? { duration: null } : {}) });
            }}><option value="modify_country_value">국가 수치 변경</option><option value="add_national_spirit">국민정신 추가</option><option value="remove_national_spirit">국민정신 제거</option></select>
            <select aria-label="효과 대상 국가" value={target} onChange={(event) => update(index, { ...effect, targetCountryIds: event.target.value ? [event.target.value] : [] })}><option value="">대상 국가</option>{countries.map((country) => <option value={country.key} key={country.key}>{country.name}</option>)}</select>
            {effect.type === "modify_country_value" ? <><select aria-label="변경 수치" value={effect.statKey} onChange={(event) => update(index, { ...effect, statKey: event.target.value as keyof typeof STAT_LABELS })}>{Object.entries(STAT_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><input aria-label="변경량" type="number" step="0.1" value={effect.amount} onChange={(event) => update(index, { ...effect, amount: Number(event.target.value) })} /></> : <><select aria-label="국민정신" value={effect.spiritId} onChange={(event) => update(index, { ...effect, spiritId: event.target.value })}><option value="">국민정신 선택</option>{spirits.filter((spirit) => !target || spirit.countryKey === target).map((spirit) => <option value={spirit.registryId} key={spirit.registryId}>{spirit.name}</option>)}</select>{effect.type === "add_national_spirit" ? <input aria-label="유지 일수" type="number" min="1" placeholder="영구" value={effect.duration ?? ""} onChange={(event) => update(index, { ...effect, duration: event.target.value ? Number(event.target.value) : null })} /> : null}</>}
            <button type="button" onClick={() => remove(index)} aria-label="효과 삭제">×</button>
          </div>;
        })}
        {value.length === 0 ? <p>등록된 효과가 없습니다.</p> : null}
      </div>
      <button className="management-builder__add" type="button" onClick={add}>+ 효과 추가</button>
    </section>
  );
}
