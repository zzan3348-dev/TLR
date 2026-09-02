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
  id: string; conflict_id: string; front_id: string | null; country_key: string; title: string; body: string; status: string;
  submitted_world_date: string | null; assignments: Array<{ object_kind: string; object_id: string }>;
};
type AdminConflict = {
  id: string; display_name: string; conflict_type: string; status: string;
  sides: Array<{ id: string; display_name: string; sort_order: number; participants: Array<{ country_key: string | null }> }>;
};
type AdminFront = { id: string; conflict_id: string; display_name: string; front_kind: "LAND_LINE" | "NAVAL_AREA"; owner_side_id: string; opponent_side_id: string; geometry: Array<{ x: number; y: number }>; status: string };
type AdminOccupation = { id: string; conflict_id: string; legal_owner_country_key: string; occupier_country_key: string; province_ids?: string[] };
type Spectrum = { id: string; display_name_ko: string };

export type MilitaryAdminData = {
  worldDate: string; spectrums: Spectrum[]; ideologies: Ideology[]; doctrines: Catalog[]; spirits: Catalog[];
  doctrineEffects: Effect[]; spiritEffects: Effect[]; requirementGroups: RequirementGroup[];
  requirements: Requirement[]; actions: ReviewAction[];
  conflicts: AdminConflict[]; fronts: AdminFront[]; occupations: AdminOccupation[]; reports: Array<{ id: string; conflict_id: string }>;
};

type ResolutionDraft = {
  outcome: string; summary: string; reportTitle: string; reportBody: string;
  attackerLosses: string; defenderLosses: string; stateChanges: string; territorySummary: string; markerX: string; markerY: string;
};

