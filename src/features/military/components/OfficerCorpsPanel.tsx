import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchOfficerCorps, MilitaryApiError, selectGrandDoctrine, selectOfficerSpirit } from "../militaryClient";
import type { GrandDoctrine, MilitarySelectionState, OfficerCorpsState, OfficerSpirit, OfficerSpiritCategory } from "../types";

const CATEGORY_META: Record<OfficerSpiritCategory, { label: string; fallback: string }> = {
  ACADEMY: { label: "사관학교 정신", fallback: "/ui/military/officer-academy.svg" },
  ARMY: { label: "육군 정신", fallback: "/ui/military/officer-army.svg" },
  DIVISION_COMMAND: { label: "사단 지휘 정신", fallback: "/ui/military/officer-division.svg" },
};

const STATE_LABEL: Record<MilitarySelectionState, string> = {
  EMPTY: "미선택", READY: "선택 가능", LOCKED: "조건 미충족", PARTIAL: "설정 대기", DISABLED: "비활성", SELECTED: "채택 중",
};

type FocusedOption = { kind: "doctrine"; row: GrandDoctrine } | { kind: "spirit"; row: OfficerSpirit };

export function OfficerCorpsPanel({ countryKey }: { countryKey: string }) {
  const [state, setState] = useState<OfficerCorpsState | null>(null);
  const [openCategory, setOpenCategory] = useState<OfficerSpiritCategory | "DOCTRINE" | null>(null);
  const [focused, setFocused] = useState<FocusedOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setState(await fetchOfficerCorps(countryKey)); }
    catch (requestError) {
      if (requestError instanceof MilitaryApiError && requestError.code === "MILITARY_SERVER_NOT_CONFIGURED") {
        setState({
          countryKey,
          worldDate: "1932-01-01",
          version: 0,
          doctrine: null,
          selectedSpirits: {},
          doctrines: [],
          spirits: [],
        });
      } else {
        setError("군사사상 기록을 불러오지 못했습니다.");
      }
    }
    finally { setLoading(false); }
  }, [countryKey]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const visibleOptions = useMemo<FocusedOption[]>(() => {
    if (!state || !openCategory) return [];
    if (openCategory === "DOCTRINE") {
      return state.doctrines.map((row) => ({ kind: "doctrine", row }));
    }
    return state.spirits
      .filter((row) => row.category === openCategory)
      .map((row) => ({ kind: "spirit", row }));
  }, [openCategory, state]);

  const applyOption = useCallback(async (option: GrandDoctrine | OfficerSpirit) => {
    if (!state || option.selectionState !== "READY") return;
    setPending(option.id); setError(null);
    try {
      const next = "category" in option
        ? await selectOfficerSpirit(option.category, option.id, state.version)
        : await selectGrandDoctrine(option.id, state.version);
      setState(next); setOpenCategory(null); setFocused(null);
    } catch { setError("선택 조건이 바뀌었거나 관제망이 응답하지 않습니다."); void load(); }
    finally { setPending(null); }
  }, [load, state]);

  if (loading) return <div className="officer-corps__state">군사사상 기록 수신 중…</div>;
  if (!state) return <div className="officer-corps__state officer-corps__state--error">{error ?? "군사사상 기록이 없습니다."}</div>;

  const doctrine = state.doctrine;
  return (
    <div className="officer-corps">
      <header className="officer-corps__header">
        <div><span>OFFICER CORPS / GRAND DOCTRINE</span><h3>군사사상과 장교단</h3></div>
        <time>{state.worldDate}</time>
      </header>
      {error && <p className="officer-corps__error">{error}</p>}

      <div className="officer-corps__board">
        <button type="button" className="officer-corps__doctrine" onClick={() => setOpenCategory(openCategory === "DOCTRINE" ? null : "DOCTRINE")}>
          <img src={doctrine?.iconPath ?? "/ui/military/doctrine-compass.svg"} alt="" />
          <span className="officer-corps__slot-copy"><small>대교리</small><strong>{doctrine?.displayName ?? "대교리 미채택"}</strong><em>{doctrine?.description || "교리 목록을 열어 국가의 군사적 방향을 확인하십시오."}</em></span>
          <span className="officer-corps__slot-command">교리 목록</span>
        </button>

        <div className="officer-corps__slots">
          {(Object.keys(CATEGORY_META) as OfficerSpiritCategory[]).map((category) => {
            const selected = state.selectedSpirits[category];
            const meta = CATEGORY_META[category];
            return (
              <button key={category} type="button" className="officer-corps__slot" onClick={() => setOpenCategory(openCategory === category ? null : category)}>
                <img src={selected?.iconPath ?? meta.fallback} alt="" />
                <span><small>{meta.label}</small><strong>{selected?.displayName ?? "미선택"}</strong></span>
                <b>{openCategory === category ? "닫기" : "열기"}</b>
              </button>
            );
          })}
        </div>
      </div>

      {openCategory && (
        <section className="officer-corps__catalog" aria-label={openCategory === "DOCTRINE" ? "대교리 목록" : CATEGORY_META[openCategory].label}>
          <div className="officer-corps__catalog-grid">
            {visibleOptions.map((focusedOption) => {
              const option = focusedOption.row;
              const fallback = focusedOption.kind === "spirit"
                ? CATEGORY_META[focusedOption.row.category].fallback
                : "/ui/military/doctrine-compass.svg";
              return (
                <button key={option.id} type="button" className={`officer-option officer-option--${option.selectionState.toLowerCase()}`}
                  onMouseEnter={() => setFocused(focusedOption)}
                  onFocus={() => setFocused(focusedOption)}
                  onClick={() => void applyOption(option)} disabled={pending !== null || option.selectionState !== "READY"}>
                  <img src={option.iconPath ?? fallback} alt="" />
                  <span><strong>{option.displayName}</strong><small>{STATE_LABEL[option.selectionState]}</small></span>
                  {(option.selectionState === "LOCKED" || option.selectionState === "PARTIAL") && <i aria-hidden="true">▣</i>}
                </button>
              );
            })}
          </div>
          <OptionDetail focused={focused} />
        </section>
      )}
    </div>
  );
}

function OptionDetail({ focused }: { focused: FocusedOption | null }) {
  if (!focused) return <aside className="officer-option-detail"><span>항목에 마우스를 올리거나 키보드로 선택하면 상세 정보가 표시됩니다.</span></aside>;
  const row = focused.row;
  return (
    <aside className="officer-option-detail">
      <small>{focused.kind === "doctrine" ? "대교리" : CATEGORY_META[focused.row.category].label}</small>
      <h4>{row.displayName}</h4>
      <p>{row.description || "설명은 관리자 설정 후 공개됩니다."}</p>
      {row.effects.length > 0 && <ul className="officer-option-detail__effects">{row.effects.map((effect) => <li key={effect.key}>{effect.displayText}</li>)}</ul>}
      {row.requirements.length > 0 && <ul className="officer-option-detail__requirements">{row.requirements.map((requirement) => <li key={requirement.id} className={requirement.met ? "is-met" : "is-unmet"}>{requirement.met ? "충족" : "미충족"} · {requirement.description}</li>)}</ul>}
      {row.configurationStatus === "PARTIAL" && <b>효과·조건 설정 대기 중</b>}
    </aside>
  );
}
