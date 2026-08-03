import { useCallback, useEffect, useMemo, useState } from "react";
import { getCountryPresentation } from "../../../data/countryPresentation";
import mapCountries from "../../../data/mapCountries.json";
import { CountryFlag } from "../../../components/CountryFlag";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import type { PlaySimulationState } from "../../play/data/playSimulationState";
import { announceEconomyUpdate, confirmBudget, createTradeProposal, loadEconomy, loadTradeAgreements, loadTradeCountries, loadTradeProposals, respondTradeProposal, saveBudget, terminateTradeAgreement } from "../economyClient";
import { RESOURCE_LABELS, type EconomySnapshot, type TradeAgreement, type TradeAssetType, type TradeCountrySummary, type TradeLine, type TradeProposal, type TradeResourceId } from "../types";

type EconomyTab = "overview" | "society" | "trade";
type Props = { country: MapCountryIndex; state: PlaySimulationState; onClose: () => void };
const BUDGET_KEYS = ["administration", "defense", "industry", "welfare", "education"] as const;
const BUDGET_LABELS: Record<(typeof BUDGET_KEYS)[number], string> = { administration: "행정", defense: "국방", industry: "산업", welfare: "복지", education: "교육" };
const RESOURCES = Object.keys(RESOURCE_LABELS) as TradeResourceId[];
const COUNTRY_MAP = new Map((mapCountries as unknown as MapCountryIndex[]).map((entry) => [entry.key, entry]));

function displayCountry(key: string): string {
  const country = COUNTRY_MAP.get(key);
  return country ? getCountryPresentation(country).title : key;
}

function showNumber(value: number | null | undefined, suffix = ""): string {
  return value == null ? "미설정" : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}

