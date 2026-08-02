import { useEffect, useState } from "react";

type DirectoratePanelProps = { onBackToTitle: () => void };
type AdminSessionState = "checking" | "authorized" | "not-found";
const actions = [
  ["REVOKE_COUNTRY_OWNERSHIP", "국가 운영권 회수", "현재 점유만 해제"],
  ["DENY_COUNTRY_ACCESS", "국가 접근 거부", "대상 국가 재접근 제한"],
  ["SUSPEND_ALL_PLAY", "전체 플레이 중지", "공개 열람과 로그인은 유지"],
  ["BLOCK_ACCOUNT", "계정 차단", "보호 기능 접근 차단"],
] as const;

export function DirectoratePanel({ onBackToTitle }: DirectoratePanelProps) {
  const [state, setState] = useState<AdminSessionState>("checking");
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/session", { credentials: "include" })
      .then((response) => { if (active) setState(response.ok ? "authorized" : "not-found"); })
      .catch(() => { if (active) setState("not-found"); });
    return () => { active = false; };
  }, []);

  if (state === "checking") return <main className="directorate-page directorate-page--checking" aria-label="Loading" />;
  if (state === "not-found") return <main className="directorate-page directorate-page--not-found"><span>404</span></main>;
  return (
    <main className="directorate-page">
      <header className="directorate-page__header"><div><p>THE LONG REVOLUTION</p><h1>DIRECTORATE CONTROL NETWORK</h1></div><button type="button" onClick={onBackToTitle}>CLOSE</button></header>
      <section className="directorate-page__status"><span className="directorate-page__status-light" /> BOOTSTRAP DIRECTORATE / CONTROL CHANNEL OPEN</section>
      <section className="directorate-page__grid">
        {actions.map(([id, title, description]) => <article key={id} className="directorate-action"><span className="directorate-action__id">{id}</span><h2>{title}</h2><p>{description}</p><button type="button" disabled>관제 기록 준비됨</button></article>)}
      </section>
      <p className="directorate-page__note">조치 실행 인터페이스는 점유·접근 데이터 연결 후 활성화됩니다. 모든 조치는 관리자, 대상, 사유, 시작·종료 시각을 기록합니다.</p>
    </main>
  );
}
