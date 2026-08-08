import { useEffect, useMemo, useState } from "react";
import { mapCountries } from "../../../data/mapCountries";

type CatalogKind = "GRAND_DOCTRINE" | "OFFICER_SPIRIT";
type Catalog = {
  id: string; key: string; display_name_ko: string; description_ko: string; icon_path: string | null;
  configuration_status: "PARTIAL" | "READY" | "DISABLED"; enabled: boolean; sort_order: number;
  category?: "ACADEMY" | "ARMY" | "DIVISION_COMMAND";
};
type Ideology = {
  id: string; key: string; display_name_ko: string; description_ko: string; color: string | null;
  icon_path: string | null; civil_war_spectrum_id: string | null; enabled: boolean; sort_order: number;
};
type Effect = {
  doctrine_id?: string; spirit_id?: string; effect_key: string; value: number; unit: "flat" | "percent";
  display_text_ko: string; admin_guidance_ko: string; sort_order: number;
};
type Requirement = {
  id: string; requirement_group_id: string; requirement_type: string; target_id: string | null;
  numeric_value: number | null; boolean_value: boolean | null; description_ko: string; metadata: Record<string, unknown>;
};
type RequirementGroup = { id: string; target_kind: CatalogKind; target_id: string; match_mode: "ALL" | "ANY"; sort_order: number };
type ReviewAction = {
  id: string; conflict_id: string; country_key: string; title: string; body: string; status: string;
  submitted_world_date: string | null; assignments: Array<{ object_kind: string; object_id: string }>;
};
type Spectrum = { id: string; display_name_ko: string };

export type MilitaryAdminData = {
  worldDate: string; spectrums: Spectrum[]; ideologies: Ideology[]; doctrines: Catalog[]; spirits: Catalog[];
  doctrineEffects: Effect[]; spiritEffects: Effect[]; requirementGroups: RequirementGroup[];
  requirements: Requirement[]; actions: ReviewAction[];
};

type EditorTarget = { kind: CatalogKind; id: string } | { kind: "IDEOLOGY"; id: string };
type EffectDraft = { key: string; value: string; unit: "flat" | "percent"; displayText: string; adminGuidance: string };
type RequirementDraft = { type: string; targetId: string; numericValue: string; description: string };
type GroupDraft = { matchMode: "ALL" | "ANY"; requirements: RequirementDraft[] };

const REQUIREMENT_TYPES = [
  "IDEOLOGY_CATEGORY_IS", "IDEOLOGY_CATEGORY_IS_NOT", "IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST", "IDEOLOGY_CATEGORY_SUPPORT_AT_MOST",
  "CIVIL_WAR_SPECTRUM_IS", "CIVIL_WAR_SPECTRUM_IS_NOT", "HAS_GRAND_DOCTRINE", "DOES_NOT_HAVE_GRAND_DOCTRINE",
  "HAS_OFFICER_SPIRIT", "DOES_NOT_HAVE_OFFICER_SPIRIT", "HAS_LAW", "DOES_NOT_HAVE_LAW",
  "COUNTRY_STAT_AT_LEAST", "COUNTRY_STAT_AT_MOST", "WORLD_DATE_AFTER", "WORLD_DATE_BEFORE", "CUSTOM_ADMIN_FLAG",
] as const;

function countryName(key: string): string {
  return mapCountries.find((country) => country.key === key)?.name ?? key;
}

function blankCatalog(kind: CatalogKind): Catalog {
  return { id: "", key: "", display_name_ko: "", description_ko: "", icon_path: null, configuration_status: "PARTIAL", enabled: true, sort_order: 0, ...(kind === "OFFICER_SPIRIT" ? { category: "ACADEMY" as const } : {}) };
}

