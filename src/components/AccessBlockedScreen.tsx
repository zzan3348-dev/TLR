import type { AuthProfile } from "../services/authService";

export function AccessBlockedScreen({
  profile,
  onLogout,
}: {
  profile: AuthProfile;
  onLogout: () => Promise<void>;
}) {
  return (
    <main className="access-blocked-screen">
      <section className="access-blocked-card" role="alert">
        <span className="auth-modal__kicker">ACCESS / REVIEW</span>
        <h1>접근이 제한되었습니다</h1>
        <p>현재 계정은 국가 플레이와 게임 상태 변경 기능을 사용할 수 없습니다.</p>
        <dl>
          <div><dt>Discord 계정</dt><dd>{profile.discordUsername ?? "확인된 계정"}</dd></div>
          <div><dt>Discord ID</dt><dd>{profile.discordUserId}</dd></div>
          <div><dt>차단 코드</dt><dd>{profile.blockedReason ?? "ACCESS_BLOCKED"}</dd></div>
          {profile.blockedAt ? <div><dt>처리 시각</dt><dd>{new Date(profile.blockedAt).toLocaleString("ko-KR")}</dd></div> : null}
        </dl>
        <p className="auth-modal__muted">관리자에게 계정 상태를 문의해 주세요.</p>
        <button type="button" className="auth-modal__action" onClick={() => void onLogout()}>로그아웃</button>
      </section>
    </main>
  );
}
