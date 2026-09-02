import { useEffect, useMemo, useState } from "react";
import { UiIcon } from "../../../components/UiIcon";
import type { MapCountryIndex } from "../../../types/mapCountry";
import { StrategicWindow } from "../../play/components/StrategicWindow";
import { confirmResearchInvestment, loadResearchOverview, previewResearchInvestment, ResearchApiError, submitResearchProject } from "../researchClient";
import type { InvestmentPreview, ResearchOverview, ResearchProject } from "../types";

type Props = { country: MapCountryIndex; onClose: () => void };
type Tab = "active" | "request" | "archive";

const STATUS: Record<ResearchProject["status"], string> = {
  DRAFT: "초안", SUBMITTED: "심사 대기", UNDER_REVIEW: "관제 심사 중", APPROVED: "승인·착수 대기",
  ACTIVE: "연구 진행 중", REJECTED: "반려", COMPLETED: "완료", CANCELLED: "취소",
};

export function ResearchWindow({ country, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("active");
  const [data, setData] = useState<ResearchOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [investment, setInvestment] = useState<{ project: ResearchProject; amount: number; preview: InvestmentPreview | null } | null>(null);

  const reload = async (signal?: AbortSignal) => {
    try { setData(await loadResearchOverview(signal)); setMessage(""); }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setData(null);
      setMessage("연구 기록을 불러오지 못했습니다.");
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void loadResearchOverview(controller.signal).then((overview) => {
      setData(overview);
      setMessage("");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setData(null);
      setMessage("연구 기록을 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [country.key]);

  const active = useMemo(() => (data?.projects ?? []).filter((project) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "ACTIVE"].includes(project.status)), [data?.projects]);
  const archive = useMemo(() => (data?.projects ?? []).filter((project) => ["REJECTED", "COMPLETED", "CANCELLED"].includes(project.status)), [data?.projects]);

  const submit = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    setBusy(true);
    try {
      await submitResearchProject({
        title: String(values.get("title") ?? ""), categoryId: String(values.get("categoryId") ?? "general"),
        description: String(values.get("description") ?? ""), objective: String(values.get("objective") ?? ""),
        prerequisites: String(values.get("prerequisites") ?? ""), initialInvestment: Number(values.get("initialInvestment") ?? 0),
      });
      form.reset(); setTab("active"); await reload();
    } catch (error) { setMessage(error instanceof ResearchApiError ? `연구 요청이 거부되었습니다. (${error.code})` : "연구 요청을 전송하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const preview = async () => {
    if (!investment) return;
    setBusy(true);
    try { const result = await previewResearchInvestment(investment.project.id, investment.amount); setInvestment({ ...investment, preview: result.preview }); }
    catch { setMessage("추가 투자 결과를 계산하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!investment?.preview) return;
    setBusy(true);
    try { await confirmResearchInvestment(investment.project.id, investment.amount); setInvestment(null); await reload(); }
    catch { setMessage("연구력 투자에 실패했습니다."); }
    finally { setBusy(false); }
  };

  const renderProjects = (projects: ResearchProject[]) => projects.length ? projects.map((project) => (
    <article className="research-project" key={project.id} data-status={project.status.toLowerCase()}>
      <UiIcon name={project.category_id === "military" ? "sections/military" : project.category_id === "industry" ? "sections/economy" : "research/laboratory"} />
      <div><small>{STATUS[project.status]} · {data?.categories.find((category) => category.id === project.category_id)?.name ?? project.category_id}</small><h3>{project.title}</h3><p>{project.objective || project.description}</p><footer><span>투자 {project.total_investment.toLocaleString()} RP</span><span>{project.scheduled_completion_world_date ?? "일정 미정"}</span></footer></div>
      {project.status === "ACTIVE" ? <button type="button" onClick={() => setInvestment({ project, amount: 10, preview: null })}>추가 투자</button> : null}
    </article>
  )) : <div className="research-empty"><UiIcon name="research/laboratory" /><strong>등록된 연구 없음</strong><p>연구 요청서를 작성하면 관제 심사를 거쳐 시작됩니다.</p></div>;

  return (
    <StrategicWindow title="연구국" eyebrow={`${country.name} · 국가 연구 기록`} className="strategic-window--research" onClose={onClose}>
      <div className="research-window">
        <header className="research-window__ledger"><UiIcon name="research/laboratory" /><div><small>RESEARCH DIRECTORATE</small><strong>{data ? `${data.balance.toLocaleString()} RP` : "—"}</strong><span>{data ? `정산 주기당 +${data.incomePerPeriod.toLocaleString()} · 세계일 ${data.worldDate}` : "연구 기록 확인 중"}</span></div></header>
        <nav>{([['active','진행'],['request','연구 요청'],['archive','기록']] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
        {message ? <p className="research-window__message" role="alert"><span>{message}</span>{!data ? <button type="button" onClick={() => void reload()}>다시 시도</button> : null}</p> : null}
        <main>
          {tab === "active" ? renderProjects(active) : null}
          {tab === "archive" ? renderProjects(archive) : null}
          {tab === "request" ? (
            <form className="research-request" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
              <header><UiIcon name="research/request" /><div><small>FORM R-32</small><h2>신규 연구 요청서</h2></div></header>
              <label>연구명<input name="title" required maxLength={120} /></label>
              <label>분류<select name="categoryId">{(data?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>연구 설명<textarea name="description" required rows={4} maxLength={4000} /></label>
              <label>연구 목표<textarea name="objective" required rows={3} maxLength={2000} /></label>
              <label>선행 조건<textarea name="prerequisites" rows={2} maxLength={1000} /></label>
              <label>최초 연구력 투자<input name="initialInvestment" type="number" min="1" step="1" defaultValue="10" required /></label>
              <button type="submit" disabled={busy || !data}>관제 심사 요청</button>
            </form>
          ) : null}
        </main>
      </div>
      {investment ? <div className="research-investment-layer" role="presentation"><section role="dialog" aria-modal="true" aria-label="연구력 추가 투자"><header><UiIcon name="research/investment" /><div><small>ACTIVE PROJECT</small><h2>{investment.project.title}</h2></div></header><label>추가 연구력<input type="number" min="1" step="1" value={investment.amount} onChange={(event) => setInvestment({ ...investment, amount: Number(event.target.value), preview: null })} /></label>{investment.preview ? <dl><div><dt>현재 완료일</dt><dd>{investment.preview.currentCompletionDate}</dd></div><div><dt>예상 완료일</dt><dd>{investment.preview.projectedCompletionDate}</dd></div><div><dt>투자 후 연구력</dt><dd>{investment.preview.balanceAfter} RP</dd></div></dl> : null}<footer><button type="button" onClick={() => setInvestment(null)}>취소</button>{investment.preview ? <button type="button" disabled={busy} onClick={() => void confirm()}>투자 확정</button> : <button type="button" disabled={busy} onClick={() => void preview()}>결과 계산</button>}</footer></section></div> : null}
    </StrategicWindow>
  );
}
