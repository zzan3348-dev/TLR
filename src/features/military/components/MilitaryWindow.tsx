import { useCallback, useEffect, useMemo, useState } from "react";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { UiIcon } from "../../../components/UiIcon";
import { fetchMilitaryOverview, MilitaryApiError, militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import { ConflictWindow } from "./ConflictWindow";
import { WarReportWindow } from "./WarReportWindow";
import { OfficerCorpsPanel } from "./OfficerCorpsPanel";
import { militaryLabel } from "../militaryLabels";
import type {
  AirWing,
  ConfigurationStatus,
  Fleet,
  LandUnit,
  MilitaryAction,
  MilitaryFront,
  MilitaryOverview,
  MilitaryTemplate,
  Vessel,
} from "../types";

type MilitaryTab = "overview" | "thought" | "army" | "navy" | "airforce" | "production" | "fronts" | "actions";

const TABS: Array<{ key: MilitaryTab; label: string }> = [
  { key: "overview", label: "군사 개요" },
  { key: "thought", label: "군사사상" },
  { key: "army", label: "육군" },
  { key: "navy", label: "해군" },
  { key: "airforce", label: "공군" },
  { key: "production", label: "편성·건조" },
  { key: "fronts", label: "전선" },
  { key: "actions", label: "작전" },
];

const READINESS_LABEL: Record<ConfigurationStatus, string> = {
  UNCONFIGURED: "미설정",
  PARTIAL: "부분 설정",
  READY: "가동 가능",
  DISABLED: "비활성화",
};

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("ko-KR");
}

function militaryQuery<T>(route: string): Promise<T> {
  return militaryMutation<T>(route, {}, "GET");
}

function emptyMilitaryOverview(countryKey: string): MilitaryOverview {
  return {
    countryKey,
    worldDate: "1932-01-01",
    readiness: "UNCONFIGURED",
    reasons: ["군사 데이터 입력 대기"],
    manpower: { available: null, reserved: 0 },
    productionCapacity: { available: null, reserved: 0 },
    templates: [],
    units: [],
    vessels: [],
    fleets: [],
    airWings: [],
    queues: [],
    conflicts: [],
  };
}

interface MilitaryWindowProps {
  countryKey: string;
  onClose: () => void;
}

