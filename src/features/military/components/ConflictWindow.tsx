import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { UiIcon } from "../../../components/UiIcon";
import { militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import { fetchMilitaryOverview } from "../militaryClient";
import { militaryLabel } from "../militaryLabels";
import { CommandMap } from "./CommandMap";
import type {
  Conflict,
  ForceKind,
  MilitaryAction,
  MilitaryFront,
  MilitaryOverview,
} from "../types";

function militaryQuery<T>(route: string): Promise<T> {
  return militaryMutation<T>(route, {}, "GET");
}

const CONFLICT_TYPE_LABEL: Record<string, string> = {
  INTERSTATE_WAR: "국가간 전쟁",
  LIMITED_WAR: "제한전",
  BORDER_CONFLICT: "국경 분쟁",
  CIVIL_WAR: "내전",
  INDEPENDENCE_WAR: "독립 전쟁",
  ARMED_UPRISING: "무장 봉기",
};

const CONFLICT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안",
  DECLARED: "선전포고",
  ACTIVE: "교전 중",
  CEASEFIRE: "휴전",
  NEGOTIATING: "협상 중",
  ENDED: "종전",
  CANCELLED: "취소됨",
};

interface DraftState {
  planKind: NonNullable<MilitaryAction["plan_kind"]>;
  geometry: Array<{ x: number; y: number }>;
  title: string;
  body: string;
  frontId: string;
  assignments: Array<{ object_kind: ForceKind | "FLEET"; object_id: string }>;
}

const EMPTY_DRAFT: DraftState = { title: "", body: "", frontId: "", assignments: [], planKind: "OFFENSIVE", geometry: [] };

interface ConflictWindowProps {
  onClose: () => void;
  countryKey: string;
  embedded?: boolean;
}

function ConflictFrame({ embedded, children, onClose }: { embedded?: boolean; children: ReactNode; onClose: () => void }) {
  return embedded ? <section className="conflict-window conflict-window--embedded">{children}</section> : <StrategicWindow title="분쟁 사령부" className="conflict-window" onClose={onClose}>{children}</StrategicWindow>;
}

type FrontDraft = {
  segmentIds?: string[];
  displayName: string;
  frontKind: string;
  geometry: Array<{ x: number; y: number }>;
};

const EMPTY_FRONT_DRAFT: FrontDraft = { displayName: "", frontKind: "LAND_LINE", geometry: [] };

