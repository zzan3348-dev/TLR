import { useCallback, useEffect, useMemo, useState } from "react";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { UiIcon } from "../../../components/UiIcon";
import { MilitaryApiError, militaryMutation } from "../militaryClient";
import { MILITARY_ROUTES } from "../routes";
import type { WarReport } from "../types";

function militaryQuery<T>(route: string): Promise<T> {
  return militaryMutation<T>(route, {}, "GET");
}

function toneClass(report: WarReport): string {
  const tone = report.marker_tone ?? "NEUTRAL";
  return "war-report-card--" + tone.toLowerCase();
}

function toneLabel(report: WarReport): string {
  switch (report.marker_tone) {
    case "WIN":
      return "승리";
    case "LOSS":
      return "패배";
    default:
      return "중립";
  }
}

function renderRecord(record: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: typeof value === "object" && value !== null ? JSON.stringify(value) : String(value),
  }));
}

interface WarReportWindowProps {
  onClose: () => void;
}

export function WarReportWindow({ onClose }: WarReportWindowProps) {
  const [reports, setReports] = useState<WarReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await militaryQuery<WarReport[]>(MILITARY_ROUTES.reports);
      setReports(data);
    } catch (requestError) {
      if (requestError instanceof MilitaryApiError && requestError.code === "MILITARY_SERVER_NOT_CONFIGURED") {
        setReports([]);
        setError(null);
      } else {
        setError("전쟁 보고서를 불러오지 못했다.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const sorted = useMemo(
    () =>
      [...reports].sort(
        (a, b) => new Date(b.report_world_date).getTime() - new Date(a.report_world_date).getTime()
      ),
    [reports]
  );

  const actions = (
    <button type="button" className="strategic-window__action" onClick={onClose}>
      <UiIcon name="close" />
      <span>닫기</span>
    </button>
  );

  return (
    <StrategicWindow
      title="전쟁 보고서"
      eyebrow="WAR REPORTS"
      actions={actions}
      className="war-report-window"
      onClose={onClose}
    >
      <div className="war-report-window__body">
        {loading && (
          <div className="military-window__state">
            <UiIcon name="loader" />
            <span>보고서 수신 중…</span>
          </div>
        )}
        {!loading && error && (
          <div className="military-window__state military-window__state--error">
            <UiIcon name="warning" />
            <span>{error}</span>
            <button type="button" className="military-window__retry" onClick={() => void load()}>
              재시도
            </button>
          </div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <p className="military-window__empty">접수된 전쟁 보고서가 없다.</p>
        )}

        {!loading && !error && sorted.length > 0 && (
          <ul className="war-report-list">
            {sorted.map((report) => {
              const expanded = expandedId === report.id;
              const losses = renderRecord(report.losses);
              const outcomes = renderRecord(report.outcomes);
              const territory = report.territory_summary
                ? [{ key: "영토", value: report.territory_summary }]
                : [];
              return (
                <li key={report.id} className={"war-report-card " + toneClass(report)}>
                  <button
                    type="button"
                    className="war-report-card__header"
                    onClick={() => setExpandedId(expanded ? null : report.id)}
                  >
                    <span className="war-report-card__marker">{toneLabel(report)}</span>
                    <span className="war-report-card__title">{report.title}</span>
                    <span className="war-report-card__date">{report.report_world_date}</span>
                    <UiIcon name={expanded ? "chevron-up" : "chevron-down"} />
                  </button>

                  {expanded && (
                    <div className="war-report-card__body">
                      <p className="war-report-card__text">{report.body}</p>

                      {report.territory_summary && (
                        <p className="war-report-card__territory-summary">
                          {report.territory_summary}
                        </p>
                      )}

                      {losses.length > 0 && (
                        <div className="war-report-card__section">
                          <h4>손실</h4>
                          <ul>
                            {losses.map((entry) => (
                              <li key={entry.key}>
                                <span>{entry.key}</span>
                                <span>{entry.value}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {outcomes.length > 0 && (
                        <div className="war-report-card__section">
                          <h4>상태 변화</h4>
                          <ul>
                            {outcomes.map((entry) => (
                              <li key={entry.key}>
                                <span>{entry.key}</span>
                                <span>{entry.value}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {territory.length > 0 && (
                        <div className="war-report-card__section">
                          <h4>영토 변화</h4>
                          <ul>
                            {territory.map((entry) => (
                              <li key={entry.key}>
                                <span>{entry.key}</span>
                                <span>{entry.value}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="war-report-card__footer">
                        <span>공개 범위: {report.visibility}</span>
                        {report.front_id && <span>전선: {report.front_id}</span>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </StrategicWindow>
  );
}
