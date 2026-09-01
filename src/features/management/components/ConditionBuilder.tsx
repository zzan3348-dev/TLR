import type { ManagementConditionGroup, ManagementConditionLeaf } from "../types";

const KIND_LABELS: Record<ManagementConditionLeaf["kind"], string> = {
  country: "대상 국가",
  stability: "안정도",
  warSupport: "전쟁 지지도",
  atWar: "전쟁 상태",
  ideology: "집권 사상",
  worldDate: "세계 날짜",
  turn: "현재 턴",
};

const OPERATOR_LABELS: Record<ManagementConditionLeaf["operator"], string> = {
  equals: "같음",
  notEquals: "같지 않음",
  gte: "이상",
  lte: "이하",
  before: "이전",
  after: "이후",
};

function defaultValue(kind: ManagementConditionLeaf["kind"]): string | number | boolean {
  if (kind === "atWar") return false;
  if (kind === "stability" || kind === "warSupport") return 50;
  if (kind === "turn") return 1;
  if (kind === "worldDate") return "1932-01-01";
  return "";
}

export function ConditionBuilder({ value, countries, onChange }: {
  value: ManagementConditionGroup;
  countries: Array<{ key: string; name: string }>;
  onChange: (value: ManagementConditionGroup) => void;
}) {
  const update = (id: string, patch: Partial<ManagementConditionLeaf>) => onChange({
    ...value,
    conditions: value.conditions.map((condition) => condition.id === id ? { ...condition, ...patch } : condition),
  });
  const remove = (id: string) => onChange({ ...value, conditions: value.conditions.filter((condition) => condition.id !== id) });
  const add = () => onChange({
    ...value,
    conditions: [...value.conditions, { id: `condition_${Date.now().toString(36)}`, kind: "country", operator: "equals", value: "" }],
  });

  return (
    <section className="management-builder" aria-labelledby="condition-builder-title">
      <header><div><span>SHARED BUILDER</span><h3 id="condition-builder-title">발동 조건</h3></div>
        <select aria-label="조건 결합 방식" value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as ManagementConditionGroup["mode"] })}>
          <option value="ALL">모든 조건 충족</option><option value="ANY">하나 이상 충족</option>
        </select>
      </header>
      <div className="management-builder__rows">
        {value.conditions.map((condition) => (
          <div className="management-builder__row" key={condition.id}>
            <select aria-label="조건 종류" value={condition.kind} onChange={(event) => { const kind = event.target.value as ManagementConditionLeaf["kind"]; update(condition.id, { kind, value: defaultValue(kind), operator: kind === "worldDate" ? "after" : "equals" }); }}>
              {Object.entries(KIND_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
            <select aria-label="비교 연산" value={condition.operator} onChange={(event) => update(condition.id, { operator: event.target.value as ManagementConditionLeaf["operator"] })}>
              {Object.entries(OPERATOR_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
            {condition.kind === "country" ? (
              <select aria-label="국가 값" value={String(condition.value)} onChange={(event) => update(condition.id, { value: event.target.value })}><option value="">국가 선택</option>{countries.map((country) => <option value={country.key} key={country.key}>{country.name}</option>)}</select>
            ) : condition.kind === "atWar" ? (
              <select aria-label="전쟁 상태 값" value={String(condition.value)} onChange={(event) => update(condition.id, { value: event.target.value === "true" })}><option value="true">전쟁 중</option><option value="false">평시</option></select>
            ) : (
              <input aria-label="조건 값" type={condition.kind === "worldDate" ? "date" : condition.kind === "stability" || condition.kind === "warSupport" || condition.kind === "turn" ? "number" : "text"} value={String(condition.value)} onChange={(event) => update(condition.id, { value: event.target.type === "number" ? Number(event.target.value) : event.target.value })} />
            )}
            <button type="button" onClick={() => remove(condition.id)} aria-label="조건 삭제">×</button>
          </div>
        ))}
        {value.conditions.length === 0 ? <p>조건이 없습니다. 수동 발동 이벤트는 조건 없이 저장할 수 있습니다.</p> : null}
      </div>
      <button className="management-builder__add" type="button" onClick={add}>+ 조건 추가</button>
    </section>
  );
}