export function ConflictWindow({ onClose, countryKey, embedded }: ConflictWindowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selection, setSelection] = useState<{ kind: string; id: string } | null>(null);
  const drawingOperation = useRef(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [overview, setOverview] = useState<MilitaryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  const [fronts, setFronts] = useState<MilitaryFront[]>([]);
  const [actions, setActions] = useState<MilitaryAction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignmentChoice, setAssignmentChoice] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [frontDraft, setFrontDraft] = useState<FrontDraft>(EMPTY_FRONT_DRAFT);
  const [drawingFront, setDrawingFront] = useState(false);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, forceOverview] = await Promise.all([
        militaryQuery<Conflict[]>(MILITARY_ROUTES.conflicts),
        fetchMilitaryOverview(countryKey),
      ]);
      setConflicts(data);
      setOverview(forceOverview);
      if (data.length > 0) {
        setSelectedConflictId((prev) => prev ?? data[0].id);
      }
    } catch {
      setConflicts([]);
      setOverview(null);
      setSelectedConflictId(null);
      setError("분쟁 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [countryKey]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadConflicts();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadConflicts]);

  const loadDetail = useCallback(async (conflictId: string) => {
    setDetailLoading(true);
    try {
      const [frontData, actionData] = await Promise.all([
        militaryQuery<MilitaryFront[]>(`${MILITARY_ROUTES.fronts}?conflict_id=${conflictId}`),
        militaryQuery<MilitaryAction[]>(`${MILITARY_ROUTES.actions}?conflict_id=${conflictId}`),
      ]);
      setFronts(frontData);
      setActions(actionData);
    } catch {
      setFronts([]);
      setActions([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (selectedConflictId) void loadDetail(selectedConflictId);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedConflictId, loadDetail]);

  useEffect(() => {
    const completeDrawing = (event: Event) => {
      const detail = (event as CustomEvent<{ geometry?: Array<{ x: number; y: number }>; segmentIds?: string[] }>).detail;
      const geometry = detail?.geometry;
      if (geometry && geometry.length >= 2) {
        if (drawingOperation.current) setDraft((current) => ({ ...current, geometry }));
        else setFrontDraft((current) => ({ ...current, geometry, segmentIds: detail.segmentIds }));
      }
      drawingOperation.current = false;
      setDrawingFront(false);
    };
    const cancelDrawing = () => { drawingOperation.current = false; setDrawingFront(false); };
    window.addEventListener("tlr:military-front-draw-complete", completeDrawing);
    window.addEventListener("tlr:military-front-draw-cancel", cancelDrawing);
    return () => {
      window.removeEventListener("tlr:military-front-draw-complete", completeDrawing);
      window.removeEventListener("tlr:military-front-draw-cancel", cancelDrawing);
    };
  }, []);

  useEffect(() => () => {
    window.dispatchEvent(new Event("tlr:military-front-draw-cancel"));
  }, []);

  const selectedConflict = useMemo(
    () => conflicts.find((conflict) => conflict.id === selectedConflictId) ?? null,
    [conflicts, selectedConflictId]
  );

  const resetDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setEditingActionId(null);
  }, []);

  const beginEditDraft = useCallback((action: MilitaryAction) => {
    if (action.status !== "DRAFT") return;
    setEditingActionId(action.id);
    setDraft({
      title: action.title,
      body: action.body,
      frontId: action.front_id ?? "",
      assignments: action.assignments ?? [],
      planKind: action.plan_kind ?? "OFFENSIVE", geometry: action.plan_geometry ?? [],
    });
  }, []);

  const forceOptions = useMemo(() => {
    if (!overview) return [];
    return [
      ...overview.units.map((item) => ({ kind: "LAND_UNIT" as const, id: item.id, name: item.display_name, status: item.status })),
      ...overview.fleets.map((item) => ({ kind: "FLEET" as const, id: item.id, name: item.display_name, status: item.status })),
      ...overview.vessels.map((item) => ({ kind: "VESSEL" as const, id: item.id, name: item.display_name, status: item.status })),
      ...overview.airWings.map((item) => ({ kind: "AIR_WING" as const, id: item.id, name: item.display_name, status: item.status })),
    ].filter((item) => !["SUNK", "RETIRED", "DISBANDED", "DISSOLVED"].includes(item.status));
  }, [overview]);

  const addAssignment = useCallback(() => {
    const selected = forceOptions.find((item) => `${item.kind}:${item.id}` === assignmentChoice);
    if (!selected) return;
    setDraft((prev) => ({
      ...prev,
      assignments: prev.assignments.some((entry) => entry.object_kind === selected.kind && entry.object_id === selected.id)
        ? prev.assignments
        : [...prev.assignments, { object_kind: selected.kind, object_id: selected.id }],
    }));
    setAssignmentChoice("");
  }, [assignmentChoice, forceOptions]);

  const removeAssignment = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      assignments: prev.assignments.filter((_, i) => i !== index),
    }));
  }, []);

  const saveDraft = useCallback(
    async (submit: boolean) => {
      if (!selectedConflict || !draft.title.trim() || !draft.body.trim()) return;
      setSubmitting(true);
      try {
        const payload: Record<string, unknown> = {
          conflict_id: selectedConflict.id,
          country_key: countryKey,
          title: draft.title.trim(),
          body: draft.body.trim(),
          front_id: draft.frontId || null,
          assignments: draft.assignments,
          status: submit ? "SUBMITTED" : "DRAFT",
          plan_kind: draft.planKind, plan_geometry: draft.geometry,
        };
        if (editingActionId) {
          const action = actions.find((item) => item.id === editingActionId);
          await militaryMutation(MILITARY_ROUTES.actions, { id: editingActionId, expected_version: action?.version, ...payload }, "PATCH");
        } else {
          await militaryMutation(MILITARY_ROUTES.actions, payload, "POST");
        }
        resetDraft();
        window.dispatchEvent(new Event("tlr:military-updated"));
        setPreviewOpen(false);
        await loadDetail(selectedConflict.id);
      } catch {
        setError("작전 저장에 실패했다.");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedConflict, draft, editingActionId, countryKey, resetDraft, loadDetail, actions]
  );

  const withdrawAction = useCallback(async (action: MilitaryAction) => {
    try {
      await militaryMutation(MILITARY_ROUTES.actions, { id: action.id, expected_version: action.version, status: "WITHDRAWN" }, "PATCH");
      if (selectedConflict) await loadDetail(selectedConflict.id);
    } catch {
      setError("작전을 철회하지 못했다. 이미 판정이 시작되었는지 확인하라.");
    }
  }, [loadDetail, selectedConflict]);

  const createFront = useCallback(async () => {
    if (!selectedConflict || !frontDraft.displayName.trim()) return;
    const ownSide = selectedConflict.sides?.find((side) => side.participants?.some((participant) => participant.country_key === countryKey));
    const opponentSide = selectedConflict.sides?.find((side) => side.id !== ownSide?.id);
    if (!opponentSide) { setError("상대측을 확인할 수 없어 전선을 만들 수 없다."); return; }
    if (frontDraft.geometry.length < 2) { setError("지도에서 전선 경로를 먼저 지정해야 한다."); return; }
    setSubmitting(true);
    try {
      await militaryMutation(MILITARY_ROUTES.fronts, { conflict_id: selectedConflict.id, opponent_side_id: opponentSide.id, display_name: frontDraft.displayName.trim(), front_kind: frontDraft.frontKind, geometry: frontDraft.geometry, border_segment_ids: frontDraft.segmentIds }, "POST");
      setFrontDraft(EMPTY_FRONT_DRAFT);
      window.dispatchEvent(new Event("tlr:military-updated"));
      await loadDetail(selectedConflict.id);
    } catch { setError("전선 생성에 실패했다. 좌표와 참가 진영을 확인하라."); }
    finally { setSubmitting(false); }
  }, [countryKey, frontDraft, loadDetail, selectedConflict]);

  const selectMapItem = useCallback((kind: string, id: string) => {
    window.dispatchEvent(new CustomEvent("tlr:military-selection", { detail: { kind, id } }));
    const geometry = kind === "front" ? fronts.find((front) => front.id === id)?.geometry : kind === "operation" ? actions.find((action) => action.id === id)?.plan_geometry : undefined;
    if (geometry?.length) window.dispatchEvent(new CustomEvent("tlr:focus-military-front", { detail: { geometry, scope: "headquarters" } }));
  }, [fronts, actions]);
  useEffect(() => {
    const select = (event: Event) => {
      const next = (event as CustomEvent<{ kind: string; id: string }>).detail;
      setSelection(next);
      if (next.kind === "operation") {
        const action = actions.find((item) => item.id === next.id);
        if (action) { beginEditDraft(action); setDetailOpen(true); }
      }
      if (next.kind === "front") setDraft((current) => ({ ...current, frontId: next.id }));
    };
    window.addEventListener("tlr:military-selection", select);
    return () => window.removeEventListener("tlr:military-selection", select);
  }, [actions, beginEditDraft]);
  const drawPlan = (kind: DraftState["planKind"]) => {
    setDraft((current) => ({ ...current, planKind: kind }));
    drawingOperation.current = true;
    setDrawingFront(true);
    setDetailOpen(false);
    window.dispatchEvent(new CustomEvent("tlr:military-front-draw-start", { detail: { scope: "headquarters" } }));
  };

  return (
    <ConflictFrame embedded={embedded} onClose={onClose}>
      <div className="conflict-window__body">
        {loading && (
          <div className="military-window__state">
            <UiIcon name="loader" />
            <span>분쟁 기록 수신 중…</span>
          </div>
        )}
        {!loading && error && (
          <div className="military-window__state military-window__state--error">
            <UiIcon name="warning" />
            <span>{error}</span>
            <button type="button" onClick={() => void loadConflicts()}>다시 시도</button>
          </div>
        )}
        {!loading && !error && conflicts.length === 0 && (
          <div className="hq-peace-map"><p>현재 진행 중인 전쟁이 없습니다.</p><CommandMap countryKey={countryKey} /></div>
        )}

        {!loading && !error && conflicts.length > 0 && (
          <div className="conflict-window__layout">
            <aside className="conflict-window__list">
              <h3>현재 전쟁 / 전선</h3>
              {conflicts.map((conflict) => (
                <button
                  key={conflict.id}
                  type="button"
                  className={
                    "conflict-window__list-item" +
                    (conflict.id === selectedConflictId ? " conflict-window__list-item--active" : "")
                  }
                  onClick={() => { setSelectedConflictId(conflict.id); setDetailOpen(true); }}
                >
                  <span className="conflict-window__list-name">{conflict.display_name}</span>
                  <span className="conflict-window__list-meta">
                    {CONFLICT_TYPE_LABEL[conflict.conflict_type] ?? conflict.conflict_type} ·{" "}
                    {CONFLICT_STATUS_LABEL[conflict.status] ?? conflict.status}
                  </span>
                </button>
              ))}
              <h4>전선</h4>
              {fronts.map((front) => <button type="button" className="hq-row" key={front.id} aria-pressed={selection?.kind === "front" && selection.id === front.id} onClick={() => selectMapItem("front", front.id)}>{front.display_name}</button>)}
              {!fronts.length && <p>등록된 전선 없음</p>}
              <h4>배치 사단</h4>
              {overview?.units.filter((unit) => !["DISBANDED", "DESTROYED"].includes(unit.status) && (!selection || selection.kind !== "front" || unit.assigned_front_id === selection.id)).map((unit) => <button type="button" key={unit.id} className="hq-row" aria-pressed={selection?.kind === "unit" && selection.id === unit.id} onClick={() => selectMapItem("unit", unit.id)}><img src="/assets/ui/icons/military/army-map.svg" alt="" /><span>{unit.display_name}<small>{militaryLabel(unit.status)}</small></span></button>)}
              <h4>작전</h4>
              {actions.map((action) => <button type="button" key={action.id} className="hq-row" aria-pressed={selection?.kind === "operation" && selection.id === action.id} onClick={() => selectMapItem("operation", action.id)}>{action.title}</button>)}
              <button type="button" onClick={() => setDetailOpen(true)}>전선·작전 관리</button>
            </aside>

            <CommandMap countryKey={countryKey} />
            <section className="conflict-window__detail" hidden={!detailOpen || drawingFront}>
              <button type="button" className="hq-detail-close" aria-label="상세 닫기" onClick={() => setDetailOpen(false)}>×</button>
              {selectedConflict && (
                <>
                  <header className="conflict-window__detail-header">
                    <h3>{selectedConflict.display_name}</h3>
                    <span>{CONFLICT_STATUS_LABEL[selectedConflict.status] ?? selectedConflict.status}</span>
                  </header>
                  {selection?.kind === "operation" && actions.filter((action) => action.id === selection.id).map((action) => <section className="hq-selected-operation" key={action.id}><h4>{action.title}</h4><p>{militaryLabel(action.status)}</p><p style={{whiteSpace:"pre-wrap"}}>{action.body}</p><p>배속 전력: {action.assignments?.length ?? 0}개</p></section>)}

                  <div className="conflict-window__sides">
                    {(selectedConflict.sides ?? []).map((side) => (
                      <div key={side.id} className="conflict-window__side">
                        <h4>{side.display_name}</h4>
                        <ul>
                          {(side.participants ?? []).map((participant) => (
                            <li key={participant.id}>
                              {participant.country_key ?? participant.internal_actor_id ?? "미상"} —{" "}
                              {militaryLabel(participant.role)}
                            </li>
                          ))}
                          {(side.participants ?? []).length === 0 && (
                            <li className="military-window__empty">참가자 없음</li>
                          )}
                        </ul>
                      </div>
                    ))}
                    {(selectedConflict.sides ?? []).length === 0 && (
                      <p className="military-window__empty">등록된 진영이 없다.</p>
                    )}
                  </div>

                  {detailLoading ? (
                    <div className="military-window__state">
                      <UiIcon name="loader" />
                      <span>전선·작전 수신 중…</span>
                    </div>
                  ) : (
                    <>
                      <h4 className="military-window__section-title">전선</h4>
                      {fronts.length === 0 ? (
                        <p className="military-window__empty">등록된 전선이 없다.</p>
                      ) : (
                        <ul className="military-front-list">
                          {fronts.map((front) => (
                            <li key={front.id} className="military-front-item">
                              <span
                                className={
                                  "military-front-item__kind military-front-item__kind--" +
                                  front.front_kind.toLowerCase()
                                }
                              >
                                {front.front_kind === "LAND_LINE" ? "지상전선" : "해상구역"}
                              </span>
                              <span className="military-front-item__name">{front.display_name}</span>
                              <span className="military-front-item__status">{militaryLabel(front.status)}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <details className="conflict-window__front-builder">
                        <summary>새 전선 생성</summary>
                        <label className="conflict-window__field"><span>전선명</span><input value={frontDraft.displayName} onChange={(event) => setFrontDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
                        <label className="conflict-window__field"><span>유형</span><select value={frontDraft.frontKind} onChange={(event) => setFrontDraft((current) => ({ ...current, frontKind: event.target.value }))}><option value="LAND_LINE">육상 전선</option><option value="NAVAL_AREA">해상 지원구역</option></select></label>
                        <div className="conflict-window__map-picker">
                          <span>전선 경로</span>
                          <button
                            type="button"
                            className={drawingFront ? "is-active" : ""}
                            onClick={() => {
                              setDrawingFront(true);
                              drawingOperation.current = false;
                              const ownSide = selectedConflict?.sides?.find((side) => side.participants?.some((p) => p.country_key === countryKey));
                              const ids = (sideIds: string[]) => sideIds.map((key) => Number(key.replace("country-", "")));
                              window.dispatchEvent(new CustomEvent("tlr:military-front-draw-start", { detail: frontDraft.frontKind === "LAND_LINE" ? { scope: "headquarters", borderCountries: {
                                friendly: ids(ownSide?.participants?.flatMap((p) => p.country_key ? [p.country_key] : []) ?? []),
                                hostile: ids(selectedConflict?.sides?.filter((side) => side.id !== ownSide?.id).flatMap((side) => side.participants?.flatMap((p) => p.country_key ? [p.country_key] : []) ?? []) ?? []),
                              } } : { scope: "headquarters" } }));
                            }}
                          >
                            <UiIcon name="map" />
                            {drawingFront ? "지도에서 지정 중" : "지도에서 경로 지정"}
                          </button>
                          <small>{frontDraft.geometry.length >= 2 ? `${frontDraft.geometry.length}개 통제점이 지정되었습니다.` : "지도 위의 경로를 순서대로 클릭하십시오."}</small>
                        </div>
                        <button type="button" disabled={submitting || frontDraft.geometry.length < 2} onClick={() => void createFront()}>전선 생성</button>
                      </details>

                      <h4 className="military-window__section-title">작전</h4>
                      {actions.length === 0 ? (
                        <p className="military-window__empty">접수된 작전이 없다.</p>
                      ) : (
                        <ul className="military-action-list">
                          {actions.map((action) => (
                            <li key={action.id} className="military-action-item">
                              <span
                                className={
                                  "military-action-item__status military-action-item__status--" +
                                  action.status.toLowerCase()
                                }
                              >
                                {militaryLabel(action.status)}
                              </span>
                              <span className="military-action-item__title">{action.title}</span>
                              {action.status === "DRAFT" && (
                                <button
                                  type="button"
                                  className="military-action-item__edit"
                                  onClick={() => beginEditDraft(action)}
                                >
                                  편집
                                </button>
                              )}
                              {action.status !== "DRAFT" && (
                                <span className="military-action-item__locked">
                                  <UiIcon name="lock" /> 제출 후 수정 불가
                                </span>
                              )}
                              {action.status === "SUBMITTED" ? <button type="button" className="military-action-item__withdraw" onClick={() => void withdrawAction(action)}>철회</button> : null}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="conflict-window__draft">
                        <h4 className="military-window__section-title">작전 초안 작성</h4>
                        <label className="conflict-window__field">
                          <span>제목</span>
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                          />
                        </label>
                        <label className="conflict-window__field">
                          <span>본문</span>
                          <textarea
                            value={draft.body}
                            rows={4}
                            onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                          />
                        </label>
                        <label className="conflict-window__field">
                          <span>전선</span>
                          <select
                            value={draft.frontId}
                            onChange={(e) => setDraft((prev) => ({ ...prev, frontId: e.target.value }))}
                          >
                            <option value="">전선 미지정</option>
                            {fronts.map((front) => (
                              <option key={front.id} value={front.id}>
                                {front.display_name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="conflict-window__field"><span>지도 작전 유형</span><select value={draft.planKind} onChange={(event) => setDraft((current) => ({ ...current, planKind: event.target.value as DraftState["planKind"] }))}><option value="OFFENSIVE">공세</option><option value="DEFENSIVE">방어선</option><option value="OBJECTIVE">목표선</option><option value="WITHDRAWAL">철수선</option><option value="AMPHIBIOUS">상륙 계획</option></select></label>
                        <button type="button" onClick={() => drawPlan(draft.planKind)}>지도에서 작전선 그리기</button><span> {draft.geometry.length}개 지점</span><button type="button" onClick={() => setDraft((current) => ({ ...current, geometry: [] }))}>작전선 지우기</button>
                        <div className="conflict-window__assignments">
                          <span>배속 병력</span>
                          <ul>
                            {draft.assignments.map((assignment, index) => (
                              <li key={`${assignment.object_kind}-${assignment.object_id}-${index}`}>
                                {forceOptions.find((item) => item.kind === assignment.object_kind && item.id === assignment.object_id)?.name ?? "배속 전력"}
                                <button type="button" onClick={() => removeAssignment(index)}>
                                  <UiIcon name="close" />
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className="conflict-window__assignment-input">
                            <select
                              value={assignmentChoice}
                              onChange={(event) => setAssignmentChoice(event.target.value)}
                            >
                              <option value="">보유 전력 선택</option>
                              {forceOptions.map((item) => (
                                <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>
                                  {item.name} · {militaryLabel(item.status)}
                                </option>
                              ))}
                            </select>
                            <button type="button" disabled={!assignmentChoice} onClick={addAssignment}>
                              추가
                            </button>
                          </div>
                        </div>

                        <div className="conflict-window__draft-actions">
                          <button
                            type="button"
                            disabled={submitting || !draft.title.trim() || !draft.body.trim()}
                            onClick={() => void saveDraft(false)}
                          >
                            초안 저장
                          </button>
                          <button
                            type="button"
                            className="conflict-window__draft-actions--submit"
                            disabled={submitting || !draft.title.trim() || !draft.body.trim()}
                            onClick={() => setPreviewOpen(true)}
                          >
                            제출
                          </button>
                          {editingActionId && (
                            <button type="button" onClick={resetDraft}>
                              취소
                            </button>
                          )}
                        </div>
                      </div>
                      {previewOpen ? (
                        <div className="operation-submit-preview" role="dialog" aria-modal="true" aria-label="작전 제출 미리보기">
                          <section>
                            <header><span>OPERATION ORDER</span><h4>작전 제출 확인</h4></header>
                            <dl>
                              <div><dt>작전명</dt><dd>{draft.title}</dd></div>
                              <div><dt>전선</dt><dd>{fronts.find((front) => front.id === draft.frontId)?.display_name ?? "미지정"}</dd></div>
                              <div><dt>육군</dt><dd>{draft.assignments.filter((item) => item.object_kind === "LAND_UNIT").length}개 편성</dd></div>
                              <div><dt>함대</dt><dd>{draft.assignments.filter((item) => item.object_kind === "FLEET" || item.object_kind === "VESSEL").length}개</dd></div>
                              <div><dt>항공대</dt><dd>{draft.assignments.filter((item) => item.object_kind === "AIR_WING").length}개</dd></div>
                            </dl>
                            <p>제출 후에는 수정할 수 없으며 관리자 판정 전까지 철회만 가능합니다.</p>
                            <footer><button type="button" onClick={() => setPreviewOpen(false)}>취소</button><button type="button" className="operation-submit-preview__confirm" disabled={submitting} onClick={() => void saveDraft(true)}>관리자에게 제출</button></footer>
                          </section>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </section>
            <div className="hq-plan-palette" aria-label="전투 계획">
              <strong>전투 계획</strong><div>
                <button type="button" title="전선 — 전선 관리에서 접경 지역을 지정합니다" onClick={() => setDetailOpen(true)}><img src="/assets/ui/icons/military/army-map.svg" alt="" /><span>전선</span></button>
                <button type="button" title="방어선 — 시작점, 경유점, 목표점을 지정합니다" onClick={() => drawPlan("DEFENSIVE")}><img src="/assets/ui/icons/intelligence/defense.svg" alt="" /><span>방어</span></button>
                <button type="button" title="공세 — 지도에서 공세 경로를 작성합니다" onClick={() => drawPlan("OFFENSIVE")}><img src="/assets/ui/icons/intelligence/operation.svg" alt="" /><span>공세</span></button>
                <button type="button" title="목표선 — 작전의 목표 경로를 지정합니다" onClick={() => drawPlan("OBJECTIVE")}><img src="/assets/ui/icons/military/air-map.svg" alt="" /><span>목표</span></button>
                <button type="button" title="현재 초안의 작전선 삭제 — 저장된 작전은 변경하지 않습니다" onClick={() => { setDraft((current) => ({ ...current, geometry: [] })); window.dispatchEvent(new Event("tlr:military-front-draw-cancel")); }}><span>×</span><span>삭제</span></button>
                <button type="button" title="초안 확인 및 제출" onClick={() => setDetailOpen(true)}>초안<br />확인</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConflictFrame>
  );
}