export function EconomyWindow({ country, onClose }: Props) {
  const [tab, setTab] = useState<EconomyTab>("overview");
  const [snapshot, setSnapshot] = useState<EconomySnapshot | null>(null);
  const [countries, setCountries] = useState<TradeCountrySummary[]>([]);
  const [proposals, setProposals] = useState<TradeProposal[]>([]);
  const [agreements, setAgreements] = useState<TradeAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const [economy, partners, proposalRows, agreementRows] = await Promise.all([
        loadEconomy(country.key, signal), loadTradeCountries(country.key, signal), loadTradeProposals(country.key, signal), loadTradeAgreements(country.key, signal),
      ]);
      setSnapshot(economy); setCountries(partners.countries); setProposals(proposalRows.proposals); setAgreements(agreementRows.agreements);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "ECONOMY_DATA_UNAVAILABLE");
    } finally { setLoading(false); }
  }, [country.key]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void reload(controller.signal));
    return () => controller.abort();
  }, [reload]);

  return (
    <StrategicWindow title="경제" eyebrow={getCountryPresentation(country).title} onClose={onClose} actions={
      <div className="strategic-window__tabs" role="tablist">
        {([['overview', '경제 개요'], ['society', '사회'], ['trade', '무역']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
    }>
      {loading ? <div className="economy-state-message">경제 기록을 조회하고 있습니다.</div> : error ? <div className="economy-state-message economy-state-message--error">경제 서버에 연결할 수 없습니다. ({error})</div> : snapshot ? (
        tab === "overview" ? <EconomyOverview snapshot={snapshot} countryKey={country.key} onSaved={() => reload()} />
          : tab === "society" ? <SocietyOverview snapshot={snapshot} />
            : <TradeOverview snapshot={snapshot} countries={countries} proposals={proposals} agreements={agreements} onChanged={() => reload()} />
      ) : null}
    </StrategicWindow>
  );
}

function EconomyOverview({ snapshot, countryKey, onSaved }: { snapshot: EconomySnapshot; countryKey: string; onSaved: () => void }) {
  const economy = snapshot.economy;
  const [budget, setBudget] = useState<Record<string, number>>(() => economy?.draft_budget ?? economy?.current_budget ?? {});
  const [saving, setSaving] = useState(false);
  if (!economy || snapshot.readiness === "UNCONFIGURED") return <div className="economy-state-message"><strong>경제 데이터 미설정</strong><span>국가별 경제 기록이 입력되기 전에는 0으로 추정하지 않습니다.</span></div>;
  const budgetReady = BUDGET_KEYS.every((key) => typeof budget[key] === "number" && Number.isFinite(budget[key]));
  const save = async (confirm: boolean) => { if (!budgetReady) return; setSaving(true); try { await saveBudget(countryKey, budget); if (confirm) await confirmBudget(countryKey); announceEconomyUpdate(); onSaved(); } finally { setSaving(false); } };
  return <>
    {snapshot.readiness === "PARTIAL" ? <div className="economy-readiness">일부 경제 지표만 설정되어 있습니다.</div> : null}
    <div className="economy-metric-grid">
      <Metric label="GDP" value={showNumber(economy.gdp, "B")} />
      <Metric label="명목 성장률" value={showNumber(economy.nominal_growth_rate, "%")} />
      <Metric label="인플레이션" value={showNumber(economy.inflation_rate, "%")} />
      <Metric label="실업률" value={showNumber(economy.unemployment_rate, "%")} />
      <Metric label="국가부채" value={showNumber(economy.national_debt, "B")} />
      <Metric label="외환보유액" value={showNumber(economy.foreign_reserves, "B")} />
      <Metric label="국가수입" value={showNumber(economy.national_income, "B")} />
      <Metric label="총지출" value={showNumber(economy.total_expenditure, "B")} />
    </div>
    <section className="strategy-section economy-budget"><header><h3>다음 예산안</h3><span>{economy.next_budget_world_date ? `${economy.next_budget_world_date} 적용 예정` : budgetReady ? "초안" : "예산 정보 미설정"}</span></header>
      {budgetReady ? <>{BUDGET_KEYS.map((key) => <label key={key}><span>{BUDGET_LABELS[key]}</span><input type="range" min={snapshot.rules.budget_min} max={snapshot.rules.budget_max} step={snapshot.rules.budget_step} value={budget[key]} onChange={(event) => setBudget((current) => ({ ...current, [key]: Number(event.target.value) }))} /><b>{budget[key]}%</b></label>)}
        <div className="economy-actions"><button disabled={saving} onClick={() => void save(false)}>초안 저장</button><button disabled={saving} onClick={() => void save(true)}>예산 확정</button></div></> : <p className="trade-blocked">예산 기준값이 입력되기 전에는 예산안을 계산하지 않습니다.</p>}
    </section>
  </>;
}

function SocietyOverview({ snapshot }: { snapshot: EconomySnapshot }) {
  const economy = snapshot.economy;
  return <div className="economy-metric-grid"><Metric label="실업률" value={showNumber(economy?.unemployment_rate, "%")} /><Metric label="연구 역량" value={showNumber(economy?.research_capacity)} /><Metric label="조세율" value={showNumber(economy?.nominal_tax_rate, "%")} /><Metric label="징세 효율" value={showNumber(economy?.tax_collection_efficiency, "%")} /></div>;
}

type DraftTradeLine = { localId: number; assetType: TradeAssetType; resourceTypeId: TradeResourceId; amount: number };
type TradeFilter = "ALL" | "TRADEABLE" | "PENDING" | "CONTRACTED";
let nextTradeLineId = 1;
const newDraftLine = (): DraftTradeLine => ({ localId: nextTradeLineId++, assetType: "RESOURCE", resourceTypeId: "STEEL", amount: 1 });

function capacityOf(country: TradeCountrySummary): number | null {
  const value = Array.isArray(country.productionCapacity) ? country.productionCapacity[0] : country.productionCapacity;
  return value?.available ?? null;
}

function aggregatedAvailabilityValid(lines: DraftTradeLine[], available: (line: DraftTradeLine) => number | null): boolean {
  const totals = new Map<string, { amount: number; available: number | null }>();
  for (const line of lines) {
    const key = line.assetType === "RESOURCE" ? `RESOURCE:${line.resourceTypeId}` : "PRODUCTION_CAPACITY";
    const current = totals.get(key) ?? { amount: 0, available: available(line) };
    current.amount += line.amount;
    totals.set(key, current);
  }
  return [...totals.values()].every((entry) => entry.available !== null && entry.available >= entry.amount);
}

function CountryIdentity({ countryKey }: { countryKey: string }) {
  const country = COUNTRY_MAP.get(countryKey);
  if (!country) return <strong>{displayCountry(countryKey)}</strong>;
  const presentation = getCountryPresentation(country);
  return <span className="trade-country-identity"><CountryFlag country={country} flagPath={presentation.flagPath} /><strong>{presentation.title}</strong></span>;
}

function TradeLineEditor({ title, lines, onChange }: { title: string; lines: DraftTradeLine[]; onChange: (lines: DraftTradeLine[]) => void }) {
  const update = (localId: number, patch: Partial<DraftTradeLine>) => onChange(lines.map((line) => line.localId === localId ? { ...line, ...patch } : line));
  return <fieldset className="trade-line-group"><legend>{title}</legend>
    {lines.map((line) => <div className="trade-form-row" key={line.localId}>
      <select aria-label={`${title} 자산 종류`} value={line.assetType} onChange={(event) => update(line.localId, { assetType: event.target.value as TradeAssetType })}><option value="RESOURCE">자원</option><option value="PRODUCTION_CAPACITY">생산능력</option></select>
      {line.assetType === "RESOURCE" ? <select aria-label={`${title} 자원`} value={line.resourceTypeId} onChange={(event) => update(line.localId, { resourceTypeId: event.target.value as TradeResourceId })}>{RESOURCES.map((id) => <option value={id} key={id}>{RESOURCE_LABELS[id]}</option>)}</select> : <span className="trade-line-placeholder">생산능력</span>}
      <input aria-label={`${title} 수량`} type="number" min="0.01" step="0.01" value={line.amount} onChange={(event) => update(line.localId, { amount: Number(event.target.value) })} />
      <button type="button" aria-label={`${title} 항목 삭제`} disabled={lines.length === 1} onClick={() => onChange(lines.filter((item) => item.localId !== line.localId))}>−</button>
    </div>)}
    <button type="button" className="trade-add-line" onClick={() => onChange([...lines, newDraftLine()])}>+ 항목 추가</button>
  </fieldset>;
}

function TradeOverview({ snapshot, countries, proposals, agreements, onChanged }: { snapshot: EconomySnapshot; countries: TradeCountrySummary[]; proposals: TradeProposal[]; agreements: TradeAgreement[]; onChanged: () => void }) {
  const countryKey = snapshot.countryKey;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TradeFilter>("ALL");
  const [selected, setSelected] = useState<TradeCountrySummary | null>(null);
  const [giveLines, setGiveLines] = useState<DraftTradeLine[]>(() => [newDraftLine()]);
  const [receiveLines, setReceiveLines] = useState<DraftTradeLine[]>(() => [newDraftLine()]);
  const [startDate, setStartDate] = useState(() => addDays(snapshot.worldDate, 7));
  const [endDate, setEndDate] = useState(() => addDays(snapshot.worldDate, 187));
  const [deadline, setDeadline] = useState(() => addDays(snapshot.worldDate, 7));
  const [interval, setInterval] = useState(snapshot.rules.settlement_interval_days);
  const [autoRenew, setAutoRenew] = useState(false);
  const [allowEarly, setAllowEarly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hasPending = useCallback((key: string) => proposals.some((row) => row.status === "PENDING" && (row.proposer_country_key === key || row.receiver_country_key === key)), [proposals]);
  const hasContract = useCallback((key: string) => agreements.some((row) => ["SCHEDULED", "ACTIVE", "SUSPENDED", "BREACHED"].includes(row.status) && (row.country_a_key === key || row.country_b_key === key)), [agreements]);
  const filtered = useMemo(() => countries.filter((row) => {
    if (!displayCountry(row.countryKey).includes(search.trim())) return false;
    if (filter === "TRADEABLE") return row.readiness === "READY";
    if (filter === "PENDING") return hasPending(row.countryKey);
    if (filter === "CONTRACTED") return hasContract(row.countryKey);
    return true;
  }), [countries, filter, hasContract, hasPending, search]);

  const selectedPending = selected ? proposals.filter((row) => row.status === "PENDING" && (row.proposer_country_key === selected.countryKey || row.receiver_country_key === selected.countryKey)) : [];
  const selectedAgreements = selected ? agreements.filter((row) => ["SCHEDULED", "ACTIVE", "SUSPENDED", "BREACHED"].includes(row.status) && (row.country_a_key === selected.countryKey || row.country_b_key === selected.countryKey)) : [];
  const ownAvailable = (line: DraftTradeLine): number | null => line.assetType === "PRODUCTION_CAPACITY" ? snapshot.productionCapacity?.available ?? null : snapshot.resources.find((resource) => resource.resource_type_id === line.resourceTypeId)?.available ?? null;
  const targetAvailable = (line: DraftTradeLine): number | null => !selected ? null : line.assetType === "PRODUCTION_CAPACITY" ? capacityOf(selected) : selected.resources.find((resource) => resource.resource_type_id === line.resourceTypeId)?.available ?? null;
  const linesValid = [...giveLines, ...receiveLines].every((line) => Number.isFinite(line.amount) && line.amount > 0);
  const availabilityValid = aggregatedAvailabilityValid(giveLines, ownAvailable)
    && aggregatedAvailabilityValid(receiveLines, targetAvailable);
  const datesValid = startDate >= snapshot.worldDate && deadline >= snapshot.worldDate && deadline <= startDate && endDate > startDate && interval >= 1 && interval <= 365;
  const canSubmit = Boolean(selected && snapshot.readiness === "READY" && selected.readiness === "READY" && linesValid && availabilityValid && datesValid && !busy);

  const submit = async () => {
    if (!selected || !canSubmit) return;
    setBusy(true); setMessage(null);
    const lines: TradeLine[] = [
      ...giveLines.map((line) => ({ fromCountryKey: countryKey, toCountryKey: selected.countryKey, assetType: line.assetType, resourceTypeId: line.assetType === "RESOURCE" ? line.resourceTypeId : null, amount: line.amount })),
      ...receiveLines.map((line) => ({ fromCountryKey: selected.countryKey, toCountryKey: countryKey, assetType: line.assetType, resourceTypeId: line.assetType === "RESOURCE" ? line.resourceTypeId : null, amount: line.amount })),
    ];
    try {
      await createTradeProposal(countryKey, { targetCountryKey: selected.countryKey, lines, startWorldDate: startDate, endWorldDate: endDate, responseDeadlineWorldDate: deadline, settlementIntervalDays: interval, autoRenew, allowEarlyTermination: allowEarly, allowPartialFulfillment: false, idempotencyKey: crypto.randomUUID() });
      setMessage(selected.reviewRoute === "PLAYER" ? "상대국 운영자에게 무역 제안을 전달했습니다." : "관리자 검토 대기열에 등록했습니다.");
      announceEconomyUpdate(); onChanged();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "TRADE_REQUEST_FAILED"); }
    finally { setBusy(false); }
  };
  const act = async (task: Promise<unknown>) => { setBusy(true); try { await task; announceEconomyUpdate(); onChanged(); } finally { setBusy(false); } };

  return <div className="trade-workspace">
    <section className="trade-country-browser"><header><h3>교역 국가</h3><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="국가 검색" /></header>
      <div className="trade-filters">{([['ALL', '전체'], ['TRADEABLE', '무역 가능'], ['PENDING', '응답 대기'], ['CONTRACTED', '계약 중']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <div className="trade-country-list">{filtered.length ? filtered.map((row) => <button type="button" key={row.countryKey} aria-pressed={selected?.countryKey === row.countryKey} onClick={() => setSelected(row)}><CountryIdentity countryKey={row.countryKey} /><span>{row.readiness === "READY" ? hasPending(row.countryKey) ? "제안 응답 대기" : hasContract(row.countryKey) ? "계약 중" : "무역 가능" : row.readiness === "PARTIAL" ? "경제 데이터 일부 설정" : "경제 데이터 미설정"}</span><i className={`trade-readiness trade-readiness--${row.readiness.toLowerCase()}`} /></button>) : <p>조건에 맞는 국가가 없습니다.</p>}</div>
    </section>

    <section className="trade-composer"><h3>무역 협정 제안</h3>{selected ? <>
      <div className="trade-partners"><CountryIdentity countryKey={countryKey} /><span>⇄</span><CountryIdentity countryKey={selected.countryKey} /></div>
      <div className="trade-public-data"><span>응답: {selected.reviewRoute === "PLAYER" ? "국가 운영자" : "관리자 대리 검토"}</span><span>공개 생산능력: {showNumber(capacityOf(selected))}</span><span>공개 자원: {selected.resources.length ? selected.resources.map((row) => `${RESOURCE_LABELS[row.resource_type_id]} ${showNumber(row.available)}`).join(" · ") : "미설정"}</span><span>대기 제안 {selectedPending.length} · 관련 계약 {selectedAgreements.length}</span></div>
      {selected.readiness !== "READY" ? <p className="trade-blocked">해당 국가의 경제 데이터가 아직 완전히 설정되지 않았습니다.</p> : null}
      <TradeLineEditor title="우리 국가가 제공" lines={giveLines} onChange={setGiveLines} />
      <TradeLineEditor title="우리 국가가 받음" lines={receiveLines} onChange={setReceiveLines} />
      <div className="trade-terms"><label>시작 세계 날짜<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>종료 세계 날짜<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label>응답 기한<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><label>정산 주기<input type="number" min="1" max="365" value={interval} onChange={(event) => setInterval(Number(event.target.value))} /><span>일</span></label></div>
      <div className="trade-checkboxes"><label><input type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} /> 자동 갱신</label><label><input type="checkbox" checked={allowEarly} onChange={(event) => setAllowEarly(event.target.checked)} /> 중도 해지 허용</label></div>
      <div className="trade-preview"><h4>계약 예상치</h4>{giveLines.map((line) => <span key={`give-${line.localId}`}>{line.assetType === "RESOURCE" ? RESOURCE_LABELS[line.resourceTypeId] : "생산능력"}: {showNumber(ownAvailable(line))} → {ownAvailable(line) == null ? "계산 불가" : showNumber((ownAvailable(line) as number) - line.amount)} → {showNumber(ownAvailable(line))}</span>)}{receiveLines.map((line) => <span key={`receive-${line.localId}`}>수입 {line.assetType === "RESOURCE" ? RESOURCE_LABELS[line.resourceTypeId] : "생산능력"}: 현재 → +{showNumber(line.amount)} → 종료 후 복귀</span>)}</div>
      {!datesValid ? <p className="trade-blocked">세계 날짜와 응답 기한을 확인하십시오.</p> : !availabilityValid ? <p className="trade-blocked">양국의 공개 가용량이 부족하거나 아직 설정되지 않았습니다.</p> : null}
      <button type="button" className="trade-submit" disabled={!canSubmit} onClick={() => void submit()}>제안 전달</button>{message ? <small>{message}</small> : null}
    </> : <p>왼쪽 가로 바에서 무역 상대국을 선택하십시오.</p>}</section>

    <section className="trade-records"><h3>받은·보낸 무역 제안</h3>{proposals.length ? proposals.map((row) => <article key={row.id}><b>{displayCountry(row.proposer_country_key)} → {displayCountry(row.receiver_country_key)}</b><span>{row.status} · {row.proposed_start_world_date} ~ {row.proposed_end_world_date} · {row.settlement_interval_days}일 정산</span>{row.status === "PENDING" && row.receiver_country_key === countryKey && row.review_route === "PLAYER" ? <div><button disabled={busy} onClick={() => void act(respondTradeProposal(countryKey, row.id, "ACCEPT"))}>수락</button><button disabled={busy} onClick={() => void act(respondTradeProposal(countryKey, row.id, "REJECT"))}>거절</button></div> : row.status === "PENDING" && row.proposer_country_key === countryKey ? <button disabled={busy} onClick={() => void act(respondTradeProposal(countryKey, row.id, "WITHDRAW"))}>철회</button> : null}</article>) : <p>대기 중인 무역 제안이 없습니다.</p>}
      <h3>활성·예정·중단 무역 계약</h3>{agreements.length ? agreements.map((row) => <article key={row.id}><b>{displayCountry(row.country_a_key)} ↔ {displayCountry(row.country_b_key)}</b><span>{row.status} · {row.starts_world_date} ~ {row.ends_world_date} · 다음 정산 {row.next_settlement_world_date ?? "없음"}</span>{row.lines.map((line) => <small key={line.id}>{displayCountry(line.from_country_key)} 제공: {line.asset_type === "RESOURCE" && line.resource_type_id ? RESOURCE_LABELS[line.resource_type_id] : "생산능력"} {showNumber(line.amount_per_settlement)}</small>)}{row.allow_early_termination && ["SCHEDULED", "ACTIVE", "SUSPENDED", "BREACHED"].includes(row.status) ? <button disabled={busy} onClick={() => void act(terminateTradeAgreement(countryKey, row.id))}>협정 종료</button> : null}</article>) : <p>체결된 무역 협정이 없습니다.</p>}</section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="economy-metric"><span>{label}</span><strong>{value}</strong></article>; }
