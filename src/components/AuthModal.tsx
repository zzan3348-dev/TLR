import { useState } from "react";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { signInWithDiscord, type AuthProfile } from "../services/authService";

type AuthModalProps = {
  open: boolean;
  profile: AuthProfile | null;
  loading: boolean;
  nextPath: string;
  onClose: () => void;
  onSignOut: () => Promise<void>;
};

export function AuthModal({ open, profile, loading, nextPath, onClose, onSignOut }: AuthModalProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!open) return null;

  const login = async () => {
    setBusy(true);
    setMessage(null);
    const result = await signInWithDiscord(nextPath);
    if (!result.ok) {
      setMessage(
        result.error === "AUTH_NOT_CONFIGURED"
          ? "OAuth 환경변수가 아직 설정되지 않았습니다."
          : "Discord 로그인 연결에 실패했습니다.",
      );
      setBusy(false);
    }
  };

  return (
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <header className="auth-modal__header">
          <div>
            <span className="auth-modal__kicker">AUTH / SIGNAL</span>
            <h2 id="auth-modal-title">로그인</h2>
          </div>
          <button type="button" className="auth-modal__close" onClick={onClose} aria-label="로그인 창 닫기">×</button>
        </header>
        {profile ? (
          <div className="auth-modal__body">
            <p className="auth-modal__status">{profile.discordUsername ?? "Discord 계정"}</p>
            <p>접근 상태: {profile.accessStatus}</p>
            <p className="auth-modal__muted">Discord ID: {profile.discordUserId}</p>
            <button type="button" className="auth-modal__action" onClick={() => void onSignOut()}>로그아웃</button>
          </div>
        ) : (
          <div className="auth-modal__body">
            <p>Discord 계정으로 접속합니다.</p>
            <p className="auth-modal__privacy">
              계정 식별자와 장치·IP 해시는 부계정 방지 목적으로만 처리합니다. 원본 IP와 OAuth 토큰은 저장하지 않습니다.
            </p>
            <button type="button" className="auth-modal__action" onClick={() => void login()} disabled={busy || loading || !isSupabaseConfigured}>
              {busy ? "연결 중…" : "Discord로 로그인"}
            </button>
            {!isSupabaseConfigured ? <p className="auth-modal__muted">관리자 설정 후 사용할 수 있습니다.</p> : null}
            {message ? <p className="auth-modal__error">{message}</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