export function MilitaryWindow({ countryKey, onClose }: MilitaryWindowProps) {
  const [subWindow, setSubWindow] = useState<"conflicts" | "reports" | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MilitaryTab>("overview");
  const [overview, setOverview] = useState<MilitaryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingForm, setPendingForm] = useState<string | null>(null);
  const [formationNames, setFormationNames] = useState<Record<string, string>>({});

  const [frontsByConflict, setFrontsByConflict] = useState<Record<string, MilitaryFront[]>>({});
  const [frontsLoading, setFrontsLoading] = useState(false);
  const [actionsByConflict, setActionsByConflict] = useState<Record<string, MilitaryAction[]>>({});
  const [actionsLoading, setActionsLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMilitaryOverview(countryKey);
      setOverview(data);
    } catch (requestError) {
      if (
        requestError instanceof MilitaryApiError &&
        requestError.code === "MILITARY_SERVER_NOT_CONFIGURED"
      ) {
        setOverview(emptyMilitaryOverview(countryKey));
        setError(null);
      } else {
        setError("군사 개요를 불러오지 못했다. 통신선을 확인하라.");
      }
    } finally {
      setLoading(false);
    }
  }, [countryKey]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadOverview();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadOverview]);

  useEffect(() => {
    const openReport = (event: Event) => {
      const reportId = (event as CustomEvent<{ reportId?: string }>).detail?.reportId ?? null;
      setSelectedReportId(reportId);
      setSubWindow("reports");
    };
    window.addEventListener("tlr:open-war-report", openReport);
    return () => window.removeEventListener("tlr:open-war-report", openReport);
  }, []);

  useEffect(() => {
    if (activeTab !== "fronts" || !overview) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFrontsLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      const entries = await Promise.all(
        overview.conflicts.map(async (conflict) => {
          try {
            const fronts = await militaryQuery<MilitaryFront[]>(
              `${MILITARY_ROUTES.fronts}?conflict_id=${conflict.id}`
            );
            return [conflict.id, fronts] as const;
          } catch {
            return [conflict.id, []] as const;
          }
        })
      );
      if (!cancelled) {
        setFrontsByConflict(Object.fromEntries(entries));
        setFrontsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, overview]);

  useEffect(() => {
    if (activeTab !== "actions" || !overview) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setActionsLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      const entries = await Promise.all(
        overview.conflicts.map(async (conflict) => {
          try {
            const actions = await militaryQuery<MilitaryAction[]>(
              `${MILITARY_ROUTES.actions}?conflict_id=${conflict.id}`
            );
            return [conflict.id, actions] as const;
          } catch {
            return [conflict.id, []] as const;
          }
        })
      );
      if (!cancelled) {
        setActionsByConflict(Object.fromEntries(entries));
        setActionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, overview]);

  const templatesByKind = useMemo(() => {
    const map: Record<string, MilitaryTemplate[]> = { LAND_UNIT: [], VESSEL: [], AIR_WING: [] };
    (overview?.templates ?? []).forEach((template) => {
      map[template.force_kind]?.push(template);
    });
    return map;
  }, [overview]);

  const handleForm = useCallback(
    async (template: MilitaryTemplate, requestedName: string) => {
      if (!overview || overview.readiness === "DISABLED") return;
      if (template.configuration_status !== "READY") return;
      setPendingForm(template.id);
      try {
        await militaryMutation(
          MILITARY_ROUTES.forces,
          { template_id: template.id, display_name: requestedName.trim() || template.display_name, idempotency_key: crypto.randomUUID() },
          "POST"
        );
        await loadOverview();
      } catch {
        setError("양성/건조 요청이 실패했다. 인력·생산력 배정을 확인하라.");
      } finally {
        setPendingForm(null);
      }
    },
    [overview, loadOverview]
  );

  if (subWindow === "conflicts") {
    return (
      <ConflictWindow
        countryKey={countryKey}
        onClose={() => setSubWindow(null)}
      />
    );
  }

  if (subWindow === "reports") {
    return <WarReportWindow initialReportId={selectedReportId} onClose={() => { setSelectedReportId(null); setSubWindow(null); }} />;
  }

  const actions = (
    <>
      <button
        type="button"
        className="strategic-window__action"
        onClick={() => setSubWindow("conflicts")}
      >
        <UiIcon name="menu/diplomacy" />
        <span>분쟁 관제</span>
      </button>
      <button
        type="button"
        className="strategic-window__action"
        onClick={() => setSubWindow("reports")}
      >
        <UiIcon name="menu/decisions" />
        <span>전쟁 보고서</span>
      </button>
      <button type="button" className="strategic-window__action" onClick={onClose}>
        <UiIcon name="ui/close" />
        <span>닫기</span>
      </button>
    </>
  );

  return (
    <StrategicWindow
      title="군사 사령부"
      eyebrow="MILITARY COMMAND"
      actions={actions}
      className="military-window"
      onClose={onClose}
    >
      <nav className="military-window__tabs" aria-label="군사 사령부 탭">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={
              "military-window__tab" +
              (activeTab === tab.key ? " military-window__tab--active" : "")
            }
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="military-window__body">
        {loading && (
          <div className="military-window__state">
            <UiIcon name="loader" />
            <span>사령부 회선 접속 중…</span>
          </div>
        )}

        {!loading && error && (
          <div className="military-window__state military-window__state--error">
            <UiIcon name="warning" />
            <span>{error}</span>
            <button type="button" className="military-window__retry" onClick={() => void loadOverview()}>
              재시도
            </button>
          </div>
        )}

        {!loading && !error && overview && (
          <>
            {overview.readiness !== "READY" && (
              <div
                className={
                  "military-window__readiness-banner military-window__readiness-banner--" +
                  overview.readiness.toLowerCase()
                }
              >
                <UiIcon name="warning" />
                <div>
                  <strong>{READINESS_LABEL[overview.readiness]}</strong>
                  {overview.reasons.length > 0 && (
                    <ul>
                      {overview.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === "overview" && <OverviewTab overview={overview} />}
            {activeTab === "thought" && <OfficerCorpsPanel countryKey={countryKey} />}
            {activeTab === "army" && (
              <ForceListTab
                title="육군 편제"
                templates={templatesByKind.LAND_UNIT}
                pendingForm={pendingForm}
                disabled={overview.readiness === "DISABLED"}
                formationNames={formationNames}
                onNameChange={(templateId, value) => setFormationNames((current) => ({ ...current, [templateId]: value }))}
                onForm={handleForm}
              >
                <LandUnitTable units={overview.units} />
              </ForceListTab>
            )}
            {activeTab === "navy" && (
              <ForceListTab
                title="해군 편제"
                templates={templatesByKind.VESSEL}
                pendingForm={pendingForm}
                disabled={overview.readiness === "DISABLED"}
                formationNames={formationNames}
                onNameChange={(templateId, value) => setFormationNames((current) => ({ ...current, [templateId]: value }))}
                onForm={handleForm}
              >
                <FleetTable fleets={overview.fleets} vessels={overview.vessels} />
              </ForceListTab>
            )}
            {activeTab === "airforce" && (
              <ForceListTab
                title="공군 편제"
                templates={templatesByKind.AIR_WING}
                pendingForm={pendingForm}
                disabled={overview.readiness === "DISABLED"}
                formationNames={formationNames}
                onNameChange={(templateId, value) => setFormationNames((current) => ({ ...current, [templateId]: value }))}
                onForm={handleForm}
              >
                <AirWingTable wings={overview.airWings} />
              </ForceListTab>
            )}
            {activeTab === "production" && <ProductionTab overview={overview} />}
            {activeTab === "fronts" && (
              <FrontsTab
                overview={overview}
                frontsByConflict={frontsByConflict}
                loading={frontsLoading}
              />
            )}
            {activeTab === "actions" && (
              <ActionsTab
                overview={overview}
                actionsByConflict={actionsByConflict}
                loading={actionsLoading}
              />
            )}
          </>
        )}
      </div>
    </StrategicWindow>
  );
}

function OverviewTab({ overview }: { overview: MilitaryOverview }) {
  return (
    <div className="military-overview">
      <div className="military-overview__grid">
        <div className="military-overview__stat">
          <span className="military-overview__stat-label">세계 날짜</span>
          <span className="military-overview__stat-value">{overview.worldDate}</span>
        </div>
        <div className="military-overview__stat">
          <span className="military-overview__stat-label">가용 인력</span>
          <span className="military-overview__stat-value">
            {formatNumber(overview.manpower.available)}
          </span>
        </div>
        <div className="military-overview__stat">
          <span className="military-overview__stat-label">예약 인력</span>
          <span className="military-overview__stat-value">
            {formatNumber(overview.manpower.reserved)}
          </span>
        </div>
        <div className="military-overview__stat">
          <span className="military-overview__stat-label">가용 생산력</span>
          <span className="military-overview__stat-value">
            {formatNumber(overview.productionCapacity.available)}
          </span>
        </div>
        <div className="military-overview__stat">
          <span className="military-overview__stat-label">예약 생산력</span>
          <span className="military-overview__stat-value">
            {formatNumber(overview.productionCapacity.reserved)}
          </span>
        </div>
        <div className="military-overview__stat">
          <span className="military-overview__stat-label">준비 상태</span>
          <span className="military-overview__stat-value">
            {READINESS_LABEL[overview.readiness]}
          </span>
        </div>
      </div>

      <div className="military-overview__conflicts">
        <h3 className="military-window__section-title">진행 중 분쟁</h3>
        {overview.conflicts.length === 0 ? (
          <p className="military-window__empty">등록된 분쟁이 없다.</p>
        ) : (
          <ul className="military-overview__conflict-list">
            {overview.conflicts.map((conflict) => (
              <li key={conflict.id} className="military-overview__conflict-item">
                <span className="military-overview__conflict-name">{conflict.display_name}</span>
                <span className="military-overview__conflict-status">{militaryLabel(conflict.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ForceListTab({
  title,
  templates,
  pendingForm,
  disabled,
  formationNames,
  onNameChange,
  onForm,
  children,
}: {
  title: string;
  templates: MilitaryTemplate[];
  pendingForm: string | null;
  disabled: boolean;
  formationNames: Record<string, string>;
  onNameChange: (templateId: string, value: string) => void;
  onForm: (template: MilitaryTemplate, requestedName: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="military-force-tab">
      <h3 className="military-window__section-title">{title}</h3>

      <div className="military-force-tab__templates">
        {templates.length === 0 ? (
          <p className="military-window__empty">등록된 편제 템플릿이 없다.</p>
        ) : (
          templates.map((template) => {
            const canForm = !disabled && template.configuration_status === "READY";
            return (
              <div key={template.id} className="military-template-card">
                <div className="military-template-card__header">
                  <span>{template.display_name}</span>
                  {template.configuration_status !== "READY" && (
                    <span
                      className={
                        "military-template-card__badge military-template-card__badge--" +
                        template.configuration_status.toLowerCase()
                      }
                    >
                      {READINESS_LABEL[template.configuration_status]}
                    </span>
                  )}
                </div>
                <div className="military-template-card__meta">
                  {template.manpower_required !== null && (
                    <span>인력 {formatNumber(template.manpower_required)}</span>
                  )}
                  {template.crew_required !== null && (
                    <span>승조원 {formatNumber(template.crew_required)}</span>
                  )}
                  {template.production_capacity_required !== null && (
                    <span>생산력 {formatNumber(template.production_capacity_required)}</span>
                  )}
                  {template.formation_days !== null && (
                    <span>편성 {template.formation_days}일</span>
                  )}
                </div>
                <label className="military-template-card__name-field">
                  <span>편성 명칭</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={formationNames[template.id] ?? template.display_name}
                    onChange={(event) => onNameChange(template.id, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="military-template-card__form-button"
                  disabled={!canForm || pendingForm === template.id}
                  onClick={() => onForm(template, formationNames[template.id] ?? template.display_name)}
                >
                  {pendingForm === template.id ? "요청 중…" : "양성/건조 명령"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="military-force-tab__roster">{children}</div>
    </div>
  );
}

function LandUnitTable({ units }: { units: LandUnit[] }) {
  if (units.length === 0) {
    return <p className="military-window__empty">배속된 사단이 없다.</p>;
  }
  return (
    <table className="military-roster-table">
      <thead>
        <tr>
          <th>사단명</th>
          <th>상태</th>
          <th>인력</th>
          <th>훈련도</th>
          <th>장비 상태</th>
          <th>배속 전선</th>
        </tr>
      </thead>
      <tbody>
        {units.map((unit) => (
          <tr key={unit.id}>
            <td>{unit.display_name}</td>
            <td>{militaryLabel(unit.status)}</td>
            <td>
              {formatNumber(unit.current_manpower)} / {formatNumber(unit.max_manpower)}
            </td>
            <td>{unit.training_level === null ? "—" : `${unit.training_level}%`}</td>
            <td>{unit.equipment_readiness === null ? "—" : `${unit.equipment_readiness}%`}</td>
            <td>{unit.assigned_front_id ?? "미배속"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FleetTable({ fleets, vessels }: { fleets: Fleet[]; vessels: Vessel[] }) {
  const unassigned = vessels.filter((vessel) => !vessel.fleet_id);
  return (
    <div className="military-fleet-list">
      {fleets.length === 0 && unassigned.length === 0 && (
        <p className="military-window__empty">보유 함대·함선이 없다.</p>
      )}
      {fleets.map((fleet) => (
        <div key={fleet.id} className="military-fleet-card">
          <div className="military-fleet-card__header">
            <span>{fleet.display_name}</span>
            <span>{militaryLabel(fleet.status)}</span>
          </div>
          <table className="military-roster-table">
            <thead>
              <tr>
                <th>함선명</th>
                <th>상태</th>
                <th>배속 전선</th>
              </tr>
            </thead>
            <tbody>
              {(fleet.vessels ?? vessels.filter((v) => v.fleet_id === fleet.id)).map((vessel) => (
                <tr key={vessel.id}>
                  <td>{vessel.display_name}</td>
                  <td>{militaryLabel(vessel.status)}</td>
                  <td>{vessel.assigned_front_id ?? "미배속"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {unassigned.length > 0 && (
        <div className="military-fleet-card">
          <div className="military-fleet-card__header">
            <span>미편성 함선</span>
          </div>
          <table className="military-roster-table">
            <thead>
              <tr>
                <th>함선명</th>
                <th>상태</th>
                <th>배속 전선</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((vessel) => (
                <tr key={vessel.id}>
                  <td>{vessel.display_name}</td>
                  <td>{militaryLabel(vessel.status)}</td>
                  <td>{vessel.assigned_front_id ?? "미배속"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AirWingTable({ wings }: { wings: AirWing[] }) {
  if (wings.length === 0) {
    return <p className="military-window__empty">편성된 비행단이 없다.</p>;
  }
  return (
    <table className="military-roster-table">
      <thead>
        <tr>
          <th>비행단명</th>
          <th>상태</th>
          <th>인원</th>
          <th>훈련도</th>
          <th>준비도</th>
          <th>배속 전선</th>
        </tr>
      </thead>
      <tbody>
        {wings.map((wing) => (
          <tr key={wing.id}>
            <td>{wing.display_name}</td>
            <td>{militaryLabel(wing.status)}</td>
            <td>
              {formatNumber(wing.current_personnel)} / {formatNumber(wing.max_personnel)}
            </td>
            <td>{wing.training_level === null ? "—" : `${wing.training_level}%`}</td>
            <td>{wing.readiness === null ? "—" : `${wing.readiness}%`}</td>
            <td>{wing.assigned_front_id ?? "미배속"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FrontsTab({
  overview,
  frontsByConflict,
  loading,
}: {
  overview: MilitaryOverview;
  frontsByConflict: Record<string, MilitaryFront[]>;
  loading: boolean;
}) {
  if (overview.conflicts.length === 0) {
    return <p className="military-window__empty">등록된 분쟁이 없어 전선 정보가 없다.</p>;
  }
  return (
    <div className="military-fronts-tab">
      {loading && (
        <div className="military-window__state">
          <UiIcon name="loader" />
          <span>전선 정보 수신 중…</span>
        </div>
      )}
      {!loading &&
        overview.conflicts.map((conflict) => {
          const fronts = frontsByConflict[conflict.id] ?? [];
          return (
            <div key={conflict.id} className="military-front-group">
              <h3 className="military-window__section-title">{conflict.display_name}</h3>
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
            </div>
          );
        })}
    </div>
  );
}

function ActionsTab({
  overview,
  actionsByConflict,
  loading,
}: {
  overview: MilitaryOverview;
  actionsByConflict: Record<string, MilitaryAction[]>;
  loading: boolean;
}) {
  if (overview.conflicts.length === 0) {
    return <p className="military-window__empty">등록된 분쟁이 없어 작전 기록이 없다.</p>;
  }
  return (
    <div className="military-actions-tab">
      <p className="military-window__hint">
        작전 초안 작성 및 제출은 분쟁 사령부 창에서 수행한다. 여기서는 접수된 작전만 확인한다.
      </p>
      {loading && (
        <div className="military-window__state">
          <UiIcon name="loader" />
          <span>작전 기록 수신 중…</span>
        </div>
      )}
      {!loading &&
        overview.conflicts.map((conflict) => {
          const actions = actionsByConflict[conflict.id] ?? [];
          return (
            <div key={conflict.id} className="military-action-group">
              <h3 className="military-window__section-title">{conflict.display_name}</h3>
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
                      {action.resolution && (
                        <span className="military-action-item__outcome">
                          {militaryLabel(action.resolution.outcome)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </div>
  );
}

function ProductionTab({ overview }: { overview: MilitaryOverview }) {
  if (overview.queues.length === 0) {
    return <p className="military-window__empty">진행 중인 편성·건조 명령이 없다.</p>;
  }
  return (
    <div className="military-production">
      <h3 className="military-window__section-title">편성·건조 대기열</h3>
      <ul className="military-production__list">
        {overview.queues.map((queue) => (
          <li key={queue.id} className="military-production__item">
            <div>
              <strong>{queue.requested_name || "명칭 미설정"}</strong>
              <span>{militaryLabel(queue.status)}</span>
            </div>
            <dl>
              <dt>완료 예정</dt><dd>{queue.completion_world_date}</dd>
              <dt>예약 인력</dt><dd>{formatNumber(queue.manpower_reserved)}</dd>
              <dt>예약 생산력</dt><dd>{formatNumber(queue.production_capacity_reserved)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
