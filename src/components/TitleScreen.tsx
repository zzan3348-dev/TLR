import { useEffect, useRef } from "react";
import { credits, references } from "../data/credits";
import type { AuthProfile } from "../services/authService";

export type TitleWindow = "login" | "credits" | null;

type TitleScreenProps = {
  activeWindow: TitleWindow;
  authProfile: AuthProfile | null;
  authLoading: boolean;
  onOpenCountrySelection: () => void;
  onOpenWindow: (window: Exclude<TitleWindow, null>) => void;
  onCloseWindow: () => void;
  onLogin: () => void;
  onLogout: () => Promise<void>;
  onOpenDirectorate: () => void;
  directorateAccessOpen: boolean;
};

const cards = [
  {
    id: "country-selection",
    title: "국가선택",
    subtitle: "1932년의 세계를 열람합니다",
    image: "/maps/world-1932.png",
    action: "open-map",
  },
  {
    id: "login",
    title: "로그인",
    subtitle: "Discord 계정으로 접속합니다",
    image: null,
    action: "open-login",
  },
  {
    id: "credits",
    title: "만든사람",
    subtitle: "프로젝트의 기록과 출처",
    image: null,
    action: "open-credits",
  },
] as const;

export function TitleScreen({
  activeWindow,
  authProfile,
  authLoading,
  onOpenCountrySelection,
  onOpenWindow,
  onCloseWindow,
  onLogin,
  onLogout,
  onOpenDirectorate,
  directorateAccessOpen,
}: TitleScreenProps) {
  const stampClickRef = useRef({ count: 0, firstClickAt: 0 });
  useEffect(() => {
    if (!activeWindow) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseWindow();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWindow, onCloseWindow]);

  const handleDirectorateStampClick = () => {
    const now = Date.now();
    const current = stampClickRef.current;
    if (now - current.firstClickAt > 2000) {
      stampClickRef.current = { count: 1, firstClickAt: now };
      return;
    }
    const count = current.count + 1;
    if (count >= 3) {
      stampClickRef.current = { count: 0, firstClickAt: 0 };
      onOpenDirectorate();
      return;
    }
    stampClickRef.current = { count, firstClickAt: current.firstClickAt };
  };

  return (
    <main className={`title-screen${directorateAccessOpen ? " title-screen--directorate-locked" : ""}`}>
      <div className="title-screen__scanlines" aria-hidden="true" />
      <div className="title-screen__vignette" aria-hidden="true" />
      <div className="title-screen__crt" aria-hidden="true" />
      <header className="title-screen__masthead">
        <p className="title-screen__eyebrow">1932</p>
        <img className="title-screen__logo" src="/assets/title/tlr-logo.png" alt="The Long Revolution" />
      </header>
      <aside className="title-screen__archive-decoration" aria-hidden="false">
        <button className="title-screen__directorate-stamp" type="button" aria-label="기밀 도장" onClick={handleDirectorateStampClick}>
          <img src="/assets/title/directorate-stamp.svg" alt="" />
        </button>
      </aside>
      <section className="title-screen__cards" aria-label="메인 메뉴">
        {cards.map((card, index) => (
          <button className="title-card" type="button" key={card.id} style={{ "--card-index": index } as React.CSSProperties} onClick={() => {
            if (card.action === "open-map") onOpenCountrySelection();
            else if (card.action === "open-login") onLogin();
            else onOpenWindow("credits");
          }}>
            <span className={`title-card__image-wrap${card.image ? "" : " title-card__image-wrap--blank"}`}>
              {card.image ? <img src={card.image} alt="" className="title-card__image" /> : null}
              <span className="title-card__image-wash" aria-hidden="true" />
              <span className="title-card__index" aria-hidden="true">0{index + 1}</span>
            </span>
            <span className="title-card__button-panel"><strong>{card.title}</strong><small>{card.subtitle}</small></span>
          </button>
        ))}
      </section>
      <footer className="title-screen__footer"><span>THE LONG REVOLUTION · CONTINUOUS WORLD</span><span>BUILD 1932.01</span></footer>
      {activeWindow ? (
        <div className="title-window-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onCloseWindow(); }}>
          <section className="title-window" role="dialog" aria-modal="true" aria-labelledby="title-window-heading">
            <div className="title-window__header"><div><span className="title-window__kicker">TLR / INTERFACE</span><h2 id="title-window-heading">{activeWindow === "login" ? "로그인" : "만든사람"}</h2></div><button type="button" className="title-window__close" aria-label="창 닫기" onClick={onCloseWindow}>×</button></div>
            {activeWindow === "login" ? (
              <div className="title-window__body title-window__body--login">
                <div className="title-window__signal" aria-hidden="true"><span /><span /><span /></div>
                {authProfile ? <><p className="title-window__lead">{authProfile.discordUsername ?? "Discord 계정"}</p><p className="title-window__muted">접근 상태: {authProfile.accessStatus}</p><button type="button" className="title-window__action" onClick={() => void onLogout()}>로그아웃</button></> : <><p className="title-window__lead">Discord 계정으로 접속합니다.</p><p className="title-window__muted">로그인 후 담당 국가 플레이 권한과 계정 상태를 확인합니다.</p><button type="button" className="title-window__action" onClick={onLogin} disabled={authLoading}>{authLoading ? "확인 중…" : "Discord로 로그인"}</button></>}
              </div>
            ) : (
              <div className="title-window__body title-window__body--credits"><p className="title-window__lead">THE LONG REVOLUTION</p><div className="credits-list">{credits.map((entry) => <div className="credits-list__row" key={entry.role}><span>{entry.role}</span><strong>{entry.person}</strong></div>)}</div><div className="credits-references"><span>참고 및 출처</span><div>{references.map((reference) => <strong key={reference}>{reference}</strong>)}</div></div></div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