const BLANK_RESOLUTION: ResolutionDraft = { outcome: "STALEMATE", summary: "", reportTitle: "", reportBody: "", attackerLosses: "", defenderLosses: "", stateChanges: "", territorySummary: "", markerX: "", markerY: "" };

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
  const [resolution, setResolution] = useState<Record<string, ResolutionDraft>>({});
  const [conflictDraft, setConflictDraft] = useState({ displayName: "", conflictType: "INTERSTATE_WAR", sideAName: "", sideACountries: "", sideBName: "", sideBCountries: "" });
  const [frontDraft, setFrontDraft] = useState({ conflictId: "", displayName: "", frontKind: "LAND_LINE", ownerSideId: "", opponentSideId: "", geometry: "" });
  const [occupationDraft, setOccupationDraft] = useState({ conflictId: "", legalOwnerCountryKey: "", occupierCountryKey: "", regionId: "" });
  const [warEnd, setWarEnd] = useState({ conflictId: "", winnerSideId: "", reportTitle: "", reportBody: "", preview: false });

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
    const form = resolution[actionRow.id] ?? BLANK_RESOLUTION;
    setBusy(true); onError("");
    try {
      const stateChanges = form.stateChanges.trim() ? JSON.parse(form.stateChanges) as Record<string, unknown> : {};
      await postMilitary({
        action: "RESOLVE_ACTION", actionId: actionRow.id, outcome: form.outcome, summary: form.summary,
        reportTitle: form.reportTitle, reportBody: form.reportBody, visibility: "PUBLIC",
        losses: { attacker: form.attackerLosses, defender: form.defenderLosses }, stateChanges, territoryChanges: {},
        territorySummary: form.territorySummary,
        marker: form.markerX !== "" && form.markerY !== "" ? { x: Number(form.markerX), y: Number(form.markerY) } : null,
      });
      await onReload();
    } catch { onError("작전 판정을 저장하지 못했습니다. 판정 요약과 보고서 내용을 확인해 주세요."); }
    finally { setBusy(false); }
  };

  const runCommand = async (payload: Record<string, unknown>, errorMessage: string) => {
    setBusy(true); onError("");
    try { await postMilitary(payload); await onReload(); }
    catch { onError(errorMessage); }
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
      <section className="directorate-military__command">
        <header><span>WAR CONTROL</span><h3>전쟁·전선·점령 관제</h3></header>
        <div className="directorate-military__metrics">
          <strong><b>{data.actions.length}</b>처리 대기 작전</strong>
          <strong><b>{data.conflicts.length}</b>진행 중 전쟁</strong>
          <strong><b>{data.fronts.filter((row) => row.status === "ACTIVE").length}</b>활성 전선</strong>
          <strong><b>{data.occupations.length}</b>점령 구역</strong>
        </div>
        <div className="directorate-military__command-grid">
          <form onSubmit={(event) => { event.preventDefault(); void runCommand({ action: "CREATE_CONFLICT", ...conflictDraft, sideACountries: conflictDraft.sideACountries.split(",").map((key) => key.trim()).filter(Boolean), sideBCountries: conflictDraft.sideBCountries.split(",").map((key) => key.trim()).filter(Boolean) }, "전쟁 생성에 실패했습니다. 양측 국가 키를 확인해 주세요."); }}>
            <h4>전쟁 생성</h4>
            <input required placeholder="전쟁명" value={conflictDraft.displayName} onChange={(event) => setConflictDraft({ ...conflictDraft, displayName: event.target.value })} />
            <select value={conflictDraft.conflictType} onChange={(event) => setConflictDraft({ ...conflictDraft, conflictType: event.target.value })}><option value="INTERSTATE_WAR">국가간 전쟁</option><option value="LIMITED_WAR">제한전</option><option value="BORDER_CONFLICT">국경분쟁</option><option value="CIVIL_WAR">내전</option><option value="INDEPENDENCE_WAR">독립전쟁</option><option value="ARMED_UPRISING">무장봉기</option></select>
            <input required placeholder="A측 명칭" value={conflictDraft.sideAName} onChange={(event) => setConflictDraft({ ...conflictDraft, sideAName: event.target.value })} />
            <input required placeholder="A측 국가 key, 쉼표 구분" value={conflictDraft.sideACountries} onChange={(event) => setConflictDraft({ ...conflictDraft, sideACountries: event.target.value })} />
            <input required placeholder="B측 명칭" value={conflictDraft.sideBName} onChange={(event) => setConflictDraft({ ...conflictDraft, sideBName: event.target.value })} />
            <input required placeholder="B측 국가 key, 쉼표 구분" value={conflictDraft.sideBCountries} onChange={(event) => setConflictDraft({ ...conflictDraft, sideBCountries: event.target.value })} />
            <button disabled={busy} type="submit">선전포고 확정</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); let geometry: unknown; try { geometry = JSON.parse(frontDraft.geometry); } catch { onError("전선 좌표는 [{\"x\":...,\"y\":...}] JSON 형식이어야 합니다."); return; } void runCommand({ action: "UPSERT_FRONT", ...frontDraft, geometry }, "전선 저장에 실패했습니다."); }}>
            <h4>전선 생성·수정</h4>
            <select required value={frontDraft.conflictId} onChange={(event) => { const conflict = data.conflicts.find((row) => row.id === event.target.value); setFrontDraft({ ...frontDraft, conflictId: event.target.value, ownerSideId: conflict?.sides[0]?.id ?? "", opponentSideId: conflict?.sides[1]?.id ?? "" }); }}><option value="">전쟁 선택</option>{data.conflicts.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}</select>
            <input required placeholder="전선명" value={frontDraft.displayName} onChange={(event) => setFrontDraft({ ...frontDraft, displayName: event.target.value })} />
            <select value={frontDraft.frontKind} onChange={(event) => setFrontDraft({ ...frontDraft, frontKind: event.target.value })}><option value="LAND_LINE">육상 전선</option><option value="NAVAL_AREA">해상 지원구역</option></select>
            <input required placeholder='지도 좌표 JSON [{"x":1200,"y":600},...]' value={frontDraft.geometry} onChange={(event) => setFrontDraft({ ...frontDraft, geometry: event.target.value })} />
            <button disabled={busy} type="submit">전선 저장</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); void runCommand({ action: "SET_OCCUPATION", ...occupationDraft }, "점령지 반영에 실패했습니다. 지역 그룹 ID를 확인해 주세요."); }}>
            <h4>프로빈스 점령 반영</h4>
            <select required value={occupationDraft.conflictId} onChange={(event) => setOccupationDraft({ ...occupationDraft, conflictId: event.target.value })}><option value="">전쟁 선택</option>{data.conflicts.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}</select>
            <input required placeholder="법적 소유국 key" value={occupationDraft.legalOwnerCountryKey} onChange={(event) => setOccupationDraft({ ...occupationDraft, legalOwnerCountryKey: event.target.value })} />
            <input required placeholder="현재 점령국 key" value={occupationDraft.occupierCountryKey} onChange={(event) => setOccupationDraft({ ...occupationDraft, occupierCountryKey: event.target.value })} />
            <input required placeholder="프로빈스 지역 그룹 ID" value={occupationDraft.regionId} onChange={(event) => setOccupationDraft({ ...occupationDraft, regionId: event.target.value })} />
            <small>프로빈스 관리 지도에서 만든 지역 그룹을 그대로 참조합니다.</small>
            <button disabled={busy} type="submit">점령 상태 적용</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); if (!warEnd.preview) { setWarEnd({ ...warEnd, preview: true }); return; } void runCommand({ action: "END_CONFLICT", ...warEnd, confirm: true }, "전쟁 종료 처리에 실패했습니다."); }}>
            <h4>전쟁 종료 마법사</h4>
            <select required value={warEnd.conflictId} onChange={(event) => setWarEnd({ ...warEnd, conflictId: event.target.value, winnerSideId: "", preview: false })}><option value="">전쟁 선택</option>{data.conflicts.map((row) => <option key={row.id} value={row.id}>{row.display_name}</option>)}</select>
            <select value={warEnd.winnerSideId} onChange={(event) => setWarEnd({ ...warEnd, winnerSideId: event.target.value, preview: false })}><option value="">승자 없음/미정</option>{data.conflicts.find((row) => row.id === warEnd.conflictId)?.sides.map((side) => <option key={side.id} value={side.id}>{side.display_name}</option>)}</select>
            <input required placeholder="최종 보고서 제목" value={warEnd.reportTitle} onChange={(event) => setWarEnd({ ...warEnd, reportTitle: event.target.value, preview: false })} />
            <textarea required placeholder="최종 전쟁 보고서" value={warEnd.reportBody} onChange={(event) => setWarEnd({ ...warEnd, reportBody: event.target.value, preview: false })} />
            {warEnd.preview ? <p className="directorate-military__end-preview">확정 시 모든 전선이 종료되고 미완료 작전이 취소됩니다. 점령지는 법적 영토와 분리된 채 유지됩니다.</p> : null}
            <button disabled={busy} type="submit">{warEnd.preview ? "최종 확정" : "종료 결과 미리보기"}</button>
          </form>
        </div>
      </section>
      <section className="directorate-military__review"><header><span>OPERATIONS ROOM</span><h3>작전 판정 대기열</h3></header>{data.actions.length === 0 ? <p>판정을 기다리는 작전이 없습니다.</p> : data.actions.map((actionRow) => {
        const form = resolution[actionRow.id] ?? BLANK_RESOLUTION;
        const opposing = data.actions.find((row) => row.id !== actionRow.id && row.conflict_id === actionRow.conflict_id && row.front_id === actionRow.front_id);
        return <article key={actionRow.id} className="directorate-military__operation-review"><div className="directorate-military__comparison"><section><small>제출측 · {actionRow.submitted_world_date ?? data.worldDate}</small><h4>{countryName(actionRow.country_key)}</h4><b>{actionRow.title}</b><p>{actionRow.body}</p><span>투입 전력 {actionRow.assignments.length}개</span></section><section>{opposing ? <><small>상대측 제출 작전</small><h4>{countryName(opposing.country_key)}</h4><b>{opposing.title}</b><p>{opposing.body}</p><span>투입 전력 {opposing.assignments.length}개</span></> : <p>같은 전선에서 제출된 상대측 작전이 없습니다.</p>}</section></div><div className="directorate-military__resolution"><select aria-label="작전 결과" value={form.outcome} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, outcome: event.target.value } })}><option value="DECISIVE_SUCCESS">결정적 성공</option><option value="SUCCESS">성공</option><option value="PARTIAL_SUCCESS">부분 성공</option><option value="STALEMATE">교착</option><option value="PARTIAL_FAILURE">부분 실패</option><option value="FAILURE">실패</option><option value="DECISIVE_FAILURE">결정적 실패</option></select><input placeholder="전쟁 보고서 제목" value={form.reportTitle} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, reportTitle: event.target.value } })} /><textarea placeholder="관리자 판정문" value={form.summary} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, summary: event.target.value } })} /><textarea placeholder="공개 보고서 본문" value={form.reportBody} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, reportBody: event.target.value } })} /><div className="directorate-military__losses"><input placeholder="공격측 피해" value={form.attackerLosses} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, attackerLosses: event.target.value } })} /><input placeholder="방어측 피해" value={form.defenderLosses} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, defenderLosses: event.target.value } })} /></div><textarea placeholder='부대 상태 변경 JSON (선택)' value={form.stateChanges} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, stateChanges: event.target.value } })} /><input placeholder="전선·점령 변화 요약" value={form.territorySummary} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, territorySummary: event.target.value } })} /><div className="directorate-military__marker-fields"><input type="number" placeholder="결과 마커 X" value={form.markerX} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, markerX: event.target.value } })} /><input type="number" placeholder="결과 마커 Y" value={form.markerY} onChange={(event) => setResolution({ ...resolution, [actionRow.id]: { ...form, markerY: event.target.value } })} /></div><button type="button" disabled={busy} onClick={() => void resolve(actionRow)}>판정·보고서 확정</button></div></article>;
      })}</section>
    </section>
  );
}