async function postMilitary(body: Record<string, unknown>): Promise<void> {
  const response = await fetch("/api/admin/military", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("MILITARY_ADMIN_REQUEST_FAILED");
}

export function MilitaryAdminSection({ data, onReload, onError }: { data: MilitaryAdminData; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const initialTarget: EditorTarget = data.doctrines[0]
    ? { kind: "GRAND_DOCTRINE", id: data.doctrines[0].id }
    : data.spirits[0] ? { kind: "OFFICER_SPIRIT", id: data.spirits[0].id }
      : { kind: "GRAND_DOCTRINE", id: "" };
  const [target, setTarget] = useState<EditorTarget>(initialTarget);
  const [catalog, setCatalog] = useState<Catalog>(blankCatalog("GRAND_DOCTRINE"));
  const [ideology, setIdeology] = useState<Ideology | null>(null);
  const [effects, setEffects] = useState<EffectDraft[]>([]);
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [resolution, setResolution] = useState<Record<string, { outcome: string; summary: string; reportTitle: string; reportBody: string }>>({});

  const selected = useMemo(() => target.kind === "IDEOLOGY"
    ? data.ideologies.find((row) => row.id === target.id) ?? null
    : (target.kind === "GRAND_DOCTRINE" ? data.doctrines : data.spirits).find((row) => row.id === target.id) ?? blankCatalog(target.kind),
  [data, target]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (target.kind === "IDEOLOGY") {
      setIdeology(selected && "civil_war_spectrum_id" in selected ? selected : {
        id: "", key: "", display_name_ko: "", description_ko: "", color: "#6aa39b", icon_path: null,
        civil_war_spectrum_id: null, enabled: true, sort_order: 0,
      });
      setEffects([]); setGroups([]); return;
    }
    const row = selected && "configuration_status" in selected ? selected : blankCatalog(target.kind);
    setCatalog(row);
    const relation = target.kind === "GRAND_DOCTRINE" ? "doctrine_id" : "spirit_id";
    const source = target.kind === "GRAND_DOCTRINE" ? data.doctrineEffects : data.spiritEffects;
    setEffects(source.filter((effect) => effect[relation] === target.id).map((effect) => ({
      key: effect.effect_key, value: String(effect.value), unit: effect.unit,
      displayText: effect.display_text_ko, adminGuidance: effect.admin_guidance_ko,
    })));
    setGroups(data.requirementGroups.filter((group) => group.target_kind === target.kind && group.target_id === target.id).map((group) => ({
      matchMode: group.match_mode,
      requirements: data.requirements.filter((requirement) => requirement.requirement_group_id === group.id).map((requirement) => ({
        type: requirement.requirement_type, targetId: requirement.target_id ?? "",
        numericValue: requirement.numeric_value === null ? "" : String(requirement.numeric_value), description: requirement.description_ko,
      })),
    })));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, selected, target]);

  const save = async () => {
    setBusy(true); onError("");
    try {
      if (target.kind === "IDEOLOGY" && ideology) {
        await postMilitary({ action: "UPSERT_IDEOLOGY", id: ideology.id || undefined, key: ideology.key, displayName: ideology.display_name_ko, description: ideology.description_ko, color: ideology.color, iconPath: ideology.icon_path, spectrumId: ideology.civil_war_spectrum_id, enabled: ideology.enabled, sortOrder: ideology.sort_order });
      } else if (target.kind !== "IDEOLOGY") {
        await postMilitary({ action: "UPSERT_CATALOG", targetKind: target.kind, id: catalog.id || undefined, key: catalog.key, displayName: catalog.display_name_ko, description: catalog.description_ko, iconPath: catalog.icon_path, configurationStatus: catalog.configuration_status, enabled: catalog.enabled, sortOrder: catalog.sort_order, category: catalog.category });
        if (catalog.id) {
          await postMilitary({ action: "REPLACE_EFFECTS", targetKind: target.kind, targetId: catalog.id, effects: effects.map((effect) => ({ ...effect, value: Number(effect.value) })) });
          await postMilitary({ action: "REPLACE_REQUIREMENTS", targetKind: target.kind, targetId: catalog.id, groups: groups.map((group) => ({ matchMode: group.matchMode, requirements: group.requirements.map((requirement) => ({ type: requirement.type, targetId: requirement.targetId || null, numericValue: requirement.numericValue === "" ? null : Number(requirement.numericValue), description: requirement.description })) })) });
        }
      }
      await onReload();
    } catch { onError("군사 데이터 저장에 실패했습니다. 입력값과 최신 상태를 확인해 주세요."); }
    finally { setBusy(false); }
  };

  const resolve = async (actionRow: ReviewAction) => {
    const form = resolution[actionRow.id] ?? { outcome: "PARTIAL", summary: "", reportTitle: "", reportBody: "" };
    setBusy(true); onError("");
    try {
      await postMilitary({ action: "RESOLVE_ACTION", actionId: actionRow.id, ...form, visibility: "PUBLIC", losses: {}, stateChanges: {}, territoryChanges: {} });
      await onReload();
    } catch { onError("작전 판정을 저장하지 못했습니다. 판정 요약과 보고서 내용을 확인해 주세요."); }
    finally { setBusy(false); }
  };

  const selectValue = `${target.kind}:${target.id}`;
  return (
    <section className="directorate-military" aria-labelledby="directorate-military-title">
      <header>
        <div><span>GENERAL STAFF / OFFICER CORPS</span><h2 id="directorate-military-title">군사 데이터·전쟁 관제</h2></div>
        <strong>{data.worldDate} · 판정 대기 {data.actions.length}건</strong>
      </header>
      <div className="directorate-military__workspace">
        <aside className="directorate-military__catalog">
          <label htmlFor="military-admin-catalog">편집 대상</label>
          <select id="military-admin-catalog" value={selectValue} onChange={(event) => {
            const [kind, id] = event.target.value.split(":") as [EditorTarget["kind"], string]; setTarget({ kind, id } as EditorTarget);
          }}>
            <optgroup label="대교리"><option value="GRAND_DOCTRINE:">＋ 새 대교리</option>{data.doctrines.map((row) => <option key={row.id} value={`GRAND_DOCTRINE:${row.id}`}>{row.display_name_ko}</option>)}</optgroup>
            <optgroup label="장교단 정신"><option value="OFFICER_SPIRIT:">＋ 새 장교단 정신</option>{data.spirits.map((row) => <option key={row.id} value={`OFFICER_SPIRIT:${row.id}`}>{row.display_name_ko}</option>)}</optgroup>
            <optgroup label="사상 계열"><option value="IDEOLOGY:">＋ 새 사상 계열</option>{data.ideologies.map((row) => <option key={row.id} value={`IDEOLOGY:${row.id}`}>{row.display_name_ko}</option>)}</optgroup>
          </select>
          <p>사용자 화면에는 원본 출처명이 노출되지 않습니다. 준비되지 않은 항목은 PARTIAL로 유지됩니다.</p>
        </aside>
        <div className="directorate-military__editor">
          {target.kind === "IDEOLOGY" && ideology ? (
            <div className="directorate-military__fields">
              <label>내부 키<input value={ideology.key} onChange={(event) => setIdeology({ ...ideology, key: event.target.value })} /></label>
              <label>표시명<input value={ideology.display_name_ko} onChange={(event) => setIdeology({ ...ideology, display_name_ko: event.target.value })} /></label>
              <label>색상<input value={ideology.color ?? ""} onChange={(event) => setIdeology({ ...ideology, color: event.target.value })} /></label>
              <label>내전 스펙트럼<select value={ideology.civil_war_spectrum_id ?? ""} onChange={(event) => setIdeology({ ...ideology, civil_war_spectrum_id: event.target.value || null })}><option value="">미지정</option>{data.spectrums.map((row) => <option key={row.id} value={row.id}>{row.display_name_ko}</option>)}</select></label>
              <label className="directorate-military__wide">설명<textarea value={ideology.description_ko} onChange={(event) => setIdeology({ ...ideology, description_ko: event.target.value })} /></label>
            </div>
          ) : target.kind !== "IDEOLOGY" ? (
            <>
              <div className="directorate-military__fields">
                <label>내부 키<input value={catalog.key} onChange={(event) => setCatalog({ ...catalog, key: event.target.value })} /></label>
                <label>표시명<input value={catalog.display_name_ko} onChange={(event) => setCatalog({ ...catalog, display_name_ko: event.target.value })} /></label>
                <label>설정 상태<select value={catalog.configuration_status} onChange={(event) => setCatalog({ ...catalog, configuration_status: event.target.value as Catalog["configuration_status"] })}><option>PARTIAL</option><option>READY</option><option>DISABLED</option></select></label>
                {target.kind === "OFFICER_SPIRIT" ? <label>슬롯<select value={catalog.category} onChange={(event) => setCatalog({ ...catalog, category: event.target.value as Catalog["category"] })}><option value="ACADEMY">사관학교</option><option value="ARMY">육군</option><option value="DIVISION_COMMAND">사단 지휘</option></select></label> : null}
                <label className="directorate-military__wide">아이콘 경로<input value={catalog.icon_path ?? ""} onChange={(event) => setCatalog({ ...catalog, icon_path: event.target.value || null })} /></label>
                <label className="directorate-military__wide">설명<textarea value={catalog.description_ko} onChange={(event) => setCatalog({ ...catalog, description_ko: event.target.value })} /></label>
              </div>
              <section className="directorate-military__subeditor"><header><h3>시스템 효과</h3><button type="button" onClick={() => setEffects([...effects, { key: "", value: "0", unit: "flat", displayText: "", adminGuidance: "" }])}>효과 추가</button></header>{effects.map((effect, index) => <div className="directorate-military__row" key={`${index}-${effect.key}`}><input aria-label="효과 키" value={effect.key} onChange={(event) => setEffects(effects.map((row, rowIndex) => rowIndex === index ? { ...row, key: event.target.value } : row))} /><input aria-label="효과 표시문" value={effect.displayText} onChange={(event) => setEffects(effects.map((row, rowIndex) => rowIndex === index ? { ...row, displayText: event.target.value } : row))} /><input aria-label="효과 수치" type="number" value={effect.value} onChange={(event) => setEffects(effects.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} /><select aria-label="효과 단위" value={effect.unit} onChange={(event) => setEffects(effects.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value as EffectDraft["unit"] } : row))}><option value="flat">고정</option><option value="percent">%</option></select><button type="button" onClick={() => setEffects(effects.filter((_, rowIndex) => rowIndex !== index))}>삭제</button></div>)}</section>
              <section className="directorate-military__subeditor"><header><h3>선택 조건</h3><button type="button" onClick={() => setGroups([...groups, { matchMode: "ALL", requirements: [] }])}>조건군 추가</button></header>{groups.map((group, groupIndex) => <div className="directorate-military__group" key={groupIndex}><div><select aria-label="조건군 방식" value={group.matchMode} onChange={(event) => setGroups(groups.map((row, index) => index === groupIndex ? { ...row, matchMode: event.target.value as GroupDraft["matchMode"] } : row))}><option value="ALL">모두 충족</option><option value="ANY">하나 이상</option></select><button type="button" onClick={() => setGroups(groups.map((row, index) => index === groupIndex ? { ...row, requirements: [...row.requirements, { type: "CUSTOM_ADMIN_FLAG", targetId: "", numericValue: "", description: "" }] } : row))}>조건 추가</button><button type="button" onClick={() => setGroups(groups.filter((_, index) => index !== groupIndex))}>조건군 삭제</button></div>{group.requirements.map((requirement, requirementIndex) => <div className="directorate-military__row" key={requirementIndex}><select aria-label="조건 유형" value={requirement.type} onChange={(event) => setGroups(groups.map((row, index) => index === groupIndex ? { ...row, requirements: row.requirements.map((item, itemIndex) => itemIndex === requirementIndex ? { ...item, type: event.target.value } : item) } : row))}>{REQUIREMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select><input aria-label="조건 대상" placeholder="대상 ID/키" value={requirement.targetId} onChange={(event) => setGroups(groups.map((row, index) => index === groupIndex ? { ...row, requirements: row.requirements.map((item, itemIndex) => itemIndex === requirementIndex ? { ...item, targetId: event.target.value } : item) } : row))} /><input aria-label="조건 수치" type="number" placeholder="수치" value={requirement.numericValue} onChange={(event) => setGroups(groups.map((row, index) => index === groupIndex ? { ...row, requirements: row.requirements.map((item, itemIndex) => itemIndex === requirementIndex ? { ...item, numericValue: event.target.value } : item) } : row))} /><button type="button" onClick={() => setGroups(groups.map((row, index) => index === groupIndex ? { ...row, requirements: row.requirements.filter((_, itemIndex) => itemIndex !== requirementIndex) } : row))}>삭제</button></div>)}</div>)}</section>
            </>
          ) : null}
          <div className="directorate-military__save"><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "전송 중" : "관제 데이터 저장"}</button></div>
        </div>
      </div>
      <section className="directorate-military__review"><header><span>OPERATIONS ROOM</span><h3>작전 판정 대기열</h3></header>{data.actions.length === 0 ? <p>판정을 기다리는 작전이 없습니다.</p> : data.actions.map((actionRow) => {
        const form = resolution[actionRow.id] ?? { outcome: "PARTIAL", summary: "", reportTitle: "", reportBody: "" };
        return <article key={actionRow.id}><div><small>{countryName(actionRow.country_key)} · {actionRow.submitted_world_date ?? data.worldDate}</small><h4>{actionRow.title}</h4><p>{actionRow.body}</p><span>배속 전력 {actionRow.assignments.length}개</span></div><div className="directorate-military__resolution"><select aria-label="작전 결과" value={form.outcome} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, outcome: event.target.value } })}><option value="SUCCESS">성공</option><option value="PARTIAL">부분 성공</option><option value="FAILURE">실패</option><option value="INVALID">무효</option><option value="WITHDRAWN">철회</option></select><input placeholder="전쟁 보고서 제목" value={form.reportTitle} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, reportTitle: event.target.value } })} /><textarea placeholder="판정 요약" value={form.summary} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, summary: event.target.value } })} /><textarea placeholder="공개 보고서 본문" value={form.reportBody} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, reportBody: event.target.value } })} /><button type="button" disabled={busy} onClick={() => void resolve(actionRow)}>판정 확정</button></div></article>;
      })}</section>
    </section>
  );
}
