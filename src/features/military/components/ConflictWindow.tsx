import { useCallback, useEffect, useMemo, useState } from "react";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { UiIcon } from "../../../components/UiIcon";
import { militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import type {
  Conflict,
  ForceKind,
  MilitaryAction,
  MilitaryFront,
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
  title: string;
  body: string;
  frontId: string;
  assignments: Array<{ object_kind: ForceKind | "FLEET"; object_id: string }>;
}

const EMPTY_DRAFT: DraftState = { title: "", body: "", frontId: "", assignments: [] };

interface ConflictWindowProps {
  onClose: () => void;
  countryKey: string;
}

export function ConflictWindow({ onClose, countryKey }: ConflictWindowProps) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);

  const [fronts, setFronts] = useState<MilitaryFront[]>([]);
  const [actions, setActions] = useState<MilitaryAction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignInput, setAssignInput] = useState({ kind: "LAND_UNIT" as ForceKind | "FLEET", id: "" });

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await militaryQuery<Conflict[]>(MILITARY_ROUTES.conflicts);
      setConflicts(data);
      if (data.length > 0) {
        setSelectedConflictId((prev) => prev ?? data[0].id);
      }
    } catch {
      setError("분쟁 목록을 불러오지 못했다.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    });
  }, []);

  const addAssignment = useCallback(() => {
    if (!assignInput.id.trim()) return;
    setDraft((prev) => ({
      ...prev,
      assignments: [...prev.assignments, { object_kind: assignInput.kind, object_id: assignInput.id.trim() }],
    }));
    setAssignInput((prev) => ({ ...prev, id: "" }));
  }, [assignInput]);

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
        };
        if (editingActionId) {
          await militaryMutation(MILITARY_ROUTES.actions, { id: editingActionId, ...payload }, "PATCH");
        } else {
          await militaryMutation(MILITARY_ROUTES.actions, payload, "POST");
        }
        resetDraft();
        await loadDetail(selectedConflict.id);
      } catch {
        setError("작전 저장에 실패했다.");
      } finally {
        setSubmitting(false);
      }
    },
    [selectedConflict, draft, editingActionId, countryKey, resetDraft, loadDetail]
  );

  const actions_ = (
    <button type="button" className="strategic-window__action" onClick={onClose}>
      <UiIcon name="close" />
      <span>닫기</span>
    </button>
  );

  return (
    <StrategicWindow
      title="분쟁 사령부"
      eyebrow="CONFLICT COMMAND"
      actions={actions_}
      className="conflict-window"
      onClose={onClose}
    >
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
          </div>
        )}
        {!loading && !error && conflicts.length === 0 && (
          <p className="military-window__empty">등록된 분쟁이 없다.</p>
        )}

        {!loading && !error && conflicts.length > 0 && (
          <div className="conflict-window__layout">
            <aside className="conflict-window__list">
              {conflicts.map((conflict) => (
                <button
                  key={conflict.id}
                  type="button"
                  className={
                    "conflict-window__list-item" +
                    (conflict.id === selectedConflictId ? " conflict-window__list-item--active" : "")
                  }
                  onClick={() => setSelectedConflictId(conflict.id)}
                >
                  <span className="conflict-window__list-name">{conflict.display_name}</span>
                  <span className="conflict-window__list-meta">
                    {CONFLICT_TYPE_LABEL[conflict.conflict_type] ?? conflict.conflict_type} ·{" "}
                    {CONFLICT_STATUS_LABEL[conflict.status] ?? conflict.status}
                  </span>
                </button>
              ))}
            </aside>

            <section className="conflict-window__detail">
              {selectedConflict && (
                <>
                  <header className="conflict-window__detail-header">
                    <h3>{selectedConflict.display_name}</h3>
                    <span>{CONFLICT_STATUS_LABEL[selectedConflict.status] ?? selectedConflict.status}</span>
                  </header>

                  <div className="conflict-window__sides">
                    {(selectedConflict.sides ?? []).map((side) => (
                      <div key={side.id} className="conflict-window__side">
                        <h4>{side.display_name}</h4>
                        <ul>
                          {(side.participants ?? []).map((participant) => (
                            <li key={participant.id}>
                              {participant.country_key ?? participant.internal_actor_id ?? "미상"} —{" "}
                              {participant.role}
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
                              <span className="military-front-item__status">{front.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}

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
                                {action.status}
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

                        <div className="conflict-window__assignments">
                          <span>배속 병력</span>
                          <ul>
                            {draft.assignments.map((assignment, index) => (
                              <li key={`${assignment.object_kind}-${assignment.object_id}-${index}`}>
                                {assignment.object_kind} · {assignment.object_id}
                                <button type="button" onClick={() => removeAssignment(index)}>
                                  <UiIcon name="close" />
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className="conflict-window__assignment-input">
                            <select
                              value={assignInput.kind}
                              onChange={(e) =>
                                setAssignInput((prev) => ({
                                  ...prev,
                                  kind: e.target.value as ForceKind | "FLEET",
                                }))
                              }
                            >
                              <option value="LAND_UNIT">사단</option>
                              <option value="VESSEL">함선</option>
                              <option value="FLEET">함대</option>
                              <option value="AIR_WING">비행단</option>
                            </select>
                            <input
                              type="text"
                              placeholder="개체 ID"
                              value={assignInput.id}
                              onChange={(e) => setAssignInput((prev) => ({ ...prev, id: e.target.value }))}
                            />
                            <button type="button" onClick={addAssignment}>
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
                            onClick={() => void saveDraft(true)}
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
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </StrategicWindow>
  );
}
