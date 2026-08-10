import { useState } from "react";
import { UiIcon } from "../../../components/UiIcon";
import { mapCountries } from "../../../data/mapCountries";
import type { ResearchProject } from "../types";

export type ResearchAdminData = {
  worldDate: string;
  projects: ResearchProject[];
  economies: Array<{ country_key: string; research_points: number; research_income_per_period: number }>;
};

type Props = {
  data: ResearchAdminData;
  busyId: string | null;
  onAction: (body: Record<string, unknown>, busyId: string) => Promise<void>;
};

const countryName = (key: string) => mapCountries.find((country) => country.key === key)?.name ?? key;

export function ResearchAdminSection({ data, busyId, onAction }: Props) {
  const [duration, setDuration] = useState<Record<string, number>>({});
  const [completionDates, setCompletionDates] = useState<Record<string, string>>({});
  const queue = data.projects.filter((project) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(project.status));
  const active = data.projects.filter((project) => project.status === "ACTIVE");
  const archive = data.projects.filter((project) => ["COMPLETED", "REJECTED", "CANCELLED"].includes(project.status));

  return (
    <section className="directorate-research" aria-labelledby="directorate-research-title">
      <header>
        <UiIcon name="research/laboratory" />
        <div><span>RESEARCH DIRECTORATE / REVIEW DESK</span><h2 id="directorate-research-title">국가 연구 심사</h2></div>
        <strong>{data.worldDate} · 심사 {queue.length}건 · 진행 {active.length}건</strong>
      </header>
      <div className="directorate-research__ledger">
        {data.economies.map((economy) => <span key={economy.country_key}><b>{countryName(economy.country_key)}</b>{Number(economy.research_points).toLocaleString()} RP <small>+{Number(economy.research_income_per_period).toLocaleString()}</small></span>)}
      </div>
      <div className="directorate-research__grid">
        {[...queue, ...active].map((project) => (
          <article key={project.id} data-status={project.status.toLowerCase()}>
            <UiIcon name="research/request" />
            <div>
              <small>{countryName(project.country_key)} · {project.category_id} · {project.status}</small>
              <h3>{project.title}</h3><p>{project.objective}</p>
              <span>최초 {project.initial_investment} RP · 누적 {project.total_investment} RP · 완료 {project.scheduled_completion_world_date ?? "미정"}</span>
            </div>
            <footer>
              {["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(project.status) ? <>
                <input aria-label="승인 기간" type="number" min="1" value={duration[project.id] ?? 365} onChange={(event) => setDuration({ ...duration, [project.id]: Number(event.target.value) })} />
                <button disabled={busyId === project.id} onClick={() => void onAction({ action: "APPROVE", projectId: project.id, durationDays: duration[project.id] ?? 365 }, project.id)}>승인</button>
                <button disabled={busyId === project.id} onClick={() => void onAction({ action: "REJECT", projectId: project.id, note: "관제 심사 반려" }, project.id)}>반려</button>
              </> : <>
                <input aria-label="완료 예정일" type="date" value={completionDates[project.id] ?? project.scheduled_completion_world_date ?? ""} onChange={(event) => setCompletionDates({ ...completionDates, [project.id]: event.target.value })} />
                <button disabled={busyId === project.id || !(completionDates[project.id] ?? project.scheduled_completion_world_date)} onClick={() => void onAction({ action: "ADJUST_END_DATE", projectId: project.id, completionDate: completionDates[project.id] ?? project.scheduled_completion_world_date }, project.id)}>일정 변경</button>
                <button disabled={busyId === project.id} onClick={() => void onAction({ action: "FORCE_COMPLETE", projectId: project.id }, project.id)}>강제 완료</button>
                <button disabled={busyId === project.id} onClick={() => void onAction({ action: "CANCEL", projectId: project.id }, project.id)}>취소</button>
              </>}
            </footer>
          </article>
        ))}
      </div>
      {archive.length > 0 && <details className="directorate-research__archive">
        <summary>완료·반려·취소 기록 {archive.length}건</summary>
        <div>{archive.map((project) => <span key={project.id}><b>{project.title}</b>{countryName(project.country_key)} · {project.status}</span>)}</div>
      </details>}
    </section>
  );
}
